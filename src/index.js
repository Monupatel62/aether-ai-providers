import { isIP } from "node:net";
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


/**
 * Generic OpenAI-compatible text adapter. Credentials are resolved per request,
 * hostnames must be explicitly allowlisted, redirects are rejected, and vendor
 * response/error bodies are never returned verbatim.
 */
export function createOpenAICompatibleAdapter({
  id,
  baseUrl,
  allowedHosts,
  getApiKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = 30_000,
  maxResponseBytes = 4_194_304,
} = {}) {
  const adapterId = identifier(id, "adapter.id");
  if (typeof baseUrl !== "string" || !validProviderBaseUrl(baseUrl, allowedHosts)) throw new TypeError("An HTTPS base URL on the explicit host allowlist is required");
  if (!(allowedHosts instanceof Set) || [...allowedHosts].some((host) => typeof host !== "string" || !host.trim())) throw new TypeError("allowedHosts must be a Set of hostnames");
  if (typeof getApiKey !== "function" || typeof fetchImpl !== "function") throw new TypeError("Credential resolver and fetch adapter are required");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new TypeError("timeoutMs must be between 1 and 120000");
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > 16_777_216) throw new TypeError("maxResponseBytes is invalid");
  const endpoint = baseUrl.replace(/\/+$/, "") + "/chat/completions";

  return Object.freeze({
    id: adapterId,
    capabilities: validateCapabilities({ modalities: ["text"], streaming: false, toolCalls: false }),
    async complete(requestInput, { signal } = {}) {
      const request = validateCompletionRequest(requestInput);
      if (request.stream) throw new ProviderContractError("unsupported", "Streaming is not supported by this adapter");
      if (signal?.aborted) throw new ProviderContractError("timeout", "Provider request was cancelled");
      const body = { model: request.model, messages: request.messages };
      if (request.maxOutputTokens !== undefined) body.max_tokens = request.maxOutputTokens;
      if (request.temperature !== undefined) body.temperature = request.temperature;
      let serialized;
      try { serialized = JSON.stringify(body); } catch { throw new ProviderContractError("invalid_request"); }
      if (Buffer.byteLength(serialized) > 2_097_152) throw new ProviderContractError("invalid_request", "Provider request exceeds the configured limit");

      const controller = new AbortController();
      const onAbort = () => controller.abort(signal?.reason);
      signal?.addEventListener("abort", onAbort, { once: true });
      let timedOut = false;
      let timeout;
      const aborted = new Promise((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(new ProviderContractError("timeout", timedOut ? "Provider request timed out" : "Provider request was cancelled")), { once: true });
      });
      timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      try {
        let key;
        try { key = await Promise.race([Promise.resolve().then(() => getApiKey({ providerId: adapterId, signal: controller.signal })), aborted]); }
        catch (error) { if (error instanceof ProviderContractError && error.code === "timeout") throw error; throw new ProviderContractError("authentication", "Provider credentials are unavailable"); }
        if (typeof key !== "string" || !key.trim() || /[\r\n]/.test(key)) throw new ProviderContractError("authentication", "Provider credentials are unavailable");
        const response = await Promise.race([
          Promise.resolve().then(() => fetchImpl(endpoint, {
            method: "POST",
            redirect: "error",
            headers: { authorization: "Bearer " + key, "content-type": "application/json", accept: "application/json" },
            body: serialized,
            signal: controller.signal,
          })),
          aborted,
        ]);
        const raw = await Promise.race([readProviderResponse(response, maxResponseBytes), aborted]);
        if (!response.ok) throw normalizeProviderError({ status: response.status });
        let data;
        try { data = JSON.parse(raw); } catch { throw new ProviderContractError("provider_error", "Provider returned invalid JSON"); }
        const choice = data?.choices?.[0];
        const text = choice?.message?.content;
        if (!record(data) || !record(choice) || !record(choice.message) || typeof text !== "string") throw new ProviderContractError("provider_error", "Provider returned an invalid completion");
        return Object.freeze({
          text,
          model: typeof data.model === "string" ? data.model : request.model,
          finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : "unknown",
          usage: Object.freeze({
            inputTokens: Number.isSafeInteger(data.usage?.prompt_tokens) && data.usage.prompt_tokens >= 0 ? data.usage.prompt_tokens : null,
            outputTokens: Number.isSafeInteger(data.usage?.completion_tokens) && data.usage.completion_tokens >= 0 ? data.usage.completion_tokens : null,
          }),
        });
      } catch (error) {
        if (error instanceof ProviderContractError) throw error;
        if (controller.signal.aborted) throw new ProviderContractError("timeout", timedOut ? "Provider request timed out" : "Provider request was cancelled");
        throw normalizeProviderError(error);
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  });
}

function validProviderBaseUrl(value, allowedHosts) {
  if (!(allowedHosts instanceof Set) || typeof value !== "string") return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace("[", "").replace("]", "");
    const hosts = new Set([...allowedHosts].map((host) => host.toLowerCase()));
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
      && hosts.has(url.hostname.toLowerCase()) && !isIP(hostname)
      && hostname !== "localhost" && !hostname.endsWith(".localhost")
      && !hostname.endsWith(".local") && !hostname.endsWith(".internal");
  } catch { return false; }
}

async function readProviderResponse(response, maxBytes) {
  if (!response || typeof response.text !== "function") throw new ProviderContractError("provider_error", "Provider returned an invalid response");
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new ProviderContractError("provider_error", "Provider response exceeds the configured limit");
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new ProviderContractError("provider_error", "Provider response exceeds the configured limit");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
