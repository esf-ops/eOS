export type KnowledgeSource = {
  id: string;
  title: string;
  sourceType: string;
  sourceUri?: string;
  organizationId?: string | null;
  manufacturer?: string | null;
  material?: string | null;
  machineModel?: string | null;
  authority?: string | null;
  version?: number;
  metadata?: Record<string, unknown>;
};

export type KnowledgePassage = {
  id: string;
  source: KnowledgeSource;
  text: string;
  relevance?: number;
  locator?: string | null;
  pageNumber?: number | null;
  sectionTitle?: string | null;
};

export type KnowledgeSearchInput = {
  query: string;
  sourceTypes?: string[];
  limit?: number;
  seedSentinel?: boolean;
  manufacturer?: string;
  machineModel?: string;
  material?: string;
  /** lexical | semantic | hybrid — default hybrid */
  mode?: "lexical" | "semantic" | "hybrid";
};
