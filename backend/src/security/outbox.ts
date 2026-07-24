import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export interface OutboxMessage { type: "VERIFY_EMAIL" | "RESET_PASSWORD"; email: string; link: string; createdAt: string; developmentOnly: true; }
const messages: OutboxMessage[] = [];
const outboxFile = path.resolve(".runtime", "email-outbox.json");

export function deliverDevelopmentLink(message: Omit<OutboxMessage, "developmentOnly">) {
  if (config.NODE_ENV === "production" || config.EMAIL_DELIVERY_MODE !== "outbox") throw new Error("Development outbox delivery is unavailable");
  messages.push({ ...message, developmentOnly: true });
  mkdirSync(path.dirname(outboxFile), { recursive: true, mode: 0o700 });
  writeFileSync(outboxFile, JSON.stringify({ warning: "DEVELOPMENT ONLY", messages }, null, 2), { encoding: "utf8", mode: 0o600 });
}

export function developmentOutbox() {
  if (config.NODE_ENV === "production" || config.EMAIL_DELIVERY_MODE !== "outbox") return [];
  return messages.map((message) => ({ ...message }));
}

export function clearDevelopmentOutbox() {
  messages.splice(0);
  rmSync(outboxFile, { force: true });
}

export function developmentOutboxPath() { return outboxFile; }
