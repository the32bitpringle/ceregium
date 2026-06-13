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
  timezone: z.string().min(1).max(80),
  reducedMotion: z.boolean(),
  digestEnabled: z.boolean(),
  digestHour: z.number().int().min(0).max(23),
  analysisEnabled: z.boolean(),
});
