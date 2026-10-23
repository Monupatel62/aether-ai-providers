export type ProviderErrorCode =
  | "INVALID_REQUEST"
  | "UNSUPPORTED_CAPABILITY"
  | "AUTHENTICATION"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "UNAVAILABLE"
  | "UPSTREAM_FAILURE";

export interface ProviderErrorOptions {
  readonly statusCode?: number;
  readonly retryable?: boolean;
  readonly retryAfterMs?: number;
  readonly cause?: unknown;
}

const SAFE_MESSAGES: Record<ProviderErrorCode, string> = {
  INVALID_REQUEST: "The provider request was invalid.",
  UNSUPPORTED_CAPABILITY: "The provider does not support this capability.",
  AUTHENTICATION: "The provider rejected server-side credentials.",
  RATE_LIMIT: "The provider rate limit was reached.",
  TIMEOUT: "The provider request timed out.",
  UNAVAILABLE: "The provider is temporarily unavailable.",
  UPSTREAM_FAILURE: "The provider request failed."
};

/** Normalized safe error; raw provider bodies must not be copied into its message. */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  readonly statusCode?: number;
  readonly retryAfterMs?: number;

  constructor(code: ProviderErrorCode, options: ProviderErrorOptions = {}) {
    super(SAFE_MESSAGES[code], options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ProviderError";
    this.code = code;
    this.retryable = options.retryable ?? (code === "RATE_LIMIT" || code === "TIMEOUT" || code === "UNAVAILABLE");
    if (options.statusCode !== undefined) this.statusCode = options.statusCode;
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
  }
}
