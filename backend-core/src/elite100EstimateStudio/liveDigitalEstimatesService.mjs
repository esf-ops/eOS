/**
 * Live Digital Estimates portfolio service — org-scoped, side-effect-free reads.
 */

import {
  LIVE_DE_OPERATIONAL_STATUSES,
  LIVE_DE_STATUS_LABELS,
  accountGroupKeyForPublication,
  ageDays,
  daysUntil,
  deriveAttentionReasons,
  deriveLiveDigitalEstimateStatus,
  deriveNextAction,
  isActivePortfolioPublication,
  unlinkedGroupDisplayTitle
} from "./liveDigitalEstimatesStatus.mjs";
import {
  ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM,
  isAccountQuickbooksLinked
} from "../accountDirectory/accountDirectoryQuickbooksLinkage.mjs";
import {
  presentStaffLinkForDetail,
  recoverStaffPublicationLinkMeta
} from "../digitalEstimate/staffPublicationLinkRecovery.mjs";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

/** Fields that must never appear on list DTOs. */
const FORBIDDEN_LIST_KEYS = [
  "token_hash",
  "tokenHash",
  "token_wrapped",
  "tokenWrapped",
  "accessToken",
  "rawToken",
  "customer_snapshot_json",
  "pricing_evidence_json",
  "pricingEvidence",
  "service_role",
  "quickbooksListId",
  "quickbooks_list_id",
  "qb_list_id",
  "internalNotes",
  "internal_notes",
  "auditPayload",
  "authorization"
];

/**
 * @param {unknown} value
 */
function moneyNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/**
 * Extract customer-safe identity + value from a lean portfolio snapshot projection.
 * @param {object|null|undefined} snap
 */
export function extractPortfolioIdentityFromSnapshot(snap) {
  if (!snap || typeof snap !== "object") {
    return {
      customerDisplayName: null,
      projectName: null,
      projectAddress: null,
      publishedValue: null,
      frozenAccountDisplayName: null,
      accountDirectoryAccountId: null
    };
  }
  const project = snap.project && typeof snap.project === "object" ? snap.project : {};
  const iu =
    snap.internal_ui && typeof snap.internal_ui === "object"
      ? snap.internal_ui
      : snap.calculation_snapshot?.internal_ui &&
          typeof snap.calculation_snapshot.internal_ui === "object"
        ? snap.calculation_snapshot.internal_ui
        : {};
  const identity =
    iu.customer_identity_snapshot && typeof iu.customer_identity_snapshot === "object"
      ? iu.customer_identity_snapshot
      : snap.customer_identity_snapshot && typeof snap.customer_identity_snapshot === "object"
        ? snap.customer_identity_snapshot
        : null;
  const totals =
    snap.totals && typeof snap.totals === "object"
      ? snap.totals
      : snap.estimate?.totals && typeof snap.estimate.totals === "object"
        ? snap.estimate.totals
        : {};
  const publishedValue =
    moneyNumber(totals.estimatedProjectTotal) ??
    moneyNumber(totals.customerDisplayTotal) ??
    moneyNumber(iu.customer_display_total) ??
    null;
  return {
    customerDisplayName:
      String(identity?.accountDisplayName || identity?.contactDisplayName || "").trim() ||
      String(project.customerName || snap.customerName || "").trim() ||
      null,
    projectName: String(project.projectName || snap.projectName || "").trim() || null,
    projectAddress: String(project.projectAddress || snap.projectAddress || "").trim() || null,
    publishedValue,
    frozenAccountDisplayName: String(identity?.accountDisplayName || "").trim() || null,
    accountDirectoryAccountId:
      identity?.accountId ||
      identity?.accountDirectoryAccountId ||
      snap.account_directory_account_id ||
      null
  };
}

/**
 * @param {{
 *   digitalEstimateRepository: object,
 *   studioEstimateRepository?: object|null,
 *   amendmentRepository?: object|null,
 *   accountDirectoryStore?: object|null,
 *   configurationRepository?: object|null,
 *   env?: NodeJS.ProcessEnv|object,
 *   now?: () => Date,
 *   queryCounters?: { accountDirectoryFetches?: number, eventFetches?: number, reviewFetches?: number }
 * }} deps
 */
