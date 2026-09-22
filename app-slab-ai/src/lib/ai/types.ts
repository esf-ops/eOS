export type ModelClass = "fast" | "reasoning";

export type AIProviderName = "openai" | "mock";

export type AIProviderConfig = {
  provider: AIProviderName;
  mockMode: boolean;
  defaultModel: string;
  fastModel: string;
  reasoningModel: string;
  hasApiKey: boolean;
  /** True when production would silence mock masquerading. */
  allowMockInProduction: boolean;
};

export type GenerationRequest = {
  toolId: string;
  formData: Record<string, unknown>;
  generationId?: string;
  organizationId?: string | null;
  userId?: string | null;
};

export type TelemetryEvent = {
  type: "generation_started" | "generation_completed" | "generation_failed" | "feedback";
  generationId: string;
  organizationId?: string | null;
  userId?: string | null;
  toolId: string;
  promptVersion?: string;
  model?: string;
  provider?: string;
  latencyMs?: number;
  success?: boolean;
  errorCode?: string;
  tokenUsage?: { promptTokens?: number; completionTokens?: number };
  feedback?: "up" | "down";
  feedbackNote?: string;
  timestamp: string;
};
