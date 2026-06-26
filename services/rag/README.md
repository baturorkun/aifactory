# AI Factory RAG Service

Python FastAPI + LlamaIndex RAG service used by `pnpm factory rag ...`.

## Install Python Dependencies

```bash
cd aifactory
python3 -m pip install -e services/rag
```

Use `AIFACTORY_RAG_PYTHON=/path/to/python` when the RAG service dependencies are installed in a specific virtual environment.

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
