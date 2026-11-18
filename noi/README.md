# No Origins Infrastructure (NOI)

This is the `noi` folder of the No Origins repository: the Rust side.

A Rust/PostgreSQL foundation for Mero (MER, the registry: every meron with its spec, state and history), Invariants (INV, the rules every meron must always pass), Governance's rules for Mero (GOV-MER) and Eidos's checks (EIO, the design system). Governance is a peer domain owning authority. The operational registry is the source of truth. JSON exports and the visual explorer are projections.

Renamed on 2026-11-05 from XEI (umbrella and registry), XEC (contracts), XGA (governance) and XEDS (design system); entities are now merons and contracts are invariants. Paths start with `noi`. The registry was rebuilt from `data/eio` with a fresh history; the earlier history is kept only in the backup `infrastructure/supabase/backups/2026-11-05-xec-before-noi-rename.sql`. The names and rules are on the board's Naming System and Rename Plan pages.

## Connect to the shared No Origins database

Supabase is an independent shared infrastructure package at `infrastructure/supabase`. The registry connects to the **No Origins Systems** database (`no-origins-systems`) and owns its `mer` schema. Other No Origins applications can use the same database with separately owned schemas, permissions and migration histories. See the [shared platform setup](../infrastructure/supabase/README.md) and [database boundaries](../infrastructure/supabase/docs/database-boundaries.md).

Start shared services from their infrastructure folder:

```sh
# from the top of the repository
pnpm install --frozen-lockfile    # once, for the whole repository: one workspace, one lockfile
pnpm --dir infrastructure/supabase run stack:start
```

Run Mero and Governance from the application folder. Since step 3 (7 Nov) each has its own database login in an owner-only file, `mero.local.env` and `governance.local.env` (ignored by Git), written once by the operator with `python3 -I ../infrastructure/supabase/runtime-logins.py`. Mero's login reaches only schema `mer`, Governance's only `gov`; the operator keeps `postgres` for migrations, backups and restoring. The launch configurations in `../.claude/launch.json` start both servers with their files.

```sh
cd noi
DATABASE_URL=postgresql://postgres:…@127.0.0.1:55322/postgres pnpm run registry:migrate   # the operator
pnpm run mero                                   # Mero's API on 127.0.0.1:8787, with mero.local.env
```

**Mero asks Governance about every request** (rule 1: who you are comes only from signing in). Each request carries a credential: `Authorization: Session <token>` from the Explorer's server (your sign-in, from Governance's HttpOnly cookie), `Authorization: Run <token>` from a tool runner, or none (signed out, a visitor). Mero asks Governance's server who holds it (`/api/who`) and whether they may (`/api/may`), and writes Governance's handle and record number next to every change. No answer means no: if Governance is down, Mero refuses everything, reading too. Cookies are not read, so no other page on this machine can act with yours. The only thing Mero shows without asking is what Governance copies: the roles and rules under `noi.gov` (`GET /api/governance/roles-and-rules`).

`noi export eio --output ../ui/packages/eio-tokens` writes the Eidos token files (`tokens.css`, `tokens.ts`, `tokens.json`) for apps, from active Eidos merons only. The window classes become the media queries that switch the `--eio-window-*` variables, each with the margin role named after it; motion durations and the curve become `--eio-motion-*` variables, with every duration 0 under `prefers-reduced-motion`; see `../ui/README.md`.

`node scripts/noi-load.mjs data/eio` proposes every meron file in a folder as one batch, as an agent (`NOI_PROPOSER`, default design-agent); you approve it in the Explorer. Merons already in Mero are skipped.

