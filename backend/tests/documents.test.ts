import request from "supertest";
import mongoose from "mongoose";
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { User, type Role } from "../src/models/User.js";
import { Session } from "../src/models/Session.js";
import { Application } from "../src/models/Application.js";
import { CounsellorAssignment } from "../src/models/CounsellorAssignment.js";
import { Document } from "../src/models/Document.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { hashPassword } from "../src/security/password.js";
import { randomToken, sha256 } from "../src/security/crypto.js";
import { config } from "../src/config.js";

beforeAll(async () => { expect(process.env.MONGODB_URI).toMatch(/eduflow_crm_test$/); if (!mongoose.connection.readyState) await mongoose.connect(process.env.MONGODB_URI!); });
beforeEach(async () => { await mongoose.connection.db!.dropDatabase(); await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes())); await rm(config.UPLOAD_ROOT, { recursive: true, force: true }); });
afterEach(async () => { await rm(config.UPLOAD_ROOT, { recursive: true, force: true }); });
afterAll(async () => { await mongoose.connection.db!.dropDatabase(); await mongoose.disconnect(); });

async function identity(role: Role, status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
  const now = new Date();
  const user = await User.create({ fullName: `${role} User`, email: `${role.toLowerCase()}-${randomToken(4)}@example.test`, role, status, passwordHash: await hashPassword("Coursework-Secure9!"), emailVerifiedAt: now, passwordChangedAt: now, passwordExpiresAt: new Date(Date.now() + 86400000), mfaEnabled: role === "ADMIN" });
  const token = randomToken(); const csrf = randomToken();
  await Session.create({ userId: user._id, tokenHash: sha256(token), csrfHash: sha256(csrf), expiresAt: new Date(Date.now() + 86400000), idleExpiresAt: new Date(Date.now() + 3600000), lastActivityAt: now, userAgent: "document-test", ipAddress: "127.0.0.1", mfaComplete: role === "ADMIN", freshUntil: new Date(Date.now() + 600000) });
  return { user, cookie: `eduflow_session=${token}`, csrf };
}

const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(4), Buffer.from("IHDR"), Buffer.alloc(17), Buffer.alloc(4), Buffer.from("IEND"), Buffer.alloc(4)]);

function upload(auth: Awaited<ReturnType<typeof identity>>, body: Buffer, filename: string, mime: string, category = "PASSPORT") {
  return request(app).post("/api/v1/documents").set("Cookie", auth.cookie).set("Origin", "http://localhost:3100").set("x-csrf-token", auth.csrf).set("x-document-category", category).set("x-file-name", encodeURIComponent(filename)).set("Content-Type", mime).send(body);
}

describe("private document validation and storage", () => {
  it.each([
    ["passport.pdf", "application/pdf", pdf],
    ["photo.jpg", "image/jpeg", jpeg],
    ["scan.png", "image/png", png],
  ])("accepts valid %s content", async (filename, mime, body) => {
    const student = await identity("STUDENT");
    const result = await upload(student, body, filename, mime).expect(201);
    expect(result.body.document).not.toHaveProperty("storedFilename");
    expect(result.body.document).not.toHaveProperty("integrityHash");
  });

  it("rejects oversized and empty files", async () => {
    const student = await identity("STUDENT");
    await upload(student, Buffer.alloc(5 * 1024 * 1024 + 1, 1), "large.pdf", "application/pdf").expect(413);
    await upload(student, Buffer.alloc(0), "empty.pdf", "application/pdf").expect(400);
  });

  it("rejects forbidden, double-extension, spoofed MIME and mismatched signatures", async () => {
    const student = await identity("STUDENT");
    await upload(student, pdf, "run.exe", "application/pdf").expect(400);
    await upload(student, pdf, "passport.pdf.exe", "application/pdf").expect(400);
    await upload(student, pdf, "passport.pdf", "image/jpeg").expect(400);
    await upload(student, jpeg, "passport.pdf", "application/pdf").expect(400);
  });

  it("rejects traversal names and cross-account application IDs", async () => {
    const student = await identity("STUDENT"); const other = await identity("STUDENT");
    await upload(student, pdf, "../escape.pdf", "application/pdf").expect(400);
    const application = await Application.create({ studentId: other.user._id, stage: "ENQUIRY", active: true });
    await request(app).post("/api/v1/documents").set("Cookie", student.cookie).set("Origin", "http://localhost:3100").set("x-csrf-token", student.csrf).set("x-document-category", "OTHER").set("x-file-name", "safe.pdf").set("x-application-id", String(application._id)).set("Content-Type", "application/pdf").send(pdf).expect(404);
  });

  it("uses unpredictable contained stored names and audits validation rejection", async () => {
    const student = await identity("STUDENT");
    await upload(student, pdf, "first.pdf", "application/pdf").expect(201);
    await upload(student, pdf, "second.pdf", "application/pdf").expect(201);
    const documents = await Document.find().select("+storedFilename");
    expect(documents[0]!.storedFilename).not.toBe(documents[1]!.storedFilename);
    for (const document of documents) {
      expect(document.storedFilename).toMatch(/^[a-f0-9]{48}\.pdf$/);
      expect(path.relative(config.UPLOAD_ROOT, path.resolve(config.UPLOAD_ROOT, document.storedFilename)).startsWith("..")).toBe(false);
    }
    await upload(student, Buffer.from("not a pdf"), "bad.pdf", "application/pdf").expect(400);
    expect(await AuditLog.countDocuments({ event: "DOCUMENT_VALIDATION_REJECTED" })).toBe(1);
  });
});

