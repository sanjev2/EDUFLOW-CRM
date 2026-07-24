import request from "supertest";
import mongoose from "mongoose";
import { existsSync } from "node:fs";
import pino from "pino";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { parseConfig } from "../src/config.js";
import { sanitizeProviderReceipt, setEmailTransportForTests, verificationMessage, type DeliveryReceipt, type EmailMessage } from "../src/email/delivery.js";
import { User } from "../src/models/User.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { EmailVerificationToken, PasswordResetToken } from "../src/models/Tokens.js";
import { hashPassword } from "../src/security/password.js";
import { clearDevelopmentOutbox, developmentOutbox, developmentOutboxPath } from "../src/security/outbox.js";
import { loggerOptions } from "../src/logger.js";

const strong = "Correct-Horse7-Battery!";
const delivered: EmailMessage[] = [];
const receipt: DeliveryReceipt = {
  acceptedRecipientCount: 1, rejectedRecipientCount: 0, pendingRecipientCount: 0,
  smtpStatus: "250", category: "ACCEPTED", messageIdHash: "b".repeat(64),
  deliveredAt: "2026-07-24T12:00:00.000Z",
};
const capture = { send: (message: EmailMessage) => { delivered.push(message); return Promise.resolve(receipt); } };

beforeAll(async () => { if (!mongoose.connection.readyState) await mongoose.connect(process.env.MONGODB_URI!); });
beforeEach(async () => {
  await mongoose.connection.db!.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
  delivered.splice(0); clearDevelopmentOutbox(); setEmailTransportForTests(capture);
});
afterAll(async () => { setEmailTransportForTests(undefined); clearDevelopmentOutbox(); await mongoose.connection.db!.dropDatabase(); await mongoose.disconnect(); });

function register(email = "delivery@example.test", fullName = "Delivery Student") {
  return request(app).post("/api/v1/auth/register").send({ fullName, email, password: strong, passwordConfirmation: strong, consent: true });
}

async function verifiedUser(email = "verified@example.test") {
  const now = new Date();
  return User.create({ fullName: "Verified Student", email, role: "STUDENT", passwordHash: await hashPassword(strong), emailVerifiedAt: now, passwordChangedAt: now, passwordExpiresAt: new Date(Date.now() + 86400000) });
}

describe("email message delivery", () => {
  it("requests verification on registration without exposing its token", async () => {
    const response = await register().expect(202);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ type: "VERIFY_EMAIL", to: "delivery@example.test" });
    expect(delivered[0]!.link).toMatch(/^http:\/\/localhost:3100\/verify-email\?token=/);
    expect(delivered[0]!.text).toContain("24 hours");
    expect(delivered[0]!.html).toContain("expires in 24 hours");
    expect(JSON.stringify(response.body)).not.toContain("token");
    expect(JSON.stringify(response.body)).not.toContain("http");
  });

  it("delivers generic password recovery with text and HTML expiry guidance", async () => {
    await verifiedUser();
    const response = await request(app).post("/api/v1/auth/forgot-password").send({ email: "verified@example.test" }).expect(202);
    expect(delivered[0]).toMatchObject({ type: "RESET_PASSWORD" });
    expect(delivered[0]!.link).toMatch(/^http:\/\/localhost:3100\/reset-password\?token=/);
    expect(delivered[0]!.text).toContain("30 minutes");
    expect(delivered[0]!.html).toContain("password does not change until the link is used");
    expect(JSON.stringify(response.body)).not.toContain("token");
    expect((await AuditLog.findOne({ event: "PASSWORD_RESET_REQUEST" }))?.metadata).toMatchObject({
      deliveryCategory: "ACCEPTED", acceptedRecipientCount: 1, rejectedRecipientCount: 0, pendingRecipientCount: 0,
    });
  });

  it("escapes HTML and rejects recipient header injection", () => {
    const message = verificationMessage({ email: "safe@example.test", fullName: `<img src=x onerror="bad">`, token: "safe-token-value" });
    expect(message.html).toContain("&lt;img");
    expect(message.html).not.toContain("<img");
    expect(() => verificationMessage({ email: "safe@example.test\r\nBcc: attacker@example.test", fullName: "Safe", token: "safe-token-value" })).toThrow("Invalid email recipient");
    expect(() => verificationMessage({ email: "safe@example.test", fullName: "Safe\r\nBcc: attacker@example.test", token: "safe-token-value" })).toThrow("Invalid email recipient name");
  });

  it("sanitizes provider receipts and accepts only the intended envelope recipient", () => {
    const accepted = sanitizeProviderReceipt({
      accepted: ["intended@example.test"],
      rejected: [],
      pending: [],
      response: "250 2.0.0 queued as provider-private-reference",
      messageId: "<private-message-id@example.test>",
    }, "intended@example.test");
    expect(accepted).toMatchObject({
      category: "ACCEPTED", acceptedRecipientCount: 1, rejectedRecipientCount: 0,
      pendingRecipientCount: 0, smtpStatus: "250",
    });
    expect(accepted.messageIdHash).toMatch(/^[a-f\d]{64}$/);
    expect(JSON.stringify(accepted)).not.toMatch(/intended@example|provider-private|private-message-id/i);

    expect(sanitizeProviderReceipt({
      accepted: ["different@example.test"], rejected: [], pending: [], response: "250 accepted",
    }, "intended@example.test").category).toBe("REJECTED");
    expect(sanitizeProviderReceipt({
      accepted: [], rejected: [], pending: ["intended@example.test"], response: "450 pending",
    }, "intended@example.test")).toMatchObject({ category: "PENDING", pendingRecipientCount: 1, smtpStatus: "450" });
  });

  it("uses the development-only ignored outbox when no test transport is supplied", async () => {
    setEmailTransportForTests(undefined);
    await register("outbox@example.test").expect(202);
    expect(developmentOutbox()[0]).toMatchObject({ type: "VERIFY_EMAIL", developmentOnly: true });
    expect(existsSync(developmentOutboxPath())).toBe(true);
  });
});

