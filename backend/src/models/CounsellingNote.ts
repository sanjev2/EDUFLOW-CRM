import { Schema, model, type Types } from "mongoose";
export interface ICounsellingNote { studentId: Types.ObjectId; authorId: Types.ObjectId; content: string; createdAt: Date; updatedAt: Date; }
const schema = new Schema<ICounsellingNote>({
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true, immutable: true },
  authorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true, immutable: true },
  content: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
}, { timestamps: true, strict: "throw", versionKey: false });
export const CounsellingNote = model<ICounsellingNote>("CounsellingNote", schema);
