---
id: RQ-0052
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-19T12:30:47.691Z"
branch: "factory/RQ-0052"
createdFromCommit: "0faaf65ca50622e8d270648f2b8765d200f2d653"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/83"
githubPullRequestIid: 83
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/82"
githubIssueIid: 82
repositoryProvider: github
---
# RQ-0052 - Coding standards: import a standard document into rules and groups, a coding-standards RAG source, and a project's chosen groups

Some C projects must follow a coding standard. Bytecraft has one, 5001-K-CSTD
(Rev.AA, May 2026, written for the ASELSAN BFI under DO-178C DAL A): 147 C
rules and 17 assembly rules in a Word document, each with its class, a
rationale naming its source (104 cite a MISRA C:2025 rule), an example and
notes. bfi-sw checks it with its own checker; nothing outside bfi-sw can use
it. Batur (19 October) wants the standard to come into aifactory as groups a
project chooses from — "this project: the Bytecraft rules and MISRA; another:
DO-178C" — read from the Word document, searchable in RAG, and put in front
of the agent in every requirement.

The groups are tags on rules, so a rule may be in several (C-002 is MISRA
2.1 and DO-178C A-7): `misra` C-001..C-107 (each with its MISRA rule),
`bytecraft` C-108..C-147 (house style, no external reference), `do178c`
C-001..C-009 (what DO-178C asks of the code: no undefined behaviour, no dead
or unreachable code, nothing unused), `arm-m3` A-001..A-017 (Cortex-M3
assembly). A profile says how strictly: `default` keeps the MISRA categories;
`dal-a` makes every rule mandatory and every waiver approved.

## What it does

- `factory standard import <document.docx> --id <id> --revision <rev> --group <name>=<ranges>...`
  reads the standard's rule tables (the "Table N - … | C-045 | Safety | …"
  caption and the Rule / Description / Rationale / Example / Notes table
  under it, both caption forms) and writes `standards/<id>/`:
  `rules.json` (every rule: id, class, secondary class, description,
  rationale, the MISRA rule it cites, example, notes, groups; the source
  document's path, sha256 and revision; counts), one `<group>.rules.md` per
  group (a `## <id>` section per rule, with its fields) and `index.md` (id
  and one line per rule, with its groups). A rule in no group, a group range
  outside the document, or an id the document repeats is refused with the
  ids. The generated files are committed; the document stays where it is.
  When a caption id repeats within a prefix and the captions' rule sequence
  runs without a gap, the sequence decides and the import lists what it
  renumbered in `rules.json` (`warnings`) and on the console: 5001-K-CSTD
  Rev.AA captions two assembly rules A-004 and six A-011 while its rule
  sequence (148 … 164) and its Rule-to-Objective matrix number them
  A-001 … A-017. A repeat the sequence cannot settle is refused.
- The RAG ingest chunks a `*.rules.md` file one rule per chunk, with
  `rule_id`, `standard`, `groups`, `class` and `misra` in the chunk metadata,
  so "what does C-045 say" or "the essential type assignment rule" returns
  one rule. A `coding-standards` source (slot 8: `standards/` of the
  deployed aifactory on the RAG server, `rules.json` left out) holds the
  generated files. A rule id in a question (`C-045`: one letter, a dash,
  digits) counts as an identifier the retriever looks up (RQ-0038 took two
  letters), so "what does C-045 say" returns that rule's chunk first.
- `factory new <name> --template c|embedded --standard <id> --groups a,b [--profile default|dal-a]`
  writes `coding-standard/standard.json` (`id`, `version`, `groups`,
  `profile`, the rule count) and an empty `coding-standard/waivers.yaml`
  (the waiver fields 5001-K-CSTD asks for: rule_id, file, line, rationale,
  reviewer, review_date, waiver_id, validity), adds `coding-standards` to the
  project's `RAG_SOURCE_IDS`, excludes the other groups' `*.rules.md` from
  its retrieval (`rag.grounding.excludePaths`), and gives AGENTS.md a
  section: the standard, its groups and profile, write to the rules, record
  a violation you cannot avoid in `waivers.yaml` with its rationale, never
  silence a finding. An unknown standard or group is refused with the
  choices; `--groups` without `--standard` is refused.
- A project made before it had a standard, or changing its groups or
  profile, runs `factory standard use <id> --groups a,b [--profile …]` from
  its root: the same files and settings, and the AGENTS.md section added or
  replaced. embedded1 takes cstd with `misra` and `bytecraft` this way.
- A requirement of such a project gets a "Coding standard" section in its
  draft, and its handoff package carries `coding-standard/index.md` reduced
  to the project's groups, so the rule list is in front of the agent (the
  full text comes from RAG).
- The gate that checks the rules (cppcheck's MISRA addon first) is the next
  requirement; this one gives it `standard.json` and `rules.json` to read.

## Acceptance Criteria

- `standard import` on 5001-K-CSTD Rev.AA (the file server's
  `4. ENGINEERING/Draft Documents/Ready For Formal Review/Coding Std/5001-K-CSTD.docx`,
  byte-identical to bfi-sw's `Documents/CSTD/5001-K-CSTD.docx`) with the four
  groups above yields 164 rules (147 C, 17 A), 104 with a MISRA rule, and
  the four `*.rules.md` files; a second import yields identical files.
- A `*.rules.md` ingests one chunk per rule with the metadata above.
- `factory new x --template c --standard cstd --groups misra,bytecraft`
  produces `standard.json` with 147 rules, excludes `do178c.rules.md` and
  `arm-m3.rules.md` from retrieval, and an AGENTS.md section naming both
  groups; `--groups misra,do178c` counts C-001..C-009 once (107 rules).
- `factory standard use std --groups misra` in a project made without a
  standard writes the same files, adds `coding-standards` after the sources
  `.env` already names, and adds the AGENTS.md section once; a second use
  with other groups replaces the choice and the section.
- `requirement new` in that project drafts the "Coding standard" section;
  `handoff` writes `index.md` with only the chosen groups' rules.
- `standards/cstd/` is committed in aifactory (its `source.path` the file
  server's document) and ingested as `coding-standards` on the RAG server;
  "What does rule C-045 say" is answered from that rule's chunk, found by
  its identifier, naming MISRA 10.3.
