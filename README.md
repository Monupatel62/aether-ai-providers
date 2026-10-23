# @aether-ai/providers

Provider-neutral TypeScript contracts and registry for Aether AI model adapters.

## Status

Initial contract foundation in review. No external provider SDK, credentials, or live provider call is included. The Aether gateway/provider ADR and final public request/response contract remain open, so these types are a versioned proposal—not a frozen compatibility promise.

## Current implementation

- Versioned chat and embedding request/response types.
- Explicit capability declarations for chat, streaming, tools, and embeddings.
- Normalized provider errors that do not copy raw upstream bodies into user-visible messages.
- Adapter validation and a registry that returns copied metadata.
- Mock-only unit tests and Node.js 20/22 CI.

## Security boundary

- Provider credentials must remain in server-side adapter configuration or an approved secret resolver; never place credentials in browser-facing request types.
- Do not log raw provider bodies or secrets.
- Retry decisions must be made by the gateway/runtime using normalized error metadata and the operation's idempotency semantics.
- Registry validation is not authentication, authorization, credential validation, or proof of provider conformance.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

No vendor adapter is included until provider selection, SDK versions, licenses, and the gateway contract are reviewed.
