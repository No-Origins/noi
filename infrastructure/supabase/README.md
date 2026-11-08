# No Origins · shared Supabase infrastructure

Location: `infrastructure/supabase` in the No Origins repository.

This is the independent local database platform for No Origins applications. Mero and Governance are its consumers. The stack retains the project name **No Origins Systems** (`no-origins-systems`), its existing database, volumes and ports.

## Run the shared platform

Requires a running Docker-compatible service, Node.js 22+ and pnpm 10.33.0. The Supabase CLI is pinned to 2.122.0 in this package. The existing local stack has already been initialized; do not initialize a second stack per application.

```sh
# from the top of the repository
pnpm install --frozen-lockfile    # once, for the whole repository: one workspace, one lockfile
pnpm --dir infrastructure/supabase run stack:start
```

| Service | Endpoint |
| --- | --- |
| PostgreSQL | `127.0.0.1:55322` |
| API gateway | <http://127.0.0.1:55321> |
| Supabase Studio | <http://127.0.0.1:55323> |
| Local email inbox | <http://127.0.0.1:55324> |

`pnpm run stack:status` shows this platform's endpoints. `pnpm run stack:stop` stops the shared platform and preserves its data. Stopping it affects every application using it. Run these commands here, not from application directories. Keep the project ID stable to retain the same containers and volumes. Avoid `--no-backup`, database resets and volume removal for an existing shared database.

Auth, Storage, Realtime, Studio, REST, metadata and the email inbox belong to this platform. Analytics and the Edge Runtime remain disabled. No application is required to use every Supabase service. The older `no-origins` stack is a separate existing project and is not merged or changed by this separation.

## Connect an application

Backend applications connect to the same local PostgreSQL database. `.env.example` contains the local development connection. Supply the URL through each application's environment. Do not put database credentials in browser code.

The current local development URL uses the local postgres owner. That is a development convenience, not application isolation. Before shared use beyond a trusted developer machine, provision separate backend logins with schema-specific permissions. Mero and Governance already have theirs: `noi_mer_runtime` reaches only `mer`, `noi_gov_runtime` only `gov`, written once by `runtime-logins.py` into owner-only files in `noi` that git ignores.

| Application | Data ownership | Migration history |
| --- | --- | --- |
| Mero | `mer` schema | `mer_migrations._sqlx_migrations` |
| Governance | `gov` schema | `gov_migrations` |
| Future applications | A separately assigned schema or domain schemas | An independently owned tracker |

No placeholder schemas or other application data are created by this separation. Sharing a database does not grant other apps permission to mutate registry tables. Use the registry's governed operations for entity changes.

## Ownership

This folder owns the Supabase service configuration, CLI dependency and platform lifecycle. Each application owns its data model, schema migrations, runtime credentials and seed operations. Automatic Supabase migrations and seeds are disabled so starting the platform cannot apply or reset all application schemas.

Mero's and Governance's migrations and servers are described in [noi's README](../../noi/README.md).

Read [database boundaries](docs/database-boundaries.md) for the shared-database decision, isolation limits and when to split projects.

## Separation verification

The registry projection was compared before and after separation and matched exactly, excluding snapshot generation time. It retains seven entities, ten relationships, no releases and 17 audit events. The registry's tests pass with its independently tracked migrations, including unrelated and mixed legacy history cases. Studio and the existing visual explorer remain available at their original ports.

The initial implementation history for the older stack is retained in [earlier-stack changes](docs/earlier-stack-changes.md).
