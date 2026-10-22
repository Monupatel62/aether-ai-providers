# Technical design — aether-ai-providers

**Status:** design proposal; not implemented.

## Role

Each provider adapter maps one provider's API into the gateway contract; adapters must report capabilities explicitly.

## Proposed internal structure

Proposed adapter contract: provider ID, model/deployment metadata, capability flags (chat, streaming, tools, embeddings), request mapper, response/event mapper, usage parser, error normalizer, timeout/cancel support, credential resolver. Avoid one giant conditional provider class.

## Connections and ownership

Gateway depends on provider interface; provider packages do not import API, web, billing, or agent orchestration. Credentials come from server-side secret/config service and are scoped to the request.

## Failure cases to design explicitly

- Invalid or unauthorized input.
- Dependency unavailable or responds with malformed/partial data.
- Timeout, cancellation, duplicate delivery/request, and retry exhaustion.
- Tenant or permission mismatch.
- Sensitive data accidentally entering logs or client-visible errors.

## Verification plan

Use fake HTTP servers/fixtures for provider contract tests; verify SSE parsing, partial chunks, malformed JSON, token usage, 429/5xx, timeout, abort, and capability mismatch. Pin SDK versions and review license.

## Open decisions

- Final language/framework and packaging model.
- Runtime deployment boundary (repository does not imply a separate service).
- Selected dependency versions and license review.
- Production observability/retention limits and release criteria.

## Change-comment policy

When implementation begins, explain security invariants, state transitions, retry/idempotency constraints, and non-obvious integration behavior in comments. Keep the comment standard at [the project-wide guide](https://github.com/Monupatel62/aether-ai-platform/blob/main/docs/ENGINEERING_AND_COMMENTING_STANDARD.md).

## Related docs

- [Project specification](PROJECT_SPEC.md)
- [Architecture](ARCHITECTURE.md)
- [Dependencies and contracts](DEPENDENCIES_AND_CONTRACTS.md)
- [Implementation plan](IMPLEMENTATION_PLAN.md)
- [Research and licenses](RESEARCH_AND_LICENSES.md)
- [Work log](WORKLOG.md)
- [Master repository spec](https://github.com/Monupatel62/aether-ai-platform/blob/main/docs/repositories/aether-ai-providers.md)

## Provider selection gate

The current DevKit repository declares `@woho/provider-openai 0.2.22` as an OpenAI-compatible HTTP/SSE adapter. This is not evidence of broad native provider coverage. Aether should define provider capabilities explicitly and verify each additional adapter separately. Compare the DevKit path with DIAL Core in the [master gateway evaluation](https://github.com/Monupatel62/aether-ai-platform/blob/main/docs/DIAL_ADOPTION_EVALUATION.md); do not duplicate retry/fallback logic across layers.
