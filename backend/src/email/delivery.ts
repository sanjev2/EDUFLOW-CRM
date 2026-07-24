import nodemailer from "nodemailer";
import { config } from "../config.js";
import { deliverDevelopmentLink } from "../security/outbox.js";

export interface EmailMessage {
  type: "VERIFY_EMAIL" | "RESET_PASSWORD";
  to: string;
  recipientName: string;
  subject: string;
  text: string;
  html: string;
  link: string;
}
export interface EmailTransport { send(message: EmailMessage): Promise<void>; }

let testTransport: EmailTransport | undefined;
export function setEmailTransportForTests(transport?: EmailTransport) { testTransport = transport; }

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function assertSafeAddress(value: string) {
  if (/[\r\n]/.test(value)) throw new Error("Invalid email recipient");
}
function assertSafeDisplayName(value: string) {
  if (/[\r\n]/.test(value)) throw new Error("Invalid email recipient name");
}

export function verificationMessage(input: { email: string; fullName: string; token: string }): EmailMessage {
  assertSafeAddress(input.email);
  assertSafeDisplayName(input.fullName);
  const link = `${config.PUBLIC_APP_URL}/verify-email?token=${encodeURIComponent(input.token)}`;
  const name = escapeHtml(input.fullName);
  return {
    type: "VERIFY_EMAIL", to: input.email, recipientName: input.fullName, link,
    subject: "Verify your EduFlow email",
    text: `Hello ${input.fullName},\n\nAn EduFlow student account was registered with this email address. Verify it within 24 hours:\n${link}\n\nIf you did not request registration, ignore this email.`,
    html: `<p>Hello ${name},</p><p>An EduFlow student account was registered with this email address.</p><p><a href="${escapeHtml(link)}">Verify your email</a></p><p>This link expires in 24 hours.</p><p>If you did not request registration, ignore this email.</p>`,
  };
}

export function passwordResetMessage(input: { email: string; fullName: string; token: string }): EmailMessage {
  assertSafeAddress(input.email);
  assertSafeDisplayName(input.fullName);
  const link = `${config.PUBLIC_APP_URL}/reset-password?token=${encodeURIComponent(input.token)}`;
  const name = escapeHtml(input.fullName);
  return {
    type: "RESET_PASSWORD", to: input.email, recipientName: input.fullName, link,
    subject: "Reset your EduFlow password",
    text: `Hello ${input.fullName},\n\nA password reset was requested for your EduFlow account. Use this link within 30 minutes:\n${link}\n\nIf you did not request a reset, ignore this email. Your password does not change until the link is used.`,
    html: `<p>Hello ${name},</p><p>A password reset was requested for your EduFlow account.</p><p><a href="${escapeHtml(link)}">Reset your password</a></p><p>This link expires in 30 minutes.</p><p>If you did not request a reset, ignore this email. Your password does not change until the link is used.</p>`,
  };
}

function configuredTransport(): EmailTransport {
  if (testTransport) return testTransport;
  if (config.EMAIL_DELIVERY_MODE === "outbox") {
    return { send: (message) => {
      deliverDevelopmentLink({ type: message.type, email: message.to, link: message.link, createdAt: new Date().toISOString() });
      return Promise.resolve();
    } };
  }
  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST, port: config.SMTP_PORT, secure: config.SMTP_SECURE,
    requireTLS: !config.SMTP_SECURE,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
  });
  return {
    send: async (message) => {
      await transporter.sendMail({
        from: { name: config.EMAIL_FROM_NAME, address: config.EMAIL_FROM_ADDRESS! },
        to: { name: message.recipientName, address: message.to },
        subject: message.subject, text: message.text, html: message.html,
      });
    },
  };
}

export async function sendEmailVerification(input: { email: string; fullName: string; token: string }) {
  await configuredTransport().send(verificationMessage(input));
}
export async function sendPasswordReset(input: { email: string; fullName: string; token: string }) {
  await configuredTransport().send(passwordResetMessage(input));
}