describe("verification resend and failure controls", () => {
  it("returns the same generic response for eligible, verified and unknown accounts", async () => {
    await register("pending@example.test").expect(202); delivered.splice(0);
    await verifiedUser("done@example.test");
    const pending = await request(app).post("/api/v1/auth/resend-verification").send({ email: "pending@example.test" }).expect(202);
    const verified = await request(app).post("/api/v1/auth/resend-verification").send({ email: "done@example.test" }).expect(202);
    const unknown = await request(app).post("/api/v1/auth/resend-verification").send({ email: "unknown@example.test" }).expect(202);
    expect(pending.body).toEqual(verified.body);
    expect(verified.body).toEqual(unknown.body);
    expect(delivered).toHaveLength(1);
  });

  it("rate limits resend requests by normalized account and IP", async () => {
    for (let index = 0; index < 5; index += 1) await request(app).post("/api/v1/auth/resend-verification").send({ email: `unknown-${index}@example.test` }).expect(202);
    await request(app).post("/api/v1/auth/resend-verification").send({ email: "another@example.test" }).expect(429);
  });

  it("sanitizes SMTP failures and invalidates undelivered tokens", async () => {
    setEmailTransportForTests({ send: () => Promise.reject(new Error("smtp.internal.example user=secret password=secret")) });
    const response = await register("failure@example.test").expect(202);
    expect(JSON.stringify(response.body)).not.toContain("smtp.internal");
    const token = await EmailVerificationToken.findOne({}).select("+tokenHash");
    expect(token!.usedAt).toBeInstanceOf(Date);
    const audit = await AuditLog.findOne({ event: "EMAIL_DELIVERY_FAILURE" });
    expect(JSON.stringify(audit)).not.toContain("smtp.internal");
    expect(JSON.stringify(audit)).not.toContain("token");
  });

  it("treats a resolved provider rejection as failed registration delivery", async () => {
    setEmailTransportForTests({ send: () => Promise.resolve({
      ...receipt, acceptedRecipientCount: 0, rejectedRecipientCount: 1,
      category: "REJECTED", smtpStatus: "550",
    }) });
    await register("rejected@example.test").expect(202);
    expect((await EmailVerificationToken.findOne())!.usedAt).toBeInstanceOf(Date);
    expect((await AuditLog.findOne({ event: "EMAIL_DELIVERY_FAILURE" }))?.metadata)
      .toMatchObject({ deliveryCategory: "REJECTED", acceptedRecipientCount: 0, rejectedRecipientCount: 1 });
  });

  it("preserves an older verification token until a resend is accepted", async () => {
    await register("resend-pending@example.test").expect(202);
    const user = await User.findOne({ email: "resend-pending@example.test" });
    const previous = await EmailVerificationToken.findOne({ userId: user!._id });
    setEmailTransportForTests({ send: () => Promise.resolve({
      ...receipt, acceptedRecipientCount: 0, pendingRecipientCount: 1,
      category: "PENDING", smtpStatus: "450",
    }) });
    await request(app).post("/api/v1/auth/resend-verification").send({ email: user!.email }).expect(202);
    expect((await EmailVerificationToken.findById(previous!._id))!.usedAt).toBeUndefined();
    expect(await EmailVerificationToken.countDocuments({
      userId: user!._id, usedAt: { $exists: false }, expiresAt: { $gt: new Date() },
    })).toBe(1);
    expect((await AuditLog.findOne({ event: "EMAIL_VERIFICATION_RESEND" }))?.metadata)
      .toMatchObject({ deliveryCategory: "PENDING", pendingRecipientCount: 1 });
  });
});

