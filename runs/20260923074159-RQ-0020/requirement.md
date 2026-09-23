---
id: RQ-0020
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-09-23T07:35:05.896Z"
branch: "factory/RQ-0020"
createdFromCommit: "29240f1b272ca3f036038484f3c9b7ba8e68d1a4"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/19"
githubPullRequestIid: 19
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/18"
githubIssueIid: 18
repositoryProvider: github
---
# RQ-0020 - a factory env-check command that reports which env values are set, defaulted, or empty

A freshly scaffolded project carries a `.env.example` listing every variable it
understands, but nothing tells the operator which of those are still empty until
a command fails halfway on a missing one. `factory env-check` closes that gap: it
reads the project's `.env.example` (the committed source of truth for the
variable list and its grouping) and its `.env`, and reports each variable as
**set**, **default** (empty in `.env` but the example gives a usable default), or
**empty**, grouped the way `.env.example` groups them.

The command is deliberately descriptive, not prescriptive. Whether an empty
variable actually needs a value depends on the operation and the mode
(`SIMULATOR_REMOTE_*` empty means local, `BOARD_*` empty means the manual board
flow, an optional SSH key means the default key), which a static reader cannot
decide. So it prints each section's guidance comment and lists the empties
without calling them errors; the judgement of what to fill is left to the reader.
A placeholder default such as `replace_me` is reported empty, not defaulted,
because it exists precisely to demand a real value.

## Acceptance Criteria

- `factory env-check` reads `<project>/.env.example` and `<project>/.env` and
  prints, grouped by the example's sections, every variable as set, default, or
  empty, followed by a summary and the list of empties.
- A variable present in `.env` with a non-empty value is `set`; one absent or
  empty in `.env` whose `.env.example` gives a non-empty, non-placeholder default
  is `default`; anything else is `empty`. A placeholder default (`replace_me` and
  similar) is treated as empty.
- Commented example lines in `.env.example` (`# FOO=...`) are never mistaken for
  variables; blank lines separate the groups; a group's leading `#` lines are its
  description.
- The command exits non-zero only when the project has no `.env` at all, not
  merely because some values are empty (many are legitimately optional).
- It errors clearly when run somewhere with no `.env.example`.
- Host tests cover the parsing, the classification (including placeholders and a
  missing `.env`), and the end-to-end read of a project directory.

## Out of scope

- Deciding or enforcing which variables are required for a given operation, and
  prompting for or writing values. That judgement stays with the operator (and
  with the assistant, which fills what it knows and asks for the rest).
