import request from "supertest";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { roles, User, type Role } from "../src/models/User.js";
import { Session } from "../src/models/Session.js";
import { CounsellorAssignment } from "../src/models/CounsellorAssignment.js";
import { Application } from "../src/models/Application.js";
import { ApplicationStageHistory } from "../src/models/ApplicationStageHistory.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { Document } from "../src/models/Document.js";
import { StudentProfile } from "../src/models/StudentProfile.js";
import { Task } from "../src/models/Task.js";
import { IpAccessRule, SecurityAlert } from "../src/models/Security.js";
import { hashPassword } from "../src/security/password.js";
import { randomToken, sha256 } from "../src/security/crypto.js";
import { assignLeastLoaded } from "../src/crm/assignment.js";
import { migrateApplicationSchema } from "../src/crm/migration.js";

beforeAll(async () => { expect(process.env.MONGODB_URI).toMatch(/eduflow_crm_test$/); if (!mongoose.connection.readyState) await mongoose.connect(process.env.MONGODB_URI!); });
beforeEach(async () => { await mongoose.connection.db!.dropDatabase(); await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes())); });
afterAll(async () => { await mongoose.connection.db!.dropDatabase(); await mongoose.disconnect(); });

const password = "Coursework-Secure9!";
async function identity(role: Role, suffix = randomToken(4)) {
  const now = new Date(); const isAdmin = role === roles[2]; const user = await User.create({ fullName: `${role} User`, email: `${role.toLowerCase()}-${suffix}@example.test`, role, passwordHash: await hashPassword(password), emailVerifiedAt: now, passwordChangedAt: now, passwordExpiresAt: new Date(Date.now() + 86400000), mfaEnabled: isAdmin, ...(role === "COUNSELLOR" ? { invitationAcceptedAt: now } : {}) });
  const token = randomToken(); const csrf = randomToken();
  await Session.create({ userId: user._id, tokenHash: sha256(token), csrfHash: sha256(csrf), expiresAt: new Date(Date.now() + 86400000), idleExpiresAt: new Date(Date.now() + 3600000), lastActivityAt: now, userAgent: "crm-test", ipAddress: "127.0.0.1", mfaComplete: isAdmin, freshUntil: new Date(Date.now() + 600000) });
  return { user, cookie: `eduflow_session=${token}`, csrf };
}
const mutate = (method: "post"|"put"|"patch"|"delete", path: string, auth: Awaited<ReturnType<typeof identity>>) => request(app)[method](path).set("Origin", "http://localhost:3100").set("Cookie", auth.cookie).set("x-csrf-token", auth.csrf);
async function readyApplication(student: Awaited<ReturnType<typeof identity>>, counsellor?: Awaited<ReturnType<typeof identity>>) {
  await StudentProfile.create({ userId: student.user._id, highestQualification: "Bachelor", preferredCountry: "Australia", preferredStudyLevel: "Master", intendedIntake: "2027" });
  const application = await Application.create({ studentId: student.user._id, stage: "DOCUMENTS_PENDING", active: true, preferredCountry: "Australia", preferredStudyLevel: "Master", intendedIntake: "2027" });
  await Document.create({ ownerId: student.user._id, applicationId: application._id, category: "OTHER", originalFilename: "evidence.png", storedFilename: `${randomToken()}.png`, detectedMimeType: "image/png", size: 100, integrityHash: sha256("fixture"), uploadedBy: student.user._id });
  if (counsellor) await CounsellorAssignment.create({ studentId: student.user._id, counsellorId: counsellor.user._id, assignedBy: student.user._id, reason: "Submission test assignment" });
  return application;
}

