# RQ-0005 - Project Guidelines

Allow each AI Factory consumer project to define persistent, trusted project-level instructions independently of RAG grounding.

## Requirements

- Add a `projectGuidelines` configuration with `files`, `required`, and `maxContextChars`.
- Resolve guideline files within `targetProject.root` and reject paths outside that root.
- Fail before creating a run when a required guideline file is missing.
- Reject guideline content that exceeds the configured context limit rather than silently truncating it.
- Inject the combined guidelines into every Planner, Architect, Coder, Tester, Reviewer, and Domain Guard system prompt.
- State that an explicit current requirement may override a project-specific guideline, while system safety and security instructions remain authoritative.
- Include the guidelines in manual handoff packages.
- Save a guideline snapshot in the run and handoff directories.
- Record each source path, SHA-256 hash, and the combined SHA-256 hash in the run manifest.
- Keep project guidelines completely independent from optional RAG grounding.
- Scaffold new projects with a tracked `PROJECT_GUIDELINES.md` file and required guideline configuration.

## Acceptance Criteria

- Normal agent runs and tracked handoffs consume the same project guidelines.
- A missing required file prevents execution.
- A guideline path cannot escape the target project root.
- Legacy configurations without `projectGuidelines` continue to work.
- Tests verify loading, prompt injection, snapshotting, manifest traceability, missing-file failure, path safety, and handoff inclusion.
