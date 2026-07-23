import { ApiError } from "../errors.js";
import type { ApplicationStage } from "../models/Application.js";

const forward: Record<ApplicationStage, readonly ApplicationStage[]> = {
  ENQUIRY: ["COUNSELLING"],
  COUNSELLING: ["DOCUMENTS_PENDING"],
  DOCUMENTS_PENDING: ["APPLICATION_SUBMITTED"],
  APPLICATION_SUBMITTED: ["DECISION_RECEIVED"],
  DECISION_RECEIVED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};
export function assertForwardTransition(current: ApplicationStage, next: ApplicationStage) {
  if (!forward[current].includes(next)) throw new ApiError(409, "INVALID_STAGE_TRANSITION", `Cannot move an application from ${current} to ${next}`);
}
export function canStudentCancel(stage: ApplicationStage) {
  return ["ENQUIRY", "COUNSELLING", "DOCUMENTS_PENDING"].includes(stage);
}
