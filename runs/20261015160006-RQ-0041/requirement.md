---
id: RQ-0041
status: ready
executionMode: handoff
pipelineFast: false
createdByName: "Batur Orkun"
createdByEmail: "batur@bc.int"
createdAt: "2026-10-15T15:59:44.287Z"
branch: "factory/RQ-0041"
createdFromCommit: "df94922ac9fcfbe4c5db2e83efa6163f8b6a59d2"
githubPullRequestUrl: "https://github.com/baturorkun/aifactory/pull/61"
githubPullRequestIid: 61
githubIssueUrl: "https://github.com/baturorkun/aifactory/issues/60"
githubIssueIid: 60
repositoryProvider: github
---
# RQ-0041 - An answer on the RAG page can be shared by its link

A question asked on the RAG page, and its answer, live in the asker's browser
(the chat history is local storage) and in the service's `rag_queries` table.
To show a colleague an answer, the only way is to copy its text, which loses
its sources, or to have them ask the same question again, which costs another
answer and may not give the same one.

## What it does

**Every answer gets a share identifier.** When the service records a question
and its answer, it gives the record a random identifier (a UUID, so that the
links cannot be counted through) and returns it with the answer as `shareId`.
Answers recorded before this have none and cannot be shared.

**The service gives a shared answer back.** `GET /queries/<shareId>` returns
the question, the answer, its sources and when it was asked, exactly as they
were recorded; an identifier that is not a UUID or not known gets 404.

**The page offers the link.** Under an answer with a share identifier a "Copy
link" button puts `<page address>/?answer=<shareId>` on the clipboard and says
that it did. The identifier is kept with the answer in the local chat history,
so the button is there again after a reload.

**The page opens a shared answer.** Opened with `?answer=<shareId>`, the page
fetches the answer and shows the question, the answer and its sources as a
chat of its own, without asking anything; if that chat is already in the
browser's history it is opened instead of a second copy. The parameter is then
taken off the address, so a reload does not open it again. An answer that
cannot be found is said so in the chat.

## Not covered

- Links that expire, or a list of shared answers.
- Sharing a whole chat of several questions.
- Anything beyond the page's own access: whoever can open the page can open
  the link.

## Acceptance Criteria

- An answered question is recorded with a random share identifier, and the
  answer the service returns carries it as `shareId`.
- `GET /queries/<shareId>` returns the recorded question, answer, sources and
  time; an unknown identifier, an invalid one, and an answer recorded before
  this change get 404.
- The migration that adds the identifier can be run twice and does not rewrite
  the table's rows.
- On the page, an answer with a share identifier has a "Copy link" button that
  copies `<origin>/?answer=<shareId>`; after a reload the button is still there.
- Opening the page with `?answer=<shareId>` shows that question and answer with
  its sources without a new question to the service, takes the parameter off
  the address, and opening it twice does not make two chats.
- On the lab server, a link copied from one answer opens the same answer in a
  new browser profile.
