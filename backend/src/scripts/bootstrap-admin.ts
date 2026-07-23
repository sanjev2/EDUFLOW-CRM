import { connectDatabase, disconnectDatabase } from "../database.js";
import { bootstrapInitialAdministrator } from "../security/admin-bootstrap.js";

async function main() {
  const fullName = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const setupOutputFile = process.env.ADMIN_SETUP_OUTPUT_FILE?.trim();
  if (!fullName || !email) throw new Error("Set ADMIN_NAME and ADMIN_EMAIL in the process environment");
  await connectDatabase();
  const result = await bootstrapInitialAdministrator({ fullName, email, ...(setupOutputFile ? { setupOutputFile } : {}) });
  process.stdout.write(result === "ALREADY_CONFIGURED"
    ? "Initial administrator is already configured; no changes were made.\n"
    : "Initial administrator bootstrap completed. Email verification, one-time password setup and MFA requirements apply.\n");
}

main().then(disconnectDatabase).catch(async (error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Bootstrap failed"}\n`);
  await disconnectDatabase();
  process.exitCode = 1;
});
