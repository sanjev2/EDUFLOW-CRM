import { Schema, model, type Types } from "mongoose";
export interface ICounsellorAssignment {
  studentId: Types.ObjectId; counsellorId: Types.ObjectId; assignedBy: Types.ObjectId;
  active: boolean; assignedAt: Date; endedAt?: Date; reason: string;
}
const schema = new Schema<ICounsellorAssignment>({
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true, immutable: true },
  counsellorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true, immutable: true },
  assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  active: { type: Boolean, default: true, index: true },
  assignedAt: { type: Date, default: Date.now, immutable: true },
  endedAt: Date,
  reason: { type: String, required: true, maxlength: 500 },
}, { timestamps: true, strict: "throw", versionKey: false });
schema.index({ studentId: 1, active: 1 }, { unique: true, partialFilterExpression: { active: true } });
schema.index({ counsellorId: 1, active: 1 });
export const CounsellorAssignment = model<ICounsellorAssignment>("CounsellorAssignment", schema);
