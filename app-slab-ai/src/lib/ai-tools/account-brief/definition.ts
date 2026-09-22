import type { SlabAITool } from "../types";
import { accountBriefSchema } from "./schema";
import { ACCOUNT_BRIEF_PROMPT_VERSION, accountBriefSystemPrompt, buildAccountBriefPrompt } from "./prompt";

export const accountBriefTool: SlabAITool = {
  id: "account-brief",
  slug: "account-brief",
  title: "Account Brief",
  shortDescription: "Concise operational briefing before a call — company data only.",
  description:
    "Loads a selected Account Directory record (and related quote/job summaries when authorized) to draft a pre-meeting brief. Read-only. No CRM scoring or invented sentiment.",
  category: "account-management",
  keywords: ["account", "brief", "meeting", "customer", "360"],
  icon: "Building2",
  modelClass: "fast",
  safetyClass: "operational",
  status: "live",
  featured: true,
  fields: [
    {
      name: "accountSearch",
      label: "Account search",
      type: "text",
      placeholder: "Type a name, then select from results",
      helpText: "Requires Account Directory access. Ambiguous matches must be selected — AI will not guess.",
    },
    {
      name: "accountId",
      label: "Selected account ID",
      type: "text",
      placeholder: "Filled when you select an account",
      helpText: "Authoritative Account Directory UUID after disambiguation.",
    },
    {
      name: "focusQuestion",
      label: "Optional focus",
      type: "textarea",
      placeholder: "e.g. What should I know before tomorrow's install discussion?",
    },
  ],
  formSchema: accountBriefSchema,
  outputFormat: "markdown-sections",
  promptVersion: ACCOUNT_BRIEF_PROMPT_VERSION,
  systemPrompt: accountBriefSystemPrompt,
  buildPrompt: buildAccountBriefPrompt,
  evidencePolicy: "Operational company data only unless knowledge is separately enabled.",
  relatedTools: ["quote-scope"],
  allowedActions: ["searchAccounts", "retrieveAccount", "listAccountJobs", "searchQuotes"],
  knowledgeEnabled: false,
  emptyStateHint: "Search and select an account, then generate a concise pre-call briefing from governed company data.",
};
