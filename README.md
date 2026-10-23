# aether-ai-providers

**Status:** Initial provider-neutral contract and adapter registry implemented on a feature branch. No vendor SDK or real provider adapter has been selected; production readiness is not claimed.

## Implemented

- [Provider-neutral source](src/index.js): request/capability validation, normalized safe errors, adapter registry, normalized completion response.
- [Unit tests](test/provider.test.js): malformed requests, capability validation, duplicate adapters, streaming capability checks, error redaction, adapter failure normalization.
- Dependency-free Node.js package and Node 20/22 CI workflow.

## Boundaries and limitations

Provider adapters own vendor wire formats and credentials. The gateway owns routing, product policy, and retry/fallback decisions. This package currently includes no vendor-specific implementation, streaming transport, secret store integration, or live-provider smoke test. The caller must provide credentials and timeouts through a trusted adapter boundary; do not pass credentials in request objects or log raw vendor errors.

## Documentation

- [Project specification](docs/REPOSITORY_SPECIFICATION.md)
- [Project spec](docs/PROJECT_SPEC.md)
- [Architecture and connections](docs/ARCHITECTURE.md)
- [Dependencies and contracts](docs/DEPENDENCIES_AND_CONTRACTS.md)
- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Technical design](docs/TECHNICAL_DESIGN.md)
- [Security review](docs/SECURITY_REVIEW.md)
- [Engineering standard](docs/ENGINEERING_STANDARD.md)
- [Master catalog](https://github.com/Monupatel62/aether-ai-platform/blob/main/docs/REPOSITORY_CATALOG.md)
