/**
 * Compare live authoritative QuickBooks LinkedTxn / AppliedToTxn links against
 * historically memo-inferred Estimate relationships from offline discovery.
 *
 * Pure function — no I/O, no network.
 */

/**
 * @typedef {{
 *   estimateTxnId?: string|null,
 *   estimateRefNumber?: string|null,
 *   salesOrderTxnIds?: string[],
 *   invoiceTxnIds?: string[],
 * }} InferredEstimateLinks
 */

/**
 * @typedef {{
 *   txnType: string,
 *   qb_txn_id: string|null,
 *   ref_number?: string|null,
 *   linked_txns?: Array<{ qb_txn_id: string, txn_type: string|null }>,
 *   applied_to_txns?: Array<{ qb_txn_id: string, txn_type: string|null }>,
 *   memo_estimate_refs?: string[],
 * }} LiveTxnLinkRecord
 */

export const LINK_COMPARISON_OUTCOMES = Object.freeze([
  "inferred_link_confirmed",
  "inferred_link_contradicted",
  "authoritative_link_not_previously_inferred",
  "no_authoritative_link_found",
]);

/**
 * Normalize txn type labels from QB.
 * @param {string|null|undefined} type
 */
export function normalizeTxnType(type) {
  if (!type) return null;
  const t = String(type).trim().toLowerCase();
  if (t === "estimate") return "Estimate";
  if (t === "salesorder" || t === "sales order") return "SalesOrder";
  if (t === "invoice") return "Invoice";
  if (t === "receivepayment" || t === "payment") return "ReceivePayment";
  return type;
}

/**
 * Build lookup structures from inferred discovery-style rows.
 * @param {InferredEstimateLinks[]} inferred
 */
function indexInferred(inferred) {
  /** @type {Map<string, InferredEstimateLinks>} */
  byEstimateTxn = new Map();
  /** @type {Map<string, InferredEstimateLinks>} */
  const byRef = new Map();
  /** @type {Map<string, { estimateTxnId: string|null, estimateRefNumber: string|null, role: string }>} */
  const byDownstream = new Map();

  for (const row of inferred || []) {
    if (row.estimateTxnId) byEstimateTxn.set(row.estimateTxnId, row);
    if (row.estimateRefNumber) byRef.set(String(row.estimateRefNumber), row);
    for (const soId of row.salesOrderTxnIds || []) {
      byDownstream.set(soId, {
        estimateTxnId: row.estimateTxnId || null,
        estimateRefNumber: row.estimateRefNumber || null,
        role: "SalesOrder",
      });
    }
    for (const invId of row.invoiceTxnIds || []) {
      byDownstream.set(invId, {
        estimateTxnId: row.estimateTxnId || null,
        estimateRefNumber: row.estimateRefNumber || null,
        role: "Invoice",
      });
    }
  }
  return { byEstimateTxn, byRef, byDownstream };
}

// Fix accidental undeclared assignment - rewrite cleanly
let byEstimateTxn;

/**
 * Compare live link records to inferred memo relationships.
 *
 * @param {{
 *   liveRecords: LiveTxnLinkRecord[],
 *   inferredLinks: InferredEstimateLinks[],
 * }} input
 */
