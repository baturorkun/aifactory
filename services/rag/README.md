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

FastAPI exposes:

- `GET /health`
- `POST /query`
- `POST /ingest-runs`
- `GET /ingest-runs/{id}`
- `GET /sources`
- `GET /documents`

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
