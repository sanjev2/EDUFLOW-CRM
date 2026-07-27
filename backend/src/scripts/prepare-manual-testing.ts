import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import dotenv from "dotenv";
import mongoose from "mongoose";

const projectRoot =
  path.basename(process.cwd()).toLowerCase() === "backend"
    ? path.resolve(process.cwd(), "..")
    : path.resolve(process.cwd());
const evidenceRoot = path.join(projectRoot, ".evidence", "test-plan");
const environmentPath = path.join(evidenceRoot, "manual-test.env");
const credentialPath = path.join(evidenceRoot, "manual-test-credentials.json");
const uploadRoot = path.join(projectRoot, ".evidence", "manual-uploads");
const reset = process.argv.includes("--reset");

function secret(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function createEnvironment() {
  mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
  if (existsSync(environmentPath)) return;
  const lines = [
    "NODE_ENV=development",
    "FRONTEND_PORT=3100",
    "BACKEND_PORT=5001",
    "FRONTEND_URL=http://localhost:3100",
    "NEXT_PUBLIC_API_URL=http://localhost:5001/api/v1",
    "PUBLIC_APP_URL=http://localhost:3100",
    "MONGODB_URI=mongodb://127.0.0.1:27017/eduflow_crm_manual_test",
    `UPLOAD_ROOT=${uploadRoot.replaceAll("\\", "/")}`,
    "EMAIL_DELIVERY_MODE=outbox",
    `SESSION_SECRET=${secret()}`,
    `FIELD_ENCRYPTION_KEY=${secret()}`,
    `PASSWORD_PEPPER=${secret()}`,
  ];
  writeFileSync(environmentPath, `${lines.join("\n")}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function dummyPng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const pixels = Buffer.from([
    0, 30, 80, 160, 255, 60, 110, 190, 255, 0, 90, 140, 210, 255, 120, 170, 230,
    255,
  ]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk(
      "tEXt",
      Buffer.from("Purpose\0Generated EduFlow test evidence", "latin1"),
    ),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND"),
  ]);
}

async function main() {
  createEnvironment();
  dotenv.config({ path: environmentPath, override: true });
  const databaseName = new URL(process.env.MONGODB_URI!).pathname.slice(1);
  if (databaseName !== "eduflow_crm_manual_test") {
    throw new Error(
      "Manual test preparation refused: the database is not the isolated manual-test database",
    );
  }

  const [
    { User },
    { StudentProfile },
    { Application },
    { ApplicationStageHistory },
    { CounsellorAssignment },
    { CounsellingNote },
    { Task },
    { Document },
    { AuditLog },
    { hashPassword, recordPassword },
  ] = await Promise.all([
    import("../models/User.js"),
    import("../models/StudentProfile.js"),
    import("../models/Application.js"),
    import("../models/ApplicationStageHistory.js"),
    import("../models/CounsellorAssignment.js"),
    import("../models/CounsellingNote.js"),
    import("../models/Task.js"),
    import("../models/Document.js"),
    import("../models/AuditLog.js"),
    import("../security/password.js"),
  ]);

  await mongoose.connect(process.env.MONGODB_URI!);
  try {
    const collections = await mongoose.connection
      .db!.listCollections()
      .toArray();
    if (collections.length && !reset) {
      throw new Error(
        "Manual-test data already exists. Re-run with --reset to replace only the isolated test database",
      );
    }
    if (reset) {
      await mongoose.connection.db!.dropDatabase();
      rmSync(uploadRoot, { recursive: true, force: true });
    }
    mkdirSync(uploadRoot, { recursive: true, mode: 0o700 });

    const definitions = [
      {
        key: "studentA",
        fullName: "EduFlow Test Student A",
        email: "student-a@eduflow.example.test",
        role: "STUDENT",
      },
      {
        key: "studentB",
        fullName: "EduFlow Test Student B",
        email: "student-b@eduflow.example.test",
        role: "STUDENT",
      },
      {
        key: "counsellorA",
        fullName: "EduFlow Test Counsellor A",
        email: "counsellor-a@eduflow.example.test",
        role: "COUNSELLOR",
      },
      {
        key: "counsellorB",
        fullName: "EduFlow Test Counsellor B",
        email: "counsellor-b@eduflow.example.test",
        role: "COUNSELLOR",
      },
      {
        key: "administrator",
        fullName: "EduFlow Test Administrator",
        email: "administrator@eduflow.example.test",
        role: "ADMIN",
      },
    ] as const;
    const accounts: Record<
      string,
      {
        id: mongoose.Types.ObjectId;
        email: string;
        password: string;
        role: string;
      }
    > = {};
    const now = new Date();
    for (const definition of definitions) {
      const password = `EduFlow9!${secret(18)}`;
      const passwordHash = await hashPassword(password);
      const user = await User.create({
        fullName: definition.fullName,
        email: definition.email,
        role: definition.role,
        passwordHash,
        passwordChangedAt: now,
        passwordExpiresAt: new Date(now.getTime() + 90 * 86400000),
        emailVerifiedAt: now,
        consentAt: definition.role === "STUDENT" ? now : undefined,
        invitationAcceptedAt:
          definition.role === "COUNSELLOR" ? now : undefined,
        lastAuthenticatedAt: definition.role === "COUNSELLOR" ? now : undefined,
        mfaEnabled: false,
      });
      await recordPassword(user._id, passwordHash);
      accounts[definition.key] = {
        id: user._id,
        email: definition.email,
        password,
        role: definition.role,
      };
    }

    const studentA = accounts.studentA!;
    const studentB = accounts.studentB!;
    const counsellorA = accounts.counsellorA!;
    const counsellorB = accounts.counsellorB!;
    const administrator = accounts.administrator!;
    await StudentProfile.create([
      {
        userId: studentA.id,
        country: "Nepal",
        city: "Kathmandu",
        highestQualification: "Bachelor",
        englishTestType: "IELTS",
        englishTestScore: 7,
        preferredCountry: "Australia",
        preferredStudyLevel: "Master",
        intendedIntake: "2027",
      },
      {
        userId: studentB.id,
        country: "Nepal",
        city: "Pokhara",
        highestQualification: "Higher Secondary",
        englishTestType: "PTE",
        englishTestScore: 64,
        preferredCountry: "Canada",
        preferredStudyLevel: "Bachelor",
        intendedIntake: "2028",
      },
    ]);
    const applications = await Application.create([
      {
        studentId: studentA.id,
        assignedCounsellorId: counsellorA.id,
        assignmentState: "ASSIGNED",
        stage: "DOCUMENTS_PENDING",
        active: true,
        preferredCountry: "Australia",
        institution: "Example Southern University",
        program: "Master of Information Systems",
        intendedIntake: "2027",
      },
      {
        studentId: studentB.id,
        assignedCounsellorId: counsellorB.id,
        assignmentState: "ASSIGNED",
        stage: "PROFILE_ASSESSMENT",
        active: true,
        preferredCountry: "Canada",
        institution: "Example Northern College",
        program: "Bachelor of Business",
        intendedIntake: "2028",
      },
    ]);
    const applicationA = applications[0];
    const applicationB = applications[1];
    if (!applicationA || !applicationB)
      throw new Error("Manual application preparation failed");
    await CounsellorAssignment.create([
      {
        studentId: studentA.id,
        counsellorId: counsellorA.id,
        assignedBy: administrator.id,
        reason: "Isolated manual authorization test assignment",
      },
      {
        studentId: studentB.id,
        counsellorId: counsellorB.id,
        assignedBy: administrator.id,
        reason: "Isolated manual authorization test assignment",
      },
    ]);
    await ApplicationStageHistory.create([
      {
        applicationId: applicationA._id,
        newStage: "DOCUMENTS_PENDING",
        actorId: administrator.id,
        actorRole: "ADMIN",
        reason: "Generated manual test baseline",
      },
      {
        applicationId: applicationB._id,
        newStage: "PROFILE_ASSESSMENT",
        actorId: administrator.id,
        actorRole: "ADMIN",
        reason: "Generated manual test baseline",
      },
    ]);
    await CounsellingNote.create([
      {
        studentId: studentA.id,
        authorId: counsellorA.id,
        content: "Generated note for assigned-student authorization testing.",
      },
      {
        studentId: studentB.id,
        authorId: counsellorB.id,
        content: "Generated note for cross-counsellor authorization testing.",
      },
    ]);
    await Task.create([
      {
        title: "Generated Student A follow-up",
        studentId: studentA.id,
        applicationId: applicationA._id,
        counsellorId: counsellorA.id,
        dueAt: new Date(now.getTime() + 86400000),
        priority: "HIGH",
        status: "OPEN",
        createdBy: counsellorA.id,
        automationKey: `manual-test:${String(applicationA._id)}`,
      },
      {
        title: "Generated Student B follow-up",
        studentId: studentB.id,
        applicationId: applicationB._id,
        counsellorId: counsellorB.id,
        dueAt: new Date(now.getTime() + 172800000),
        priority: "MEDIUM",
        status: "OPEN",
        createdBy: counsellorB.id,
        automationKey: `manual-test:${String(applicationB._id)}`,
      },
    ]);
    const image = dummyPng();
    for (const [account, application, suffix] of [
      [studentA, applicationA, "a"],
      [studentB, applicationB, "b"],
    ] as const) {
      const storedFilename = `${randomBytes(24).toString("hex")}.png`;
      writeFileSync(path.join(uploadRoot, storedFilename), image, {
        mode: 0o600,
      });
      await Document.create({
        ownerId: account.id,
        applicationId: application._id,
        category: "OTHER",
        originalFilename: `generated-test-document-${suffix}.png`,
        storedFilename,
        detectedMimeType: "image/png",
        size: image.length,
        integrityHash: createHash("sha256").update(image).digest("hex"),
        uploadedBy: account.id,
      });
    }
    await AuditLog.create({
      event: "MANUAL_TEST_DATA_PREPARED",
      actorId: administrator.id,
      metadata: { isolatedDatabase: true, accountCount: definitions.length },
    });

    writeFileSync(
      credentialPath,
      JSON.stringify(
        {
          warning:
            "LOCAL TEST CREDENTIALS — DO NOT COMMIT OR INCLUDE IN EVIDENCE",
          database: databaseName,
          accounts: Object.fromEntries(
            Object.entries(accounts).map(([key, value]) => [
              key,
              {
                role: value.role,
                email: value.email,
                password: value.password,
                mfaEnrollmentRequired: value.role === "ADMIN",
              },
            ]),
          ),
        },
        null,
        2,
      ),
      { encoding: "utf8", mode: 0o600 },
    );
    console.log(
      "Prepared isolated manual test data and ignored local credentials.",
    );
  } finally {
    await mongoose.disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Manual test preparation failed",
  );
  process.exitCode = 1;
});
