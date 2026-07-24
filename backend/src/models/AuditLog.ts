import { Schema, model, type Types } from "mongoose";
interface IAuditLog { actorId?: Types.ObjectId; subjectId?: Types.ObjectId; event: string; transactionReference?: string; ipHash?: string; requestId?: string; metadata: Record<string, unknown>; createdAt: Date; }
const schema = new Schema<IAuditLog>({
  actorId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  subjectId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  event: { type: String, required: true, index: true },
  transactionReference: String,
  ipHash: String,
  requestId: String,
  metadata: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, immutable: true, index: true },
}, { strict: "throw", versionKey: false });
schema.index(
  { event: 1, transactionReference: 1 },
  { unique: true, partialFilterExpression: { transactionReference: { $type: "string" } } },
);
export const AuditLog = model<IAuditLog>("AuditLog", schema);
