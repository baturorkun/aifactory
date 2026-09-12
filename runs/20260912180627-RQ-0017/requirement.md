---
id: RQ-0017
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-09-12T18:02:52.529Z"
branch: "factory/RQ-0017"
createdFromCommit: "1b8f7776e275eb857606b62c10e03d72b2e1d7cc"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/13"
githubPullRequestIid: 13
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/12"
githubIssueIid: 12
repositoryProvider: github
---
# RQ-0017 - read the requirement kind and execution mode defaults from the project config and seed simics drafts by profile

`requirement new` decides two things from flags that a project answers the same
way every time. In `aselsan-bfi` every requirement is verified against real
hardware, so `--kind hardware-twin` is typed on each one and forgetting it
silently produces a requirement with no probe, no board phase and no parity
gate. The exception should be the thing that is written down, not the rule.

A second gap sits beside it: a draft opened without `--kind hardware-twin`
arrives empty. The project profile already says what a requirement in that
project is made of, and nothing uses it.

## Configured defaults

`factory.config.json` gains a `requirementDefaults` section:

```json
"requirementDefaults": {
  "kind": "hardware-twin",
  "executionMode": "handoff",
  "pipelineFast": false
}
```

`requirement new` resolves each value from the flag when one is given and from
this section otherwise. A project whose every requirement is board-verified
then writes `--kind standard` for the exceptions and nothing for the rule.

This requires removing the defaults Commander applies to `--mode`, `--kind` and
`--fast`: a Commander default is indistinguishable from a value the user typed,
so it would shadow the configured one in every case and the section would never
take effect.

## Profile-seeded drafts

`draftMarkdown` receives `targetProject.profile`. For the `simics` profile, a
`standard` draft is seeded with the sections a boundary requirement is made of
(`Boundary`, `Evidence`, `Validation`) and acceptance criteria covering the
licensed build, the derived profile and the frozen gate. A `hardware-twin`
draft keeps the four phase sections it already had. A project with no profile,
or another profile, is unchanged.

## Acceptance Criteria

- `requirementDefaults` is part of the configuration schema with `kind`,
  `executionMode` and `pipelineFast`, and a configuration without the section
  behaves exactly as before: `standard`, `handoff`, not fast.
- `requirement new` without flags takes all three from the section, and the
  requirement front matter records what it resolved.
- `--kind`, `--mode` and `--fast` each override the configured value, and an
  invalid `--kind` or `--mode` is still rejected by name.
- A `simics` project seeds a `standard` draft with the `Boundary`, `Evidence`
  and `Validation` sections and their acceptance criteria; a `hardware-twin`
  draft keeps its phase sections; another profile seeds neither.
- The generated `factory.config.json` contains the section with a comment that
  tells a Simics project how to make `hardware-twin` its default.
- Unit tests cover the configured defaults, the flag override, the absent
  section and the per-profile seeding; the existing suite still passes.
