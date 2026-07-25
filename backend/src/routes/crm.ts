import { Router, type Request, type RequestHandler } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { requireAuthentication, requireCurrentPassword, requireFreshAuthentication, requireMfa, requireRole, requireVerifiedEmail } from "../middleware/auth.js";
import { StudentProfile, profileCompletion } from "../models/StudentProfile.js";
import { Application, applicationStages, checklistStatuses } from "../models/Application.js";
import { ApplicationStageHistory } from "../models/ApplicationStageHistory.js";
import { CounsellorAssignment } from "../models/CounsellorAssignment.js";
import { CounsellingNote } from "../models/CounsellingNote.js";
import { Task } from "../models/Task.js";
import { User } from "../models/User.js";
import { SecurityAlert } from "../models/Security.js";
import { AuditLog } from "../models/AuditLog.js";
import { strictBody } from "../security/validation.js";
import { ApiError } from "../errors.js";
import { audit } from "../security/audit.js";
import { assignApplication, reconcileUnassigned, validateCounsellor } from "../crm/assignment.js";
import { assertForwardTransition, assertMutable, canStudentCancel, terminalStages } from "../crm/application-state.js";
import { pagination, requireAssignedStudent } from "../crm/access.js";
import { profileSchema } from "../crm/profile-schema.js";
import { submitOwnedApplication } from "../crm/application-submission.js";
import { applicationDuplicateKey, createDefaultChecklist } from "../crm/application-schema.js";
import { config } from "../config.js";
import { Document } from "../models/Document.js";

export const crmRouter = Router();
crmRouter.use(requireAuthentication, requireVerifiedEmail, requireCurrentPassword);
crmRouter.use((req, _res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && req.get("origin") !== config.FRONTEND_URL) {
    return next(new ApiError(403, "ORIGIN_REJECTED", "Request origin was rejected"));
  }
  next();
});

crmRouter.get("/profile", requireRole("STUDENT"), async (req, res) => {
  const profile = await StudentProfile.findOne({ userId: req.auth!.user._id });
  res.json({ profile, completion: profileCompletion(profile) });
});
crmRouter.put("/profile", requireRole("STUDENT"), async (req, res) => {
  const input = strictBody(profileSchema, req.body);
  if (!input.previousVisaRefusal) input.refusalExplanation = undefined;
  const profile = await StudentProfile.findOneAndUpdate({ userId: req.auth!.user._id }, { $set: input, $setOnInsert: { userId: req.auth!.user._id } }, { upsert: true, new: true, runValidators: true });
  await audit(req, "STUDENT_PROFILE_UPDATE", { actorId: req.auth!.user._id, subjectId: req.auth!.user._id, metadata: { fields: Object.keys(input) } });
  res.json({ profile, completion: profileCompletion(profile) });
});
crmRouter.get("/profiles/:studentId", requireRole("COUNSELLOR", "ADMIN"), async (req, res) => {
  if (req.auth!.user.role === "COUNSELLOR") await requireAssignedStudent(req.auth!.user._id, req.params.studentId);
  const profile = await StudentProfile.findOne({ userId: req.params.studentId });
  res.json({ profile, completion: profileCompletion(profile) });
});

