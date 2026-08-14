FROM node:20-bookworm

ARG CODEX_VERSION=0.147.0

RUN apt-get update \
 && apt-get install --yes --no-install-recommends \
      ca-certificates \
      chromium \
      curl \
      git \
      jq \
      openssl \
      python3 \
      python3-pip \
      python3-venv \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
 && corepack prepare pnpm@9.15.9 --activate \
 && npm install --global "@openai/codex@${CODEX_VERSION}"

CMD ["bash"]
