# Dependencies and contracts — aether-ai-providers

**Status:** proposed contract; no API implementation exists yet.

## Contract area

Provider adapter interface and capability registry

## Direct dependencies

Only low-level shared contracts required by provider adapters. Optional vendor SDKs require explicit version/license review and an accepted ADR. Provider adapters must not depend on or import `aether-ai-gateway` implementation.

## Gateway boundary

`aether-ai-providers` owns the provider-neutral adapter interface and capability declarations. `aether-ai-gateway` consumes this public contract and composes/registers adapters. This dependency direction prevents a provider-to-gateway package cycle.

## Required rules

Each adapter declares chat/embeddings/tools/streaming capabilities, auth method, limits, supported parameters, normalized errors, and safe retry rules.

## Contract governance

- The [master catalog](https://github.com/Monupatel62/aether-ai-platform/blob/main/docs/REPOSITORY_CATALOG.md) is the canonical dependency map.
- Public REST endpoints require OpenAPI definitions, versioning, stable error codes, and compatibility tests.
- Events require a schema version, event/run ID, timestamp, correlation ID, tenant/principal scope where appropriate, and explicit retry/idempotency semantics.
- Package interfaces must distinguish public stable exports from internal implementation details.
- No service may read another service's private tables or import downstream application internals.
- Any breaking change must include consumer inventory, migration notes, staged rollout/rollback plan, and an update to affected repository specs.
- Provider/model differences must be surfaced as capabilities; do not claim all models support the same features.
- Never expose provider credentials or raw sensitive upstream errors to browsers or ordinary logs.

## Review checklist

- [ ] Inputs, outputs, errors, payload limits, timeout and rate-limit behavior defined.
- [ ] Authentication, authorization, and tenant boundary defined.
- [ ] Retries, cancellation, duplicate requests, and side effects defined.
- [ ] Correlation IDs and redaction rules defined.
- [ ] Unit and contract tests planned.
- [ ] Direct and transitive dependency licenses checked before reuse.