const enquirySchema = z.object({
  preferredCountry: z.string().trim().min(2).max(80).optional(),
  institution: z.string().trim().min(2).max(160).optional(),
  program: z.string().trim().min(2).max(160).optional(),
  preferredStudyLevel: z.string().trim().min(2).max(80).optional(),
  intendedIntake: z.string().trim().min(2).max(80).optional(),
}).strict();
const applicationCreationWindows = new Map<string, { count: number; resetAt: number }>();
const applicationCreationRateLimit: RequestHandler = (req, _res, next) => {
  const key = String(req.auth!.user._id);
  const now = Date.now();
  const window = applicationCreationWindows.get(key);
  const current = !window || window.resetAt <= now ? { count: 0, resetAt: now + 60 * 60_000 } : window;
  current.count += 1;
  applicationCreationWindows.set(key, current);
  if (current.count > 10) return next(new ApiError(429, "APPLICATION_CREATION_RATE_LIMITED", "Too many new enquiries. Please try again later"));
  next();
};
const lifecycleWindows = new Map<string, { count: number; resetAt: number }>();
const lifecycleRateLimit: RequestHandler = (req, _res, next) => {
  const key = String(req.auth!.user._id);
  const now = Date.now();
  const window = lifecycleWindows.get(key);
  const current = !window || window.resetAt <= now ? { count: 0, resetAt: now + 15 * 60_000 } : window;
  current.count += 1; lifecycleWindows.set(key, current);
  if (current.count > 50) return next(new ApiError(429, "APPLICATION_ACTION_RATE_LIMITED", "Too many application actions. Please try again later"));
  next();
};
const requireTrustedOrigin: RequestHandler = (req, _res, next) => {
  if (req.get("origin") !== config.FRONTEND_URL) return next(new ApiError(403, "ORIGIN_REJECTED", "Request origin was rejected"));
  next();
};
const submissionWindows = new Map<string, { count: number; resetAt: number }>();
const submissionRateLimit: RequestHandler = (req, _res, next) => {
  const key = String(req.auth!.user._id);
  const now = Date.now();
  const current = submissionWindows.get(key);
  const window = !current || current.resetAt <= now ? { count: 0, resetAt: now + 60 * 60_000 } : current;
  window.count += 1;
  submissionWindows.set(key, window);
  if (window.count > 10) return next(new ApiError(429, "APPLICATION_SUBMISSION_RATE_LIMITED", "Too many submission attempts. Please try again later"));
  next();
};
crmRouter.post("/applications", requireRole("STUDENT"), applicationCreationRateLimit, async (req, res) => {
  const input = strictBody(enquirySchema, req.body);
  const duplicateKey = applicationDuplicateKey(input);
  let application;
  try {
    application = await Application.create({
      ...input, duplicateKey, checklist: createDefaultChecklist(),
      studentId: req.auth!.user._id, stage: "ENQUIRY_RECORDED", active: true, assignmentState: "UNASSIGNED",
    });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) throw new ApiError(409, "DUPLICATE_ACTIVE_APPLICATION", "An identical active application already exists");
    throw error;
  }
  const assignment = await assignApplication(application._id, req.auth!.user._id);
  await ApplicationStageHistory.create({ applicationId: application._id, newStage: "ENQUIRY_RECORDED", actorId: req.auth!.user._id, actorRole: "STUDENT", reason: assignment?.assignedCounsellorId ? "Enquiry recorded and assigned for follow-up" : "Enquiry recorded and awaiting counsellor assignment" });
  await audit(req, "APPLICATION_CREATED", { actorId: req.auth!.user._id, subjectId: req.auth!.user._id, metadata: { applicationId: String(application._id), assigned: Boolean(assignment?.assignedCounsellorId) } });
  res.set("Cache-Control", "no-store, private");
  const assignmentRecord = assignment?.assignedCounsellorId
    ? await CounsellorAssignment.findOne({ studentId: application.studentId, active: true })
    : null;
  res.status(201).json({ application: await Application.findById(application._id).populate("assignedCounsellorId", "fullName email"), assignment: assignmentRecord });
});
async function applicationPayload(studentId: unknown) {
  const application = await Application.findOne({ studentId }).sort({ createdAt: -1 });
  if (!application) return { application: null, history: [], assignment: null };
  const [history, assignment] = await Promise.all([
    ApplicationStageHistory.find({ applicationId: application._id }).sort({ createdAt: 1 }),
    application.assignedCounsellorId ? User.findById(application.assignedCounsellorId).select("fullName email") : null,
  ]);
  return { application, history, assignment: assignment ? { counsellorId: assignment } : null };
}
crmRouter.get("/applications/current", requireRole("STUDENT"), async (req, res) => {
  res.set("Cache-Control", "no-store, private");
  res.json(await applicationPayload(req.auth!.user._id));
});
crmRouter.get("/applications/mine", requireRole("STUDENT"), async (req, res) => {
  const applications = await Application.find({ studentId: req.auth!.user._id })
    .populate("assignedCounsellorId", "fullName email")
    .sort({ updatedAt: -1 });
  res.set("Cache-Control", "no-store, private");
  res.json({ applications });
});
crmRouter.post("/applications/current/submit", requireRole("STUDENT"), submissionRateLimit, async (req, res) => {
  strictBody(z.object({ confirm: z.literal(true) }).strict(), req.body);
  const idempotencyKey = req.get("idempotency-key");
  if (!idempotencyKey || !/^[A-Za-z0-9_-]{20,128}$/.test(idempotencyKey)) {
    throw new ApiError(400, "INVALID_IDEMPOTENCY_KEY", "A valid request key is required");
  }
  const result = await submitOwnedApplication(req, idempotencyKey);
  res.set("Cache-Control", "no-store, private");
  res.status(result.duplicate ? 200 : 201).json(result);
});
crmRouter.post("/applications/:id/submit", requireRole("STUDENT"), submissionRateLimit, async (req, res) => {
  strictBody(z.object({ confirm: z.literal(true) }).strict(), req.body);
  if (!Types.ObjectId.isValid(String(req.params.id))) throw new ApiError(404, "APPLICATION_NOT_FOUND", "Application was not found");
  const idempotencyKey = req.get("idempotency-key");
  if (!idempotencyKey || !/^[A-Za-z0-9_-]{20,128}$/.test(idempotencyKey)) throw new ApiError(400, "INVALID_IDEMPOTENCY_KEY", "A valid request key is required");
  const result = await submitOwnedApplication(req, idempotencyKey, String(req.params.id));
  res.set("Cache-Control", "no-store, private");
  res.status(result.duplicate ? 200 : 201).json(result);
});

