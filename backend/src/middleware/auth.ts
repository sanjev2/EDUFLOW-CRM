import type { RequestHandler } from "express";
import { Session } from "../models/Session.js";
import { User, type Role } from "../models/User.js";
import { ApiError } from "../errors.js";
import { SESSION_COOKIE } from "../security/session.js";
import { sha256, safeEqual } from "../security/crypto.js";
import { config } from "../config.js";
import { audit } from "../security/audit.js";

export const loadAuthentication: RequestHandler = async (req, res, next) => {
  const cookies = req.cookies as Record<string, string | undefined>;
  const token = cookies[SESSION_COOKIE];
  if (!token) return next();
  const session = await Session.findOne({ tokenHash: sha256(token), revokedAt: { $exists: false } }).select("+tokenHash +csrfHash");
  if (!session || session.expiresAt <= new Date() || session.idleExpiresAt <= new Date()) {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    if (session && !session.revokedAt) await Session.updateOne({ _id: session._id }, { revokedAt: new Date() });
    return next();
  }
  const user = await User.findById(session.userId);
  if (!user || user.status !== "ACTIVE") {
    await Session.updateOne({ _id: session._id }, { revokedAt: new Date() });
    return next();
  }
  req.auth = { user, session, rawToken: token };
  if (Date.now() - session.lastActivityAt.getTime() > 5 * 60_000) {
    session.lastActivityAt = new Date();
    session.idleExpiresAt = new Date(Date.now() + config.SESSION_IDLE_MINUTES * 60_000);
    await session.save();
  }
  next();
};

export const requireAuthentication: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication is required"));
  next();
};
export const requireVerifiedEmail: RequestHandler = (req, _res, next) => {
  if (!req.auth?.user.emailVerifiedAt) return next(new ApiError(403, "EMAIL_VERIFICATION_REQUIRED", "Email verification is required"));
  next();
};
export const requireMfa: RequestHandler = (req, _res, next) => {
  if (!req.auth?.session.mfaComplete) return next(new ApiError(403, "MFA_REQUIRED", "Multi-factor authentication is required"));
  next();
};
export const requireFreshAuthentication: RequestHandler = (req, _res, next) => {
  if (!req.auth || req.auth.session.freshUntil <= new Date()) return next(new ApiError(403, "FRESH_AUTHENTICATION_REQUIRED", "Recent authentication is required"));
  next();
};
export const requireCurrentPassword: RequestHandler = (req, _res, next) => {
  if (req.auth && req.auth.user.passwordExpiresAt <= new Date()) return next(new ApiError(403, "PASSWORD_EXPIRED", "Your password must be changed"));
  next();
};
export const enforceAdminMfaEnrollment: RequestHandler = (req, _res, next) => {
  if (req.auth?.user.role !== "ADMIN" || req.auth.session.mfaComplete) return next();
  const allowed = new Set([
    "GET /api/v1/auth/me", "GET /api/v1/auth/csrf", "POST /api/v1/auth/logout",
    "POST /api/v1/mfa/enrol/start", "POST /api/v1/mfa/enrol/confirm",
    "GET /api/v1/sessions", "POST /api/v1/sessions/logout-all",
  ]);
  if (!allowed.has(`${req.method} ${req.path}`)) return next(new ApiError(403, "ADMIN_MFA_ENROLMENT_REQUIRED", "Administrator MFA enrolment is required"));
  next();
};
export const requireRole = (...roles: Role[]): RequestHandler => async (req, _res, next) => {
  if (!req.auth || !roles.includes(req.auth.user.role)) {
    await audit(req, "UNAUTHORISED_ACCESS_ATTEMPT", { actorId: req.auth?.user._id, metadata: { path: req.path, requiredRoles: roles } });
    return next(new ApiError(403, "ACCESS_DENIED", "Access is denied"));
  }
  next();
};
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method) || !req.auth) return next();
  const origin = req.get("origin");
  if (origin && origin !== config.FRONTEND_URL) return next(new ApiError(403, "CSRF_REJECTED", "Request origin was rejected"));
  const supplied = req.get("x-csrf-token");
  if (!supplied || !safeEqual(sha256(supplied), req.auth.session.csrfHash)) return next(new ApiError(403, "CSRF_REJECTED", "CSRF token is missing or invalid"));
  next();
};
