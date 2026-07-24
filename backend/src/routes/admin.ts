import { Router } from "express";
import { z } from "zod";
import { User } from "../models/User.js";
import { requireAuthentication, requireCurrentPassword, requireFreshAuthentication, requireMfa, requireRole, requireVerifiedEmail } from "../middleware/auth.js";
import { email, strictBody } from "../security/validation.js";
import { hashPassword } from "../security/password.js";
import { config } from "../config.js";
import { EmailVerificationToken, PasswordResetToken } from "../models/Tokens.js";
import { keyedHash, randomToken, sha256 } from "../security/crypto.js";
import { sendCounsellorInvitation } from "../email/delivery.js";
import { audit } from "../security/audit.js";
import { ApiError } from "../errors.js";
import { Session } from "../models/Session.js";
import { AuditLog } from "../models/AuditLog.js";
import { IpAccessRule, LoginAttempt, SecurityAlert } from "../models/Security.js";
import { validIpCidr } from "../security/ip-access.js";
import { Application } from "../models/Application.js";
import { CounsellorAssignment } from "../models/CounsellorAssignment.js";
import { CounsellingNote } from "../models/CounsellingNote.js";
import { Document } from "../models/Document.js";
import { PasswordHistory } from "../models/PasswordHistory.js";
import { StudentProfile } from "../models/StudentProfile.js";
import { Task } from "../models/Task.js";

export const adminRouter = Router();
adminRouter.use(requireAuthentication, requireVerifiedEmail, requireCurrentPassword, requireMfa, requireFreshAuthentication, requireRole("ADMIN"));