describe("CRM profile ownership", () => {
  it("lets a student create and read only their profile with server completion", async () => {
    const student = await identity("STUDENT");
    const updated = await mutate("put", "/api/v1/crm/profile", student).send({ phone: "9800000000", country: "Nepal", englishTestType: "NONE" }).expect(200);
    expect(updated.body.completion).toBeGreaterThan(0);
    await request(app).get("/api/v1/crm/profile").set("Cookie", student.cookie).expect(200);
  });
  it("rejects unexpected and protected profile fields", async () => {
    const student = await identity("STUDENT");
    await mutate("put", "/api/v1/crm/profile", student).send({ country: "Nepal", role: "ADMIN" }).expect(400);
    await mutate("put", "/api/v1/crm/profile", student).send({ country: "Nepal", userId: new mongoose.Types.ObjectId() }).expect(400);
  });
  it("allows assigned counsellor but denies unassigned counsellor", async () => {
    const student = await identity("STUDENT"); const assigned = await identity("COUNSELLOR"); const other = await identity("COUNSELLOR");
    await CounsellorAssignment.create({ studentId: student.user._id, counsellorId: assigned.user._id, assignedBy: assigned.user._id, reason: "Test assignment" });
    await request(app).get(`/api/v1/crm/profiles/${String(student.user._id)}`).set("Cookie", assigned.cookie).expect(200);
    await request(app).get(`/api/v1/crm/profiles/${String(student.user._id)}`).set("Cookie", other.cookie).expect(403);
  });
});

describe("enquiry, assignment and state history", () => {
  it("creates one enquiry, deterministic assignment, history and idempotent follow-up", async () => {
    const student = await identity("STUDENT"); const first = await identity("COUNSELLOR", "a"); await identity("COUNSELLOR", "b");
    const created = await mutate("post", "/api/v1/crm/applications", student).send({ preferredCountry: "Australia" }).expect(201);
    expect(created.body.application.stage).toBe("ENQUIRY_RECORDED");
    expect(String((await CounsellorAssignment.findOne({ studentId: student.user._id }))!.counsellorId)).toBe(String(first.user._id));
    expect(await ApplicationStageHistory.countDocuments()).toBe(1);
    expect(await Task.countDocuments({ automationKey: `enquiry-follow-up:${String(created.body.application._id)}` })).toBe(1);
    await mutate("post", "/api/v1/crm/applications", student).send({ preferredCountry: " australia " }).expect(409);
    expect(await CounsellorAssignment.countDocuments()).toBe(1);
    expect(await Task.countDocuments()).toBe(1);
  });
  it("does not allow a student to set the official stage", async () => {
    const student = await identity("STUDENT");
    await mutate("post", "/api/v1/crm/applications", student).send({ stage: "COMPLETED" }).expect(400);
  });
  it("remains usable without counsellors and raises an operational alert", async () => {
    const student = await identity("STUDENT");
    const result = await mutate("post", "/api/v1/crm/applications", student).send({}).expect(201);
    expect(result.body.assignment).toBeNull();
    expect(await SecurityAlert.countDocuments({ type: "UNASSIGNED_ENQUIRY" })).toBe(1);
  });
  it("assigns only an active verified counsellor and excludes pending, suspended and archived accounts", async () => {
    const student = await identity("STUDENT");
    const pending = await identity("COUNSELLOR", "a-pending");
    await User.updateOne({ _id: pending.user._id }, { $unset: { emailVerifiedAt: 1 } });
    const setupPending = await identity("COUNSELLOR", "aa-setup-pending");
    await User.updateOne({ _id: setupPending.user._id }, { $unset: { invitationAcceptedAt: 1, lastAuthenticatedAt: 1 } });
    const suspended = await identity("COUNSELLOR", "b-suspended");
    await User.updateOne({ _id: suspended.user._id }, { status: "SUSPENDED" });
    const archived = await identity("COUNSELLOR", "c-archived");
    await User.updateOne({ _id: archived.user._id }, { status: "ARCHIVED" });
    const eligible = await identity("COUNSELLOR", "d-eligible");
    const result = await mutate("post", "/api/v1/crm/applications", student).send({}).expect(201);
    expect(String(result.body.assignment.counsellorId)).toBe(String(eligible.user._id));
    expect(await CounsellorAssignment.countDocuments({ studentId: student.user._id })).toBe(1);
    expect(await Task.countDocuments({ studentId: student.user._id })).toBe(1);
  });
  it("keeps concurrent automatic assignment and follow-up creation idempotent", async () => {
    const student = await identity("STUDENT");
    await identity("COUNSELLOR");
    const application = await Application.create({ studentId: student.user._id, stage: "ENQUIRY_RECORDED", active: true, preferredCountry: "Canada" });
    await Promise.all([
      assignLeastLoaded(student.user._id), assignLeastLoaded(student.user._id),
    ]);
    expect(await CounsellorAssignment.countDocuments({ studentId: student.user._id, active: true })).toBe(1);
    expect(await Task.countDocuments({ automationKey: `enquiry-follow-up:${String(application._id)}` })).toBe(1);
  });
  it("enforces assigned forward transitions and returns 409 for invalid transitions", async () => {
    const student = await identity("STUDENT"); const counsellor = await identity("COUNSELLOR");
    const application = await Application.create({ studentId: student.user._id, stage: "ENQUIRY", active: true });
    await CounsellorAssignment.create({ studentId: student.user._id, counsellorId: counsellor.user._id, assignedBy: counsellor.user._id, reason: "Test assignment" });
    await mutate("post", `/api/v1/crm/applications/${String(application._id)}/transition`, counsellor).send({ stage: "COUNSELLING", note: "Initial counselling completed" }).expect(200);
    await mutate("post", `/api/v1/crm/applications/${String(application._id)}/transition`, counsellor).send({ stage: "COMPLETED", note: "Bypass attempt" }).expect(409);
    expect(await ApplicationStageHistory.countDocuments({ applicationId: application._id })).toBe(1);
  });
  it("permits early student cancellation but rejects late cancellation", async () => {
    const early = await identity("STUDENT", "early"); await Application.create({ studentId: early.user._id, stage: "ENQUIRY", active: true });
    await mutate("post", "/api/v1/crm/applications/current/cancel", early).send({ reason: "Plans changed" }).expect(200);
    const late = await identity("STUDENT", "late"); await Application.create({ studentId: late.user._id, stage: "APPLICATION_SUBMITTED", active: true });
    await mutate("post", "/api/v1/crm/applications/current/cancel", late).send({ reason: "Too late" }).expect(409);
  });
});

