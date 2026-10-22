---
id: RQ-0087
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-22T08:11:33.565Z"
branch: "factory/RQ-0087"
createdFromCommit: "d3655281d2bf05fe8f75a7e0dfcf2366651ba8a3"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/153"
githubPullRequestIid: 153
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/152"
githubIssueIid: 152
repositoryProvider: github
---
# RQ-0087 - Template sync: a project's design IP in simulation and clean on Windows from embedded1, and a project's change to a template-owned file kept, gated and proposed back instead of overwritten

From Kaan's RQ-0009 report (22 October 2026, embedded1, item A5) and its
review. RQ-0009 changes `common/flow_lib.tcl`, a file the template owns:
`template update` replaces a template-owned file that differs from the
template, so the next update after RQ-0009 is merged silently takes his
changes back out. Nothing told him the file was the template's: AGENTS.md
does not say so, `allowedPaths` includes `common` and `scripts`, and the
update keeps no record of what it last delivered, so it cannot tell a
project that changed a file from a project on an older template.

Changing a template file in a project stays allowed: trying a flow change
needs Vivado and a real design. What is not allowed is that change staying
on the project's main unmarked, or being overwritten without a word.

## What it does

### 1. embedded1's changes in the template

`templates/embedded/common/flow_lib.tcl` takes the three changes of
embedded1 `factory/RQ-0009` (c4ffc81), in the same text so that a
three-way merge with that branch is clean, on top of RQ-0086:

- `IPS` in `project.tcl` (`set IPS {drawer}`): the design's own IP, read
  with the other `project.tcl` settings, empty by default.
- `flow::ip_sources`: the HDL of each IP in `IPS`, `ip/<name>/hdl` in the
  order of its `files.f` (blank and `#` lines skipped), else sorted; an
  `IPS` name without `ip/<name>/hdl` is an error. `run_sim` compiles it
  before the design's HDL and the testbenches.
- `clean` removes everything under `out/<design>` but its own
  `vivado-clean.log`, which is open, and Windows refuses to delete an open
  file.

The template's `project.tcl` comment and `ip/README.md` name `IPS`.

### 2. A record of what the template delivered

`template update` writes `.factory/template.lock.json`: the aifactory commit,
and for every file it owns (what it replaces: the template files outside
`designs/` and `boards/`, `.gitlab-ci.yml`, `.env.example`, `AGENTS.md`) the
sha256 of the template's content, line endings normalised. Merged files
(`factory.config.json`, `package.json`, `.gitignore`) are not in it.

Where the project's file differs from the template's after an update, the
template's content goes to `.factory/template-base/<path>`: it is the base of
the next update. For any other file the base is its content in the commit
that last wrote the lock.

A project without a lock takes as base its last `chore(template): the
aifactory embedded template at …` commit on main, else its first commit.

### 3. Update: three-way, never a silent overwrite

For each template-owned file, with base, mine (the project's) and theirs
(the new template's):

| | update |
|---|---|
| mine = base | replaced by theirs (as today) |
| theirs = base, mine differs | kept; listed as `kept` |
| mine = theirs | nothing to do; an override on it is removed, its base copy deleted |
| all three differ | `git merge-file` mine base theirs: clean → the merge is written, listed as `merged`; conflict → written with markers, listed as `conflict` |

With a conflict the merge request is opened but left draft, `pnpm check`
failing does not stop the delivery, and the description says to resolve the
files on the branch. The merge request lists every file by its outcome.
`--dry-run` shows the same list.

### 4. Override: a project's change marked on purpose

`factory.config.json` `targetProject.templateOverrides` maps a path to
`{ reason, issue }`. `template override <path> --reason "<why>"` adds the
entry and runs `template propose` for it; `template override <path>
--remove` drops it. `template status` lists every template-owned file as
in sync, changed, overridden or conflict.

### 5. Gate: `templateCheck`

`scripts/template-check.mjs`, in the template, plain Node, no aifactory
needed: a template-owned file whose hash is not the lock's and has no
override, or any template-owned file with merge conflict markers, is
reported. A missing lock is reported, not failed. On a developer's machine
and in `handoff-finish` it only reports; with `--strict` it fails. The
project's CI runs it with `--strict` in a `template_check` job on merge
request pipelines (Linux runner, no Vivado). Its message names the two ways
out: revert the file, or `template override <path> --reason …`.

### 6. Propose: the change back to aifactory

`template propose [<path>...]` (default: every override) opens one GitHub
issue on aifactory with, per file, the reason and the diff from base to the
project's file, the project's name and its commit; the issue URL is stored
in the override. The token comes from the project's `.env`, else from
`../aifactory/.env`; with neither, the issue body is written to
`out/template-propose.md` and the command says so. aifactory then takes it
with `requirement new --from-issue`, and the next `template update` finds
mine = theirs and removes the override.

### 7. The rule, written down

The template's AGENTS.md says which files are the template's, that changing
one in a project is for trying, and that a change kept on main is either
reverted or marked with `template override` (which proposes it to aifactory).
`allowedPaths` stays as it is.

## Acceptance Criteria

- `flow_lib.tcl` reads `IPS`; `ip_sources` follows `files.f` order, skips
  blank and `#` lines, falls back to sorted HDL, errors on a missing
  `ip/<name>/hdl`; `run_sim` puts IP sources first; `clean` keeps only
  `vivado-clean.log`. `git merge-file` of embedded1 c4ffc81's
  `flow_lib.tcl` against the new template, with base embedded1 907c340's,
  has no conflict and gives the new template's file.
- `template update` writes the lock with the aifactory commit and one hash
  per template-owned file, and no hash for merged files; a file kept
  different has its base copy.
- Each row of the table in 3 is a test: replaced, kept, in sync (override
  and base copy removed), merged clean, conflict (markers written, merge
  request draft, check failure does not stop it).
- A project without a lock takes its last `chore(template)` commit as base,
  else its first commit.
- `template override` adds and `--remove` drops an entry; `template status`
  lists the four states.
- `template-check.mjs`: an unmarked change and conflict markers are
  reported; exit 0 without `--strict`, 1 with it; an overridden change and
  a missing lock pass. The template's CI has `template_check` on merge
  request pipelines with `--strict`.
- `template propose` builds one issue body with reason and diff per file
  and stores its URL in the override; without a token it writes
  `out/template-propose.md`.
- The template's AGENTS.md has the rule of 7.
- README: template ownership, lock, update outcomes, override, propose.
