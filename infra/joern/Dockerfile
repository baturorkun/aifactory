# Joern for the RAG's data-flow queries (RQ-0025): a pinned release, checked
# against its sha256, on a JDK 21 runtime (the version Joern is tested on).
# The ghcr.io/joernio/joern images are only `master` and `nightly`, which
# cannot be pinned, so the image is built here from the release archive.
FROM eclipse-temurin:21-jre-jammy

ARG JOERN_VERSION=v4.0.644
ARG JOERN_SHA256=407358d2ccb506e4b3d8e674456fbc08a734e94add9f8d6a06136de2afae7110

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL -o /tmp/joern-cli.zip \
      "https://github.com/joernio/joern/releases/download/${JOERN_VERSION}/joern-cli-linux-x86_64.zip" \
 && echo "${JOERN_SHA256}  /tmp/joern-cli.zip" | sha256sum -c - \
 && unzip -q /tmp/joern-cli.zip -d /opt \
 && rm /tmp/joern-cli.zip

ENV PATH="/opt/joern-cli:${PATH}"
WORKDIR /workspace
EXPOSE 8080
CMD ["joern", "--server", "--server-host", "0.0.0.0", "--server-port", "8080"]
