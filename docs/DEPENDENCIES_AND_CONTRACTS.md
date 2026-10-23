# Dependencies and contracts — aether-ai-providers

**Status:** proposed contract; no API implementation exists yet.

## Contract area

Provider adapter interface and capability registry. This repository owns the provider abstraction consumed by the gateway.

## Direct dependencies

Optional vendor SDKs only, after explicit version/license review and an accepted ADR. Provider adapters must not depend on or import `aether-ai-gateway`; the gateway consumes this repository's public provider contract and composes adapters at the application boundary.

## Required rules

Each adapter declares chat/embeddings/tools/streaming capabilities, auth method, limits, supported parameters, normalized errors, and safe retry rules. Keep provider credentials server-side; never expose them to browsers or ordinary logs. Provider/model differences must be surfaced as capabilities rather than assuming feature parity.

## Contract governance

- The [master catalog](https://github.com/Monupatel62/aether-ai-platform/blob/main/docs/REPOSITORY_CATALOG.md) is the canonical dependency map.
- Public REST endpoints require OpenAPI definitions, versioning, stable error codes, and compatibility tests.
- Events require a schema version, event/run ID, timestamp, correlation ID, tenant/principal scope where appropriate, and explicit retry/idempotency semantics.
- Package interfaces must distinguish public stable exports from internal implementation details.
- No service may read another service's private tables or import downstream application internals.
- Any breaking change must include consumer inventory, migration notes, staged rollout/rollback plan, and an update to affected repository specs.

## Review checklist

- [ ] Inputs, outputs, errors, payload limits, timeout and rate-limit behavior defined.
- [ ] Authentication, authorization, and tenant boundary defined.
- [ ] Retries, cancellation, duplicate requests, and side effects defined.
- [ ] Correlation IDs and redaction rules defined.
- [ ] Unit and contract tests planned.
- [ ] Direct and transitive dependency licenses checked before reuse.
