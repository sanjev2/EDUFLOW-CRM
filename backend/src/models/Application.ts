import { Schema, model, type Types } from "mongoose";
export const applicationStages = ["ENQUIRY", "COUNSELLING", "DOCUMENTS_PENDING", "APPLICATION_SUBMITTED", "DECISION_RECEIVED", "COMPLETED", "CANCELLED"] as const;
export type ApplicationStage = (typeof applicationStages)[number];
export interface IApplication {
  studentId: Types.ObjectId; stage: ApplicationStage; active: boolean;
  preferredCountry?: string; preferredStudyLevel?: string; intendedIntake?: string;
  submission?: {
    idempotencyKeyHash: string; reference: string; integrity: string; submittedAt: Date;
    previousStage: "DOCUMENTS_PENDING"; newStage: "APPLICATION_SUBMITTED";
  };
  createdAt: Date; updatedAt: Date;
}
const submissionSchema = new Schema({
  idempotencyKeyHash: { type: String, required: true, immutable: true, select: false },
  reference: { type: String, required: true, immutable: true },
  integrity: { type: String, required: true, immutable: true },
  submittedAt: { type: Date, required: true, immutable: true },
  previousStage: { type: String, enum: ["DOCUMENTS_PENDING"], required: true, immutable: true },
  newStage: { type: String, enum: ["APPLICATION_SUBMITTED"], required: true, immutable: true },
}, { _id: false, strict: "throw" });
const schema = new Schema<IApplication>({
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true, immutable: true },
  stage: { type: String, enum: applicationStages, default: "ENQUIRY", required: true },
  active: { type: Boolean, default: true, index: true },
  preferredCountry: { type: String, trim: true, maxlength: 80 },
  preferredStudyLevel: { type: String, trim: true, maxlength: 80 },
  intendedIntake: { type: String, trim: true, maxlength: 80 },
  submission: { type: submissionSchema },
}, { timestamps: true, strict: "throw", versionKey: false });
schema.index({ studentId: 1, active: 1 }, { unique: true, partialFilterExpression: { active: true } });
schema.index({ stage: 1, createdAt: -1 });
schema.index({ "submission.idempotencyKeyHash": 1 }, { unique: true, sparse: true });
export const Application = model<IApplication>("Application", schema);
