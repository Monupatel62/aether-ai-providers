export type ProviderCapability = "chat" | "streaming" | "tools" | "embeddings";
export type ProviderMessageRole = "system" | "user" | "assistant" | "tool";

export interface ProviderMessage {
  readonly role: ProviderMessageRole;
  readonly content: string;
  readonly toolCallId?: string;
}

export interface ProviderChatRequest {
  readonly schemaVersion: "1";
  readonly requestId: string;
  readonly model: string;
  readonly messages: readonly ProviderMessage[];
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
}

export interface ProviderUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface ProviderChatResponse {
  readonly requestId: string;
  readonly providerId: string;
  readonly model: string;
  readonly content: string;
  readonly finishReason: "stop" | "length" | "tool_call" | "other";
  readonly usage?: ProviderUsage;
}

export interface ProviderStreamEvent {
  readonly type: "text_delta" | "completed";
  readonly requestId: string;
  readonly text?: string;
  readonly finishReason?: ProviderChatResponse["finishReason"];
  readonly usage?: ProviderUsage;
}

export interface ProviderEmbeddingRequest {
  readonly schemaVersion: "1";
  readonly requestId: string;
  readonly model: string;
  readonly inputs: readonly string[];
}

export interface ProviderEmbeddingResponse {
  readonly requestId: string;
  readonly providerId: string;
  readonly model: string;
  readonly vectors: readonly (readonly number[])[];
}

export interface ProviderExecutionContext {
  readonly signal?: AbortSignal;
  readonly deadlineEpochMs?: number;
}

export interface ProviderAdapter {
  readonly providerId: string;
  readonly capabilities: ReadonlySet<ProviderCapability>;
  readonly supportedModels: readonly string[];
  complete(request: ProviderChatRequest, context: ProviderExecutionContext): Promise<ProviderChatResponse>;
  stream?(request: ProviderChatRequest, context: ProviderExecutionContext): AsyncIterable<ProviderStreamEvent>;
  embed?(request: ProviderEmbeddingRequest, context: ProviderExecutionContext): Promise<ProviderEmbeddingResponse>;
}