describe("private document authorization and delivery", () => {
  it("denies unauthenticated upload/download and missing CSRF", async () => {
    await request(app).post("/api/v1/documents").set("Origin", "http://localhost:3100").set("Content-Type", "application/pdf").send(pdf).expect(401);
    await request(app).get(`/api/v1/documents/${String(new mongoose.Types.ObjectId())}/download`).expect(401);
    const student = await identity("STUDENT");
    await request(app).post("/api/v1/documents").set("Cookie", student.cookie).set("Origin", "http://localhost:3100").set("x-document-category", "OTHER").set("x-file-name", "safe.pdf").set("Content-Type", "application/pdf").send(pdf).expect(403);
  });

  it("prevents student IDOR and makes inaccessible documents indistinguishable", async () => {
    const owner = await identity("STUDENT"); const other = await identity("STUDENT");
    const created = await upload(owner, pdf, "passport.pdf", "application/pdf").expect(201);
    await request(app).get(`/api/v1/documents/${created.body.document.id}`).set("Cookie", other.cookie).expect(404);
    await request(app).get(`/api/v1/documents/${String(new mongoose.Types.ObjectId())}`).set("Cookie", other.cookie).expect(404);
    expect(await AuditLog.countDocuments({ event: "DOCUMENT_ACCESS_DENIED" })).toBe(1);
  });

  it("allows assigned counsellor and denies unassigned counsellor", async () => {
    const student = await identity("STUDENT"); const assigned = await identity("COUNSELLOR"); const unrelated = await identity("COUNSELLOR");
    await CounsellorAssignment.create({ studentId: student.user._id, counsellorId: assigned.user._id, assignedBy: assigned.user._id, reason: "Document test assignment" });
    const created = await upload(student, pdf, "passport.pdf", "application/pdf").expect(201);
    await request(app).get(`/api/v1/documents?studentId=${String(student.user._id)}`).set("Cookie", assigned.cookie).expect(200);
    await request(app).get(`/api/v1/documents/${created.body.document.id}/download`).set("Cookie", assigned.cookie).expect(200);
    await request(app).get(`/api/v1/documents?studentId=${String(student.user._id)}`).set("Cookie", unrelated.cookie).expect(403);
    await request(app).get(`/api/v1/documents/${created.body.document.id}/download`).set("Cookie", unrelated.cookie).expect(404);
  });

  it("allows audited administrator access with secure download headers", async () => {
    const student = await identity("STUDENT"); const admin = await identity("ADMIN");
    const created = await upload(student, png, "scan.png", "image/png").expect(201);
    const response = await request(app).get(`/api/v1/documents/${created.body.document.id}/download`).set("Cookie", admin.cookie).expect(200);
    expect(response.headers["content-type"]).toMatch(/^image\/png/);
    expect(response.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["cache-control"]).toBe("no-store, private");
    expect(await AuditLog.countDocuments({ event: "DOCUMENT_DOWNLOAD", actorId: admin.user._id })).toBe(1);
  });

  it("denies suspended users and enforces deletion authorization", async () => {
    const student = await identity("STUDENT"); const other = await identity("STUDENT");
    const created = await upload(student, pdf, "passport.pdf", "application/pdf").expect(201);
    await request(app).delete(`/api/v1/documents/${created.body.document.id}`).set("Cookie", other.cookie).set("Origin", "http://localhost:3100").set("x-csrf-token", other.csrf).expect(404);
    student.user.status = "SUSPENDED"; await student.user.save();
    await request(app).get("/api/v1/documents").set("Cookie", student.cookie).expect(401);
    const admin = await identity("ADMIN");
    await request(app).delete(`/api/v1/documents/${created.body.document.id}`).set("Cookie", admin.cookie).set("Origin", "http://localhost:3100").set("x-csrf-token", admin.csrf).expect(204);
    expect(await Document.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments({ event: "DOCUMENT_DELETE" })).toBe(1);
  });
});
