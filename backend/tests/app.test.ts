import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

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
  it("requires HTTPS termination URLs in production configuration", () => {
    const production = {
      NODE_ENV: "production", EMAIL_DELIVERY_MODE: "smtp",
      SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_SECURE: "false",
      SMTP_USER: "mailer@example.test", SMTP_PASSWORD: "application-password",
      EMAIL_FROM_ADDRESS: "mailer@example.test",
      SESSION_SECRET: "s".repeat(32), FIELD_ENCRYPTION_KEY: "e".repeat(32),
    };
    expect(() => parseConfig({ ...production, FRONTEND_URL: "http://example.test", PUBLIC_APP_URL: "http://example.test" })).toThrow(/HTTPS termination/);
    expect(parseConfig({ ...production, FRONTEND_URL: "https://example.test", PUBLIC_APP_URL: "https://example.test" }).NODE_ENV).toBe("production");
  });
});
