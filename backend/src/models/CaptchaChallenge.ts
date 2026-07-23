import { Schema, model } from "mongoose";
interface ICaptcha { challengeId: string; answerHash: string; ipHash: string; expiresAt: Date; usedAt?: Date; }
export const CaptchaChallenge = model<ICaptcha>("CaptchaChallenge", new Schema({
  challengeId: { type: String, required: true, unique: true },
  answerHash: { type: String, required: true, select: false },
  ipHash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  usedAt: Date,
}, { timestamps: true, strict: "throw", versionKey: false }));
