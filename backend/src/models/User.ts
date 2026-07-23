import { Schema, model } from "mongoose";

export const roles = ["STUDENT", "COUNSELLOR", "ADMIN"] as const;
export type Role = (typeof roles)[number];

export interface IUser {
  fullName: string;
  email: string;
  role: Role;
  passwordHash: string;
  passwordChangedAt: Date;
  passwordExpiresAt: Date;
  emailVerifiedAt?: Date;
  consentAt?: Date;
  status: "ACTIVE" | "SUSPENDED";
  lockedUntil?: Date;
  failedLoginCount: number;
  mfaEnabled: boolean;
  mfaSecretEncrypted?: string;
  recoveryCodeHashes: string[];
  lastAuthenticatedAt?: Date;
}

const userSchema = new Schema<IUser>({
  fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254, index: true },
  role: { type: String, enum: roles, required: true, default: "STUDENT" },
  passwordHash: { type: String, required: true, select: false },
  passwordChangedAt: { type: Date, required: true },
  passwordExpiresAt: { type: Date, required: true },
  emailVerifiedAt: Date,
  consentAt: Date,
  status: { type: String, enum: ["ACTIVE", "SUSPENDED"], default: "ACTIVE", required: true },
  lockedUntil: Date,
  failedLoginCount: { type: Number, default: 0, min: 0, select: false },
  mfaEnabled: { type: Boolean, default: false },
  mfaSecretEncrypted: { type: String, select: false },
  recoveryCodeHashes: { type: [String], default: [], select: false },
  lastAuthenticatedAt: Date,
}, { timestamps: true, strict: "throw", versionKey: false });

userSchema.set("toJSON", {
  transform: (_doc, value) => {
    const safe = value as unknown as Record<string, unknown>;
    delete safe.passwordHash;
    delete safe.mfaSecretEncrypted;
    delete safe.recoveryCodeHashes;
    delete safe.failedLoginCount;
    return value;
  },
});

export const User = model<IUser>("User", userSchema);
