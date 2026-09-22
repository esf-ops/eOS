/**
 * SlabAI execution context — authorization, persistence, retrieval scoping.
 * Not for dumping personal profile data into prompts.
 */

export type SlabAIExecutionContext = {
  generationId: string;
  user: {
    id: string;
    displayName?: string;
    role?: string;
  };
  organization: {
    id: string | null;
  };
  tool: {
    id: string;
    promptVersion: string;
    modelClass: string;
  };
  authMode: "brain" | "dev_bypass";
  accessToken?: string | null;
};

export type SlabAIAuthContext = {
  userId: string;
  organizationId: string | null;
  role: string;
  displayName?: string | null;
  head: "slab_ai";
  accessToken: string | null;
  authMode: "brain" | "dev_bypass";
};

export type SlabAIResult = {
  content: string;
  sources: Array<{
    id: string;
    title: string;
    locator?: string | null;
    sourceType: string;
    manufacturer?: string | null;
    version?: number | null;
    authority?: string | null;
    passageId?: string | null;
  }>;
  operationalSources?: Array<{
    type: string;
    entityId: string;
    label: string;
    fieldsUsed?: string[];
    retrievedAt: string;
    sourceSystem?: string | null;
  }>;
  warnings: string[];
  assumptions: string[];
  confidence?: "low" | "medium" | "high";
  evidenceMode?: "verified" | "general" | "mixed" | "none";
  contextInspector?: {
    knowledgeCount: number;
    operationalCount: number;
    actionsCalled: string[];
    truncated?: boolean;
  };
};
