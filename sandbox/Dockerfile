ARG NODE_VERSION=24.12.0
FROM node:${NODE_VERSION}-bookworm-slim AS dependencies
WORKDIR /opt/openarms
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM dependencies AS test
COPY scripts/registry-v2.mjs ./scripts/registry-v2.mjs
COPY src/ ./src/
COPY plugins/ ./plugins/
COPY registry.json LICENSE ./
COPY skills/ ./skills/
COPY tests/ ./tests/
USER node
ENV npm_config_cache=/tmp/npm-cache
# Offline diagnostic image has neither Git nor the host policy runner.
# Runner/orchestration tests run on the host; retain the core/server contract here.
CMD ["node", "--experimental-strip-types", "--test", "tests/core.test.ts", "tests/server.test.ts"]

FROM dependencies AS runtime
ARG OPENCODE_VERSION=1.18.35
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global "opencode-ai@${OPENCODE_VERSION}" --no-audit --no-fund \
    && test "$(opencode --version)" = "${OPENCODE_VERSION}"
COPY src/ ./src/
COPY plugins/ ./plugins/
COPY registry.json LICENSE ./
COPY skills/ ./skills/
COPY sandbox/ /opt/openarms/sandbox/
COPY scripts/registry-v2.mjs ./scripts/registry-v2.mjs
RUN mkdir -p /home/node/.config /home/node/.local/state /home/node/.local/share \
    /home/node/.cache /workspace/project \
    && chown -R node:node /home/node /workspace/project
# Identity varies with source/library inputs; keep it out of RUN cache environments.
ARG OPENARMS_BUILD_FINGERPRINT=legacy
ARG OPENARMS_LIBRARY_MODE=repository
LABEL org.openarms.build-fingerprint=$OPENARMS_BUILD_FINGERPRINT \
      org.openarms.library-mode=$OPENARMS_LIBRARY_MODE
ENV HOME=/home/node \
    XDG_CONFIG_HOME=/home/node/.config \
    XDG_STATE_HOME=/home/node/.local/state \
    XDG_DATA_HOME=/home/node/.local/share \
    XDG_CACHE_HOME=/home/node/.cache \
    BUN_INSTALL_CACHE_DIR=/home/node/.cache/bun \
    OPENCODE_DISABLE_AUTOUPDATE=true
USER node
WORKDIR /workspace/project
ENTRYPOINT ["node", "/opt/openarms/sandbox/entrypoint.mjs"]
CMD ["opencode", "/workspace/project"]
