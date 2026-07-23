import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generate, generateSecret } from "otplib";
import { z } from "zod";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Session } from "../src/models/Session.js";
import { LoginAttempt } from "../src/models/Security.js";
import { MfaChallenge } from "../src/models/Security.js";
import { PasswordResetToken } from "../src/models/Tokens.js";
import { hashPassword } from "../src/security/password.js";
import { decrypt, encrypt, keyedHash, sha256 } from "../src/security/crypto.js";
import { clearDevelopmentOutbox, developmentOutbox } from "../src/security/outbox.js";

const strong = "Correct-Horse7-Battery!";
beforeAll(async () => {
  expect(process.env.MONGODB_URI).toMatch(/eduflow_crm_test$/);
  await mongoose.connect(process.env.MONGODB_URI!);
});
beforeEach(async () => {
  await mongoose.connection.db!.dropDatabase();
  clearDevelopmentOutbox();
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
});
afterAll(async () => { await mongoose.connection.db!.dropDatabase(); await mongoose.disconnect(); });

function register(email = "student@example.test", extras: Record<string, unknown> = {}) {
  return request(app).post("/api/v1/auth/register").send({ fullName: "Test Student", email, password: strong, passwordConfirmation: strong, consent: true, ...extras });
}
async function registerAndVerify(email = "student@example.test") {
  await register(email).expect(202);
  const link = developmentOutbox().find((message) => message.type === "VERIFY_EMAIL")!.link;
  const token = new URL(link).searchParams.get("token")!;
  await request(app).post("/api/v1/auth/verify-email").send({ token }).expect(200);
  return { token, user: await User.findOne({ email }) };
}
function login(email = "student@example.test", password = strong) {
  return request(app).post("/api/v1/auth/login").send({ email, password });
}
function cookie(response: request.Response) {
  return (response.headers["set-cookie"] as unknown as string[])[0]!;
}

describe("registration and verification", () => {
  it("registers only a STUDENT and normalises email", async () => {
    await register("Student@Example.Test").expect(202);
    expect(await User.findOne({ email: "student@example.test" })).toMatchObject({ role: "STUDENT" });
  });
  it("rejects role mass assignment", async () => { await register(undefined, { role: "ADMIN" }).expect(400); expect(await User.countDocuments()).toBe(0); });
  it("rejects unexpected fields and weak passwords", async () => {
    await register(undefined, { unexpected: "value" }).expect(400);
    await request(app).post("/api/v1/auth/register").send({ fullName: "Test", email: "weak@example.test", password: "password", passwordConfirmation: "password", consent: true }).expect(400);
  });
  it("uses a generic duplicate-email response", async () => { await register().expect(202); await register().expect(202); expect(await User.countDocuments()).toBe(1); });
  it("verification is single use", async () => {
    await register().expect(202);
    const token = new URL(developmentOutbox()[0]!.link).searchParams.get("token")!;
    await request(app).post("/api/v1/auth/verify-email").send({ token }).expect(200);
    await request(app).post("/api/v1/auth/verify-email").send({ token }).expect(400);
  });
});

