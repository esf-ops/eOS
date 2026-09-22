import { z } from "zod";

export const remnantPitchSchema = z.object({
  materialType: z.string().trim().min(1, "Material type is required").max(120),
  manufacturer: z.string().trim().max(120).optional().or(z.literal("")),
  colorName: z.string().trim().min(1, "Color / name is required").max(120),
  lengthIn: z.coerce.number().positive("Length must be positive").max(200),
  widthIn: z.coerce.number().positive("Width must be positive").max(200),
  thickness: z.string().trim().min(1, "Thickness is required").max(40),
  finish: z.string().trim().min(1, "Finish is required").max(80),
  colorPalette: z.string().trim().max(200).optional().or(z.literal("")),
  quantity: z.coerce.number().int().positive().max(50).default(1),
  possibleApplication: z.enum([
    "vanity",
    "bar",
    "fireplace-hearth",
    "desk",
    "tabletop",
    "shower-piece",
    "shelves",
    "miscellaneous",
  ]),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type RemnantPitchInput = z.infer<typeof remnantPitchSchema>;

export const REMNANT_APPLICATION_OPTIONS = [
  { value: "vanity", label: "Vanity" },
  { value: "bar", label: "Bar" },
  { value: "fireplace-hearth", label: "Fireplace hearth" },
  { value: "desk", label: "Desk" },
  { value: "tabletop", label: "Tabletop" },
  { value: "shower-piece", label: "Shower piece" },
  { value: "shelves", label: "Shelves" },
  { value: "miscellaneous", label: "Miscellaneous / custom" },
] as const;
