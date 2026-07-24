import pino from "pino";

export const loggerOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.x-csrf-token",
      "res.headers.set-cookie",
      "smtpPassword",
      "smtpUser",
      "SMTP_PASSWORD",
      "SMTP_USER",
      "verificationToken",
      "resetToken",
      "message.text",
      "message.html",
      "message.link",
      "message.url",
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
};
export const logger = pino(loggerOptions);
