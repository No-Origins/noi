# The one app (the Explorer and Governance's plain pages) as a container image (agreed 8 Nov).
# Build from the No Origins folder:
#   docker build -f infrastructure/containers/app.Dockerfile -t noi/app:dev .
# pnpm installs only the app and the packages it uses, at the one lockfile's versions (8 Nov). No secret is copied in; the app holds
# none: it reaches Mero and Governance at MERO_URL and GOVERNANCE_API, given when it starts.

FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
# The workspace's files, every package's package.json (the lockfile names them all), and the app's sources.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY noi/package.json noi/
COPY infrastructure/supabase/package.json infrastructure/supabase/
COPY ui/ ui/
RUN pnpm install --frozen-lockfile --filter "explorer..."
RUN pnpm --filter explorer build

FROM node:22-bookworm-slim AS app
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
# Next's standalone output: the server and only the packages it uses.
COPY --from=build --chown=node:node /repo/ui/apps/explorer/.next/standalone ./
COPY --from=build --chown=node:node /repo/ui/apps/explorer/.next/static ./ui/apps/explorer/.next/static
USER node
EXPOSE 3000
# Ready: Mero and Governance answer.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health/ready').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "ui/apps/explorer/server.js"]
