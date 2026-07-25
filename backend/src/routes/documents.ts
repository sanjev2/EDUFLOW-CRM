import express, { Router, type RequestHandler } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { config } from "../config.js";
import { ApiError } from "../errors.js";
import { requireAssignedStudent } from "../crm/access.js";
import { Application } from "../models/Application.js";
import { Document, documentCategories, type IDocument } from "../models/Document.js";
import { audit } from "../security/audit.js";
import { requireAuthentication, requireCurrentPassword, requireMfa, requireRole, requireVerifiedEmail } from "../middleware/auth.js";
import { deleteStoredDocument, MAX_DOCUMENT_BYTES, readStoredDocument, storeDocument, validateFile } from "../documents/storage.js";

export const documentRouter = Router();
documentRouter.use(requireAuthentication, requireVerifiedEmail, requireCurrentPassword);

const mutationWindows = new Map<string, { count: number; resetAt: number }>();
const uploadRateLimit: RequestHandler = (req, _res, next) => {
  const key = String(req.auth!.user._id);
  const now = Date.now();
  const current = mutationWindows.get(key);
  const window = !current || current.resetAt <= now ? { count: 0, resetAt: now + 15 * 60_000 } : current;
  window.count += 1;
  mutationWindows.set(key, window);
  if (window.count > 20) return next(new ApiError(429, "DOCUMENT_RATE_LIMITED", "Too many document requests. Please try again later"));
  next();
};

const trustedOrigin: RequestHandler = (req, _res, next) => {
  if (req.get("origin") !== config.FRONTEND_URL) return next(new ApiError(403, "CSRF_REJECTED", "Request origin was rejected"));
  next();
};

const adminMfa: RequestHandler = (req, res, next) => req.auth?.user.role === "ADMIN" ? requireMfa(req, res, next) : next();
const validId = (value: unknown) => typeof value === "string" && Types.ObjectId.isValid(value);
const safeDocument = (document: IDocument & { _id: unknown }) => ({
  id: String(document._id),
  ownerId: String(document.ownerId),
  ...(document.applicationId ? { applicationId: String(document.applicationId) } : {}),
  category: document.category,
  originalFilename: document.originalFilename,
  detectedMimeType: document.detectedMimeType,
  size: document.size,
  status: document.status,
  uploadedBy: String(document.uploadedBy),
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
});

async function authorizeDocument(req: Parameters<RequestHandler>[0]) {
  if (!validId(req.params.id)) {
    await audit(req, "DOCUMENT_ACCESS_DENIED", { actorId: req.auth!.user._id });
    throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document was not found");
  }
  const document = await Document.findById(req.params.id).select("+storedFilename +integrityHash");
  if (!document) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document was not found");
  const role = req.auth!.user.role;
  let allowed = role === "ADMIN" || (role === "STUDENT" && String(document.ownerId) === String(req.auth!.user._id));
  if (role === "COUNSELLOR") {
    allowed = document.applicationId
      ? Boolean(await Application.exists({ _id: document.applicationId, assignedCounsellorId: req.auth!.user._id }))
      : Boolean(await import("../models/CounsellorAssignment.js").then(({ CounsellorAssignment }) =>
        CounsellorAssignment.exists({ counsellorId: req.auth!.user._id, studentId: document.ownerId, active: true })));
  }
  if (!allowed) {
    await audit(req, "DOCUMENT_ACCESS_DENIED", { actorId: req.auth!.user._id });
    throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Document was not found");
  }
  return document;
}

const rawUpload = express.raw({ type: ["application/pdf", "image/jpeg", "image/png"], limit: MAX_DOCUMENT_BYTES });