async function accessibleApplication(req: Request, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, "APPLICATION_NOT_FOUND", "Application was not found");
  const application = await Application.findById(id).populate("assignedCounsellorId", "fullName email");
  if (!application) throw new ApiError(404, "APPLICATION_NOT_FOUND", "Application was not found");
  if (req.auth!.user.role === "STUDENT" && String(application.studentId) !== String(req.auth!.user._id)) {
    throw new ApiError(404, "APPLICATION_NOT_FOUND", "Application was not found");
  }
  const assigned = application.assignedCounsellorId as unknown as { _id?: Types.ObjectId } | undefined;
  let assignedId = assigned?._id?.toHexString() ?? "";
  if (!assignedId && req.auth!.user.role === "COUNSELLOR") {
    const legacyAssignment = await CounsellorAssignment.findOne({ studentId: application.studentId, counsellorId: req.auth!.user._id, active: true });
    assignedId = legacyAssignment ? String(legacyAssignment.counsellorId) : "";
  }
  if (req.auth!.user.role === "COUNSELLOR" && assignedId !== String(req.auth!.user._id)) {
    throw new ApiError(403, "APPLICATION_ACCESS_DENIED", "Access to this application is denied");
  }
  return application;
}

crmRouter.get("/applications/:id", requireRole("STUDENT", "COUNSELLOR", "ADMIN"), async (req, res) => {
  const application = await accessibleApplication(req, String(req.params.id));
  const history = await ApplicationStageHistory.find({ applicationId: application._id }).sort({ createdAt: 1 });
  res.set("Cache-Control", "no-store, private");
  res.json({
    application,
    history,
    legalNotice: "EduFlow records education-consultancy workflow progress. It does not provide legal advice or guarantee an immigration outcome.",
  });
});
crmRouter.get("/applications/student/:studentId", requireRole("COUNSELLOR", "ADMIN"), async (req, res) => {
  if (req.auth!.user.role === "COUNSELLOR") await requireAssignedStudent(req.auth!.user._id, req.params.studentId);
  res.json(await applicationPayload(req.params.studentId));
});
crmRouter.get("/applications", requireRole("COUNSELLOR", "ADMIN"), async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const stage = typeof req.query.stage === "string" && applicationStages.includes(req.query.stage as never) ? req.query.stage : undefined;
  const filter: Record<string, unknown> = stage ? { stage } : {};
  if (req.auth!.user.role === "COUNSELLOR") {
    filter.assignedCounsellorId = req.auth!.user._id;
  }
  const [applications, total] = await Promise.all([
    Application.find(filter).populate("studentId", "fullName email").sort({ updatedAt: -1 }).skip(skip).limit(limit),
    Application.countDocuments(filter),
  ]);
  res.json({ applications, page, limit, total });
});
crmRouter.post("/applications/:id/transition", requireRole("COUNSELLOR", "ADMIN"), lifecycleRateLimit, async (req, res) => {
  const input = strictBody(z.object({ stage: z.enum(applicationStages), note: z.string().trim().min(2).max(500), outcome: z.enum(["PENDING", "APPROVED", "REFUSED"]).optional() }).strict(), req.body);
  const application = await accessibleApplication(req, String(req.params.id));
  assertMutable(application.stage, application.archivedAt);
  assertForwardTransition(application.stage, input.stage);
  if (application.stage === "VISA_DECISION") {
    const expected = input.stage === "VISA_REFUSED" ? "REFUSED" : "APPROVED";
    if (input.outcome !== expected) throw new ApiError(400, "VISA_OUTCOME_REQUIRED", `A controlled ${expected.toLowerCase()} outcome is required`);
  }
  const previous = application.stage;
  const changed = await Application.findOneAndUpdate(
    { _id: application._id, stage: previous, archivedAt: { $exists: false }, active: true },
    { $set: {
      stage: input.stage,
      active: !terminalStages.includes(input.stage),
      ...(input.stage === "VISA_DECISION" ? { visaOutcome: "PENDING" } : {}),
      ...(application.stage === "VISA_DECISION" && input.stage === "PRE_DEPARTURE" ? { visaOutcome: "APPROVED" } : {}),
      ...(input.stage === "VISA_REFUSED" ? { visaOutcome: "REFUSED" } : {}),
    } },
    { new: true, runValidators: true },
  );
  if (!changed) throw new ApiError(409, "APPLICATION_CHANGED", "The application changed before it could progress");
  await ApplicationStageHistory.create({ applicationId: application._id, previousStage: previous, newStage: input.stage, actorId: req.auth!.user._id, actorRole: req.auth!.user.role, reason: input.note });
  await audit(req, "APPLICATION_STAGE_TRANSITION", { actorId: req.auth!.user._id, subjectId: application.studentId, metadata: { previous, next: input.stage } });
  res.json({ application: changed });
});
crmRouter.patch("/applications/:id/checklist/:key", requireRole("STUDENT", "COUNSELLOR", "ADMIN"), lifecycleRateLimit, async (req, res) => {
  const application = await accessibleApplication(req, String(req.params.id));
  assertMutable(application.stage, application.archivedAt);
  const input = strictBody(z.object({
    status: z.enum(checklistStatuses),
    feedback: z.string().trim().min(2).max(500).optional(),
    documentId: z.string().optional(),
  }).strict(), req.body);
  const item = application.checklist.find((candidate) => candidate.key === String(req.params.key));
  if (!item) throw new ApiError(404, "CHECKLIST_ITEM_NOT_FOUND", "Checklist item was not found");
  if (req.auth!.user.role === "STUDENT" && !["SUBMITTED", "NOT_STARTED"].includes(input.status)) {
    throw new ApiError(403, "CHECKLIST_REVIEW_REQUIRED", "Only assigned staff can review checklist items");
  }
  if (input.documentId) {
    if (!Types.ObjectId.isValid(input.documentId) || !(await Document.exists({ _id: input.documentId, ownerId: application.studentId, applicationId: application._id, status: "AVAILABLE" }))) {
      throw new ApiError(400, "INVALID_DOCUMENT_LINK", "The selected document cannot be linked");
    }
    item.documentId = new Types.ObjectId(input.documentId);
  }
  item.status = input.status;
  item.feedback = req.auth!.user.role === "STUDENT" ? undefined : input.feedback;
  item.updatedAt = new Date();
  item.updatedBy = req.auth!.user._id;
  await application.save();
  await audit(req, "APPLICATION_CHECKLIST_UPDATED", { actorId: req.auth!.user._id, subjectId: application.studentId, metadata: { applicationId: String(application._id), item: item.key, status: item.status } });
  res.json({ item });
});

