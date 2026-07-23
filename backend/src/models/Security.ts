import { Schema, model, type Types } from "mongoose";

interface IAuthAttempt { emailHash: string; ipHash: string; outcome: string; createdAt: Date; }
const attemptSchema = new Schema<IAuthAttempt>({
  emailHash: { type: String, required: true, index: true },
  ipHash: { type: String, required: true, index: true },
  outcome: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 },
}, { strict: "throw", versionKey: false });
attemptSchema.index({ emailHash: 1, createdAt: -1 });
attemptSchema.index({ ipHash: 1, createdAt: -1 });
export const LoginAttempt = model<IAuthAttempt>("LoginAttempt", attemptSchema);

interface IMfaChallenge { userId: Types.ObjectId; challengeHash: string; expiresAt: Date; attempts: number; usedAt?: Date; }
export const MfaChallenge = model<IMfaChallenge>("MfaChallenge", new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  challengeHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  attempts: { type: Number, default: 0, min: 0 },
  usedAt: Date,
}, { timestamps: true, strict: "throw", versionKey: false }));

interface ISecurityAlert { userId?: Types.ObjectId; type: string; severity: string; metadata: Record<string, unknown>; acknowledgedAt?: Date; }
export const SecurityAlert = model<ISecurityAlert>("SecurityAlert", new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  type: { type: String, required: true },
  severity: { type: String, enum: ["LOW", "MEDIUM", "HIGH"], required: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
  acknowledgedAt: Date,
}, { timestamps: true, strict: "throw", versionKey: false }));

interface IIpRule { cidr: string; action: "ALLOW" | "DENY"; reason: string; expiresAt?: Date; }
export const IpAccessRule = model<IIpRule>("IpAccessRule", new Schema({
  cidr: { type: String, required: true, unique: true },
  action: { type: String, enum: ["ALLOW", "DENY"], required: true },
  reason: { type: String, required: true, maxlength: 500 },
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
}, { timestamps: true, strict: "throw", versionKey: false }));
