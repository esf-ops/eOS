import { normalizeSpaces } from "./parseCsv.js";

const JOB_LINK_RE = /href=["'](?:https?:\/\/[^"']+)?\/sys\/job\/(\d+)["'][^>]*>([^<]+)</gi;
const ACCOUNT_LINK_RE = /href=["'](?:https?:\/\/[^"']+)?\/sys\/account\/(\d+)["'][^>]*>([^<]+)</gi;
const TR_BLOCK_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

function extractLinksFromFragment(htmlFragment, linkRe) {
  const out = [];
  linkRe.lastIndex = 0;
  let match;
  while ((match = linkRe.exec(htmlFragment)) !== null) {
    out.push({
      id: String(match[1]).trim(),
      name: normalizeSpaces(match[2])
    });
  }
  return out;
}

/**
 * Extract identity rows from rendered Moraware report HTML.
 * Each row attempts to pair job + account links within the same <tr>.
 */
export function parseReportHtmlIdentityRows(html) {
  const text = String(html ?? "");
  if (!text.trim()) return [];

  const rows = [];
  TR_BLOCK_RE.lastIndex = 0;
  let trMatch;
  while ((trMatch = TR_BLOCK_RE.exec(text)) !== null) {
    const fragment = trMatch[1];
    const jobs = extractLinksFromFragment(fragment, JOB_LINK_RE);
    const accounts = extractLinksFromFragment(fragment, ACCOUNT_LINK_RE);
    if (!jobs.length && !accounts.length) continue;

    const pairCount = Math.max(jobs.length, accounts.length, 1);
    for (let i = 0; i < pairCount; i++) {
      const job = jobs[i] ?? jobs[0] ?? null;
      const account = accounts[i] ?? accounts[0] ?? null;
      if (!job && !account) continue;
      rows.push({
        jobId: job?.id ?? null,
        jobName: job?.name ?? "",
        accountId: account?.id ?? null,
        accountName: account?.name ?? ""
      });
    }
  }

  if (rows.length) return rows;

  // Fallback: pair links globally when table markup is unavailable (fixture-friendly).
  const jobs = extractLinksFromFragment(text, JOB_LINK_RE);
  const accounts = extractLinksFromFragment(text, ACCOUNT_LINK_RE);
  const pairCount = Math.max(jobs.length, accounts.length);
  for (let i = 0; i < pairCount; i++) {
    const job = jobs[i] ?? null;
    const account = accounts[i] ?? null;
    if (!job && !account) continue;
    rows.push({
      jobId: job?.id ?? null,
      jobName: job?.name ?? "",
      accountId: account?.id ?? null,
      accountName: account?.name ?? ""
    });
  }
  return rows;
}
