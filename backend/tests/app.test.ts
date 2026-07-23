import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

let app: typeof import("../src/app.js").app;
beforeAll(async () => {
  process.env.NODE_ENV = "test";
  ({ app } = await import("../src/app.js"));
});

describe("API foundation", () => {
  it("returns API health", async () => {
    const response = await request(app).get("/api/health").expect(200);
    expect(response.body).toEqual({ status: "ok", service: "eduflow-api" });
  });
  it("returns a consistent not-found error", async () => {
    const response = await request(app).get("/missing").expect(404);
    expect(response.body.error).toMatchObject({ code: "NOT_FOUND", message: expect.any(String), requestId: expect.any(String) });
  });
  it("uses the central error-response shape", async () => {
    const response = await request(app).get("/api/v1/test/error").expect(418);
    expect(response.body.error).toMatchObject({ code: "TEST_ERROR", message: "Test error", requestId: expect.any(String) });
  });
});
