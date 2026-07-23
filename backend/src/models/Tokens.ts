import { Schema, model, type Types } from "mongoose";

interface IToken { userId: Types.ObjectId; tokenHash: string; expiresAt: Date; usedAt?: Date; createdAt: Date; }
const tokenFields = {
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  usedAt: Date,
};
export const EmailVerificationToken = model<IToken>("EmailVerificationToken", new Schema(tokenFields, { timestamps: true, strict: "throw", versionKey: false }));
export const PasswordResetToken = model<IToken>("PasswordResetToken", new Schema(tokenFields, { timestamps: true, strict: "throw", versionKey: false }));
