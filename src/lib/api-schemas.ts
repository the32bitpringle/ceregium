import { z } from "zod";

export const ratingsSchema = z.object({
  energy: z.number().int().min(1).max(5),
  stress: z.number().int().min(1).max(5),
  sleep: z.number().int().min(1).max(5),
  workload: z.number().int().min(1).max(5),
});

export const reflectionRequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  ratings: ratingsSchema,
  analysisEnabled: z.boolean(),
});

export const settingsSchema = z.object({
  timezone: z.string().min(1).max(80).refine((value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Invalid time zone"),
  reducedMotion: z.boolean(),
  digestEnabled: z.boolean(),
  digestHour: z.number().int().min(0).max(23),
  analysisEnabled: z.boolean(),
});

export const gradeImpactSchema = z.enum(["low", "medium", "high", "unknown"]);

export const workloadCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  course: z.string().trim().max(120).optional(),
  dueAt: z.string().datetime(),
  pointsPossible: z.number().min(0).max(100000).optional(),
  gradeImpact: gradeImpactSchema.default("unknown"),
});

export const workloadUpdateSchema = z.object({
  id: z.string().uuid(),
  gradeImpact: gradeImpactSchema,
});