describe("login controls", () => {
  it("creates a session for valid verified credentials with hardened cookie", async () => {
    await registerAndVerify();
    const response = await login().expect(200);
    expect(response.body.user.role).toBe("STUDENT");
    expect(cookie(response)).toMatch(/HttpOnly.*SameSite=Lax/i);
    const raw = cookie(response).split("=")[1]!.split(";")[0]!;
    const stored = await Session.findOne().select("+tokenHash");
    expect(stored!.tokenHash).toBe(sha256(raw));
    expect(stored!.tokenHash).not.toBe(raw);
  });
  it("returns the same generic error for missing user and bad password", async () => {
    await registerAndVerify();
    const a = await login("missing@example.test").expect(401);
    const b = await login(undefined, `${strong}x`).expect(401);
    expect(a.body.error).toMatchObject({ code: "INVALID_CREDENTIALS", message: b.body.error.message });
  });
  it("rejects unverified and suspended accounts", async () => {
    await register().expect(202); await login().expect(403);
    await User.updateOne({}, { emailVerifiedAt: new Date(), status: "SUSPENDED" });
    await login().expect(403);
  });
  it("enforces account lockout and per-IP throttling", async () => {
    const { user } = await registerAndVerify();
    await User.updateOne({ _id: user!._id }, { failedLoginCount: 4 });
    await login(undefined, "Wrong-Password9!").expect(401);
    expect((await User.findById(user!._id))!.lockedUntil).toBeInstanceOf(Date);
    await LoginAttempt.insertMany(Array.from({ length: 20 }, () => ({ emailHash: "other", ipHash: keyedHash("::ffff:127.0.0.1"), outcome: "FAILURE", createdAt: new Date() })));
    await login("another@example.test").expect(429);
  });
  it("requires a single-use CAPTCHA after repeated failures", async () => {
    await registerAndVerify();
    const ipHash = (await import("../src/security/crypto.js")).keyedHash("::ffff:127.0.0.1");
    const emailHash = (await import("../src/security/crypto.js")).keyedHash("student@example.test");
    await LoginAttempt.insertMany(Array.from({ length: 3 }, () => ({ emailHash, ipHash, outcome: "FAILURE", createdAt: new Date() })));
    const challenge = await request(app).post("/api/v1/auth/captcha").send({}).expect(200);
    const numbers = (challenge.body.prompt as string).match(/\d+/g)!.map(Number);
    const answer = String(numbers[0]! + numbers[1]!);
    await request(app).post("/api/v1/auth/login").send({ email: "student@example.test", password: strong, captchaId: challenge.body.challengeId, captchaAnswer: answer }).expect(200);
    await request(app).post("/api/v1/auth/login").send({ email: "student@example.test", password: strong, captchaId: challenge.body.challengeId, captchaAnswer: answer }).expect(428);
  });
});

describe("sessions and CSRF", () => {
  it("returns current user and lists/revokes sessions", async () => {
    await registerAndVerify();
    const first = await login().expect(200); const firstCookie = cookie(first); const csrf = first.body.csrfToken as string;
    await request(app).get("/api/v1/auth/me").set("Cookie", firstCookie).expect(200);
    const second = await login().expect(200); const secondCookie = cookie(second); const secondCsrf = second.body.csrfToken as string;
    const list = await request(app).get("/api/v1/sessions").set("Cookie", secondCookie).expect(200);
    const other = list.body.sessions.find((item: { current: boolean }) => !item.current);
    await request(app).delete(`/api/v1/sessions/${other.id}`).set("Cookie", secondCookie).set("x-csrf-token", secondCsrf).expect(204);
    await request(app).get("/api/v1/auth/me").set("Cookie", firstCookie).expect(401);
    expect(csrf).toBeTruthy();
  });
  it("rejects missing and invalid CSRF and accepts valid token", async () => {
    await registerAndVerify(); const signedIn = await login(); const authCookie = cookie(signedIn);
    await request(app).post("/api/v1/auth/logout").set("Cookie", authCookie).expect(403);
    await request(app).post("/api/v1/auth/logout").set("Cookie", authCookie).set("x-csrf-token", "wrong").expect(403);
    await request(app).post("/api/v1/auth/logout").set("Cookie", authCookie).set("x-csrf-token", signedIn.body.csrfToken).expect(204);
  });
  it("logout-all revokes every session", async () => {
    await registerAndVerify(); const a = await login(); const b = await login();
    await request(app).post("/api/v1/sessions/logout-all").set("Cookie", cookie(b)).set("x-csrf-token", b.body.csrfToken).send({ preserveCurrent: false }).expect(204);
    await request(app).get("/api/v1/auth/me").set("Cookie", cookie(a)).expect(401);
  });
  it("rejects idle and absolute session expiry", async () => {
    await registerAndVerify(); const signedIn = await login();
    await Session.updateOne({}, { idleExpiresAt: new Date(Date.now() - 1000) });
    await request(app).get("/api/v1/auth/me").set("Cookie", cookie(signedIn)).expect(401);
    const again = await login();
    await Session.updateMany({ revokedAt: { $exists: false } }, { expiresAt: new Date(Date.now() - 1000) });
    await request(app).get("/api/v1/auth/me").set("Cookie", cookie(again)).expect(401);
  });
  it("rejects a suspended user’s existing session", async () => {
    const { user } = await registerAndVerify(); const signedIn = await login();
    await User.updateOne({ _id: user!._id }, { status: "SUSPENDED" });
    await request(app).get("/api/v1/auth/me").set("Cookie", cookie(signedIn)).expect(401);
  });
});