describe("secure application submission transaction", () => {
  const key = "coursework_submission_key_123456789";
  const submit = (auth: Awaited<ReturnType<typeof identity>>, requestKey = key) =>
    mutate("post", "/api/v1/crm/applications/current/submit", auth).set("idempotency-key", requestKey).send({ confirm: true });

  it("atomically submits an owned ready application and returns a safe no-store receipt", async () => {
    const student = await identity("STUDENT"); const counsellor = await identity("COUNSELLOR");
    const application = await readyApplication(student, counsellor);
    const result = await submit(student).expect(201).expect("Cache-Control", /no-store/);
    expect(result.body.duplicate).toBe(false);
    expect(result.body.receipt).toMatchObject({ stage: "APPLICATION_PREPARATION" });
    expect(result.body.receipt.reference).toMatch(/^EDF-\d{8}-[A-Z0-9_-]+$/);
    expect(result.body.receipt.integrity).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result.body)).not.toMatch(/secret|idempotencyKeyHash/i);
    const current = await request(app).get("/api/v1/crm/applications/current").set("Cookie", student.cookie).expect(200);
    expect(JSON.stringify(current.body)).not.toMatch(/idempotencyKeyHash/i);
    const stored = await Application.findById(application._id);
    expect(stored?.stage).toBe("APPLICATION_PREPARATION");
    expect(await ApplicationStageHistory.countDocuments({ transactionReference: result.body.receipt.reference })).toBe(1);
    expect(await AuditLog.countDocuments({ event: "APPLICATION_SUBMISSION_TRANSACTION", transactionReference: result.body.receipt.reference })).toBe(1);
    expect(await Task.countDocuments({ automationKey: `application-submission:${result.body.receipt.reference}` })).toBe(1);
  });

  it("requires CSRF, explicit confirmation and a valid idempotency key", async () => {
    const student = await identity("STUDENT"); await readyApplication(student);
    await request(app).post("/api/v1/crm/applications/current/submit").set("Cookie", student.cookie).set("idempotency-key", key).send({ confirm: true }).expect(403);
    await mutate("post", "/api/v1/crm/applications/current/submit", student).send({ confirm: true }).expect(400);
    await submit(student, "short").expect(400);
    await mutate("post", "/api/v1/crm/applications/current/submit", student).set("idempotency-key", key).send({ confirm: false }).expect(400);
  });

  it("returns the original receipt for duplicate and concurrent requests without duplicate effects", async () => {
    const student = await identity("STUDENT"); const counsellor = await identity("COUNSELLOR"); await readyApplication(student, counsellor);
    const [first, second] = await Promise.all([submit(student), submit(student)]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(first.body.receipt.reference).toBe(second.body.receipt.reference);
    expect(await ApplicationStageHistory.countDocuments()).toBe(1);
    expect(await AuditLog.countDocuments({ event: "APPLICATION_SUBMISSION_TRANSACTION" })).toBe(1);
    expect(await Task.countDocuments({ automationKey: /^application-submission:/ })).toBe(1);
    await submit(student, "different_submission_key_123456789").expect(409);
  });

  it("denies wrong roles, suspended users and ineligible or incomplete applications", async () => {
    const student = await identity("STUDENT"); const other = await identity("STUDENT"); const counsellor = await identity("COUNSELLOR"); const admin = await identity("ADMIN");
    await readyApplication(student);
    await submit(other).expect(404);
    await submit(counsellor).expect(403);
    await submit(admin).expect(403);
    const early = await identity("STUDENT", "early-submit");
    await Application.create({ studentId: early.user._id, stage: "COUNSELLING", active: true });
    await submit(early).expect(409);
    const incomplete = await identity("STUDENT", "incomplete-submit");
    await Application.create({ studentId: incomplete.user._id, stage: "DOCUMENTS_PENDING", active: true });
    await submit(incomplete).expect(422);
    student.user.status = "SUSPENDED"; await student.user.save();
    await submit(student).expect(401);
  });

  it("preserves the atomic receipt and safely reconciles after an intermediate side-effect failure", async () => {
    const student = await identity("STUDENT"); await readyApplication(student);
    const failure = vi.spyOn(ApplicationStageHistory, "updateOne").mockRejectedValueOnce(new Error("simulated"));
    await submit(student).expect(503);
    const committed = await Application.findOne({ studentId: student.user._id });
    expect(committed?.stage).toBe("APPLICATION_PREPARATION");
    expect(committed?.submission?.reference).toBeTruthy();
    failure.mockRestore();
    const retry = await submit(student).expect(200);
    expect(retry.body.receipt.reference).toBe(committed?.submission?.reference);
    expect(await ApplicationStageHistory.countDocuments({ transactionReference: retry.body.receipt.reference })).toBe(1);
    expect(await AuditLog.countDocuments({ transactionReference: retry.body.receipt.reference })).toBe(1);
  });

  it("rate limits repeated submission attempts without weakening idempotency", async () => {
    const student = await identity("STUDENT"); await readyApplication(student);
    await submit(student).expect(201);
    for (let attempt = 0; attempt < 9; attempt += 1) await submit(student).expect(200);
    await submit(student).expect(429);
    expect(await ApplicationStageHistory.countDocuments()).toBe(1);
    expect(await AuditLog.countDocuments({ event: "APPLICATION_SUBMISSION_TRANSACTION" })).toBe(1);
  });
});