export function createLiveDigitalEstimatesService(deps) {
  const deRepo = deps.digitalEstimateRepository;
  const studioRepo = deps.studioEstimateRepository || null;
  const amendmentRepo = deps.amendmentRepository || null;
  const adStore = deps.accountDirectoryStore || null;
  const configRepo = deps.configurationRepository || null;
  const env = deps.env || process.env;
  const nowFn = deps.now || (() => new Date());
  const counters = deps.queryCounters || {
    accountDirectoryFetches: 0,
    eventFetches: 0,
    reviewFetches: 0
  };

  /**
   * Side-effect-free portfolio list.
   * @param {{
   *   organizationId: string,
   *   q?: string,
   *   status?: string,
   *   accountId?: string,
   *   estimatorUserId?: string,
   *   branch?: string,
   *   expiringWithinDays?: number|null,
   *   history?: boolean,
   *   needsAttentionOnly?: boolean,
   *   accountLinked?: "linked"|"unlinked"|null,
   *   quickbooksLinked?: "linked"|"unlinked"|null,
   *   groupByAccount?: boolean,
   *   sort?: string,
   *   limit?: number,
   *   offset?: number
   * }} query
   */
  async function listPortfolio(query) {
    const organizationId = String(query.organizationId || "");
    if (!organizationId) {
      const err = new Error("organizationId required");
      err.statusCode = 400;
      err.code = "organization_required";
      throw err;
    }
    const history = query.history === true;
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(query.limit) || DEFAULT_LIMIT)
    );
    const offset = Math.max(0, Number(query.offset) || 0);
    const now = nowFn();

    // Single bounded publication fetch (active by default).
    const rawPubs = await deRepo.listPortfolioPublications(organizationId, {
      includeInactive: history,
      limit: 500,
      offset: 0
    });

    const publicationIds = rawPubs.map((p) => String(p.id));

    // Batched event aggregates — one fetch for the page set, not per row.
    counters.eventFetches = (counters.eventFetches || 0) + 1;
    const eventAgg =
      typeof deRepo.aggregatePortfolioEvents === "function"
        ? await deRepo.aggregatePortfolioEvents(organizationId, publicationIds)
        : await fallbackAggregateEvents(deRepo, organizationId, publicationIds);

    // Batched review requests — one list for org, indexed by publication.
    counters.reviewFetches = (counters.reviewFetches || 0) + 1;
    const reviewByPub = await loadReviewIndex(organizationId);

    // Studio estimates batched by family root / source quote id.
    const studioByKey = await loadStudioIndex(organizationId, rawPubs);

    // Config activity batched (optional).
    const configActivityByPub = await loadConfigActivityIndex(organizationId, publicationIds);

    // Build lean rows first (need AD ids for batch).
    /** @type {Array<object>} */
    const leanRows = [];
    for (const pub of rawPubs) {
      const snapLean =
        pub.portfolio_snapshot ||
        pub.customer_snapshot_lean ||
        (pub.snapshot_project ? { project: pub.snapshot_project, totals: pub.snapshot_totals } : null);
      const identity = extractPortfolioIdentityFromSnapshot(
        snapLean || {
          project: {
            customerName: pub.customer_name,
            projectName: pub.project_name,
            projectAddress: pub.project_address
          },
          totals: {
            estimatedProjectTotal: pub.published_value ?? pub.customer_display_total
          },
          customer_identity_snapshot: pub.customer_identity_snapshot || null,
          account_directory_account_id: pub.account_directory_account_id || null
        }
      );

      const studio =
        studioByKey.get(String(pub.quote_family_root_id || "")) ||
        studioByKey.get(String(pub.source_quote_id || "")) ||
        null;

      const accountDirectoryAccountId =
        studio?.accountDirectoryAccountId ||
        identity.accountDirectoryAccountId ||
        pub.account_directory_account_id ||
        null;

      const events = eventAgg.get(String(pub.id)) || {
        hasFirstViewed: false,
        hasViewed: false,
        lastCustomerActivityAt: null,
        lastCustomerActivityLabel: null
      };

      const review = reviewByPub.get(String(pub.id)) || null;
      const hasConfigActivity = Boolean(configActivityByPub.get(String(pub.id)));

      const active = isActivePortfolioPublication(
        pub.status,
        pub.access_expires_at,
        now
      );
      if (!history && !active) continue;
      if (history && active && String(query.status || "") === "history_only") {
        /* keep inactive only when explicitly history — default history includes inactive */
      }

      const operationalStatus = deriveLiveDigitalEstimateStatus(
        {
          publicationStatus: pub.status,
          accessExpiresAt: pub.access_expires_at,
          pricingValidThrough: pub.pricing_valid_through,
          hasFirstViewed: events.hasFirstViewed,
          hasViewed: events.hasViewed,
          hasConfigActivity,
          reviewRequest: review,
          linkStatus: pub.link_status || null,
          recentlyRepublished: Boolean(pub.recently_republished),
          closed: String(pub.status || "").toLowerCase() === "closed"
        },
        now
      );

      const attentionReasons = deriveAttentionReasons(
        {
          operationalStatus,
          accountDirectoryAccountId,
          linkStatus: pub.link_status || null,
          pricingValidThrough: pub.pricing_valid_through,
          studioEstimateOutdated: Boolean(studio?.outdatedVersusPublication),
          configurationIncomplete: Boolean(pub.configuration_incomplete),
          reviewRequest: review
        },
        now
      );

      const nextAction = deriveNextAction({
        operationalStatus,
        attentionReasons,
        accountDirectoryAccountId,
        linkStatus: pub.link_status || null,
        reviewRequest: review,
        intakeCaseId: studio?.intakeCaseId || null,
        studioEstimateId: studio?.id || null,
        studioEstimateStatus: studio?.status || null
      });

      const publishedValue =
        identity.publishedValue ??
        moneyNumber(studio?.approval?.customerDisplayTotal) ??
        null;
      const configuredValue = moneyNumber(review?.requestedTotal ?? review?.configuredTotal);
      const configuredDelta =
        publishedValue != null && configuredValue != null
          ? Math.round((configuredValue - publishedValue) * 100) / 100
          : moneyNumber(review?.deltaTotal);

      const frozenName = identity.customerDisplayName;
      leanRows.push({
        publicationId: String(pub.id),
        quoteFamilyRootId: pub.quote_family_root_id || null,
        sourceQuoteId: pub.source_quote_id || null,
        quoteNumber: pub.quote_number || null,
        revisionLabel: pub.revision_label || null,
        publicationStatus: pub.status,
        operationalStatus,
        statusLabel: LIVE_DE_STATUS_LABELS[operationalStatus] || operationalStatus,
        attentionReasons,
        needsAttention: attentionReasons.length > 0,
        nextAction,
        customerDisplayName: frozenName,
        projectName: identity.projectName,
        projectAddress: identity.projectAddress,
        frozenAccountDisplayName: identity.frozenAccountDisplayName,
        accountDirectoryAccountId,
        accountGroupKey: accountGroupKeyForPublication({
          accountDirectoryAccountId,
          publicationId: String(pub.id),
          sourceQuoteId: pub.source_quote_id,
          quoteFamilyRootId: pub.quote_family_root_id
        }),
        publishedAt: pub.published_at || null,
        ageDays: ageDays(pub.published_at, now),
        pricingValidThrough: pub.pricing_valid_through || null,
        pricingDaysRemaining: daysUntil(pub.pricing_valid_through, now),
        accessExpiresAt: pub.access_expires_at || null,
        publishedValue,
        configuredValue,
        configuredDelta,
        lastCustomerActivityAt: events.lastCustomerActivityAt,
        lastCustomerActivityLabel: events.lastCustomerActivityLabel,
        estimatorUserId: pub.published_by_user_id || studio?.assignedEstimatorUserId || null,
        branch: studio?.branch || pub.branch || null,
        reviewRequestId: review?.id || null,
        reviewRequestStatus: review?.operatorStatus || review?.status || null,
        studioEstimateId: studio?.id || null,
        intakeCaseId: studio?.intakeCaseId || null,
        sourceStudioRevision: studio?.revision ?? pub.revision_number ?? null,
        isActive: active,
        linkStatus: pub.link_status || (active ? "active" : pub.status) || null
      });
    }

    // Filters on lean rows (full filtered set for metrics).
    let filtered = applyFilters(leanRows, query, now);

    // Sort
    filtered = sortRows(filtered, query.sort || "activity");

    // Metrics over FULL filtered set (not page).
    const metrics = computeMetrics(filtered, now);

    // Batched Account Directory lookup — exactly one AD fetch for all ids.
    const adIds = [
      ...new Set(
        filtered
          .map((r) => r.accountDirectoryAccountId)
          .filter(Boolean)
          .map(String)
      )
    ];
    counters.accountDirectoryFetches = (counters.accountDirectoryFetches || 0) + 1;
    const adById = await batchLoadAccounts(organizationId, adIds);

    // Attach live AD display names for grouping (frozen row identity preserved).
    for (const row of filtered) {
      const ad = row.accountDirectoryAccountId
        ? adById.get(String(row.accountDirectoryAccountId))
        : null;
      row.accountDisplayName = ad?.displayName || null;
      row.quickbooksLinked = ad ? Boolean(ad.quickbooksLinked) : null;
      if (
        ad?.displayName &&
        row.frozenAccountDisplayName &&
        ad.displayName !== row.frozenAccountDisplayName
      ) {
        row.publishedAsNote = `Published as ${row.frozenAccountDisplayName}`;
      } else {
        row.publishedAsNote = null;
      }
    }

    // Optional QB / linked filters after AD attach
    if (query.accountLinked === "linked") {
      filtered = filtered.filter((r) => r.accountDirectoryAccountId);
    } else if (query.accountLinked === "unlinked") {
      filtered = filtered.filter((r) => !r.accountDirectoryAccountId);
    }
    if (query.quickbooksLinked === "linked") {
      filtered = filtered.filter((r) => r.quickbooksLinked === true);
    } else if (query.quickbooksLinked === "unlinked") {
      filtered = filtered.filter((r) => r.quickbooksLinked === false);
    }

    // Recompute metrics if QB/linked filters applied after AD
    const metricsFinal = computeMetrics(filtered, now);

    const total = filtered.length;
    const pageRows = filtered.slice(offset, offset + limit);

    const groupByAccount = query.groupByAccount !== false;
    const groups = groupByAccount
      ? buildAccountGroups(pageRows, filtered)
      : [
          {
            groupKey: "flat",
            accountDisplayName: null,
            accountDirectoryAccountId: null,
            isUnlinkedGroup: false,
            accountDirectoryLinked: null,
            accountLinkageLabel: null,
            activePublicationCount: pageRows.filter((r) => r.isActive).length,
            totalActivePublishedValue: sumActiveValue(pageRows),
            latestCustomerActivityAt: latestActivity(pageRows),
            needingAttentionCount: pageRows.filter((r) => r.needsAttention).length,
            quickbooksLinked: null,
            publications: pageRows.map(toPublicListRow)
          }
        ];

    return {
      ok: true,
      mode: history ? "history" : "active",
      metrics: metricsFinal,
      groups,
      publications: pageRows.map(toPublicListRow),
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + limit < total
      },
      queryCounters: {
        accountDirectoryFetches: counters.accountDirectoryFetches,
        eventFetches: counters.eventFetches,
        reviewFetches: counters.reviewFetches
      }
    };
  }

  /**
   * Detail — still side-effect free (no link-copied / viewed events).
   */
  async function getPortfolioDetail(organizationId, publicationId) {
    const list = await listPortfolio({
      organizationId,
      history: true,
      limit: 50,
      offset: 0
    });
    const row =
      list.publications.find((p) => p.publicationId === publicationId) ||
      list.groups.flatMap((g) => g.publications).find((p) => p.publicationId === publicationId);
    if (!row) {
      const err = new Error("Publication not found");
      err.statusCode = 404;
      err.code = "publication_not_found";
      throw err;
    }
    // Reuse existing publication get for management fields — strip secrets.
    const pub = await deRepo.getPublication(organizationId, publicationId);
    const events =
      typeof deRepo.listEventsForPublication === "function"
        ? await deRepo.listEventsForPublication(organizationId, publicationId, 40)
        : [];
    const safeEvents = (events || []).map((e) => ({
      id: e.id,
      eventType: e.event_type || e.eventType,
      actorType: e.actor_type || e.actorType,
      createdAt: e.created_at || e.createdAt
    }));
    // Same staff-safe recovery as Publications workspace — read-only; never mint/replace.
    const linkMeta = await recoverStaffPublicationLinkMeta(
      deRepo,
      organizationId,
      pub || {
        id: publicationId,
        status: row.publicationStatus,
        access_expires_at: row.accessExpiresAt,
        revoked_at: null,
        superseded_at: null
      },
      env
    );
    const linkPresentation = presentStaffLinkForDetail(linkMeta, {
      accessExpiresAt: pub?.access_expires_at || row.accessExpiresAt,
      now: nowFn()
    });
    return {
      ok: true,
      publication: row,
      management: {
        publicationId: row.publicationId,
        status: pub?.status || row.publicationStatus,
        publishedAt: pub?.published_at || row.publishedAt,
        pricingValidThrough: pub?.pricing_valid_through || row.pricingValidThrough,
        accessExpiresAt: pub?.access_expires_at || row.accessExpiresAt,
        quoteNumber: pub?.quote_number || row.quoteNumber,
        revisionLabel: pub?.revision_label || row.revisionLabel
      },
      events: safeEvents,
      account: {
        accountDirectoryAccountId: row.accountDirectoryAccountId,
        accountDisplayName: row.accountDisplayName,
        quickbooksLinked: row.quickbooksLinked,
        publishedAsNote: row.publishedAsNote
      },
      studioEstimate: {
        studioEstimateId: row.studioEstimateId,
        intakeCaseId: row.intakeCaseId,
        revision: row.sourceStudioRevision
      },
      reviewRequest: row.reviewRequestId
        ? { id: row.reviewRequestId, status: row.reviewRequestStatus }
        : null,
      nextAction: row.nextAction,
      customerUrl: linkPresentation.customerUrl,
      linkAvailable: linkPresentation.linkAvailable,
      linkState: linkPresentation.linkState,
      linkUnavailableReason: linkPresentation.linkUnavailableReason,
      linkStatus: linkMeta.linkStatus
    };
  }

  async function loadReviewIndex(organizationId) {
    /** @type {Map<string, object>} */
    const map = new Map();
    if (!amendmentRepo || typeof amendmentRepo.listReviewRequests !== "function") {
      return map;
    }
    const rows = await amendmentRepo.listReviewRequests(organizationId, { limit: 200 });
    for (const r of rows || []) {
      const pubId = r.publication_id || r.publicationId || r.source_publication_id;
      if (!pubId) continue;
      const status = String(r.operator_status || r.operatorStatus || r.status || "").toLowerCase();
      const existing = map.get(String(pubId));
      // Prefer open requests
      if (!existing || isOpenReviewStatus(status)) {
        map.set(String(pubId), {
          id: r.id,
          status: r.status,
          operatorStatus: r.operator_status || r.operatorStatus || r.status,
          requestedTotal: r.requested_total ?? r.requestedTotal,
          configuredTotal: r.configured_total ?? r.configuredTotal,
          deltaTotal: r.delta_total ?? r.deltaTotal
        });
      }
    }
    return map;
  }

  async function loadStudioIndex(organizationId, pubs) {
    /** @type {Map<string, object>} */
    const map = new Map();
    if (!studioRepo) return map;
    const familyIds = [
      ...new Set(pubs.map((p) => p.quote_family_root_id).filter(Boolean).map(String))
    ];
    const sourceIds = [
      ...new Set(pubs.map((p) => p.source_quote_id).filter(Boolean).map(String))
    ];
    if (typeof studioRepo.listByIdsForPortfolio === "function") {
      const rows = await studioRepo.listByIdsForPortfolio(organizationId, {
        ids: sourceIds,
        intakeCaseIds: familyIds
      });
      for (const est of rows || []) {
        if (est.id) map.set(String(est.id), est);
        if (est.intakeCaseId) map.set(String(est.intakeCaseId), est);
      }
      return map;
    }
    // Memory / simple repos: try get by id for unique keys (bounded).
    const keys = [...new Set([...familyIds, ...sourceIds])].slice(0, 200);
    for (const key of keys) {
      if (typeof studioRepo.get === "function") {
        const est = await studioRepo.get(organizationId, key);
        if (est) {
          map.set(String(est.id), est);
          if (est.intakeCaseId) map.set(String(est.intakeCaseId), est);
        }
      }
    }
    return map;
  }

  async function loadConfigActivityIndex(organizationId, publicationIds) {
    /** @type {Map<string, boolean>} */
    const map = new Map();
    if (!configRepo || typeof configRepo.listActiveSessionsForPublications !== "function") {
      return map;
    }
    const rows = await configRepo.listActiveSessionsForPublications(
      organizationId,
      publicationIds
    );
    for (const r of rows || []) {
      const pubId = r.publication_id || r.publicationId;
      if (pubId) map.set(String(pubId), true);
    }
    return map;
  }

  async function batchLoadAccounts(organizationId, ids) {
    /** @type {Map<string, { displayName: string, quickbooksLinked: boolean }>} */
    const map = new Map();
    if (!adStore || !ids.length) return map;

    // 1) Account display names (one batch).
    if (typeof adStore.getAccountsByIds === "function") {
      const rows = await adStore.getAccountsByIds(organizationId, ids);
      for (const a of rows || []) {
        map.set(String(a.id), {
          displayName: String(a.display_name || a.displayName || a.name || "").trim() || "Account",
          quickbooksLinked: false
        });
      }
    } else if (typeof adStore.listAccounts === "function") {
      const listed = await adStore.listAccounts(organizationId, {
        includeArchived: true,
        limit: 5000,
        offset: 0
      });
      const want = new Set(ids.map(String));
      for (const a of listed?.rows || listed || []) {
        if (!want.has(String(a.id))) continue;
        map.set(String(a.id), {
          displayName: String(a.display_name || a.displayName || a.name || "").trim() || "Account",
          quickbooksLinked: false
        });
      }
    }

    // 2) Canonical QB linkage from active quickbooks_desktop external links (one batch).
    /** @type {Map<string, object[]>} */
    const linksByAccount = new Map();
    if (typeof adStore.listActiveExternalLinksForAccountIds === "function") {
      const links = await adStore.listActiveExternalLinksForAccountIds(
        organizationId,
        ids,
        ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM
      );
      for (const link of links || []) {
        const accountId = String(link.accountId || link.account_id || "");
        if (!accountId) continue;
        if (!linksByAccount.has(accountId)) linksByAccount.set(accountId, []);
        linksByAccount.get(accountId).push(link);
      }
    } else if (typeof adStore.listAllActiveExternalLinks === "function") {
      const links = await adStore.listAllActiveExternalLinks(
        organizationId,
        ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM
      );
      const want = new Set(ids.map(String));
      for (const link of links || []) {
        const accountId = String(link.accountId || link.account_id || "");
        if (!want.has(accountId)) continue;
        if (!linksByAccount.has(accountId)) linksByAccount.set(accountId, []);
        linksByAccount.get(accountId).push(link);
      }
    }

    for (const [accountId, entry] of map) {
      entry.quickbooksLinked = isAccountQuickbooksLinked(linksByAccount.get(accountId) || []);
    }
    return map;
  }

  return {
    listPortfolio,
    getPortfolioDetail,
    queryCounters: counters
  };
}

