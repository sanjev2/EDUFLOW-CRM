import { Schema, model, type Types } from "mongoose";
import { applicationDuplicateKey, createDefaultChecklist } from "../crm/application-schema.js";
export const applicationStages = [
  "ENQUIRY_RECORDED", "PROFILE_ASSESSMENT", "COUNSELLING", "COURSE_SHORTLISTING",
  "DOCUMENTS_PENDING", "APPLICATION_PREPARATION", "INSTITUTION_SUBMITTED",
  "OFFER_RECEIVED", "OFFER_CONDITIONS_PENDING", "OFFER_ACCEPTED", "VISA_PREPARATION",
  "VISA_READY_TO_LODGE", "VISA_LODGED", "VISA_ADDITIONAL_INFORMATION", "VISA_DECISION",
  "PRE_DEPARTURE", "ENROLLED", "DISCONTINUED", "VISA_REFUSED",
  // Read-only compatibility for records created before the detailed workflow.
  "ENQUIRY", "APPLICATION_SUBMITTED", "DECISION_RECEIVED", "COMPLETED", "CANCELLED",
] as const;
export type ApplicationStage = (typeof applicationStages)[number];
export const checklistStatuses = ["NOT_STARTED", "SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "REPLACEMENT_REQUIRED", "NOT_APPLICABLE"] as const;
export type ChecklistStatus = (typeof checklistStatuses)[number];
export interface IApplication {
  studentId: Types.ObjectId; stage: ApplicationStage; active: boolean;
  preferredCountry?: string; institution?: string; program?: string; preferredStudyLevel?: string; intendedIntake?: string;
  duplicateKey: string; assignedCounsellorId?: Types.ObjectId; assignmentState: "ASSIGNED" | "UNASSIGNED";
  checklist: { key: string; category: "PROFILE" | "INSTITUTION_APPLICATION" | "VISA_PREPARATION" | "PRE_DEPARTURE"; label: string; status: ChecklistStatus; feedback?: string; documentId?: Types.ObjectId; updatedAt: Date; updatedBy?: Types.ObjectId }[];
  discontinuedAt?: Date; discontinuedBy?: Types.ObjectId; discontinuationReason?: string;
  archivedAt?: Date; archivedBy?: Types.ObjectId; archiveReason?: string;
  visaOutcome?: "PENDING" | "APPROVED" | "REFUSED";
  submission?: {
    idempotencyKeyHash: string; reference: string; integrity: string; submittedAt: Date;
    previousStage: "DOCUMENTS_PENDING"; newStage: "APPLICATION_PREPARATION";
  };
  createdAt: Date; updatedAt: Date;
}
const submissionSchema = new Schema({
  idempotencyKeyHash: { type: String, required: true, immutable: true, select: false },
  reference: { type: String, required: true, immutable: true },
  integrity: { type: String, required: true, immutable: true },
  submittedAt: { type: Date, required: true, immutable: true },
  previousStage: { type: String, enum: ["DOCUMENTS_PENDING"], required: true, immutable: true },
  newStage: { type: String, enum: ["APPLICATION_PREPARATION", "APPLICATION_SUBMITTED"], required: true, immutable: true },
}, { _id: false, strict: "throw" });
const checklistSchema = new Schema({
  key: { type: String, required: true, trim: true, maxlength: 80 },
  category: { type: String, enum: ["PROFILE", "INSTITUTION_APPLICATION", "VISA_PREPARATION", "PRE_DEPARTURE"], required: true },
  label: { type: String, required: true, trim: true, maxlength: 160 },
  status: { type: String, enum: checklistStatuses, default: "NOT_STARTED", required: true },
  feedback: { type: String, trim: true, maxlength: 500 },
  documentId: { type: Schema.Types.ObjectId, ref: "Document" },
  updatedAt: { type: Date, default: Date.now, required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { _id: false, strict: "throw" });
const schema = new Schema<IApplication>({
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true, immutable: true },
  stage: { type: String, enum: applicationStages, default: "ENQUIRY_RECORDED", required: true },
  active: { type: Boolean, default: true, index: true },
  preferredCountry: { type: String, trim: true, maxlength: 80 },
  institution: { type: String, trim: true, maxlength: 160 },
  program: { type: String, trim: true, maxlength: 160 },
  preferredStudyLevel: { type: String, trim: true, maxlength: 80 },
  intendedIntake: { type: String, trim: true, maxlength: 80 },
  duplicateKey: {
    type: String, required: true, select: false, maxlength: 600,
    default: function (this: IApplication) { return applicationDuplicateKey(this); },
  },
  assignedCounsellorId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  assignmentState: { type: String, enum: ["ASSIGNED", "UNASSIGNED"], default: "UNASSIGNED", required: true, index: true },
  checklist: { type: [checklistSchema], default: createDefaultChecklist },
  discontinuedAt: Date,
  discontinuedBy: { type: Schema.Types.ObjectId, ref: "User" },
  discontinuationReason: { type: String, trim: true, maxlength: 500 },
  archivedAt: { type: Date, index: true },
  archivedBy: { type: Schema.Types.ObjectId, ref: "User" },
  archiveReason: { type: String, trim: true, maxlength: 500 },
  visaOutcome: { type: String, enum: ["PENDING", "APPROVED", "REFUSED"] },
  submission: { type: submissionSchema },
}, { timestamps: true, strict: "throw", versionKey: false });
schema.index({ studentId: 1, duplicateKey: 1 }, { unique: true, partialFilterExpression: { active: true } });
schema.index({ stage: 1, createdAt: -1 });
schema.index({ assignedCounsellorId: 1, active: 1, archivedAt: 1 });
schema.index({ "submission.idempotencyKeyHash": 1 }, { unique: true, sparse: true });
export const Application = model<IApplication>("Application", schema);