adminRouter.get("/users", async (req, res) => {
  const input = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
  const [users, total] = await Promise.all([
    User.find().select("fullName email role status emailVerifiedAt mfaEnabled createdAt").sort({ createdAt: -1 }).skip((input.page - 1) * input.limit).limit(input.limit),
    User.countDocuments(),
  ]);
  res.json({ users, page: input.page, limit: input.limit, total });
});

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid user identifier");
const fullName = z.string().trim().min(2).max(100).regex(/^[\p{L}\p{M}][\p{L}\p{M}\p{N} .'-]*$/u, "Enter a valid full name");
const reason = z.string().trim().min(10).max(500);

async function lifecycleRateLimit(req: import("express").Request, subject: string, outcome: string) {
  await invitationRateLimit(req, subject, outcome, 20, 15);
}

adminRouter.get("/users/:id", async (req, res) => {
  const id = objectId.parse(req.params.id);
  const user = await User.findById(id).select("fullName email role status emailVerifiedAt mfaEnabled createdAt lastAuthenticatedAt passwordExpiresAt");
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User was not found");
  const now = new Date();
  const [activeSessions, documentCount, application, activeAssignment, caseload, recentEvents] = await Promise.all([
    Session.countDocuments({ userId: user._id, revokedAt: { $exists: false }, expiresAt: { $gt: now }, idleExpiresAt: { $gt: now } }),
    Document.countDocuments({ ownerId: user._id }),
    user.role === "STUDENT" ? Application.findOne({ studentId: user._id }).select("stage active createdAt updatedAt").lean() : null,
    user.role === "STUDENT" ? CounsellorAssignment.findOne({ studentId: user._id, active: true }).populate("counsellorId", "fullName email").lean() : null,
    user.role === "COUNSELLOR" ? CounsellorAssignment.countDocuments({ counsellorId: user._id, active: true }) : 0,
    AuditLog.find({ $or: [{ actorId: user._id }, { subjectId: user._id }] }).select("event actorId subjectId metadata createdAt").sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  res.json({
    user: {
      id: String(user._id), fullName: user.fullName, email: user.email, role: user.role, status: user.status,
      emailVerified: Boolean(user.emailVerifiedAt), mfaEnabled: user.mfaEnabled, createdAt: user.createdAt,
      lastAuthenticatedAt: user.lastAuthenticatedAt, passwordExpired: user.passwordExpiresAt <= now,
    },
    summary: {
      activeSessions, documentCount, caseload,
      assignment: activeAssignment ? { counsellor: activeAssignment.counsellorId } : null,
      application: application ? { stage: application.stage, active: application.active, createdAt: application.createdAt, updatedAt: application.updatedAt } : null,
    },
    recentEvents: recentEvents.map((event) => ({ id: String(event._id), event: event.event, createdAt: event.createdAt })),
  });
});

async function invitationRateLimit(req: import("express").Request, emailAddress: string, outcome: string, limit: number, minutes: number) {
  const emailHash = keyedHash(emailAddress);
  const ipHash = keyedHash(req.ip ?? "");
  const since = new Date(Date.now() - minutes * 60_000);
  const attempts = await LoginAttempt.countDocuments({ $or: [{ emailHash }, { ipHash }], outcome, createdAt: { $gte: since } });
  if (attempts >= limit) throw new ApiError(429, "COUNSELLOR_INVITATION_RATE_LIMITED", "Too many invitation requests. Please try again later");
  await LoginAttempt.create({ emailHash, ipHash, outcome });
}

async function issueCounsellorInvitation(req: import("express").Request, user: InstanceType<typeof User>) {
  await Promise.all([
    EmailVerificationToken.updateMany({ userId: user._id, usedAt: { $exists: false } }, { usedAt: new Date() }),
    PasswordResetToken.updateMany({ userId: user._id, usedAt: { $exists: false } }, { usedAt: new Date() }),
  ]);
  const verificationToken = randomToken();
  const setupToken = randomToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
  const [verification, setup] = await Promise.all([
    EmailVerificationToken.create({ userId: user._id, tokenHash: sha256(verificationToken), expiresAt }),
    PasswordResetToken.create({ userId: user._id, tokenHash: sha256(setupToken), expiresAt }),
  ]);
  try {
    await sendCounsellorInvitation({ email: user.email, fullName: user.fullName, verificationToken, setupToken });
    await audit(req, "COUNSELLOR_INVITATION_SENT", { actorId: req.auth!.user._id, subjectId: user._id });
    return true;
  } catch {
    const now = new Date();
    await Promise.all([
      EmailVerificationToken.updateOne({ _id: verification._id }, { usedAt: now }),
      PasswordResetToken.updateOne({ _id: setup._id }, { usedAt: now }),
      SecurityAlert.create({ userId: user._id, type: "EMAIL_DELIVERY_FAILURE", severity: "MEDIUM", metadata: { purpose: "counsellor-invitation" } }),
      audit(req, "EMAIL_DELIVERY_FAILURE", { actorId: req.auth!.user._id, subjectId: user._id, metadata: { purpose: "counsellor-invitation" } }),
      audit(req, "COUNSELLOR_INVITATION_FAILED", { actorId: req.auth!.user._id, subjectId: user._id }),
    ]);
    return false;
  }
}

adminRouter.post("/users/counsellors", async (req, res) => {
  const input = strictBody(z.object({
    fullName: z.string().trim().min(2).max(100).regex(/^[\p{L}\p{M}][\p{L}\p{M}\p{N} .'-]*$/u, "Enter a valid full name"),
    email,
  }).strict(), req.body);
  await invitationRateLimit(req, input.email, "COUNSELLOR_INVITATION_CREATE", 10, 60);
  const now = new Date();
  const passwordHash = await hashPassword(randomToken(48));
  let user;
  try {
    user = await User.create({ fullName: input.fullName, email: input.email, passwordHash, role: "COUNSELLOR", passwordChangedAt: now, passwordExpiresAt: new Date(now.getTime() + config.PASSWORD_MAX_AGE_DAYS * 86400000) });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) throw new ApiError(409, "ACCOUNT_EXISTS", "An account with that email already exists");
    throw error;
  }
  if (!(await issueCounsellorInvitation(req, user))) {
    const removed = await User.deleteOne({ _id: user._id });
    await Promise.all([
      EmailVerificationToken.deleteMany({ userId: user._id }),
      PasswordResetToken.deleteMany({ userId: user._id }),
    ]);
    if (removed.deletedCount !== 1) throw new Error("Provisional counsellor cleanup failed");
    throw new ApiError(503, "EMAIL_DELIVERY_UNAVAILABLE", "Invitation delivery is temporarily unavailable. No account was created");
  }
  await audit(req, "COUNSELLOR_CREATED", { actorId: req.auth!.user._id, subjectId: user._id });
  res.status(201).json({ user: { id: String(user._id), fullName: user.fullName, email: user.email, role: user.role, status: user.status, emailVerifiedAt: user.emailVerifiedAt }, message: "If the account is eligible, an invitation will be sent." });
});

adminRouter.post("/users/:id/resend-invitation", async (req, res) => {
  strictBody(z.object({}).strict(), req.body);
  const { id } = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).parse(req.params);
  const user = await User.findOne({ _id: id, role: "COUNSELLOR", status: "ACTIVE", emailVerifiedAt: { $exists: false } });
  await invitationRateLimit(req, user?.email ?? id, "COUNSELLOR_INVITATION_RESEND", 5, 15);
  if (user) await issueCounsellorInvitation(req, user);
  res.status(202).json({ message: "If the account is eligible, an invitation will be sent." });
});

adminRouter.patch("/users/:id/profile", async (req, res) => {
  const id = objectId.parse(req.params.id);
  const input = strictBody(z.object({ fullName, reason }).strict(), req.body);
  await lifecycleRateLimit(req, id, "ADMIN_USER_PROFILE_UPDATE");
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User was not found");
  const before = user.fullName;
  user.fullName = input.fullName;
  await user.save();
  await audit(req, "ACCOUNT_PROFILE_CORRECTION", { actorId: req.auth!.user._id, subjectId: user._id, metadata: { before, after: user.fullName, reason: input.reason } });
  res.json({ user: { id: String(user._id), fullName: user.fullName } });
});

adminRouter.post("/users/:id/revoke-sessions", async (req, res) => {
  const id = objectId.parse(req.params.id);
  const input = strictBody(z.object({ reason }).strict(), req.body);
  await lifecycleRateLimit(req, id, "ADMIN_SESSION_REVOCATION");
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User was not found");
  if (String(user._id) === String(req.auth!.user._id)) throw new ApiError(403, "SELF_SESSION_REVOCATION_DENIED", "Use the security page to manage your current administrator sessions");
  const result = await Session.updateMany({ userId: user._id, revokedAt: { $exists: false } }, { revokedAt: new Date() });
  await audit(req, "ADMIN_SESSION_REVOCATION", { actorId: req.auth!.user._id, subjectId: user._id, metadata: { revoked: result.modifiedCount, reason: input.reason } });
  res.json({ message: "Active sessions were revoked.", revoked: result.modifiedCount });
});

adminRouter.delete("/users/:id/pending-invitation", async (req, res) => {
  const id = objectId.parse(req.params.id);
  const input = strictBody(z.object({ confirm: z.literal("CANCEL INVITATION"), reason }).strict(), req.body);
  await lifecycleRateLimit(req, id, "COUNSELLOR_INVITATION_CANCEL");
  const user = await User.findOne({ _id: id, role: "COUNSELLOR", emailVerifiedAt: { $exists: false }, lastAuthenticatedAt: { $exists: false } });
  if (!user) throw new ApiError(409, "INVITATION_NOT_CANCELLABLE", "Only an unused pending counsellor invitation can be cancelled");
  const activeCaseload = await CounsellorAssignment.countDocuments({ counsellorId: user._id, active: true });
  if (activeCaseload) throw new ApiError(409, "COUNSELLOR_HAS_CASELOAD", "Resolve the counsellor's active caseload before removing the account");
  const removed = await User.deleteOne({ _id: user._id });
  if (removed.deletedCount !== 1) throw new ApiError(409, "INVITATION_NOT_CANCELLABLE", "The invitation could not be cancelled");
  await Promise.all([
    EmailVerificationToken.deleteMany({ userId: user._id }),
    PasswordResetToken.deleteMany({ userId: user._id }),
    PasswordHistory.deleteMany({ userId: user._id }),
    Session.updateMany({ userId: user._id, revokedAt: { $exists: false } }, { revokedAt: new Date() }),
  ]);
  await audit(req, "COUNSELLOR_INVITATION_CANCELLED", { actorId: req.auth!.user._id, subjectId: user._id, metadata: { reason: input.reason } });
  res.json({ message: "The pending invitation and unused counsellor account were removed." });
});

adminRouter.patch("/users/:id/status", async (req, res) => {
  const input = strictBody(z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]), reason: z.string().trim().min(10).max(500) }).strict(), req.body);
  await lifecycleRateLimit(req, req.params.id, "ADMIN_ACCOUNT_STATUS_CHANGE");
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User was not found");
  if (user.status === "ARCHIVED") throw new ApiError(409, "ACCOUNT_ARCHIVED", "Archived accounts cannot be reactivated through this action");
  if (input.status === "SUSPENDED" && user.role === "ADMIN" && await User.countDocuments({ role: "ADMIN", status: "ACTIVE" }) <= 1) {
    throw new ApiError(409, "LAST_ADMIN_PROTECTED", "The last active administrator cannot be suspended");
  }
  if (String(req.auth!.user._id) === req.params.id && input.status === "SUSPENDED") throw new ApiError(400, "SELF_SUSPENSION_DENIED", "You cannot suspend your current account");
  const before = user.status;
  user.status = input.status;
  await user.save();
  if (input.status === "SUSPENDED") await Session.updateMany({ userId: user._id, revokedAt: { $exists: false } }, { revokedAt: new Date() });
  await audit(req, input.status === "SUSPENDED" ? "ACCOUNT_SUSPENSION" : "ACCOUNT_ACTIVATION", { actorId: req.auth!.user._id, subjectId: user._id, metadata: { before, after: input.status, reason: input.reason } });
  res.json({ user: { id: String(user._id), status: user.status } });
});

