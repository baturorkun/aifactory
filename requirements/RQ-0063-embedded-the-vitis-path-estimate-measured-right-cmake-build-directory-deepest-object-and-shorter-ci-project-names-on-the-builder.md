---
id: RQ-0063
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-20T16:19:47.043Z"
branch: "factory/RQ-0063"
createdFromCommit: "71b859cee9034272a6a709a182f360728f7a2dc4"
completedRunId: "20261020163101-RQ-0063"
completedBy: "Batur Orkun"
completedAt: "2026-10-20T16:41:18.626Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/105"
githubPullRequestIid: 105
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/104"
githubIssueIid: 104
repositoryProvider: github
---
# RQ-0063 - Embedded: the Vitis path estimate measured right (CMake build directory, deepest object) and shorter CI project names on the builder

Kaan's merge request in embedded1 failed in CI (job 6631, 20 October): the
Vitis BSP of `hdmi_colorbar` could not open
`...\libsrc\build_configs\gen_bsp\libsrc\standalone\src\CMakeFiles\xilstandalone.dir\arm\cortexa9\gcc\translation_table.S.obj.d`,
261 characters under the CI copy `C:\ab\embedded1-embedded_build-factory-rq-0004`.
Vitis' gcc stops at 259. The stage's estimate (RQ-0048) had called it 220 and
let the build run: it left out the BSP's CMake build directory
(`libsrc/build_configs/gen_bsp/`, 29 characters) and took a shallower object
than the deepest one (81 characters, not 93).

## What it does

- The Vitis workspace on Windows no longer sits in the project copy: a
  design's `sw/create_vitis.py` hands its work to the template's new
  `scripts/vitis_sw.py`, which puts the workspace at
  `<base path>\.v\<8 characters of the copy and design's hash>` and names the
  platform `platform`. The longest path then holds neither the copy's name
  nor the design's: 194 characters under `C:\ab` (measured on the builder:
  192 for the object, 2 more for its `.d`), 65 under the limit, whatever the
  names. Elsewhere (Linux, a Mac) the workspace stays at `out/<design>/vitis`.
  Since `designs/` is the project's and `template update` leaves it, a design
  made from an older template takes the new `create_vitis.py` by hand; the
  logic now being the template's, later fixes reach every design.
- `LongPathsEnabled` is no answer: on the builder it is 0, and none of
  Vitis' gcc executables (`arm-none-eabi-gcc`, `cc1`, `as`, `ld`,
  `collect2`) declares `longPathAware`, which Windows requires before it
  lets a program past 259.
- The estimate counts the BSP's build directory and the deepest dependency
  file a failed build printed; the budget is 255 (the limit is 259, a few
  characters kept for a deeper object). The measured cases agree: 251 built,
  261 failed, and the stage now stops before the build with the parts listed.
- A CI job's copy on the builder is `<project>-<tag>-<ref>` with a
  one-letter tag (`s` sim, `b` build, `f` the factory job) instead of the
  job's full name: `embedded1-b-factory-rq-0004`, 247 characters for
  `hdmi_colorbar`. The resource groups keep the full names. The lab host's
  copies (twin, board) are not on Windows and keep theirs.

## Acceptance Criteria

- `hello_ps` with the new `create_vitis.py` builds its ELF on the builder
  with the workspace in `C:\ab\.v\<hash>`; a design and a copy with long
  names pass the estimate; a long base path still fails it.

- With an older template's `create_vitis.py`, `hdmi_colorbar` in
  `C:\ab\embedded1-embedded_build-factory-rq-0004` is refused before the
  build at 261 characters, naming each part and the template's script; in
  `embedded1-b-factory-rq-0004`, `embedded1-f-factory-rq-0004` and
  `embedded1-kavci` it passes.
- The generated CI names the builder copies with `s`, `b` and `f`.
