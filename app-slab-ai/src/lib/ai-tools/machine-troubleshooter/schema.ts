import { z } from "zod";

export const machineTroubleshooterSchema = z.object({
  manufacturer: z.string().trim().min(1, "Manufacturer is required").max(120),
  model: z.string().trim().min(1, "Model is required").max(120),
  machineType: z.enum(["bridge-saw", "cnc", "waterjet", "other"]),
  material: z.string().trim().min(1, "Material is required").max(120),
  materialThickness: z.string().trim().min(1, "Thickness is required").max(40),
  bladeOrTool: z.string().trim().min(1, "Blade / tool is required").max(160),
  bladeDiameter: z.string().trim().max(40).optional().or(z.literal("")),
  operation: z.string().trim().min(1, "Operation is required").max(160),
  symptom: z.enum([
    "quartz-chipping",
    "quartzite-deflection",
    "porcelain-chipping",
    "miter-breakout",
    "blade-wandering",
    "poor-cut-finish",
    "excessive-blade-wear",
    "tool-marks",
    "cnc-polishing-problem",
    "other",
  ]),
  currentRpm: z.string().trim().max(40).optional().or(z.literal("")),
  currentFeedRate: z.string().trim().max(40).optional().or(z.literal("")),
  waterCondition: z.string().trim().max(200).optional().or(z.literal("")),
  recentMaintenance: z.string().trim().max(1000).optional().or(z.literal("")),
  operatorObservations: z.string().trim().min(1, "Observations are required").max(2500),
});

export type MachineTroubleshooterInput = z.infer<typeof machineTroubleshooterSchema>;
