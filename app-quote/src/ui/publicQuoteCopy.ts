/** Homeowner-facing strings for the public quote wizard (no backend jargon). */

export const PUBLIC_WIZARD = {
  heroTitle: "Get a countertop estimate",
  heroSubtitle: "No exact measurements? No problem.",
  heroTagline: "Start with your best estimate. Elite will verify before final pricing.",

  stepOf: (n: number) => `Step ${n} of 6`,

  step1Title: "Your project",
  step1Lead: "Tell us where the project is so we can connect you with the right Elite team.",

  step2Title: "What are you measuring?",
  step2Lead: "Choose the closest match — we will help if you are not sure.",

  step3Title: "Help us estimate the size",
  step3Lead: "Pick what is easiest for you. You can change it before you submit.",

  step4Title: "Common options",
  step4Lead: "Not sure? Leave numbers at zero. Elite can confirm everything later.",

  step5Title: "Compare material levels",
  step5Lead: "Planning totals for each material tier. Final pricing depends on material choice and an on-site review.",

  step6Title: "Submit measurements",
  step6Lead: "Send what you have. No account or sign-in required.",

  estimateIntro:
    "Each card is a material level from Promo through Group F. Compare countertops, backsplash, add-ons, and your estimated total.",

  liveEstimate: "Live estimate ready.",
  previewEstimate: "Planning preview on this device. Connect to the internet and tap Calculate again for a live estimate.",
  previewOffline: "Could not reach the quote server. Please try again or call Elite. Below is a planning preview so you can still compare levels.",

  submitThanks: "Thanks — we received your measurements.",
  submitFollowUp: "Elite will review your details and follow up with you.",
  referenceLabel: "Reference",
  eliteContactHeading: "Your Elite team",
  eliteBranch: (branch: string) => `Local branch: ${branch}`,
  eliteMember: (name: string) => `Team member: ${name}`,

  errorSubmitGeneric: "We could not save your measurements. Please try again or call Elite.",
  errorSubmitUnreachable: "Could not reach the quote server. Please try again or call Elite.",
  errorSubmitPreview: "Saving is not available in this preview environment. Your estimate is still shown above."
} as const;
