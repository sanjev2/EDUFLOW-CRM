import { Router } from "express";
import { z } from "zod";
import { User } from "../models/User.js";
import { EmailVerificationToken, PasswordResetToken } from "../models/Tokens.js";
import { CaptchaChallenge } from "../models/CaptchaChallenge.js";
import { LoginAttempt, MfaChallenge, SecurityAlert } from "../models/Security.js";
import { strictBody, email, strongPassword } from "../security/validation.js";
import { hashPassword, passwordWasReused, recordPassword, verifyPassword } from "../security/password.js";
import { keyedHash, randomToken, sha256 } from "../security/crypto.js";
import { audit } from "../security/audit.js";
import { deliveryReceiptMetadata, providerAccepted, sendEmailVerification, sendPasswordReset, type DeliveryReceipt } from "../email/delivery.js";
import { ApiError } from "../errors.js";
import { clearSessionCookie, createSession, rotateSession } from "../security/session.js";
import { requireAuthentication, requireFreshAuthentication } from "../middleware/auth.js";
import { Session } from "../models/Session.js";
import { config } from "../config.js";

export const authRouter = Router();
const genericVerificationMessage = "If the account is eligible, verification instructions will be sent.";
const genericResetMessage = "If the account exists, password reset instructions will be sent.";
const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email,
  password: strongPassword,
  passwordConfirmation: z.string(),
  consent: z.literal(true),
}).strict().refine((value) => value.password === value.passwordConfirmation, { path: ["passwordConfirmation"], message: "Passwords do not match" });

authRouter.post("/register", async (req, res) => {
  const input = strictBody(registerSchema, req.body);
  const passwordHash = await hashPassword(input.password);
  try {
    const now = new Date();
    const user = await User.create({
      fullName: input.fullName, email: input.email, passwordHash, role: "STUDENT", consentAt: now,
      passwordChangedAt: now, passwordExpiresAt: new Date(now.getTime() + config.PASSWORD_MAX_AGE_DAYS * 86400000),
    });
    await recordPassword(user._id, passwordHash);
    const token = randomToken();
    const verification = await EmailVerificationToken.create({ userId: user._id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 24 * 3600000) });
    let receipt: DeliveryReceipt | undefined;
    try {
      receipt = await sendEmailVerification({ email: user.email, fullName: user.fullName, token });
    } catch {
      receipt = undefined;
    }
    if (!receipt || !providerAccepted(receipt)) {
      verification.usedAt = new Date(); await verification.save();
      const metadata = { purpose: "verification", ...(receipt ? deliveryReceiptMetadata(receipt) : { deliveryCategory: "LOCAL_FAILURE" }) };
      await Promise.all([
        SecurityAlert.create({ userId: user._id, type: "EMAIL_DELIVERY_FAILURE", severity: "MEDIUM", metadata }),
        audit(req, "EMAIL_DELIVERY_FAILURE", { subjectId: user._id, metadata }),
      ]);
    }
    await audit(req, "REGISTRATION", { subjectId: user._id, metadata: receipt ? deliveryReceiptMetadata(receipt) : { deliveryCategory: "LOCAL_FAILURE" } });
  } catch (error: unknown) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000)) throw error;
  }
  res.status(202).json({ message: genericVerificationMessage });
});

authRouter.post("/resend-verification", async (req, res) => {
  const input = strictBody(z.object({ email }).strict(), req.body);
  const emailHash = keyedHash(input.email); const ipHash = keyedHash(req.ip ?? "");
  const since = new Date(Date.now() - 15 * 60000);
  const attempts = await LoginAttempt.countDocuments({ $or: [{ emailHash }, { ipHash }], outcome: "VERIFICATION_RESEND", createdAt: { $gte: since } });
  if (attempts >= 5) throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many requests. Try again later.");
  await LoginAttempt.create({ emailHash, ipHash, outcome: "VERIFICATION_RESEND" });
  const user = await User.findOne({ email: input.email, emailVerifiedAt: { $exists: false }, status: "ACTIVE" });
  if (user) {
    const token = randomToken();
    const record = await EmailVerificationToken.create({ userId: user._id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 24 * 3600000) });
    let receipt: DeliveryReceipt | undefined;
    try {
      receipt = await sendEmailVerification({ email: user.email, fullName: user.fullName, token });
    } catch {
      receipt = undefined;
    }
    if (!receipt || !providerAccepted(receipt)) {
      record.usedAt = new Date(); await record.save();
      const metadata = { purpose: "verification", ...(receipt ? deliveryReceiptMetadata(receipt) : { deliveryCategory: "LOCAL_FAILURE" }) };
      await Promise.all([
        SecurityAlert.create({ userId: user._id, type: "EMAIL_DELIVERY_FAILURE", severity: "MEDIUM", metadata }),
        audit(req, "EMAIL_DELIVERY_FAILURE", { subjectId: user._id, metadata }),
        audit(req, "EMAIL_VERIFICATION_RESEND", { subjectId: user._id, metadata }),
      ]);
    } else {
      await EmailVerificationToken.updateMany({ userId: user._id, _id: { $ne: record._id }, usedAt: { $exists: false } }, { usedAt: new Date() });
      await audit(req, "EMAIL_VERIFICATION_RESEND", { subjectId: user._id, metadata: deliveryReceiptMetadata(receipt) });
    }
  }
  res.status(202).json({ message: genericVerificationMessage });
});