crmRouter.post("/applications/:id/discontinue", requireRole("COUNSELLOR", "ADMIN"), requireTrustedOrigin, lifecycleRateLimit, async (req, res) => {
  const input = strictBody(z.object({ reason: z.string().trim().min(10).max(500), confirm: z.literal(true) }).strict(), req.body);
  const application = await accessibleApplication(req, String(req.params.id));
  assertMutable(application.stage, application.archivedAt);
  const previous = application.stage;
  const changed = await Application.findOneAndUpdate(
    { _id: application._id, stage: previous, active: true, archivedAt: { $exists: false } },
    { $set: { stage: "DISCONTINUED", active: false, discontinuedAt: new Date(), discontinuedBy: req.auth!.user._id, discontinuationReason: input.reason } },
    { new: true },
  );
  if (!changed) throw new ApiError(409, "APPLICATION_CHANGED", "The application changed before it could be discontinued");
  await Task.updateMany({ applicationId: application._id, status: "OPEN" }, { status: "CANCELLED" });
  await ApplicationStageHistory.create({ applicationId: application._id, previousStage: previous, newStage: "DISCONTINUED", actorId: req.auth!.user._id, actorRole: req.auth!.user.role, reason: input.reason });
  await audit(req, "APPLICATION_DISCONTINUED", { actorId: req.auth!.user._id, subjectId: application.studentId, metadata: { applicationId: String(application._id), previous } });
  res.json({ application: changed });
});

crmRouter.post("/applications/:id/archive", requireRole("COUNSELLOR", "ADMIN"), requireTrustedOrigin, lifecycleRateLimit, async (req, res) => {
  const input = strictBody(z.object({ reason: z.string().trim().min(10).max(500), confirmation: z.literal("ARCHIVE APPLICATION") }).strict(), req.body);
  const application = await accessibleApplication(req, String(req.params.id));
  if (!terminalStages.includes(application.stage) || application.archivedAt) throw new ApiError(409, "ARCHIVE_NOT_ALLOWED", "Only an unarchived terminal application can be archived");
  const changed = await Application.findOneAndUpdate(
    { _id: application._id, archivedAt: { $exists: false } },
    { $set: { archivedAt: new Date(), archivedBy: req.auth!.user._id, archiveReason: input.reason, active: false } },
    { new: true },
  );
  if (!changed) throw new ApiError(409, "APPLICATION_CHANGED", "The application changed before it could be archived");
  await audit(req, "APPLICATION_ARCHIVED", { actorId: req.auth!.user._id, subjectId: application.studentId, metadata: { applicationId: String(application._id) } });
  await ApplicationStageHistory.create({ applicationId: application._id, previousStage: application.stage, newStage: application.stage, actorId: req.auth!.user._id, actorRole: req.auth!.user.role, reason: `Archived: ${input.reason}` });
  res.json({ application: changed });
});

