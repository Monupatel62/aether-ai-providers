import test from "node:test";
import assert from "node:assert/strict";
import { createOpenAICompatibleAdapter, normalizeProviderError, ProviderContractError, ProviderRegistry, validateCapabilities, validateCompletionRequest } from "../src/index.js";

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


test("executes a bounded OpenAI-compatible HTTP request through an explicit host allowlist", async () => {
  let call;
  const adapter = createOpenAICompatibleAdapter({
    id: "compatible",
    baseUrl: "https://api.example.com/v1",
    allowedHosts: new Set(["api.example.com"]),
    getApiKey: async () => "test-key",
    fetchImpl: async (url, init) => {
      call = { url, init };
      return new Response(JSON.stringify({ model: "model-a", choices: [{ message: { content: "reply" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2 } }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const registry = new ProviderRegistry().register(adapter);
  const result = await registry.complete("compatible", request);
  assert.equal(result.text, "reply");
  assert.equal(result.usage.inputTokens, 3);
  assert.equal(call.url, "https://api.example.com/v1/chat/completions");
  assert.equal(call.init.redirect, "error");
  assert.equal(call.init.headers.authorization, "Bearer test-key");
});

test("rejects unsafe provider endpoints and normalizes provider status errors", async () => {
  assert.throws(() => createOpenAICompatibleAdapter({ id: "bad", baseUrl: "http://api.example.com/v1", allowedHosts: new Set(["api.example.com"]), getApiKey: async () => "key" }), /allowlist/);
  assert.throws(() => createOpenAICompatibleAdapter({ id: "bad", baseUrl: "https://127.0.0.1/v1", allowedHosts: new Set(["127.0.0.1"]), getApiKey: async () => "key" }), /allowlist/);
  const adapter = createOpenAICompatibleAdapter({
    id: "limited", baseUrl: "https://api.example.com/v1", allowedHosts: new Set(["api.example.com"]),
    getApiKey: async () => "key", fetchImpl: async () => new Response("{}", { status: 429 }), timeoutMs: 100,
  });
  await assert.rejects(adapter.complete(request), (e) => e.code === "rate_limit" && !e.message.includes("{}"));
});

test("bounds provider HTTP requests that never settle", async () => {
  const adapter = createOpenAICompatibleAdapter({
    id: "slow", baseUrl: "https://api.example.com/v1", allowedHosts: new Set(["api.example.com"]),
    getApiKey: async () => "key", fetchImpl: () => new Promise(() => {}), timeoutMs: 5,
  });
  await assert.rejects(adapter.complete(request), (e) => e.code === "timeout");
});