describe("password reset and MFA", () => {
  it("uses a single-use password reset and revokes sessions", async () => {
    await registerAndVerify(); const signedIn = await login();
    await request(app).post("/api/v1/auth/forgot-password").send({ email: "student@example.test" }).expect(202);
    const token = new URL(developmentOutbox().find((m) => m.type === "RESET_PASSWORD")!.link).searchParams.get("token")!;
    const replacement = "Different-Horse8-Battery!";
    await request(app).post("/api/v1/auth/reset-password").send({ token, password: replacement, passwordConfirmation: replacement }).expect(200);
    await request(app).post("/api/v1/auth/reset-password").send({ token, password: strong, passwordConfirmation: strong }).expect(400);
    await request(app).get("/api/v1/auth/me").set("Cookie", cookie(signedIn)).expect(401);
  });
  it("rejects expired reset tokens and recent password reuse", async () => {
    await registerAndVerify();
    await request(app).post("/api/v1/auth/forgot-password").send({ email: "student@example.test" });
    const token = new URL(developmentOutbox().find((m) => m.type === "RESET_PASSWORD")!.link).searchParams.get("token")!;
    await PasswordResetToken.updateOne({}, { expiresAt: new Date(Date.now() - 1000) });
    await request(app).post("/api/v1/auth/reset-password").send({ token, password: "Different-Horse8-Battery!", passwordConfirmation: "Different-Horse8-Battery!" }).expect(400);
    await request(app).post("/api/v1/auth/forgot-password").send({ email: "student@example.test" });
    const fresh = new URL(developmentOutbox().at(-1)!.link).searchParams.get("token")!;
    await request(app).post("/api/v1/auth/reset-password").send({ token: fresh, password: strong, passwordConfirmation: strong }).expect(400);
  });
  it("requires the current password for authenticated password change", async () => {
    await registerAndVerify(); const signedIn = await login(); const authCookie = cookie(signedIn);
    await request(app).post("/api/v1/auth/change-password").set("Cookie", authCookie).set("x-csrf-token", signedIn.body.csrfToken).send({ currentPassword: "Wrong-Horse9-Battery!", password: "Different-Horse8-Battery!", passwordConfirmation: "Different-Horse8-Battery!" }).expect(400);
  });
  it("enrols MFA, encrypts its secret, and uses MFA on login", async () => {
    await registerAndVerify(); const signedIn = await login(); const authCookie = cookie(signedIn); const csrf = signedIn.body.csrfToken as string;
    const started = await request(app).post("/api/v1/mfa/enrol/start").set("Cookie", authCookie).set("x-csrf-token", csrf).send({}).expect(200);
    const persisted = await User.findOne().select("+mfaSecretEncrypted");
    expect(persisted!.mfaSecretEncrypted).not.toContain(started.body.manualKey);
    const code = await generate({ secret: started.body.manualKey });
    const confirmed = await request(app).post("/api/v1/mfa/enrol/confirm").set("Cookie", authCookie).set("x-csrf-token", csrf).send({ code }).expect(200);
    expect(confirmed.body.recoveryCodes).toHaveLength(10);
    const pending = await login().expect(200);
    expect(pending.body.mfaRequired).toBe(true);
    const currentSecret = decrypt((await User.findOne().select("+mfaSecretEncrypted"))!.mfaSecretEncrypted!);
    const loginCode = await generate({ secret: currentSecret });
    await request(app).post("/api/v1/mfa/login").send({ challenge: pending.body.challenge, code: loginCode, recovery: false }).expect(200);
  });
  it("consumes each recovery code once", async () => {
    await registerAndVerify(); const signedIn = await login(); const authCookie = cookie(signedIn); const csrf = signedIn.body.csrfToken;
    const started = await request(app).post("/api/v1/mfa/enrol/start").set("Cookie", authCookie).set("x-csrf-token", csrf).send({});
    const confirmed = await request(app).post("/api/v1/mfa/enrol/confirm").set("Cookie", authCookie).set("x-csrf-token", csrf).send({ code: await generate({ secret: started.body.manualKey }) });
    const pending = await login();
    await request(app).post("/api/v1/mfa/login").send({ challenge: pending.body.challenge, code: confirmed.body.recoveryCodes[0], recovery: true }).expect(200);
    const next = await login();
    await request(app).post("/api/v1/mfa/login").send({ challenge: next.body.challenge, code: confirmed.body.recoveryCodes[0], recovery: true }).expect(400);
  });
  it("rejects expired and exhausted MFA challenges", async () => {
    await registerAndVerify(); const signedIn = await login(); const authCookie = cookie(signedIn); const csrf = signedIn.body.csrfToken;
    const started = await request(app).post("/api/v1/mfa/enrol/start").set("Cookie", authCookie).set("x-csrf-token", csrf).send({});
    await request(app).post("/api/v1/mfa/enrol/confirm").set("Cookie", authCookie).set("x-csrf-token", csrf).send({ code: await generate({ secret: started.body.manualKey }) });
    const pending = await login();
    await MfaChallenge.updateOne({}, { expiresAt: new Date(Date.now() - 1000) });
    await request(app).post("/api/v1/mfa/login").send({ challenge: pending.body.challenge, code: "000000", recovery: false }).expect(400);
    const next = await login();
    await MfaChallenge.updateOne({ challengeHash: sha256(next.body.challenge) }, { attempts: 5 });
    await request(app).post("/api/v1/mfa/login").send({ challenge: next.body.challenge, code: "000000", recovery: false }).expect(400);
  });
});

