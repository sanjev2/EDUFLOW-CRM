import { access, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { config } from "../config.js";
import { User } from "../models/User.js";
import { Session } from "../models/Session.js";
import { EmailVerificationToken, PasswordResetToken } from "../models/Tokens.js";
import { hashPassword, recordPassword } from "./password.js";
import { randomToken, sha256 } from "./crypto.js";
import { audit } from "./audit.js";

const inputSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  setupOutputFile: z.string().trim().min(1).optional(),
}).strict();

export type BootstrapResult = "CREATED" | "PROMOTED" | "ALREADY_CONFIGURED";

export async function bootstrapInitialAdministrator(rawInput: {
  fullName: string;
  email: string;
  setupOutputFile?: string;
}): Promise<BootstrapResult> {
  const input = inputSchema.parse(rawInput);
  const [target, administrators] = await Promise.all([
    User.findOne({ email: input.email }),
    User.find({ role: "ADMIN" }).select("_id email"),
  ]);

  if (target?.role === "ADMIN") {
    if (administrators.length !== 1 || String(administrators[0]!._id) !== String(target._id)) {
      throw new Error("Administrator state is inconsistent; bootstrap refused");
    }
    return "ALREADY_CONFIGURED";
  }
  if (administrators.length) throw new Error("An initial administrator already exists; bootstrap refused");

  if (target) {
    if (!target.emailVerifiedAt) throw new Error("The existing account must be email-verified before bootstrap");
    if (target.status !== "ACTIVE") throw new Error("The existing account must be active before bootstrap");
    const before = target.role;
    target.role = "ADMIN";
    await target.save();
    await Session.updateMany({ userId: target._id, revokedAt: { $exists: false } }, { revokedAt: new Date() });
    await audit(undefined, "INITIAL_ADMIN_BOOTSTRAP", {
      subjectId: target._id,
      metadata: { action: "PROMOTED", before, after: "ADMIN" },
    });
    return "PROMOTED";
  }

  if (!input.setupOutputFile) throw new Error("ADMIN_SETUP_OUTPUT_FILE is required when creating the initial administrator");
  const outputPath = resolve(input.setupOutputFile);
  await access(dirname(outputPath));

  const now = new Date();
  const verificationToken = randomToken();
  const resetToken = randomToken();
  const setup = {
    email: input.email,
    verificationUrl: `${config.FRONTEND_URL}/verify-email?token=${verificationToken}`,
    passwordSetupUrl: `${config.FRONTEND_URL}/reset-password?token=${resetToken}`,
    expiresAt: new Date(now.getTime() + 24 * 3600000).toISOString(),
  };
  await writeFile(outputPath, `${JSON.stringify(setup, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });

  try {
    const passwordHash = await hashPassword(randomToken(64));
    const user = await User.create({
      fullName: input.fullName,
      email: input.email,
      passwordHash,
      role: "ADMIN",
      passwordChangedAt: now,
      passwordExpiresAt: now,
    });
    await Promise.all([
      recordPassword(user._id, passwordHash),
      EmailVerificationToken.create({
        userId: user._id,
        tokenHash: sha256(verificationToken),
        expiresAt: new Date(now.getTime() + 24 * 3600000),
      }),
      PasswordResetToken.create({
        userId: user._id,
        tokenHash: sha256(resetToken),
        expiresAt: new Date(now.getTime() + 24 * 3600000),
      }),
    ]);
    await audit(undefined, "INITIAL_ADMIN_BOOTSTRAP", {
      subjectId: user._id,
      metadata: { action: "CREATED", after: "ADMIN" },
    });
    return "CREATED";
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  }
}
