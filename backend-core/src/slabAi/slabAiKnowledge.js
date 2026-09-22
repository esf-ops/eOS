/**
 * Compatibility shim — Phase 2 imports continue to work.
 * Retrieval now prefers approved+current documents (Knowledge Hub).
 */
export { searchApprovedKnowledge as searchKnowledgePassages } from "./knowledge/knowledgeRetrieval.mjs";
export { ensureSentinelKnowledge } from "./knowledge/knowledgeSentinel.mjs";
