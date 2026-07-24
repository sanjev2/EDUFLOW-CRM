import nodemailer from "nodemailer";
import { config } from "../config.js";
import { deliverDevelopmentLink } from "../security/outbox.js";
import { sha256 } from "../security/crypto.js";

export interface EmailMessage {
  type: "VERIFY_EMAIL" | "RESET_PASSWORD" | "COUNSELLOR_INVITATION";
  to: string;
  recipientName: string;
  subject: string;
  text: string;
  html: string;
  link: string;
}

export function counsellorInvitationMessage(input: { email: string; fullName: string; verificationToken: string; setupToken: string }): EmailMessage {
  assertSafeAddress(input.email);
  assertSafeDisplayName(input.fullName);
  const link = `${config.PUBLIC_APP_URL}/accept-invitation?verification=${encodeURIComponent(input.verificationToken)}&setup=${encodeURIComponent(input.setupToken)}`;
  const name = escapeHtml(input.fullName);
  return {
    type: "COUNSELLOR_INVITATION", to: input.email, recipientName: input.fullName, link,
    subject: "Accept your EduFlow counsellor invitation",
    text: `Hello ${input.fullName},\n\nAn EduFlow administrator invited you to a counsellor account. Verify your email and set your own password within 24 hours:\n${link}\n\nThis invitation is single-use. If you were not expecting it, ignore this email.`,
    html: `<p>Hello ${name},</p><p>An EduFlow administrator invited you to a counsellor account.</p><p><a href="${escapeHtml(link)}">Verify your email and set your password</a></p><p>This single-use invitation expires in 24 hours.</p><p>If you were not expecting it, ignore this email.</p>`,
  };
}
export type DeliveryCategory = "ACCEPTED" | "REJECTED" | "PENDING" | "LOCAL_OUTBOX";
export interface DeliveryReceipt {
  acceptedRecipientCount: number;
  rejectedRecipientCount: number;
  pendingRecipientCount: number;
  smtpStatus: string;
  category: DeliveryCategory;
  messageIdHash?: string;
  deliveredAt: string;
}
export interface EmailTransport { send(message: EmailMessage): Promise<DeliveryReceipt>; }

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

function addressValue(value: unknown) {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (value && typeof value === "object" && "address" in value && typeof value.address === "string") {
    return value.address.trim().toLowerCase();
  }
  return "";
}

function smtpStatus(response: unknown) {
  const match = typeof response === "string" ? response.match(/^\s*(\d{3})\b/) : null;
  return match?.[1] ?? "UNKNOWN";
}

export function sanitizeProviderReceipt(info: {
  accepted?: unknown[];
  rejected?: unknown[];
  pending?: unknown[];
  response?: unknown;
  messageId?: unknown;
}, intendedRecipient: string): DeliveryReceipt {
  const intended = intendedRecipient.trim().toLowerCase();
  const accepted = (info.accepted ?? []).map(addressValue).filter(Boolean);
  const rejected = (info.rejected ?? []).map(addressValue).filter(Boolean);
  const pending = (info.pending ?? []).map(addressValue).filter(Boolean);
  const acceptedIntended = accepted.includes(intended);
  const rejectedIntended = rejected.includes(intended);
  const pendingIntended = pending.includes(intended);
  const category: DeliveryCategory = acceptedIntended && !rejectedIntended && !pendingIntended
    ? "ACCEPTED"
    : pendingIntended || pending.length > 0
      ? "PENDING"
      : "REJECTED";
  return {
    acceptedRecipientCount: accepted.length,
    rejectedRecipientCount: rejected.length,
    pendingRecipientCount: pending.length,
    smtpStatus: smtpStatus(info.response),
    category,
    ...(typeof info.messageId === "string" && info.messageId ? { messageIdHash: sha256(info.messageId) } : {}),
    deliveredAt: new Date().toISOString(),
  };
}

export function providerAccepted(receipt: DeliveryReceipt) {
  return (receipt.category === "ACCEPTED" || receipt.category === "LOCAL_OUTBOX")
    && receipt.acceptedRecipientCount === 1
    && receipt.rejectedRecipientCount === 0
    && receipt.pendingRecipientCount === 0;
}

export function deliveryReceiptMetadata(receipt: DeliveryReceipt) {
  return {
    acceptedRecipientCount: receipt.acceptedRecipientCount,
    rejectedRecipientCount: receipt.rejectedRecipientCount,
    pendingRecipientCount: receipt.pendingRecipientCount,
    smtpStatus: receipt.smtpStatus,
    deliveryCategory: receipt.category,
    ...(receipt.messageIdHash ? { messageIdHash: receipt.messageIdHash } : {}),
    deliveredAt: receipt.deliveredAt,
  };
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
      return Promise.resolve({
        acceptedRecipientCount: 1,
        rejectedRecipientCount: 0,
        pendingRecipientCount: 0,
        smtpStatus: "LOCAL",
        category: "LOCAL_OUTBOX",
        deliveredAt: new Date().toISOString(),
      });
    } };
  }
  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST, port: config.SMTP_PORT, secure: config.SMTP_SECURE,
    requireTLS: !config.SMTP_SECURE,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
  });
  return {
    send: async (message) => {
      const info = await transporter.sendMail({
        from: { name: config.EMAIL_FROM_NAME, address: config.EMAIL_FROM_ADDRESS! },
        to: { name: message.recipientName, address: message.to },
        subject: message.subject, text: message.text, html: message.html,
      });
      return sanitizeProviderReceipt(info, message.to);
    },
  };
}

export async function sendEmailVerification(input: { email: string; fullName: string; token: string }) {
  return configuredTransport().send(verificationMessage(input));
}
export async function sendPasswordReset(input: { email: string; fullName: string; token: string }) {
  return configuredTransport().send(passwordResetMessage(input));
}
export async function sendCounsellorInvitation(input: { email: string; fullName: string; verificationToken: string; setupToken: string }) {
  return configuredTransport().send(counsellorInvitationMessage(input));
}
