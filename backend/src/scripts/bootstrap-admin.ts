import { connectDatabase, disconnectDatabase } from "../database.js";
import { User } from "../models/User.js";
import { config } from "../config.js";
import { hashPassword, passwordIssues, recordPassword } from "../security/password.js";
import { audit } from "../security/audit.js";

async function main() {
  const fullName = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!fullName || !email || !password) throw new Error("Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD in the process environment");
  const issues = passwordIssues(password);
  if (issues.length) throw new Error(`Administrator password does not meet policy: ${issues.join("; ")}`);
  await connectDatabase();
  if (await User.exists({ role: "ADMIN" })) throw new Error("Initial administrator already exists; bootstrap refused");
  if (await User.exists({ email })) throw new Error("An account with that email already exists; bootstrap refused");
  const now = new Date();
  const passwordHash = await hashPassword(password);
  const user = await User.create({
    fullName, email, passwordHash, role: "ADMIN", emailVerifiedAt: now,
    passwordChangedAt: now, passwordExpiresAt: new Date(now.getTime() + config.PASSWORD_MAX_AGE_DAYS * 86400000),
  });
  await recordPassword(user._id, passwordHash);
  await audit(undefined, "INITIAL_ADMIN_BOOTSTRAP", { subjectId: user._id });
  process.stdout.write(`Initial administrator created for ${email}. MFA enrolment is mandatory at first login.\n`);
}

main().then(disconnectDatabase).catch(async (error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Bootstrap failed"}\n`);
  await disconnectDatabase();
  process.exitCode = 1;
});
