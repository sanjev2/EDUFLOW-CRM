import type { IApplication } from "../models/Application.js";

const clean = (value: unknown) => typeof value === "string" ? value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ") : "";

export function applicationDuplicateKey(input: Pick<IApplication, "preferredCountry" | "institution" | "program" | "preferredStudyLevel" | "intendedIntake">) {
  return [
    clean(input.preferredCountry),
    clean(input.institution),
    clean(input.program),
    clean(input.preferredStudyLevel),
    clean(input.intendedIntake),
  ].join("|");
}

export const defaultChecklist = [
  ["personal-details", "PROFILE", "Personal details"],
  ["academic-history", "PROFILE", "Academic history"],
  ["study-gap", "PROFILE", "Study gap review"],
  ["english-evidence", "PROFILE", "English-language evidence"],
  ["destination-preference", "PROFILE", "Destination preference"],
  ["programme-preference", "PROFILE", "Programme preference"],
  ["budget-readiness", "PROFILE", "Budget readiness"],
  ["identity", "INSTITUTION_APPLICATION", "Passport or identity"],
  ["academic-certificates", "INSTITUTION_APPLICATION", "Academic certificates"],
  ["transcripts", "INSTITUTION_APPLICATION", "Academic transcripts"],
  ["statement", "INSTITUTION_APPLICATION", "SOP or personal statement"],
  ["institution-form", "INSTITUTION_APPLICATION", "Institution application form"],
  ["offer-conditions", "INSTITUTION_APPLICATION", "Offer conditions"],
  ["visa-identity", "VISA_PREPARATION", "Valid identity or passport"],
  ["offer-acceptance", "VISA_PREPARATION", "Institution offer and acceptance evidence"],
  ["financial-readiness", "VISA_PREPARATION", "Financial-readiness evidence"],
  ["visa-additional-information", "VISA_PREPARATION", "Additional-information requests"],
  ["accommodation", "PRE_DEPARTURE", "Accommodation planning"],
  ["travel", "PRE_DEPARTURE", "Travel planning"],
  ["orientation", "PRE_DEPARTURE", "Orientation"],
] as const;

export function createDefaultChecklist() {
  const now = new Date();
  return defaultChecklist.map(([key, category, label]) => ({ key, category, label, status: "NOT_STARTED" as const, updatedAt: now }));
}
