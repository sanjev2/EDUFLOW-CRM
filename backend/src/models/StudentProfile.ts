import { Schema, model, type Types } from "mongoose";

export interface IStudentProfile {
  userId: Types.ObjectId;
  phone?: string;
  dateOfBirth?: Date;
  addressLine?: string;
  city?: string;
  province?: string;
  country: string;
  highestQualification?: string;
  institutionName?: string;
  completionYear?: number;
  resultType?: "GPA" | "PERCENTAGE";
  resultValue?: number;
  englishTestType: "IELTS" | "PTE" | "DUOLINGO" | "NONE";
  englishTestScore?: number;
  preferredCountry?: string;
  preferredStudyLevel?: string;
  intendedIntake?: string;
  previousVisaRefusal?: boolean;
  refusalExplanation?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IStudentProfile>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, immutable: true },
  phone: { type: String, trim: true, maxlength: 24 },
  dateOfBirth: Date,
  addressLine: { type: String, trim: true, maxlength: 180 },
  city: { type: String, trim: true, maxlength: 80 },
  province: { type: String, trim: true, maxlength: 80 },
  country: { type: String, trim: true, maxlength: 80, default: "Nepal" },
  highestQualification: { type: String, trim: true, maxlength: 100 },
  institutionName: { type: String, trim: true, maxlength: 140 },
  completionYear: { type: Number, min: 1950, max: 2100 },
  resultType: { type: String, enum: ["GPA", "PERCENTAGE"] },
  resultValue: { type: Number, min: 0, max: 100 },
  englishTestType: { type: String, enum: ["IELTS", "PTE", "DUOLINGO", "NONE"], default: "NONE" },
  englishTestScore: { type: Number, min: 0, max: 200 },
  preferredCountry: { type: String, trim: true, maxlength: 80 },
  preferredStudyLevel: { type: String, trim: true, maxlength: 80 },
  intendedIntake: { type: String, trim: true, maxlength: 80 },
  previousVisaRefusal: Boolean,
  refusalExplanation: { type: String, trim: true, maxlength: 500 },
}, { timestamps: true, strict: "throw", versionKey: false });

export const PROFILE_FIELDS = ["phone", "dateOfBirth", "addressLine", "city", "province", "highestQualification", "institutionName", "completionYear", "resultType", "resultValue", "preferredCountry", "preferredStudyLevel", "intendedIntake", "previousVisaRefusal"] as const;
export function profileCompletion(profile?: Partial<IStudentProfile> | null) {
  if (!profile) return 0;
  const complete = PROFILE_FIELDS.filter((field) => profile[field] !== undefined && profile[field] !== "").length;
  return Math.round((complete / PROFILE_FIELDS.length) * 100);
}
export const StudentProfile = model<IStudentProfile>("StudentProfile", schema);
