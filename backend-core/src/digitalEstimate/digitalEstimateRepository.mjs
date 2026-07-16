/**
 * Digital Estimate repository — memory (tests) + Supabase (Brain service role).
 * Publish / token-replace mutations go through atomic boundaries (SQL RPC or
 * in-memory transactional apply with family-level mutex). Never simulate
 * multi-statement commit across independent network calls for Supabase.
 */

import { randomUUID } from "node:crypto";

/**
 * Simple async mutex for in-memory concurrency tests.
 * @returns {{ runExclusive: <T>(fn: () => Promise<T>) => Promise<T> }}
 */
function createAsyncMutex() {
  let chain = Promise.resolve();
  return {
    runExclusive(fn) {
      const run = chain.then(() => fn());
      chain = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    }
  };
}

export function createInMemoryDigitalEstimateRepository(opts = {}) {
  /** @type {Map<string, Record<string, unknown>>} */
  const publications = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const snapshots = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const tokens = new Map();
  /** @type {Array<Record<string, unknown>>} */
  const events = [];
  /** @type {Map<string, Record<string, unknown>>} */
  const quotes = opts.quotes instanceof Map ? opts.quotes : new Map();
  /** @type {Map<string, ReturnType<typeof createAsyncMutex>>} */
  const familyLocks = new Map();
  /** @type {Map<string, ReturnType<typeof createAsyncMutex>>} */
  const publicationLocks = new Map();

  function familyLock(organizationId, familyRootId) {
    const key = `${organizationId}:${familyRootId}`;
    if (!familyLocks.has(key)) familyLocks.set(key, createAsyncMutex());
    return familyLocks.get(key);
  }

  function publicationLock(organizationId, publicationId) {
    const key = `${organizationId}:${publicationId}`;
    if (!publicationLocks.has(key)) publicationLocks.set(key, createAsyncMutex());
    return publicationLocks.get(key);
  }

  function cloneState() {
    return {
      publications: new Map(
        [...publications.entries()].map(([k, v]) => [k, structuredClone(v)])
      ),
      snapshots: new Map([...snapshots.entries()].map(([k, v]) => [k, structuredClone(v)])),
      tokens: new Map([...tokens.entries()].map(([k, v]) => [k, structuredClone(v)])),
      events: structuredClone(events)
    };
  }

  function restoreState(snap) {
    publications.clear();
    for (const [k, v] of snap.publications) publications.set(k, v);
    snapshots.clear();
    for (const [k, v] of snap.snapshots) snapshots.set(k, v);
    tokens.clear();
    for (const [k, v] of snap.tokens) tokens.set(k, v);
    events.length = 0;
    events.push(...snap.events);
  }

  const api = {
    mode: "memory",
    seedQuote(row) {
      quotes.set(String(row.id), structuredClone(row));
    },
    getQuote(quoteId) {
      return quotes.get(String(quoteId)) ?? null;
    },
    async getQuoteHeader(organizationId, quoteId) {
      const row = quotes.get(String(quoteId));
      if (!row) return null;
      if (organizationId && row.organization_id && row.organization_id !== organizationId) {
        return null;
      }
      return structuredClone(row);
    },
    async updateQuoteHeader(organizationId, quoteId, patch) {
      const row = quotes.get(String(quoteId));
      if (!row) return null;
      if (organizationId && row.organization_id && row.organization_id !== organizationId) {
        return null;
      }
      Object.assign(row, patch);
      return structuredClone(row);
    },
    async listActivePublicationsForFamily(organizationId, familyRootId) {
      return [...publications.values()].filter(
        (p) =>
          p.organization_id === organizationId &&
          p.quote_family_root_id === familyRootId &&
          p.status === "active"
      );
    },
    async insertPublication(row) {
      const id = row.id || randomUUID();
      const full = { ...row, id };
      publications.set(id, full);
      return structuredClone(full);
    },
    async updatePublication(organizationId, publicationId, patch) {
      const row = publications.get(String(publicationId));
      if (!row || row.organization_id !== organizationId) return null;
      if (patch.organization_id != null && patch.organization_id !== row.organization_id) {
        throw new Error("organization_id is immutable on digital estimate rows");
      }
      Object.assign(row, patch, { updated_at: new Date().toISOString() });
      return structuredClone(row);
    },
    async insertSnapshot(row) {
      const id = row.id || randomUUID();
      const full = { ...row, id };
      snapshots.set(id, full);
      return structuredClone(full);
    },
    async getSnapshotByPublicationId(organizationId, publicationId) {
      const row = [...snapshots.values()].find(
        (s) => s.organization_id === organizationId && s.publication_id === publicationId
      );
      return row ? structuredClone(row) : null;
    },
    async insertToken(row) {
      const id = row.id || randomUUID();
      const full = { ...row, id, access_count: row.access_count ?? 0 };
      tokens.set(id, full);
      return structuredClone(full);
    },
    async findTokenByHash(tokenHash) {
      const row = [...tokens.values()].find((t) => t.token_hash === tokenHash && !t.revoked_at);
      return row ? structuredClone(row) : null;
    },
    async findAnyTokenByHash(tokenHash) {
      const row = [...tokens.values()].find((t) => t.token_hash === tokenHash);
      return row ? structuredClone(row) : null;
    },
    async updateToken(organizationId, tokenId, patch) {
      const row = tokens.get(String(tokenId));
      if (!row || row.organization_id !== organizationId) return null;
      Object.assign(row, patch);
      return structuredClone(row);
    },
    async listTokensForPublication(organizationId, publicationId) {
      return [...tokens.values()].filter(
        (t) => t.organization_id === organizationId && t.publication_id === publicationId
      );
    },
    async getPublication(organizationId, publicationId) {
      const row = publications.get(String(publicationId));
      if (!row || row.organization_id !== organizationId) return null;
      return structuredClone(row);
    },
    async listPublicationsForQuote(organizationId, sourceQuoteId) {
      return [...publications.values()]
        .filter((p) => p.organization_id === organizationId && p.source_quote_id === sourceQuoteId)
        .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
    },
    async appendEvent(row) {
      if (row.event_type === "first_viewed") {
        const exists = events.some(
          (e) =>
            e.publication_id === row.publication_id &&
            e.organization_id === row.organization_id &&
            e.event_type === "first_viewed"
        );
        if (exists) {
          const err = new Error("first_viewed already recorded");
          err.code = "23505";
          throw err;
        }
      }
      const full = {
        ...row,
        id: row.id || randomUUID(),
        created_at: row.created_at || new Date().toISOString()
      };
      events.push(full);
      return structuredClone(full);
    },
    async tryAppendFirstViewed(row) {
      return publicationLock(row.organization_id, row.publication_id).runExclusive(async () => {
        try {
          await api.appendEvent({ ...row, event_type: "first_viewed" });
          return true;
        } catch (e) {
          if (e?.code === "23505") return false;
          throw e;
        }
      });
    },
    async listEventsForQuote(organizationId, sourceQuoteId, limit = 80) {
      return events
        .filter((e) => e.organization_id === organizationId && e.source_quote_id === sourceQuoteId)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, limit);
    },
    async listEventsForPublication(organizationId, publicationId, limit = 80) {
      return events
        .filter((e) => e.organization_id === organizationId && e.publication_id === publicationId)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, limit);
    },

    /**
     * Atomic publish for memory mode: all-or-nothing under a family mutex.
     * Mirrors digital_estimate_publish_atomic.
     */
    async publishAtomic(payload) {
      const {
        organizationId,
        sourceQuoteId,
        quoteFamilyRootId,
        quoteNumber,
        revisionNumber,
        revisionLabel,
        quoteSource,
        publishedByUserId,
        accessExpiresAt,
        pricingValidThrough,
        termsDisclosureVersion,
        calculationEngineVersion,
        sourceQuoteFingerprint,
        customerSnapshotHash,
        pricingEvidenceHash,
        customerSnapshotJson,
        pricingEvidenceJson,
        tokenHash,
        publishedEventMetadata,
        publishedAt
      } = payload;

      return familyLock(organizationId, quoteFamilyRootId).runExclusive(async () => {
        if (customerSnapshotJson == null || pricingEvidenceJson == null) {
          throw new Error("snapshot payloads required");
        }
        if (!tokenHash) {
          throw new Error("token hash required");
        }
        const checkpoint = cloneState();
        try {
          const now = publishedAt || new Date().toISOString();
          const pubId = randomUUID();
          const tokenId = randomUUID();

          const priors = [...publications.values()].filter(
            (p) =>
              p.organization_id === organizationId &&
              p.quote_family_root_id === quoteFamilyRootId &&
              p.status === "active"
          );

          for (const prior of priors) {
            Object.assign(prior, {
              status: "superseded",
              superseded_at: now,
              updated_at: now
            });
            for (const t of tokens.values()) {
              if (t.publication_id === prior.id && !t.revoked_at) {
                t.revoked_at = now;
              }
            }
            events.push({
              id: randomUUID(),
              organization_id: organizationId,
              publication_id: prior.id,
              source_quote_id: prior.source_quote_id,
              event_type: "superseded",
              actor_type: "system",
              actor_user_id: publishedByUserId ?? null,
              metadata: { supersededByPublicationId: pubId },
              created_at: now
            });
          }

          const publication = {
            id: pubId,
            organization_id: organizationId,
            source_quote_id: sourceQuoteId,
            quote_family_root_id: quoteFamilyRootId,
            quote_number: quoteNumber,
            revision_number: revisionNumber,
            revision_label: revisionLabel,
            quote_source: quoteSource,
            status: "active",
            published_at: now,
            published_by_user_id: publishedByUserId ?? null,
            access_expires_at: accessExpiresAt,
            pricing_valid_through: pricingValidThrough,
            terms_disclosure_version: termsDisclosureVersion,
            calculation_engine_version: calculationEngineVersion,
            source_quote_fingerprint: sourceQuoteFingerprint,
            customer_snapshot_hash: customerSnapshotHash,
            pricing_evidence_hash: pricingEvidenceHash,
            created_at: now,
            updated_at: now
          };
          publications.set(pubId, publication);

          for (const prior of priors) {
            prior.superseded_by_publication_id = pubId;
          }

          const snapId = randomUUID();
          snapshots.set(snapId, {
            id: snapId,
            organization_id: organizationId,
            publication_id: pubId,
            customer_snapshot_json: structuredClone(customerSnapshotJson),
            pricing_evidence_json: structuredClone(pricingEvidenceJson),
            customer_snapshot_hash: customerSnapshotHash,
            pricing_evidence_hash: pricingEvidenceHash,
            created_at: now
          });

          tokens.set(tokenId, {
            id: tokenId,
            organization_id: organizationId,
            publication_id: pubId,
            token_hash: tokenHash,
            created_at: now,
            created_by_user_id: publishedByUserId ?? null,
            access_count: 0,
            revoked_at: null
          });

          events.push({
            id: randomUUID(),
            organization_id: organizationId,
            publication_id: pubId,
            source_quote_id: sourceQuoteId,
            event_type: "published",
            actor_type: "user",
            actor_user_id: publishedByUserId ?? null,
            metadata: publishedEventMetadata || {},
            created_at: now
          });

          // Fail-closed integrity: never leave active without snapshot+token.
          const snapOk = [...snapshots.values()].some((s) => s.publication_id === pubId);
          const tokOk = [...tokens.values()].some(
            (t) => t.publication_id === pubId && !t.revoked_at
          );
          if (!snapOk || !tokOk) {
            throw new Error("atomic publish integrity check failed");
          }

          const activeCount = [...publications.values()].filter(
            (p) =>
              p.organization_id === organizationId &&
              p.quote_family_root_id === quoteFamilyRootId &&
              p.status === "active"
          ).length;
          if (activeCount !== 1) {
            throw new Error("atomic publish left multiple active publications");
          }

          return {
            publication: structuredClone(publication),
            tokenId,
            supersededCount: priors.length
          };
        } catch (e) {
          restoreState(checkpoint);
          throw e;
        }
      });
    },

    /**
     * Atomic token replace — never leaves an active publication without a usable token.
     */
    async replaceTokenAtomic(payload) {
      const { organizationId, publicationId, newTokenHash, actorUserId, replacedAt } = payload;
      return publicationLock(organizationId, publicationId).runExclusive(async () => {
        const checkpoint = cloneState();
        try {
          const pub = publications.get(String(publicationId));
          if (!pub || pub.organization_id !== organizationId) {
            const err = new Error("Publication not found");
            err.code = "publication_not_found";
            err.statusCode = 404;
            throw err;
          }
          if (pub.status !== "active") {
            const err = new Error("Publication is not active");
            err.code = "publication_not_active";
            err.statusCode = 400;
            throw err;
          }
          const now = replacedAt || new Date().toISOString();
          for (const t of tokens.values()) {
            if (t.publication_id === publicationId && !t.revoked_at) {
              t.revoked_at = now;
            }
          }
          const tokenId = randomUUID();
          tokens.set(tokenId, {
            id: tokenId,
            organization_id: organizationId,
            publication_id: publicationId,
            token_hash: newTokenHash,
            created_at: now,
            created_by_user_id: actorUserId ?? null,
            access_count: 0,
            revoked_at: null
          });
          events.push({
            id: randomUUID(),
            organization_id: organizationId,
            publication_id: publicationId,
            source_quote_id: pub.source_quote_id,
            event_type: "token_replaced",
            actor_type: "user",
            actor_user_id: actorUserId ?? null,
            metadata: {},
            created_at: now
          });
          const activeTokens = [...tokens.values()].filter(
            (t) => t.publication_id === publicationId && !t.revoked_at
          );
          if (activeTokens.length !== 1) {
            throw new Error("token replace left invalid active token count");
          }
          return { tokenId, publicationId };
        } catch (e) {
          restoreState(checkpoint);
          throw e;
        }
      });
    },

    /** Test introspection */
    _dump() {
      return {
        publications: [...publications.values()],
        snapshots: [...snapshots.values()],
        tokens: [...tokens.values()],
        events: [...events]
      };
    }
  };

  return api;
}

