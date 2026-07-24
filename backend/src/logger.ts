import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.x-csrf-token",
      "res.headers.set-cookie",
      "req.body.password",
      "req.body.passwordConfirmation",
      "req.body.currentPassword",
      "req.body.temporaryPassword",
      "req.body.token",
      "req.body.secret",
      "req.body.code",
      "req.body.mfaCode",
      "req.body.captchaAnswer",
      "req.body.challenge",
    ],
    censor: "[REDACTED]",
  },
});
