import request from "supertest";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { User, type Role } from "../src/models/User.js";
import { Session } from "../src/models/Session.js";
import { EmailVerificationToken, PasswordResetToken } from "../src/models/Tokens.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { SecurityAlert } from "../src/models/Security.js";
import { setEmailTransportForTests, type DeliveryReceipt, type EmailMessage } from "../src/email/delivery.js";
import { hashPassword } from "../src/security/password.js";
import { randomToken, sha256 } from "../src/security/crypto.js";

const password = "Invitation-Test9!";
const delivered: EmailMessage[] = [];
const acceptedReceipt = (overrides: Partial<DeliveryReceipt> = {}): DeliveryReceipt => ({
  acceptedRecipientCount: 1, rejectedRecipientCount: 0, pendingRecipientCount: 0,
  smtpStatus: "250", category: "ACCEPTED", messageIdHash: "a".repeat(64),
  deliveredAt: "2026-07-24T12:00:00.000Z", ...overrides,
});
const capture = { send: (message: EmailMessage) => { delivered.push(message); return Promise.resolve(acceptedReceipt()); } };

beforeAll(async () => { if (!mongoose.connection.readyState) await mongoose.connect(process.env.MONGODB_URI!); });
beforeEach(async () => {
  await mongoose.connection.db!.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
  delivered.splice(0);
  setEmailTransportForTests(capture);
});
afterAll(async () => { setEmailTransportForTests(undefined); await mongoose.connection.db!.dropDatabase(); await mongoose.disconnect(); });

async function identity(role: Role, options: { mfaComplete?: boolean; status?: "ACTIVE" | "SUSPENDED" } = {}) {
  const now = new Date();
  const user = await User.create({
    fullName: `${role} Invitation Tester`, email: `${role.toLowerCase()}-${randomToken(4)}@example.test`,
    role, status: options.status ?? "ACTIVE", passwordHash: await hashPassword(password), emailVerifiedAt: now,
    passwordChangedAt: now, passwordExpiresAt: new Date(Date.now() + 86400000), mfaEnabled: role === "ADMIN",
  });
  const token = randomToken(); const csrf = randomToken();
  await Session.create({
    userId: user._id, tokenHash: sha256(token), csrfHash: sha256(csrf),
    expiresAt: new Date(Date.now() + 86400000), idleExpiresAt: new Date(Date.now() + 3600000),
    lastActivityAt: now, userAgent: "invitation-test", ipAddress: "127.0.0.1",
    mfaComplete: options.mfaComplete ?? role === "ADMIN", freshUntil: new Date(Date.now() + 600000),
  });
  return { user, cookie: `eduflow_session=${token}`, csrf };
}
const payload = { fullName: "Invited Counsellor", email: "invited@example.test" };
const create = (auth: Awaited<ReturnType<typeof identity>>, body: Record<string, unknown> = payload) =>
  request(app).post("/api/v1/admin/users/counsellors").set("Cookie", auth.cookie).set("Origin", "http://localhost:3100").set("x-csrf-token", auth.csrf).send(body);

