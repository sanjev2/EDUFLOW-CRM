import { Types } from "mongoose";
import { Application } from "../models/Application.js";
import { CounsellorAssignment } from "../models/CounsellorAssignment.js";
import { User } from "../models/User.js";
import { Task } from "../models/Task.js";
import { SecurityAlert } from "../models/Security.js";
import { ApiError } from "../errors.js";
import { ApplicationStageHistory } from "../models/ApplicationStageHistory.js";

const eligibleCounsellor = {
  role: "COUNSELLOR",
  status: "ACTIVE",
  emailVerifiedAt: { $type: "date" },
  passwordChangedAt: { $type: "date" },
  $or: [{ invitationAcceptedAt: { $type: "date" } }, { lastAuthenticatedAt: { $type: "date" } }],
};

export async function validateCounsellor(counsellorId: string) {
  if (!Types.ObjectId.isValid(counsellorId)) throw new ApiError(400, "INVALID_COUNSELLOR", "An active counsellor is required");
  const counsellor = await User.findOne({ _id: counsellorId, ...eligibleCounsellor });
  if (!counsellor) throw new ApiError(400, "INVALID_COUNSELLOR", "An active, verified counsellor is required");
  return counsellor;
}

async function chooseCounsellor(studentId: unknown) {
  const existing = await Application.findOne({
    studentId,
    active: true,
    archivedAt: { $exists: false },
    assignedCounsellorId: { $exists: true },
  }).sort({ createdAt: 1 }).select("assignedCounsellorId");
  if (existing?.assignedCounsellorId) {
    const eligible = await User.exists({ _id: existing.assignedCounsellorId, ...eligibleCounsellor });
    if (eligible) return existing.assignedCounsellorId;
  }
  const counsellors = await User.aggregate([
    { $match: eligibleCounsellor },
    { $lookup: {
      from: "applications",
      let: { counsellor: "$_id" },
      pipeline: [
        { $match: { $expr: { $and: [
          { $eq: ["$assignedCounsellorId", "$$counsellor"] },
          { $eq: ["$active", true] },
          { $eq: [{ $type: "$archivedAt" }, "missing"] },
        ] } } },
        { $group: { _id: "$studentId" } },
        { $count: "count" },
      ],
      as: "workload",
    } },
    { $addFields: { assignmentCount: { $ifNull: [{ $first: "$workload.count" }, 0] } } },
    { $sort: { assignmentCount: 1, email: 1, _id: 1 } },
    { $limit: 1 },
  ]);
  return (counsellors[0] as { _id?: Types.ObjectId } | undefined)?._id;
}

export async function assignApplication(applicationId: unknown, assignedBy?: unknown) {
  const application = await Application.findById(applicationId);
  if (!application || !application.active || application.archivedAt) return null;
  if (application.assignedCounsellorId) return application;
  const counsellorId = await chooseCounsellor(application.studentId);
  if (!counsellorId) {
    await SecurityAlert.updateOne(
      { userId: application.studentId, type: "UNASSIGNED_ENQUIRY", "metadata.applicationId": String(application._id), acknowledgedAt: { $exists: false } },
      { $setOnInsert: { userId: application.studentId, type: "UNASSIGNED_ENQUIRY", severity: "MEDIUM", metadata: { applicationId: String(application._id), reason: "NO_ELIGIBLE_COUNSELLOR" } } },
      { upsert: true },
    );
    return null;
  }
  const claimed = await Application.findOneAndUpdate(
    { _id: application._id, active: true, archivedAt: { $exists: false }, assignedCounsellorId: { $exists: false } },
    { $set: { assignedCounsellorId: counsellorId, assignmentState: "ASSIGNED" } },
    { new: true },
  );
  if (!claimed) return Application.findById(application._id);
  try {
    await CounsellorAssignment.updateOne(
      { studentId: application.studentId, active: true },
      { $setOnInsert: {
        studentId: application.studentId, counsellorId, assignedBy: assignedBy ?? application.studentId,
        reason: "Automatic least-workload application assignment", active: true,
      } },
      { upsert: true },
    );
  } catch (error: unknown) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000)) throw error;
  }
  const continuity = await CounsellorAssignment.findOne({ studentId: application.studentId, active: true });
  if (continuity && String(continuity.counsellorId) !== String(counsellorId)) {
    await Application.updateOne({ _id: application._id }, { assignedCounsellorId: continuity.counsellorId });
    claimed.assignedCounsellorId = continuity.counsellorId;
  }
  await Task.updateOne(
    { automationKey: `enquiry-follow-up:${String(application._id)}` },
    { $setOnInsert: {
      title: "Follow up on new enquiry", studentId: application.studentId, applicationId: application._id,
      counsellorId: claimed.assignedCounsellorId, dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      priority: "HIGH", status: "OPEN", createdBy: assignedBy ?? application.studentId,
      automationKey: `enquiry-follow-up:${String(application._id)}`,
    } },
    { upsert: true },
  );
  if (await ApplicationStageHistory.exists({ applicationId: application._id })) {
    const actor = await User.findById(assignedBy ?? application.studentId).select("role");
    await ApplicationStageHistory.updateOne(
      { transactionReference: `application-assignment:${String(application._id)}` },
      { $setOnInsert: {
        applicationId: application._id, previousStage: application.stage, newStage: application.stage,
        actorId: assignedBy ?? application.studentId, actorRole: actor?.role ?? "STUDENT",
        reason: "Application assigned for counsellor follow-up",
        transactionReference: `application-assignment:${String(application._id)}`,
      } },
      { upsert: true },
    );
  }
  return claimed;
}

// Compatibility wrapper for earlier internal callers and tests.
export async function assignLeastLoaded(studentId: unknown) {
  const application = await Application.findOne({ studentId, active: true }).sort({ createdAt: -1 });
  if (!application) return null;
  const assigned = await assignApplication(application._id, studentId);
  return assigned?.assignedCounsellorId
    ? CounsellorAssignment.findOne({ studentId, active: true })
    : null;
}

export async function reconcileUnassigned(limit = 100, assignedBy?: unknown) {
  const pending = await Application.find({
    active: true,
    archivedAt: { $exists: false },
    assignedCounsellorId: { $exists: false },
  }).sort({ createdAt: 1, _id: 1 }).limit(limit);
  let assigned = 0;
  let skipped = 0;
  for (const application of pending) {
    const result = await assignApplication(application._id, assignedBy);
    if (result?.assignedCounsellorId) assigned += 1;
    else skipped += 1;
  }
  const remaining = await Application.countDocuments({
    active: true, archivedAt: { $exists: false }, assignedCounsellorId: { $exists: false },
  });
  return { assigned, remaining, skipped };
}
