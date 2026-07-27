import { isIP } from "node:net";
import mongoose from "mongoose";
import type { RequestHandler } from "express";
import { IpAccessRule, SecurityAlert } from "../models/Security.js";
import { AuditLog } from "../models/AuditLog.js";
import { ApiError } from "../errors.js";
import { keyedHash } from "./crypto.js";
import { logger } from "../logger.js";

function normalizedIp(value: string) {
  return value.startsWith("::ffff:") ? value.slice(7) : value;
}

function ipv4Number(value: string) {
  return value.split(".").reduce((total, part) => ((total << 8) | Number(part)) >>> 0, 0);
}

export function validIpCidr(value: string) {
  const [address, prefixText] = value.split("/");
  const version = isIP(address ?? "");
  if (!version || value.split("/").length > 2) return false;
  if (prefixText === undefined) return true;
  const prefix = Number(prefixText);
  return version === 4
    ? Number.isInteger(prefix) && prefix >= 0 && prefix <= 32
    : prefix === 128;
}

export function ipMatchesRule(rawIp: string, cidr: string) {
  const ip = normalizedIp(rawIp);
  const [address, prefixText] = cidr.split("/");
  if (isIP(ip) !== isIP(address ?? "")) return false;
  if (isIP(ip) === 6) return (prefixText === undefined || prefixText === "128") && ip.toLowerCase() === address!.toLowerCase();
  const prefix = prefixText === undefined ? 32 : Number(prefixText);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4Number(ip) & mask) === (ipv4Number(address!) & mask);
}

export function requiresIpPolicy(pathname: string) {
  return pathname.startsWith("/api/v1/admin")
    || pathname === "/api/v1/access/admin"
    || pathname === "/api/v1/crm/dashboard/admin"
    || pathname.startsWith("/api/v1/crm/assignments")
    || /^\/api\/v1\/crm\/applications\/[^/]+\/(?:correct-stage|restore)$/.test(pathname);
}

async function unavailablePolicy(req: Parameters<RequestHandler>[0], next: Parameters<RequestHandler>[2]) {
  logger.error({ requestId: req.id, path: req.path }, "IP access policy could not be evaluated");
  const sensitive = requiresIpPolicy(req.path);
  if (sensitive && mongoose.connection.readyState === mongoose.ConnectionStates.connected) {
    await SecurityAlert.updateOne(
      { type: "IP_ACCESS_POLICY_UNAVAILABLE", acknowledgedAt: { $exists: false } },
      { $setOnInsert: { type: "IP_ACCESS_POLICY_UNAVAILABLE", severity: "HIGH", metadata: { routeClass: "SENSITIVE" } } },
      { upsert: true },
    ).catch(() => undefined);
  }
  if (sensitive) {
    return next(new ApiError(503, "IP_ACCESS_POLICY_UNAVAILABLE", "Sensitive access is temporarily unavailable"));
  }
  next();
}

export const enforceIpAccess: RequestHandler = async (req, _res, next) => {
  if (req.path === "/api/health" || req.path === "/api/v1/health/database") return next();
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected) return unavailablePolicy(req, next);
  let rules;
  try {
    rules = await IpAccessRule.find({ $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] }).lean();
  } catch {
    return unavailablePolicy(req, next);
  }
  if (!rules.length) return next();
  const denied = rules.some((rule) => rule.action === "DENY" && ipMatchesRule(req.ip ?? "", rule.cidr));
  const allows = rules.filter((rule) => rule.action === "ALLOW");
  if (!denied && (!allows.length || allows.some((rule) => ipMatchesRule(req.ip ?? "", rule.cidr)))) return next();
  await AuditLog.create({ event: "IP_ACCESS_DENIED", ipHash: keyedHash(req.ip ?? ""), requestId: req.id, metadata: {} });
  next(new ApiError(403, "IP_ACCESS_DENIED", "Access from this network is denied"));
};
