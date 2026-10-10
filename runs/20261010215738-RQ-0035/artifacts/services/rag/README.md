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

### GitLab repositories

A source can also hold GitLab repositories, next to its folder or instead of
it; the documents and the code are then one corpus, one `sourceId`, told apart
by `contentType` (`excludeContentTypes: ["code"]` or `["documentation"]`). Give
the slot template an `envPrefix` and put each repository or group in `.env` as
a numbered entry with its own URL and its own token:

```json
{
  "id": "${RAG_SOURCE_3_ID:-source-3}",
  "type": "filesystem",
  "rootPath": "${RAG_SOURCE_3_PATH:-}",
  "envPrefix": "RAG_SOURCE_3"
}
```

```bash
RAG_GIT_MIRROR_DIR=/srv/rag-sources/git   # outside /srv/aifactory: rsync.sh deletes what the checkout lacks

RAG_SOURCE_3_ID=aselsan-bfi
RAG_SOURCE_3_PATH="/mnt/fs2/…/5001-K ASELSAN BFI-SW"   # optional
RAG_SOURCE_3_REPO_1_URL=http://gitlab.bc.int/aselsan/bfi-sw
RAG_SOURCE_3_REPO_1_TOKEN=glpat-…      # project access token, read_repository
RAG_SOURCE_3_REPO_1_REF=@last-release  # optional: a branch, a tag, @last-release or @last-tag; default branch otherwise
RAG_SOURCE_3_GROUP_1_URL=http://gitlab.bc.int/aselsan
RAG_SOURCE_3_GROUP_1_TOKEN=glpat-…     # group access token, read_api + read_repository
RAG_SOURCE_3_GROUP_1_PROJECT_EXCLUDE='["**/archive/**"]'
```

`@last-release` follows the newest GitLab Release (the token then needs
`read_api`) and `@last-tag` the highest version tag; both are resolved at every
ingest, and the report, metadata and citations carry the real tag. Write them
with `@`, not `<...>`: `.env` is sourced by a shell, which reads `<` as a
redirection and leaves the value empty.

A push webhook keeps such a source current (RQ-0028). Give the entry a secret,
`RAG_SOURCE_N_REPO_K_WEBHOOK_SECRET`, and add a GitLab webhook (Settings >
Webhooks) to `http://<rag-host>:8765/webhooks/gitlab` with the same secret
token, push events (tag push events for `@last-release`/`@last-tag`) and
pipeline events: a successful pipeline on the followed ref starts one more
ingest, which picks up the SCIP index (or release package) the push's own
ingest ran too early to find.
A push to the ref the entry follows queues an incremental ingest of its
source and answers 202; other branches are ignored; a missing or wrong token
is refused with 401. One ingest per source runs at a time and pushes during it
fold into one follow-up run. GitLab only delivers to a private address when
its administrator allows requests to the local network; `gitlab.bc.int` does.

Numbers need not be contiguous; a URL without its token, or a token without
its URL, stops the configuration from loading. A token is only ever used for
its own entry and is handed to git through the environment, so it is not
written to the mirror's git config, a log or an error. Each repository is kept
as a working tree under `RAG_GIT_MIRROR_DIR/<host>/<group>/<project>` and
ingested at the fetched commit; a file whose git blob id has not changed since
the last ingest is skipped. A repository or group that cannot be read fails
alone and the rest of the source is still ingested. `--subdir` narrows the
folder only.

C, C++, TypeScript and JavaScript are chunked one symbol per chunk (function,
method, class, struct, enum, typedef, macro block) with tree-sitter, from a
folder or a repository alike; every chunk carries its symbol, kind, signature
and line range, and a repository chunk its repository, ref and commit. Answers
cite such a chunk as `<repository>@<commit>:<path>:<start>-<end> (<symbol>)`
and the web page links it to GitLab. The first ingest after this change
re-chunks existing C/C++/TS/JS files by symbol on its own; other files are not
re-embedded, and documents that predate `contentType` gain it in place.

