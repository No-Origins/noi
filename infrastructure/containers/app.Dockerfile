# The one app (the Explorer and Governance's plain pages) as a container image (agreed 8 Nov).
# Build from the No Origins folder:
#   docker build -f infrastructure/containers/app.Dockerfile -t noi/app:dev .
# pnpm installs the app's packages at the lockfile's versions. No secret is copied in; the app holds
# none: it reaches Mero and Governance at MERO_URL and GOVERNANCE_API, given when it starts.

FROM node:22-bookworm-slim AS build
WORKDIR /ui
RUN corepack enable
COPY ui/ ./
RUN pnpm install --frozen-lockfile
RUN pnpm --filter explorer build

FROM node:22-bookworm-slim AS app
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
# Next's standalone output: the server and only the packages it uses.
COPY --from=build --chown=node:node /ui/apps/explorer/.next/standalone ./
COPY --from=build --chown=node:node /ui/apps/explorer/.next/static ./apps/explorer/.next/static
USER node
EXPOSE 3000
# Ready: Mero and Governance answer.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health/ready').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/explorer/server.js"]