describe("multiple applications and detailed lifecycle", () => {
  it("idempotently migrates a legacy application and replaces the single-active index without data loss", async () => {
    const student = await identity("STUDENT");
    await Application.collection.dropIndexes();
    await Application.collection.createIndex({ studentId: 1, active: 1 }, { unique: true, partialFilterExpression: { active: true }, name: "studentId_1_active_1" });
    const inserted = await Application.collection.insertOne({ studentId: student.user._id, stage: "ENQUIRY", active: true, preferredCountry: "Canada", createdAt: new Date(), updatedAt: new Date() });
    await migrateApplicationSchema();
    await migrateApplicationSchema();
    const preserved = await Application.findById(inserted.insertedId).select("+duplicateKey");
    expect(preserved).toMatchObject({ stage: "ENQUIRY", assignmentState: "UNASSIGNED" });
    expect(preserved!.duplicateKey).toBeTruthy();
    expect(preserved!.checklist.length).toBeGreaterThan(0);
    const indexes = await Application.collection.indexes();
    expect(indexes.some((index) => index.name === "studentId_1_active_1")).toBe(false);
    expect(indexes.some((index) => index.unique && "duplicateKey" in index.key)).toBe(true);
  });
  it("keeps distinct applications separate and rejects only an exact normalized active duplicate", async () => {
    const student = await identity("STUDENT"); await identity("COUNSELLOR");
    const first = await mutate("post", "/api/v1/crm/applications", student).send({ preferredCountry: "Canada", institution: "Example University", program: "Computing", intendedIntake: "Fall 2027" }).expect(201);
    const second = await mutate("post", "/api/v1/crm/applications", student).send({ preferredCountry: "Canada", institution: "Example University", program: "Business", intendedIntake: "Fall 2027" }).expect(201);
    expect(first.body.application._id).not.toBe(second.body.application._id);
    expect(await Application.countDocuments({ studentId: student.user._id })).toBe(2);
    await mutate("post", "/api/v1/crm/applications", student).send({ preferredCountry: " canada ", institution: "EXAMPLE   UNIVERSITY", program: " computing ", intendedIntake: "fall 2027" }).expect(409);
    expect(await Task.countDocuments({ studentId: student.user._id, automationKey: /^enquiry-follow-up:/ })).toBe(2);
  });
  it("enforces student ownership and counsellor application assignment", async () => {
    const owner = await identity("STUDENT", "owner"); const other = await identity("STUDENT", "other-owner");
    const assigned = await identity("COUNSELLOR", "assigned"); const unassigned = await identity("COUNSELLOR", "unassigned");
    const application = await Application.create({ studentId: owner.user._id, assignedCounsellorId: assigned.user._id, assignmentState: "ASSIGNED", stage: "PROFILE_ASSESSMENT", active: true, preferredCountry: "Canada" });
    await request(app).get(`/api/v1/crm/applications/${String(application._id)}`).set("Cookie", owner.cookie).expect(200);
    await request(app).get(`/api/v1/crm/applications/${String(application._id)}`).set("Cookie", other.cookie).expect(404);
    await request(app).get(`/api/v1/crm/applications/${String(application._id)}`).set("Cookie", assigned.cookie).expect(200);
    await request(app).get(`/api/v1/crm/applications/${String(application._id)}`).set("Cookie", unassigned.cookie).expect(403);
  });
  it("reuses a student's eligible counsellor and counts one follow-up per application", async () => {
    const student = await identity("STUDENT"); const counsellor = await identity("COUNSELLOR", "continuity"); await identity("COUNSELLOR", "other");
    const first = await mutate("post", "/api/v1/crm/applications", student).send({ preferredCountry: "Canada" }).expect(201);
    const second = await mutate("post", "/api/v1/crm/applications", student).send({ preferredCountry: "Australia" }).expect(201);
    const stored = await Application.find({ _id: { $in: [first.body.application._id, second.body.application._id] } });
    expect(stored.map((item) => String(item.assignedCounsellorId))).toEqual([String(counsellor.user._id), String(counsellor.user._id)]);
    expect(await Task.countDocuments({ studentId: student.user._id })).toBe(2);
  });
  it("allows only legal detailed transitions and preserves immutable history", async () => {
    const student = await identity("STUDENT"); const counsellor = await identity("COUNSELLOR");
    const application = await Application.create({ studentId: student.user._id, assignedCounsellorId: counsellor.user._id, assignmentState: "ASSIGNED", stage: "ENQUIRY_RECORDED", active: true, preferredCountry: "Canada" });
    await mutate("post", `/api/v1/crm/applications/${String(application._id)}/transition`, counsellor).send({ stage: "PROFILE_ASSESSMENT", note: "Profile assessment started" }).expect(200);
    await mutate("post", `/api/v1/crm/applications/${String(application._id)}/transition`, counsellor).send({ stage: "COURSE_SHORTLISTING", note: "Illegal stage skip" }).expect(409);
    expect(await ApplicationStageHistory.countDocuments({ applicationId: application._id })).toBe(1);
  });
  it("restricts checklist review while allowing a student submission state", async () => {
    const student = await identity("STUDENT"); const counsellor = await identity("COUNSELLOR");
    const application = await Application.create({ studentId: student.user._id, assignedCounsellorId: counsellor.user._id, assignmentState: "ASSIGNED", stage: "DOCUMENTS_PENDING", active: true, preferredCountry: "Canada" });
    const key = application.checklist[0]!.key;
    await mutate("patch", `/api/v1/crm/applications/${String(application._id)}/checklist/${key}`, student).send({ status: "ACCEPTED" }).expect(403);
    await mutate("patch", `/api/v1/crm/applications/${String(application._id)}/checklist/${key}`, student).send({ status: "SUBMITTED" }).expect(200);
    await mutate("patch", `/api/v1/crm/applications/${String(application._id)}/checklist/${key}`, counsellor).send({ status: "ACCEPTED", feedback: "Reviewed and accepted" }).expect(200);
    expect(await AuditLog.countDocuments({ event: "APPLICATION_CHECKLIST_UPDATED" })).toBe(2);
  });
  it("discontinues and archives one application without changing the other application or student", async () => {
    const student = await identity("STUDENT"); const counsellor = await identity("COUNSELLOR");
    const first = await Application.create({ studentId: student.user._id, assignedCounsellorId: counsellor.user._id, assignmentState: "ASSIGNED", stage: "COUNSELLING", active: true, preferredCountry: "Canada" });
    const second = await Application.create({ studentId: student.user._id, assignedCounsellorId: counsellor.user._id, assignmentState: "ASSIGNED", stage: "PROFILE_ASSESSMENT", active: true, preferredCountry: "Australia" });
    await Task.create({ title: "First follow-up", studentId: student.user._id, applicationId: first._id, counsellorId: counsellor.user._id, dueAt: new Date(), priority: "HIGH", status: "OPEN", createdBy: counsellor.user._id });
    await mutate("post", `/api/v1/crm/applications/${String(first._id)}/discontinue`, counsellor).send({ reason: "Student chose a different active application", confirm: true }).expect(200);
    expect((await Application.findById(second._id))!.stage).toBe("PROFILE_ASSESSMENT");
    expect((await User.findById(student.user._id))!.status).toBe("ACTIVE");
    expect((await Task.findOne({ applicationId: first._id }))!.status).toBe("CANCELLED");
    await mutate("post", `/api/v1/crm/applications/${String(first._id)}/archive`, counsellor).send({ reason: "Terminal application retained for the audit record", confirmation: "ARCHIVE APPLICATION" }).expect(200);
    expect((await Application.findById(first._id))!.archivedAt).toBeInstanceOf(Date);
    await mutate("post", `/api/v1/crm/applications/${String(first._id)}/transition`, counsellor).send({ stage: "PROFILE_ASSESSMENT", note: "Cannot mutate archive" }).expect(409);
  });
  it("allows only a fresh-MFA administrator to restore without reversing discontinuation", async () => {
    const student = await identity("STUDENT"); const admin = await identity("ADMIN");
    const application = await Application.create({ studentId: student.user._id, stage: "DISCONTINUED", active: false, preferredCountry: "Canada", archivedAt: new Date(), archivedBy: admin.user._id, archiveReason: "Coursework archive" });
    await mutate("post", `/api/v1/crm/applications/${String(application._id)}/restore`, admin).send({ reason: "Restore visibility for administrator review", confirmation: "RESTORE APPLICATION" }).expect(200);
    const restored = await Application.findById(application._id);
    expect(restored).toMatchObject({ stage: "DISCONTINUED", active: false });
    expect(restored!.archivedAt).toBeUndefined();
  });
  it("reconciles the unassigned backlog oldest-first and protects the administrator action", async () => {
    const admin = await identity("ADMIN"); const firstStudent = await identity("STUDENT", "first"); const secondStudent = await identity("STUDENT", "second");
    const first = await Application.create({ studentId: firstStudent.user._id, stage: "ENQUIRY_RECORDED", active: true, preferredCountry: "Canada", createdAt: new Date(Date.now() - 10_000) });
    const second = await Application.create({ studentId: secondStudent.user._id, stage: "ENQUIRY_RECORDED", active: true, preferredCountry: "Australia" });
    await ApplicationStageHistory.create([
      { applicationId: first._id, newStage: "ENQUIRY_RECORDED", actorId: firstStudent.user._id, actorRole: "STUDENT", reason: "Enquiry recorded" },
      { applicationId: second._id, newStage: "ENQUIRY_RECORDED", actorId: secondStudent.user._id, actorRole: "STUDENT", reason: "Enquiry recorded" },
    ]);
    await identity("COUNSELLOR");
    await request(app).post("/api/v1/crm/assignments/automatic").set("Origin", "http://evil.example").set("Cookie", admin.cookie).set("x-csrf-token", admin.csrf).send({ confirmation: "RUN AUTOMATIC ASSIGNMENT" }).expect(403);
    const result = await mutate("post", "/api/v1/crm/assignments/automatic", admin).send({ confirmation: "RUN AUTOMATIC ASSIGNMENT" }).expect(200);
    expect(result.body).toMatchObject({ assigned: 2, remaining: 0, skipped: 0 });
    expect((await Application.findById(first._id))!.assignedCounsellorId).toBeTruthy();
    expect(await Task.countDocuments({ automationKey: /^enquiry-follow-up:/ })).toBe(2);
    expect(await ApplicationStageHistory.countDocuments({ transactionReference: /^application-assignment:/ })).toBe(2);
  });
  it("completes the isolated two-application assignment and lifecycle journey", async () => {
    const student = await identity("STUDENT", "journey"); const counsellor = await identity("COUNSELLOR", "journey"); const admin = await identity("ADMIN", "journey");
    const firstResponse = await mutate("post", "/api/v1/crm/applications", student).send({ preferredCountry: "Canada", institution: "North College", program: "Computing", intendedIntake: "Fall 2027" }).expect(201);
    const secondResponse = await mutate("post", "/api/v1/crm/applications", student).send({ preferredCountry: "Australia", institution: "South University", program: "Business", intendedIntake: "Spring 2028" }).expect(201);
    const firstId = String(firstResponse.body.application._id); const secondId = String(secondResponse.body.application._id);
    expect(firstId).not.toBe(secondId);
    expect(String((await Application.findById(firstId))!.assignedCounsellorId)).toBe(String(counsellor.user._id));
    expect(String((await Application.findById(secondId))!.assignedCounsellorId)).toBe(String(counsellor.user._id));
    expect(await Task.countDocuments({ studentId: student.user._id, automationKey: /^enquiry-follow-up:/ })).toBe(2);
    for (const [stage, note] of [
      ["PROFILE_ASSESSMENT", "Profile reviewed"],
      ["COUNSELLING", "Counselling completed"],
      ["COURSE_SHORTLISTING", "Course shortlist agreed"],
    ] as const) {
      await mutate("post", `/api/v1/crm/applications/${firstId}/transition`, counsellor).send({ stage, note }).expect(200);
    }
    await mutate("post", `/api/v1/crm/applications/${firstId}/transition`, counsellor).send({ stage: "INSTITUTION_SUBMITTED", note: "Illegal skip" }).expect(409);
    await mutate("post", `/api/v1/crm/applications/${firstId}/discontinue`, counsellor).send({ reason: "Student retained the separate Australian application", confirm: true }).expect(200);
    await mutate("post", `/api/v1/crm/applications/${firstId}/archive`, counsellor).send({ reason: "Retain completed discontinued record safely", confirmation: "ARCHIVE APPLICATION" }).expect(200);
    expect((await Application.findById(secondId))!.active).toBe(true);
    expect((await User.findById(student.user._id))!.status).toBe("ACTIVE");
    await request(app).get(`/api/v1/crm/applications/${firstId}`).set("Cookie", student.cookie).expect(200);
    const counsellorView = await request(app).get("/api/v1/crm/applications?limit=50").set("Cookie", counsellor.cookie).expect(200);
    expect(counsellorView.body.applications.map((item: { _id: string }) => String(item._id))).toContain(secondId);
    await request(app).get(`/api/v1/crm/applications/${firstId}`).set("Cookie", admin.cookie).expect(200);
  });
});

