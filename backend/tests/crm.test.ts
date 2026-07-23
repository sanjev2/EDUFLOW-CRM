import request from "supertest";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { roles, User, type Role } from "../src/models/User.js";
import { Session } from "../src/models/Session.js";
import { CounsellorAssignment } from "../src/models/CounsellorAssignment.js";
import { Application } from "../src/models/Application.js";
import { ApplicationStageHistory } from "../src/models/ApplicationStageHistory.js";
import { Task } from "../src/models/Task.js";
import { SecurityAlert } from "../src/models/Security.js";
import { hashPassword } from "../src/security/password.js";
import { randomToken, sha256 } from "../src/security/crypto.js";

beforeAll(async () => { expect(process.env.MONGODB_URI).toMatch(/eduflow_crm_test$/); if (!mongoose.connection.readyState) await mongoose.connect(process.env.MONGODB_URI!); });
beforeEach(async () => { await mongoose.connection.db!.dropDatabase(); await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes())); });
afterAll(async () => { await mongoose.connection.db!.dropDatabase(); await mongoose.disconnect(); });

const password = "Coursework-Secure9!";
async function identity(role: Role, suffix = randomToken(4)) {
  const now = new Date(); const isAdmin = role === roles[2]; const user = await User.create({ fullName: `${role} User`, email: `${role.toLowerCase()}-${suffix}@example.test`, role, passwordHash: await hashPassword(password), emailVerifiedAt: now, passwordChangedAt: now, passwordExpiresAt: new Date(Date.now() + 86400000), mfaEnabled: isAdmin });
  const token = randomToken(); const csrf = randomToken();
  await Session.create({ userId: user._id, tokenHash: sha256(token), csrfHash: sha256(csrf), expiresAt: new Date(Date.now() + 86400000), idleExpiresAt: new Date(Date.now() + 3600000), lastActivityAt: now, userAgent: "crm-test", ipAddress: "127.0.0.1", mfaComplete: isAdmin, freshUntil: new Date(Date.now() + 600000) });
  return { user, cookie: `eduflow_session=${token}`, csrf };
}
const mutate = (method: "post"|"put"|"patch"|"delete", path: string, auth: Awaited<ReturnType<typeof identity>>) => request(app)[method](path).set("Cookie", auth.cookie).set("x-csrf-token", auth.csrf);

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
    expect(created.body.application.stage).toBe("ENQUIRY");
    expect(String((await CounsellorAssignment.findOne({ studentId: student.user._id }))!.counsellorId)).toBe(String(first.user._id));
    expect(await ApplicationStageHistory.countDocuments()).toBe(1);
    expect(await Task.countDocuments({ automationKey: `enquiry-follow-up:${String(student.user._id)}` })).toBe(1);
    await mutate("post", "/api/v1/crm/applications", student).send({}).expect(409);
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

describe("admin assignments, notes, tasks and summaries", () => {
  it("allows admin assignment, denies non-admin and rejects suspended counsellors", async () => {
    const admin = await identity("ADMIN"); const student = await identity("STUDENT"); const counsellor = await identity("COUNSELLOR"); const otherStudent = await identity("STUDENT", "other");
    await mutate("post", "/api/v1/crm/assignments", student).send({ studentId: student.user._id, counsellorId: counsellor.user._id, reason: "Unauthorized assignment" }).expect(403);
    await mutate("post", "/api/v1/crm/assignments", admin).send({ studentId: student.user._id, counsellorId: counsellor.user._id, reason: "Administrator workload assignment" }).expect(201);
    await mutate("post", "/api/v1/crm/assignments", admin).send({ studentId: student.user._id, counsellorId: counsellor.user._id, reason: "Duplicate assignment attempt" }).expect(409);
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
});