crmRouter.post("/applications/:id/restore", requireMfa, requireRole("ADMIN"), requireTrustedOrigin, lifecycleRateLimit, async (req, res) => {
  const input = strictBody(z.object({ reason: z.string().trim().min(10).max(500), confirmation: z.literal("RESTORE APPLICATION") }).strict(), req.body);
  const application = await accessibleApplication(req, String(req.params.id));
  if (!application.archivedAt) throw new ApiError(409, "APPLICATION_NOT_ARCHIVED", "The application is not archived");
  application.archivedAt = undefined; application.archivedBy = undefined; application.archiveReason = undefined;
  application.active = !terminalStages.includes(application.stage);
  await application.save();
  await audit(req, "APPLICATION_RESTORED", { actorId: req.auth!.user._id, subjectId: application.studentId, metadata: { applicationId: String(application._id), reason: input.reason } });
  await ApplicationStageHistory.create({ applicationId: application._id, previousStage: application.stage, newStage: application.stage, actorId: req.auth!.user._id, actorRole: "ADMIN", reason: `Restored from archive: ${input.reason}` });
  res.json({ application });
});
crmRouter.post("/applications/current/cancel", requireRole("STUDENT"), async (req, res) => {
  const { reason } = strictBody(z.object({ reason: z.string().trim().min(2).max(500) }).strict(), req.body);
  const application = await Application.findOne({ studentId: req.auth!.user._id, active: true });
  if (!application) throw new ApiError(404, "APPLICATION_NOT_FOUND", "Application was not found");
  if (!canStudentCancel(application.stage)) throw new ApiError(409, "CANCELLATION_NOT_ALLOWED", "This application can no longer be cancelled by the student");
  const previous = application.stage; application.stage = "CANCELLED"; application.active = false; await application.save();
  await ApplicationStageHistory.create({ applicationId: application._id, previousStage: previous, newStage: "CANCELLED", actorId: req.auth!.user._id, actorRole: "STUDENT", reason });
  await audit(req, "APPLICATION_CANCELLED", { actorId: req.auth!.user._id, subjectId: req.auth!.user._id, metadata: { previous } });
  res.json({ application });
});
crmRouter.post("/applications/:id/correct-stage", requireMfa, requireFreshAuthentication, requireRole("ADMIN"), requireTrustedOrigin, async (req, res) => {
  const input = strictBody(z.object({ stage: z.enum(applicationStages), reason: z.string().trim().min(10).max(500), confirmation: z.literal("CORRECT STAGE") }).strict(), req.body);
  const application = await Application.findById(req.params.id);
  if (!application) throw new ApiError(404, "APPLICATION_NOT_FOUND", "Application was not found");
  if (application.stage === input.stage) throw new ApiError(409, "STAGE_UNCHANGED", "Choose a different stage");
  const previous = application.stage; application.stage = input.stage; application.active = !terminalStages.includes(input.stage); await application.save();
  await ApplicationStageHistory.create({ applicationId: application._id, previousStage: previous, newStage: input.stage, actorId: req.auth!.user._id, actorRole: "ADMIN", reason: input.reason });
  await audit(req, "APPLICATION_STAGE_CORRECTION", { actorId: req.auth!.user._id, subjectId: application.studentId, metadata: { previous, next: input.stage, reason: input.reason } });
  res.json({ application });
});

