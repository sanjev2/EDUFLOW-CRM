import argon2 from "argon2";
import { config } from "../config.js";
import { PasswordHistory } from "../models/PasswordHistory.js";

const common = new Set(["password", "password123", "qwerty123", "letmein123", "admin123", "welcome123", "iloveyou"]);
export const passwordRules = {
  minLength: 12,
  maxLength: 128,
  upper: /[A-Z]/,
  lower: /[a-z]/,
  number: /\d/,
  special: /[^A-Za-z0-9]/,
};

export function passwordIssues(password: string) {
  const issues: string[] = [];
  if (password.length < passwordRules.minLength) issues.push("Use at least 12 characters");
  if (password.length > passwordRules.maxLength) issues.push("Use no more than 128 characters");
  if (!passwordRules.upper.test(password)) issues.push("Add an uppercase letter");
  if (!passwordRules.lower.test(password)) issues.push("Add a lowercase letter");
  if (!passwordRules.number.test(password)) issues.push("Add a number");
  if (!passwordRules.special.test(password)) issues.push("Add a special character");
  if (common.has(password.toLowerCase()) || [...common].some((word) => password.toLowerCase().includes(word))) issues.push("Choose a less common password");
  return issues;
}
const peppered = (password: string) => `${password}${config.PASSWORD_PEPPER}`;
export const hashPassword = (password: string) => argon2.hash(peppered(password), {
  type: argon2.argon2id,
  memoryCost: config.ARGON2_MEMORY_KIB,
  timeCost: config.ARGON2_TIME_COST,
  parallelism: config.ARGON2_PARALLELISM,
});
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, peppered(password));
export async function passwordWasReused(userId: unknown, password: string) {
  const entries = await PasswordHistory.find({ userId }).sort({ changedAt: -1 }).limit(5).select("+passwordHash");
  for (const entry of entries) if (await verifyPassword(entry.passwordHash, password)) return true;
  return false;
}
export async function recordPassword(userId: unknown, passwordHash: string) {
  await PasswordHistory.create({ userId, passwordHash, changedAt: new Date() });
  const stale = await PasswordHistory.find({ userId }).sort({ changedAt: -1 }).skip(5).select("_id");
  if (stale.length) await PasswordHistory.deleteMany({ _id: { $in: stale.map((item) => item._id) } });
}