function isOpenReviewStatus(status) {
  return ["new", "open", "submitted", "in_review", "revision_required", "pending"].includes(
    String(status || "").toLowerCase()
  );
}

async function fallbackAggregateEvents(deRepo, organizationId, publicationIds) {
  /** @type {Map<string, object>} */
  const map = new Map();
  for (const id of publicationIds) {
    map.set(id, {
      hasFirstViewed: false,
      hasViewed: false,
      lastCustomerActivityAt: null,
      lastCustomerActivityLabel: null
    });
  }
  if (typeof deRepo.listEventsForPublications !== "function") {
    return map;
  }
  const events = await deRepo.listEventsForPublications(organizationId, publicationIds);
  for (const e of events || []) {
    const pubId = String(e.publication_id || e.publicationId || "");
    const row = map.get(pubId);
    if (!row) continue;
    const type = String(e.event_type || e.eventType || "");
    const at = e.created_at || e.createdAt || null;
    if (type === "first_viewed") {
      row.hasFirstViewed = true;
      row.hasViewed = true;
      row.lastCustomerActivityAt = at;
      row.lastCustomerActivityLabel = "First viewed";
    } else if (type === "viewed") {
      row.hasViewed = true;
      if (!row.lastCustomerActivityAt || String(at) > String(row.lastCustomerActivityAt)) {
        row.lastCustomerActivityAt = at;
        row.lastCustomerActivityLabel = "Viewed";
      }
    }
  }
  return map;
}