crmRouter.get("/assignments/counsellors", requireRole("ADMIN"), async (_req, res) => {
  const counsellors = await User.aggregate([
    { $match: { role: "COUNSELLOR", status: "ACTIVE", emailVerifiedAt: { $type: "date" }, passwordChangedAt: { $type: "date" }, $or: [{ invitationAcceptedAt: { $type: "date" } }, { lastAuthenticatedAt: { $type: "date" } }] } },
    { $lookup: { from: "applications", let: { id: "$_id" }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ["$assignedCounsellorId", "$$id"] }, { $eq: ["$active", true] }, { $eq: [{ $type: "$archivedAt" }, "missing"] }] } } },
      { $group: { _id: "$studentId" } }, { $count: "count" },
    ], as: "workload" } },
    { $project: { fullName: 1, email: 1, assignmentCount: { $ifNull: [{ $first: "$workload.count" }, 0] } } },
    { $sort: { assignmentCount: 1, email: 1 } },
  ]);
  res.json({ counsellors });
});
crmRouter.get("/assignments/unassigned", requireRole("ADMIN"), async (_req, res) => {
  const applications = await Application.find({ active: true, archivedAt: { $exists: false }, assignedCounsellorId: { $exists: false } }).populate("studentId", "fullName email").sort({ createdAt: 1 });
  res.json({ applications });
});
crmRouter.post("/assignments/automatic", requireMfa, requireFreshAuthentication, requireRole("ADMIN"), requireTrustedOrigin, lifecycleRateLimit, async (req, res) => {
  strictBody(z.object({ confirmation: z.literal("RUN AUTOMATIC ASSIGNMENT") }).strict(), req.body);
  const result = await reconcileUnassigned(100, req.auth!.user._id);
  await audit(req, "AUTOMATIC_ASSIGNMENT_RUN", { actorId: req.auth!.user._id, metadata: result });
  res.set("Cache-Control", "no-store, private");
  res.json(result);
});
crmRouter.post("/assignments", requireMfa, requireRole("ADMIN"), requireTrustedOrigin, async (req, res) => {
  const input = strictBody(z.object({ applicationId: z.string().optional(), studentId: z.string().optional(), counsellorId: z.string(), reason: z.string().trim().min(10).max(500) }).strict().refine((value) => value.applicationId || value.studentId, "Application is required"), req.body);
  const counsellor = await validateCounsellor(input.counsellorId);
  const application = input.applicationId && Types.ObjectId.isValid(input.applicationId)
    ? await Application.findOne({ _id: input.applicationId, active: true, archivedAt: { $exists: false } })
    : input.studentId && Types.ObjectId.isValid(input.studentId)
      ? await Application.findOne({ studentId: input.studentId, active: true, assignedCounsellorId: { $exists: false } }).sort({ createdAt: 1 })
      : null;
  if (!application) throw new ApiError(400, "INVALID_APPLICATION", "An active unassigned application is required");
  if (application.assignedCounsellorId) throw new ApiError(409, "ACTIVE_ASSIGNMENT_EXISTS", "Application already has an active assignment");
  const student = await User.findOne({ _id: application.studentId, role: "STUDENT", status: "ACTIVE" });
  if (!student) throw new ApiError(400, "INVALID_STUDENT", "An active student is required");
  const current = await CounsellorAssignment.findOne({ studentId: student._id, active: true });
  if (current && String(current.counsellorId) !== String(counsellor._id)) throw new ApiError(409, "STUDENT_COUNSELLOR_CONTINUITY", "Use the student’s current counsellor or perform a controlled reassignment");
  const assignment = current ?? await CounsellorAssignment.create({ studentId: student._id, counsellorId: counsellor._id, assignedBy: req.auth!.user._id, reason: input.reason });
  const claimed = await Application.findOneAndUpdate({ _id: application._id, assignedCounsellorId: { $exists: false } }, { assignedCounsellorId: counsellor._id, assignmentState: "ASSIGNED" }, { new: true });
  if (!claimed) throw new ApiError(409, "ACTIVE_ASSIGNMENT_EXISTS", "Application already has an active assignment");
  await Task.updateOne({ automationKey: `enquiry-follow-up:${String(application._id)}` }, { $setOnInsert: { title: "Follow up on new enquiry", studentId: student._id, applicationId: application._id, counsellorId: counsellor._id, dueAt: new Date(Date.now() + 86400000), priority: "HIGH", status: "OPEN", createdBy: req.auth!.user._id, automationKey: `enquiry-follow-up:${String(application._id)}` } }, { upsert: true });
  await ApplicationStageHistory.updateOne(
    { transactionReference: `application-assignment:${String(application._id)}` },
    { $setOnInsert: { applicationId: application._id, previousStage: application.stage, newStage: application.stage, actorId: req.auth!.user._id, actorRole: "ADMIN", reason: input.reason, transactionReference: `application-assignment:${String(application._id)}` } },
    { upsert: true },
  );
  await audit(req, "COUNSELLOR_ASSIGNMENT", { actorId: req.auth!.user._id, subjectId: student._id, metadata: { applicationId: String(application._id), counsellorId: String(counsellor._id), reason: input.reason } });
  res.status(201).json({ assignment });
});
crmRouter.post("/assignments/reassign", requireMfa, requireRole("ADMIN"), requireTrustedOrigin, lifecycleRateLimit, async (req, res) => {
  const input = strictBody(z.object({ studentId: z.string(), counsellorId: z.string(), reason: z.string().trim().min(10).max(500) }).strict(), req.body);
  const counsellor = await validateCounsellor(input.counsellorId);
  const current = await CounsellorAssignment.findOne({ studentId: input.studentId, active: true });
  if (!current) throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Active assignment was not found");
  if (String(current.counsellorId) === String(counsellor._id)) throw new ApiError(409, "SAME_COUNSELLOR", "Choose a different counsellor");
  current.active = false; current.endedAt = new Date(); await current.save();
  const assignment = await CounsellorAssignment.create({ studentId: current.studentId, counsellorId: counsellor._id, assignedBy: req.auth!.user._id, reason: input.reason });
  await Application.updateMany({ studentId: current.studentId, active: true, archivedAt: { $exists: false }, assignedCounsellorId: current.counsellorId }, { assignedCounsellorId: counsellor._id, assignmentState: "ASSIGNED" });
  await Task.updateMany({ studentId: current.studentId, status: "OPEN" }, { counsellorId: counsellor._id });
  await audit(req, "COUNSELLOR_REASSIGNMENT", { actorId: req.auth!.user._id, subjectId: current.studentId, metadata: { from: String(current.counsellorId), to: String(counsellor._id), reason: input.reason } });
  res.json({ assignment });
});
crmRouter.get("/assignments/:studentId", requireRole("STUDENT", "COUNSELLOR", "ADMIN"), async (req, res) => {
  if (req.auth!.user.role === "STUDENT" && String(req.auth!.user._id) !== req.params.studentId) throw new ApiError(403, "ACCESS_DENIED", "Access is denied");
  if (req.auth!.user.role === "COUNSELLOR") await requireAssignedStudent(req.auth!.user._id, req.params.studentId);
  const [current, history] = await Promise.all([
    CounsellorAssignment.findOne({ studentId: req.params.studentId, active: true }).populate("counsellorId", "fullName email"),
    CounsellorAssignment.find({ studentId: req.params.studentId }).populate("counsellorId", "fullName email").sort({ assignedAt: -1 }),
  ]);
  res.json({ current, history });
});

