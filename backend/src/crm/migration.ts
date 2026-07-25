import { Application } from "../models/Application.js";
import { applicationDuplicateKey, createDefaultChecklist } from "./application-schema.js";
import { logger } from "../logger.js";

export async function migrateApplicationSchema() {
  const legacy = Application.find({
    $or: [
      { duplicateKey: { $exists: false } },
      { assignmentState: { $exists: false } },
      { checklist: { $exists: false } },
    ],
  }).select("+duplicateKey").cursor();
  let migrated = 0;
  for await (const application of legacy) {
    application.duplicateKey ||= applicationDuplicateKey(application);
    application.assignmentState = application.assignedCounsellorId ? "ASSIGNED" : "UNASSIGNED";
    if (!application.checklist?.length) application.checklist = createDefaultChecklist();
    await application.save();
    migrated += 1;
  }
  await Application.syncIndexes();
  if (migrated) logger.info({ migrated }, "Application schema compatibility migration completed");
}
