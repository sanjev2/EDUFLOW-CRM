import { Router, type RequestHandler } from "express";
import { requireAuthentication, requireCurrentPassword, requireRole, requireVerifiedEmail } from "../middleware/auth.js";
import { ZodError } from "zod";
import { Application } from "../models/Application.js";
import { ApplicationStageHistory } from "../models/ApplicationStageHistory.js";
import { AuditLog } from "../models/AuditLog.js";
import { Document } from "../models/Document.js";
import { profileCompletion, StudentProfile } from "../models/StudentProfile.js";
import { Task } from "../models/Task.js";
import { audit } from "../security/audit.js";
import { ApiError } from "../errors.js";
import { profileImportSchema } from "../crm/profile-schema.js";

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
const importWindows = new Map<string, { count: number; resetAt: number }>();
const importRateLimit: RequestHandler = (req, _res, next) => {
  const key = String(req.auth!.user._id);
  const now = Date.now();
  const window = importWindows.get(key);
  const current = !window || window.resetAt <= now ? { count: 0, resetAt: now + 60 * 60_000 } : window;
  current.count += 1;
  importWindows.set(key, current);
  if (current.count > 10) return next(new ApiError(429, "PRIVACY_IMPORT_RATE_LIMITED", "Too many import requests. Please try again later"));
  next();
};

function dangerousObjectKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.keys(value).some((key) => ["__proto__", "constructor", "prototype"].includes(key) || dangerousObjectKey((value as Record<string, unknown>)[key]));
}

async function parseImport(req: Parameters<RequestHandler>[0], body: unknown = req.body as unknown) {
  try {
    if (!req.is("application/json")) throw new ApiError(415, "JSON_REQUIRED", "Profile imports must use JSON");
    if (dangerousObjectKey(body)) throw new ApiError(400, "PRIVACY_IMPORT_REJECTED", "The import contains unsupported fields");
    return profileImportSchema.parse(body);
  } catch (error) {
    await audit(req, "PRIVACY_PROFILE_IMPORT_REJECTED", { actorId: req.auth!.user._id, subjectId: req.auth!.user._id, metadata: { reason: error instanceof ZodError ? "schema" : "policy" } });
    throw error;
  }
}

privacyRouter.get("/export", exportRateLimit, async (req, res) => {
  const user = req.auth!.user;
  const userId = user._id;
  const account = user.toObject();
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
    applications: applications.map((application) => ({
      id: String(application._id), stage: application.stage, active: application.active,
      preferredCountry: application.preferredCountry, preferredStudyLevel: application.preferredStudyLevel,
      intendedIntake: application.intendedIntake, createdAt: application.createdAt, updatedAt: application.updatedAt,
    })),
    applicationHistory: history.map((event) => ({
      id: String(event._id), applicationId: String(event.applicationId), previousStage: event.previousStage,
      newStage: event.newStage, actorRole: event.actorRole, reason: event.reason, createdAt: event.createdAt,
    })),
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

privacyRouter.post("/import/preview", requireRole("STUDENT"), importRateLimit, async (req, res) => {
  const input = await parseImport(req);
  const fields = Object.keys(input.profile);
  res.set("Cache-Control", "no-store, private");
  res.json({ schemaVersion: input.schemaVersion, fields, fieldCount: fields.length, confirmationRequired: true });
});

privacyRouter.post("/import", requireRole("STUDENT"), importRateLimit, async (req, res) => {
  if (!req.is("application/json")) {
    await audit(req, "PRIVACY_PROFILE_IMPORT_REJECTED", { actorId: req.auth!.user._id, subjectId: req.auth!.user._id, metadata: { reason: "content-type" } });
    throw new ApiError(415, "JSON_REQUIRED", "Profile imports must use JSON");
  }
  const body = req.body as Record<string, unknown>;
  if (body?.confirm !== true) {
    await audit(req, "PRIVACY_PROFILE_IMPORT_REJECTED", { actorId: req.auth!.user._id, subjectId: req.auth!.user._id, metadata: { reason: "confirmation" } });
    throw new ApiError(400, "IMPORT_CONFIRMATION_REQUIRED", "Explicit confirmation is required");
  }
  const candidate = { ...body };
  delete candidate.confirm;
  const input = await parseImport(req, candidate);
  if (!input.profile.previousVisaRefusal) input.profile.refusalExplanation = undefined;
  const profile = await StudentProfile.findOneAndUpdate(
    { userId: req.auth!.user._id },
    { $set: input.profile, $setOnInsert: { userId: req.auth!.user._id } },
    { upsert: true, new: true, runValidators: true },
  );
  await audit(req, "PRIVACY_PROFILE_IMPORT", { actorId: req.auth!.user._id, subjectId: req.auth!.user._id, metadata: { schemaVersion: input.schemaVersion, fields: Object.keys(input.profile) } });
  res.set("Cache-Control", "no-store, private");
  res.json({ message: "Profile data imported successfully.", fields: Object.keys(input.profile), completion: profileCompletion(profile) });
});