adminRouter.post("/users/:id/archive", async (req, res) => {
  const id = objectId.parse(req.params.id);
  const input = strictBody(z.object({ confirm: z.literal("ARCHIVE ACCOUNT"), reason }).strict(), req.body);
  await lifecycleRateLimit(req, id, "ADMIN_ACCOUNT_ARCHIVE");
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User was not found");
  if (user.status === "ARCHIVED") throw new ApiError(409, "ACCOUNT_ALREADY_ARCHIVED", "The account is already archived");
  if (user.role === "ADMIN" && await User.countDocuments({ role: "ADMIN", status: "ACTIVE" }) <= 1) {
    throw new ApiError(409, "LAST_ADMIN_PROTECTED", "The last active administrator cannot be archived");
  }
  if (String(user._id) === String(req.auth!.user._id)) throw new ApiError(403, "SELF_ARCHIVE_DENIED", "You cannot archive your current administrator account");
  if (user.role === "COUNSELLOR" && await CounsellorAssignment.exists({ counsellorId: user._id, active: true })) {
    throw new ApiError(409, "COUNSELLOR_HAS_CASELOAD", "Resolve or reassign the counsellor's active caseload before archiving");
  }
  const before = user.status;
  user.status = "ARCHIVED";
  await user.save();
  await Session.updateMany({ userId: user._id, revokedAt: { $exists: false } }, { revokedAt: new Date() });
  await Promise.all([
    EmailVerificationToken.updateMany({ userId: user._id, usedAt: { $exists: false } }, { usedAt: new Date() }),
    PasswordResetToken.updateMany({ userId: user._id, usedAt: { $exists: false } }, { usedAt: new Date() }),
  ]);
  await audit(req, "ACCOUNT_ARCHIVED", { actorId: req.auth!.user._id, subjectId: user._id, metadata: { before, after: user.status, reason: input.reason } });
  res.json({ message: "The account was archived and its sessions were revoked.", user: { id: String(user._id), status: user.status } });
});

