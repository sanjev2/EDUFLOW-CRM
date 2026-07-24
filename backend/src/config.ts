import "dotenv/config";
import path from "node:path";
import { z } from "zod";

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
});

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