documentRouter.post("/", requireRole("STUDENT"), trustedOrigin, uploadRateLimit, (req, res, next) => {
  rawUpload(req, res, (parseError) => {
    if (parseError) {
      void audit(req, "DOCUMENT_VALIDATION_REJECTED", { actorId: req.auth!.user._id, subjectId: req.auth!.user._id, metadata: { reason: "size-or-body" } })
        .then(() => next(new ApiError(413, "DOCUMENT_TOO_LARGE", "Files must be 5 MB or smaller")), next);
      return;
    }
    void (async () => {
    try {
      const category = z.enum(documentCategories).parse(req.get("x-document-category"));
      const originalFilename = req.get("x-file-name") ?? "";
      const applicationId = req.get("x-application-id");
      if (applicationId && !validId(applicationId)) throw new ApiError(400, "DOCUMENT_VALIDATION_REJECTED", "The related application is invalid");
      if (applicationId && !(await Application.exists({ _id: applicationId, studentId: req.auth!.user._id, active: true, archivedAt: { $exists: false } }))) {
        throw new ApiError(404, "APPLICATION_NOT_FOUND", "Application was not found");
      }
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const checked = validateFile(buffer, req.get("content-type") ?? "", originalFilename);
      const storedFilename = await storeDocument(buffer, checked.extension);
      try {
        const document = await Document.create({
          ownerId: req.auth!.user._id, ...(applicationId ? { applicationId } : {}), category,
          originalFilename: checked.originalFilename, storedFilename, detectedMimeType: checked.detectedMimeType,
          size: buffer.length, integrityHash: checked.integrityHash, uploadedBy: req.auth!.user._id,
        });
        await audit(req, "DOCUMENT_UPLOAD", { actorId: req.auth!.user._id, subjectId: req.auth!.user._id, metadata: { documentId: String(document._id), category, size: buffer.length } });
        res.status(201).json({ document: safeDocument(document) });
      } catch (databaseError) {
        await deleteStoredDocument(storedFilename).catch(() => undefined);
        throw databaseError;
      }
    } catch (error) {
      await audit(req, "DOCUMENT_VALIDATION_REJECTED", { actorId: req.auth!.user._id, subjectId: req.auth!.user._id, metadata: { reason: "policy" } });
      next(error);
    }
    })().catch(next);
  });
});

documentRouter.get("/", requireRole("STUDENT", "COUNSELLOR", "ADMIN"), adminMfa, async (req, res) => {
  const role = req.auth!.user.role;
  const studentId = typeof req.query.studentId === "string" ? req.query.studentId : undefined;
  const filter: Record<string, unknown> = {};
  if (role === "STUDENT") filter.ownerId = req.auth!.user._id;
  if (role === "COUNSELLOR") {
    if (!validId(studentId)) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Documents were not found");
    await requireAssignedStudent(req.auth!.user._id, studentId);
    filter.ownerId = studentId;
  }
  if (role === "ADMIN" && studentId) {
    if (!validId(studentId)) throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Documents were not found");
    filter.ownerId = studentId;
  }
  const documents = await Document.find(filter).sort({ createdAt: -1 }).limit(role === "ADMIN" && !studentId ? 100 : 50);
  if (role === "ADMIN") await audit(req, "DOCUMENT_METADATA_ACCESS", { actorId: req.auth!.user._id, metadata: { filtered: Boolean(studentId) } });
  res.json({ documents: documents.map((document) => safeDocument(document)) });
});

documentRouter.get("/:id", requireRole("STUDENT", "COUNSELLOR", "ADMIN"), adminMfa, async (req, res) => {
  const document = await authorizeDocument(req);
  if (req.auth!.user.role === "ADMIN") await audit(req, "DOCUMENT_METADATA_ACCESS", { actorId: req.auth!.user._id, subjectId: document.ownerId, metadata: { documentId: String(document._id) } });
  res.json({ document: safeDocument(document) });
});

documentRouter.get("/:id/download", requireRole("STUDENT", "COUNSELLOR", "ADMIN"), adminMfa, async (req, res) => {
  const document = await authorizeDocument(req);
  const buffer = await readStoredDocument(document.storedFilename, document.integrityHash);
  const fallback = document.originalFilename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  res.set({
    "Content-Type": document.detectedMimeType,
    "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(document.originalFilename)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store, private",
    "Content-Length": String(buffer.length),
  });
  await audit(req, "DOCUMENT_DOWNLOAD", { actorId: req.auth!.user._id, subjectId: document.ownerId, metadata: { documentId: String(document._id), role: req.auth!.user.role } });
  res.send(buffer);
});

documentRouter.delete("/:id", requireRole("STUDENT", "ADMIN"), adminMfa, trustedOrigin, uploadRateLimit, async (req, res) => {
  const document = await authorizeDocument(req);
  await deleteStoredDocument(document.storedFilename);
  await document.deleteOne();
  await audit(req, "DOCUMENT_DELETE", { actorId: req.auth!.user._id, subjectId: document.ownerId, metadata: { documentId: String(document._id), role: req.auth!.user.role } });
  res.status(204).end();
});
