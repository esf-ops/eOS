/** Basic email shape check for delivery recipient defaults. */
export function looksLikeEmail(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim();
  return v.includes("@") && v.includes(".");
}

/**
 * Default To: customer email, then account/contact email.
 */
export function pickDefaultToEmail(params: {
  customerEmail?: string | null;
  accountContactEmail?: string | null;
}): string {
  const customer = String(params.customerEmail ?? "").trim();
  const account = String(params.accountContactEmail ?? "").trim();
  if (looksLikeEmail(customer)) return customer;
  if (looksLikeEmail(account)) return account;
  return customer;
}

/**
 * Default CC: salesperson and entered-by/prepared-by when they look like email addresses.
 * Omits duplicates and the To address.
 */
export function pickDefaultCcEmail(params: {
  salesRep?: string | null;
  enteredBy?: string | null;
  preparedBy?: string | null;
  sessionUserEmail?: string | null;
  toEmail?: string | null;
}): string {
  const toLower = String(params.toEmail ?? "").trim().toLowerCase();
  const candidates = [
    params.salesRep,
    params.enteredBy,
    params.preparedBy,
    params.sessionUserEmail
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const email = String(raw ?? "").trim();
    if (!looksLikeEmail(email)) continue;
    const lower = email.toLowerCase();
    if (lower === toLower || seen.has(lower)) continue;
    seen.add(lower);
    out.push(email);
  }
  return out.join(", ");
}
