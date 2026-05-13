/** Homeowner-facing strings for the public quote wizard (no backend jargon). */

export const PUBLIC_WIZARD = {
  heroTitle: "Get a countertop planning estimate",
  heroSubtitle: "Answer a few simple questions and we will help estimate your countertop project.",
  heroTagline: "Start with your best guess. Elite will review before final pricing.",

  stepOf: (n: number) => `Step ${n} of 6`,

  step1Title: "Your project",
  step1Lead: "Tell us where the project is so we can connect you with the right Elite team.",

  step2Title: "What are you measuring?",
  step2Lead: "Choose the closest match — we will help if you are not sure.",

  step3Title: "How should we estimate size?",
  step3Lead: "Pick what is easiest for you. You can change it before you submit.",

  step4Title: "A few project details",
  step4Lead: "These answers help us plan openings, backsplash, and removal — nothing needs to be perfect today.",

  step5Title: "Compare material levels",
  step5Lead: "Planning totals for each material tier. Final pricing depends on material choice and an on-site review.",

  step6Title: "Submit measurements",
  step6Lead: "Send what you have. No account or sign-in required.",

  estimateIntro:
    "Each card is a material level from Promo through Group F. Compare countertops, backsplash, project extras, and your estimated total.",

  tierCountertops: "Countertops",
  tierBacksplash: "Backsplash",
  tierExtras: "Project extras",
  tierTotal: "Estimated total",

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
  errorSubmitPreview: "Saving is not available in this preview environment. Your estimate is still shown above.",

  sizeMethodSqftTitle: "Enter square footage",
  sizeMethodSqftDesc: "If you already know your countertop and backsplash square footage, enter it here.",

  sizeMethodCabinetTitle: "Use cabinet lengths",
  sizeMethodCabinetDesc: "Enter the length of your countertop runs and we will estimate the square footage.",

  sizeMethodLayoutTitle: "Guided kitchen layout",
  sizeMethodLayoutDesc: "Pick the shape that looks most like your kitchen and answer a few easy questions.",

  sizeMethodUploadTitle: "Upload photos or plans",
  sizeMethodUploadDesc:
    "Upload kitchen photos or plans and Elite can help create a planning estimate. Photos and plans are used for planning estimates. Elite will review measurements before final pricing.",

  uploadComingTitle: "Coming soon",
  uploadComingBody:
    "This option is not ready yet. For now, please choose another way to enter size so we can complete your planning estimate. Automatic photo measurement will be added later; Elite will always review before final pricing.",

  inchTipCabinet: "Tip: 8 feet = 96 inches.",
  inchTipGuided: "Tip: 10 feet = 120 inches.",

  plannerReviewPrefix: "For Elite to confirm:"
} as const;
