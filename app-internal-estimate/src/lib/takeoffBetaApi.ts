import { apiPostJson } from "@quote-lib/api";
import type { TakeoffFeedbackPayload, TakeoffIssueReportPayload } from "./takeoffBeta";

export async function submitTakeoffFeedback(
  token: string,
  takeoffJobId: string,
  body: TakeoffFeedbackPayload
): Promise<{ ok: boolean }> {
  return (await apiPostJson(
    `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/feedback`,
    token,
    body
  )) as { ok: boolean };
}

export async function submitTakeoffIssueReport(
  token: string,
  takeoffJobId: string,
  body: TakeoffIssueReportPayload
): Promise<{ ok: boolean }> {
  return (await apiPostJson(
    `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/issue-report`,
    token,
    body
  )) as { ok: boolean };
}
