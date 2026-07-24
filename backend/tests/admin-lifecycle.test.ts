import request from "supertest";
/* eslint-disable @typescript-eslint/restrict-template-expressions */
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { User, type Role } from "../src/models/User.js";
import { Session } from "../src/models/Session.js";
import { EmailVerificationToken, PasswordResetToken } from "../src/models/Tokens.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Application } from "../src/models/Application.js";
import { CounsellorAssignment } from "../src/models/CounsellorAssignment.js";
import { hashPassword } from "../src/security/password.js";
import { randomToken, sha256 } from "../src/security/crypto.js";

const password = "Lifecycle-Test9!";
beforeAll(async () => { if (!mongoose.connection.readyState) await mongoose.connect(process.env.MONGODB_URI!); });
beforeEach(async () => {
  await mongoose.connection.db!.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
});
afterAll(async () => { await mongoose.connection.db!.dropDatabase(); await mongoose.disconnect(); });

async function identity(role: Role, options: { verified?: boolean; mfa?: boolean } = {}) {
  const now = new Date();
  const user = await User.create({
    fullName: `${role} Lifecycle`, email: `${role.toLowerCase()}-${randomToken(4)}@example.test`, role,
    passwordHash: await hashPassword(password), emailVerifiedAt: options.verified === false ? undefined : now,
    passwordChangedAt: now, passwordExpiresAt: new Date(Date.now() + 86400000), mfaEnabled: role === "ADMIN",
  });
  const token = randomToken(); const csrf = randomToken();
  await Session.create({
    userId: user._id, tokenHash: sha256(token), csrfHash: sha256(csrf), expiresAt: new Date(Date.now() + 86400000),
    idleExpiresAt: new Date(Date.now() + 3600000), lastActivityAt: now, userAgent: "lifecycle-test",
    ipAddress: "127.0.0.1", mfaComplete: options.mfa ?? role === "ADMIN", freshUntil: new Date(Date.now() + 600000),
  });
  return { user, cookie: `eduflow_session=${token}`, csrf };
}
function adminRequest(auth: Awaited<ReturnType<typeof identity>>, method: "get" | "post" | "patch" | "delete", path: string, body?: object) {
  const call = request(app)[method](path).set("Cookie", auth.cookie).set("Origin", "http://localhost:3100");
  if (method !== "get") call.set("x-csrf-token", auth.csrf);
  return body === undefined ? call : call.send(body);
}
const reason = "Verified administrator lifecycle action";

