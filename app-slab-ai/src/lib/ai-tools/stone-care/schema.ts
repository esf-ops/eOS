import { z } from "zod";

export const stoneCareSchema = z.object({
  material: z.string().trim().min(1, "Material is required").max(120),
  manufacturer: z.string().trim().max(120).optional().or(z.literal("")),
  productColor: z.string().trim().min(1, "Product / color is required").max(160),
  materialClass: z.enum(["natural", "engineered", "unknown"]),
  finish: z.string().trim().min(1, "Finish is required").max(80),
  application: z.string().trim().min(1, "Application is required").max(160),
  environment: z.enum(["indoor", "outdoor", "mixed"]),
  sealingStatus: z.enum(["sealed", "unsealed", "unknown", "not-applicable"]),
  specialNotes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type StoneCareInput = z.infer<typeof stoneCareSchema>;
