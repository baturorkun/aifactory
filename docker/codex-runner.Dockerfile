FROM node:20-bullseye

ARG CODEX_VERSION=latest

RUN apt-get update \
 && apt-get install --yes --no-install-recommends ca-certificates curl git \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
 && corepack prepare pnpm@9.15.9 --activate \
 && npm install --global "@openai/codex@${CODEX_VERSION}"

CMD ["bash"]
