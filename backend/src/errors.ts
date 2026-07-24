import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "./logger.js";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export const notFound: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, "NOT_FOUND", `Route ${req.method} ${req.path} was not found`));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  void _next;
  let apiError = error instanceof ApiError ? error : new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  if (error instanceof ZodError) apiError = new ApiError(400, "VALIDATION_ERROR", "Request validation failed", error.flatten());
  if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") {
    apiError = new ApiError(413, "PAYLOAD_TOO_LARGE", "The request body exceeds the allowed size");
  }
  if (apiError.status >= 500) logger.error({ err: error, requestId: req.id }, "Request failed");
  res.status(apiError.status).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details === undefined ? {} : { details: apiError.details }),
      requestId: req.id,
    },
  });
};
