import { CounsellorAssignment } from "../models/CounsellorAssignment.js";
import { User } from "../models/User.js";
import { Task } from "../models/Task.js";
import { SecurityAlert } from "../models/Security.js";
import { ApiError } from "../errors.js";

export async function assignLeastLoaded(studentId: unknown) {
  const existing = await CounsellorAssignment.findOne({ studentId, active: true });
  if (existing) return existing;
  const counsellors = await User.aggregate([
    { $match: { role: "COUNSELLOR", status: "ACTIVE" } },
    { $lookup: { from: "counsellorassignments", let: { counsellor: "$_id" }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ["$counsellorId", "$$counsellor"] }, { $eq: ["$active", true] }] } } },
      { $count: "count" },
    ], as: "workload" } },
    { $addFields: { assignmentCount: { $ifNull: [{ $first: "$workload.count" }, 0] } } },
    { $sort: { assignmentCount: 1, email: 1, _id: 1 } },
    { $limit: 1 },
  ]);
  const counsellor = counsellors[0] as { _id: unknown } | undefined;
  if (!counsellor) {
    await SecurityAlert.create({ userId: studentId, type: "UNASSIGNED_ENQUIRY", severity: "MEDIUM", metadata: {} });
    return null;
  }
  try {
    const assignment = await CounsellorAssignment.create({
      studentId, counsellorId: counsellor._id, assignedBy: studentId,
      reason: "Automatic least-workload assignment", active: true,
    });
    await Task.updateOne({ automationKey: `enquiry-follow-up:${String(studentId)}` }, {
      $setOnInsert: {
        title: "Follow up on new enquiry", studentId, counsellorId: counsellor._id,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), priority: "HIGH",
        status: "OPEN", createdBy: studentId, automationKey: `enquiry-follow-up:${String(studentId)}`,
      },
    }, { upsert: true });
    return assignment;
  } catch (error: unknown) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return CounsellorAssignment.findOne({ studentId, active: true });
    }
    throw error;
  }
}

export async function validateCounsellor(counsellorId: string) {
  const counsellor = await User.findOne({ _id: counsellorId, role: "COUNSELLOR", status: "ACTIVE" });
  if (!counsellor) throw new ApiError(400, "INVALID_COUNSELLOR", "An active counsellor is required");
  return counsellor;
}
