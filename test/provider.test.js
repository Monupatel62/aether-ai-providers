import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProviderError, ProviderContractError, ProviderRegistry, validateCapabilities, validateCompletionRequest } from "../src/index.js";

const capabilities = { modalities: ["text"], streaming: true, toolCalls: false, maxInputTokens: 8192, maxOutputTokens: 1024 };
const request = { model: "model-a", messages: [{ role: "user", content: "hello" }], stream: false };

test("validates and normalizes completion requests", () => {
  assert.equal(validateCompletionRequest(request).messages[0].content, "hello");
  assert.throws(() => validateCompletionRequest({ ...request, messages: [] }), TypeError);
  assert.throws(() => validateCompletionRequest({ ...request, temperature: 5 }), TypeError);
});

test("validates capability declarations", () => {
  assert.deepEqual(validateCapabilities(capabilities).modalities, ["text"]);
  assert.throws(() => validateCapabilities({ modalities: ["telepathy"] }), TypeError);
});

test("registers adapter and normalizes its response", async () => {
  const registry = new ProviderRegistry().register({
    id: "mock",
    capabilities,
    async complete(input) { return { text: input.messages[0].content.toUpperCase(), model: input.model, usage: { inputTokens: 1, outputTokens: 1 } }; },
  });
  const response = await registry.complete("mock", request);
  assert.equal(response.text, "HELLO");
  assert.equal(response.usage.inputTokens, 1);
  assert.equal(registry.list().length, 1);
});

test("rejects duplicate adapters and unsupported streaming", async () => {
  const adapter = { id: "mock", capabilities, async complete() { return { text: "ok" }; } };
  const registry = new ProviderRegistry().register(adapter);
  assert.throws(() => registry.register(adapter), /already registered/);
  const noStream = new ProviderRegistry().register({ ...adapter, id: "plain", capabilities: { ...capabilities, streaming: false } });
  await assert.rejects(noStream.complete("plain", { ...request, stream: true }), ProviderContractError);
});

test("normalizes vendor errors without leaking raw messages", () => {
  const error = normalizeProviderError({ status: 429, message: "secret prompt api_key=abc" });
  assert.equal(error.code, "rate_limit");
  assert.equal(error.retryable, true);
  assert.equal(error.message.includes("secret"), false);
});

test("wraps unexpected adapter failures safely", async () => {
  const registry = new ProviderRegistry().register({ id: "broken", capabilities, async complete() { throw new Error("vendor response contains private prompt"); } });
  await assert.rejects(registry.complete("broken", request), (error) => error instanceof ProviderContractError && !error.message.includes("private prompt"));
});
