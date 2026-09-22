/**
 * AI-safe quote DTO helpers for slabOS AI Studio.
 * Reuses quote_headers org scoping patterns without exposing calculation dumps or secrets.
 */

function pickStr(v) {
  return String(v ?? "").trim();
}

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v ?? ""));
}

function deriveAccountName(r) {
  return pickStr(r.account_name) || pickStr(r.customer_name) || null;
}

/**
 * Minimized quote card for AI search / context — not a pricing authority dump.
 * @param {Record<string, unknown>} r
 */
export function toAiQuoteListItem(r) {
  return {
    quoteId: String(r.id),
    quoteNumber: pickStr(r.quote_number) || null,
    status: pickStr(r.quote_status) || null,
    accountName: deriveAccountName(r),
    accountDirectoryAccountId: r.account_directory_account_id ? String(r.account_directory_account_id) : null,
    customerName: pickStr(r.customer_name) || null,
    projectName: pickStr(r.project_name) || null,
    projectAddress: [pickStr(r.project_address), pickStr(r.city), pickStr(r.state), pickStr(r.zip)]
      .filter(Boolean)
      .join(", ") || null,
    estimatedSqft: r.estimated_sqft != null ? Number(r.estimated_sqft) : null,
    recordedTotal: r.grand_total != null && Number.isFinite(Number(r.grand_total)) ? Number(r.grand_total) : null,
    salesRep: pickStr(r.sales_rep) || null,
    branch: pickStr(r.branch) || null,
    quoteSource: pickStr(r.quote_source) || null,
    updatedAt: r.updated_at ?? null,
    note: "recordedTotal is from the authoritative quote system — AI must not recalculate or invent prices."
  };
}

/**
 * Detail DTO for scope drafting — narrative fields only + labeled recorded totals.
 * @param {Record<string, unknown>} header
 * @param {{ rooms?: unknown[], lineItems?: unknown[] }} [extras]
 */
export function toAiQuoteDetail(header, extras = {}) {
  const rooms = Array.isArray(extras.rooms)
    ? extras.rooms.slice(0, 40).map((room) => ({
        name: pickStr(room.name || room.room_name) || null,
        notes: pickStr(room.notes) || null
      }))
    : [];

  const lineHints = Array.isArray(extras.lineItems)
    ? extras.lineItems.slice(0, 60).map((li) => ({
        description: pickStr(li.description || li.label || li.item_name) || null,
        quantity: li.quantity != null ? Number(li.quantity) : null,
        unit: pickStr(li.unit) || null
        // intentionally omit unit_price / line totals — AI drafts scope, not prices
      }))
    : [];

  return {
    ...toAiQuoteListItem(header),
    salesRep: pickStr(header.sales_rep) || null,
    branch: pickStr(header.branch) || null,
    preparedBy: pickStr(header.prepared_by) || null,
    rooms,
    lineHints,
    authority:
      "This payload is read-only evidence from eliteOS Quote Library. AI may draft narrative scope only; it must not overwrite quote records or invent pricing."
  };
}

export async function searchQuotesForAi({ db, organizationId, query, limit = 10, accountId = null }) {
  const q = pickStr(query).slice(0, 80);
  const lim = Math.min(25, Math.max(1, Number(limit) || 10));
  if (!organizationId) {
    return { ok: false, error: "Organization context required", status: 400 };
  }
  if (!q || q.length < 2) {
    return {
      ok: true,
      items: [],
      rows: [],
      totalMatches: 0,
      returned: 0,
      truncated: false,
      ambiguous: false,
      queryTooShort: true,
      minQueryLength: 2,
      retrievedAt: new Date().toISOString(),
    };
  }

  let qb = db
    .from("quote_headers")
    .select(
      "id,quote_number,quote_status,customer_name,project_name,project_address,city,state,zip,estimated_sqft,grand_total,quote_source,updated_at,sales_rep,branch,prepared_by,account_directory_account_id"
    )
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .or(
      [
        `quote_number.ilike.%${q}%`,
        `customer_name.ilike.%${q}%`,
        `project_name.ilike.%${q}%`
      ].join(",")
    )
    .order("updated_at", { ascending: false })
    .limit(lim);

  if (accountId && isUuid(accountId)) {
    qb = qb.eq("account_directory_account_id", accountId);
  }

  const { data, error } = await qb;
  if (error) {
    const msg = String(error.message || "");
    if (msg.toLowerCase().includes("does not exist") || msg.includes("schema cache")) {
      return { ok: false, installed: false, error: "quote_headers unavailable", status: 503 };
    }
    throw error;
  }
  const rows = (data || []).map(toAiQuoteListItem);
  const retrievedAt = new Date().toISOString();
  return {
    ok: true,
    items: rows,
    rows, // back-compat
    totalMatches: rows.length,
    returned: rows.length,
    truncated: rows.length >= lim,
    ambiguous: rows.length > 1,
    retrievedAt,
    sourceSystem: "quote_headers",
  };
}

export async function retrieveQuoteForAi({ db, organizationId, quoteId }) {
  if (!organizationId) {
    return { ok: false, error: "Organization context required", status: 400 };
  }
  if (!isUuid(quoteId)) {
    return { ok: false, error: "Invalid quote id", status: 400 };
  }

  const { data: headers, error } = await db
    .from("quote_headers")
    .select("*")
    .eq("id", quoteId)
    .eq("organization_id", organizationId)
    .limit(1);

  if (error) {
    const msg = String(error.message || "");
    if (msg.toLowerCase().includes("does not exist")) {
      return { ok: false, installed: false, error: "quote_headers unavailable", status: 503 };
    }
    throw error;
  }
  const header = headers?.[0];
  if (!header) return { ok: false, error: "Not found", status: 404 };

  const roomsRes = await db
    .from("quote_rooms")
    .select("name,room_name,notes,sort_order")
    .eq("quote_id", quoteId)
    .order("sort_order", { ascending: true })
    .limit(40);

  const linesRes = await db
    .from("quote_line_items")
    .select("description,label,item_name,quantity,unit")
    .eq("quote_id", quoteId)
    .limit(60);

  return {
    ok: true,
    quote: {
      ...toAiQuoteDetail(header, {
        rooms: roomsRes.error ? [] : roomsRes.data || [],
        lineItems: linesRes.error ? [] : linesRes.data || []
      }),
      retrievedAt: new Date().toISOString(),
      sourceSystem: "quote_headers",
    }
  };
}

export { isUuid, pickStr };
