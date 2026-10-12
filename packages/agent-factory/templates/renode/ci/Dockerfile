# CI image for a Renode hardware-twin project: Node for the aifactory CLI,
# plus Renode and the Arm GNU toolchain for the project's core, with SIMULATOR_*
# pointing at them. With
# SIMULATOR_REMOTE_HOST empty, scripts/renode-run.mjs and build-probe.mjs run
# Renode and gcc here instead of over SSH.
#
# Pinned by version and SHA-256. The image tag in .gitlab-ci.yml
# (AIFACTORY_RUNNER_IMAGE) names both versions: change them together. Keep the
# toolchain the one that built the committed probe ELFs, or a rebuild in CI
# will not reproduce them.
#
# Build it on the runner's host with ci/build-image.sh <user@host>, or with the
# manual build_ci_image job; the runner then uses the local image (pull_policy
# "if-not-present").
#
# Use it on a checkout (inside, everything runs locally, no SSH):
#   docker run --rm -it -v "$PWD":/work -w /work <AIFACTORY_RUNNER_IMAGE> bash
#   PROBE_NAME=<probe> PROBE_ELF=probes/<probe>/<probe>.elf \
#     PROBE_TRACE_OUT=build/sim.txt node scripts/renode-run.mjs
#
# Debian 12 (bookworm): bullseye's security updates have left the mirrors and
# apt-get on node:20-bullseye fails with 404s.
FROM node:20-bookworm

ARG RENODE_VERSION=1.17.0
ARG RENODE_SHA256=4ba7c68b59e2447f188ef4b4b112fcccd2802582c460beedceb63b84e5605a5f
ARG ARM_GNU_VERSION=15.2.rel1
# Which Arm GNU toolchain: the target triple from probes/toolchain.json
# ("ci.armGnuTarget"), passed by build_ci_image / ci/build-image.sh. One
# pinned digest per target; a target without one fails the build below.
ARG ARM_GNU_TARGET=arm-none-eabi
ARG ARM_GNU_SHA256_arm_none_eabi=597893282ac8c6ab1a4073977f2362990184599643b4c5ee34870a8215783a16
ARG ARM_GNU_SHA256_aarch64_none_elf=66f7ce7c1bf662f589a4caf440812375f3cd8000a033ccf0971127a0726d6921
ARG PNPM_VERSION=9.15.9

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils rsync openssh-client \
 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/renode \
 && curl -fsSL -o /tmp/renode.tar.gz \
      "https://github.com/renode/renode/releases/download/v${RENODE_VERSION}/renode-${RENODE_VERSION}.linux-portable.tar.gz" \
 && echo "${RENODE_SHA256}  /tmp/renode.tar.gz" | sha256sum -c - \
 && tar -xzf /tmp/renode.tar.gz -C /opt/renode \
 && ln -s "/opt/renode/renode_${RENODE_VERSION}-portable" /opt/renode/current \
 && rm /tmp/renode.tar.gz

RUN case "${ARM_GNU_TARGET}" in \
      arm-none-eabi) sha="${ARM_GNU_SHA256_arm_none_eabi}" ;; \
      aarch64-none-elf) sha="${ARM_GNU_SHA256_aarch64_none_elf}" ;; \
      *) echo "No SHA-256 pinned for ARM_GNU_TARGET=${ARM_GNU_TARGET}; add ARG ARM_GNU_SHA256_<target> to ci/Dockerfile" >&2; exit 1 ;; \
    esac \
 && mkdir -p /opt/arm-gnu-toolchain \
 && curl -fsSL -o /tmp/arm.tar.xz \
      "https://developer.arm.com/-/media/Files/downloads/gnu/${ARM_GNU_VERSION}/binrel/arm-gnu-toolchain-${ARM_GNU_VERSION}-x86_64-${ARM_GNU_TARGET}.tar.xz" \
 && echo "${sha}  /tmp/arm.tar.xz" | sha256sum -c - \
 && tar -xJf /tmp/arm.tar.xz -C /opt/arm-gnu-toolchain \
 && ln -s "/opt/arm-gnu-toolchain/arm-gnu-toolchain-${ARM_GNU_VERSION}-x86_64-${ARM_GNU_TARGET}" /opt/arm-gnu-toolchain/current \
 && rm /tmp/arm.tar.xz

RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate

ENV PATH="/opt/renode/current:/opt/arm-gnu-toolchain/current/bin:${PATH}"
# The project's scripts read these. An empty SIMULATOR_REMOTE_HOST keeps them
# local: a .env from a checkout (which points at the lab host) does not
# override a variable that is already set, even to "".
ENV SIMULATOR_BIN="/opt/renode/current/renode" \
    SIMULATOR_TOOLCHAIN_BIN="/opt/arm-gnu-toolchain/current/bin" \
    SIMULATOR_REMOTE_HOST=""

# Fail the build, not the first pipeline, if either tool cannot start here.
RUN renode --version | head -1 \
 && "${ARM_GNU_TARGET}-gcc" --version | head -1 \
 && pnpm --version
