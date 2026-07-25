import { Schema, model, type Types } from "mongoose";
export interface ITask {
  title: string; description?: string; studentId: Types.ObjectId; counsellorId: Types.ObjectId;
  applicationId?: Types.ObjectId;
  dueAt: Date; priority: "LOW" | "MEDIUM" | "HIGH"; status: "OPEN" | "COMPLETED" | "CANCELLED";
  completedAt?: Date; createdBy: Types.ObjectId; automationKey?: string; createdAt: Date; updatedAt: Date;
}
const schema = new Schema<ITask>({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 1000 },
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  applicationId: { type: Schema.Types.ObjectId, ref: "Application", index: true },
  counsellorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  dueAt: { type: Date, required: true, index: true },
  priority: { type: String, enum: ["LOW", "MEDIUM", "HIGH"], default: "MEDIUM" },
  status: { type: String, enum: ["OPEN", "COMPLETED", "CANCELLED"], default: "OPEN", index: true },
  completedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  automationKey: { type: String, unique: true, sparse: true },
}, { timestamps: true, strict: "throw", versionKey: false });
schema.index({ counsellorId: 1, status: 1, dueAt: 1 });
export const Task = model<ITask>("Task", schema);
