import request from "supertest";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { User, type Role } from "../src/models/User.js";
import { Session } from "../src/models/Session.js";
import { StudentProfile } from "../src/models/StudentProfile.js";
import { Application } from "../src/models/Application.js";
import { ApplicationStageHistory } from "../src/models/ApplicationStageHistory.js";
import { Document } from "../src/models/Document.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { hashPassword } from "../src/security/password.js";
import { randomToken, sha256 } from "../src/security/crypto.js";

beforeAll(async () => { if (!mongoose.connection.readyState) await mongoose.connect(process.env.MONGODB_URI!); });
beforeEach(async () => { await mongoose.connection.db!.dropDatabase(); await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes())); });
afterAll(async () => { await mongoose.connection.db!.dropDatabase(); await mongoose.disconnect(); });

async function identity(role: Role, status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
  const now = new Date();
  const user = await User.create({ fullName: `${role} Export User`, email: `${role.toLowerCase()}-${randomToken(4)}@example.test`, role, status, passwordHash: await hashPassword("Coursework-Secure9!"), emailVerifiedAt: now, passwordChangedAt: now, passwordExpiresAt: new Date(Date.now() + 86400000), mfaEnabled: role === "ADMIN" });
  const token = randomToken(); const csrf = randomToken();
  await Session.create({ userId: user._id, tokenHash: sha256(token), csrfHash: sha256(csrf), expiresAt: new Date(Date.now() + 86400000), idleExpiresAt: new Date(Date.now() + 3600000), lastActivityAt: now, userAgent: "privacy-test", ipAddress: "127.0.0.1", mfaComplete: role === "ADMIN", freshUntil: new Date(Date.now() + 600000) });
  return { user, cookie: `eduflow_session=${token}`, csrf };
}