The registry requires Rust stable and PostgreSQL. Node.js 22+ and pnpm 10.33.0 remain the project tooling baseline; the Supabase CLI is owned by shared infrastructure. The Explorer (`../ui/apps/explorer`, http://mero.no-origins.localhost:3000) is Mero's interface; Mero's own old pages on port 8787 were retired on 7 Nov (archived in `infrastructure/supabase/backups/2026-11-07-step-3-retired/`, with the retired file of names).

`.env.example` documents the variables; the program reads environment variables, **not** `.env` files automatically. Keep credentials out of source control.

The shared platform uses `no-origins-systems` containers and volumes. Do not point registry commands at the older `no-origins` database. Do not reset an existing database. This migration adds the `mer` schema and a backend role; it does not change existing application tables. It needs `CREATE SCHEMA` and permission to create/grant the role `noi_mer_runtime`. Apply it with the migration owner. Run registry migrations with `noi migrate`/SQLx. They are tracked in `mer_migrations._sqlx_migrations`, independently of other applications. The migration command can safely adopt the earlier registry-only public ledger after checking its versions, checksums and successful status; a mixed ledger is refused for manual reconciliation.

## Operations

In the terminal, `noi` reads as the operator (the database password; not an account) and proposes as an agent. Changing merons from the terminal went on 7 Nov: agents propose, and people approve, send back and reject in the Explorer, with a touch.

```sh
cargo run --bin noi -- --help
cargo run --bin noi -- get noi.inv                          # the operator reads
cargo run --bin noi -- list --query token
cargo run --bin noi -- export --output /tmp/noi.json
cargo run --bin noi -- review
cargo run --bin noi -- history MERON_UUID
cargo run --bin noi -- effective-release MERON_UUID
cargo run --bin noi -- propose /tmp/meron.json /tmp/change.json --agent design-agent --title 'Status colors' --note 'Why'
cargo run --bin noi -- revise PROPOSAL_UUID /tmp/meron.json --agent design-agent --note 'What changed'
```

`propose` and `revise` act for an agent. With `NOI_RUN_TOKEN` set by Hyperbase's tool runner they use it; until Hyperbase exists, `--agent NAME` plays the tool runner: it signs a vouch with this Mac's key (`NOI_VOUCH_KEY`, default `hyperbase-vouch.local.pem`, made by `noi gov voucher add-this-mac`) and trades it for a 15-minute run token. The agent needs an account an owner added, and a role that may propose there.

## Governance

Governance answers "may they?" for every NOI system from its own schema, `gov`. Build it with `cargo build -p noi-gov --features server`; its command is `noi-gov`, also reached as `noi gov`. It needs `NOI_GOV_DATABASE_URL` (its own login, from `governance.local.env`; the operator's for `migrate`) and copies the approved roles and rules from Mero (`NOI_MERO_URL`, default `http://127.0.0.1:8787`) when it starts and after each approval in `noi.gov`. Its pages (sign in, add your passkey) are in the one app, on gov's own name: `NOI_GOV_PAGES`, default `http://gov.<NOI_DOMAIN>:3000/`. `NOI_DOMAIN` is the base name, `no-origins.localhost` on this Mac and `no-origins.com` hosted: passkeys belong to it, so one passkey signs in on gov and touches on mero. One-time links open on gov, so run the app to use one.

Anyone may sign up on gov (agreed 8 Nov): an email, a handle and a name. Governance emails a link; opening it confirms the email, makes the account with Observer in all of `noi` (reading, nothing more) and adds the passkey. "Lost your passkey?" emails a link that adds a new one. Neither form says whether an email has an account, and no address goes into the record or a log. Email goes where `NOI_GOV_MAIL` says: on this Mac `smtp://127.0.0.1:55325`, the mail catcher in the database stack, which sends nothing and shows every email at http://localhost:55324. Without it, signing up and lost-passkey links are refused.

```sh
noi gov migrate                                  # schema gov (administrative)
noi gov copy                                     # copy the roles and rules approved in Mero
noi gov serve                                    # its API on 127.0.0.1:8788; its pages are in the app
noi gov setup --handle HANDLE --name "Your name"  # once: the first owner and a 10-minute passkey link
noi gov passkey add HANDLE                       # a new first-passkey link, only while there is none
noi gov passkey add HANDLE --another             # a link for another passkey, such as one for a new name (recorded)
noi gov account email HANDLE EMAIL               # a person's email (recorded without the address)
```

See "Governance's server" in `docs/architecture.md`.

## Review

Changes reach Mero through Review. `propose` sends one batch; it never changes a meron. Each file is a new meron (JSON matching `noi_inv::NewMeron`, below), a change (`{"operation": "update", "uid", "expected_revision", "meron", "compatibility"}`, `{"operation": "rename", "uid", "expected_revision", "path"}` or `{"operation": "deprecate", "uid", "expected_revision"}`), or a whole batch (`{"title", "note", "changes": [...]}`). Whoever holds a role that may propose there may propose.

Mero test-runs the batch at once, in a transaction it then rolls back, and keeps each change's result: what it would do, the checks it passed, or why it fails. The order of changes in a batch does not matter. Approving (maintainers, with a touch) runs the batch again for real in one transaction: a new meron is added, filed under its system (or the `container` path given), registered and activated; if any change fails, nothing is approved. Sending back returns a waiting change to its proposer with a note; only the proposer can revise it, which test-runs the batch again. Rejecting closes it for good, with a note. A change proposed against a revision that has since moved on is stale and cannot apply. Nothing in Review is ever deleted, and decided proposals are final. The tables are `mer.batches`, `mer.proposals` and `mer.proposal_events`.

The Explorer does the same through Mero's API, as you: proposing needs your sign-in; approving, sending back and rejecting also need a touch (`touch` in the request), for exactly the places `POST /api/review/places` names. One approval is one question to Governance (agreed 7 Nov): every step inside an approved batch happens under that answer and carries its record number; the proposer is not asked again. `noi serve --eio-tokens DIR` writes the Eidos token files again after an approval that changes Eidos, and an approval in `noi.gov` asks Governance to copy the roles and rules again. Requests from other websites or hosts are refused, and writes must be JSON.

A new meron's JSON matches `noi_inv::NewMeron`:

```json
{
  "path": "noi.tokens.spacing.compact",
  "name": "Compact spacing",
  "classification": {"type": "token", "roles": []},
  "semantics": {
    "definition": "Shared compact spacing reference",
    "responsibility": "Express compact spacing intent for consumers"
  },
  "release_mode": "inherited",
  "authority_scope": "REPLACE_WITH_NO_NOI_UUID",
  "metadata": {},
  "spec": {}
}
```

Find the actual scope UUID with `get noi`. A subtype must be in `mer.subtypes`. `spec` holds checked content: it must pass every registered invariant that applies to the meron's type and subtype, and must stay empty when none applies. `data/eio/` has real examples: the Eidos system, the color-token invariant and the lime token (see "Meron spec and invariants" in the architecture decisions). `update UUID REVISION file.json` expects `{"meron": <same shape>, "compatibility": {"impact": "unknown", "rationale": "...", "invariant_checks": [], "migration_plan": "Review dependent consumers before rollout"}}`. A non-breaking claim requires explicit check evidence. Unknown/breaking changes ask Governance for `evolve-breaking`, with affected consumers included in the decision request. Breaking/unknown impact also requires a nonblank migration plan. The scoped local policy requires maintainer review and execution for every update, including non-breaking claims. The unrestricted development grant remains available for bootstrap only.

## Verification

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
# Explicit integration run: creates then removes a uniquely named test database.
NOI_TEST_ADMIN_URL="$DATABASE_URL" cargo test -p noi-mer --test postgres -- --ignored
```

Ordinary tests intentionally do not contact or alter a database. The opt-in integration test uses real PostgreSQL, runs migrations twice, checks reference seed idempotency, identity aliases and reserved names, Governance denials/approvals, rollback, graph constraints, concurrent writes, revision conflicts, lifecycle transitions, releases and inheritance, and backend permissions. It needs `CREATE DATABASE`; it never drops or resets the supplied database.

## Layout

- `crates/noi-inv`: typed invariants, named invariant checks and pure conformance validation.
- `crates/noi-eio`: Eidos design rules as pure functions: OKLCH color math, WCAG contrast, the color-role check, the text-style check and the reference check.
- `crates/noi-gov`: independent authorization DTOs/trait, deny-all default, explicit development grant.
- `crates/noi-mer`: PostgreSQL transactions, event history, operations, reference seed, CLI and local explorer server.
- `migrations`: database constraints, lifecycle guards, graph integrity, audit retention and backend role.
- `explorer`: dependency-free browser projection of the live registry.
- `data/eio`: Eidos proposal files: the system, the color-token, color-role, font-family, font-size and text-style invariants, the palette (`palette/`), the color roles (`roles/`) typography (`type/fonts`, `type/sizes`, `type/styles`), spacing and sizes (`space-invariant.json`, `space-role-invariant.json`, `size-invariant.json`, `space/scale`, `space/roles`, `size`), layout (`window-invariant.json`, `layout/window`), shape and borders (`radius-invariant.json`, `border-width-invariant.json`, `radius`, `border`), and motion (`duration-invariant.json`, `easing-invariant.json`, `motion/duration`, `motion/easing`). `tests/eio_data.rs` checks every file against its invariant without a database.
- `data/gov`: Governance proposal files: the role and rule invariants (`role-invariant.json`, `rule-invariant.json`), the two roles that exist on day one, maintainer and owner (`roles/`), and two rules (`rules/`), in Cedar. Every other role is made by an owner. `tests/gov_data.rs` checks every file against its invariant, and `noi-gov/tests/agreed_roles.rs` checks what the roles and rules decide.
- `docs/specifications`: executable implementation profiles for INV-001 through INV-005.

The API is at <http://127.0.0.1:55321>, Studio at <http://127.0.0.1:55323>, and database at `127.0.0.1:55322`. Run `pnpm run stack:status` or `pnpm run stack:stop` from the shared infrastructure folder. Stopping it affects every connected application. Analytics and the Edge Runtime remain disabled in the shared configuration.

Read [local stack setup](docs/local-supabase.md), [architecture decisions](docs/architecture.md), [security and Governance boundary](docs/gov-boundary.md), [verification](docs/verification.md), and [remaining work](docs/outstanding.md) before extending or deploying the foundation.

## Reconciled specifications and local governance

See [Invariants reconciliation](docs/specifications/reconciliation.md) for the original-draft comparison and deferred features, and [GOV-001](docs/specifications/GOV-001.md) for executable local rules and setup. A policy template is in `examples/governance-policy.example.json`. Observers read; contributors propose; maintainers review and execute definition changes, relationships, lifecycle and releases. Governance inheritance is explicitly configured by scope UUID. This is a trusted local workflow. Review (above) is the approval inbox; signing people in belongs to the Governance system and is still to come.
