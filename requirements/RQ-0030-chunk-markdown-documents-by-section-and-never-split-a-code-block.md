---
id: RQ-0030
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-03T21:29:47.512Z"
branch: "factory/RQ-0030"
createdFromCommit: "505c37e310a19b5513660ee566b19f34dd7e5226"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/39"
githubPullRequestIid: 39
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/38"
githubIssueIid: 38
repositoryProvider: github
---
# RQ-0030 - Chunk Markdown documents by section and never split a code block

Markdown documents are cut every 1200 characters like any text, whatever
their structure. Asked how to run the twin with its debug port open, the RAG
could only quote the last two lines of the `docker run` command in
`bfi-sumilator/twin/README.md`: the section "5. Debugging with GDB" was cut in
the middle of that command, its heading and the start of the command in one
chunk, the end of the command and the explanation in the next, and the
question matched the second. Code is already chunked by symbol (RQ-0023);
Markdown needs the same respect for its structure.

## What it does

**A Markdown file is chunked by section.** Every ATX heading (`#` to `######`)
outside a fenced code block starts a section; a section runs to the next
heading of any level. Text before the first heading is a section of its own.

**A fenced code block is never split.** Lines between an opening fence
(```` ``` ```` or `~~~`) and its closing fence stay in one chunk, and a `#`
inside a code block is not a heading. A single code block larger than four
times the chunk size is the only exception; it is split at line ends and each
part reopens the fence.

**Each chunk names where it is.** The chunk starts with the file and the
heading path, e.g. `twin/README.md > 5. Debugging with GDB`, so a question
about "the debug port" meets the section that answers it. The chunk metadata
records the section path, the heading level and the start and end line, and
citations show them.

**A long section is split between paragraphs.** A section longer than the
chunk size is packed paragraph by paragraph (and code block by code block)
into parts up to the chunk size; every part carries the same heading path.

**Only Markdown changes.** `.md` and `.markdown` files get the new chunker and
are re-chunked once on their next ingest (the chunker version joins the
comparison, as in RQ-0023); PDF, Office and `.rst` files are untouched. The
documents stay `contentType: documentation`.

## Acceptance Criteria

- The twin README's "5. Debugging with GDB" section, with its whole
  `docker run` command, is one chunk headed by its file and heading path.
- No chunk boundary falls inside a fenced code block shorter than four chunk
  sizes; a `#` line inside a code block does not start a section.
- A section longer than the chunk size is split between paragraphs, and every
  part carries the heading path.
- Chunks record the section path and line range, and citations show them.
- Existing Markdown documents are re-chunked on the next ingest without
  `--force`; other document types are not re-embedded.
- Asked how to run the twin with the debug port open, the RAG answers with
  the complete `docker run` command.