function applyFilters(rows, query, now) {
  let out = rows;
  const q = String(query.q || "").trim().toLowerCase();
  if (q) {
    out = out.filter((r) => {
      const hay = [
        r.customerDisplayName,
        r.projectName,
        r.quoteNumber,
        r.accountDisplayName,
        r.frozenAccountDisplayName
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }
  if (query.accountId) {
    out = out.filter((r) => String(r.accountDirectoryAccountId) === String(query.accountId));
  }
  if (query.estimatorUserId) {
    out = out.filter((r) => String(r.estimatorUserId) === String(query.estimatorUserId));
  }
  if (query.branch) {
    out = out.filter(
      (r) => String(r.branch || "").toLowerCase() === String(query.branch).toLowerCase()
    );
  }
  if (query.status) {
    const st = String(query.status).toLowerCase();
    out = out.filter(
      (r) =>
        r.operationalStatus === st ||
        r.publicationStatus === st ||
        (st === "needs_attention" && r.needsAttention)
    );
  }
  if (query.needsAttentionOnly) {
    out = out.filter((r) => r.needsAttention);
  }
  if (query.expiringWithinDays != null && Number(query.expiringWithinDays) >= 0) {
    const days = Number(query.expiringWithinDays);
    out = out.filter((r) => {
      const d = daysUntil(r.pricingValidThrough, now);
      return d != null && d >= 0 && d <= days;
    });
  }
  if (!query.history) {
    out = out.filter((r) => r.isActive);
  } else if (String(query.status || "") !== "active") {
    // history mode: include inactive; optionally still show active unless filtered
  }
  return out;
}

function sortRows(rows, sort) {
  const copy = [...rows];
  if (sort === "published_at" || sort === "newest") {
    copy.sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")));
  } else if (sort === "value") {
    copy.sort((a, b) => (Number(b.publishedValue) || 0) - (Number(a.publishedValue) || 0));
  } else if (sort === "customer") {
    copy.sort((a, b) =>
      String(a.customerDisplayName || "").localeCompare(String(b.customerDisplayName || ""))
    );
  } else {
    // activity first
    copy.sort((a, b) => {
      if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
      const aAct = a.lastCustomerActivityAt || a.publishedAt || "";
      const bAct = b.lastCustomerActivityAt || b.publishedAt || "";
      return String(bAct).localeCompare(String(aAct));
    });
  }
  return copy;
}

function computeMetrics(rows, now) {
  const active = rows.filter((r) => r.isActive);
  const notViewed = active.filter(
    (r) => r.operationalStatus === LIVE_DE_OPERATIONAL_STATUSES.PUBLISHED_NOT_VIEWED
  );
  const viewedActive = active.filter(
    (r) =>
      r.operationalStatus === LIVE_DE_OPERATIONAL_STATUSES.VIEWED ||
      r.operationalStatus === LIVE_DE_OPERATIONAL_STATUSES.CUSTOMER_CONFIGURING ||
      r.operationalStatus === LIVE_DE_OPERATIONAL_STATUSES.REVISED_REPUBLISHED
  );
  const reviewRequested = active.filter(
    (r) =>
      r.operationalStatus === LIVE_DE_OPERATIONAL_STATUSES.REVIEW_REQUESTED ||
      r.operationalStatus === LIVE_DE_OPERATIONAL_STATUSES.ESTIMATOR_REVIEWING
  );
  const revisionRequired = active.filter(
    (r) => r.operationalStatus === LIVE_DE_OPERATIONAL_STATUSES.REVISION_REQUIRED
  );
  const expiring = active.filter((r) => {
    const d = daysUntil(r.pricingValidThrough, now);
    return d != null && d >= 0 && d <= 7;
  });
  return {
    activePublications: active.length,
    needsAttention: active.filter((r) => r.needsAttention).length,
    publishedNotViewed: notViewed.length,
    viewedOrActive: viewedActive.length,
    reviewRequested: reviewRequested.length,
    revisionRequired: revisionRequired.length,
    expiringWithin7Days: expiring.length,
    totalActivePublishedValue: sumActiveValue(active)
  };
}

function sumActiveValue(rows) {
  return Math.round(
    rows
      .filter((r) => r.isActive)
      .reduce((s, r) => s + (Number(r.publishedValue) || 0), 0) * 100
  ) / 100;
}

function latestActivity(rows) {
  let best = null;
  for (const r of rows) {
    const at = r.lastCustomerActivityAt || r.publishedAt;
    if (!best || String(at) > String(best)) best = at;
  }
  return best;
}

function buildAccountGroups(pageRows, allFiltered) {
  /** @type {Map<string, object>} */
  const groupMeta = new Map();
  for (const r of allFiltered) {
    const key = r.accountGroupKey;
    if (!groupMeta.has(key)) {
      const isUnlinked = !r.accountDirectoryAccountId;
      groupMeta.set(key, {
        groupKey: key,
        accountDirectoryAccountId: r.accountDirectoryAccountId,
        accountDisplayName: isUnlinked
          ? unlinkedGroupDisplayTitle({
              frozenAccountDisplayName: r.frozenAccountDisplayName,
              customerDisplayName: r.customerDisplayName
            })
          : r.accountDisplayName || r.frozenAccountDisplayName || "Account",
        isUnlinkedGroup: isUnlinked,
        accountDirectoryLinked: !isUnlinked,
        quickbooksLinked: r.quickbooksLinked,
        rows: []
      });
    }
    const g = groupMeta.get(key);
    g.rows.push(r);
    if (!g.isUnlinkedGroup && r.accountDisplayName) {
      g.accountDisplayName = r.accountDisplayName;
    }
    if (r.quickbooksLinked != null) g.quickbooksLinked = r.quickbooksLinked;
  }

  /** @type {Map<string, object[]>} */
  const pageByGroup = new Map();
  for (const r of pageRows) {
    if (!pageByGroup.has(r.accountGroupKey)) pageByGroup.set(r.accountGroupKey, []);
    pageByGroup.get(r.accountGroupKey).push(r);
  }

  const groups = [];
  for (const [key, pubs] of pageByGroup) {
    const meta = groupMeta.get(key);
    const allInGroup = meta?.rows || pubs;
    const isUnlinked = Boolean(meta?.isUnlinkedGroup);
    groups.push({
      groupKey: key,
      accountDirectoryAccountId: meta?.accountDirectoryAccountId || null,
      accountDisplayName:
        meta?.accountDisplayName ||
        (isUnlinked ? "Unnamed unlinked customer" : "Account"),
      isUnlinkedGroup: isUnlinked,
      accountDirectoryLinked: !isUnlinked,
      accountLinkageLabel: isUnlinked ? "Account Directory not linked" : null,
      activePublicationCount: allInGroup.filter((r) => r.isActive).length,
      totalActivePublishedValue: sumActiveValue(allInGroup),
      latestCustomerActivityAt: latestActivity(allInGroup),
      needingAttentionCount: allInGroup.filter((r) => r.needsAttention).length,
      quickbooksLinked: isUnlinked ? null : meta?.quickbooksLinked ?? null,
      publications: pubs.map(toPublicListRow)
    });
  }
  groups.sort((a, b) => {
    if (a.isUnlinkedGroup !== b.isUnlinkedGroup) return a.isUnlinkedGroup ? 1 : -1;
    return String(a.accountDisplayName).localeCompare(String(b.accountDisplayName));
  });
  return groups;
}

function toPublicListRow(row) {
  const out = {
    publicationId: row.publicationId,
    operationalStatus: row.operationalStatus,
    statusLabel: row.statusLabel,
    attentionReasons: row.attentionReasons,
    needsAttention: row.needsAttention,
    nextAction: {
      code: row.nextAction.code,
      label: row.nextAction.label,
      target: row.nextAction.target || null,
      reviewRequestId: row.nextAction.reviewRequestId || null
    },
    customerDisplayName: row.customerDisplayName,
    projectName: row.projectName,
    publishedAsNote: row.publishedAsNote || null,
    accountDirectoryAccountId: row.accountDirectoryAccountId,
    accountDisplayName: row.accountDisplayName || null,
    accountGroupKey: row.accountGroupKey,
    quickbooksLinked: row.quickbooksLinked,
    quoteNumber: row.quoteNumber,
    revisionLabel: row.revisionLabel,
    publishedAt: row.publishedAt,
    ageDays: row.ageDays,
    pricingValidThrough: row.pricingValidThrough,
    pricingDaysRemaining: row.pricingDaysRemaining,
    publishedValue: row.publishedValue,
    configuredValue: row.configuredValue,
    configuredDelta: row.configuredDelta,
    lastCustomerActivityAt: row.lastCustomerActivityAt,
    lastCustomerActivityLabel: row.lastCustomerActivityLabel,
    estimatorUserId: row.estimatorUserId,
    branch: row.branch,
    reviewRequestId: row.reviewRequestId,
    reviewRequestStatus: row.reviewRequestStatus,
    studioEstimateId: row.studioEstimateId,
    intakeCaseId: row.intakeCaseId,
    sourceStudioRevision: row.sourceStudioRevision,
    isActive: row.isActive,
    linkStatus: row.linkStatus
  };
  for (const k of FORBIDDEN_LIST_KEYS) {
    if (k in out) delete out[k];
  }
  return out;
}