adminRouter.delete("/users/:id/unused-student", async (req, res) => {
  const id = objectId.parse(req.params.id);
  const input = strictBody(z.object({ confirm: z.literal("REMOVE UNUSED STUDENT"), reason }).strict(), req.body);
  await lifecycleRateLimit(req, id, "ADMIN_UNUSED_STUDENT_REMOVAL");
  const user = await User.findOne({ _id: id, role: "STUDENT" });
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "Student account was not found");
  const dependencies = await Promise.all([
    Application.countDocuments({ studentId: user._id }),
    Document.countDocuments({ ownerId: user._id }),
    CounsellorAssignment.countDocuments({ studentId: user._id }),
    CounsellingNote.countDocuments({ studentId: user._id }),
    Task.countDocuments({ studentId: user._id }),
    StudentProfile.countDocuments({ userId: user._id }),
    Session.countDocuments({ userId: user._id, revokedAt: { $exists: false } }),
  ]);
  if (dependencies.some(Boolean)) throw new ApiError(409, "ACCOUNT_HAS_DEPENDENCIES", "This established account cannot be permanently removed. Archive it instead");
  const removed = await User.deleteOne({ _id: user._id });
  if (removed.deletedCount !== 1) throw new ApiError(409, "ACCOUNT_REMOVAL_FAILED", "The unused account could not be removed");
  await Promise.all([
    EmailVerificationToken.deleteMany({ userId: user._id }),
    PasswordResetToken.deleteMany({ userId: user._id }),
    PasswordHistory.deleteMany({ userId: user._id }),
  ]);
  await audit(req, "UNUSED_STUDENT_REMOVED", { actorId: req.auth!.user._id, subjectId: user._id, metadata: { reason: input.reason } });
  res.json({ message: "The unused student account was removed." });
});

