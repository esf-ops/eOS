import { z } from "zod";

export const accountBriefSchema = z.object({
  accountId: z
    .string()
    .trim()
    .min(1, "Select an account from search results")
    .uuid("Select a valid Account Directory account"),
  accountSearch: z.string().trim().max(80).optional(),
  focusQuestion: z.string().trim().max(400).optional(),
});

export type AccountBriefInput = z.infer<typeof accountBriefSchema>;
