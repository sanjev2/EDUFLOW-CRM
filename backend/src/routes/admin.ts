import { Router } from "express";
import { z } from "zod";
import { User } from "../models/User.js";
import { requireAuthentication, requireCurrentPassword, requireFreshAuthentication, requireMfa, requireRole, requireVerifiedEmail } from "../middleware/auth.js";
import { email, strictBody, strongPassword } from "../security/validation.js";
import { hashPassword, recordPassword } from "../security/password.js";
import { config } from "../config.js";
import { EmailVerificationToken } from "../models/Tokens.js";
import { randomToken, sha256 } from "../security/crypto.js";
import { deliverDevelopmentLink } from "../security/outbox.js";
import { audit } from "../security/audit.js";
import { ApiError } from "../errors.js";
import { Session } from "../models/Session.js";

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

adminRouter.post("/users/counsellors", async (req, res) => {
  const input = strictBody(z.object({ fullName: z.string().trim().min(2).max(100), email, temporaryPassword: strongPassword, reason: z.string().trim().min(10).max(500) }).strict(), req.body);
  const now = new Date();
  const passwordHash = await hashPassword(input.temporaryPassword);
  let user;
  try {
    user = await User.create({ fullName: input.fullName, email: input.email, passwordHash, role: "COUNSELLOR", passwordChangedAt: now, passwordExpiresAt: new Date(now.getTime() + config.PASSWORD_MAX_AGE_DAYS * 86400000) });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) throw new ApiError(409, "ACCOUNT_EXISTS", "An account with that email already exists");
    throw error;
  }
  await recordPassword(user._id, passwordHash);
  const token = randomToken();
  await EmailVerificationToken.create({ userId: user._id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 24 * 3600000) });
  deliverDevelopmentLink({ type: "VERIFY_EMAIL", email: user.email, link: `${config.FRONTEND_URL}/verify-email?token=${token}`, createdAt: now.toISOString() });
  await audit(req, "COUNSELLOR_CREATED", { actorId: req.auth!.user._id, subjectId: user._id, metadata: { reason: input.reason } });
  res.status(201).json({ user: { id: String(user._id), fullName: user.fullName, email: user.email, role: user.role, status: user.status } });
});

adminRouter.patch("/users/:id/status", async (req, res) => {
  const input = strictBody(z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]), reason: z.string().trim().min(10).max(500) }).strict(), req.body);
  if (String(req.auth!.user._id) === req.params.id && input.status === "SUSPENDED") throw new ApiError(400, "SELF_SUSPENSION_DENIED", "You cannot suspend your current account");
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User was not found");
  const before = user.status;
  user.status = input.status;
  await user.save();
  if (input.status === "SUSPENDED") await Session.updateMany({ userId: user._id, revokedAt: { $exists: false } }, { revokedAt: new Date() });
  await audit(req, input.status === "SUSPENDED" ? "ACCOUNT_SUSPENSION" : "ACCOUNT_ACTIVATION", { actorId: req.auth!.user._id, subjectId: user._id, metadata: { before, after: input.status, reason: input.reason } });
  res.json({ user: { id: String(user._id), status: user.status } });
});

adminRouter.patch("/users/:id/role", async (req, res) => {
  const input = strictBody(z.object({ role: z.enum(["STUDENT", "COUNSELLOR"]), reason: z.string().trim().min(10).max(500) }).strict(), req.body);
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User was not found");
  if (user.role === "ADMIN") throw new ApiError(403, "ADMIN_ROLE_IMMUTABLE", "Administrator roles cannot be changed through this endpoint");
  const before = user.role;
  user.role = input.role;
  await user.save();
  await Session.updateMany({ userId: user._id, revokedAt: { $exists: false } }, { revokedAt: new Date() });
  await audit(req, "ROLE_CHANGE", { actorId: req.auth!.user._id, subjectId: user._id, metadata: { before, after: input.role, reason: input.reason } });
  res.json({ user: { id: String(user._id), role: user.role } });
});
