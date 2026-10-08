---
id: RQ-0034
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-08T10:23:13.834Z"
branch: "factory/RQ-0034"
createdFromCommit: "fb3cf913f47826a41c963b7749cc7a0977139040"
completedRunId: "20261008102514-RQ-0034"
completedBy: "Batur Orkun"
completedAt: "2026-10-08T11:03:14.696Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/47"
githubPullRequestIid: 47
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/46"
githubIssueIid: 46
repositoryProvider: github
---
# RQ-0034 - Leave aifactory's own records out of the RAG grounding of a requirement

Before a requirement is implemented, aifactory asks the RAG to ground it:
"Analyze this project requirement against ARINC 661 ...", followed by the whole
requirement text. Since 5 October the arinc source also holds the
arinc661-studio repository, and with it `requirements/`, the requirement files
themselves. The text most like the question is the requirement's own file:
grounding RQ-0110 returned RQ-0110's own markdown as all 12 sources, RQ-0103
and RQ-0094 the same. The implementer got its own requirement back instead of
the standard's rules, whatever the embedding model.

## What it does

**The RAG query can leave paths out.** `POST /query` takes `excludePaths`, a
list of globs matched against a document's path inside its input (the folder
or the repository): `requirements/**`, `**/handoffs/**`. A matching document
is neither retrieved nor added by the graph expansion. Without the field
nothing changes.

**Grounding leaves aifactory's own records out.** The grounding of a
requirement (handoff and pipeline) sends the project's `paths.requirements`,
`paths.handoffs` and `paths.runs` as `excludePaths` (`requirements/**`,
`handoffs/**`, `runs/**` by default). `rag.grounding.excludePaths` replaces
the list when a project needs another. A question asked with `factory rag
query`, and one asked on the web page, still searches everything: "what did
RQ-0044 decide" is a fair question there.

## Acceptance Criteria

- `/query` with `excludePaths: ["requirements/**"]` returns no chunk of a
  document under `requirements/`, in any source; without it the result is
  unchanged.
- A glob matches the path inside the input: `**` spans directories, `*` and
  `?` do not cross a `/`.
- The grounding request of a requirement carries the project's requirements,
  handoffs and runs paths as `excludePaths`; `rag.grounding.excludePaths`
  overrides them; `factory rag query` sends none.
- Grounding a requirement of arinc661-studio returns no `requirements/`
  file: RQ-0086 (two-state buttons) gets the project's ARINC 661 notes, the
  standard's sections and the button code; RQ-0110 (project tabs, no ARINC
  content) gets the code of its feature.