describe("administrator user lifecycle", () => {
  it("returns paginated safe details with summaries and no sensitive fields", async () => {
    const admin = await identity("ADMIN");
    const student = await identity("STUDENT");
    await Application.create({ studentId: student.user._id, stage: "ENQUIRY" });
    const response = await adminRequest(admin, "get", `/api/v1/admin/users/${student.user._id}`).expect(200);
    expect(response.body).toMatchObject({ user: { role: "STUDENT", passwordExpired: false }, summary: { application: { stage: "ENQUIRY" }, activeSessions: 1 } });
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|tokenHash|csrfHash|mfaSecret|recoveryCode|storedFilename|integrityHash/i);
    await adminRequest(student, "get", `/api/v1/admin/users/${admin.user._id}`).expect(403);
  });

  it("corrects only a full name, rejects mass assignment and audits the change", async () => {
    const admin = await identity("ADMIN"); const student = await identity("STUDENT");
    await adminRequest(admin, "patch", `/api/v1/admin/users/${student.user._id}/profile`, { fullName: "Corrected Student", reason }).expect(200);
    expect((await User.findById(student.user._id))!.fullName).toBe("Corrected Student");
    await adminRequest(admin, "patch", `/api/v1/admin/users/${student.user._id}/profile`, { fullName: "Bad Update", role: "ADMIN", reason }).expect(400);
    expect((await User.findById(student.user._id))!.role).toBe("STUDENT");
    expect(await AuditLog.countDocuments({ event: "ACCOUNT_PROFILE_CORRECTION", subjectId: student.user._id })).toBe(1);
  });

  it("suspends, reactivates and revokes sessions with audit events", async () => {
    const admin = await identity("ADMIN"); const student = await identity("STUDENT");
    await adminRequest(admin, "patch", `/api/v1/admin/users/${student.user._id}/status`, { status: "SUSPENDED", reason }).expect(200);
    expect((await User.findById(student.user._id))!.status).toBe("SUSPENDED");
    expect(await Session.countDocuments({ userId: student.user._id, revokedAt: { $exists: true } })).toBe(1);
    await adminRequest(admin, "patch", `/api/v1/admin/users/${student.user._id}/status`, { status: "ACTIVE", reason }).expect(200);
    const second = await identity("STUDENT");
    await adminRequest(admin, "post", `/api/v1/admin/users/${second.user._id}/revoke-sessions`, { reason }).expect(200);
    expect(await AuditLog.countDocuments({ event: "ADMIN_SESSION_REVOCATION", subjectId: second.user._id })).toBe(1);
  });

  it("cancels only an unused pending counsellor and removes its tokens", async () => {
    const admin = await identity("ADMIN"); const pending = await identity("COUNSELLOR", { verified: false });
    await EmailVerificationToken.create({ userId: pending.user._id, tokenHash: sha256(randomToken()), expiresAt: new Date(Date.now() + 3600000) });
    await PasswordResetToken.create({ userId: pending.user._id, tokenHash: sha256(randomToken()), expiresAt: new Date(Date.now() + 3600000) });
    await Session.deleteMany({ userId: pending.user._id });
    await adminRequest(admin, "delete", `/api/v1/admin/users/${pending.user._id}/pending-invitation`, { confirm: "CANCEL INVITATION", reason }).expect(200);
    expect(await User.findById(pending.user._id)).toBeNull();
    expect(await EmailVerificationToken.countDocuments({ userId: pending.user._id })).toBe(0);
    expect(await PasswordResetToken.countDocuments({ userId: pending.user._id })).toBe(0);
    expect(await AuditLog.countDocuments({ event: "COUNSELLOR_INVITATION_CANCELLED", subjectId: pending.user._id })).toBe(1);
  });

  it("removes only unused students and denies established-account deletion", async () => {
    const admin = await identity("ADMIN"); const unused = await identity("STUDENT");
    await Session.deleteMany({ userId: unused.user._id });
    await adminRequest(admin, "delete", `/api/v1/admin/users/${unused.user._id}/unused-student`, { confirm: "REMOVE UNUSED STUDENT", reason }).expect(200);
    expect(await User.findById(unused.user._id)).toBeNull();
    const established = await identity("STUDENT");
    await Application.create({ studentId: established.user._id });
    const denied = await adminRequest(admin, "delete", `/api/v1/admin/users/${established.user._id}/unused-student`, { confirm: "REMOVE UNUSED STUDENT", reason }).expect(409);
    expect(denied.body.error.code).toBe("ACCOUNT_HAS_DEPENDENCIES");
  });

  it("archives established accounts, protects self/last admin and assigned counsellors", async () => {
    const admin = await identity("ADMIN");
    const last = await adminRequest(admin, "post", `/api/v1/admin/users/${admin.user._id}/archive`, { confirm: "ARCHIVE ACCOUNT", reason }).expect(409);
    expect(last.body.error.code).toBe("LAST_ADMIN_PROTECTED");
    await identity("ADMIN");
    const self = await adminRequest(admin, "post", `/api/v1/admin/users/${admin.user._id}/archive`, { confirm: "ARCHIVE ACCOUNT", reason }).expect(403);
    expect(self.body.error.code).toBe("SELF_ARCHIVE_DENIED");
    const counsellor = await identity("COUNSELLOR"); const student = await identity("STUDENT");
    await CounsellorAssignment.create({ studentId: student.user._id, counsellorId: counsellor.user._id, assignedBy: admin.user._id, reason });
    const assigned = await adminRequest(admin, "post", `/api/v1/admin/users/${counsellor.user._id}/archive`, { confirm: "ARCHIVE ACCOUNT", reason }).expect(409);
    expect(assigned.body.error.code).toBe("COUNSELLOR_HAS_CASELOAD");
    await Application.create({ studentId: student.user._id });
    await adminRequest(admin, "post", `/api/v1/admin/users/${student.user._id}/archive`, { confirm: "ARCHIVE ACCOUNT", reason }).expect(200);
    expect((await User.findById(student.user._id))!.status).toBe("ARCHIVED");
  });

  it("denies IDOR, missing MFA/CSRF, wrong Origin, role changes and unsafe confirmation", async () => {
    const admin = await identity("ADMIN"); const student = await identity("STUDENT"); const counsellor = await identity("COUNSELLOR");
    await adminRequest(student, "patch", `/api/v1/admin/users/${counsellor.user._id}/profile`, { fullName: "Attacker", reason }).expect(403);
    await adminRequest(counsellor, "post", `/api/v1/admin/users/${student.user._id}/archive`, { confirm: "ARCHIVE ACCOUNT", reason }).expect(403);
    const noMfa = await identity("ADMIN", { mfa: false });
    await adminRequest(noMfa, "patch", `/api/v1/admin/users/${student.user._id}/profile`, { fullName: "Denied Name", reason }).expect(403);
    await request(app).patch(`/api/v1/admin/users/${student.user._id}/profile`).set("Cookie", admin.cookie).set("Origin", "http://localhost:3100").send({ fullName: "Denied Name", reason }).expect(403);
    await request(app).patch(`/api/v1/admin/users/${student.user._id}/profile`).set("Cookie", admin.cookie).set("Origin", "http://evil.example").set("x-csrf-token", admin.csrf).send({ fullName: "Denied Name", reason }).expect(403);
    await adminRequest(admin, "patch", `/api/v1/admin/users/${student.user._id}/role`, { role: "ADMIN", reason }).expect(403);
    await adminRequest(admin, "delete", `/api/v1/admin/users/${student.user._id}/unused-student`, { confirm: "REMOVE", reason }).expect(400);
  });
});
