import type { Request } from "express";
import { AuditLog } from "../models/AuditLog.js";
import { keyedHash } from "./crypto.js";

const forbidden = /password|token|cookie|secret|code|answer/i;
function clean(metadata: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => !forbidden.test(key)));
}
export async function audit(req: Request | undefined, event: string, input: {
  actorId?: unknown; subjectId?: unknown; metadata?: Record<string, unknown>;
} = {}) {
  await AuditLog.create({
    event,
    ...(input.actorId ? { actorId: input.actorId } : {}),
    ...(input.subjectId ? { subjectId: input.subjectId } : {}),
    ...(req ? { ipHash: keyedHash(req.ip ?? ""), requestId: req.id } : {}),
    metadata: clean(input.metadata ?? {}),
  });
}
