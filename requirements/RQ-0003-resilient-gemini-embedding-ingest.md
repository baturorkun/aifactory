# RQ-0003 - Resilient Gemini Embedding Ingest

## Goal

Allow large RAG documents to survive transient Gemini API rate limits without restarting all embedding work for the document.

## Requirements

- Use Gemini `batchEmbedContents` for document chunks and preserve `embedContent` for query embeddings.
- Apply the configured RAG ingest `batchSize` when submitting and persisting document embeddings.
- Retry HTTP 408, 429, 500, 502, 503, and 504 responses with bounded exponential backoff and random jitter.
- Honor an HTTP `Retry-After` value or Gemini `retryDelay` detail when supplied.
- Apply a configurable minimum interval between Gemini HTTP requests.
- Print retry attempt, maximum attempts, status, delay, and Gemini error message without exposing the API key.
- Include the Gemini response error code/message in the final failure rather than only the generic HTTP status.
- Persist successfully embedded chunk batches as non-queryable checkpoints.
- Mark the document and all of its chunks active only after every expected chunk is stored.
- Resume compatible checkpoints when the source content hash and chunking configuration are unchanged.
- Restart checkpoints when `--force`, source content, chunk size, or chunk overlap changes.
- Ensure queries cannot retrieve partially ingested documents or checkpoint chunks.

## Acceptance Criteria

- Multiple chunks are sent through `batchEmbedContents`, not one REST request per chunk.
- A transient 429 is retried and can complete without failing the file.
- Retry delay honors server guidance and otherwise grows exponentially with jitter up to the configured maximum.
- If retries are exhausted, a subsequent ingest resumes after completed chunk batches.
- Returned embedding count and dimensions are validated before persistence.
- Existing OpenAI and Ollama providers continue to work with configured chunk batches.
- Python syntax, TypeScript typecheck, and focused adapter/checkpoint tests pass.
