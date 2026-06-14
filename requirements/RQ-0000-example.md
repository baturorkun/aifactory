# RQ-0000 — Hello World Example

Simple end-to-end smoke test for the AI factory pipeline.

## Acceptance Criteria

- A `greet(name: string): string` function must be exported from `src/hello/greeter.ts`
- The function must return `"Hello, <name>!"` for any non-empty name
- An error must be thrown when `name` is empty or whitespace

## Non-Functional Requirements

- TypeScript strict mode must be satisfied
- Unit test coverage for happy path and error case
