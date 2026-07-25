import { ApiError } from "../errors.js";
import type { ApplicationStage } from "../models/Application.js";

export const detailedWorkflow: readonly ApplicationStage[] = [
  "ENQUIRY_RECORDED", "PROFILE_ASSESSMENT", "COUNSELLING", "COURSE_SHORTLISTING",
  "DOCUMENTS_PENDING", "APPLICATION_PREPARATION", "INSTITUTION_SUBMITTED",
  "OFFER_RECEIVED", "OFFER_CONDITIONS_PENDING", "OFFER_ACCEPTED", "VISA_PREPARATION",
  "VISA_READY_TO_LODGE", "VISA_LODGED", "VISA_ADDITIONAL_INFORMATION",
  "VISA_DECISION", "PRE_DEPARTURE", "ENROLLED",
];
export const terminalStages: readonly ApplicationStage[] = ["DISCONTINUED", "VISA_REFUSED", "ENROLLED", "COMPLETED", "CANCELLED"];

const forward = new Map<ApplicationStage, ApplicationStage>(detailedWorkflow.slice(0, -1).map((stage, index) => [stage, detailedWorkflow[index + 1]!] as const));
// Compatibility for applications created before the detailed workflow.
forward.set("ENQUIRY", "COUNSELLING");
forward.set("APPLICATION_SUBMITTED", "DECISION_RECEIVED");
forward.set("DECISION_RECEIVED", "COMPLETED");

export function nextStage(current: ApplicationStage) {
  return forward.get(current);
}
export function assertForwardTransition(current: ApplicationStage, next: ApplicationStage) {
  if (current === "VISA_DECISION" && next === "VISA_REFUSED") return;
  if (forward.get(current) !== next) throw new ApiError(409, "INVALID_STAGE_TRANSITION", `Cannot move an application from ${current} to ${next}`);
}
export function assertMutable(stage: ApplicationStage, archivedAt?: Date) {
  if (archivedAt || terminalStages.includes(stage)) throw new ApiError(409, "APPLICATION_READ_ONLY", "This application is read-only");
}
export function canStudentCancel(stage: ApplicationStage) {
  return ["ENQUIRY_RECORDED", "PROFILE_ASSESSMENT", "ENQUIRY", "COUNSELLING", "COURSE_SHORTLISTING", "DOCUMENTS_PENDING"].includes(stage);
}
