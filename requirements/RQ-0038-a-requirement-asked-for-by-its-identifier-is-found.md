---
id: RQ-0038
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-13T14:18:19.555Z"
branch: "factory/RQ-0038"
createdFromCommit: "8b867cd0305376c530f46ba8797b9930d20f6727"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/55"
githubPullRequestIid: 55
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/54"
githubIssueIid: 54
repositoryProvider: github
---
# RQ-0038 - A requirement asked for by its identifier is found

Since RQ-0037 a source holds the requirements of its DOORS modules, one chunk
each, labelled with the requirement's identifier (`BFI-SRS-1296`). Asked by
what it says, a requirement is found: on the lab database, 150 requirements
asked for by their own sentence were all in the top 12. Asked by its
identifier, it is not: "BFI-SRS-1296 ne diyor?" brought the requirement into
the top 12 for 3 of the 150. The search is by meaning, and a number means
nothing to an embedding model; the nearest chunks of an identifier are other
chunks that carry identifiers.

People do ask that way, and so will the factory: a requirement that says
"implements BFI-SRS-1296" has to be grounded on that requirement, not on
twelve others.

## What it does

**An identifier in the question is looked up, not searched for.** Before the
vector search, the question is read for tokens that can be identifiers: a
word with a letter and a digit in it, with `-`, `_` or `.` between its parts
(`BFI-SRS-1296`, `BFI_HLR_235`, `REQ12`). Each is looked up, whatever its
letter case, among the requirement labels of the chunks the question may
search: the same sources, content types and paths as the vector search, active
chunks of the current embedding width only. A token that is no requirement's
identifier (`DO-178C`, `LS1043A`) matches nothing and costs one indexed
lookup.

**What is found comes first.** The chunks found by identifier head the
result, in the order the identifiers appear in the question; a requirement
split into parts comes with all its parts, a requirement that two modules
both hold comes from both. The vector search fills the rest up to
`rag.retrieval.topK`, without repeating a chunk. With more identifiers than
`topK` the first `topK` chunks are returned. A chunk found by identifier is
not subject to `rag.retrieval.minScore`, and the answer's source list marks it
as found by identifier.

**A question without an identifier is answered as before**, with the same
statements and the same result.

## Not covered

- Identifiers with a space in them.
- Identifiers that only occur in a document's text (a PDF that mentions
  `BFI-SRS-1296`): only the label of a requirement chunk is looked up.
- Keyword search in general; this is the lookup of one label.

## Acceptance Criteria

- "BFI-SRS-1296 ne diyor?" returns the chunk labelled `BFI-SRS-1296` first,
  followed by vector results, `topK` chunks in all and none of them twice.
- `bfi-srs-1296` in the question finds the chunk labelled `BFI-SRS-1296`.
- A question naming two identifiers returns their chunks in the order of the
  question, before any other chunk; one of the two that does not exist does
  not change that.
- A requirement of three parts is returned with its three parts, in order.
- With `sourceIds` set, an identifier that exists only in another source is
  not returned; with `excludeContentTypes: ["requirements"]` no chunk is
  returned by identifier.
- With `minScore` set above every vector score, the chunk found by identifier
  is still returned.
- A question with no such token runs the statements it ran before and no
  other.
- `DO-178C`, `LS1043A`, `v2.3` and `3.5.1` in a question are harmless: the
  first two are looked up and match nothing, the last two are not looked up.
- The lookup uses an index on the requirement label; the migration that adds
  it can be run twice.
- On the lab server, of 150 requirements drawn at random and asked for by
  identifier alone, at least 148 come back first.
