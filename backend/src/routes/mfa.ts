import { Router } from "express";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { z } from "zod";
import { LoginAttempt, MfaChallenge, SecurityAlert } from "../models/Security.js";
import { User } from "../models/User.js";
import { requireAuthentication, requireFreshAuthentication } from "../middleware/auth.js";
import { strictBody } from "../security/validation.js";
import { decrypt, encrypt, keyedHash, randomToken, sha256 } from "../security/crypto.js";
import { ApiError } from "../errors.js";
import { audit } from "../security/audit.js";
import { createSession, rotateSession } from "../security/session.js";
import { verifyPassword } from "../security/password.js";
import { AuditLog } from "../models/AuditLog.js";

export const mfaRouter = Router();

mfaRouter.post("/login", async (req, res) => {
  const input = strictBody(z.object({ challenge: z.string().min(20), code: z.string().min(6).max(32), recovery: z.boolean().default(false) }).strict(), req.body);
  const challenge = await MfaChallenge.findOne({ challengeHash: sha256(input.challenge), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).select("+challengeHash");
  if (!challenge || challenge.attempts >= 5) throw new ApiError(400, "INVALID_MFA_CHALLENGE", "MFA challenge is invalid or expired");
  const user = await User.findById(challenge.userId).select("+mfaSecretEncrypted +recoveryCodeHashes");
  if (!user?.mfaSecretEncrypted || !user.mfaEnabled) throw new ApiError(400, "INVALID_MFA_CHALLENGE", "MFA challenge is invalid or expired");
  const since = new Date(Date.now() - 15 * 60_000);
  const emailHash = keyedHash(user.email);
  const ipHash = keyedHash(req.ip ?? "");
  const attempts = await LoginAttempt.countDocuments({
    $or: [{ emailHash }, { ipHash }],
    outcome: "MFA_FAILURE",
    createdAt: { $gte: since },
  });
  if (attempts >= 5) {
    const recorded = await AuditLog.exists({ event: "MFA_RATE_LIMIT", ipHash, subjectId: user._id, createdAt: { $gte: since } });
    if (!recorded) await audit(req, "MFA_RATE_LIMIT", { subjectId: user._id, metadata: { windowMinutes: 15, threshold: 5 } });
    throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many attempts. Try again later.");
  }
  let valid = false;
  if (input.recovery) {
    const hash = sha256(input.code.trim().toUpperCase());
    const index = user.recoveryCodeHashes.indexOf(hash);
    if (index >= 0) {
      valid = true;
      user.recoveryCodeHashes.splice(index, 1);
      await user.save();
      await audit(req, "RECOVERY_CODE_USE", { subjectId: user._id });
    }
  } else {
    let secret: string;
    try {
      secret = decrypt(user.mfaSecretEncrypted);
    } catch {
      throw new ApiError(
        409,
        "MFA_REENROLMENT_REQUIRED",
        "MFA configuration requires secure re-enrolment. Use a recovery code, or reset your password to continue securely.",
      );
    }
    valid = (await verify({ secret, token: input.code })).valid;
  }
  if (!valid) {
    await LoginAttempt.create({ emailHash, ipHash, outcome: "MFA_FAILURE" });
    challenge.attempts += 1;
    if (challenge.attempts >= 5) challenge.usedAt = new Date();
    await challenge.save();
    throw new ApiError(400, "INVALID_MFA_CODE", "The verification code is invalid");
  }
  challenge.usedAt = new Date();
  await challenge.save();
  const { csrf } = await createSession(req, res, user, true);
  await audit(req, "MFA_LOGIN", { subjectId: user._id });
  await audit(req, "SESSION_CREATION", { subjectId: user._id });
  res.json({ user: { id: String(user._id), fullName: user.fullName, email: user.email, role: user.role, mfaEnabled: true }, csrfToken: csrf });
});

mfaRouter.post("/enrol/start", requireAuthentication, requireFreshAuthentication, async (req, res) => {
  const user = await User.findById(req.auth!.user._id).select("+mfaSecretEncrypted");
  if (!user || user.mfaEnabled) throw new ApiError(409, "MFA_ALREADY_ENABLED", "MFA is already enabled");
  const secret = generateSecret();
  user.mfaSecretEncrypted = encrypt(secret);
  await user.save();
  const uri = generateURI({ issuer: "EduFlow", label: user.email, secret });
  const qrCode = await QRCode.toDataURL(uri, { errorCorrectionLevel: "M" });
  res.json({ qrCode, manualKey: secret });
});

mfaRouter.post("/enrol/confirm", requireAuthentication, requireFreshAuthentication, async (req, res) => {
  const { code } = strictBody(z.object({ code: z.string().regex(/^\d{6}$/) }).strict(), req.body);
  const user = await User.findById(req.auth!.user._id).select("+mfaSecretEncrypted +recoveryCodeHashes");
  if (!user?.mfaSecretEncrypted || user.mfaEnabled) throw new ApiError(400, "MFA_ENROLMENT_NOT_STARTED", "Start MFA enrolment first");
  if (!(await verify({ secret: decrypt(user.mfaSecretEncrypted), token: code })).valid) throw new ApiError(400, "INVALID_MFA_CODE", "The verification code is invalid");
  const recoveryCodes = Array.from({ length: 10 }, () => `${randomToken(6).slice(0, 4)}-${randomToken(6).slice(0, 4)}`.toUpperCase());
  user.recoveryCodeHashes = recoveryCodes.map((item) => sha256(item));
  user.mfaEnabled = true;
  await user.save();
  const { csrf } = await rotateSession(req, res, req.auth!.session._id, user, true);
  await SecurityAlert.create({ userId: user._id, type: "MFA_ENABLED", severity: "MEDIUM", metadata: {} });
  await audit(req, "MFA_ENROLMENT", { actorId: user._id });
  const recoveryRequired = await AuditLog.exists({
    subjectId: user._id,
    event: "MFA_RECOVERY_REENROLMENT_REQUIRED",
    createdAt: { $gte: user.passwordChangedAt },
  });
  if (recoveryRequired) await audit(req, "MFA_RECOVERY_REENROLMENT_COMPLETED", { actorId: user._id, subjectId: user._id });
  res.json({ recoveryCodes, csrfToken: csrf });
});

mfaRouter.post("/recovery-codes", requireAuthentication, requireFreshAuthentication, async (req, res) => {
  if (!req.auth!.session.mfaComplete) throw new ApiError(403, "MFA_REQUIRED", "MFA verification is required");
  const user = await User.findById(req.auth!.user._id).select("+recoveryCodeHashes");
  if (!user?.mfaEnabled) throw new ApiError(400, "MFA_NOT_ENABLED", "MFA is not enabled");
  const recoveryCodes = Array.from({ length: 10 }, () => `${randomToken(6).slice(0, 4)}-${randomToken(6).slice(0, 4)}`.toUpperCase());
  user.recoveryCodeHashes = recoveryCodes.map((item) => sha256(item));
  await user.save();
  await audit(req, "RECOVERY_CODES_REGENERATED", { actorId: user._id });
  res.json({ recoveryCodes });
});

mfaRouter.post("/disable", requireAuthentication, requireFreshAuthentication, async (req, res) => {
  const input = strictBody(z.object({ password: z.string().min(1).max(128), code: z.string().min(6).max(32) }).strict(), req.body);
  const user = await User.findById(req.auth!.user._id).select("+passwordHash +mfaSecretEncrypted +recoveryCodeHashes");
  if (!user?.mfaEnabled || !user.mfaSecretEncrypted) throw new ApiError(400, "MFA_NOT_ENABLED", "MFA is not enabled");
  if (user.role === "ADMIN") throw new ApiError(403, "ADMIN_MFA_REQUIRED", "Administrator MFA cannot be disabled");
  const [passwordValid, otpResult] = await Promise.all([
    verifyPassword(user.passwordHash, input.password),
    verify({ secret: decrypt(user.mfaSecretEncrypted), token: input.code }),
  ]);
  if (!passwordValid || !otpResult.valid) throw new ApiError(400, "MFA_DISABLE_REJECTED", "Password or MFA code is invalid");
  user.mfaEnabled = false;
  user.mfaSecretEncrypted = undefined;
  user.recoveryCodeHashes = [];
  await user.save();
  await SecurityAlert.create({ userId: user._id, type: "MFA_DISABLED", severity: "HIGH", metadata: {} });
  await audit(req, "MFA_DISABLE", { actorId: user._id });
  res.json({ message: "MFA disabled." });
});
