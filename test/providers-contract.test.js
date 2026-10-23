import test from "node:test";
import assert from "node:assert/strict";
import { createProviderDescriptor, validateProviderRequest, normalizeProviderError, getProviderSecurityRequirements } from "../src/index.js";

const descriptor = createProviderDescriptor({
  providerId: "provider-demo",
  adapterVersion: "0.1.0",
  enabled: true,
  models: ["vendor/model-v1"],
  capabilities: ["chat", "streaming", "tool-calls"],
  limits: { maxInputBytes: 100, maxOutputTokens: 2000, timeoutMs: 5000 },
});
const request = { requestId: "req-123", correlationId: "corr-123", model: "vendor/model-v1", input: "Hello", stream: true };

test("validates versioned provider descriptor and capability dependencies", () => {
  assert.equal(descriptor.contractVersion, "1.0");
  assert.throws(() => createProviderDescriptor({ providerId: "p", adapterVersion: "0.1.0", models: [], capabilities: ["streaming"] }), /requires chat/);
  assert.throws(() => createProviderDescriptor({ providerId: "p", adapterVersion: "latest", models: [], capabilities: [] }), /semantic-version/);
});

test("validates model requests against provider capabilities and limits", () => {
  assert.equal(validateProviderRequest(request, descriptor).stream, true);
  assert.throws(() => validateProviderRequest({ ...request, model: "other/model" }, descriptor), /not supported/);
  assert.throws(() => validateProviderRequest({ ...request, input: "x".repeat(101) }, descriptor), /input exceeds/);
  const noStream = createProviderDescriptor({ providerId: "p", adapterVersion: "1.0.0", enabled: true, models: ["m"], capabilities: ["chat"] });
  assert.throws(() => validateProviderRequest({ ...request, model: "m" }, noStream), /does not support streaming/);
  const disabled = createProviderDescriptor({ providerId: "p", adapterVersion: "1.0.0", enabled: false, models: ["m"], capabilities: ["chat"] });
  assert.throws(() => validateProviderRequest({ ...request, model: "m", stream: false }, disabled), /disabled/);
});

test("normalizes provider errors without retaining raw messages", () => {
  const error = normalizeProviderError({ kind: "timeout", message: "raw secret", retryAfterMs: 250 });
  assert.deepEqual(error, { contractVersion: "1.0", code: "PROVIDER_TIMEOUT", retryable: true, retryAfterMs: 250 });
  assert.equal(normalizeProviderError({ kind: "authentication", message: "secret" }).retryable, false);
});

test("declares server-side credential and untrusted-output requirements", () => {
  const policy = getProviderSecurityRequirements();
  assert.equal(policy.credentialsMustBeServerSide, true);
  assert.equal(policy.providerOutputIsUntrusted, true);
});