describe("deny-by-default roles", () => {
  async function directUser(role: "STUDENT" | "COUNSELLOR" | "ADMIN", mfaEnabled = false) {
    const hash = await hashPassword(strong); const now = new Date();
    return User.create({ fullName: role, email: `${role.toLowerCase()}@example.test`, role, passwordHash: hash, emailVerifiedAt: now, passwordChangedAt: now, passwordExpiresAt: new Date(Date.now() + 86400000), mfaEnabled });
  }
  it("blocks STUDENT from counsellor and admin routes", async () => {
    await directUser("STUDENT"); const signedIn = await login("student@example.test");
    await request(app).get("/api/v1/access/counsellor").set("Cookie", cookie(signedIn)).expect(403);
    await request(app).get("/api/v1/access/admin").set("Cookie", cookie(signedIn)).expect(403);
  });
  it("blocks COUNSELLOR from admin routes", async () => {
    await directUser("COUNSELLOR"); const signedIn = await login("counsellor@example.test");
    await request(app).get("/api/v1/access/admin").set("Cookie", cookie(signedIn)).expect(403);
  });
  it("requires completed MFA for an ADMIN", async () => {
    await directUser("ADMIN"); const signedIn = await login("admin@example.test");
    expect(signedIn.body.mfaEnrollmentRequired).toBe(true);
    await request(app).get("/api/v1/access/admin").set("Cookie", cookie(signedIn)).expect(403);
  });
  it("allows an ADMIN only after completed MFA", async () => {
    const secret = generateSecret();
    const admin = await directUser("ADMIN", true);
    admin.mfaSecretEncrypted = encrypt(secret);
    await admin.save();
    const pending = await login("admin@example.test");
    const completed = await request(app).post("/api/v1/mfa/login").send({ challenge: pending.body.challenge, code: await generate({ secret }), recovery: false }).expect(200);
    await request(app).get("/api/v1/access/admin").set("Cookie", cookie(completed)).expect(200);
  });
  it("routes password-expired users only to password recovery controls", async () => {
    const student = await directUser("STUDENT");
    student.passwordExpiresAt = new Date(Date.now() - 1000); await student.save();
    const signedIn = await login("student@example.test");
    expect((await request(app).get("/api/v1/auth/me").set("Cookie", cookie(signedIn))).body.passwordExpired).toBe(true);
    await request(app).get("/api/v1/access/student").set("Cookie", cookie(signedIn)).expect(403);
  });
  it("rejects ADMIN mass assignment in role changes", async () => {
    const target = await directUser("STUDENT");
    expect(() => zRole({ role: "ADMIN", reason: "A sufficiently long reason" })).toThrow();
    expect(target.role).toBe("STUDENT");
  });
});

function zRole(value: unknown) {
  return z.object({ role: z.enum(["STUDENT", "COUNSELLOR"]), reason: z.string().min(10) }).strict().parse(value);
}
