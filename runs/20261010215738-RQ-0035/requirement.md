---
id: RQ-0035
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-10T21:56:38.035Z"
branch: "factory/RQ-0035"
createdFromCommit: "0123acfe44d851d2f3e78c93c69eab533e59b06c"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/49"
githubPullRequestIid: 49
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/48"
githubIssueIid: 48
repositoryProvider: github
---
# RQ-0035 - Embeddings on several Ollama hosts

The RAG embeds on one Ollama, `rag.embedding.baseUrl`: builder, a mini PC
whose integrated GPU does about 200 tokens a second. On 10 October the same
model (`qwen3-embedding:8b`, same digest) was started on a PC with an RTX
4060: about 1700 tokens a second, and its vectors match the stored ones
(cosine 0.998 or better on 300 chunks). There is a second PC like it. Today
only one of them can be used at a time, by pointing one process at it by
hand, and when that PC is switched off the ingest stops.

## What it does

**The embedding address is a list.** `rag.embedding.baseUrl`
(`RAG_EMBEDDING_BASE_URL`) takes one address as before, or several separated
by commas: `http://192.168.1.57:11434,http://192.168.1.3:11434`. With one
address nothing changes.

**An ingest batch is shared out.** The texts of a batch are split between the
hosts that answer, in proportion to the speed measured for each (characters a
second, averaged over its recent requests), and sent at the same time; the
vectors come back in the order of the texts. Until a host has been measured it
gets an equal share. A fast and a slow host therefore finish their parts
together, and two equal hosts halve the time. Checkpoints, batch size and duty
cycle work as they do today.

**A question goes to the fastest host that answers**, the first listed one
until speeds are known.

**A host that is away is stepped over.** When a host refuses or drops the
connection, or does not accept one within five seconds, its texts go to the
other hosts in the same batch, and the host is left out for
`rag.embedding.hostRetrySeconds` (60 by default) before it is tried again.
The ingest and the questions go on with the hosts that remain. Only when no
host answers is the request retried with the backoff used today, and it fails
after `maxRetries` naming every host. Going away and coming back are each
printed once.

**Only hosts with the same model are used.** With several hosts, each one is
asked for the digest of `rag.embedding.model` before it gets its first text,
and again after it has been away. The first listed host that answers sets the
digest; a host with another digest, or without the model, is refused with both
digests in the message and gets no text. Vectors of two different models are
never mixed in one index.

## Acceptance Criteria

- `baseUrl` with one address behaves as before: one request per batch, the
  same retries.
- With two hosts and no measured speed, a batch of 50 texts is sent as two
  requests of 25 at the same time, and the vectors are returned in the order
  of the texts.
- With measured speeds of 8 to 1, a batch of 45 is split 40 and 5; a single
  text, and every question, goes to the faster host.
- When one of two hosts refuses the connection, its texts are embedded by the
  other in the same call, the caller sees no error, the host gets no request
  for `hostRetrySeconds`, and is used again afterwards.
- When no host answers, the call is retried with backoff and fails after
  `maxRetries` with a message that names the hosts.
- A host whose model digest differs from the first host's, or that does not
  have the model, receives no text and is reported with both digests.
- A host that is switched off does not delay a question by more than the
  five-second connection limit.
- On the lab server, with the RTX 4060 PC and builder both listed, an ingest
  uses both and a question is answered while one of them is stopped.
