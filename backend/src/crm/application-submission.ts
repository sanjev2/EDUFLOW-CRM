import type { Request } from "express";
import { Application, type IApplication } from "../models/Application.js";
import { ApplicationStageHistory } from "../models/ApplicationStageHistory.js";
import { AuditLog } from "../models/AuditLog.js";
import { CounsellorAssignment } from "../models/CounsellorAssignment.js";
import { Document } from "../models/Document.js";
import { StudentProfile } from "../models/StudentProfile.js";
import { Task } from "../models/Task.js";
import { ApiError } from "../errors.js";
import { keyedHash, randomToken, sha256 } from "../security/crypto.js";

export type SubmissionReceipt = {
  reference: string;
  submittedAt: string;
  integrity: string;
  stage: "APPLICATION_SUBMITTED";
};
type StoredApplication = IApplication & { _id: unknown };

function safeReceipt(application: StoredApplication): SubmissionReceipt {
  const submission = application.submission!;
  return {
    reference: submission.reference,
    submittedAt: submission.submittedAt.toISOString(),
    integrity: submission.integrity,
    stage: "APPLICATION_SUBMITTED",
  };
}

async function validateReadiness(application: StoredApplication) {
  const [profile, hasDocument] = await Promise.all([
    StudentProfile.findOne({ userId: application.studentId }).lean(),
    Document.exists({ ownerId: application.studentId, status: "AVAILABLE" }),
  ]);
  const missing = [
    !profile?.highestQualification && "highest qualification",
    !(application.preferredCountry || profile?.preferredCountry) && "preferred country",
    !(application.preferredStudyLevel || profile?.preferredStudyLevel) && "preferred study level",
    !(application.intendedIntake || profile?.intendedIntake) && "intended intake",
    !hasDocument && "supporting document",
  ].filter(Boolean);
  if (missing.length) throw new ApiError(422, "APPLICATION_NOT_READY", `Complete the required application information: ${missing.join(", ")}`);
}

async function reconcileSideEffects(req: Request, application: StoredApplication) {
  const submission = application.submission!;
  const reference = submission.reference;
  await ApplicationStageHistory.updateOne(
    { transactionReference: reference },
    { $setOnInsert: {
      applicationId: application._id, previousStage: "DOCUMENTS_PENDING", newStage: "APPLICATION_SUBMITTED",
      actorId: application.studentId, actorRole: "STUDENT", reason: "Student submitted application for consultancy processing",
    } },
    { upsert: true },
  );
  const assignment = await CounsellorAssignment.findOne({ studentId: application.studentId, active: true }).lean();
  if (assignment) {
    await Task.updateOne(
      { automationKey: `application-submission:${reference}` },
      { $setOnInsert: {
        title: "Review submitted application", studentId: application.studentId, counsellorId: assignment.counsellorId,
        dueAt: new Date(submission.submittedAt.getTime() + 24 * 60 * 60 * 1000), priority: "HIGH",
        status: "OPEN", createdBy: application.studentId, automationKey: `application-submission:${reference}`,
      } },
      { upsert: true },
    );
  }
  await AuditLog.updateOne(
    { event: "APPLICATION_SUBMISSION_TRANSACTION", transactionReference: reference },
    { $setOnInsert: {
      event: "APPLICATION_SUBMISSION_TRANSACTION",
      actorId: application.studentId, subjectId: application.studentId,
      ipHash: keyedHash(req.ip ?? ""), requestId: req.id,
      metadata: { applicationId: String(application._id), stage: "APPLICATION_SUBMITTED" },
      createdAt: submission.submittedAt,
    } },
    { upsert: true },
  );
}

export async function submitOwnedApplication(req: Request, idempotencyKey: string) {
  const studentId = req.auth!.user._id;
  const keyHash = sha256(idempotencyKey);
  let application = await Application.findOne({ studentId, active: true }).select("+submission.idempotencyKeyHash");
  if (!application) throw new ApiError(404, "APPLICATION_NOT_FOUND", "Application was not found");
  if (application.submission) {
    if (application.submission.idempotencyKeyHash !== keyHash) throw new ApiError(409, "APPLICATION_ALREADY_SUBMITTED", "This application has already been submitted");
    await reconcileSideEffects(req, application);
    return { receipt: safeReceipt(application), duplicate: true };
  }
  if (application.stage !== "DOCUMENTS_PENDING") throw new ApiError(409, "APPLICATION_NOT_ELIGIBLE", "The application is not ready for submission");
  await validateReadiness(application);

  const submittedAt = new Date();
  const reference = `EDF-${submittedAt.toISOString().slice(0, 10).replaceAll("-", "")}-${randomToken(9).toUpperCase()}`;
  const integrity = keyedHash(`application-submission:${String(application._id)}:${String(studentId)}:${reference}:${submittedAt.toISOString()}`);
  application = await Application.findOneAndUpdate(
    { _id: application._id, studentId, stage: "DOCUMENTS_PENDING", submission: { $exists: false } },
    { $set: { stage: "APPLICATION_SUBMITTED", submission: {
      idempotencyKeyHash: keyHash, reference, integrity, submittedAt,
      previousStage: "DOCUMENTS_PENDING", newStage: "APPLICATION_SUBMITTED",
    } } },
    { new: true, runValidators: true },
  );
  if (!application) {
    const concurrent = await Application.findOne({ studentId, active: true }).select("+submission.idempotencyKeyHash");
    if (concurrent?.submission?.idempotencyKeyHash === keyHash) {
      await reconcileSideEffects(req, concurrent);
      return { receipt: safeReceipt(concurrent), duplicate: true };
    }
    throw new ApiError(409, "APPLICATION_SUBMISSION_CONFLICT", "The application changed before it could be submitted");
  }
  try {
    await reconcileSideEffects(req, application);
  } catch {
    throw new ApiError(503, "SUBMISSION_FINALIZATION_PENDING", "Submission was securely recorded. Retry with the same request key to finish processing");
  }
  return { receipt: safeReceipt(application), duplicate: false };
}