/**
 * Supabase-backed repository (Brain service role).
 * @param {{ db: import("@supabase/supabase-js").SupabaseClient }} deps
 */
export function createSupabaseDigitalEstimateRepository(deps) {
  const db = deps.db;
  return {
    mode: "supabase",
    async getQuoteHeader(organizationId, quoteId) {
      let q = db.from("quote_headers").select("*").eq("id", quoteId).limit(1);
      if (organizationId) q = q.eq("organization_id", organizationId);
      const { data, error } = await q;
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async listActivePublicationsForFamily(organizationId, familyRootId) {
      const { data, error } = await db
        .from("quote_publications")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("quote_family_root_id", familyRootId)
        .eq("status", "active");
      if (error) throw error;
      return data || [];
    },
    async insertPublication(row) {
      const { data, error } = await db.from("quote_publications").insert(row).select("*").limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async updatePublication(organizationId, publicationId, patch) {
      const { data, error } = await db
        .from("quote_publications")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", publicationId)
        .eq("organization_id", organizationId)
        .select("*")
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async insertSnapshot(row) {
      const { data, error } = await db
        .from("quote_publication_snapshots")
        .insert(row)
        .select("*")
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async getSnapshotByPublicationId(organizationId, publicationId) {
      const { data, error } = await db
        .from("quote_publication_snapshots")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("publication_id", publicationId)
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async insertToken(row) {
      const { data, error } = await db
        .from("quote_publication_access_tokens")
        .insert(row)
        .select("*")
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async findTokenByHash(tokenHash) {
      const { data, error } = await db
        .from("quote_publication_access_tokens")
        .select("*")
        .eq("token_hash", tokenHash)
        .is("revoked_at", null)
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async findAnyTokenByHash(tokenHash) {
      const { data, error } = await db
        .from("quote_publication_access_tokens")
        .select("*")
        .eq("token_hash", tokenHash)
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async updateToken(organizationId, tokenId, patch) {
      const { data, error } = await db
        .from("quote_publication_access_tokens")
        .update(patch)
        .eq("id", tokenId)
        .eq("organization_id", organizationId)
        .select("*")
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async listTokensForPublication(organizationId, publicationId) {
      const { data, error } = await db
        .from("quote_publication_access_tokens")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("publication_id", publicationId);
      if (error) throw error;
      return data || [];
    },
    async getPublication(organizationId, publicationId) {
      const { data, error } = await db
        .from("quote_publications")
        .select("*")
        .eq("id", publicationId)
        .eq("organization_id", organizationId)
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async listPublicationsForQuote(organizationId, sourceQuoteId) {
      const { data, error } = await db
        .from("quote_publications")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("source_quote_id", sourceQuoteId)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    async appendEvent(row) {
      const { data, error } = await db.from("quote_publication_events").insert(row).select("*").limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async tryAppendFirstViewed(row) {
      const { data, error } = await db.rpc("digital_estimate_try_first_viewed", {
        p_organization_id: row.organization_id,
        p_publication_id: row.publication_id,
        p_source_quote_id: row.source_quote_id,
        p_metadata: row.metadata || {}
      });
      if (error) throw error;
      return data === true;
    },
    async listEventsForQuote(organizationId, sourceQuoteId, limit = 80) {
      const { data, error } = await db
        .from("quote_publication_events")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("source_quote_id", sourceQuoteId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },
    async listEventsForPublication(organizationId, publicationId, limit = 80) {
      const { data, error } = await db
        .from("quote_publication_events")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("publication_id", publicationId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },

    /**
     * Transactional publish via Postgres RPC (security definer, service_role only).
     */
    async publishAtomic(payload) {
      const { data, error } = await db.rpc("digital_estimate_publish_atomic", {
        p_organization_id: payload.organizationId,
        p_source_quote_id: payload.sourceQuoteId,
        p_quote_family_root_id: payload.quoteFamilyRootId,
        p_quote_number: payload.quoteNumber,
        p_revision_number: payload.revisionNumber,
        p_revision_label: payload.revisionLabel,
        p_quote_source: payload.quoteSource,
        p_published_by_user_id: payload.publishedByUserId ?? null,
        p_access_expires_at: payload.accessExpiresAt,
        p_pricing_valid_through: payload.pricingValidThrough,
        p_terms_disclosure_version: payload.termsDisclosureVersion,
        p_calculation_engine_version: payload.calculationEngineVersion,
        p_source_quote_fingerprint: payload.sourceQuoteFingerprint,
        p_customer_snapshot_hash: payload.customerSnapshotHash,
        p_pricing_evidence_hash: payload.pricingEvidenceHash,
        p_customer_snapshot_json: payload.customerSnapshotJson,
        p_pricing_evidence_json: payload.pricingEvidenceJson,
        p_token_hash: payload.tokenHash,
        p_published_event_metadata: payload.publishedEventMetadata || {}
      });
      if (error) throw error;
      const publicationId = data?.publication_id;
      if (!publicationId) throw new Error("publish atomic returned no publication_id");
      const publication = await this.getPublication(payload.organizationId, publicationId);
      if (!publication) throw new Error("publish atomic publication not readable after commit");
      return {
        publication,
        tokenId: data.token_id,
        supersededCount: Number(data.superseded_count) || 0
      };
    },

    async replaceTokenAtomic(payload) {
      const { data, error } = await db.rpc("digital_estimate_replace_token_atomic", {
        p_organization_id: payload.organizationId,
        p_publication_id: payload.publicationId,
        p_new_token_hash: payload.newTokenHash,
        p_actor_user_id: payload.actorUserId ?? null
      });
      if (error) {
        const msg = String(error.message || error);
        if (/publication not found/i.test(msg)) {
          const err = new Error("Publication not found");
          err.code = "publication_not_found";
          err.statusCode = 404;
          throw err;
        }
        if (/not active/i.test(msg)) {
          const err = new Error("Publication is not active");
          err.code = "publication_not_active";
          err.statusCode = 400;
          throw err;
        }
        throw error;
      }
      return {
        tokenId: data?.token_id,
        publicationId: payload.publicationId
      };
    }
  };
}
