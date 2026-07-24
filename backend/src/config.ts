import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

const rootEnvironmentPath = path.basename(process.cwd()).toLowerCase() === "backend"
  ? path.resolve(process.cwd(), "../.env")
  : path.resolve(process.cwd(), ".env");
const rootEnvironment = process.env.NODE_ENV === "test" || process.env.VITEST
  ? { error: undefined }
  : dotenv.config({ path: rootEnvironmentPath });
export const configurationSource = rootEnvironment.error ? "process environment" : "root .env";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BACKEND_PORT: z.coerce.number().int().positive().default(5001),
  FRONTEND_URL: z.string().url().default("http://localhost:3100"),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/eduflow_crm"),
  SESSION_SECRET: z.string().min(32).default("development-session-secret-change-me-now"),
  FIELD_ENCRYPTION_KEY: z.string().min(32).default("development-field-key-change-me-now"),
  PASSWORD_PEPPER: z.string().default(""),
  COOKIE_DOMAIN: z.string().optional(),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().positive().default(24),
  SESSION_IDLE_MINUTES: z.coerce.number().positive().default(30),
  PASSWORD_MAX_AGE_DAYS: z.coerce.number().positive().default(90),
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(8192).default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().min(2).default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),
  UPLOAD_ROOT: z.string().min(1).default(path.resolve("uploads")),
  EMAIL_DELIVERY_MODE: z.enum(["outbox", "smtp"]).default("outbox"),
  SMTP_HOST: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().min(1).max(253).regex(/^[A-Za-z0-9.-]+$/).optional()),
  SMTP_PORT: z.preprocess((value) => value === "" || value === undefined ? undefined : value, z.coerce.number().int().min(1).max(65535).optional()),
  SMTP_SECURE: z.preprocess((value) => value === "" || value === undefined ? undefined : value, z.enum(["true", "false"]).transform((value) => value === "true").optional()),
  SMTP_USER: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).max(254).refine((value) => !/[\r\n]/.test(value)).optional()),
  SMTP_PASSWORD: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).max(1024).optional()),
  EMAIL_FROM_NAME: z.string().trim().min(1).max(100).refine((value) => !/[\r\n]/.test(value), "Sender name contains invalid characters").default("EduFlow"),
  EMAIL_FROM_ADDRESS: z.preprocess((value) => value === "" ? undefined : value, z.string().email().max(254).optional()),
  PUBLIC_APP_URL: z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "PUBLIC_APP_URL must use HTTP or HTTPS").default("http://localhost:3100"),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === "production" && value.EMAIL_DELIVERY_MODE !== "smtp") {
    ctx.addIssue({ code: "custom", path: ["EMAIL_DELIVERY_MODE"], message: "Production requires SMTP email delivery" });
  }
  if (value.NODE_ENV === "production") {
    if (!value.FRONTEND_URL.startsWith("https://")) ctx.addIssue({ code: "custom", path: ["FRONTEND_URL"], message: "Production requires HTTPS termination" });
    if (!value.PUBLIC_APP_URL.startsWith("https://")) ctx.addIssue({ code: "custom", path: ["PUBLIC_APP_URL"], message: "Production requires HTTPS termination" });
  }
  if (value.EMAIL_DELIVERY_MODE === "smtp") {
    for (const field of ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM_ADDRESS"] as const) {
      if (value[field] === undefined) ctx.addIssue({ code: "custom", path: [field], message: `${field} is required for SMTP delivery` });
    }
  }
});

export function parseConfig(environment: NodeJS.ProcessEnv) {
  const parsed = schema.safeParse(environment);
  if (!parsed.success) throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  return parsed.data;
}

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}
export const config = parsed.data;

if (config.NODE_ENV === "production") {
  for (const key of ["SESSION_SECRET", "FIELD_ENCRYPTION_KEY"] as const) {
    if (config[key].startsWith("development-")) throw new Error(`${key} must be configured in production`);
  }
}