const noteSchema = z.object({ content: z.string().trim().min(1).max(2000) }).strict();
crmRouter.get("/students/:studentId/notes", requireRole("COUNSELLOR", "ADMIN"), async (req, res) => {
  if (req.auth!.user.role === "COUNSELLOR") await requireAssignedStudent(req.auth!.user._id, req.params.studentId);
  res.json({ notes: await CounsellingNote.find({ studentId: req.params.studentId }).populate("authorId", "fullName").sort({ createdAt: -1 }) });
});
crmRouter.post("/students/:studentId/notes", requireRole("COUNSELLOR"), async (req, res) => {
  await requireAssignedStudent(req.auth!.user._id, req.params.studentId);
  const input = strictBody(noteSchema, req.body);
  const note = await CounsellingNote.create({ studentId: req.params.studentId, authorId: req.auth!.user._id, content: input.content });
  await audit(req, "COUNSELLING_NOTE_CREATED", { actorId: req.auth!.user._id, subjectId: req.params.studentId });
  res.status(201).json({ note });
});
crmRouter.patch("/notes/:id", requireRole("COUNSELLOR"), async (req, res) => {
  const input = strictBody(noteSchema, req.body);
  const note = await CounsellingNote.findOne({ _id: req.params.id, authorId: req.auth!.user._id });
  if (!note) throw new ApiError(404, "NOTE_NOT_FOUND", "Note was not found");
  await requireAssignedStudent(req.auth!.user._id, note.studentId);
  note.content = input.content; await note.save();
  await audit(req, "COUNSELLING_NOTE_EDITED", { actorId: req.auth!.user._id, subjectId: note.studentId });
  res.json({ note });
});