describe("admin assignments, notes, tasks and summaries", () => {
  it("allows admin assignment, denies non-admin and rejects suspended counsellors", async () => {
    const admin = await identity("ADMIN"); const student = await identity("STUDENT"); const counsellor = await identity("COUNSELLOR"); const otherStudent = await identity("STUDENT", "other");
    await Application.create({ studentId: student.user._id, stage: "ENQUIRY_RECORDED", active: true, preferredCountry: "Canada" });
    await Application.create({ studentId: otherStudent.user._id, stage: "ENQUIRY_RECORDED", active: true, preferredCountry: "Australia" });
    await mutate("post", "/api/v1/crm/assignments", student).send({ studentId: student.user._id, counsellorId: counsellor.user._id, reason: "Unauthorized assignment" }).expect(403);
    await mutate("post", "/api/v1/crm/assignments", admin).send({ studentId: student.user._id, counsellorId: counsellor.user._id, reason: "Administrator workload assignment" }).expect(201);
    await mutate("post", "/api/v1/crm/assignments", admin).send({ studentId: student.user._id, counsellorId: counsellor.user._id, reason: "Duplicate assignment attempt" }).expect(400);
    counsellor.user.status = "SUSPENDED"; await counsellor.user.save();
    await mutate("post", "/api/v1/crm/assignments", admin).send({ studentId: otherStudent.user._id, counsellorId: counsellor.user._id, reason: "Suspended counsellor attempt" }).expect(400);
  });
  it("protects internal notes and returns script content as text data", async () => {
    const student = await identity("STUDENT"); const counsellor = await identity("COUNSELLOR");
    await CounsellorAssignment.create({ studentId: student.user._id, counsellorId: counsellor.user._id, assignedBy: counsellor.user._id, reason: "Test assignment" });
    const content = "<script>alert('x')</script>";
    const created = await mutate("post", `/api/v1/crm/students/${String(student.user._id)}/notes`, counsellor).send({ content }).expect(201);
    expect(created.body.note.content).toBe(content);
    await request(app).get(`/api/v1/crm/students/${String(student.user._id)}/notes`).set("Cookie", student.cookie).expect(403);
  });
  it("protects staff tasks and records completion timestamps", async () => {
    const student = await identity("STUDENT"); const counsellor = await identity("COUNSELLOR");
    const task = await Task.create({ title: "Follow up", studentId: student.user._id, counsellorId: counsellor.user._id, dueAt: new Date(Date.now() + 10000), priority: "MEDIUM", status: "OPEN", createdBy: counsellor.user._id });
    await request(app).get("/api/v1/crm/tasks").set("Cookie", student.cookie).expect(403);
    const completed = await mutate("post", `/api/v1/crm/tasks/${String(task._id)}/complete`, counsellor).send({}).expect(200);
    expect(completed.body.task.completedAt).toBeTruthy();
  });
  it("returns role-specific summaries without cross-role access", async () => {
    const student = await identity("STUDENT"); const counsellor = await identity("COUNSELLOR"); const admin = await identity("ADMIN");
    await request(app).get("/api/v1/crm/dashboard/student").set("Cookie", student.cookie).expect(200);
    await request(app).get("/api/v1/crm/dashboard/counsellor").set("Cookie", counsellor.cookie).expect(200);
    await request(app).get("/api/v1/crm/dashboard/admin").set("Cookie", admin.cookie).expect(200);
    await request(app).get("/api/v1/crm/dashboard/admin").set("Cookie", student.cookie).expect(403);
  });
  it("rejects missing CSRF and clamps pagination", async () => {
    const counsellor = await identity("COUNSELLOR"); const student = await identity("STUDENT");
    await request(app).post("/api/v1/crm/tasks").set("Cookie", counsellor.cookie).send({ title: "No CSRF", studentId: student.user._id, dueAt: new Date(), priority: "LOW" }).expect(403);
    const result = await request(app).get("/api/v1/crm/tasks?limit=999999&page=-4&sort=passwordHash").set("Cookie", counsellor.cookie).expect(200);
    expect(result.body.limit).toBe(50); expect(result.body.page).toBe(1);
  });
  it("validates, audits and consistently enforces administrator IP rules", async () => {
    const admin = await identity("ADMIN"); const student = await identity("STUDENT");
    await mutate("post", "/api/v1/admin/ip-rules", admin).send({ cidr: "not-a-network", action: "DENY", reason: "Invalid rule test" }).expect(400);
    const created = await mutate("post", "/api/v1/admin/ip-rules", admin).send({ cidr: "203.0.113.0/24", action: "DENY", reason: "Block documented test network" }).expect(201);
    expect((await request(app).get("/api/v1/admin/ip-rules").set("Cookie", admin.cookie).expect(200)).body.rules).toHaveLength(1);
    await mutate("delete", `/api/v1/admin/ip-rules/${created.body.rule._id}`, admin).send({ reason: "Remove completed test rule" }).expect(204);
    expect(await AuditLog.countDocuments({ event: { $in: ["IP_ACCESS_RULE_CREATED", "IP_ACCESS_RULE_REMOVED"] } })).toBe(2);

    await IpAccessRule.create({ cidr: "127.0.0.1/32", action: "DENY", reason: "Local enforcement test" });
    await request(app).get("/api/v1/access/student").set("Cookie", student.cookie).expect(403);
    await request(app).get("/api/health").expect(200);
    expect(await AuditLog.countDocuments({ event: "IP_ACCESS_DENIED" })).toBe(1);
    await IpAccessRule.deleteMany({});

    await IpAccessRule.create({ cidr: "203.0.113.5/32", action: "ALLOW", reason: "Allow-list default deny test" });
    await request(app).get("/api/v1/access/student").set("Cookie", student.cookie).expect(403);
    await IpAccessRule.deleteMany({});
  });
});