C# (RQ-0032) is chunked the same way: classes, structs, records, interfaces,
enums and delegates, and in them methods, constructors, operators and the
properties whose accessors have code (an auto-property `{ get; set; }` stays
with its type). A Renode peripheral's `WriteDoubleWord` is one chunk named
`<namespace>.<class>.WriteDoubleWord`. Existing `.cs` documents are
re-chunked on their next ingest.

Deploying it needs `pip install` of the tree-sitter packages in
`pyproject.toml` and `db migrate` (migration `003_source_inputs.sql`).

### Symbol graph

The same parse records, per code file, its definitions (`rag_symbols`) and the
edges that leave it (`rag_edges`): `calls`, `reads`/`writes` of globals,
register macros and struct fields (never a function's own locals),
`includes`/`imports` (C# `using` namespaces too), `declares` (prototypes) and
`contains` (class members; in C# also constructors, properties and nested types).
Edges are resolved by name (`resolution: name`): a call to `init` reaches every
function named `init` in the source. The graph lives in the same PostgreSQL
(migration `004_symbol_graph.sql`); code ingested before it gets its graph on
the next ingest without being re-embedded.

```bash
curl "$RAG/symbols?name=a429EncodeWord&sourceIds=aselsan-bfi"
curl "$RAG/callers?name=a429EncodeWord&sourceIds=aselsan-bfi"     # who calls it, with path and line
curl "$RAG/callees?name=a429PublisherPublish&sourceIds=aselsan-bfi" # what it calls, with the definitions each name reaches
curl "$RAG/references?name=TX_CTRL&sourceIds=aselsan-bfi"         # where a register is read and written
curl "$RAG/impact?name=a429EncodeWord&sourceIds=aselsan-bfi&depth=4" # transitive callers and referrers, by file
```

A `/query` adds the callers and callees of the functions it found (and the
header declaring them) within its top-k budget; `"expandGraph": false` turns
that off.

When a repository publishes a SCIP index of its build, edges become precise.
After ingesting a repository input the RAG looks for a file named
`index.scip` in the generic packages whose version is the ingested tag, then
among the job artifacts of the commit's latest successful pipeline (the
entry's token needs `read_api`). Each `calls`/`reads`/`writes` edge of a file
the index covers is matched to the SCIP use on the same line and text and
records the definition's path and line (`resolution: precise`); everything
else stays `name`. The overlay is recomputed at every ingest, so an index is
never applied to another commit. `/callers`, `/references` and `/impact` take
an optional `path` to ask about one definition of a shared name, and
`/callees` lists only the definition a precise call reaches. scip-clang
records definitions and uses, not reads and writes, so the kind of a
reference still comes from tree-sitter. For `aselsan/bfi-sw` the `scip-index`
CI job produces the index (bfi-sw MR !3).

### Data-flow queries (Joern)

A source marked `RAG_SOURCE_N_DATAFLOW=on` gets a Joern code property graph of
each of its code inputs at every ingest, one per language family the input
holds: C/C++ (`c2cpg`), TypeScript/JavaScript (`jssrc2cpg`) and C#
(`csharpsrc2cpg`). A repository's graphs follow its commit, the folder's the
state of that family's files; each is named `rag-<input>-<state>-<c|js|cs>`.
Joern runs as the `joern` service of `infra/rag/compose.yaml` (pinned
v4.0.644, `RAG_JOERN_MEMORY` 4g limit, `RAG_JOERN_HEAP` 3g, loopback port
`RAG_JOERN_PORT` 8090, workspace `RAG_JOERN_WORKSPACE`):

```bash
docker compose --env-file .env -f infra/rag/compose.yaml up -d --build --no-deps joern
```

`POST /dataflow {"sourceId", "query", "params"}` runs a prepared query over
the source's graphs of the families it applies to:

| Query | C/C++ | TypeScript/JavaScript | C# |
|---|---|---|---|
| `unchecked-input` | receive/read results reaching an index or a `memcpy`/`memset` size | numbers read from bytes (`DataView.get*`, `Buffer.read*`, `parseInt`) reaching an index, a `slice`/`subarray`/`copy` offset or length, or an array/buffer size | the parameters of a peripheral's `Write*` methods and of the callbacks given to `With*` register definitions reaching an index or an `Array.Copy`-style argument |
| `shared-state` | globals written in an interrupt handler and used outside it | - | - |
| `coupling` | calls and globals between directories | calls and module-level variables between directories | calls between directories |

A finding is reported only when no bound check dominating the sink mentions
every value reaching it. `params.component` narrows `coupling`. Patterns are
overridden per family: `RAG_SOURCE_N_DATAFLOW_SOURCES`, `_SINKS`, `_ISR` (or
`_C_SOURCES`, ...) for C, `_JS_SOURCES` / `_JS_SINKS`, and `_CS_SOURCES`
(method names), `_CS_SINKS`, `_CS_CALLBACKS`. Every finding names its
family. Two limits of the pinned frontends are worked around: jssrc2cpg
carries flows to the identifiers of an expression, not to the expression, so
those are the sink points; csharpsrc2cpg does not link `var x = ...` to its
local and numbers lines from 0, so a C# bus value is followed by name within
its method and its lines are shifted by one. A `/query` that reads as a
data-flow question runs the matching query, cites the most relevant findings
and ends with the notice that Joern is not a qualified tool (DO-330). The
fixture tests in `tests/test_dataflow_joern.py` run against a live Joern when
`RAG_JOERN_URL` and `RAG_JOERN_WORKSPACE` are set.

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

An input's files are ingested smallest first, so most documents are searchable
early and the few huge manuals come last; `RAG_INGEST_ORDER=path` restores the
scan order. Two more variables shape a long re-embed that shares the embedding
GPU with questions: `RAG_INGEST_BATCH_SIZE` (default 50 chunks per request) and
`RAG_INGEST_DUTY_CYCLE` (default 1; 0.5 rests after each batch as long as the
batch took). One ingest of a source runs at a time: a second one, from the CLI
or a webhook, waits for the first.

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

## Embeddings On Ollama

Embeddings can come from an Ollama in the lab, with no API key and no text
leaving the network:

```dotenv
RAG_EMBEDDING_PROVIDER=ollama
RAG_EMBEDDING_MODEL=qwen3-embedding:8b
RAG_EMBEDDING_DIMENSIONS=2000
RAG_EMBEDDING_BASE_URL=http://192.168.1.57:11434,http://192.168.1.3:11434
RAG_EMBEDDING_TIMEOUT_SECONDS=900
```

A wider vector is cut to `RAG_EMBEDDING_DIMENSIONS` and normalised again.
Questions to a Qwen3-Embedding model carry its retrieval instruction
(`RAG_EMBEDDING_QUERY_INSTRUCTION` replaces it); documents never do.

`RAG_EMBEDDING_BASE_URL` is one address or several separated by commas, the
preferred one first:

- An ingest batch is split between the hosts that answer, in proportion to the
  speed measured for each (an unmeasured host gets an equal share), and the
  parts are sent at the same time. A fast and a slow host finish together.
- A question goes to the fastest host that answers, the first listed one until
  speeds are known.
- A host that refuses or drops the connection, does not accept one within five
  seconds, or answers with a server error is stepped over: its texts go to the
  other hosts in the same batch and it is tried again after
  `RAG_EMBEDDING_HOST_RETRY_SECONDS` (default 60). Only when no host answers is
  the request retried with backoff, and it fails after `maxRetries`.
- With several hosts each one is asked for the digest of the model
  (`/api/tags`) before it gets a text, and again after it was away. The first
  listed host that answers sets the digest for the process; a host with another
  digest, or without the model, is refused. Pull the same tag on every host and
  compare `ollama list`: two quantisations of one model do not share an index.

Going away, coming back and a refusal are each printed once in the ingest log.
Every host must serve the model with a context long enough for a chunk; a
smaller GPU can run a shorter context (`OLLAMA_CONTEXT_LENGTH`) than the others.

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
