# AI Factory RAG Service

Python FastAPI + LlamaIndex RAG service used by `pnpm factory rag ...`.

## Install Python Dependencies

```bash
cd aifactory
pnpm factory rag install
```

This creates `.venv-rag/` automatically and installs the Python service there.
Use `AIFACTORY_RAG_PYTHON=/path/to/python` only when you want to provide your own Python environment.

## Start PostgreSQL + pgvector

```bash
pnpm factory rag env up
pnpm factory rag db migrate
```

AI Factory does not install Docker/Podman and does not manage `podman machine`. It only uses an already working `podman compose` or `docker compose` runtime.

## Configure Sources

Add a mounted fileserver path to `factory.config.json`:

```json
{
  "rag": {
    "sources": [
      {
        "id": "fileserver",
        "type": "filesystem",
        "rootPath": "/mnt/company-share/docs",
        "include": ["**/*.txt", "**/*.md", "**/*.json", "**/*.csv", "**/*.html", "**/*.htm", "**/*.pdf", "**/*.docx", "**/*.pptx"],
        "exclude": ["**/~$*", "**/.DS_Store"]
      }
    ]
  }
}
```

Set secrets in `.env`:

```bash
RAG_DATABASE_URL=postgresql://aifactory_rag:aifactory_rag@localhost:5432/aifactory_rag
RAG_FILESERVER_PATH=/mnt/company-share/docs
RAG_EMBEDDING_PROVIDER=gemini
RAG_EMBEDDING_MODEL=gemini-embedding-001
RAG_LLM_PROVIDER=gemini
RAG_LLM_MODEL=gemini-2.5-flash
RAG_API_KEY=replace_me
```

## Ingest And Query

```bash
pnpm factory rag ingest --source fileserver
pnpm factory rag status
pnpm factory rag api start
```

To ingest only one directory below a configured source root, pass a source-relative path:

```bash
pnpm factory rag ingest --source arinc --subdir "ARINC 661"
```

The filter is recursive. Document identities remain relative to the configured source root, and deletion detection is limited to the selected subdirectory.

Gemini document embeddings use `batchEmbedContents`, the configured `rag.ingest.batchSize`, and bounded retry/backoff for transient rate-limit and service errors. The optional tuning fields are:

```json
{
  "rag": {
    "embedding": {
      "maxRetries": 6,
      "retryBaseSeconds": 2,
      "retryMaxSeconds": 60,
      "minRequestIntervalSeconds": 1
    }
  }
}
```

Completed chunk batches are checkpointed in PostgreSQL. Re-running the same source file resumes compatible checkpoints unless `--force`, file content, or chunking settings changed.

FastAPI exposes:

- `GET /health`
- `POST /query`
- `POST /ingest-runs`
- `GET /ingest-runs/{id}`
- `GET /sources`
- `GET /documents`

`POST /query` accepts an optional `sourceIds` array. When supplied, retrieval is
limited to those configured sources.

## Project-Configured Grounding

The AI Factory root config holds shared connection settings:

```json
{
  "rag": {
    "grounding": {
      "enabled": false,
      "chatUrl": "${RAG_CHAT_URL:-http://192.168.1.2:8765/query}",
      "timeoutMs": 120000,
      "failOpen": true,
      "maxContextChars": 12000
    }
  }
}
```

Consumer projects inherit those values and enable grounding with their own
source and agent selection:

```json
{
  "rag": {
    "grounding": {
      "enabled": true,
      "mode": "always",
      "marker": "@rag",
      "sourceIds": ["arinc"],
      "agents": ["planner", "architect", "coder", "domain-guard"],
      "queryPrefix": "Answer using the project's domain documentation."
    }
  }
}
```

Use `mode: "explicit"` to query RAG only when the requirement contains the
configured marker. `mode: "always"` queries it for every non-dry-run
requirement. The response is saved as `rag-context.json` under the run directory.

Ask the configured remote endpoint directly with:

```bash
pnpm factory rag chat "What are the GpTriangleFan parameters?"
```

## Run As An Ubuntu Service

Install and immediately start a boot-enabled systemd service:

```bash
pnpm factory rag api service install --host 0.0.0.0 --port 8765
```

The install command uses `sudo` when required. It loads the project `.env`,
uses `.venv-rag`, and runs the API directly with Python. The PostgreSQL
container uses `restart: unless-stopped` so it also returns after a reboot
when the container runtime starts.

The default bind address is `127.0.0.1`. Binding to `0.0.0.0` exposes the API
to the server network, so protect it with configured authentication, a reverse
proxy, or firewall rules.

```bash
pnpm factory rag api service status
pnpm factory rag api service logs
pnpm factory rag api service logs --follow
pnpm factory rag api service restart
pnpm factory rag api service stop
pnpm factory rag api service start
pnpm factory rag api service uninstall
```

Use `--user <linux-user>` during install when the service should run as a
different Linux account. That account must be able to read the repository,
`.env`, and mounted fileserver paths.
