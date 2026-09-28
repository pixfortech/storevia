# Storevia worker image (ADR-0023, docs/operations/staging.md).
# Build from the repository root:
#   docker build -f apps/worker/Dockerfile -t storevia-worker:<sha> .
# Configuration comes only from the runtime environment (see .env.example,
# "Worker"); the image holds no secrets. The worker validates its whole
# configuration at start and exits non-zero if anything is missing.
FROM node:24-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
WORKDIR /repo
COPY . .
# The worker and the workspace packages it imports, nothing else. Behind a
# TLS-intercepting proxy, pass its CA as a build secret (never a layer):
#   --secret id=extra_ca,src=/path/to/ca-bundle.crt
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi \
 && corepack enable \
 && pnpm install --frozen-lockfile --filter "@storevia/worker..." \
 && pnpm --filter @storevia/database generate

FROM node:24-slim
ENV NODE_ENV=production \
    WORKER_HEALTH_HOST=0.0.0.0 \
    WORKER_HEALTH_PORT=3004
WORKDIR /repo
COPY --from=build --chown=node:node /repo /repo
USER node
WORKDIR /repo/apps/worker
EXPOSE 3004
# Liveness: the scheduler loop is ticking (503 when degraded or stopping).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3004/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# SIGTERM finishes the running job, releases its claim and closes the pools.
STOPSIGNAL SIGTERM
CMD ["node_modules/.bin/tsx", "--conditions=react-server", "src/main.ts"]