adminRouter.patch("/users/:id/role", (req) => {
  strictBody(z.object({ role: z.string(), reason }).strict(), req.body);
  throw new ApiError(403, "ROLE_CHANGE_DENIED", "Account roles cannot be changed through general user administration");
});

adminRouter.get("/audit-logs", async (req, res) => {
  const input = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20), event: z.string().max(100).optional() }).parse(req.query);
  const filter = input.event ? { event: input.event } : {};
  const [logs, total] = await Promise.all([
    AuditLog.find(filter).select("event actorId subjectId requestId metadata createdAt").sort({ createdAt: -1 }).skip((input.page - 1) * input.limit).limit(input.limit),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ logs, page: input.page, limit: input.limit, total });
});

adminRouter.get("/security-alerts", async (req, res) => {
  const input = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20), severity: z.enum(["LOW", "MEDIUM", "HIGH"]).optional() }).parse(req.query);
  const filter = input.severity ? { severity: input.severity } : {};
  const [alerts, total] = await Promise.all([
    SecurityAlert.find(filter).select("type severity metadata acknowledgedAt createdAt").sort({ createdAt: -1 }).skip((input.page - 1) * input.limit).limit(input.limit),
    SecurityAlert.countDocuments(filter),
  ]);
  res.json({ alerts, page: input.page, limit: input.limit, total });
});

adminRouter.get("/ip-rules", async (_req, res) => {
  const rules = await IpAccessRule.find().sort({ action: 1, cidr: 1 }).lean();
  res.json({ rules });
});

adminRouter.post("/ip-rules", async (req, res) => {
  const input = strictBody(z.object({
    cidr: z.string().trim().min(2).max(64).refine(validIpCidr, "Enter a valid IPv4 CIDR or exact IPv6 address"),
    action: z.enum(["ALLOW", "DENY"]),
    reason: z.string().trim().min(10).max(500),
    expiresAt: z.coerce.date().optional(),
  }).strict(), req.body);
  if (input.expiresAt && input.expiresAt <= new Date()) throw new ApiError(400, "INVALID_EXPIRY", "Expiry must be in the future");
  try {
    const rule = await IpAccessRule.create(input);
    await audit(req, "IP_ACCESS_RULE_CREATED", { actorId: req.auth!.user._id, metadata: { action: input.action, cidr: input.cidr, reason: input.reason } });
    res.status(201).json({ rule });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) throw new ApiError(409, "IP_RULE_EXISTS", "That network rule already exists");
    throw error;
  }
});

adminRouter.delete("/ip-rules/:id", async (req, res) => {
  const { reason } = strictBody(z.object({ reason: z.string().trim().min(10).max(500) }).strict(), req.body);
  const rule = await IpAccessRule.findByIdAndDelete(req.params.id);
  if (!rule) throw new ApiError(404, "IP_RULE_NOT_FOUND", "Network rule was not found");
  await audit(req, "IP_ACCESS_RULE_REMOVED", { actorId: req.auth!.user._id, metadata: { action: rule.action, cidr: rule.cidr, reason } });
  res.status(204).end();
});
