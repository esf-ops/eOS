/** AI Takeoff beta constants and API helpers (v6.4). */

export const TAKEOFF_BETA_LABEL =
  "AI-assisted takeoff beta — estimator verification required.";

export const TAKEOFF_BETA_IMPORT_CONFIRMATION_TEXT =
  "I reviewed the measurements and understand this will create an Internal Estimate draft.";

export const TAKEOFF_ISSUE_CATEGORIES = [
  { id: "missed_room_piece", label: "Missed room / piece" },
  { id: "wrong_dimension", label: "Wrong dimension" },
  { id: "backsplash_issue", label: "Backsplash issue" },
  { id: "cutout_addon_issue", label: "Cutout / add-on issue" },
  { id: "wrong_room_assignment", label: "Wrong room assignment" },
  { id: "plan_unreadable", label: "Plan unreadable" },
  { id: "import_problem", label: "Import problem" },
  { id: "other", label: "Other" },
] as const;

export type TakeoffIssueCategoryId = (typeof TAKEOFF_ISSUE_CATEGORIES)[number]["id"];

export interface TakeoffFeedbackPayload {
  helpful: boolean;
  editedMeasurements: boolean;
  missedRooms: boolean;
  misreadBacksplash: boolean;
  note?: string;
  estimatedTimeSavedMinutes?: number | null;
  quoteId?: string | null;
}

export interface TakeoffIssueReportPayload {
  category: TakeoffIssueCategoryId;
  note?: string;
  quoteId?: string | null;
  sourcePage?: string;
  sourcePiece?: string;
}

export interface TakeoffBetaQaRow {
  quoteId: string | null;
  quoteNumber: string | null;
  takeoffJobId: string | null;
  estimator: string | null;
  importedAt: string | null;
  importedCountertopSf: number;
  importedBacksplashSf: number;
  currentCountertopSf: number;
  currentBacksplashSf: number;
  deltaCountertopSf: number;
  deltaBacksplashSf: number;
  feedbackStatus: "submitted" | "none";
  feedbackCount: number;
  issueCount: number;
}
