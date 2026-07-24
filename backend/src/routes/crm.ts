import { Router } from "express";
import { z } from "zod";
import { requireAuthentication, requireCurrentPassword, requireMfa, requireRole, requireVerifiedEmail } from "../middleware/auth.js";
import { StudentProfile, profileCompletion } from "../models/StudentProfile.js";
import { Application, applicationStages } from "../models/Application.js";
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
import { assignLeastLoaded, validateCounsellor } from "../crm/assignment.js";
import { assertForwardTransition, canStudentCancel } from "../crm/application-state.js";
import { pagination, requireAssignedStudent } from "../crm/access.js";
import { profileSchema } from "../crm/profile-schema.js";

export const crmRouter = Router();
crmRouter.use(requireAuthentication, requireVerifiedEmail, requireCurrentPassword);

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
  preferredStudyLevel: z.string().trim().min(2).max(80).optional(),
  intendedIntake: z.string().trim().min(2).max(80).optional(),
}).strict();
crmRouter.post("/applications", requireRole("STUDENT"), async (req, res) => {
  const input = strictBody(enquirySchema, req.body);
  let application;
  try {
    application = await Application.create({ ...input, studentId: req.auth!.user._id, stage: "ENQUIRY", active: true });
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) throw new ApiError(409, "ACTIVE_APPLICATION_EXISTS", "An active application already exists");
    throw error;
  }
  await ApplicationStageHistory.create({ applicationId: application._id, newStage: "ENQUIRY", actorId: req.auth!.user._id, actorRole: "STUDENT", reason: "Student created enquiry" });
  const assignment = await assignLeastLoaded(req.auth!.user._id);
  await audit(req, "APPLICATION_CREATED", { actorId: req.auth!.user._id, subjectId: req.auth!.user._id, metadata: { assigned: Boolean(assignment) } });
  res.status(201).json({ application, assignment });
});
async function applicationPayload(studentId: unknown) {
  const application = await Application.findOne({ studentId }).sort({ createdAt: -1 });
  if (!application) return { application: null, history: [], assignment: null };
  const [history, assignment] = await Promise.all([
    ApplicationStageHistory.find({ applicationId: application._id }).sort({ createdAt: 1 }),
    CounsellorAssignment.findOne({ studentId, active: true }).populate("counsellorId", "fullName email"),
  ]);
  return { application, history, assignment };
}
crmRouter.get("/applications/current", requireRole("STUDENT"), async (req, res) => res.json(await applicationPayload(req.auth!.user._id)));
crmRouter.get("/applications/student/:studentId", requireRole("COUNSELLOR", "ADMIN"), async (req, res) => {
  if (req.auth!.user.role === "COUNSELLOR") await requireAssignedStudent(req.auth!.user._id, req.params.studentId);
  res.json(await applicationPayload(req.params.studentId));
});
crmRouter.get("/applications", requireRole("COUNSELLOR", "ADMIN"), async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const stage = typeof req.query.stage === "string" && applicationStages.includes(req.query.stage as never) ? req.query.stage : undefined;
  const filter: Record<string, unknown> = stage ? { stage } : {};
  if (req.auth!.user.role === "COUNSELLOR") {
    const assignments = await CounsellorAssignment.find({ counsellorId: req.auth!.user._id, active: true }).select("studentId");
    filter.studentId = { $in: assignments.map((item) => item.studentId) };
  }
  const [applications, total] = await Promise.all([
    Application.find(filter).populate("studentId", "fullName email").sort({ updatedAt: -1 }).skip(skip).limit(limit),
    Application.countDocuments(filter),
  ]);
  res.json({ applications, page, limit, total });
});
crmRouter.post("/applications/:id/transition", requireRole("COUNSELLOR"), async (req, res) => {
  const input = strictBody(z.object({ stage: z.enum(applicationStages), note: z.string().trim().min(2).max(500) }).strict(), req.body);
  const application = await Application.findById(req.params.id);
  if (!application) throw new ApiError(404, "APPLICATION_NOT_FOUND", "Application was not found");
  await requireAssignedStudent(req.auth!.user._id, application.studentId);
  assertForwardTransition(application.stage, input.stage);
  const previous = application.stage;
  application.stage = input.stage;
  if (["COMPLETED", "CANCELLED"].includes(input.stage)) application.active = false;
  await application.save();
  await ApplicationStageHistory.create({ applicationId: application._id, previousStage: previous, newStage: input.stage, actorId: req.auth!.user._id, actorRole: "COUNSELLOR", reason: input.note });
  await audit(req, "APPLICATION_STAGE_TRANSITION", { actorId: req.auth!.user._id, subjectId: application.studentId, metadata: { previous, next: input.stage } });
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
crmRouter.post("/applications/:id/correct-stage", requireMfa, requireRole("ADMIN"), async (req, res) => {
  const input = strictBody(z.object({ stage: z.enum(applicationStages), reason: z.string().trim().min(10).max(500) }).strict(), req.body);
  const application = await Application.findById(req.params.id);
  if (!application) throw new ApiError(404, "APPLICATION_NOT_FOUND", "Application was not found");
  if (application.stage === input.stage) throw new ApiError(409, "STAGE_UNCHANGED", "Choose a different stage");
  const previous = application.stage; application.stage = input.stage; application.active = !["COMPLETED", "CANCELLED"].includes(input.stage); await application.save();
  await ApplicationStageHistory.create({ applicationId: application._id, previousStage: previous, newStage: input.stage, actorId: req.auth!.user._id, actorRole: "ADMIN", reason: input.reason });
  await audit(req, "APPLICATION_STAGE_CORRECTION", { actorId: req.auth!.user._id, subjectId: application.studentId, metadata: { previous, next: input.stage, reason: input.reason } });
  res.json({ application });
});

crmRouter.get("/assignments/counsellors", requireRole("ADMIN"), async (_req, res) => {
  const counsellors = await User.aggregate([
    { $match: { role: "COUNSELLOR", status: "ACTIVE" } },
    { $lookup: { from: "counsellorassignments", let: { id: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$counsellorId", "$$id"] }, { $eq: ["$active", true] }] } } }, { $count: "count" }], as: "workload" } },
    { $project: { fullName: 1, email: 1, assignmentCount: { $ifNull: [{ $first: "$workload.count" }, 0] } } },
    { $sort: { assignmentCount: 1, email: 1 } },
  ]);
  res.json({ counsellors });
});
crmRouter.get("/assignments/unassigned", requireRole("ADMIN"), async (_req, res) => {
  const assigned = await CounsellorAssignment.distinct("studentId", { active: true });
  const applications = await Application.find({ active: true, studentId: { $nin: assigned } }).populate("studentId", "fullName email").sort({ createdAt: 1 });
  res.json({ applications });
});
crmRouter.post("/assignments", requireMfa, requireRole("ADMIN"), async (req, res) => {
  const input = strictBody(z.object({ studentId: z.string(), counsellorId: z.string(), reason: z.string().trim().min(10).max(500) }).strict(), req.body);
  const counsellor = await validateCounsellor(input.counsellorId);
  const student = await User.findOne({ _id: input.studentId, role: "STUDENT", status: "ACTIVE" });
  if (!student) throw new ApiError(400, "INVALID_STUDENT", "An active student is required");
  if (await CounsellorAssignment.exists({ studentId: student._id, active: true })) throw new ApiError(409, "ACTIVE_ASSIGNMENT_EXISTS", "Student already has an active assignment");
  const assignment = await CounsellorAssignment.create({ studentId: student._id, counsellorId: counsellor._id, assignedBy: req.auth!.user._id, reason: input.reason });
  await audit(req, "COUNSELLOR_ASSIGNMENT", { actorId: req.auth!.user._id, subjectId: student._id, metadata: { counsellorId: String(counsellor._id), reason: input.reason } });
  res.status(201).json({ assignment });
});
crmRouter.post("/assignments/reassign", requireMfa, requireRole("ADMIN"), async (req, res) => {
  const input = strictBody(z.object({ studentId: z.string(), counsellorId: z.string(), reason: z.string().trim().min(10).max(500) }).strict(), req.body);
  const counsellor = await validateCounsellor(input.counsellorId);
  const current = await CounsellorAssignment.findOne({ studentId: input.studentId, active: true });
  if (!current) throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Active assignment was not found");
  if (String(current.counsellorId) === String(counsellor._id)) throw new ApiError(409, "SAME_COUNSELLOR", "Choose a different counsellor");
  current.active = false; current.endedAt = new Date(); await current.save();
  const assignment = await CounsellorAssignment.create({ studentId: current.studentId, counsellorId: counsellor._id, assignedBy: req.auth!.user._id, reason: input.reason });
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
  const [profile, application, assignment] = await Promise.all([
    StudentProfile.findOne({ userId: req.auth!.user._id }),
    Application.findOne({ studentId: req.auth!.user._id }).sort({ createdAt: -1 }),
    CounsellorAssignment.findOne({ studentId: req.auth!.user._id, active: true }).populate("counsellorId", "fullName email"),
  ]);
  res.json({ profileCompletion: profileCompletion(profile), application, assignment, nextAction: !profile ? "Complete your profile" : !application ? "Create your first enquiry" : application.stage === "DOCUMENTS_PENDING" ? "Prepare your documents" : "Review your application progress" });
});
crmRouter.get("/dashboard/counsellor", requireRole("COUNSELLOR"), async (req, res) => {
  const studentIds = (await CounsellorAssignment.find({ counsellorId: req.auth!.user._id, active: true }).select("studentId")).map((item) => item.studentId);
  const now = new Date();
  const [newEnquiries, openTasks, overdueTasks, stages] = await Promise.all([
    Application.countDocuments({ studentId: { $in: studentIds }, stage: "ENQUIRY" }),
    Task.countDocuments({ counsellorId: req.auth!.user._id, status: "OPEN" }),
    Task.countDocuments({ counsellorId: req.auth!.user._id, status: "OPEN", dueAt: { $lt: now } }),
    Application.aggregate([{ $match: { studentId: { $in: studentIds } } }, { $group: { _id: "$stage", count: { $sum: 1 } } }]),
  ]);
  res.json({ assignedStudents: studentIds.length, newEnquiries, openTasks, overdueTasks, stageSummary: stages });
});
crmRouter.get("/dashboard/admin", requireMfa, requireRole("ADMIN"), async (_req, res) => {
  const [totalStudents, activeCounsellors, openTasks, alerts, stages, assigned] = await Promise.all([
    User.countDocuments({ role: "STUDENT" }), User.countDocuments({ role: "COUNSELLOR", status: "ACTIVE" }),
    Task.countDocuments({ status: "OPEN" }), SecurityAlert.countDocuments({ acknowledgedAt: { $exists: false } }),
    Application.aggregate([{ $group: { _id: "$stage", count: { $sum: 1 } } }]),
    CounsellorAssignment.distinct("studentId", { active: true }),
  ]);
  const unassignedEnquiries = await Application.countDocuments({ stage: "ENQUIRY", studentId: { $nin: assigned } });
  const recentAudit = await AuditLog.find().sort({ createdAt: -1 }).limit(8).select("event actorId subjectId createdAt metadata");
  res.json({ totalStudents, activeCounsellors, unassignedEnquiries, openTasks, securityAlerts: alerts, stageSummary: stages, recentAudit });
});
