import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { config } from "./config.js";
import { databaseHealth } from "./database.js";
import { ApiError, errorHandler, notFound } from "./errors.js";
import { logger } from "./logger.js";

declare global {
  namespace Express {
    interface Request { id: string; }
  }
}

export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: config.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  req.id = req.header("x-request-id")?.slice(0, 128) || randomUUID();
  res.setHeader("x-request-id", req.id);
  next();
});
app.use(pinoHttp({ logger, customProps: (req) => ({ requestId: req.id }) }));

app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "eduflow-api" }));
app.get("/api/v1/health/database", (_req, res) => {
  const health = databaseHealth();
  res.status(health.status === "ok" ? 200 : 503).json(health);
});
if (config.NODE_ENV === "test") app.get("/api/v1/test/error", () => { throw new ApiError(418, "TEST_ERROR", "Test error"); });
app.use(notFound);
app.use(errorHandler);
