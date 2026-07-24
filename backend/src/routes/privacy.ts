import { Router, type RequestHandler } from "express";
import { requireAuthentication, requireCurrentPassword, requireVerifiedEmail } from "../middleware/auth.js";
import { Application } from "../models/Application.js";
import { ApplicationStageHistory } from "../models/ApplicationStageHistory.js";
import { AuditLog } from "../models/AuditLog.js";
import { Document } from "../models/Document.js";
import { StudentProfile } from "../models/StudentProfile.js";
import { Task } from "../models/Task.js";
import { audit } from "../security/audit.js";
import { ApiError } from "../errors.js";

export const privacyRouter = Router();
privacyRouter.use(requireAuthentication, requireVerifiedEmail, requireCurrentPassword);

const exportWindows = new Map<string, { count: number; resetAt: number }>();
const exportRateLimit: RequestHandler = (req, _res, next) => {
  const key = String(req.auth!.user._id);
  const now = Date.now();
  const window = exportWindows.get(key);
  const current = !window || window.resetAt <= now ? { count: 0, resetAt: now + 60 * 60_000 } : window;
  current.count += 1;
  exportWindows.set(key, current);
  if (current.count > 5) return next(new ApiError(429, "PRIVACY_EXPORT_RATE_LIMITED", "Too many export requests. Please try again later"));
  next();
};

privacyRouter.get("/export", exportRateLimit, async (req, res) => {
  const user = req.auth!.user;
  const userId = user._id;
  const account = await user.toObject();
  const applications = user.role === "STUDENT"
    ? await Application.find({ studentId: userId }).sort({ createdAt: 1 }).lean()
    : [];
  const applicationIds = applications.map((application) => application._id);
  const [profile, history, tasks, documents, accountEvents] = await Promise.all([
    user.role === "STUDENT" ? StudentProfile.findOne({ userId }).lean() : null,
    applicationIds.length ? ApplicationStageHistory.find({ applicationId: { $in: applicationIds } }).sort({ createdAt: 1 }).lean() : [],
    Task.find(user.role === "STUDENT" ? { studentId: userId } : user.role === "COUNSELLOR" ? { counsellorId: userId } : { createdBy: userId })
      .select("title description dueAt priority status completedAt createdAt updatedAt").sort({ createdAt: 1 }).lean(),
    Document.find({ ownerId: userId }).select("applicationId category originalFilename detectedMimeType size status createdAt updatedAt").sort({ createdAt: 1 }).lean(),
    AuditLog.find({ $or: [{ actorId: userId }, { subjectId: userId }] }).select("event createdAt").sort({ createdAt: 1 }).limit(500).lean(),
  ]);
  const payload = {
    schemaVersion: "1.0",
    exportedAt: new Date().toISOString(),
    account: {
      fullName: account.fullName,
      email: account.email,
      role: account.role,
      status: account.status,
      emailVerifiedAt: account.emailVerifiedAt,
      mfaEnabled: account.mfaEnabled,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    },
    studentProfile: profile ? {
      phone: profile.phone, dateOfBirth: profile.dateOfBirth, addressLine: profile.addressLine,
      city: profile.city, province: profile.province, country: profile.country,
      highestQualification: profile.highestQualification, institutionName: profile.institutionName,
      completionYear: profile.completionYear, resultType: profile.resultType, resultValue: profile.resultValue,
      englishTestType: profile.englishTestType, englishTestScore: profile.englishTestScore,
      preferredCountry: profile.preferredCountry, preferredStudyLevel: profile.preferredStudyLevel,
      intendedIntake: profile.intendedIntake, previousVisaRefusal: profile.previousVisaRefusal,
      refusalExplanation: profile.refusalExplanation, createdAt: profile.createdAt, updatedAt: profile.updatedAt,
    } : null,
    applications: applications.map(({ _id, studentId: _studentId, ...application }) => ({ id: String(_id), ...application })),
    applicationHistory: history.map(({ _id, actorId: _actorId, ...event }) => ({ id: String(_id), ...event, applicationId: String(event.applicationId) })),
    tasks: tasks.map(({ _id, ...task }) => ({ id: String(_id), ...task })),
    documentMetadata: documents.map(({ _id, ...document }) => ({ id: String(_id), ...document, ...(document.applicationId ? { applicationId: String(document.applicationId) } : {}) })),
    accountEvents: accountEvents.map(({ _id, ...event }) => ({ id: String(_id), ...event })),
  };
  await audit(req, "PRIVACY_DATA_EXPORT", { actorId: userId, subjectId: userId, metadata: { schemaVersion: payload.schemaVersion } });
  res.set({
    "Cache-Control": "no-store, private",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="eduflow-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
    "X-Content-Type-Options": "nosniff",
  });
  res.json(payload);
});