export function compareLiveLinksToInferred(input) {
  const liveRecords = Array.isArray(input?.liveRecords) ? input.liveRecords : [];
  const inferredLinks = Array.isArray(input?.inferredLinks) ? input.inferredLinks : [];

  /** @type {Map<string, InferredEstimateLinks>} */
  const byEstimateTxn = new Map();
  /** @type {Map<string, InferredEstimateLinks>} */
  const byRef = new Map();
  /** @type {Map<string, { estimateTxnId: string|null, estimateRefNumber: string|null, role: string }>} */
  const byDownstream = new Map();

  for (const row of inferredLinks) {
    if (row.estimateTxnId) byEstimateTxn.set(row.estimateTxnId, row);
    if (row.estimateRefNumber) byRef.set(String(row.estimateRefNumber), row);
    for (const soId of row.salesOrderTxnIds || []) {
      byDownstream.set(soId, {
        estimateTxnId: row.estimateTxnId || null,
        estimateRefNumber: row.estimateRefNumber || null,
        role: "SalesOrder",
      });
    }
    for (const invId of row.invoiceTxnIds || []) {
      byDownstream.set(invId, {
        estimateTxnId: row.estimateTxnId || null,
        estimateRefNumber: row.estimateRefNumber || null,
        role: "Invoice",
      });
    }
  }

  /** @type {Array<object>} */
  const findings = [];
  const counts = {
    inferred_link_confirmed: 0,
    inferred_link_contradicted: 0,
    authoritative_link_not_previously_inferred: 0,
    no_authoritative_link_found: 0,
  };

  for (const live of liveRecords) {
    if (!live?.qb_txn_id) continue;
    const liveType = normalizeTxnType(live.txnType) || "Unknown";
    const authoritative = collectAuthoritativePeers(live);

    if (authoritative.length === 0) {
      // If we previously inferred something for this txn, note absence of authority.
      const prior = byDownstream.get(live.qb_txn_id);
      const priorFromEstimate =
        liveType === "Estimate"
          ? byEstimateTxn.get(live.qb_txn_id) ||
            (live.ref_number ? byRef.get(String(live.ref_number)) : null)
          : null;

      if (prior || priorFromEstimate) {
        pushFinding(findings, counts, {
          outcome: "no_authoritative_link_found",
          liveTxnId: live.qb_txn_id,
          liveTxnType: liveType,
          detail:
            "Live record has no LinkedTxn/AppliedToTxn peers, but discovery inferred a relationship involving this txn.",
          inferred: prior || {
            estimateTxnId: priorFromEstimate?.estimateTxnId || live.qb_txn_id,
            estimateRefNumber: priorFromEstimate?.estimateRefNumber || live.ref_number || null,
          },
        });
      } else {
        pushFinding(findings, counts, {
          outcome: "no_authoritative_link_found",
          liveTxnId: live.qb_txn_id,
          liveTxnType: liveType,
          detail: "Live record has no authoritative linked peers.",
        });
      }
      continue;
    }

    for (const peer of authoritative) {
      const peerType = normalizeTxnType(peer.txn_type);
      const edge = classifyEdge({
        liveTxnId: live.qb_txn_id,
        liveTxnType: liveType,
        liveRefNumber: live.ref_number || null,
        peerTxnId: peer.qb_txn_id,
        peerTxnType: peerType,
        byEstimateTxn,
        byRef,
        byDownstream,
      });
      pushFinding(findings, counts, edge);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    liveRecordCount: liveRecords.length,
    inferredEstimateCount: inferredLinks.length,
    counts,
    findings,
  };
}

function pushFinding(findings, counts, finding) {
  counts[finding.outcome] = (counts[finding.outcome] || 0) + 1;
  findings.push(finding);
}

function collectAuthoritativePeers(live) {
  /** @type {Array<{ qb_txn_id: string, txn_type: string|null, source: string }>} */
  const out = [];
  for (const l of live.linked_txns || []) {
    if (!l?.qb_txn_id) continue;
    out.push({ qb_txn_id: l.qb_txn_id, txn_type: l.txn_type, source: "LinkedTxn" });
  }
  for (const a of live.applied_to_txns || []) {
    if (!a?.qb_txn_id) continue;
    out.push({ qb_txn_id: a.qb_txn_id, txn_type: a.txn_type || "Invoice", source: "AppliedToTxnRet" });
  }
  return out;
}

function classifyEdge(ctx) {
  const {
    liveTxnId,
    liveTxnType,
    liveRefNumber,
    peerTxnId,
    peerTxnType,
    byEstimateTxn,
    byRef,
    byDownstream,
  } = ctx;

  // Case A: live Estimate linked to SO/Invoice
  if (liveTxnType === "Estimate") {
    const inferred =
      byEstimateTxn.get(liveTxnId) || (liveRefNumber ? byRef.get(String(liveRefNumber)) : null);
    const expectedIds =
      peerTxnType === "SalesOrder"
        ? inferred?.salesOrderTxnIds || []
        : peerTxnType === "Invoice"
          ? inferred?.invoiceTxnIds || []
          : [];

    if (!inferred) {
      return {
        outcome: "authoritative_link_not_previously_inferred",
        liveTxnId,
        liveTxnType,
        peerTxnId,
        peerTxnType,
        detail: "Live Estimate has an authoritative downstream link not present in memo-inferred index.",
      };
    }
    if (expectedIds.includes(peerTxnId)) {
      return {
        outcome: "inferred_link_confirmed",
        liveTxnId,
        liveTxnType,
        peerTxnId,
        peerTxnType,
        estimateRefNumber: inferred.estimateRefNumber || liveRefNumber,
        detail: "Authoritative LinkedTxn matches memo-inferred Estimate relationship.",
      };
    }
    // Inferred existed but different downstream ids for this type, or type unexpected
    if ((inferred.salesOrderTxnIds || []).length || (inferred.invoiceTxnIds || []).length) {
      return {
        outcome: "inferred_link_contradicted",
        liveTxnId,
        liveTxnType,
        peerTxnId,
        peerTxnType,
        estimateRefNumber: inferred.estimateRefNumber || liveRefNumber,
        inferredSalesOrderTxnIds: inferred.salesOrderTxnIds || [],
        inferredInvoiceTxnIds: inferred.invoiceTxnIds || [],
        detail:
          "Live Estimate LinkedTxn peer does not match the memo-inferred SO/Invoice TxnIDs for this Estimate.",
      };
    }
    return {
      outcome: "authoritative_link_not_previously_inferred",
      liveTxnId,
      liveTxnType,
      peerTxnId,
      peerTxnType,
      detail: "Estimate was indexed without downstream inference, but live LinkedTxn exists.",
    };
  }

  // Case B: live SO/Invoice linked to Estimate (or other)
  if (liveTxnType === "SalesOrder" || liveTxnType === "Invoice") {
    const inferredDownstream = byDownstream.get(liveTxnId);
    if (peerTxnType === "Estimate") {
      if (inferredDownstream?.estimateTxnId === peerTxnId) {
        return {
          outcome: "inferred_link_confirmed",
          liveTxnId,
          liveTxnType,
          peerTxnId,
          peerTxnType,
          estimateRefNumber: inferredDownstream.estimateRefNumber,
          detail: "Authoritative link back to Estimate matches memo inference.",
        };
      }
      if (inferredDownstream?.estimateTxnId && inferredDownstream.estimateTxnId !== peerTxnId) {
        return {
          outcome: "inferred_link_contradicted",
          liveTxnId,
          liveTxnType,
          peerTxnId,
          peerTxnType,
          inferredEstimateTxnId: inferredDownstream.estimateTxnId,
          detail: "Live links to a different Estimate TxnID than memo inference.",
        };
      }
      return {
        outcome: "authoritative_link_not_previously_inferred",
        liveTxnId,
        liveTxnType,
        peerTxnId,
        peerTxnType,
        detail: "Authoritative Estimate link was not present in memo-inferred index.",
      };
    }

    // SO↔Invoice or other peer types
    if (!inferredDownstream) {
      return {
        outcome: "authoritative_link_not_previously_inferred",
        liveTxnId,
        liveTxnType,
        peerTxnId,
        peerTxnType,
        detail: "Authoritative non-Estimate peer link not previously inferred via Estimate memo.",
      };
    }
    // We only inferred via shared Estimate — if both SO and Invoice share estimate, treat SO↔Invoice as confirmed soft
    const est = inferredDownstream.estimateTxnId
      ? byEstimateTxn.get(inferredDownstream.estimateTxnId)
      : null;
    const peerAlso =
      (est?.salesOrderTxnIds || []).includes(peerTxnId) ||
      (est?.invoiceTxnIds || []).includes(peerTxnId);
    if (peerAlso) {
      return {
        outcome: "inferred_link_confirmed",
        liveTxnId,
        liveTxnType,
        peerTxnId,
        peerTxnType,
        estimateRefNumber: inferredDownstream.estimateRefNumber,
        detail: "Peer shares the same memo-inferred Estimate (transitive confirmation).",
      };
    }
    return {
      outcome: "authoritative_link_not_previously_inferred",
      liveTxnId,
      liveTxnType,
      peerTxnId,
      peerTxnType,
      detail: "Authoritative peer was not part of the memo-inferred Estimate set.",
    };
  }

  // Payments / other
  if (liveTxnType === "ReceivePayment") {
    const inferred = byDownstream.get(peerTxnId);
    if (inferred) {
      return {
        outcome: "inferred_link_confirmed",
        liveTxnId,
        liveTxnType,
        peerTxnId,
        peerTxnType,
        detail:
          "Payment applies to an invoice that was memo-linked to an Estimate (allocation newly authoritative).",
        estimateRefNumber: inferred.estimateRefNumber,
      };
    }
    return {
      outcome: "authoritative_link_not_previously_inferred",
      liveTxnId,
      liveTxnType,
      peerTxnId,
      peerTxnType,
      detail: "Payment application target was not in memo-inferred invoice index (expected — payments were unlinked offline).",
    };
  }

  return {
    outcome: "authoritative_link_not_previously_inferred",
    liveTxnId,
    liveTxnType,
    peerTxnId,
    peerTxnType,
    detail: "Unhandled live txn type for comparison.",
  };
}

/**
 * Build inferred link rows from discovery-style compact arrays
 * (sales-order / invoice memo inference), keyed by Estimate.
 *
 * @param {{
 *   estimateRefIndex?: Map<string, { txnId: string }>|Record<string,{txnId:string}>,
 *   salesOrders?: Array<{ txnId: string, linkedEstimateTxnId?: string|null, estimateRefs?: string[] }>,
 *   invoices?: Array<{ txnId: string, linkedEstimateTxnId?: string|null, estimateRefs?: string[] }>,
 * }} input
 * @returns {InferredEstimateLinks[]}
 */
export function buildInferredLinksFromDiscoveryCompacts(input) {
  /** @type {Map<string, InferredEstimateLinks>} */
  const byEst = new Map();

  const ensure = (estimateTxnId, estimateRefNumber) => {
    const key = estimateTxnId || `ref:${estimateRefNumber}`;
    let row = byEst.get(key);
    if (!row) {
      row = {
        estimateTxnId: estimateTxnId || null,
        estimateRefNumber: estimateRefNumber || null,
        salesOrderTxnIds: [],
        invoiceTxnIds: [],
      };
      byEst.set(key, row);
    }
    return row;
  };

  for (const so of input.salesOrders || []) {
    if (!so.linkedEstimateTxnId && !(so.estimateRefs && so.estimateRefs[0])) continue;
    const ref = so.estimateRefs?.[0] || null;
    const row = ensure(so.linkedEstimateTxnId || null, ref);
    if (!row.salesOrderTxnIds.includes(so.txnId)) row.salesOrderTxnIds.push(so.txnId);
  }
  for (const inv of input.invoices || []) {
    if (!inv.linkedEstimateTxnId && !(inv.estimateRefs && inv.estimateRefs[0])) continue;
    const ref = inv.estimateRefs?.[0] || null;
    const row = ensure(inv.linkedEstimateTxnId || null, ref);
    if (!row.invoiceTxnIds.includes(inv.txnId)) row.invoiceTxnIds.push(inv.txnId);
  }

  return [...byEst.values()];
}

// silence unused helper leftover
void indexInferred;
