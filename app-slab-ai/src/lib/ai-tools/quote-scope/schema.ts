import { z } from "zod";

export const quoteScopeSchema = z.object({
  customerProjectName: z.string().trim().min(1, "Project name is required").max(200),
  projectType: z.enum([
    "residential-kitchen",
    "residential-bath",
    "commercial",
    "remodel",
    "new-construction",
    "other",
  ]),
  roomArea: z.string().trim().min(1, "Room / area is required").max(160),
  approximateSqFt: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().positive().max(50000).optional()
  ),
  materialColor: z.string().trim().min(1, "Material / color is required").max(160),
  materialGroup: z.string().trim().max(80).optional().or(z.literal("")),
  thickness: z.string().trim().min(1, "Thickness is required").max(40),
  edgeProfile: z.string().trim().min(1, "Edge profile is required").max(120),
  sinkCutouts: z.coerce.number().int().min(0).max(20).default(0),
  cooktopCutouts: z.coerce.number().int().min(0).max(10).default(0),
  faucetHoles: z.coerce.number().int().min(0).max(20).default(0),
  backsplash: z.string().trim().max(200).optional().or(z.literal("")),
  waterfallPanels: z.string().trim().max(200).optional().or(z.literal("")),
  tearOut: z.boolean().default(false),
  templateRequired: z.boolean().default(true),
  installationRequired: z.boolean().default(true),
  customerSuppliedItems: z.string().trim().max(1000).optional().or(z.literal("")),
  projectNotes: z.string().trim().max(2500).optional().or(z.literal("")),
  loadedQuoteId: z.string().uuid().optional().or(z.literal("")),
  loadedAccountId: z.string().uuid().optional().or(z.literal("")),
});

export type QuoteScopeInput = z.infer<typeof quoteScopeSchema>;
