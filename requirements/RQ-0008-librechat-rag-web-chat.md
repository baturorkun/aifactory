# RQ-0008 - LibreChat Web UI for AI Factory RAG

## Goal

Provide a self-hosted, Docker-managed web chat for AI Factory RAG by integrating
LibreChat with the existing retrieval, source filtering, answer generation, and
query audit pipeline.

## Technology Decision

- Use LibreChat as the web application. LibreChat is MIT-licensed, supports
  Docker deployment, user accounts, persistent conversations, and custom
  OpenAI-compatible endpoints.
- Do not maintain a bespoke AI Factory chat frontend after LibreChat reaches
  feature parity and passes acceptance testing.
- Keep AI Factory responsible for retrieval and answer generation. Do not
  create a second document index inside LibreChat.
- Pin LibreChat to a reviewed immutable version or image digest; do not deploy a
  floating `latest` or `main` image.
- Record the selected LibreChat version, image digest, upstream license, and
  upgrade procedure in the deployment documentation.

## Requirements

- Add an OpenAI Chat Completions compatibility layer to the existing RAG API:
  - `GET /v1/models` for model discovery.
  - `POST /v1/chat/completions` for non-streaming chat completions.
  - OpenAI-compatible request validation, response envelopes, timestamps,
    completion IDs, model IDs, finish reasons, and error responses.
- Preserve the existing `/query` endpoint and its response contract for current
  AI Factory clients.
- Expose one discoverable model for all configured RAG sources and one model per
  source ID. Selecting the `simics-code` model must restrict retrieval to the
  `simics-code` source.
- Define deterministic, collision-safe model IDs and document their mapping to
  RAG `sourceIds`.
- Use the newest user message as the retrieval question and include bounded
  prior conversation context when generating an answer so follow-up questions
  remain meaningful.
- Preserve source traceability. At minimum, append deduplicated source paths to
  the answer in a clearly labelled `Sources` section when the compatibility
  protocol cannot transport structured citations reliably.
- Pass the authenticated LibreChat user identity to the RAG query audit record
  without trusting a user-supplied identity header from an untrusted client.
- Add LibreChat and its required persistence services to the existing RAG
  Compose environment without exposing PostgreSQL, model API keys, or database
  credentials to the browser.
- Configure LibreChat through a mounted `librechat.yaml` custom endpoint that
  targets the internal `rag-api` Compose service.
- Persist LibreChat accounts and conversation data in named Docker volumes.
- Bind the web service to `127.0.0.1` by default and allow explicit LAN exposure
  through an environment variable.
- Require authentication before chat access when the service is exposed beyond
  localhost. Document first-admin creation, account registration policy, data
  backup, restore, and user removal.
- Add health checks and startup ordering for PostgreSQL, RAG API, LibreChat
  persistence, and LibreChat.
- Keep host-based CLI ingestion working for mounted sources such as
  `simics-code`; the web deployment must not require source directories to be
  copied into a container image.
- Extend `pnpm factory rag env up`, `down`, and `status` to manage the complete
  stack and rebuild only when required.
- Remove the custom `services/rag-web` frontend after LibreChat integration is
  verified, and remove any obsolete Nginx service/configuration.

## Security and Operations

- Never bake `.env`, API keys, credentials, chat data, or mounted source content
  into Docker images or build contexts.
- Use named volumes for application state and document a recoverable backup
  procedure before upgrades.
- Do not expose the internal LibreChat-to-RAG credential in client-side code,
  logs, query artifacts, or API responses.
- Apply request-size limits and bounded upstream timeouts.
- Document the ports, bind addresses, reverse-proxy expectations, health checks,
  logs, upgrade flow, rollback flow, and conflict with an existing systemd RAG
  API on port 8765.

## Acceptance Criteria

- `pnpm factory rag env up` starts a healthy PostgreSQL, RAG API, LibreChat data
  store, and LibreChat deployment from a clean host with Docker or Podman.
- A user can sign in, select the `simics-code` model, ask a question, and receive
  an answer grounded only in `simics-code` chunks.
- The displayed answer includes deduplicated source paths and the database audit
  record contains the authenticated user identity and cited chunks.
- Selecting the all-sources model can retrieve from multiple configured sources;
  selecting a source-specific model cannot retrieve unrelated chunks.
- Follow-up questions use bounded conversation context without persisting chat
  history in the RAG prompt logs.
- Existing `/query`, CLI query, ingest, grounding, and source-filter tests remain
  compatible.
- Automated tests cover model discovery, source/model mapping, request
  validation, chat completion responses, authentication boundaries, history
  bounds, error handling, and citation formatting.
- Compose configuration validation, container health checks, Python tests,
  TypeScript tests, and an end-to-end browser smoke test pass.
- Deployment documentation identifies LibreChat and includes its pinned version,
  MIT license notice, configuration, backup/restore, upgrade, and rollback steps.

## References

- LibreChat Docker deployment: https://www.librechat.ai/docs/local/docker
- LibreChat custom endpoints: https://www.librechat.ai/en/docs/quick_start/custom_endpoints
- LibreChat license: https://github.com/danny-avila/LibreChat/blob/main/LICENSE
- OpenAI-compatible endpoint contract expected by chat UIs:
  https://docs.openwebui.com/getting-started/quick-start/connect-a-provider/starting-with-openai-compatible/
