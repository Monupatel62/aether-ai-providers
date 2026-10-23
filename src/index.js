export const PROVIDER_CONTRACT_VERSION = "1.0";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const CAPABILITIES = new Set(["chat", "embeddings", "tool-calls", "streaming", "model-metadata"]);

export function createProviderDescriptor(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("provider descriptor must be an object");
  if (typeof input.providerId !== "string" || !ID_RE.test(input.providerId)) throw new TypeError("providerId is invalid");
  if (typeof input.adapterVersion !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(input.adapterVersion)) throw new TypeError("adapterVersion must be semantic-version shaped");
  if (!Array.isArray(input.models) || input.models.length > 500) throw new TypeError("models must be an array of at most 500 entries");
  const models = [...new Set(input.models.map((model) => {
    if (typeof model !== "string" || !MODEL_RE.test(model)) throw new TypeError("model identifier is invalid");
    return model;
  }))];
  if (!Array.isArray(input.capabilities)) throw new TypeError("capabilities must be an array");
  const capabilities = [...new Set(input.capabilities.map((capability) => {
    if (typeof capability !== "string" || !CAPABILITIES.has(capability)) throw new TypeError("unsupported provider capability");
    return capability;
  }))];
  if (capabilities.includes("streaming") && !capabilities.includes("chat")) throw new TypeError("streaming capability requires chat capability");
  if (capabilities.includes("tool-calls") && !capabilities.includes("chat")) throw new TypeError("tool-calls capability requires chat capability");
  const maxInputBytes = input.limits?.maxInputBytes ?? 1_000_000;
  const maxOutputTokens = input.limits?.maxOutputTokens ?? 8192;
  const timeoutMs = input.limits?.timeoutMs ?? 30_000;
  if (!Number.isInteger(maxInputBytes) || maxInputBytes < 1 || maxInputBytes > 10_000_000) throw new RangeError("maxInputBytes is outside allowed bounds");
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 32_768) throw new RangeError("maxOutputTokens is outside allowed bounds");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 600_000) throw new RangeError("timeoutMs is outside allowed bounds");
  return Object.freeze({
    contractVersion: PROVIDER_CONTRACT_VERSION,
    providerId: input.providerId,
    adapterVersion: input.adapterVersion,
    enabled: input.enabled === true,
    models: Object.freeze(models),
    capabilities: Object.freeze(capabilities),
    limits: Object.freeze({ maxInputBytes, maxOutputTokens, timeoutMs }),
  });
}

export function validateProviderRequest(input = {}, descriptor) {
  if (!descriptor || descriptor.contractVersion !== PROVIDER_CONTRACT_VERSION) throw new TypeError("compatible provider descriptor is required");
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("provider request must be an object");
  for (const field of ["requestId", "correlationId"]) if (typeof input[field] !== "string" || !ID_RE.test(input[field])) throw new TypeError(`${field} is invalid`);
  if (typeof input.model !== "string" || !descriptor.models.includes(input.model)) throw new TypeError("requested model is not supported by this provider");
  if (!descriptor.enabled) throw new Error("provider is disabled");
  if (typeof input.input !== "string" || !input.input.trim()) throw new TypeError("input must be non-empty text");
  if (Buffer.byteLength(input.input, "utf8") > descriptor.limits.maxInputBytes) throw new RangeError("input exceeds provider limit");
  const outputTokens = input.maxOutputTokens ?? 1024;
  if (!Number.isInteger(outputTokens) || outputTokens < 1 || outputTokens > descriptor.limits.maxOutputTokens) throw new RangeError("maxOutputTokens exceeds provider limit");
  if (input.stream === true && !descriptor.capabilities.includes("streaming")) throw new Error("provider does not support streaming");
  if (input.toolCalls === true && !descriptor.capabilities.includes("tool-calls")) throw new Error("provider does not support tool calls");
  if (input.tenantId !== undefined && (typeof input.tenantId !== "string" || !ID_RE.test(input.tenantId))) throw new TypeError("tenantId is invalid");
  return Object.freeze({
    contractVersion: PROVIDER_CONTRACT_VERSION,
    requestId: input.requestId,
    correlationId: input.correlationId,
    model: input.model,
    input: input.input,
    maxOutputTokens: outputTokens,
    stream: input.stream === true,
    toolCalls: input.toolCalls === true,
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  });
}

/** Normalize known provider failures; never return raw messages or provider payloads. */
export function normalizeProviderError(input = {}) {
  const mapping = {
    timeout: ["PROVIDER_TIMEOUT", true],
    rate_limit: ["PROVIDER_RATE_LIMITED", true],
    unavailable: ["PROVIDER_UNAVAILABLE", true],
    invalid_request: ["PROVIDER_INVALID_REQUEST", false],
    authentication: ["PROVIDER_AUTH_FAILURE", false],
    content_filter: ["PROVIDER_CONTENT_FILTERED", false],
    cancelled: ["REQUEST_CANCELLED", false],
  };
  const [code, retryable] = mapping[input.kind] ?? ["PROVIDER_FAILURE", false];
  const retryAfterMs = retryable && Number.isInteger(input.retryAfterMs) && input.retryAfterMs >= 0 && input.retryAfterMs <= 300_000
    ? input.retryAfterMs : undefined;
  return Object.freeze({ contractVersion: PROVIDER_CONTRACT_VERSION, code, retryable, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) });
}

export function getProviderSecurityRequirements() {
  return Object.freeze({
    credentialsMustBeServerSide: true,
    neverExposeCredentialsInDescriptor: true,
    rawProviderErrorsMustBeRedacted: true,
    providerOutputIsUntrusted: true,
    cancellationAndTimeoutsMustBeEnforcedByAdapter: true,
  });
}
