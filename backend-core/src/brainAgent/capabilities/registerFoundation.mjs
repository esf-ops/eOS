/**
 * Register foundation read capabilities (Accounts, Quotes, Jobs, Inventory, Knowledge, one metric).
 */

import { registerCapability } from "../capabilityRegistry.mjs";
import { makeEvidence } from "../evidence.mjs";
import { searchQuotesForAi, retrieveQuoteForAi } from "../../slabAi/slabAiQuoteActions.js";
import { searchAccountsForAi, retrieveAccountForAi } from "../../slabAi/slabAiAccountActions.mjs";
import { listAccountJobsForAi } from "../../slabAi/slabAiJobActions.mjs";
import { searchMaterialsForAi } from "../../slabAi/slabAiInventoryActions.mjs";
import { searchApprovedKnowledge } from "../../slabAi/knowledge/knowledgeRetrieval.mjs";
import { queryQuoteCountByAccount } from "./queryMetric.mjs";

function pickStr(v) {
  return String(v ?? "").trim();
}

function okInput(obj, required = []) {
  for (const k of required) {
    if (!pickStr(obj?.[k])) return { ok: false, error: `${k} is required` };
  }
  return { ok: true };
}

export function registerFoundationCapabilities() {
  registerCapability({
    name: "brain.search_entities",
    description: "Search accounts, quotes, or materials by natural query (read-only, org-scoped).",
    domain: "cross",
    mode: "read",
    requiredHead: null, // domain-specific heads enforced inside
    sensitivity: "medium",
    authoritativeSource: "eliteOS Brain AI-safe adapters",
    validateInput: (input) => {
      const entityType = pickStr(input?.entityType || "account");
      if (!["account", "quote", "material"].includes(entityType)) {
        return { ok: false, error: "entityType must be account|quote|material" };
      }
      return okInput({ query: input?.query }, ["query"]);
    },
    async execute(input, ctx) {
      const entityType = pickStr(input.entityType || "account");
      const query = pickStr(input.query).slice(0, 80);
      const limit = Math.min(10, Number(input.limit) || 8);

      if (entityType === "account") {
        const gate = await ctx.requireHead("account_directory");
        if (!gate.ok) return gate;
        const result = await searchAccountsForAi({
          db: ctx.db,
          getSupabase: ctx.getSupabase,
          user: ctx.user,
          organizationId: ctx.organizationId,
          query,
          limit,
        });
        if (!result.ok) return result;
        const evidence = (result.items || []).map((item) =>
          makeEvidence({
            sourceDomain: "account",
            sourceSystem: "account_directory",
            entityType: "account",
            entityId: item.accountId,
            sourceUpdatedAt: item.updatedAt || null,
            authoritative: true,
            data: item,
          })
        );
        return {
          ok: true,
          entityType,
          items: result.items,
          ambiguous: Boolean(result.ambiguous) || (result.items || []).length > 1,
          truncated: Boolean(result.truncated),
          retrievedAt: result.retrievedAt || new Date().toISOString(),
          evidence,
        };
      }

      if (entityType === "quote") {
        const result = await searchQuotesForAi({
          db: ctx.db,
          organizationId: ctx.organizationId,
          query,
          limit,
          accountId: input.accountId || null,
        });
        if (!result.ok) return result;
        const evidence = (result.items || []).map((item) =>
          makeEvidence({
            sourceDomain: "quote",
            sourceSystem: "quote_headers",
            entityType: "quote",
            entityId: item.quoteId,
            sourceUpdatedAt: item.updatedAt || null,
            authoritative: true,
            data: item,
          })
        );
        return {
          ok: true,
          entityType,
          items: result.items,
          ambiguous: !input.preferLatest && ((result.items || []).length > 1),
          preferLatest: Boolean(input.preferLatest),
          truncated: Boolean(result.truncated),
          retrievedAt: result.retrievedAt,
          evidence,
        };
      }

      // material
      {
        const gate = await ctx.requireHead("slab_inventory");
        if (!gate.ok) return gate;
        const result = await searchMaterialsForAi({
          db: ctx.db,
          user: ctx.user,
          organizationId: ctx.organizationId,
          query,
          limit,
        });
        if (!result.ok) return result;
        const evidence = (result.items || []).map((item) =>
          makeEvidence({
            sourceDomain: "inventory",
            sourceSystem: "slab_inventory",
            entityType: "material",
            entityId: item.materialId || item.id || null,
            sourceUpdatedAt: item.updatedAt || null,
            authoritative: true,
            freshnessNote: result.freshnessNote || "Brain inventory cache — not a live vendor call.",
            data: item,
          })
        );
        return {
          ok: true,
          entityType,
          items: result.items,
          truncated: Boolean(result.truncated),
          retrievedAt: result.retrievedAt || new Date().toISOString(),
          evidence,
        };
      }
    },
  });

  registerCapability({
    name: "brain.get_entity",
    description: "Retrieve one account or quote by authoritative ID.",
    domain: "cross",
    mode: "read",
    requiredHead: null,
    sensitivity: "medium",
    authoritativeSource: "eliteOS Brain AI-safe adapters",
    validateInput: (input) => {
      const t = pickStr(input?.entityType);
      if (!["account", "quote"].includes(t)) return { ok: false, error: "entityType must be account|quote" };
      return okInput({ entityId: input?.entityId }, ["entityId"]);
    },
    async execute(input, ctx) {
      const entityType = pickStr(input.entityType);
      if (entityType === "account") {
        const gate = await ctx.requireHead("account_directory");
        if (!gate.ok) return gate;
        const result = await retrieveAccountForAi({
          db: ctx.db,
          getSupabase: ctx.getSupabase,
          user: ctx.user,
          organizationId: ctx.organizationId,
          accountId: input.entityId,
        });
        if (!result.ok) return result;
        const account = result.account || result;
        const evidence = [
          makeEvidence({
            sourceDomain: "account",
            sourceSystem: "account_directory",
            entityType: "account",
            entityId: account.accountId || input.entityId,
            sourceUpdatedAt: account.updatedAt || null,
            authoritative: true,
            data: account,
          }),
        ];
        return { ok: true, entityType, entity: account, evidence };
      }
      const result = await retrieveQuoteForAi({
        db: ctx.db,
        organizationId: ctx.organizationId,
        quoteId: input.entityId,
      });
      if (!result.ok) return result;
      const quote = result.quote || result;
      const evidence = [
        makeEvidence({
          sourceDomain: "quote",
          sourceSystem: "quote_headers",
          entityType: "quote",
          entityId: quote.quoteId || input.entityId,
          sourceUpdatedAt: quote.updatedAt || null,
          authoritative: true,
          data: quote,
        }),
      ];
      return { ok: true, entityType, entity: quote, evidence };
    },
  });

  registerCapability({
    name: "brain.get_related_records",
    description: "List related records for an entity (currently: jobs for an account).",
    domain: "job",
    mode: "read",
    requiredHead: "account_directory",
    sensitivity: "medium",
    authoritativeSource: "Moraware prepared facts via Account 360",
    validateInput: (input) => {
      if (pickStr(input?.relation) !== "jobs") return { ok: false, error: "relation must be jobs in this foundation" };
      return okInput({ accountId: input?.accountId }, ["accountId"]);
    },
    async execute(input, ctx) {
      const gate = await ctx.requireHead("account_directory");
      if (!gate.ok) return gate;
      const result = await listAccountJobsForAi({
        db: ctx.db,
        getSupabase: ctx.getSupabase,
        user: ctx.user,
        organizationId: ctx.organizationId,
        accountId: input.accountId,
        limit: Math.min(20, Number(input.limit) || 10),
      });
      if (!result.ok) return result;
      const evidence = (result.items || []).map((job) =>
        makeEvidence({
          sourceDomain: "job",
          sourceSystem: "moraware_prepared_facts",
          entityType: "job",
          entityId: job.jobId,
          sourceUpdatedAt: job.sourceUpdatedAt || job.updatedAt || null,
          authoritative: true,
          freshnessNote: "Moraware prepared facts — not a live Moraware session.",
          data: job,
        })
      );
      return {
        ok: true,
        relation: "jobs",
        accountId: input.accountId,
        items: result.items,
        truncated: Boolean(result.truncated),
        evidence,
      };
    },
  });

  registerCapability({
    name: "brain.get_account_360",
    description: "Account Directory summary for a selected account ID (read-only).",
    domain: "account",
    mode: "read",
    requiredHead: "account_directory",
    sensitivity: "high",
    authoritativeSource: "account_directory",
    validateInput: (input) => okInput({ accountId: input?.accountId }, ["accountId"]),
    async execute(input, ctx) {
      const gate = await ctx.requireHead("account_directory");
      if (!gate.ok) return gate;
      const result = await retrieveAccountForAi({
        db: ctx.db,
        getSupabase: ctx.getSupabase,
        user: ctx.user,
        organizationId: ctx.organizationId,
        accountId: input.accountId,
      });
      if (!result.ok) return result;
      const account = result.account || result;
      let jobs = [];
      if (input.includeJobs !== false) {
        const jr = await listAccountJobsForAi({
          db: ctx.db,
          getSupabase: ctx.getSupabase,
          user: ctx.user,
          organizationId: ctx.organizationId,
          accountId: input.accountId,
          limit: 8,
        });
        if (jr.ok) jobs = jr.items || [];
      }
      const evidence = [
        makeEvidence({
          sourceDomain: "account",
          sourceSystem: "account_directory",
          entityType: "account",
          entityId: account.accountId || input.accountId,
          sourceUpdatedAt: account.updatedAt || null,
          authoritative: true,
          data: { account, recentJobs: jobs },
        }),
      ];
      return { ok: true, account, recentJobs: jobs, evidence };
    },
  });

  registerCapability({
    name: "brain.get_quote_360",
    description: "AI-safe quote detail (narrative fields + recorded totals; no calc dump).",
    domain: "quote",
    mode: "read",
    requiredHead: null,
    sensitivity: "medium",
    authoritativeSource: "quote_headers",
    validateInput: (input) => okInput({ quoteId: input?.quoteId }, ["quoteId"]),
    async execute(input, ctx) {
      const result = await retrieveQuoteForAi({
        db: ctx.db,
        organizationId: ctx.organizationId,
        quoteId: input.quoteId,
      });
      if (!result.ok) return result;
      const quote = result.quote || result;
      const evidence = [
        makeEvidence({
          sourceDomain: "quote",
          sourceSystem: "quote_headers",
          entityType: "quote",
          entityId: quote.quoteId || input.quoteId,
          sourceUpdatedAt: quote.updatedAt || null,
          authoritative: true,
          data: quote,
        }),
      ];
      return { ok: true, quote, evidence };
    },
  });

  registerCapability({
    name: "brain.search_inventory",
    description: "Search slab inventory Brain cache (not live vendor).",
    domain: "inventory",
    mode: "read",
    requiredHead: "slab_inventory",
    sensitivity: "low",
    authoritativeSource: "slab_inventory cache",
    validateInput: (input) => okInput({ query: input?.query }, ["query"]),
    async execute(input, ctx) {
      const gate = await ctx.requireHead("slab_inventory");
      if (!gate.ok) return gate;
      const result = await searchMaterialsForAi({
        db: ctx.db,
        user: ctx.user,
        organizationId: ctx.organizationId,
        query: pickStr(input.query).slice(0, 80),
        limit: Math.min(10, Number(input.limit) || 8),
      });
      if (!result.ok) return result;
      const evidence = (result.items || []).map((item) =>
        makeEvidence({
          sourceDomain: "inventory",
          sourceSystem: "slab_inventory",
          entityType: "material",
          entityId: item.materialId || null,
          sourceUpdatedAt: item.updatedAt || null,
          authoritative: true,
          freshnessNote: "Brain inventory cache — not a live vendor call.",
          data: item,
        })
      );
      return { ok: true, items: result.items, truncated: Boolean(result.truncated), evidence };
    },
  });

  registerCapability({
    name: "brain.search_company_knowledge",
    description: "Search approved Knowledge Hub passages.",
    domain: "knowledge",
    mode: "read",
    requiredHead: null,
    sensitivity: "medium",
    authoritativeSource: "slab_ai_knowledge (approved+current)",
    validateInput: (input) => okInput({ query: input?.query }, ["query"]),
    async execute(input, ctx) {
      const result = await searchApprovedKnowledge({
        db: ctx.db,
        organizationId: ctx.organizationId,
        query: pickStr(input.query).slice(0, 400),
        limit: Math.min(8, Number(input.limit) || 5),
      });
      if (!result.ok) return result;
      const evidence = (result.passages || []).map((p) =>
        makeEvidence({
          sourceDomain: "knowledge",
          sourceSystem: "slab_ai_knowledge",
          entityType: "passage",
          entityId: p.id,
          authoritative: true,
          data: {
            passageId: p.id,
            text: p.text,
            locator: p.locator,
            title: p.source?.title || null,
            sourceType: p.source?.sourceType || null,
          },
        })
      );
      return {
        ok: true,
        passages: result.passages || [],
        evidence,
        retrievedAt: new Date().toISOString(),
      };
    },
  });

  registerCapability({
    name: "brain.query_metric",
    description:
      "Server-computed metrics. Foundation supports metric=quote_count dimension=account (no LLM math).",
    domain: "quote",
    mode: "read",
    requiredHead: null,
    sensitivity: "medium",
    authoritativeSource: "quote_headers aggregation",
    validateInput: (input) => {
      if (pickStr(input?.metric) !== "quote_count") {
        return { ok: false, error: "Foundation metric must be quote_count", code: "CAPABILITY_UNAVAILABLE" };
      }
      if (pickStr(input?.dimension || "account") !== "account") {
        return { ok: false, error: "Foundation dimension must be account", code: "CAPABILITY_UNAVAILABLE" };
      }
      return { ok: true };
    },
    async execute(input, ctx) {
      return queryQuoteCountByAccount({
        db: ctx.db,
        organizationId: ctx.organizationId,
        period: input.period || "quarter",
        order: input.order === "asc" ? "asc" : "desc",
        limit: input.limit,
      });
    },
  });
}