describe("delivery configuration", () => {
  it("rejects production outbox and incomplete SMTP configuration", () => {
    expect(() => parseConfig({ ...process.env, NODE_ENV: "production", EMAIL_DELIVERY_MODE: "outbox" })).toThrow("Production requires SMTP");
    expect(() => parseConfig({ ...process.env, EMAIL_DELIVERY_MODE: "smtp", SMTP_HOST: "", SMTP_PORT: "", SMTP_SECURE: "", SMTP_USER: "", SMTP_PASSWORD: "", EMAIL_FROM_ADDRESS: "" })).toThrow("SMTP_HOST");
    expect(parseConfig({ ...process.env, EMAIL_DELIVERY_MODE: "smtp", SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "587", SMTP_SECURE: "false", SMTP_USER: "sender@example.test", SMTP_PASSWORD: "app-password-placeholder", EMAIL_FROM_ADDRESS: "sender@example.test" })).toMatchObject({ SMTP_PORT: 587, SMTP_SECURE: false });
  });

  it("does not leave unlimited reset tokens when delivery fails", async () => {
    await verifiedUser();
    setEmailTransportForTests({ send: () => Promise.reject(new Error("provider failure")) });
    await request(app).post("/api/v1/auth/forgot-password").send({ email: "verified@example.test" }).expect(202);
    expect((await PasswordResetToken.findOne())!.usedAt).toBeInstanceOf(Date);
  });

  it.each([
    ["rejected", { ...receipt, acceptedRecipientCount: 0, rejectedRecipientCount: 1, category: "REJECTED" as const, smtpStatus: "550" }],
    ["pending", { ...receipt, acceptedRecipientCount: 0, pendingRecipientCount: 1, category: "PENDING" as const, smtpStatus: "450" }],
  ])("preserves the previous reset token when delivery is %s", async (_label, result) => {
    const user = await verifiedUser();
    const previous = await PasswordResetToken.create({
      userId: user._id, tokenHash: "c".repeat(64), expiresAt: new Date(Date.now() + 30 * 60000),
    });
    setEmailTransportForTests({ send: () => Promise.resolve(result) });
    const response = await request(app).post("/api/v1/auth/forgot-password").send({ email: user.email }).expect(202);
    expect(response.body).toEqual({ message: "If the account exists, password reset instructions will be sent." });
    expect((await PasswordResetToken.findById(previous._id))!.usedAt).toBeUndefined();
    expect(await PasswordResetToken.countDocuments({ usedAt: { $exists: false }, expiresAt: { $gt: new Date() } })).toBe(1);
    const failure = await AuditLog.findOne({ event: "PASSWORD_RESET_REQUEST" }).lean();
    expect(failure?.metadata).toMatchObject({ deliveryCategory: result.category, smtpStatus: result.smtpStatus });
    expect(JSON.stringify(failure)).not.toMatch(/verified@example|reset-password|token/i);
  });

  it("redacts SMTP credentials, token URLs and message bodies from structured logs", () => {
    const output: string[] = [];
    const testLogger = pino({ ...loggerOptions, level: "info" }, { write: (chunk: string) => output.push(chunk) });
    testLogger.info({ SMTP_PASSWORD: "smtp-secret", SMTP_USER: "sender-secret", verificationToken: "verify-secret", resetToken: "reset-secret", message: { link: "http://localhost/token-secret", text: "token-secret", html: "<a>token-secret</a>" } }, "delivery metadata");
    const serialized = output.join("");
    for (const secret of ["smtp-secret", "sender-secret", "verify-secret", "reset-secret", "token-secret"]) expect(serialized).not.toContain(secret);
    expect(serialized).toContain("[REDACTED]");
  });
});
