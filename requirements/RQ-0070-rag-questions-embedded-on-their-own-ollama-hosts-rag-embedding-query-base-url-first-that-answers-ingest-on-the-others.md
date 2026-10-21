---
id: RQ-0070
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-21T08:44:02.068Z"
branch: "factory/RQ-0070"
createdFromCommit: "90377718021128907124cc37a8aac5c6e7eeb4dc"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/119"
githubPullRequestIid: 119
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/118"
githubIssueIid: 118
repositoryProvider: github
---
# RQ-0070 - RAG: questions embedded on their own Ollama hosts (RAG_EMBEDDING_QUERY_BASE_URL), first that answers, ingest on the others

The RAG embeds documents and questions with Qwen3-Embedding on two RTX 4060
PCs, BS010 (192.168.1.57) and BS011 (192.168.1.111), one list
(`RAG_EMBEDDING_BASE_URL`) for both: an ingest shares its batches between
them and a question goes to the faster. A long ingest (simics, C files again
after RQ-0064) then keeps both cards busy while people ask. Batur wants the
ingest on BS010 and the questions on BS011 (21 October 2026).

## What it does

- `RAG_EMBEDDING_QUERY_BASE_URL` (`rag.embedding.queryBaseUrl`): the hosts that
  embed questions, in order. A question goes to the first host that answers,
  the next one when it is away or answers with a server error, in the same
  call; a host stepped over pauses for `RAG_EMBEDDING_HOST_RETRY_SECONDS` as
  before. Speed does not reorder this list.
- Empty, questions share `RAG_EMBEDDING_BASE_URL` as they did.
- Documents keep `RAG_EMBEDDING_BASE_URL`, shared out by speed.
- A host in both lists is one host (speed, pause, digest). The model digest is
  checked on every host either list names, also when the document list has
  one host only.
- `/models` (and the web page's model list) says for each host what it is
  used for: `documents`, `questions` or `both`, when the question list is set.
- On the server: `RAG_EMBEDDING_BASE_URL=http://192.168.1.57:11434` and
  `RAG_EMBEDDING_QUERY_BASE_URL=http://192.168.1.111:11434,http://192.168.1.57:11434`
  (BS010 last for questions, so BS011 away does not stop them).

## Acceptance Criteria

- Documents go to the document hosts only; a question goes to the first
  question host even when another is measured faster.
- A question host that is away hands the question to the next in the same
  call, and gets questions again once its pause is over.
- A question host with another model digest is refused, though the document
  list has one host.
- Without the question list a question shares the document hosts as before.
- The report says ingest, questions or both per host.
