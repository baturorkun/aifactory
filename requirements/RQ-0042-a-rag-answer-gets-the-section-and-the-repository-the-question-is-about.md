---
id: RQ-0042
status: draft
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-16T14:18:42.832Z"
branch: "factory/RQ-0042"
createdFromCommit: "f9a227cac8be5ff7cf9deca546006f13f7bc78ca"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/63"
githubPullRequestIid: 63
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/62"
githubIssueIid: 62
repositoryProvider: github
---
# RQ-0042 - A RAG answer gets the section and the repository the question is about

On the RAG page (2026-10-16) the question "bfi-simulator kodunda arinc 429 ip
davranislari nasil" got the answer that the sources were not enough: of the
hardware-twin repository it had one chunk, the heading line of the developer
guide's "ARINC 429 in: UDP 5429" section and nothing under it, and none of
the 37 chunks of `peripherals/A429Lite.cs`, the model the question is about.
The rest of the context was the prototype's 2026.09.11 source code, which the
answer rightly set aside. The knowledge was in the database; three things kept
it out of the answer.

1. **A part that is only a heading.** The markdown chunker packs a section's
   blocks greedily, the heading first. When the next block does not fit
   beside the heading (a paragraph or a table near or over the budget, a code
   block), the first part is closed with the heading alone. That part is
   nearly the question's own words, so it ranks high, and it carries nothing
   (`docs/twin-developer-guide.md`, section "ARINC 429 in: UDP 5429": part 1
   is line 126, 148 characters; the body is part 2, lines 128-143).
2. **A hit without the rest of its section.** A section split into parts
   reaches the answer one part at a time; the parts beside a hit are not
   brought in.
3. **A named repository counts for nothing.** One top-k over every source,
   ranked by the embedding alone: a question in Turkish about a C# file loses
   to documents that share its words, and the repository the question names
   does not change what is searched.

## What changes

**No heading-only parts.** A section's heading always shares its part with
the section's first content: when the first content block does not fit
beside the heading, the heading goes into the part that holds it (that part
may then exceed the budget by the heading's length), and a block that has to
be split carries the heading in its first piece. A section with nothing under
its heading stays one chunk. The chunker's version changes, so markdown is
re-chunked once on the next ingest.

**A hit brings its section along.** When a retrieved chunk is one part of a
section split into parts, the other parts of that section, from the same
document, are added to the context beside it, nearest first, up to a few
(configurable) and within the answer's chunk budget; a part already retrieved
is not added twice, and excluded paths and content types stay excluded.

**A question that names a repository searches it.** When the question names
a repository the sources hold (its project path's last segment, or close to
it: a name of 8 or more characters may differ by up to two letters, so
"bfi-simulator" names `hardware-twin/bfi-sumilator`), a second search
restricted to that repository runs beside the general one, and its best
chunks take a share of the answer's places (half of top-k at most), code and
documentation alike. Without such a name nothing changes. The answer's
sources say which repository was searched this way.

## Not covered

- A reranker, query rewriting or translation.
- Per-source quotas in general.
- Scoping by anything other than a repository's name (a file, a symbol).

## Acceptance Criteria

- The markdown chunker never emits a part that holds only a heading: a section whose first block does not fit beside its heading puts both in one part; a section with only a heading is one chunk; the chunker version changes and markdown is re-chunked once.
- A retrieved part of a split section brings the section's other parts from the same document into the context, nearest first, up to the configured number, without duplicates and without bringing back excluded paths or content types.
- A question that names a repository of the sources (exactly or within two letters for names of 8 characters or more) also searches that repository, and up to half of top-k of the context comes from it; a question that names none is answered as before.
- Tests cover the three, including the `docs/twin-developer-guide.md` "ARINC 429 in: UDP 5429" case and the name "bfi-simulator" matching `hardware-twin/bfi-sumilator`.
- On the lab server, after a re-ingest of the hardware-twin repository, "bfi-simulator kodunda arinc 429 ip davranislari nasil" is answered from `peripherals/A429Lite.cs` and the guide's section body.
- Existing checks still pass.
