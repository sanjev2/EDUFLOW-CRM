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
