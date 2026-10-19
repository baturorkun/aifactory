---
id: RQ-0053
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-19T13:43:28.081Z"
branch: "factory/RQ-0053"
createdFromCommit: "28ce068e7c44ace4521c54bb4e873babf57240af"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/85"
githubPullRequestIid: 85
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/84"
githubIssueIid: 84
repositoryProvider: github
---
# RQ-0053 - codingStandard gate: a project's C checked against its chosen rules with cppcheck and lexical checks, waivers and a report

RQ-0052 gave a C or embedded project its coding standard: the rules in
force in `coding-standard/`, in AGENTS.md, in every handoff and in RAG.
Nothing checks the code against them yet; keeping to the rules rests on the
implementer. This requirement adds the check as a quality gate,
`codingStandard`, run with the other gates of a requirement and in CI, for
embedded1 and every project made with `--standard`. bfi-sw and its own
checker are not touched.

## What it does

- **`scripts/coding-standard.mjs`**, a template-owned script (c and embedded
  templates; `template update` brings it to an embedded project), with no
  dependency beyond Node and cppcheck. It reads `coding-standard/rules.json`
  (the rules in force) and `coding-standard/waivers.yaml`, finds the project's
  C through its compile database, and checks every rule it can:
  - rules citing a MISRA rule (`misra`, `do178c`): cppcheck's MISRA addon
    (`cppcheck --project=<compile_commands.json> --addon=misra --xml`); a
    `misra-c2012-X.Y` finding maps to the rules citing X.Y. Inline
    suppressions are not honoured.
  - a fixed set of `bytecraft` rules by the script's own lexical checks over
    the sources the compile database names and the project's headers:
    C-112 (`.c`/`.h`), C-113 (camelCase file names), C-116 (ASCII in sources),
    C-117 (file-name characters), C-123 (uppercase hex), C-124 (no leading
    `_`), C-127 (uppercase literal suffix), C-128 (no tabs).
  - every other rule in force is `manual`: listed, never claimed checked.
  A finding is waived when `waivers.yaml` has a waiver for its rule and file
  (and line, when given) with every required field; under profile `dal-a` a
  waiver without `reviewer` and `review_date` is refused. It writes
  `out/coding-standard/report.json` and `report.md` (violations with the
  rule's text, waived findings, rules checked by tool / manual, the cppcheck
  version) and exits 1 on an unwaived violation; it says so when cppcheck is
  missing. `pnpm standard` runs it.
- **Compile database.** The c template's CMake already exports
  `build/compile_commands.json`. For an embedded design the Vitis script
  copies the application's `compile_commands.json` and the platform's BSP
  include directory into `out/<design>/artifacts/sw/`, and the sw stage
  rewrites the database to the project's `designs/<design>/sw/src` files and
  the pulled include directory, so cppcheck runs on the Linux runner with the
  Zynq headers (`-DSDT`, cortex-a9 flags kept; platform `unix32`).
- **Gate.** `codingStandard` joins the gates (`@aifactory/contracts`,
  `@aifactory/quality-gates`, `targetProject.commands.codingStandard`): for a
  C project after `build`, for an embedded one in the `build` phase after
  `firmwareBuild`; skipped with the reason when no command is configured (a
  project without a standard). `factory new --standard` and `standard use`
  set the command to `pnpm standard`.
- **CI.** A `coding_standard` job (c: after `c_build`, image with cppcheck
  from apt; embedded: after `embedded_build`, node image plus cppcheck),
  `rules: exists: coding-standard/standard.json`, report as artifact,
  failing the pipeline on an unwaived violation.
- **The implementer sees what is manual.** `index.md` and the handoff list
  mark each rule `tool` or `manual`, so the review checklist is explicit.

## Acceptance Criteria

- On a C project with a known violation set (an `stdio.h` call, an unused
  return value, a tab, a lowercase hex literal) the script reports C-109,
  C-084, C-128 and C-123 with file and line, exits 1, and passes once each
  is waived with every field; under `dal-a` a waiver without a reviewer is
  refused.
- A finding for a MISRA rule not in the project's groups is not reported.
- `report.json` names the rules checked by cppcheck, by lexical check and
  left manual; the counts add up to the rules in force.
- `handoff-finish` on such a project runs the `codingStandard` gate after
  the build; a project without a standard shows it skipped with the reason.
- The embedded sw stage leaves `out/<design>/artifacts/sw/compile_commands.json`
  with project-relative files and the BSP includes beside it; with the Vitis
  database and BSP headers of a real `hello_ps` build taken from the build
  host, `pnpm standard` on the template's `hello_ps` runs cppcheck without a
  missing-include error (embedded1 itself is not changed yet, by Batur's
  word).
- The generated `.gitlab-ci.yml` of both templates carries the
  `coding_standard` job, present only when `coding-standard/standard.json`
  exists.
