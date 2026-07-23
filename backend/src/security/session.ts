import type { Request, Response } from "express";
import { config } from "../config.js";
import { Session } from "../models/Session.js";
import type { IUser } from "../models/User.js";
import { randomToken, sha256 } from "./crypto.js";

export const SESSION_COOKIE = "eduflow_session";
const nowPlus = (milliseconds: number) => new Date(Date.now() + milliseconds);
export function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
    maxAge: config.SESSION_ABSOLUTE_HOURS * 3_600_000,
  };
}
export async function createSession(req: Request, res: Response, user: IUser & { _id: unknown }, mfaComplete: boolean) {
  const token = randomToken();
  const csrf = randomToken();
  const session = await Session.create({
    userId: user._id,
    tokenHash: sha256(token),
    csrfHash: sha256(csrf),
    expiresAt: nowPlus(config.SESSION_ABSOLUTE_HOURS * 3_600_000),
    idleExpiresAt: nowPlus(config.SESSION_IDLE_MINUTES * 60_000),
    lastActivityAt: new Date(),
    userAgent: (req.get("user-agent") ?? "unknown").slice(0, 300),
    ipAddress: (req.ip ?? "unknown").slice(0, 64),
    mfaComplete,
    freshUntil: nowPlus(10 * 60_000),
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
  return { session, csrf };
}
export async function rotateSession(req: Request, res: Response, sessionId: unknown, user: IUser & { _id: unknown }, mfaComplete: boolean) {
  await Session.updateOne({ _id: sessionId }, { revokedAt: new Date() });
  return createSession(req, res, user, mfaComplete);
}
export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
}
