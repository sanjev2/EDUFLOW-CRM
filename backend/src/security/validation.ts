import { z } from "zod";
import { passwordIssues } from "./password.js";

export const email = z.string().trim().toLowerCase().email().max(254);
export const strongPassword = z.string().superRefine((password, ctx) => {
  for (const issue of passwordIssues(password)) ctx.addIssue({ code: "custom", message: issue });
});
export function strictBody<T>(schema: z.ZodType<T>, body: unknown): T {
  return schema.parse(body);
}