crmRouter.get("/tasks", requireRole("COUNSELLOR", "ADMIN"), async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const filter: Record<string, unknown> = req.auth!.user.role === "COUNSELLOR" ? { counsellorId: req.auth!.user._id } : {};
  if (typeof req.query.status === "string" && ["OPEN", "COMPLETED", "CANCELLED"].includes(req.query.status)) filter.status = req.query.status;
  const [tasks, total] = await Promise.all([Task.find(filter).populate("studentId", "fullName email").sort({ dueAt: 1 }).skip(skip).limit(limit), Task.countDocuments(filter)]);
  res.json({ tasks, page, limit, total });
});
crmRouter.post("/tasks", requireRole("COUNSELLOR", "ADMIN"), async (req, res) => {
  const input = strictBody(z.object({ title: z.string().trim().min(2).max(160), description: z.string().trim().max(1000).optional(), studentId: z.string(), counsellorId: z.string().optional(), dueAt: z.coerce.date(), priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM") }).strict(), req.body);
  const counsellorId = req.auth!.user.role === "COUNSELLOR" ? req.auth!.user._id : input.counsellorId;
  if (!counsellorId) throw new ApiError(400, "COUNSELLOR_REQUIRED", "Counsellor is required");
  if (req.auth!.user.role === "COUNSELLOR") await requireAssignedStudent(req.auth!.user._id, input.studentId);
  await validateCounsellor(String(counsellorId));
  const task = await Task.create({ ...input, counsellorId, createdBy: req.auth!.user._id, status: "OPEN" });
  await audit(req, "FOLLOW_UP_TASK_CREATED", { actorId: req.auth!.user._id, subjectId: input.studentId });
  res.status(201).json({ task });
});
crmRouter.post("/tasks/:id/complete", requireRole("COUNSELLOR", "ADMIN"), async (req, res) => {
  strictBody(z.object({}).strict(), req.body);
  const filter = { _id: req.params.id, status: "OPEN", ...(req.auth!.user.role === "COUNSELLOR" ? { counsellorId: req.auth!.user._id } : {}) };
  const task = await Task.findOneAndUpdate(filter, { status: "COMPLETED", completedAt: new Date() }, { new: true });
  if (!task) throw new ApiError(404, "TASK_NOT_FOUND", "Open task was not found");
  await audit(req, "FOLLOW_UP_TASK_COMPLETED", { actorId: req.auth!.user._id, subjectId: task.studentId });
  res.json({ task });
});
crmRouter.post("/tasks/:id/cancel", requireRole("COUNSELLOR", "ADMIN"), async (req, res) => {
  const { reason } = strictBody(z.object({ reason: z.string().trim().min(2).max(500) }).strict(), req.body);
  const filter = { _id: req.params.id, status: "OPEN", ...(req.auth!.user.role === "COUNSELLOR" ? { counsellorId: req.auth!.user._id } : {}) };
  const task = await Task.findOneAndUpdate(filter, { status: "CANCELLED" }, { new: true });
  if (!task) throw new ApiError(404, "TASK_NOT_FOUND", "Open task was not found");
  await audit(req, "FOLLOW_UP_TASK_CANCELLED", { actorId: req.auth!.user._id, subjectId: task.studentId, metadata: { reason } });
  res.json({ task });
});

crmRouter.get("/dashboard/student", requireRole("STUDENT"), async (req, res) => {
  const [profile, application, applicationCount] = await Promise.all([
    StudentProfile.findOne({ userId: req.auth!.user._id }),
    Application.findOne({ studentId: req.auth!.user._id }).sort({ createdAt: -1 }),
    Application.countDocuments({ studentId: req.auth!.user._id }),
  ]);
  const assignment = application?.assignedCounsellorId ? await User.findById(application.assignedCounsellorId).select("fullName email") : null;
  res.json({ profileCompletion: profileCompletion(profile), application, applicationCount, assignment: assignment ? { counsellorId: assignment } : null, nextAction: !profile ? "Complete your profile" : !application ? "Create your first enquiry" : application.stage === "DOCUMENTS_PENDING" ? "Prepare your documents" : "Review your application progress" });
});
crmRouter.get("/dashboard/counsellor", requireRole("COUNSELLOR"), async (req, res) => {
  const studentIds = await Application.distinct("studentId", { assignedCounsellorId: req.auth!.user._id, active: true, archivedAt: { $exists: false } });
  const now = new Date();
  const [newEnquiries, openTasks, overdueTasks, stages] = await Promise.all([
    Application.countDocuments({ assignedCounsellorId: req.auth!.user._id, stage: { $in: ["ENQUIRY", "ENQUIRY_RECORDED"] }, active: true }),
    Task.countDocuments({ counsellorId: req.auth!.user._id, status: "OPEN" }),
    Task.countDocuments({ counsellorId: req.auth!.user._id, status: "OPEN", dueAt: { $lt: now } }),
    Application.aggregate([{ $match: { assignedCounsellorId: req.auth!.user._id } }, { $group: { _id: "$stage", count: { $sum: 1 } } }]),
  ]);
  res.json({ assignedStudents: studentIds.length, newEnquiries, openTasks, overdueTasks, stageSummary: stages });
});
crmRouter.get("/dashboard/admin", requireMfa, requireRole("ADMIN"), async (_req, res) => {
  const [totalStudents, activeCounsellors, openTasks, alerts, stages] = await Promise.all([
    User.countDocuments({ role: "STUDENT" }), User.countDocuments({ role: "COUNSELLOR", status: "ACTIVE" }),
    Task.countDocuments({ status: "OPEN" }), SecurityAlert.countDocuments({ acknowledgedAt: { $exists: false } }),
    Application.aggregate([{ $group: { _id: "$stage", count: { $sum: 1 } } }]),
  ]);
  const unassignedEnquiries = await Application.countDocuments({ active: true, assignedCounsellorId: { $exists: false } });
  const recentAudit = await AuditLog.find().sort({ createdAt: -1 }).limit(8).select("event actorId subjectId createdAt metadata");
  res.json({ totalStudents, activeCounsellors, unassignedEnquiries, openTasks, securityAlerts: alerts, stageSummary: stages, recentAudit });
});