describe("administrator counsellor invitations", () => {
  it("creates a fixed-role counsellor and sends no password or token through the API", async () => {
    const admin = await identity("ADMIN");
    const response = await create(admin).expect(201);
    expect(response.body).toMatchObject({ user: { role: "COUNSELLOR", email: "invited@example.test", status: "ACTIVE" } });
    expect(JSON.stringify(response.body)).not.toMatch(/token|password|https?:\/\//i);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ type: "COUNSELLOR_INVITATION", to: "invited@example.test" });
    expect(delivered[0]!.link).toMatch(/\/accept-invitation\?verification=.+&setup=.+/);
    expect(await EmailVerificationToken.countDocuments()).toBe(1);
    expect(await PasswordResetToken.countDocuments()).toBe(1);
    expect(await AuditLog.countDocuments({ event: "COUNSELLOR_CREATED", subjectId: response.body.user.id })).toBe(1);
    expect(await AuditLog.countDocuments({ event: "COUNSELLOR_INVITATION_SENT", subjectId: response.body.user.id })).toBe(1);
    const receiptAudit = await AuditLog.findOne({ event: "COUNSELLOR_INVITATION_SENT", subjectId: response.body.user.id }).lean();
    expect(receiptAudit?.metadata).toMatchObject({
      acceptedRecipientCount: 1, rejectedRecipientCount: 0, pendingRecipientCount: 0,
      smtpStatus: "250", deliveryCategory: "ACCEPTED", messageIdHash: "a".repeat(64),
    });
    expect(JSON.stringify(receiptAudit)).not.toMatch(/invited@example|accept-invitation|verification|setup/i);
    const details = await request(app).get(`/api/v1/admin/users/${response.body.user.id}`)
      .set("Cookie", admin.cookie).set("Origin", "http://localhost:3100").expect(200);
    const deliveryEvent = details.body.recentEvents.find((event: { event: string }) => event.event === "COUNSELLOR_INVITATION_SENT");
    expect(deliveryEvent.delivery).toMatchObject({
      category: "ACCEPTED", acceptedRecipientCount: 1, rejectedRecipientCount: 0,
      pendingRecipientCount: 0, smtpStatus: "250",
    });
    expect(deliveryEvent.delivery.messageIdHash).toBe("a".repeat(64));
  });

  it("requires authentication, completed MFA, fresh ADMIN access and CSRF", async () => {
    const admin = await identity("ADMIN");
    await request(app).post("/api/v1/admin/users/counsellors").set("Cookie", admin.cookie).send(payload).expect(403);
    const noMfa = await identity("ADMIN", { mfaComplete: false });
    await create(noMfa, { ...payload, email: "no-mfa@example.test" }).expect(403);
    const student = await identity("STUDENT");
    await create(student, { ...payload, email: "student-denied@example.test" }).expect(403);
    const counsellor = await identity("COUNSELLOR");
    await create(counsellor, { ...payload, email: "counsellor-denied@example.test" }).expect(403);
    const suspended = await identity("ADMIN", { status: "SUSPENDED" });
    await create(suspended, { ...payload, email: "suspended-denied@example.test" }).expect(401);
  });

  it("rejects role/password mass assignment, invalid input and duplicate email", async () => {
    const admin = await identity("ADMIN");
    await create(admin, { ...payload, role: "ADMIN" }).expect(400);
    await create(admin, { ...payload, temporaryPassword: password }).expect(400);
    await create(admin, { fullName: "x", email: "invalid" }).expect(400);
    await create(admin, { fullName: "Bad\r\nName", email: "header@example.test" }).expect(400);
    await create(admin).expect(201);
    await create(admin).expect(409);
    expect(await User.countDocuments({ email: payload.email, role: "COUNSELLOR" })).toBe(1);
  });

  it("sanitizes SMTP failure, rolls back the provisional account and permits a safe retry", async () => {
    const admin = await identity("ADMIN");
    setEmailTransportForTests({ send: () => Promise.reject(new Error("provider password=secret token=secret")) });
    const response = await create(admin, { ...payload, email: "failure@example.test" }).expect(503);
    expect(JSON.stringify(response.body)).not.toMatch(/provider|secret|token/i);
    expect(response.body.error.code).toBe("EMAIL_DELIVERY_UNAVAILABLE");
    expect(await User.countDocuments({ email: "failure@example.test" })).toBe(0);
    expect(await EmailVerificationToken.countDocuments()).toBe(0);
    expect(await PasswordResetToken.countDocuments()).toBe(0);
    expect(await SecurityAlert.countDocuments({ type: "EMAIL_DELIVERY_FAILURE" })).toBe(1);
    expect(await AuditLog.countDocuments({ event: "COUNSELLOR_CREATED" })).toBe(0);
    expect(await AuditLog.countDocuments({ event: "COUNSELLOR_INVITATION_FAILED" })).toBe(1);
    setEmailTransportForTests(capture);
    await create(admin, { ...payload, email: "failure@example.test" }).expect(201);
    expect(await User.countDocuments({ email: "failure@example.test", role: "COUNSELLOR" })).toBe(1);
    expect(delivered).toHaveLength(1);
  });

  it("rejects stale MFA assurance, invalid CSRF, wrong Origin and excessive creation attempts", async () => {
    const admin = await identity("ADMIN");
    await Session.updateOne({ userId: admin.user._id }, { freshUntil: new Date(Date.now() - 1000) });
    expect((await create(admin, { ...payload, email: "stale@example.test" }).expect(403)).body.error.code).toBe("FRESH_AUTHENTICATION_REQUIRED");
    await Session.updateOne({ userId: admin.user._id }, { freshUntil: new Date(Date.now() + 600000) });
    await request(app).post("/api/v1/admin/users/counsellors").set("Cookie", admin.cookie).set("Origin", "http://localhost:3100").set("x-csrf-token", "invalid").send(payload).expect(403);
    await request(app).post("/api/v1/admin/users/counsellors").set("Cookie", admin.cookie).set("Origin", "http://evil.example").set("x-csrf-token", admin.csrf).send(payload).expect(403);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await create(admin, { ...payload, email: `limited-${attempt}@example.test` }).expect(201);
    }
    const limited = await create(admin, { ...payload, email: "limited-final@example.test" }).expect(429);
    expect(limited.body.error.code).toBe("COUNSELLOR_INVITATION_RATE_LIMITED");
  });

  it("resends only eligible invitations with generic, rate-limited responses", async () => {
    const admin = await identity("ADMIN");
    const created = await create(admin).expect(201);
    const originalVerification = await EmailVerificationToken.findOne();
    const originalSetup = await PasswordResetToken.findOne();
    delivered.splice(0);
    const resend = () => request(app).post(`/api/v1/admin/users/${created.body.user.id}/resend-invitation`).set("Cookie", admin.cookie).set("Origin", "http://localhost:3100").set("x-csrf-token", admin.csrf).send({});
    const response = await resend().expect(202);
    expect(response.body).toEqual({ message: "If the account is eligible, an invitation will be sent." });
    expect(delivered).toHaveLength(1);
    expect(await AuditLog.countDocuments({ event: "COUNSELLOR_INVITATION_SENT" })).toBe(2);
    expect((await EmailVerificationToken.findById(originalVerification!._id))!.usedAt).toBeInstanceOf(Date);
    expect((await PasswordResetToken.findById(originalSetup!._id))!.usedAt).toBeInstanceOf(Date);
    expect(await EmailVerificationToken.countDocuments({ usedAt: { $exists: false } })).toBe(1);
    expect(await PasswordResetToken.countDocuments({ usedAt: { $exists: false } })).toBe(1);
    for (let attempt = 0; attempt < 4; attempt += 1) await resend().expect(202);
    await resend().expect(429);
  });

  it.each([
    ["rejected", acceptedReceipt({ acceptedRecipientCount: 0, rejectedRecipientCount: 1, category: "REJECTED", smtpStatus: "550" })],
    ["pending", acceptedReceipt({ acceptedRecipientCount: 0, pendingRecipientCount: 1, category: "PENDING", smtpStatus: "450" })],
  ])("treats a %s provider result as unavailable and cleans up provisional state", async (_label, receipt) => {
    const admin = await identity("ADMIN");
    setEmailTransportForTests({ send: () => Promise.resolve(receipt) });
    const response = await create(admin).expect(503);
    expect(response.body.error.code).toBe("EMAIL_DELIVERY_UNAVAILABLE");
    expect(await User.countDocuments({ email: payload.email })).toBe(0);
    expect(await EmailVerificationToken.countDocuments()).toBe(0);
    expect(await PasswordResetToken.countDocuments()).toBe(0);
    const failure = await AuditLog.findOne({ event: "COUNSELLOR_INVITATION_FAILED" }).lean();
    expect(failure?.metadata).toMatchObject({ deliveryCategory: receipt.category, smtpStatus: receipt.smtpStatus });
    expect(JSON.stringify(failure)).not.toMatch(/invited@example|accept-invitation|message-id/i);
  });

  it("keeps current invitation tokens usable until a resend is accepted", async () => {
    const admin = await identity("ADMIN");
    const created = await create(admin).expect(201);
    const originalVerification = await EmailVerificationToken.findOne({ usedAt: { $exists: false } });
    const originalSetup = await PasswordResetToken.findOne({ usedAt: { $exists: false } });
    setEmailTransportForTests({ send: () => Promise.resolve(acceptedReceipt({
      acceptedRecipientCount: 0, pendingRecipientCount: 1, category: "PENDING", smtpStatus: "450",
    })) });
    const resend = () => request(app).post(`/api/v1/admin/users/${created.body.user.id}/resend-invitation`)
      .set("Cookie", admin.cookie).set("Origin", "http://localhost:3100").set("x-csrf-token", admin.csrf).send({});
    await resend().expect(202);
    expect((await EmailVerificationToken.findById(originalVerification!._id))!.usedAt).toBeUndefined();
    expect((await PasswordResetToken.findById(originalSetup!._id))!.usedAt).toBeUndefined();
    expect(await EmailVerificationToken.countDocuments({ usedAt: { $exists: false } })).toBe(1);
    expect(await PasswordResetToken.countDocuments({ usedAt: { $exists: false } })).toBe(1);

    setEmailTransportForTests(capture);
    await resend().expect(202);
    expect((await EmailVerificationToken.findById(originalVerification!._id))!.usedAt).toBeInstanceOf(Date);
    expect((await PasswordResetToken.findById(originalSetup!._id))!.usedAt).toBeInstanceOf(Date);
    expect(await EmailVerificationToken.countDocuments({ usedAt: { $exists: false } })).toBe(1);
    expect(await PasswordResetToken.countDocuments({ usedAt: { $exists: false } })).toBe(1);
  });

  it("supports verify, secure password setup and counsellor login", async () => {
    const admin = await identity("ADMIN");
    await create(admin).expect(201);
    const invitation = new URL(delivered[0]!.link);
    const verificationToken = invitation.searchParams.get("verification")!;
    const setupToken = invitation.searchParams.get("setup")!;
    await request(app).post("/api/v1/auth/verify-email").send({ token: verificationToken }).expect(200);
    const reset = await request(app).post("/api/v1/auth/reset-password").send({ token: setupToken, password, passwordConfirmation: password }).expect(200);
    expect(JSON.stringify(reset.body)).not.toContain(setupToken);
    expect(JSON.stringify(reset.body)).not.toContain(password);
    expect(JSON.stringify(reset.body)).not.toContain("http");
    const login = await request(app).post("/api/v1/auth/login").send({ email: payload.email, password }).expect(200);
    expect(login.body.user.role).toBe("COUNSELLOR");
  });
});
