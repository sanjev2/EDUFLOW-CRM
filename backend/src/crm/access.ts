import { Types } from "mongoose";
import { ApiError } from "../errors.js";
import { CounsellorAssignment } from "../models/CounsellorAssignment.js";

export async function requireAssignedStudent(counsellorId: unknown, studentId: unknown) {
  if (!Types.ObjectId.isValid(String(studentId))) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student was not found");
  const assignment = await CounsellorAssignment.findOne({ counsellorId, studentId, active: true });
  if (!assignment) throw new ApiError(403, "STUDENT_ACCESS_DENIED", "Access to this student is denied");
  return assignment;
}
export function pagination(query: unknown) {
  const input = query as Record<string, unknown>;
  const page = Math.max(1, Math.min(100000, Number(input.page) || 1));
  const limit = Math.max(1, Math.min(50, Number(input.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}
