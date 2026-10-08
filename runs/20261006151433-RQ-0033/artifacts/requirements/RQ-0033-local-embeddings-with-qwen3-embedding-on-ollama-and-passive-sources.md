---
id: RQ-0033
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-06T15:12:39.887Z"
branch: "factory/RQ-0033"
createdFromCommit: "57c66734195fe1faea81d1146a2563292a6f0a0d"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/45"
githubPullRequestIid: 45
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/44"
githubIssueIid: 44
repositoryProvider: github
---
# RQ-0033 - Local embeddings with Qwen3-Embedding on Ollama and passive sources

The RAG embeds with Gemini (`gemini-embedding-2`, 1536). On 6 October the
prepaid Gemini credits ran out: every ingest and every question failed with
HTTP 402, so the RAG could neither learn nor answer. Embeddings move to a
model that runs in the lab, with no credits and no corpus leaving the
network: Qwen3-Embedding, the open family closest to Gemini embedding in
quality, served by Ollama on the lab machine `builder` (192.168.1.3, Ultra 9
285H, Arc 140T over Vulkan). Measured there: 0.6B ~1000 tokens/s, 4B ~310,
8B ~190; one question embeds in under 0.5 s with any of them. The one-off
re-embedding of the corpus (about 36M tokens without simics) may run against
another Ollama with the same model file (the M2 Max does 8B about five times
faster); everything after it runs on `builder`.

simics is not wanted in answers now and its chunks are from an earlier
model (bge-small, 384): it is to be kept, not deleted, and left out.

## What it does

**The Ollama adapter embeds in batches.** It posts a whole ingest batch to
`/api/embed` (one request, many inputs) instead of one `/api/embeddings`
request per chunk, waits as long as a large batch takes
(`RAG_EMBEDDING_TIMEOUT_SECONDS`, default 600), and retries a refused or
dropped connection with the existing backoff, so a restart of the Ollama host
pauses an ingest instead of failing it. `RAG_EMBEDDING_BASE_URL` names the
Ollama.

**Vectors are cut to the configured width.** Qwen3-Embedding is trained so
that the leading dimensions of a vector are a vector themselves
(Matryoshka). A vector longer than `RAG_EMBEDDING_DIMENSIONS` is cut to it and
normalised again; a shorter one is an error. The 8B model's 4096 dimensions
become at most 2000, the widest pgvector's HNSW index takes.

**Questions carry the retrieval instruction.** Qwen3-Embedding embeds a
query after an instruction and a document as it is. Questions are prefixed
with `RAG_EMBEDDING_QUERY_INSTRUCTION`; when it is unset and the model is a
Qwen3-Embedding, a default instruction for technical documents and code is
used. Documents are never prefixed.

**Changing the model re-embeds by itself.** Documents already record the
embedding provider, model and width, and one that differs is embedded again
on the next ingest without `--force`; the width's HNSW index is built at the
start of the first ingest. Nothing else changes for the switch.

**One ingest of a source at a time.** A re-embedding runs for hours from the
CLI while the service's webhook may start an ingest of the same source; two
ingests replacing the same documents leave them half written. A PostgreSQL
advisory lock per source makes the second wait for the first, across
processes.

**A filtered search finds what the filter keeps.** pgvector's HNSW scan takes
the nearest 40 chunks of the whole index and filters them afterwards. Asked of
arinc, "kac tip container var" came back empty: its 40 nearest were all Ballard
C# examples in aselsan-bfi. The search runs with `hnsw.iterative_scan =
strict_order`, so the scan goes on until the source, status and content
filters leave enough rows.

**A source can be passive.** `RAG_SOURCE_N_ENABLED=off` keeps a source's
documents, chunks, graphs and runs as they are and leaves the source out:
an ingest of it (CLI, `/ingest-runs`, webhook) is refused with a message
saying so, questions and graph and data-flow queries do not search it, and
its push webhook is ignored. `/sources/status` reports it as `passive` and
the web page shows it grey, not as a failure. Turning it back on needs no
re-ingest beyond what its own state asks for. simics is made passive.

## Acceptance Criteria

- With `RAG_EMBEDDING_PROVIDER=ollama` an ingest batch is one `/api/embed`
  request; a dropped connection is retried, not fatal.
- A 4096-wide vector is stored as `RAG_EMBEDDING_DIMENSIONS` wide (at most
  2000) and normalised; a narrower one is refused with a clear error.
- A question to a Qwen3-Embedding model is embedded with the instruction, a
  document without it; another model gets no instruction unless one is set.
- After switching the model, the next ingest re-embeds every document of the
  source without `--force` and builds the new width's index; the old
  vectors stop being searched.
- A search filtered to one source returns its top-k even when the nearest
  chunks of the whole index belong to other sources.
- A second ingest of a source, from another process, waits until the first
  has finished.
- With `RAG_SOURCE_2_ENABLED=off`, simics keeps all its rows, cannot be
  ingested, is not searched by `/query`, the graph endpoints or `/dataflow`,
  and shows as passive on the web page; `=on` brings it back.
- arinc, aselsan-bfi, renode and do178c are re-embedded with the chosen
  Qwen3-Embedding model and a question about each is answered from it, with
  `builder` serving the embeddings afterwards.
