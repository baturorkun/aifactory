# AI Factory RAG Service

Python FastAPI + LlamaIndex RAG service used by `pnpm factory rag ...`.

## Install Python Dependencies

```bash
cd aifactory
pnpm factory rag install
```

This creates `.venv-rag/` automatically and installs the Python service there.
Use `AIFACTORY_RAG_PYTHON=/path/to/python` only when you want to provide your own Python environment.

## Start The RAG Stack

```bash
pnpm factory rag env up
```

This builds and starts PostgreSQL + pgvector, the FastAPI query service, and the
web chat. Database migrations run automatically when the API container starts.
Open `http://localhost:8080` for chat or use `http://localhost:8765/query`
directly. Override the published ports with `RAG_WEB_PORT` and `RAG_API_PORT`.
The web UI loads configured source IDs, lets users restrict each question to a
subset, shows downloadable source paths beneath each answer, and keeps up to 50
chat sessions in the current browser's local storage. These custom-UI sessions
are browser-local and are not shared across users or devices.

By default, the web container proxies to an API already running on the host at
`http://host.docker.internal:8765`. Override this with
`RAG_WEB_API_UPSTREAM`. Docker receives a host-gateway mapping automatically;
Podman deployments may use `http://host.containers.internal:8765` instead.

Both services bind to `127.0.0.1` by default. To make chat reachable from other
machines, explicitly set `RAG_WEB_BIND=0.0.0.0`. Set `RAG_API_BIND=0.0.0.0` only
when clients also need direct API access. Before exposing either service,
configure authentication or protect it with a trusted reverse proxy/firewall.
Compose interpolation and container runtime settings are loaded explicitly from
the root `.env` file. Shell variables can override those values for one command.

AI Factory does not install Docker/Podman and does not manage `podman machine`.
It only uses an already working `podman compose` or `docker compose` runtime.
If the API is already installed as a systemd service on port 8765, stop that
service or publish the container on another host port with `RAG_API_PORT`.

Start or stop services individually when dependencies are already healthy:

```bash
pnpm factory rag env start postgres
pnpm factory rag env start rag-api
pnpm factory rag env start rag-web

pnpm factory rag env stop rag-web
pnpm factory rag env stop rag-api
pnpm factory rag env stop postgres
```

Start the services in the order shown above when you want explicit control.
Compose still enforces declared dependencies: starting `rag-api` also starts a
missing PostgreSQL service. `rag-web` has no container dependency because it is
designed to reuse an API already running on the host. Use
`pnpm factory rag env status` to inspect service state.

## Configure Sources

Add a mounted fileserver or source repository path to `factory.config.json`:

```json
{
  "rag": {
    "sources": [
      {
        "id": "fileserver",
        "type": "filesystem",
        "rootPath": "/mnt/company-share/docs"
      }
    ]
  }
}
```

When `include` and `exclude` are omitted, the defaults ingest common document,
configuration, and source-code formats. Python, JavaScript/TypeScript, Java,
Kotlin, Go, Rust, C/C++, C#, Ruby, PHP, Swift, Scala, shell, SQL, Vue, Svelte,
Proto, and GraphQL files are supported, together with common extensionless build
files such as `Dockerfile` and `Makefile`. Wind River/Intel Simics DML models
(`.dml`) and command scripts (`.simics`) are also supported. Generated or dependency trees such as
`.git`, `node_modules`, `.venv`, `dist`, `build`, and `coverage` are excluded.

To ingest code, point a source root at the repository and narrow the patterns
if needed:

```json
{
  "id": "application-code",
  "type": "filesystem",
  "rootPath": "/srv/repos/application",
  "include": ["**/*.py", "**/*.ts", "**/*.tsx", "**/Dockerfile"],
  "exclude": ["**/.git/**", "**/node_modules/**", "**/.venv/**", "**/dist/**"]
}
```

For a Simics examples tree, a focused source can use:

```json
{
  "id": "simics-examples",
  "type": "filesystem",
  "rootPath": "/opt/simics/examples",
  "include": ["**/*.dml", "**/*.simics", "**/*.py", "**/*.c", "**/*.h", "**/Makefile"],
  "exclude": ["**/.git/**", "**/build/**", "**/__pycache__/**"]
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
pnpm factory rag ingest --source source-2 --subdir "standards"
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

Long-running ingest reconnects automatically when PostgreSQL is restarted or a
connection is administratively terminated. The interrupted file is retried and
continues from compatible chunk checkpoints. Configure the bounded recovery
window with `rag.ingest.databaseReconnectRetries` and
`rag.ingest.databaseReconnectDelaySeconds`.

FastAPI exposes:

- `GET /health`
- `POST /query`
- `POST /ingest-runs`
- `GET /ingest-runs/{id}`
- `GET /sources`
- `GET /documents`
- `GET /documents/download?sourceId=<id>&relativePath=<path>`

Document downloads require the same API authentication as queries. Only active
indexed documents can be downloaded, and resolved paths must remain inside the
configured source root. The web chat renders cited sources as download links.

`POST /query` accepts an optional `sourceIds` array. When supplied, retrieval is
limited to those configured sources.

During filesystem ingest, the reserved first-level directories `code/` and
`documentation/` are stored unchanged as `contentType` in both document and
chunk metadata. For example, `code/devices/uart.dml` receives
`contentType: "code"` and `documentation/reference.pdf` receives
`contentType: "documentation"`. Other directory names and files directly under
the source root do not receive a `contentType` value, so documentation-only
sources do not need special metadata configuration.

Use `excludeAdditions` for source-specific exclusions without replacing the
shared generated/cache exclusions. For example, a general-purpose Simics
source can retain first-party devices, components, extensions, targets, and
tests while ignoring installed runtime copies and the vendored SystemC kernel:

```json
{
  "id": "simics",
  "type": "filesystem",
  "rootPath": "${RAG_SOURCE_3_PATH}",
  "excludeAdditions": "${RAG_SOURCE_3_EXCLUDE_ADDITIONS:-[]}"
}
```

Set the source-specific glob list as a JSON array in `.env`:

```dotenv
RAG_SOURCE_3_EXCLUDE_ADDITIONS='["**/*.txt","**/win64/**","**/flexnet/**","**/licenses/**","**/packageinfo/**","**/vmxmon/**","**/src/external/systemc/**"]'
```

Simics build and target files with `.mk`, `.inc`, `.include`, and `.cmake`
extensions, plus `GNUmakefile`, are parsed as plain text.

## Local Embeddings

Embedding generation can run entirely inside the RAG Python process with
FastEmbed and ONNX Runtime; no embedding API key or separate HTTP service is
required:

```dotenv
RAG_EMBEDDING_PROVIDER=local
RAG_EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
RAG_EMBEDDING_DIMENSIONS=384
RAG_EMBEDDING_CACHE_DIR=./.cache/fastembed
RAG_EMBEDDING_MODEL_PATH=
RAG_EMBEDDING_LOCAL_FILES_ONLY=false
RAG_EMBEDDING_THREADS=4
```

The first model-name-based run downloads the model into the configured cache.
After that, set `RAG_EMBEDDING_LOCAL_FILES_ONLY=true` to prohibit network
access. For an air-gapped installation, pre-stage the compatible ONNX model and
set `RAG_EMBEDDING_MODEL_PATH` to that directory.

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
      "sourceIds": ["${RAG_SOURCE_ID:-source-1}"],
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
