import { Schema, model, type Types } from "mongoose";

export interface ISession {
  userId: Types.ObjectId;
  tokenHash: string;
  csrfHash: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  idleExpiresAt: Date;
  lastActivityAt: Date;
  userAgent: string;
  ipAddress: string;
  mfaComplete: boolean;
  freshUntil: Date;
  revokedAt?: Date;
}

const schema = new Schema<ISession>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  csrfHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  idleExpiresAt: { type: Date, required: true },
  lastActivityAt: { type: Date, required: true },
  userAgent: { type: String, required: true, maxlength: 300 },
  ipAddress: { type: String, required: true, maxlength: 64 },
  mfaComplete: { type: Boolean, default: false },
  freshUntil: { type: Date, required: true },
  revokedAt: Date,
}, { timestamps: true, strict: "throw", versionKey: false });

export const Session = model<ISession>("Session", schema);
