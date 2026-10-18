---
id: RQ-0048
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-18T12:28:51.222Z"
branch: "factory/RQ-0048"
createdFromCommit: "83815ec7c8e9d5deb1fad2e88c80e72b371771ad"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/75"
githubPullRequestIid: 75
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/74"
githubIssueIid: 74
repositoryProvider: github
---
# RQ-0048 - Embedded CI on Windows hosts: whole files back, short paths, the board job's host project

The first merge request pipeline of `agentic/embedded1` (18 October), with the
runner, the lab-wide CI/CD variables and the CI SSH keys in place, found three
faults the local runs had not shown:

1. **Files over 200 KiB came back cut.** Every artifact the CI pulled from the
   Vivado host (Windows OpenSSH) ended at exactly 204 800 bytes: both
   bitstreams (4 045 691 bytes) and the XSA (386 KB); the 133 KB ELF was
   whole. The CI image's OpenSSH 9.2 `scp` uses SFTP by default; in the same
   image, `scp -O` (the SCP protocol) brought the bitstream back whole. The
   board stage then refused the cut XSA ("not a zip archive").
2. **The Vitis BSP did not build in CI.** The host project directory CI used
   (`embedded1-embedded_build-factory-rq-0001`, 41 characters) under
   `C:\Users\Batur\aifactory-builds` put the BSP's object files past the
   260-character Windows path limit (`opening dependency file …obj.d: No
   such file or directory`); the local `embedded1-batur` stayed just under it.
   Windows' `LongPathsEnabled` did not help (Vitis' gcc 13.3 is not
   long-path aware); a junction `C:\ab` to the builds folder did, and the
   lab-wide `VIVADO_REMOTE_BASE_PATH` is now `C:\ab`.
3. **The board job had no host project.** `embedded_board` set no
   `BOARD_REMOTE_PROJECT_NAME`, so the stage stopped before the lab ("…names
   a remote Vivado host", where it meant the lab host).

## What it does

- Every `scp` to and from a Windows host uses the SCP protocol (`-O`), so a
  file comes back whole whatever the client's OpenSSH.
- `lab/inventory.json` gives the Vivado host's base path as `C:\ab`, the
  junction, with the reason; new projects take it from there.
- Before the software stage on a Windows host, the flow estimates the longest
  path the Vitis BSP will write (base path, host project, design, processor,
  the deepest BSP object) and stops with the parts and their lengths when it
  would pass the limit, instead of failing in the BSP build minutes later.
- The `embedded_board` and `embedded_board_on_demand` jobs set their host
  project name as the other Vivado jobs do; a missing `BOARD_*` remote setting
  names the lab host, and a missing `TWIN_*` one the twin's Docker host.
- `factory ci-variables` no longer copies the lab's shared settings into a
  project: they are instance-level CI/CD variables on both lab GitLabs, and a
  project copy would shadow them and go stale. A setting equal to its
  lab-inventory value, and the lab-wide tokens (`BOT_API_TOKEN`,
  `TWIN_GITLAB_TOKEN`), are left out and listed; a project value that differs
  is still written.

## Acceptance Criteria

- A pull from a Windows host uses `scp -O`; a Linux host keeps the default.
- `lab/inventory.json` has `C:\ab` as the Vivado host's base path, and a new
  project's `.env` takes it.
- The software stage on a Windows host refuses, before Vivado or Vitis runs,
  a base path and host project name that would put the BSP past the limit,
  and names the parts; the names `embedded1` used locally and in CI with
  `C:\ab` pass.
- The board jobs of the generated `.gitlab-ci.yml` set
  `BOARD_REMOTE_PROJECT_NAME`; the missing-setting message names the lab host.
- `factory ci-variables --with-secrets` in embedded1 writes only the four
  board-unit settings and lists the rest as lab-wide.
- With these, embedded1's merge request pipeline passes check, sim, build
  (bitstreams, XSA and ELF whole) and board on the ZedBoard.
