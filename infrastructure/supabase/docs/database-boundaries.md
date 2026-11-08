# Shared database boundaries · decision 2026-10-29

## Decision

Use one independently managed **No Origins Systems** Supabase stack for the current local No Origins environment. Applications connect to its one main PostgreSQL database (`postgres`) and own explicit schemas, permissions and migrations. The XEI registry owns `xec`; future app schemas are assigned when those applications exist.

Brand identity and database deployment boundaries are different concerns. One brand can use several databases, and several related applications can use one database. For the current small set of related applications, one shared service avoids duplicating local infrastructure and makes deliberate shared data integration easier. This is an architectural recommendation for the current stage, not a claim that every future No Origins product must share a database.

PostgreSQL schemas group tables inside a database; access across schemas depends on privileges. A schema name alone does not provide a security boundary. [PostgreSQL schema documentation](https://www.postgresql.org/docs/current/ddl-schemas.html)

## Ownership and access

- The shared infrastructure package owns service startup/shutdown, configuration, upgrades and platform backup coordination.
- Each application owns its domain tables and migrations. Applications qualify table names and use a dedicated runtime role/login with only the required grants.
- Cross-application access is explicit. Registry writes use XEC validation and XGA authorization through domain operations, even when the calling application shares the database server.
- Supabase Auth identities can be shared where product requirements call for it. Access to one application does not automatically confer access to every application. Application authorization remains explicit.
- Browser-facing schemas must be deliberately exposed and have appropriate grants and RLS. `xec` and `xec_migrations` remain outside the Data API's exposed schemas. [Supabase custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)

The local development connection currently uses the postgres owner. The existing registry backend group role restricts ordinary runtime operations, but a dedicated login has not yet been provisioned for each future application. Production login provisioning and application authorization remain future work.

## Migration isolation

Independent applications must not all use SQLx's default `public._sqlx_migrations` table. Version numbers and missing-migration validation can collide. The registry now keeps its tracker in `xec_migrations`, using a dedicated migration connection and a controlled search path. Its actual data stays in `xec`.

For the earlier registry-only installation, `xei migrate` verifies every legacy history row's version, checksum and successful status before moving that ledger into `xec_migrations`. A mixed, failed or changed legacy history is refused for manual reconciliation. If another application has public migration history on a database without XEC, the registry leaves it alone and uses its own tracker. The administrative migration step does not change entity records or their identities.

Migrations require a migration owner, separately from runtime credentials. Deployments must coordinate the order of migrations touching truly shared objects. Separate history tables prevent bookkeeping collisions; they do not resolve conflicting ownership of the same table.

## When separate projects/databases are appropriate

Use a separate Supabase project or database when an application needs stronger access isolation, independent backup/restore, independent maintenance/releases, substantially different resource demands or a distinct operational owner. Schemas share compute, connections, the server and the impact of outages. A shared database restore can affect every application using it.

Keep development, staging and production in separate environments. The decision to share the local platform does not authorize mixing their data, provision hosted resources or migrate the older `no-origins` stack.

For normal Supabase applications needing independent isolation across Auth, Storage and the Data API as well as PostgreSQL, a separate Supabase project is generally the clearer boundary than simply adding another PostgreSQL database to the current stack.

## Current layout

```text
No Origins/
├── Planning/
├── infrastructure/
│   └── supabase/       # shared platform and pinned CLI tooling
└── xei-registry/       # Rust application, xec migrations and explorer
```