authRouter.post("/verify-email", async (req, res) => {
  const { token } = strictBody(z.object({ token: z.string().min(20).max(500) }).strict(), req.body);
  const record = await EmailVerificationToken.findOne({ tokenHash: sha256(token), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).select("+tokenHash");
  if (!record) throw new ApiError(400, "INVALID_TOKEN", "The verification link is invalid or expired");
  const used = await EmailVerificationToken.updateOne({ _id: record._id, usedAt: { $exists: false } }, { usedAt: new Date() });
  if (!used.modifiedCount) throw new ApiError(400, "INVALID_TOKEN", "The verification link is invalid or expired");
  await User.updateOne({ _id: record.userId, emailVerifiedAt: { $exists: false } }, { emailVerifiedAt: new Date() });
  await audit(req, "EMAIL_VERIFICATION", { subjectId: record.userId });
  res.json({ message: "Email verified successfully." });
});

authRouter.post("/captcha", async (req, res) => {
  const a = Math.floor(Math.random() * 8) + 1;
  const b = Math.floor(Math.random() * 8) + 1;
  const challengeId = randomToken(18);
  await CaptchaChallenge.create({ challengeId, answerHash: keyedHash(String(a + b)), ipHash: keyedHash(req.ip ?? ""), expiresAt: new Date(Date.now() + 5 * 60000) });
  await audit(req, "CAPTCHA_CHALLENGE");
  res.json({ challengeId, prompt: `What is ${a} + ${b}?`, expiresInSeconds: 300 });
});

async function validateCaptcha(req: Parameters<typeof keyedHash>[0] extends never ? never : import("express").Request, challengeId?: string, answer?: string) {
  if (!challengeId || !answer) return false;
  const challenge = await CaptchaChallenge.findOne({ challengeId, ipHash: keyedHash(req.ip ?? ""), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).select("+answerHash");
  if (!challenge) return false;
  challenge.usedAt = new Date();
  await challenge.save();
  return challenge.answerHash === keyedHash(answer.trim());
}

const invalidCredentials = () => new ApiError(401, "INVALID_CREDENTIALS", "Email or password is invalid");
authRouter.post("/login", async (req, res) => {
  const input = strictBody(z.object({ email, password: z.string().min(1).max(128), captchaId: z.string().optional(), captchaAnswer: z.string().optional() }).strict(), req.body);
  const emailHash = keyedHash(input.email);
  const ipHash = keyedHash(req.ip ?? "");
  const since = new Date(Date.now() - 15 * 60000);
  const [accountFailures, ipFailures] = await Promise.all([
    LoginAttempt.countDocuments({ emailHash, outcome: "FAILURE", createdAt: { $gte: since } }),
    LoginAttempt.countDocuments({ ipHash, outcome: "FAILURE", createdAt: { $gte: since } }),
  ]);
  if (ipFailures >= 20) throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many attempts. Try again later.");
  if (accountFailures >= 3 && !(await validateCaptcha(req, input.captchaId, input.captchaAnswer))) {
    await LoginAttempt.create({ emailHash, ipHash, outcome: "CAPTCHA_FAILURE" });
    await audit(req, "CAPTCHA_FAILURE");
    throw new ApiError(428, "CAPTCHA_REQUIRED", "A CAPTCHA challenge is required");
  }
  const user = await User.findOne({ email: input.email }).select("+passwordHash +failedLoginCount +mfaSecretEncrypted +recoveryCodeHashes");
  const valid = user ? await verifyPassword(user.passwordHash, input.password) : false;
  if (!user || !valid) {
    await LoginAttempt.create({ emailHash, ipHash, outcome: "FAILURE" });
    if (user) {
      user.failedLoginCount += 1;
      if (user.failedLoginCount >= 5) {
        user.lockedUntil = new Date(Date.now() + 15 * 60000);
        await SecurityAlert.create({ userId: user._id, type: "ACCOUNT_LOCKOUT", severity: "HIGH", metadata: {} });
        await audit(req, "ACCOUNT_LOCKOUT", { subjectId: user._id });
      }
      await user.save();
    }
    await audit(req, "LOGIN_FAILURE", { subjectId: user?._id });
    if (accountFailures >= 1) await new Promise((resolve) => setTimeout(resolve, Math.min(1000, accountFailures * 200)));
    throw invalidCredentials();
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) throw invalidCredentials();
  if (!user.emailVerifiedAt) throw new ApiError(403, "EMAIL_VERIFICATION_REQUIRED", "Email verification is required");
  if (user.status !== "ACTIVE") throw new ApiError(403, "ACCOUNT_UNAVAILABLE", "This account is unavailable");
  user.failedLoginCount = 0;
  user.lockedUntil = undefined;
  user.lastAuthenticatedAt = new Date();
  await user.save();
  await LoginAttempt.create({ emailHash, ipHash, outcome: "SUCCESS" });
  if (user.mfaEnabled) {
    if (req.auth) {
      await Session.updateOne({ _id: req.auth.session._id }, { revokedAt: new Date() });
      clearSessionCookie(res);
    }
    const challengeToken = randomToken();
    await MfaChallenge.create({ userId: user._id, challengeHash: sha256(challengeToken), expiresAt: new Date(Date.now() + 5 * 60000), attempts: 0 });
    await audit(req, "LOGIN_SUCCESS", { subjectId: user._id, metadata: { mfaPending: true } });
    return res.json({ mfaRequired: true, challenge: challengeToken });
  }
  const { csrf } = req.auth
    ? await rotateSession(req, res, req.auth.session._id, user, user.role !== "ADMIN")
    : await createSession(req, res, user, user.role !== "ADMIN");
  await audit(req, "LOGIN_SUCCESS", { subjectId: user._id });
  await audit(req, "SESSION_CREATION", { subjectId: user._id });
  res.json({ user: safeUser(user), csrfToken: csrf, mfaEnrollmentRequired: user.role === "ADMIN" });
});

authRouter.get("/me", requireAuthentication, (req, res) => {
  res.json({ user: safeUser(req.auth!.user), passwordExpired: req.auth!.user.passwordExpiresAt <= new Date(), mfaComplete: req.auth!.session.mfaComplete });
});
authRouter.get("/csrf", requireAuthentication, async (req, res) => {
  const token = randomToken();
  req.auth!.session.csrfHash = sha256(token);
  await req.auth!.session.save();
  res.json({ csrfToken: token });
});
authRouter.post("/logout", requireAuthentication, async (req, res) => {
  await Session.updateOne({ _id: req.auth!.session._id }, { revokedAt: new Date() });
  clearSessionCookie(res);
  await audit(req, "LOGOUT", { actorId: req.auth!.user._id });
  res.status(204).end();
});

authRouter.post("/forgot-password", async (req, res) => {
  const input = strictBody(z.object({ email }).strict(), req.body);
  const emailHash = keyedHash(input.email); const ipHash = keyedHash(req.ip ?? "");
  const since = new Date(Date.now() - 15 * 60000);
  const attempts = await LoginAttempt.countDocuments({ $or: [{ emailHash }, { ipHash }], outcome: "PASSWORD_RESET_REQUEST", createdAt: { $gte: since } });
  if (attempts >= 5) throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many requests. Try again later.");
  await LoginAttempt.create({ emailHash, ipHash, outcome: "PASSWORD_RESET_REQUEST" });
  const user = await User.findOne({ email: input.email, status: "ACTIVE", emailVerifiedAt: { $exists: true } });
  if (user) {
    const token = randomToken();
    const record = await PasswordResetToken.create({ userId: user._id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60000) });
    let receipt: DeliveryReceipt | undefined;
    try {
      receipt = await sendPasswordReset({ email: user.email, fullName: user.fullName, token });
    } catch {
      receipt = undefined;
    }
    if (!receipt || !providerAccepted(receipt)) {
      record.usedAt = new Date();
      await record.save();
      const metadata = { purpose: "password-reset", ...(receipt ? deliveryReceiptMetadata(receipt) : { deliveryCategory: "LOCAL_FAILURE" }) };
      await Promise.all([
        SecurityAlert.create({ userId: user._id, type: "EMAIL_DELIVERY_FAILURE", severity: "MEDIUM", metadata }),
        audit(req, "EMAIL_DELIVERY_FAILURE", { subjectId: user._id, metadata }),
        audit(req, "PASSWORD_RESET_REQUEST", { subjectId: user._id, metadata }),
      ]);
    } else {
      await PasswordResetToken.updateMany({ userId: user._id, _id: { $ne: record._id }, usedAt: { $exists: false } }, { usedAt: new Date() });
      await audit(req, "PASSWORD_RESET_REQUEST", { subjectId: user._id, metadata: deliveryReceiptMetadata(receipt) });
    }
  }
  res.status(202).json({ message: genericResetMessage });
});

authRouter.post("/reset-password", async (req, res) => {
  const input = strictBody(z.object({ token: z.string().min(20), password: strongPassword, passwordConfirmation: z.string() }).strict().refine((v) => v.password === v.passwordConfirmation, { path: ["passwordConfirmation"], message: "Passwords do not match" }), req.body);
  const record = await PasswordResetToken.findOne({ tokenHash: sha256(input.token), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).select("+tokenHash");
  if (!record) throw new ApiError(400, "INVALID_TOKEN", "The reset link is invalid or expired");
  if (await passwordWasReused(record.userId, input.password)) throw new ApiError(400, "PASSWORD_REUSED", "Choose a password not used recently");
  const user = await User.findById(record.userId).select("+passwordHash");
  if (!user) throw new ApiError(400, "INVALID_TOKEN", "The reset link is invalid or expired");
  const changed = await PasswordResetToken.updateOne({ _id: record._id, usedAt: { $exists: false } }, { usedAt: new Date() });
  if (!changed.modifiedCount) throw new ApiError(400, "INVALID_TOKEN", "The reset link is invalid or expired");
  const oldHash = user.passwordHash;
  const passwordHash = await hashPassword(input.password);
  user.passwordHash = passwordHash;
  user.passwordChangedAt = new Date();
  user.passwordExpiresAt = new Date(Date.now() + config.PASSWORD_MAX_AGE_DAYS * 86400000);
  await user.save();
  await recordPassword(user._id, oldHash);
  await recordPassword(user._id, passwordHash);
  await Session.updateMany({ userId: user._id, revokedAt: { $exists: false } }, { revokedAt: new Date() });
  await SecurityAlert.create({ userId: user._id, type: "PASSWORD_RESET", severity: "MEDIUM", metadata: {} });
  await audit(req, "PASSWORD_RESET", { subjectId: user._id });
  res.json({ message: "Password reset successfully. Sign in again." });
});

authRouter.post("/change-password", requireAuthentication, requireFreshAuthentication, async (req, res) => {
  const input = strictBody(z.object({ currentPassword: z.string().min(1).max(128), password: strongPassword, passwordConfirmation: z.string(), mfaCode: z.string().optional() }).strict().refine((v) => v.password === v.passwordConfirmation, { path: ["passwordConfirmation"], message: "Passwords do not match" }), req.body);
  const user = await User.findById(req.auth!.user._id).select("+passwordHash");
  if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) throw new ApiError(400, "INVALID_CURRENT_PASSWORD", "Current password is invalid");
  if (user.mfaEnabled && !req.auth!.session.mfaComplete) throw new ApiError(403, "MFA_REQUIRED", "MFA verification is required");
  if (await passwordWasReused(user._id, input.password)) throw new ApiError(400, "PASSWORD_REUSED", "Choose a password not used recently");
  const oldHash = user.passwordHash;
  user.passwordHash = await hashPassword(input.password);
  user.passwordChangedAt = new Date();
  user.passwordExpiresAt = new Date(Date.now() + config.PASSWORD_MAX_AGE_DAYS * 86400000);
  await user.save();
  await recordPassword(user._id, oldHash);
  await recordPassword(user._id, user.passwordHash);
  await Session.updateMany({ userId: user._id, _id: { $ne: req.auth!.session._id }, revokedAt: { $exists: false } }, { revokedAt: new Date() });
  const { csrf } = await rotateSession(req, res, req.auth!.session._id, user, req.auth!.session.mfaComplete);
  await audit(req, "PASSWORD_CHANGE", { actorId: user._id });
  res.json({ message: "Password changed successfully.", csrfToken: csrf });
});

export function safeUser(user: { _id: unknown; fullName: string; email: string; role: string; emailVerifiedAt?: Date; status: string; mfaEnabled: boolean; passwordExpiresAt: Date }) {
  return { id: String(user._id), fullName: user.fullName, email: user.email, role: user.role, emailVerified: Boolean(user.emailVerifiedAt), status: user.status, mfaEnabled: user.mfaEnabled, passwordExpiresAt: user.passwordExpiresAt };
}
