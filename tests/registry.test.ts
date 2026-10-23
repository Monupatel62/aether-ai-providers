import { describe, expect, it } from "vitest";
import { ProviderError, ProviderRegistry, validateProviderAdapter } from "../src/index.js";
import type { ProviderAdapter } from "../src/index.js";

const baseAdapter: ProviderAdapter = {
  providerId: "mock-provider",
  capabilities: new Set(["chat"]),
  supportedModels: ["mock-model-v1"],
  async complete(request) {
    return {
      requestId: request.requestId,
      providerId: "mock-provider",
      model: request.model,
      content: "synthetic response",
      finishReason: "stop"
    };
  }
};

describe("provider adapter contract", () => {
  it("accepts a minimal provider-neutral chat adapter", () => {
    expect(() => validateProviderAdapter(baseAdapter)).not.toThrow();
  });

  it("rejects capability declarations without their implementation", () => {
    const invalid = { ...baseAdapter, capabilities: new Set(["streaming" as const]) };
    expect(() => validateProviderAdapter(invalid)).toThrow(ProviderError);
  });

  it("rejects duplicate provider registration", () => {
    const registry = new ProviderRegistry();
    registry.register(baseAdapter);
    expect(() => registry.register(baseAdapter)).toThrow(ProviderError);
  });

  it("returns copied metadata rather than the internal model array", () => {
    const registry = new ProviderRegistry();
    registry.register(baseAdapter);
    const listed = registry.list();
    (listed[0]?.supportedModels as string[]).push("injected-model");
    expect(registry.get("mock-provider")?.supportedModels).toEqual(["mock-model-v1"]);
  });

  it("normalizes errors without exposing upstream response text", () => {
    const error = new ProviderError("UPSTREAM_FAILURE", { cause: new Error("provider body contains secret") });
    expect(error.message).toBe("The provider request failed.");
    expect(error.message).not.toContain("secret");
    expect(error.retryable).toBe(false);
  });
});
