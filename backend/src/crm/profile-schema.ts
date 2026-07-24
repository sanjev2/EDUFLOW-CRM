import { z } from "zod";

export const profileSchema = z.object({
  phone: z.string().trim().min(7).max(24).optional(),
  dateOfBirth: z.coerce.date().max(new Date()).optional(),
  addressLine: z.string().trim().max(180).optional(),
  city: z.string().trim().max(80).optional(),
  province: z.string().trim().max(80).optional(),
  country: z.string().trim().min(2).max(80).default("Nepal"),
  highestQualification: z.string().trim().max(100).optional(),
  institutionName: z.string().trim().max(140).optional(),
  completionYear: z.number().int().min(1950).max(2100).optional(),
  resultType: z.enum(["GPA", "PERCENTAGE"]).optional(),
  resultValue: z.number().min(0).max(100).optional(),
  englishTestType: z.enum(["IELTS", "PTE", "DUOLINGO", "NONE"]).default("NONE"),
  englishTestScore: z.number().min(0).max(200).optional(),
  preferredCountry: z.string().trim().max(80).optional(),
  preferredStudyLevel: z.string().trim().max(80).optional(),
  intendedIntake: z.string().trim().max(80).optional(),
  previousVisaRefusal: z.boolean().optional(),
  refusalExplanation: z.string().trim().max(500).optional(),
}).strict();

export const profileImportSchema = z.object({
  schemaVersion: z.literal("1.0"),
  profile: profileSchema,
}).strict();
