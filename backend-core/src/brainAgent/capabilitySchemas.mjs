/**
 * Machine-readable input contracts for Brain Agent capabilities (JSON Schema draft-07 style).
 * Authoritative shapes the model must use — keep in sync with validateInput in registerFoundation.
 */

/** @type {Record<string, object>} */
export const CAPABILITY_INPUT_SCHEMAS = Object.freeze({
  "brain.search_entities": {
    $id: "brain.search_entities",
    type: "object",
    additionalProperties: false,
    required: ["entityType", "query"],
    properties: {
      entityType: {
        type: "string",
        enum: ["account", "quote", "material"],
        description: "Which entity collection to search",
      },
      query: {
        type: "string",
        minLength: 1,
        maxLength: 80,
        description: "Natural-language search text",
      },
      accountId: {
        type: "string",
        description: "Optional Account Directory UUID to scope quote search",
      },
      preferLatest: {
        type: "boolean",
        description: "When searching quotes, prefer the most recently updated match",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        description: "Max results (default 8)",
      },
    },
  },

  "brain.get_entity": {
    $id: "brain.get_entity",
    type: "object",
    additionalProperties: false,
    required: ["entityType", "entityId"],
    properties: {
      entityType: {
        type: "string",
        enum: ["account", "quote"],
        description: "Entity kind to retrieve",
      },
      entityId: {
        type: "string",
        minLength: 1,
        description: "Authoritative entity UUID from prior evidence",
      },
    },
  },

  "brain.get_related_records": {
    $id: "brain.get_related_records",
    type: "object",
    additionalProperties: false,
    required: ["relation", "accountId"],
    properties: {
      relation: {
        type: "string",
        enum: ["jobs"],
        description: "Related record type. Foundation supports jobs only.",
      },
      accountId: {
        type: "string",
        minLength: 1,
        description: "Authoritative Account Directory ID from evidence (e.g. query_metric rows[].accountId)",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 20,
        description: "Max related rows (default 10)",
      },
    },
  },

  "brain.get_account_360": {
    $id: "brain.get_account_360",
    type: "object",
    additionalProperties: false,
    required: ["accountId"],
    properties: {
      accountId: {
        type: "string",
        minLength: 1,
        description: "Authoritative Account Directory UUID",
      },
      includeJobs: {
        type: "boolean",
        description: "Include recent jobs (default true)",
      },
    },
  },

  "brain.get_quote_360": {
    $id: "brain.get_quote_360",
    type: "object",
    additionalProperties: false,
    required: ["quoteId"],
    properties: {
      quoteId: {
        type: "string",
        minLength: 1,
        description: "Authoritative quote UUID",
      },
    },
  },

  "brain.search_inventory": {
    $id: "brain.search_inventory",
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
      query: {
        type: "string",
        minLength: 1,
        maxLength: 80,
        description: "Material / color search text",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        description: "Max results (default 8)",
      },
    },
  },

  "brain.search_company_knowledge": {
    $id: "brain.search_company_knowledge",
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
      query: {
        type: "string",
        minLength: 1,
        maxLength: 400,
        description: "Knowledge Hub search query",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 8,
        description: "Max passages (default 5)",
      },
    },
  },

  "brain.query_metric": {
    $id: "brain.query_metric",
    type: "object",
    additionalProperties: false,
    required: ["metric", "dimension"],
    properties: {
      metric: {
        type: "string",
        enum: ["quote_count"],
        description: "Server-computed metric. Foundation supports quote_count only.",
      },
      dimension: {
        type: "string",
        enum: ["account"],
        description: "Group-by dimension. Foundation supports account only.",
      },
      period: {
        type: "string",
        enum: ["today", "week", "month", "quarter", "all"],
        description: "Time window for quote created_at (default quarter)",
      },
      order: {
        type: "string",
        enum: ["desc", "asc"],
        description: "Sort by metric value (default desc)",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 25,
        description: "Max ranked rows (default 10)",
      },
    },
  },
});

export function getCapabilityInputSchema(name) {
  return CAPABILITY_INPUT_SCHEMAS[String(name || "")] || null;
}

/**
 * Convert a capability JSON Schema into an OpenAI-compatible function tool definition.
 * Function names cannot contain '.' — map dots to underscores.
 */
export function capabilityToOpenAiTool(cap) {
  const schema = cap.inputSchema || getCapabilityInputSchema(cap.name) || {
    type: "object",
    properties: {},
    additionalProperties: false,
  };
  return {
    type: "function",
    function: {
      name: openAiToolName(cap.name),
      description: String(cap.description || cap.name),
      parameters: schema,
    },
  };
}

export function openAiToolName(capabilityName) {
  return String(capabilityName || "").replace(/\./g, "_");
}

export function capabilityNameFromOpenAiTool(toolName) {
  const raw = String(toolName || "");
  // brain_search_entities → brain.search_entities (only the brain. prefix uses '.')
  if (raw.startsWith("brain_")) return `brain.${raw.slice("brain_".length)}`;
  return raw;
}

/** Control tools for final_answer / clarify / abstain when using native function calling. */
export const AGENT_CONTROL_OPENAI_TOOLS = Object.freeze([
  {
    type: "function",
    function: {
      name: "agent_final_answer",
      description:
        "Return an evidence-grounded final answer. Cite evidence IDs like [ev_…] for every company fact.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["answer", "citedEvidenceIds"],
        properties: {
          answer: { type: "string" },
          citedEvidenceIds: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_clarify",
      description: "Ask the user to choose among ambiguous entities.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["message"],
        properties: {
          message: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                label: { type: "string" },
              },
              required: ["id", "label"],
            },
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agent_abstain",
      description: "Abstain when evidence is insufficient or the question cannot be answered safely.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          message: { type: "string" },
          state: {
            type: "string",
            enum: [
              "INSUFFICIENT_EVIDENCE",
              "CAPABILITY_UNAVAILABLE",
              "PERMISSION_DENIED",
              "AMBIGUOUS_ENTITY",
            ],
          },
        },
      },
    },
  },
]);

/**
 * Safe schema copy for observations / model prompts (no secrets; schemas are public contracts).
 */
export function schemaForObservation(name) {
  const schema = getCapabilityInputSchema(name);
  if (!schema) return null;
  return JSON.parse(JSON.stringify(schema));
}
