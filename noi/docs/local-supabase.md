# Shared local Supabase connection

Supabase is an independent infrastructure package at `infrastructure/supabase`. Mero is a consumer of the shared **No Origins Systems** stack (`no-origins-systems`). Its database URL and service ports remain the same.

See the [shared platform setup](../../infrastructure/supabase/README.md) for service lifecycle commands, [database boundaries](../../infrastructure/supabase/docs/database-boundaries.md) for the shared-database decision, and [earlier-stack change record](../../infrastructure/supabase/docs/earlier-stack-changes.md) for the initial implementation history.

Start the platform from its own folder:

```sh
# from the top of the repository
pnpm install --frozen-lockfile    # once, for the whole repository: one workspace, one lockfile
pnpm --dir infrastructure/supabase run stack:start
```

Then migrate and run Mero from `noi`:

```sh
cd noi
DATABASE_URL=postgresql://postgres:…@127.0.0.1:55322/postgres pnpm run registry:migrate   # the operator
pnpm run mero                                   # Mero's API on 127.0.0.1:8787, with mero.local.env
```

The development launcher (`scripts/noi-dev`) connects with Mero's own login from `mero.local.env`; the operator passes their own `DATABASE_URL` for migrations. Node.js 22+ and pnpm 10.33.0 remain the agreed tooling baseline. Supabase CLI dependencies and `stack:*` commands belong only to the shared infrastructure package.

The application owns `mer`, its embedded migrations and seed definitions. Its migration ledger lives in `mer_migrations._sqlx_migrations` so other applications can use independent migration histories. `noi migrate` adopts the earlier public ledger only after verifying that every row is an unchanged, successful registry migration. Mixed or inconsistent histories require explicit reconciliation.

Shared service shutdown affects every application connected to it. Do not reset the database to apply a registry change. The current development owner connection is not the credential model for shared/hosted operation; use application-specific backend logins and appropriate permissions there. Registry changes continue to pass through Invariants validation and Governance authorization.
