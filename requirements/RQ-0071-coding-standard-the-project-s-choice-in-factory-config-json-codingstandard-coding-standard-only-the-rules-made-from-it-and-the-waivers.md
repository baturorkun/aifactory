---
id: RQ-0071
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-21T11:25:30.271Z"
branch: "factory/RQ-0071"
createdFromCommit: "2f1f21508a9da211309b08c64612d22c40a915f1"
completedRunId: "20261021113757-RQ-0071"
completedBy: "Batur Orkun"
completedAt: "2026-10-21T11:42:04.186Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/121"
githubPullRequestIid: 121
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/120"
githubIssueIid: 120
repositoryProvider: github
---
# RQ-0071 - Coding standard: the project's choice in factory.config.json (codingStandard), coding-standard/ only the rules made from it and the waivers

A project's coding standard choice lived in `coding-standard/standard.json`,
apart from the project's other aifactory settings. Batur: every aifactory
setting of a project in its one config, values from `.env` where they are a
person's or a machine's. The choice is neither: it is the project's rule, the
same for every developer and for CI, so it belongs in the committed config.

## What it does

- `factory new --standard … --groups …` and `factory standard use` record the
  choice as `codingStandard` in `factory.config.json`: `id`, `version`,
  `groups`, `profile` (schema-checked, `profile` defaults to `default`).
- `coding-standard/` keeps only what is made from it, `rules.json` and
  `index.md` (the rules in force, so the gate and CI read the rule set from
  the commit), and the project's `waivers.yaml`; `standard.json` is no longer
  written, and `standard use` removes one left from before.
- The gate script (`scripts/coding-standard.mjs`) and `readCodingStandard`
  (requirement drafts, handoffs) read the choice from the config, and from a
  `standard.json` in a project that chose before this.
- A c or embedded project made without a standard has the field, empty
  (`id` "", `groups` []): nothing in force, the place to choose in sight
  (Batur: "olsun da boş olsun, yerini bilelim"). `template update` adds it
  to a project that lacks it and never touches a project's own choice.
- Nothing is in force unless named: `--groups` is required (no implicit "all
  groups").
- `factory standard use` with no arguments applies the choice written in the
  config by hand.
- The gate refuses rules made for another choice than the config's (a hand
  edit not applied with `standard use`), naming both.
- The generated CI runs `coding_standard` when `coding-standard/rules.json`
  exists.
- README and the user guide say where the choice is and why not in `.env`.

## Acceptance Criteria

- A project made with a standard has `codingStandard` in its config, the
  rules and index in `coding-standard/`, and no `standard.json`.
- Changing the profile or the groups in the config changes what the gate
  enforces (dal-a refuses an unreviewed waiver; a group out of force drops
  its findings).
- The CI job's rule names `coding-standard/rules.json`.
- A project without a standard has the empty field; template update adds it;
  `--groups` missing is refused; `standard use` with no arguments applies the
  config; the gate refuses rules made for other groups.
