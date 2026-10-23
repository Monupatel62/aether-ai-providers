/**
 * Provider-neutral contract primitives. No vendor SDK is selected here.
 * The gateway owns routing and policy; adapters own vendor wire formats.
 */
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MODALITIES = new Set(["text", "image", "audio", "video", "embedding"]);
const ERROR_CODES = new Set(["authentication", "rate_limit", "timeout", "unavailable", "invalid_request", "context_length", "unsupported", "provider_error"]);

function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function identifier(value, field) {
  if (typeof value !== "string" || !IDENTIFIER.test(value) || value.trim() !== value) throw new TypeError(`Invalid ${field}`);
  return value;
}
function positiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`Invalid ${field}`);
  return value;
}

export class ProviderContractError extends Error {
  constructor(code, message = "Provider request failed", options = {}) {
    if (!ERROR_CODES.has(code)) code = "provider_error";
    super(message, options);
    this.name = "ProviderContractError";
    this.code = code;
    this.retryable = ["rate_limit", "timeout", "unavailable"].includes(code);
  }
}

export function validateCapabilities(input) {
  if (!record(input)) throw new TypeError("Capabilities must be an object");
  if (!Array.isArray(input.modalities) || input.modalities.length === 0) throw new TypeError("At least one modality is required");
  const modalities = [...new Set(input.modalities.map((item) => {
    if (!MODALITIES.has(item)) throw new TypeError("Unsupported modality");
    return item;
  }))];
  return Object.freeze({
    modalities: Object.freeze(modalities),
    streaming: input.streaming === true,
    toolCalls: input.toolCalls === true,
    maxInputTokens: input.maxInputTokens === undefined ? null : positiveInteger(input.maxInputTokens, "maxInputTokens"),
    maxOutputTokens: input.maxOutputTokens === undefined ? null : positiveInteger(input.maxOutputTokens, "maxOutputTokens"),
  });
}

export function validateCompletionRequest(input) {
  if (!record(input)) throw new TypeError("Request must be an object");
  const model = identifier(input.model, "model");
  if (!Array.isArray(input.messages) || input.messages.length === 0) throw new TypeError("messages must be a non-empty array");
  const messages = input.messages.map((message, index) => {
    if (!record(message) || !["system", "user", "assistant", "tool"].includes(message.role) || typeof message.content !== "string") {
      throw new TypeError(`Invalid messages[${index}]`);
    }
    if (message.content.length > 1_000_000) throw new TypeError("Message content exceeds 1 MB");
    return Object.freeze({ role: message.role, content: message.content });
  });
  const request = { model, messages: Object.freeze(messages), stream: input.stream === true };
  if (input.maxOutputTokens !== undefined) request.maxOutputTokens = positiveInteger(input.maxOutputTokens, "maxOutputTokens");
  if (input.temperature !== undefined) {
    if (typeof input.temperature !== "number" || !Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2) throw new TypeError("temperature must be between 0 and 2");
    request.temperature = input.temperature;
  }
  return Object.freeze(request);
}

/** Convert an arbitrary vendor error to a safe, stable public category. */
export function normalizeProviderError(error) {
  const status = record(error) ? error.status ?? error.statusCode : undefined;
  const code = record(error) ? String(error.code ?? "").toLowerCase() : "";
  let normalized = "provider_error";
  if (status === 401 || status === 403 || /auth|credential|api.?key/.test(code)) normalized = "authentication";
  else if (status === 429 || /rate.?limit|quota/.test(code)) normalized = "rate_limit";
  else if (status === 408 || status === 504 || /timeout|deadline/.test(code)) normalized = "timeout";
  else if (status === 502 || status === 503 || /unavailable|overloaded/.test(code)) normalized = "unavailable";
  else if (status === 400 || status === 422) normalized = "invalid_request";
  else if (/context.?length|token.?limit/.test(code)) normalized = "context_length";
  else if (/unsupported|not.?implemented/.test(code)) normalized = "unsupported";
  // Do not propagate raw provider messages; they may contain prompts or secrets.
  return new ProviderContractError(normalized, "Provider request failed");
}

export class ProviderRegistry {
  #adapters = new Map();

  register(adapter) {
    if (!record(adapter)) throw new TypeError("Adapter must be an object");
    const id = identifier(adapter.id, "adapter.id");
    if (this.#adapters.has(id)) throw new Error(`Provider adapter already registered: ${id}`);
    const capabilities = validateCapabilities(adapter.capabilities);
    if (typeof adapter.complete !== "function") throw new TypeError("Adapter must implement complete(request, options)");
    this.#adapters.set(id, Object.freeze({ id, capabilities, complete: adapter.complete }));
    return this;
  }

  get(id) { return this.#adapters.get(identifier(id, "provider id")) ?? null; }

  list() {
    return Object.freeze([...this.#adapters.values()].map(({ id, capabilities }) => Object.freeze({ id, capabilities })));
  }

  async complete(providerId, requestInput, options = {}) {
    const adapter = this.get(providerId);
    if (!adapter) throw new ProviderContractError("unsupported", "Provider adapter is not registered");
    const request = validateCompletionRequest(requestInput);
    if (!adapter.capabilities.modalities.includes("text")) throw new ProviderContractError("unsupported", "Provider does not support text requests");
    if (request.stream && !adapter.capabilities.streaming) throw new ProviderContractError("unsupported", "Provider does not support streaming");
    try {
      const response = await adapter.complete(request, options);
      if (!record(response)) throw new ProviderContractError("provider_error", "Provider returned an invalid response");
      if (typeof response.text !== "string") throw new ProviderContractError("provider_error", "Provider response is missing text");
      return Object.freeze({
        text: response.text,
        model: typeof response.model === "string" ? response.model : request.model,
        finishReason: typeof response.finishReason === "string" ? response.finishReason : "unknown",
        usage: record(response.usage) ? Object.freeze({
          inputTokens: Number.isSafeInteger(response.usage.inputTokens) && response.usage.inputTokens >= 0 ? response.usage.inputTokens : null,
          outputTokens: Number.isSafeInteger(response.usage.outputTokens) && response.usage.outputTokens >= 0 ? response.usage.outputTokens : null,
        }) : Object.freeze({ inputTokens: null, outputTokens: null }),
      });
    } catch (error) {
      if (error instanceof ProviderContractError) throw error;
      throw normalizeProviderError(error);
    }
  }
}
