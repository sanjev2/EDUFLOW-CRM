import { config } from "../config.js";

interface OutboxMessage { type: "VERIFY_EMAIL" | "RESET_PASSWORD"; email: string; link: string; createdAt: string; }
const messages: OutboxMessage[] = [];
export function deliverDevelopmentLink(message: OutboxMessage) {
  if (config.NODE_ENV !== "production") messages.push(message);
}
export function developmentOutbox() {
  if (config.NODE_ENV === "production") return [];
  return messages.map((message) => ({ ...message }));
}
export function clearDevelopmentOutbox() { messages.splice(0); }