describe("privacy data export", () => {
  it("exports only the authenticated student's safe owned data", async () => {
    const owner = await identity("STUDENT"); const other = await identity("STUDENT");
    await StudentProfile.create({ userId: owner.user._id, phone: "9800000000", country: "Nepal", englishTestType: "NONE" });
    const application = await Application.create({ studentId: owner.user._id, stage: "ENQUIRY", active: true });
    await ApplicationStageHistory.create({ applicationId: application._id, newStage: "ENQUIRY", actorId: owner.user._id, actorRole: "STUDENT", reason: "Created" });
    await Document.create({ ownerId: owner.user._id, category: "OTHER", originalFilename: "safe.png", storedFilename: `${randomToken(24)}.png`, detectedMimeType: "image/png", size: 100, integrityHash: sha256("file"), uploadedBy: owner.user._id });
    await StudentProfile.create({ userId: other.user._id, phone: "9811111111", country: "Otherland", englishTestType: "NONE" });
    const response = await request(app).get("/api/v1/privacy/export").set("Cookie", owner.cookie).expect(200);
    expect(response.headers["cache-control"]).toBe("no-store, private");
    expect(response.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(response.body.schemaVersion).toBe("1.0");
    expect(response.body.account.email).toBe(owner.user.email);
    expect(response.body.studentProfile.phone).toBe("9800000000");
    expect(response.body.documentMetadata[0].originalFilename).toBe("safe.png");
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(other.user.email);
    expect(serialized).not.toContain("9811111111");
    for (const forbidden of ["passwordHash", "storedFilename", "integrityHash", "csrfHash", "tokenHash", "mfaSecret", "recoveryCode"]) expect(serialized).not.toContain(forbidden);
    expect(await AuditLog.countDocuments({ event: "PRIVACY_DATA_EXPORT", actorId: owner.user._id })).toBe(1);
  });

  it("does not leak student profile data into staff exports", async () => {
    const counsellor = await identity("COUNSELLOR"); const student = await identity("STUDENT");
    await StudentProfile.create({ userId: student.user._id, phone: "9899999999", country: "Nepal", englishTestType: "NONE" });
    const response = await request(app).get("/api/v1/privacy/export").set("Cookie", counsellor.cookie).expect(200);
    expect(response.body.studentProfile).toBeNull();
    expect(JSON.stringify(response.body)).not.toContain("9899999999");
  });

  it("denies unauthenticated and suspended accounts", async () => {
    await request(app).get("/api/v1/privacy/export").expect(401);
    const suspended = await identity("STUDENT", "SUSPENDED");
    await request(app).get("/api/v1/privacy/export").set("Cookie", suspended.cookie).expect(401);
  });
});

describe("privacy profile import", () => {
  const importBody = { schemaVersion: "1.0", profile: { phone: "9800000000", city: "Kathmandu", country: "Nepal", englishTestType: "NONE" } };
  const post = (path: string, auth: Awaited<ReturnType<typeof identity>>) =>
    request(app).post(path).set("Cookie", auth.cookie).set("Origin", "http://localhost:3100").set("x-csrf-token", auth.csrf).set("Content-Type", "application/json");

  it("previews without mutation and imports only after explicit confirmation", async () => {
    const student = await identity("STUDENT");
    const preview = await post("/api/v1/privacy/import/preview", student).send(importBody).expect(200);
    expect(preview.body.confirmationRequired).toBe(true);
    expect(preview.body.fields).toEqual(expect.arrayContaining(["phone", "city"]));
    expect(await StudentProfile.countDocuments()).toBe(0);
    await post("/api/v1/privacy/import", student).send(importBody).expect(400);
    const imported = await post("/api/v1/privacy/import", student).send({ ...importBody, confirm: true }).expect(200);
    expect(imported.body.message).toMatch(/imported successfully/i);
    expect((await StudentProfile.findOne({ userId: student.user._id }))!.city).toBe("Kathmandu");
    expect(await AuditLog.countDocuments({ event: "PRIVACY_PROFILE_IMPORT", actorId: student.user._id })).toBe(1);
  });

  it.each([
    ["role", { ...importBody, profile: { ...importBody.profile, role: "ADMIN" } }],
    ["ownership", { ...importBody, profile: { ...importBody.profile, userId: new mongoose.Types.ObjectId().toString() } }],
    ["password", { ...importBody, profile: { ...importBody.profile, password: "unsafe" } }],
    ["prototype", JSON.parse('{"schemaVersion":"1.0","profile":{"country":"Nepal","englishTestType":"NONE","prototype":{"polluted":true}}}')],
    ["constructor", JSON.parse('{"schemaVersion":"1.0","profile":{"country":"Nepal","englishTestType":"NONE","constructor":{"prototype":{"polluted":true}}}}')],
    ["__proto__", JSON.parse('{"schemaVersion":"1.0","profile":{"country":"Nepal","englishTestType":"NONE","__proto__":{"polluted":true}}}')],
  ])("rejects prohibited %s input without partial mutation", async (_label, body) => {
    const student = await identity("STUDENT");
    await StudentProfile.create({ userId: student.user._id, phone: "9711111111", country: "Nepal", englishTestType: "NONE" });
    await post("/api/v1/privacy/import", student).send({ ...(body as object), confirm: true }).expect(400);
    expect((await StudentProfile.findOne({ userId: student.user._id }))!.phone).toBe("9711111111");
    expect(await AuditLog.countDocuments({ event: "PRIVACY_PROFILE_IMPORT_REJECTED", actorId: student.user._id })).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("enforces JSON, CSRF, role and size limits", async () => {
    const student = await identity("STUDENT"); const counsellor = await identity("COUNSELLOR");
    await request(app).post("/api/v1/privacy/import/preview").set("Cookie", student.cookie).set("x-csrf-token", student.csrf).set("Content-Type", "text/plain").send("profile").expect(415);
    await request(app).post("/api/v1/privacy/import").set("Cookie", student.cookie).set("x-csrf-token", student.csrf).set("Content-Type", "text/plain").send("profile").expect(415);
    await request(app).post("/api/v1/privacy/import").set("Cookie", student.cookie).set("Content-Type", "application/json").send({ ...importBody, confirm: true }).expect(403);
    await post("/api/v1/privacy/import", counsellor).send({ ...importBody, confirm: true }).expect(403);
    await post("/api/v1/privacy/import/preview", student).send({ schemaVersion: "1.0", profile: { country: "x".repeat(101 * 1024) } }).expect(413);
  });

  it("denies suspended users and rate limits repeated previews", async () => {
    const suspended = await identity("STUDENT", "SUSPENDED");
    await post("/api/v1/privacy/import", suspended).send({ ...importBody, confirm: true }).expect(401);
    const student = await identity("STUDENT");
    for (let attempt = 0; attempt < 10; attempt += 1) await post("/api/v1/privacy/import/preview", student).send(importBody).expect(200);
    await post("/api/v1/privacy/import/preview", student).send(importBody).expect(429);
  });
});
