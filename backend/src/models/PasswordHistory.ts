import { Schema, model, type Types } from "mongoose";
interface IPasswordHistory { userId: Types.ObjectId; passwordHash: string; changedAt: Date; }
const schema = new Schema<IPasswordHistory>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  changedAt: { type: Date, default: Date.now, required: true },
}, { strict: "throw", versionKey: false });
schema.index({ userId: 1, changedAt: -1 });
export const PasswordHistory = model<IPasswordHistory>("PasswordHistory", schema);
