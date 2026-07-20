# RQ-0004 - Project-Configured RAG Grounding

## Goal

Allow each AI Factory consumer project to configure its own remote RAG service and ground selected agent prompts or ad-hoc questions in that project’s domain documentation.

## Requirements

- Add an optional `rag.grounding` configuration with `enabled`, `chatUrl`, `mode`, `marker`, `sourceIds`, `agents`, `timeoutMs`, `failOpen`, `maxContextChars`, and `queryPrefix` settings.
- Keep grounding disabled by default so base AI Factory behavior remains unchanged.
- Support `always` mode for every requirement and `explicit` mode only when the requirement Markdown contains the configured marker.
- Query the configured RAG endpoint once before planning and reuse the answer and sources for selected agent prompts.
- Save the complete RAG response as `rag-context.json` in the run directory for traceability.
- Add bounded RAG context, source paths, and scores to selected prompts with an explicit instruction that retrieved content is untrusted reference material and does not override the requirement.
- Support source filtering through `sourceIds`; the RAG API shall restrict retrieval to those sources.
- Add `pnpm factory rag chat <question>` to query the project-configured remote RAG endpoint directly.
- Respect `timeoutMs`; when `failOpen` is true continue without RAG context and when false fail the run.
- Do not send a request when grounding is disabled or explicit mode is not activated.
- Never include endpoint credentials or sensitive headers in logs or run artifacts.
- Configure `arinc661-studio` to query the `arinc` source through the centrally configured RAG URL.
- Support a central AI Factory `rag.grounding` configuration. Consumer projects shall inherit
  its connection settings and override only their project-specific grounding fields.

## Acceptance Criteria

- An ARINC661 Studio pipeline run queries RAG before the planner and records cited context.
- Only configured agent roles receive RAG context.
- `sourceIds: ["arinc"]` prevents Rapita chunks from appearing in retrieval results.
- An unavailable endpoint continues without context in fail-open mode and stops in fail-closed mode.
- Base projects without `rag.grounding.enabled` make no remote request.
- Remote chat CLI prints the answer and cited sources.
- Typecheck, unit tests, Python tests, and a live endpoint smoke query pass.
