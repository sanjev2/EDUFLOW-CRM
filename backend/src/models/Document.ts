import { Schema, model, type Types } from "mongoose";

export const documentCategories = ["PASSPORT", "ACADEMIC_TRANSCRIPT", "ENGLISH_TEST", "FINANCIAL", "OTHER"] as const;
export type DocumentCategory = (typeof documentCategories)[number];

export interface IDocument {
  ownerId: Types.ObjectId;
  applicationId?: Types.ObjectId;
  category: DocumentCategory;
  originalFilename: string;
  storedFilename: string;
  detectedMimeType: "application/pdf" | "image/jpeg" | "image/png";
  size: number;
  integrityHash: string;
  status: "AVAILABLE";
  uploadedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IDocument>({
  ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true, index: true },
  applicationId: { type: Schema.Types.ObjectId, ref: "Application", immutable: true, index: true },
  category: { type: String, enum: documentCategories, required: true, immutable: true },
  originalFilename: { type: String, required: true, maxlength: 180, immutable: true },
  storedFilename: { type: String, required: true, unique: true, select: false, immutable: true },
  detectedMimeType: { type: String, enum: ["application/pdf", "image/jpeg", "image/png"], required: true, immutable: true },
  size: { type: Number, required: true, min: 1, max: 5 * 1024 * 1024, immutable: true },
  integrityHash: { type: String, required: true, select: false, immutable: true },
  status: { type: String, enum: ["AVAILABLE"], default: "AVAILABLE", required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
}, { timestamps: true, strict: "throw", versionKey: false });

schema.index({ ownerId: 1, createdAt: -1 });
export const Document = model<IDocument>("Document", schema);
