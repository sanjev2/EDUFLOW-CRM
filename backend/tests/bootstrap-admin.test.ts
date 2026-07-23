import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditLog } from "../src/models/AuditLog.js";
import { Session } from "../src/models/Session.js";
import { EmailVerificationToken, PasswordResetToken } from "../src/models/Tokens.js";
import { User } from "../src/models/User.js";
import { bootstrapInitialAdministrator } from "../src/security/admin-bootstrap.js";
import { randomToken, sha256 } from "../src/security/crypto.js";
import { hashPassword } from "../src/security/password.js";

let temporaryDirectory: string;
const target = { fullName: "Initial Administrator", email: "sanjeevmanandhar51@gmail.com" };

beforeAll(async () => {
  expect(process.env.MONGODB_URI).toMatch(/eduflow_crm_test$/);
  await mongoose.connect(process.env.MONGODB_URI!);
  temporaryDirectory = await mkdtemp(join(tmpdir(), "eduflow-bootstrap-"));
});
beforeEach(async () => {
  await mongoose.connection.db!.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
});
afterAll(async () => {
  await mongoose.connection.db!.dropDatabase();
  await mongoose.disconnect();
  await rm(temporaryDirectory, { recursive: true, force: true });
});

async function existingUser(email = target.email, verified = true) {
  const now = new Date();
  return User.create({
    fullName: "Existing User",
    email,
    role: "STUDENT",
    passwordHash: await hashPassword("Correct-Horse7-Battery!"),
    passwordChangedAt: now,
    passwordExpiresAt: new Date(now.getTime() + 86400000),
    ...(verified ? { emailVerifiedAt: now } : {}),
  });
}

describe("controlled initial administrator bootstrap", () => {
  it("creates an unverified administrator with hashed single-use setup tokens and an audit event", async () => {
    const setupOutputFile = join(temporaryDirectory, "created.json");
    await expect(bootstrapInitialAdministrator({ ...target, setupOutputFile })).resolves.toBe("CREATED");
    const user = await User.findOne({ email: target.email });
    const setup = JSON.parse(await readFile(setupOutputFile, "utf8")) as { verificationUrl: string; passwordSetupUrl: string };
    const verification = new URL(setup.verificationUrl).searchParams.get("token")!;
    const reset = new URL(setup.passwordSetupUrl).searchParams.get("token")!;
    expect(user).toMatchObject({ role: "ADMIN", status: "ACTIVE", mfaEnabled: false });
    expect(user!.emailVerifiedAt).toBeUndefined();
    expect(await EmailVerificationToken.exists({ userId: user!._id, tokenHash: sha256(verification) })).toBeTruthy();
    expect(await PasswordResetToken.exists({ userId: user!._id, tokenHash: sha256(reset) })).toBeTruthy();
    expect(await AuditLog.exists({ event: "INITIAL_ADMIN_BOOTSTRAP", subjectId: user!._id })).toBeTruthy();
  });

  it("is idempotent for the same initial administrator", async () => {
    const setupOutputFile = join(temporaryDirectory, "idempotent.json");
    await bootstrapInitialAdministrator({ ...target, setupOutputFile });
    await expect(bootstrapInitialAdministrator(target)).resolves.toBe("ALREADY_CONFIGURED");
    expect(await User.countDocuments({ role: "ADMIN" })).toBe(1);
    expect(await AuditLog.countDocuments({ event: "INITIAL_ADMIN_BOOTSTRAP" })).toBe(1);
  });

  it("promotes only an active verified existing account and revokes its sessions", async () => {
    const user = await existingUser();
    await Session.create({
      userId: user._id,
      tokenHash: sha256(randomToken()),
      csrfHash: sha256(randomToken()),
      expiresAt: new Date(Date.now() + 86400000),
      idleExpiresAt: new Date(Date.now() + 3600000),
      lastActivityAt: new Date(),
      userAgent: "test",
      ipAddress: "127.0.0.1",
      mfaComplete: false,
      freshUntil: new Date(Date.now() + 300000),
    });
    await expect(bootstrapInitialAdministrator(target)).resolves.toBe("PROMOTED");
    expect((await User.findById(user._id))!.role).toBe("ADMIN");
    expect((await Session.findOne({ userId: user._id }))!.revokedAt).toBeInstanceOf(Date);
    expect(await AuditLog.exists({ event: "INITIAL_ADMIN_BOOTSTRAP", subjectId: user._id })).toBeTruthy();
  });

  it("refuses unverified promotion and never overwrites a different administrator", async () => {
    await existingUser(target.email, false);
    await expect(bootstrapInitialAdministrator(target)).rejects.toThrow(/email-verified/);
    await User.deleteMany({});
    const other = await existingUser("other-admin@example.test");
    other.role = "ADMIN";
    await other.save();
    await expect(bootstrapInitialAdministrator({ ...target, setupOutputFile: join(temporaryDirectory, "refused.json") })).rejects.toThrow(/already exists/);
    expect(await User.countDocuments({ role: "ADMIN" })).toBe(1);
  });
});
