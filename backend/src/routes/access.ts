import { Router } from "express";
import { requireAuthentication, requireCurrentPassword, requireMfa, requireRole, requireVerifiedEmail } from "../middleware/auth.js";
export const accessRouter = Router();
accessRouter.get("/student", requireAuthentication, requireVerifiedEmail, requireCurrentPassword, requireRole("STUDENT"), (_req, res) => res.json({ access: "STUDENT" }));
accessRouter.get("/counsellor", requireAuthentication, requireVerifiedEmail, requireCurrentPassword, requireRole("COUNSELLOR"), (_req, res) => res.json({ access: "COUNSELLOR" }));
accessRouter.get("/admin", requireAuthentication, requireVerifiedEmail, requireCurrentPassword, requireMfa, requireRole("ADMIN"), (_req, res) => res.json({ access: "ADMIN" }));
