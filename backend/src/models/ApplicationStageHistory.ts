import { Schema, model, type Types } from "mongoose";
import { applicationStages, type ApplicationStage } from "./Application.js";
import { roles, type Role } from "./User.js";
export interface IApplicationStageHistory {
  applicationId: Types.ObjectId; previousStage?: ApplicationStage; newStage: ApplicationStage;
  actorId: Types.ObjectId; actorRole: Role; reason: string; transactionReference?: string; createdAt: Date;
}
const schema = new Schema<IApplicationStageHistory>({
  applicationId: { type: Schema.Types.ObjectId, ref: "Application", required: true, index: true, immutable: true },
  previousStage: { type: String, enum: applicationStages, immutable: true },
  newStage: { type: String, enum: applicationStages, required: true, immutable: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  actorRole: { type: String, enum: roles, required: true, immutable: true },
  reason: { type: String, required: true, maxlength: 500, immutable: true },
  transactionReference: { type: String, immutable: true },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { strict: "throw", versionKey: false });
schema.index({ applicationId: 1, createdAt: 1 });
schema.index({ transactionReference: 1 }, { unique: true, sparse: true });
export const ApplicationStageHistory = model<IApplicationStageHistory>("ApplicationStageHistory", schema);
