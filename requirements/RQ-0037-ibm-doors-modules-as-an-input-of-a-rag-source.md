---
id: RQ-0037
status: completed
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-12T17:16:46.168Z"
branch: "factory/RQ-0037"
createdFromCommit: "7035faa99625a40b335489b22e78ea866631f86b"
completedRunId: "20261013134523-RQ-0037"
completedBy: "Batur Orkun"
completedAt: "2026-10-13T13:46:18.364Z"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/53"
githubPullRequestIid: 53
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/52"
githubIssueIid: 52
repositoryProvider: github
---
# RQ-0037 - IBM DOORS modules as an input of a RAG source

The requirements of the lab's projects are written in IBM DOORS (classic,
9.7). A RAG source holds a project's documents (its folder) and its code (its
GitLab repositories), but not the requirements themselves: a question about
what the software must do is answered from a PDF export somebody made once, or
not at all. DOORS classic has no web interface; its data comes out through a
DOORS client running a DXL script. On 12 October a trial export of one module
(974 objects) took five seconds through the client of a lab PC, started over
SSH.

## What it does

**A source gets DOORS entries**, next to its folder and its repositories, as
numbered entries in `.env` under the slot's prefix:

```
RAG_SOURCE_3_DOORS_1_SERVER=192.168.2.101
RAG_SOURCE_3_DOORS_1_SSH_USER='LAB\rag'
RAG_SOURCE_3_DOORS_1_USER=reader
RAG_SOURCE_3_DOORS_1_PASSWORD=...
RAG_SOURCE_3_DOORS_1_PATHS='["/PROJECT"]'
RAG_SOURCE_3_DOORS_1_EXCLUDE='["**/TEMPLATES/**"]'
```

`SERVER` (the DOORS server's address, with `:port` when it is not 36677),
`USER` and `PASSWORD` (the DOORS login) are required. `PATHS` are projects,
folders or modules of the database (everything when it is left out);
`EXCLUDE` are globs matched against a module's full name. A source without such an entry
behaves as before. The configuration keeps the name of the password variable,
never the password.

**The export runs on the DOORS server's own DOORS client, reached over SSH.**
One address serves both: the service logs in to `SERVER` as `SSH_USER`, and
the client there opens the database of the same machine. At an ingest the
service copies two DXL scripts and a runner to it, starts `doors.exe` in batch
mode, once to list the formal modules under `PATHS` and once to export the
ones `EXCLUDE` leaves, fetches the result and removes its working directory,
whether the export succeeded or not. The scripts only read.

**Other PCs can do the export instead.** When the client cannot be on the
server, `rag.doors.clients` (`RAG_DOORS_CLIENTS`) lists the Windows PCs that
have one, as SSH destinations separated by commas; the first that answers
exports. One that cannot be reached is stepped over; a DOORS error (a wrong or
expired password, a path that does not exist) is not tried again on the next,
so a wrong password costs one login.

**A module is one document, a requirement is one chunk.** The export is a
UTF-8 file of JSON lines, `<module>.doors.jsonl`: the module, then every
object with its identifier, number, level, heading, text, attributes and
links. The chunker (`doors-v1`) makes one chunk per object that has text,
headed by the module and the headings above it and carrying the object's
identifier; a table becomes one chunk, row by row. The object's own attributes
(verification method, type, allocation and the like) and its links are
written under the text; DOORS's bookkeeping attributes (created, modified,
table borders, OLE) are left out. The vector is made from the heading and the
text only: a dozen attribute lines that hardly differ from one requirement to
the next would otherwise outweigh a requirement of one sentence.

**Answers cite the requirement**: `DOORS <module> <identifier>`, with the
heading it sits under. The chunks are labelled `contentType: requirements`,
so a project can leave them out of, or keep only them in, its grounding.

**Changes follow the module.** A module whose export is byte for byte what it
was is skipped; a changed one is chunked and embedded again; a module that is
gone from DOORS, or no longer selected, has its document retired. When the
export fails, for whatever reason, the entry is reported as an input error
and its documents stay as they were.

**An export file in a folder or a repository is read the same way.** The
parser is separate from the transport: a `*.doors.jsonl` file made by hand
with the same DXL script is chunked per requirement wherever it lies.

**The status page shows the entry** with the server, the paths, the number
of modules and when it was last checked.

## Not covered

- Pictures and OLE objects embedded in a requirement.
- Baselines: the current version of a module is read.
- Re-embedding only the changed requirements of a module; a changed module is
  embedded as a whole (about a thousand short chunks, well under a minute).
- A schedule: the DOORS entries are read when the source is ingested.
- DOORS Next and DOORS Web Access.

## Acceptance Criteria

- A slot with `DOORS_1_SERVER`, `_USER` and `_PASSWORD` loads as a source
  with one DOORS entry that names the password variable and not its value; an
  entry without one of the three, two entries of a slot with the same
  server, a `SERVER` that is not an address, or a `PATHS` or `EXCLUDE` that is
  not a JSON array of strings is refused with a message naming the variable.
- Without `RAG_DOORS_CLIENTS` the export runs on `SERVER` itself, logged in as
  `SSH_USER`; a server without a DOORS client is reported as such.
- An export with a heading, two requirements under it and a table of two rows
  gives three chunks: each requirement with its identifier, the heading above
  it and its attributes, the table with its rows; the bookkeeping attributes
  appear in none of them, and the text sent to the embedding model has no
  attribute lines.
- A requirement longer than the chunk size is split into parts that each carry
  the heading and the identifier.
- A file that is not a DOORS export (no module line first, or a line that is
  not JSON) fails with a message naming the line.
- With two clients named and the first one refusing the connection, the
  export runs on the second; with a DOORS login error on the first, the second
  is not contacted and the error text of DOORS is in the message.
- The client's working directory is removed after a successful export and
  after a failed one.
- Modules matched by `EXCLUDE` are listed but not exported.
- A second sync of unchanged modules leaves the mirrored files untouched (same
  modification time), and a module no longer listed is removed from the
  mirror.
- A fetched export whose object count differs from what the script reported
  is refused and the mirror is left as it was.
- The citation of a DOORS chunk reads `DOORS <module> <identifier>`.
- The source status lists a DOORS entry with kind `doors`, its database and
  its paths.
- On the lab server, a source with one DOORS entry ingests the modules of a
  project of the DOORS server 192.168.2.101, a question about one of its
  requirements is answered with the requirement's identifier, and nothing is
  left on the machine that exported afterwards.
