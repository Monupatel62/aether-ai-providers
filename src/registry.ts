import { ProviderError } from "./errors.js";
import type { ProviderAdapter, ProviderCapability } from "./contracts.js";

const CAPABILITIES: readonly ProviderCapability[] = ["chat", "streaming", "tools", "embeddings"];

/**
 * Validate adapter declarations before registration. This is a consistency check,
 * not a substitute for authorization, credential validation, or provider conformance tests.
 */
export function validateProviderAdapter(adapter: ProviderAdapter): void {
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(adapter.providerId)) {
    throw new ProviderError("INVALID_REQUEST");
  }
  if (!Array.isArray(adapter.supportedModels) || adapter.supportedModels.length === 0) {
    throw new ProviderError("INVALID_REQUEST");
  }
  if (adapter.supportedModels.some(model => typeof model !== "string" || model.trim().length === 0)) {
    throw new ProviderError("INVALID_REQUEST");
  }
  if (new Set(adapter.supportedModels).size !== adapter.supportedModels.length) {
    throw new ProviderError("INVALID_REQUEST");
  }
  for (const capability of adapter.capabilities) {
    if (!CAPABILITIES.includes(capability)) throw new ProviderError("INVALID_REQUEST");
  }
  if (adapter.capabilities.has("streaming") && typeof adapter.stream !== "function") {
    throw new ProviderError("INVALID_REQUEST");
  }
  if (!adapter.capabilities.has("streaming") && typeof adapter.stream === "function") {
    throw new ProviderError("INVALID_REQUEST");
  }
  if (adapter.capabilities.has("embeddings") && typeof adapter.embed !== "function") {
    throw new ProviderError("INVALID_REQUEST");
  }
  if (!adapter.capabilities.has("embeddings") && typeof adapter.embed === "function") {
    throw new ProviderError("INVALID_REQUEST");
  }
}

export class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    validateProviderAdapter(adapter);
    if (this.adapters.has(adapter.providerId)) throw new ProviderError("INVALID_REQUEST");
    this.adapters.set(adapter.providerId, adapter);
  }

  get(providerId: string): ProviderAdapter | undefined {
    return this.adapters.get(providerId);
  }

  list(): readonly Pick<ProviderAdapter, "providerId" | "capabilities" | "supportedModels">[] {
    return [...this.adapters.values()].map(({ providerId, capabilities, supportedModels }) => ({
      providerId,
      capabilities: new Set(capabilities),
      supportedModels: [...supportedModels]
    }));
  }
}
