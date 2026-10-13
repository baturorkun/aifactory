---
id: RQ-0039
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-13T15:04:04.099Z"
branch: "factory/RQ-0039"
createdFromCommit: "197097ef8842e4b0c4e901c815b67131b02499c5"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/57"
githubPullRequestIid: 57
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/56"
githubIssueIid: 56
repositoryProvider: github
---
# RQ-0039 - A requirement is compared with the project's DOORS requirements

Since RQ-0037 a RAG source can hold the requirements of a project's DOORS
modules, and since RQ-0038 one of them is found by its identifier. A project
that grounds its requirements on such a source already gets the nearest of
them into the context its agents work from. Nothing compares the two: whether
a factory requirement implements a DOORS requirement, or says something a
DOORS requirement forbids, is left to whoever happens to read the grounding
text. In a DO-178C project that link is the first thing a reviewer asks for.

## What it does

**A second question at grounding, for projects that ask for it.** With
`rag.grounding.compare.enabled` (off by default), every time a requirement is
grounded (when its handoff package is created at submit, and when a pipeline
run starts) the factory asks the project's RAG endpoint once more: the same
requirement, compared with requirements only. The request carries the
grounding's source IDs and excluded paths, and leaves out the content types
of `rag.grounding.compare.excludeContentTypes` (`documentation` and `code` by
default), so what comes back are the requirement chunks.

**The question has a fixed form.** It asks for a line `IMPLEMENTS:` with the
identifiers of the requirements the factory requirement implements or refines,
a line `CONFLICTS:` with those it contradicts, each `none` when there is none,
and then for the reasons and for the parts of the factory requirement that no
requirement covers.

**Only identifiers the RAG returned are kept.** An identifier on those lines
counts when one of the returned sources is a chunk of that requirement;
whatever else the model names is listed apart as unverified. With no
requirement chunk among the sources the comparison says that the project's sources
hold no requirements, and nothing more.

**The result goes where the grounding goes.** It is stored with it
(`rag-context.json`, under `comparison`), written into the handoff under the
grounding and given to the agents with it, and summed up in one line when the
package is created: what the requirement implements, and what it conflicts
with. `factory approve` prints the conflicts of the run it approves.

**It warns and does not block.** A conflict does not fail the submit, the run
or the approval. A RAG that does not answer the second question leaves the
grounding as it is and the comparison marked unavailable, whatever
`rag.grounding.failOpen` says.

**On demand while writing.** `factory requirement compare <reqId>` asks the same
question for a requirement in any state and prints the result. It creates no
run and changes no file.

## Not covered

- Writing the identifiers into the requirement file, and a traceability
  matrix over all requirements.
- A gate that refuses a requirement with a conflict.
- Comparing a requirement with the project's other factory requirements.

## Acceptance Criteria

- With `compare.enabled` off, grounding sends one request and its outputs are
  what they were.
- With it on, a second request is sent with the grounding's `sourceIds` and
  excluded paths and with `excludeContentTypes: ["documentation", "code"]`; its
  question holds the requirement's text and asks for the `IMPLEMENTS:` and
  `CONFLICTS:` lines.
- From an answer with `IMPLEMENTS: BFI-SRS-1296, BFI-SRS-9999` and
  `CONFLICTS: none`, whose sources hold a chunk of `BFI-SRS-1296` only, the
  comparison keeps `BFI-SRS-1296` as implemented, lists `BFI-SRS-9999` as
  unverified and has no conflict. `**Implements:**` in bold or other letter
  case is read the same; an identifier is matched whatever its letter case.
- With no source that is a requirement chunk, the comparison says the sources hold
  no requirements and names no identifier, whatever the answer says.
- `rag-context.json` holds the comparison; the handoff shows it under the
  grounding with its implemented, conflicting and unverified identifiers and
  the answer's text; creating the package prints its one-line summary.
- A failing second request leaves the grounding in the package, marks the
  comparison unavailable with the reason, and fails nothing, also with
  `failOpen: false`.
- `factory approve` prints the conflicts recorded for the run and approves it.
- `factory requirement compare <reqId>` prints the comparison of a draft
  requirement
  and leaves the working tree as it was; without grounding or the
  comparison configured it says which setting is missing.
- On the lab RAG, the comparison of a requirement that names `BFI-SRS-1296` and
  restates what it requires lists `BFI-SRS-1296` as implemented.
