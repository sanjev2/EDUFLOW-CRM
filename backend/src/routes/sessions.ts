import { Router } from "express";
import { z } from "zod";
import { requireAuthentication } from "../middleware/auth.js";
import { Session } from "../models/Session.js";
import { strictBody } from "../security/validation.js";
import { audit } from "../security/audit.js";
import { ApiError } from "../errors.js";
import { clearSessionCookie } from "../security/session.js";

export const sessionRouter = Router();
sessionRouter.use(requireAuthentication);
sessionRouter.get("/", async (req, res) => {
  const sessions = await Session.find({ userId: req.auth!.user._id, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() }, idleExpiresAt: { $gt: new Date() } }).sort({ lastActivityAt: -1 });
  res.json({ sessions: sessions.map((item) => ({
    id: String(item._id), createdAt: item.createdAt, lastActivityAt: item.lastActivityAt,
    expiresAt: item.expiresAt, userAgent: item.userAgent, ipAddress: item.ipAddress,
    current: String(item._id) === String(req.auth!.session._id),
  })) });
});
sessionRouter.delete("/:id", async (req, res) => {
  if (String(req.auth!.session._id) === req.params.id) throw new ApiError(400, "CURRENT_SESSION", "Use logout to revoke the current session");
  const result = await Session.updateOne({ _id: req.params.id, userId: req.auth!.user._id, revokedAt: { $exists: false } }, { revokedAt: new Date() });
  if (!result.modifiedCount) throw new ApiError(404, "SESSION_NOT_FOUND", "Session was not found");
  await audit(req, "SESSION_REVOCATION", { actorId: req.auth!.user._id });
  res.status(204).end();
});
sessionRouter.post("/logout-all", async (req, res) => {
  const { preserveCurrent } = strictBody(z.object({ preserveCurrent: z.boolean().default(false) }).strict(), req.body);
  const filter = { userId: req.auth!.user._id, revokedAt: { $exists: false }, ...(preserveCurrent ? { _id: { $ne: req.auth!.session._id } } : {}) };
  await Session.updateMany(filter, { revokedAt: new Date() });
  if (!preserveCurrent) clearSessionCookie(res);
  await audit(req, "SESSION_REVOCATION", { actorId: req.auth!.user._id, metadata: { all: true, preserveCurrent } });
  res.status(204).end();
});
