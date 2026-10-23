# Provider Adapter Conformance and Supply-Chain Security Contract

**Status:** proposed contract and acceptance criteria only. No provider adapter, SDK inventory, or runtime conformance tests are claimed implemented.

## Scope and ownership

This contract governs adapter behavior at the boundary between external model providers and the Aether-owned Gateway contract. Provider APIs, SDKs, stream frames, usage records, capability claims, and error bodies are untrusted inputs. Gateway owns product-facing routing/fallback policy; Providers must expose truthful capability and failure metadata without duplicating cross-provider orchestration.

No provider or SDK is selected by this document. Version, license, deployment, credential storage, and data-processing decisions require review before implementation.

## Capability declaration

Every adapter must publish a versioned capability record for the concrete model/deployment, not just the vendor. It must distinguish at minimum:
- request modalities and supported input fields;
- streaming and event/frame semantics;
- tool/function calling and structured-output constraints;
- embeddings or other task-specific capabilities;
- context/output limits and supported parameters;
- usage/billing metadata availability and known omissions;
- authentication mode and required scopes;
- timeout/cancellation support and retryable error categories;
- data-handling/retention classification supplied by approved configuration, not guessed from a model label.

Unknown capability means unsupported until explicitly verified. Capability records need source/version provenance and a review date. A capability mismatch must be surfaced to Gateway as a stable error/result, not silently approximated by dropping required fields.

## Request and response validation

- Validate outbound request shape and bounds before sending to the provider.
- Treat provider response bodies and stream frames as untrusted. Enforce maximum byte/frame/event sizes, bounded parsing, valid event ordering, and explicit end/error semantics.
- Reject or safely terminate malformed JSON, invalid encodings, impossible usage values, unexpected content types, and stream protocol violations.
- Do not treat a syntactically valid response as safe for downstream HTML, SQL, shell, URL, or tool use; downstream consumers must apply context-specific validation and authorization.
- Never include raw provider bodies, prompts, completions, authorization headers, or credential-bearing URLs in default logs or public errors.
- Normalize provider errors into bounded categories while preserving retryability and request correlation. Keep raw diagnostics only where explicitly approved, access-controlled, and redacted.

## Credentials and outbound transport

Resolve credentials only on the server through the approved secret/configuration mechanism. Scope credentials to the request and provider/deployment where possible; never ship them to browsers, logs, traces, error messages, or client-visible metadata. Support rotation and revocation without exposing prior secret values.

Use TLS with certificate validation. Restrict provider endpoints to configured, reviewed destinations; do not allow request data or model output to choose arbitrary URLs. If custom endpoints are supported, apply the platform SSRF/egress policy, including redirect revalidation and protection against private/link-local destinations and DNS rebinding. Bound connect, read, and total deadlines.

## Retry, streaming, and usage integrity

- Retry only explicitly classified transient failures and within Gateway's bounded attempt/deadline policy.
- Propagate cancellation where supported and stop processing after the request is cancelled or its deadline expires.
- Do not replay a request transparently after user-visible stream output unless the Gateway contract explicitly defines safe resume semantics.
- Do not let Providers implement an independent fallback policy that bypasses Gateway constraints.
- Parse usage metadata defensively. Mark absent or uncertain usage as unknown rather than inventing zero.
- Preserve stable attempt/request identifiers so billing can reconcile partial provider usage, retries, and duplicate delivery without double-posting. Provider adapters report facts; they do not own the billing ledger.
- Distinguish provider acceptance, first byte, partial output, terminal success, cancellation, timeout, and normalized failure where supported.

## Supply-chain and release gate

Before adding an SDK or provider integration:
1. Record exact package, version, source, license, transitive dependency inventory, and known vulnerability review.
2. Prefer pinned, reproducible dependency resolution and a maintained upstream.
3. Review package lifecycle scripts, transitive network behavior, credential handling, and supported runtime versions.
4. Record provider API version and relevant model/deployment identifiers; define a controlled upgrade/revalidation process.
5. Keep secrets out of fixtures and CI logs. Use synthetic credentials and fake HTTP servers for tests.
6. Document rollback/removal steps and the affected adapter/capability records.
7. Do not vendor or redistribute provider code without explicit license and notice review.

A successful package installation or SDK smoke test does not prove provider behavior, license suitability, security, or production readiness.

## Proposed acceptance matrix

These are proposed future tests, not tests already run.

| Scenario | Required result |
|---|---|
| Provider returns malformed JSON | Bounded parse failure; no raw body in public error |
| Stream sends oversized frame/event | Reject or terminate within documented bounds |
| Stream terminates without valid terminal event | Normalized incomplete/failure outcome |
| Unsupported capability requested | Stable capability mismatch; required behavior not silently dropped |
| Capability record is missing/stale | Treat unknown capability as unsupported pending review |
| Provider returns impossible/negative usage | Mark invalid/unknown and emit safe diagnostic |
| Provider omits usage metadata | Report unknown; do not invent zero |
| Provider returns 429/5xx | Normalize category; retry only under Gateway policy |
| Cancellation occurs during stream | Stop reading/processing and propagate abort where supported |
| Provider fails after partial output | Preserve partial/incomplete state; no silent response splicing |
| Credential appears in exception text | Redacted from response and default telemetry |
| Custom endpoint redirects to private address | Reject under approved egress/SSRF policy |
| DNS answer changes to private/link-local destination | Connection blocked by egress policy |
| SDK version changes | Trigger dependency/license/security review and adapter conformance tests |
| Duplicate attempt/usage callback | Stable identifiers allow reconciliation without duplicate ledger posting |
| Provider error contains prompt or PII | No sensitive raw payload in ordinary logs |
| Provider returns untrusted markup/tool instructions | Adapter treats as data; downstream execution still validates independently |
| Provider times out | Bounded timeout and normalized result; no unbounded retry |
| License metadata missing or incompatible | Block adoption pending legal/license review |

## Evidence required before release

For each adapter, retain the capability declaration, SDK/API version and license review, fixture set, conformance results, timeout/cancellation evidence, secret-canary redaction evidence, usage reconciliation behavior, and known limitations. Use fake HTTP servers and synthetic data. No production-readiness claim should rely on a document-only review.

## Related references

- [Provider security review](SECURITY_REVIEW.md)
- [Provider technical design](TECHNICAL_DESIGN.md)
- [Provider dependency contracts](DEPENDENCIES_AND_CONTRACTS.md)
- [Gateway model routing and fallback safety contract](https://github.com/Monupatel62/aether-ai-gateway/blob/main/docs/MODEL_ROUTING_AND_FALLBACK_SAFETY.md)
- [OWASP GenAI LLM Top 10 2026 official release](https://github.com/GenAI-Security-Project/GenAI-LLM-Top10/blob/main/2026/README.md)
- [OWASP Software Supply Chain Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Software_Supply_Chain_Security_Cheat_Sheet.html)

## Open decisions

Provider set, SDK choices/versions, custom endpoint support, capability registry format, usage reconciliation protocol, provider data-processing classifications, and production acceptance thresholds remain open.
