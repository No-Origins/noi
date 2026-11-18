# Verification report · 2026-10-29

## Verified environment

- Rust 1.99.1, Cargo 1.99.1 on macOS arm64.
- Shared Supabase infrastructure project: `no-origins-systems` (**No Origins Systems**), CLI 2.122.0.
- Supabase PostgreSQL container: `supabase_db_no-origins-systems`, database port **55322**. This is distinct from the older `no-origins` project on 54322.
- New stack services: PostgreSQL, Studio, API gateway, REST, Auth, Storage, Realtime, metadata and email inbox. Health checks pass where provided. Studio and REST endpoints return HTTP 200.
- Analytics and Edge Runtime are disabled; Rust implements the registry.

The existing Docker-compatible service was initially stopped. The first implementation pass started it and the older Supabase database; after the user clarified the desired isolation, the dedicated project was initialized with its own configuration, containers, volumes and ports. See `local-supabase.md` for the exact earlier-stack change record. The old database was not reset or deleted.

## Rust checks

Passed:

```sh
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets --offline -- -D warnings
cargo test --locked --workspace --offline
NOI_TEST_ADMIN_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
  cargo test --locked -p noi-mer --test postgres --offline -- --ignored
```

Five pure unit tests pass. The separately opted-in integration workflow passes on real PostgreSQL in the new stack; it is intentionally reported as ignored in the ordinary unit-test run. It creates a uniquely named database on the supplied server, runs the assertions, and drops only that test database. No disposable test databases remain after verification.

The integration workflow checks:

- Migrations applied twice without duplicate schema work.
- Seven proposed, unreleased reference definitions; ten relationships; idempotent seeding.
- Default Governance denial; approval-required blocks writes; policy registration grants no authority.
- Duplicate path rejection, stable UUIDs through rename, historical alias lookup, no path reuse.
- Revision conflicts and competing concurrent renames (exactly one succeeds).
- History cannot disclose pre-rename locations to a capability limited to the new path.
- Endpoint types, self edges, peer-domain parent restrictions and dependency cycle rejection.
- Forward-only meron lifecycle, invalid skips, blocked retirement with inbound references, retired record immutability.
- Separate release lifecycle, inherited meron release rejection, semantic-version input and generation rationale validation, inherited stable release resolution.
- Runtime read permissions and denied audit DELETE/TRUNCATE; immutable events/identifiers; database lifecycle guards.
- Injected event insertion failure rolls back the associated new meron.

This is a foundation-level integration workflow, not a complete proof of every possible policy, graph size, migration upgrade or original specification clause.

## New-stack data verification

Applied the registry migration to `no-origins-systems/postgres`, seeded through the Rust operations, then repeated the seed. Database counts remained:

| Record | Count |
| --- | ---: |
| Merons | 7 |
| Relationships | 10 |
| Audit events | 17 |
| Releases | 0 |
| Disposable test databases remaining | 0 |

Every reference meron remains `proposed`, at revision 1. No generation or release was fabricated. Invariants and Governance are peers under NOI. The explorer snapshot reports the same seven merons, ten relationships and no releases.

## Explorer verification

Opened the live explorer against the dedicated stack, checked its rendered graph and inspector, and exercised:

- Search for `button`: one matching meron; inspector shows its dependency on the text-color token and containment by NOI.
- Dependency perspective: two actual `depends-on` edges.
- Governance perspective: two actual `governed-by` edges.
- Token type filter: one graph node.
- No-match search: useful empty state and clear-filters action.
- Server interruption: browser retains seven nodes, labels the snapshot stale and shows recovery guidance; reconnect returns to live data.
- Snapshot HTTP response uses `Cache-Control: no-store`.
- Untrusted Host and cross-origin Origin requests are rejected with HTTP 403.

The explorer contains no registry meron definitions or graph fixture. It requests the Rust server's repeatable-read projection from PostgreSQL. Responsive CSS is included; a separate mobile-device visual review has not been performed. The local capability is explicitly development-only. Production Governance policy resolution and authenticated agent transports remain outstanding.

## Reproduction

Use `pnpm install --frozen-lockfile` and `pnpm run stack:start` from `infrastructure/supabase`; then run `pnpm install --frozen-lockfile`, `pnpm run registry:migrate`, `pnpm run registry:seed`, and `pnpm run explorer` from this application workspace. The development wrapper defaults to the shared local database on 55322 and an explicit local development actor. Set environment variables deliberately if overriding those defaults. Runtime integration tests require a migration-owner URL with CREATE DATABASE and role administration permissions.

## Tooling update

The agreed local tooling baseline is Node.js 22+ with pnpm 10.33.0. Converted the dependency lock to `pnpm-lock.yaml`, pinned the package manager, enforced the Node engine requirement and updated setup/CI commands. Verified `pnpm install --frozen-lockfile`, `pnpm exec supabase --version` (2.122.0), and `pnpm run check:explorer`. The explorer presentation is retained pending the No Origins design system.

## Shared infrastructure separation

Supabase configuration, the pinned CLI dependency, lifecycle commands and platform documentation moved to `infrastructure/supabase`. The registry package no longer depends on the Supabase CLI and no longer has `stack:*` commands. Both packages retain Node.js 22+ and pnpm 10.33.0.

Verified both pnpm frozen installs, the shared CLI version (2.122.0), explorer JavaScript syntax, Rust formatting, clippy with warnings denied, five unit tests and the real PostgreSQL integration workflow. The integration workflow now also covers an unrelated public migration ledger, migration-history adoption from the earlier registry-only layout, and refusal to adopt a mixed history.

Applied the metadata upgrade to the shared local database: the registry ledger is now `mer_migrations._sqlx_migrations` with one successful migration. The earlier public tracker was relocated, rather than copied or reapplied. Compared the complete live registry projection with the saved pre-separation projection, excluding only snapshot generation time: all meron definitions, UUIDs, revisions, relationships, release records and timestamps matched exactly. Audit event count remains 17; no disposable test databases remain. Studio returned HTTP 200, and the existing explorer is running at the same URL.

This verifies the infrastructure boundary and registry behavior. Future applications still need their own schema, runtime permissions and migration ownership; sharing the platform does not provision those automatically.


## Invariants reconciliation and GOV-001 local workflow

Retrieved individual Invariants working drafts and Governance architecture notes from their source chats, preserved historical text/message IDs under `docs/specifications/sources/`, and reconciled the differences in `reconciliation.md`. Added a migration-plan requirement for breaking/unknown updates, with validation coverage.

Verified Rust formatting, clippy with warnings denied, ten unit/CLI tests, explorer JavaScript syntax, shell launcher syntax, and the real PostgreSQL integration workflow. The integration workflow uses the real `ScopedAuthorizer`: observer denial, contributor proposals, blocked transitions/relationships/updates/releases, maintainer registration/activation and breaking update, conflict on stale revision, affected-consumer and migration-plan audit payload, executing actor, policy revision, and committed explorer snapshot data. The disposable test database was cleaned up by the existing test harness. This checks the server projection used by the explorer, not a new browser visual review.

The first integration attempt was prevented by local connection permissions before a database was created. Re-running with local-network access succeeded. The final read-only CLI smoke check used the existing development registry: seven merons readable under the contributor policy, a root transition returned approval-required, and root revision remained 1. No reference meron was promoted or changed. Created an ignored, owner-only `governance.local.json` with the actual root scope UUID and the three documented local subjects. Remote authentication, persistent approval requests, durable governance attempt auditing, executed compatibility evaluation and automatic migration remain outstanding.

## Meron spec, invariants and Eidos lime · 2026-11-02

Added migration `202611020001_spec_invariants.sql` (meron `spec`, fixed `mer.subtypes`, invariant applicability guard) and invariant checks in `noi-inv` using the `jsonschema` crate without network or file resolvers. Verified Rust formatting, clippy with warnings denied, twelve unit tests (two new: invariant self-containment and built-in rules; every applicable invariant must pass), explorer JavaScript syntax, and the real PostgreSQL integration test in a disposable database. Its new invariant workflow covers: an unregistered subtype refused; an invariant applying to invariants refused; lime refused while its invariant is only proposed; a non-conforming lime refused; lime accepted with the invariant revision recorded; a stricter invariant version refused because lime would fail, leaving the invariant revision unchanged; a change to what the invariant applies to refused; a version lime passes accepted with lime recorded as covered; and retirement refused while lime is covered.

Before migrating the live No Origins Systems database, the `mer` and `mer_migrations` schemas were dumped with `pg_dump` (7 merons, 10 relationships, 17 events). After migration all 7 merons were intact with empty `spec`, and both migrations are recorded as successful. The local governance policy moved to revision 2, adding Eidos as a child scope of NOI with no grants of its own, so existing roles apply inside it.

Then, using the governed local workflow (`design-agent` proposes, `local-maintainer` links and approves), created from `data/eio/`: `noi.eio` (active), `noi.eio.inv.color-token` (active) and `noi.eio.color.palette.lime` (active), each contained by its parent. The design agent's attempt to register Eidos returned approval-required with no write. Lime was refused before its invariant was registered, and a lime with an sRGB value was refused with both violations listed. Lime's history records its proposal and registration as checked against color-token invariant revision 3. The registry now holds 10 merons, 13 relationships and 29 events.

## Color roles, named checks and noi-eio · 2026-11-02

Added the `noi-eio` crate, named invariant checks in `noi-inv`, the registry's `checks` module and migration `202611020002_color_roles.sql` (subtype `token/color-role`). Verified Rust formatting, clippy with warnings denied (`--locked`), the unit tests (noi-eio 6: contrast values from the board, lime tint mixing, palette parsing, role pass/fail with every problem named, reference rules and bounded minimums; noi-inv 7, one new for named checks), the new `tests/eio_data.rs` (lime, violet and 9 greys pass the next color-token invariant; all 16 roles pass the color-role invariant and every declared contrast pair), explorer JavaScript syntax and launcher syntax.

The real PostgreSQL integration test passed in a disposable database on the shared stack. Its new color-role workflow covers: an unknown check name refused; a draft palette color refused as a reference; lime text on the page refused with its 1.32 : 1 ratio; a lime mix tint accepted; registration creating `depends-on` links to the palette colors and the surface; history recording the invariant revision and the three merons read; a lighter ink refused because primary text would fail; a stricter text minimum refused for the same reason; a role update moving its links; and a palette color in use refused retirement. No disposable database remains.

The live No Origins Systems database is unchanged: the new migration and the Eidos palette and roles have not been applied or proposed yet.

## Eidos colors registered in the live registry · 2026-11-03

Before any change the `mer` and `mer_migrations` schemas were dumped with `pg_dump` to `infrastructure/supabase/backups/2026-11-03-xec-before-color-roles.sql` (owner-only, ignored by Git): 10 merons, 13 relationships, 35 events, 2 migrations. Then:

- Applied `202611020002_color_roles.sql`; three migrations are recorded as successful.
- Added `family` to the color-token invariant in governed steps by `local-maintainer`: an optional field (revision 4), lime recorded as `brand` (lime revision 4), then the field required (revision 5).
- `design-agent` proposed, and `local-maintainer` registered, activated and filed under Eidos: violet and 9 greys, the color-role invariant, and the 16 color roles. Roles checked against other roles were registered after them.

The registry now holds 37 merons, 78 relationships (27 new `contains`, 38 `depends-on` set by the registry from what each role reads) and 184 events. All 30 Eidos merons are active and contained by Eidos. Each role's registration event records the color-role invariant revision and every meron its check read. An observer-policy export returns the same 37 merons and 78 relationships.

## Typography and the text-style check · 2026-11-03

Added migration `202611030001_typography.sql` (subtypes `token/font-family`, `token/font-size`, `token/text-style`), the text-style check in `noi-eio`, its wiring in the registry's `checks` module (which now runs checks by name), the font-family, font-size and text-style invariants, and data for 4 fonts, 6 size steps and 8 styles in `data/eio/type/`. Verified Rust formatting, clippy with warnings denied (`--locked`), the unit tests (noi-eio 11, five new: the locked styles pass; a weight the font lacks; size, Tenor Sans, reading and Devanagari minimums; references and fallbacks; bounded minimums), `tests/eio_data.rs` (all fonts, sizes and styles pass their invariants and the check; an unlisted license, an off-ladder size and a color in a style are refused by the schemas) and explorer JavaScript syntax.

The real PostgreSQL integration test passed in a disposable database on the shared stack, using the real invariant and data files. Its new typography workflow covers: a hero at 48 / 48 refused for Devanagari; a title at 30 / 36 refused for its Devanagari fallback (needs 37.5 px); a 700 display refused because Yatra One has only 400; Tenor Sans at 16 px refused; body at 16 / 20 refused; a style on a draft size step refused; all 8 styles registered with `depends-on` links to exactly their fonts and size step; history recording the text-style invariant revision and the three merons a heading reads; Geist without its 600 weight refused because headings would fail; a stricter Devanagari minimum refused because display and hero would fail; a title update dropping its fallback moving its links; and a size step in use refused retirement. No disposable database remains.

The live database was changed afterwards; see the next section.

## Eidos typography registered in the live registry · 2026-11-03

Before any change the `mer` and `mer_migrations` schemas were dumped with `pg_dump` to `infrastructure/supabase/backups/2026-11-03-xec-before-typography.sql` (owner-only, ignored by Git): 37 merons, 78 relationships, 184 events, 3 migrations. Then:

- Applied `202611030001_typography.sql`; four migrations are recorded as successful, and `token/font-family`, `token/font-size` and `token/text-style` are registered subtypes.
- `design-agent` proposed, and `local-maintainer` registered, activated and filed under Eidos, in this order: the font-family, font-size and text-style invariants; the 4 fonts; the 6 size steps; the 8 text styles (84 operations).

The registry now holds 58 merons, 117 relationships (21 new `contains`, 18 new `depends-on` set by the registry from what each style reads) and 286 events. All 21 typography merons are active and contained by Eidos. Each style depends on exactly its font, its fallback if any, and its size step; for example the heading reads Geist, Yatra One and the 20 px step, and its registration event records text-style invariant revision 3 and those three merons at revision 3. An observer-policy export returns the same 58 merons and 117 relationships.

## Spacing, sizes and the reference check · 2026-11-03

Added migration `202611030002_spacing.sql` (subtypes `token/space`, `token/space-role`, `token/size`), the reference check in `noi-eio`, its wiring in the registry's `checks` module, the space, space-role and size invariants, a multiple-of-4 line-height rule in the text-style invariant file, and data for 4 scale steps, 6 spacing roles and 6 sizes in `data/eio/space/` and `data/eio/size/`. Verified Rust formatting, clippy with warnings denied (`--locked`), the unit tests (noi-eio 13, two new: a role must point at a usable token; parameters name a field and a subtype), `tests/eio_data.rs` (steps, roles and sizes pass their invariants and the check, every registered step is used by a role, all 8 text styles pass the grid rule; a step off the scale, a size off the grid, a role holding a value and a line height of 30 are refused) and explorer JavaScript syntax.

The real PostgreSQL integration test passed in a disposable database on the shared stack, using the real invariant and data files. Its new spacing workflow covers: a reference check without a subtype refused; a role pointing at a draft step or an unregistered step refused; a role holding a raw value, a step off the scale, a size and a line height off the 4 px grid refused; all 6 roles registered with `depends-on` links to exactly their step; history recording the space-role invariant revision and the step read; a role update moving its link; and a step in use refused retirement. No disposable database remains.

The live database was changed afterwards; see the next section.

## Eidos spacing and sizes registered in the live registry · 2026-11-03

Before any change the `mer` and `mer_migrations` schemas were dumped with `pg_dump` to `infrastructure/supabase/backups/2026-11-03-xec-before-spacing.sql` (owner-only, ignored by Git): 58 merons, 117 relationships, 286 events, 4 migrations. Then:

- Applied `202611030002_spacing.sql`; five migrations are recorded as successful, and `token/space`, `token/space-role` and `token/size` are registered subtypes.
- `local-maintainer` updated the text-style invariant to revision 4, adding the multiple-of-4 line-height rule, after checking that the data file differed from the live invariant only by that rule. The registry re-checked all 8 registered text styles before accepting it, and the update event lists them.
- `design-agent` proposed, and `local-maintainer` registered, activated and filed under Eidos, in this order: the space, space-role and size invariants; the 4 scale steps; the 6 sizes; the 6 spacing roles (76 operations).

The registry now holds 77 merons, 142 relationships (19 new `contains`, 6 new `depends-on` set by the registry from what each role reads) and 369 events. All 19 new merons are active and contained by Eidos. Each role depends on exactly its step, and its registration event records space-role invariant revision 3 and that step's revision. An observer-policy export returns the same 77 merons and 142 relationships.

## Layout · 2026-11-03

Added migration `202611030003_layout.sql` (subtype `token/window`), the window invariant, the size invariant's raised limit (96 → 1600 px) in its data file, and data for 3 window classes, 2 content widths and 4 spacing roles (three margins and the pane gap). No new code. Verified Rust formatting, clippy with warnings denied (`--locked`), `tests/eio_data.rs` (the window classes pass their invariant with boundaries 0, 600 and 840 and panes 1, 1 and 2; the 10 spacing roles and 8 sizes pass theirs; a fourth boundary, three panes, a width off the grid and a width over 1600 are refused), the workspace tests and explorer JavaScript syntax.

The real PostgreSQL integration test passed in a disposable database on the shared stack, using the real invariant and data files. Its new layout workflow covers: a fourth window class and a three-pane class refused; the 3 classes and 2 widths registered; a 1210 px width refused as off the grid; the margins and pane gap registered with `depends-on` links to their steps; and lowering the size limit back to 96 refused because the page width would fail. No disposable database remains.

The live database was changed afterwards; see the next section.

## Eidos layout registered in the live registry · 2026-11-03

Before any change the `mer` and `mer_migrations` schemas were dumped with `pg_dump` to `infrastructure/supabase/backups/2026-11-03-xec-before-layout.sql` (owner-only, ignored by Git): 77 merons, 142 relationships, 369 events, 5 migrations. Then:

- Applied `202611030003_layout.sql`; six migrations are recorded as successful, and `token/window` is a registered subtype.
- `local-maintainer` updated the size invariant to revision 4 (non-breaking): the limit rose from 96 to 1600 px and its wording now names content widths, after checking that the data file differed from the live invariant only there. The registry re-checked all 6 registered sizes before accepting it.
- `design-agent` proposed, and `local-maintainer` registered, activated and filed under Eidos: the window invariant, the 3 window classes, the 2 content widths and the 4 spacing roles (40 operations).

The registry now holds 87 merons, 156 relationships (10 new `contains`, 4 new `depends-on`) and 414 events. All 10 new merons are active and contained by Eidos; the margins and pane gap depend on exactly their steps (16, 24, 24, 24). An observer-policy export returns the same 87 merons and 156 relationships.

## Shape and borders · 2026-11-03

Added migration `202611030004_shape.sql` (subtypes `token/radius`, `token/border-width`), the radius and border-width invariants, and data for 4 corner roles and 2 border widths. No new code. Verified Rust formatting, clippy with warnings denied (`--locked`), `tests/eio_data.rs` (all 6 pass their invariants; a corner of 10, a corner that is both 16 and fully round, a corner with neither, and a border width of 3 are refused), the workspace tests and explorer JavaScript syntax.

The real PostgreSQL integration test passed in a disposable database on the shared stack, using the real invariant and data files. Its new shape workflow covers: an off-scale corner, a corner that is both a number and fully round, and a 3 px border refused; the 4 corner roles and 2 widths registered; and taking 16 off the corner scale refused because the card corner would fail. No disposable database remains.

The live database was changed afterwards; see the next section.

## Eidos shape and borders registered in the live registry · 2026-11-03

Before any change the `mer` and `mer_migrations` schemas were dumped with `pg_dump` to `infrastructure/supabase/backups/2026-11-03-xec-before-shape.sql` (owner-only, ignored by Git): 87 merons, 156 relationships, 414 events, 6 migrations. Then:

- Applied `202611030004_shape.sql`; seven migrations are recorded as successful, and `token/radius` and `token/border-width` are registered subtypes.
- `design-agent` proposed, and `local-maintainer` registered, activated and filed under Eidos: the radius and border-width invariants, the 4 corner roles and the 2 border widths (32 operations). Each registration records the invariant revision it was checked against.

The registry now holds 95 merons, 164 relationships (8 new `contains`; corners and widths hold values, so no new `depends-on`) and 446 events. All 8 new merons are active and contained by Eidos. An observer-policy export returns the same 95 merons and 164 relationships.


## Governance roles and rules · 2026-11-06

Added `cedar-policy` 4.14.1 to `noi-gov`, the Cedar schema and the `gov.role` and `gov.rule` checks (`cedar.rs`), their wiring in the registry's `checks` module, migration `202611060002_governance_roles.sql` (subtype `rule/role`), the role and rule invariants and the 2 roles and 2 rules in `data/gov/`, and a Cedar view for roles and rules in the Explorer. Verified clippy with warnings denied (`--locked`), the workspace tests (noi-gov 9, four new: the schema holds every declared action; a role grants its own system's actions with two blanks; a role is a permit with blanks for who and where; a rule is one valid policy without blanks), `noi-gov/tests/agreed_roles.rs` (4: nothing without a grant; a role works only where granted; a fresh touch to approve or change access; only owners approve roles and rules), `tests/gov_data.rs` (3: every file passes its invariant and check; no secrets in the files), and the Explorer's typecheck, style tests (16) and fit test (25). The new files are formatted; formatting differences elsewhere in the workspace were there before.

The real PostgreSQL integration test passed in a disposable database, with a new Governance workflow: the 6 files proposed as one batch in reverse order, a role granting another system's actions and a rule with blanks failing their test run, the batch refused while they wait, approved once they are rejected, all 6 active and filed under `noi.gov`, and a later role naming an undeclared action refused by the role invariant. No disposable database remains.

Live: the `mer` and `mer_migrations` schemas were dumped first to `infrastructure/supabase/backups/2026-11-06-mer-before-governance-roles.sql` (owner-only, ignored by Git). Applied `202611060002_governance_roles.sql`; the `noi.gov` scope was added to the owner-only `governance.local.json` (revision 4). `design-agent` proposed the batch "Governance roles and rules" (8 changes, all passing their test run). On 6 Nov the user chose to start with only maintainer and owner and make every other role in the UI, but all 8 were approved together (16:34 UTC, by `local-maintainer` from the Explorer), so Observer and Contributor became active too. At the user's choice `design-agent` then proposed the batch "Deprecate Observer and Contributor" (2 changes, both passing their test run), and the user approved it. Live Mero now holds 116 merons: under `noi.gov`, the two invariants, Maintainer and Owner and the two rules are active, and Observer and Contributor are deprecated (revision 4). Once Governance's server exists, a deprecated role cannot be granted.

## Governance's server · 2026-11-06

Added the `server` feature and `noi-gov` binary (webauthn-rs 0.6.2, jsonwebtoken 11.1 with pure-Rust crypto, ed25519-dalek 2, axum 0.8, sqlx 0.8), schema `gov` (`crates/noi-gov/migrations/202611060001_gov.sql`), and `noi gov …` in Mero's command. Verified clippy with warnings denied across the workspace with the server on, the workspace tests (noi-gov unit 13: places, touch intents, copies), and `crates/noi-gov/tests/server.rs` on a disposable database with a software passkey: no copy means no; setup once; the first-passkey link works once; sign-in; proposing needs no touch, approving does, and a touch counts once, for exactly what it was for, from the session that made it; signed out reads only what visitors are granted, never more than reading; deprecated roles get no new grants; owner actions without a touch are refused; an agent with a run token proposes in Eidos only, never approves; vouches from another key, for unknown agents or for people are refused; a suspended sponsor stops its agent; ending sessions stops a run token at once; a maintainer who is not an owner cannot approve in `noi.gov`; handles are never reused; retiring a role ends its grants; a bad or empty copy is refused and the last stays; signing out ends a session; no stored row contains a session, run token or link; the record holds every kind of event and refuses update, delete and truncate; over HTTP, other hosts and sites are refused, signed out answers null, and the session cookie is HttpOnly and SameSite=Strict and never in a body. No disposable database remains.

Live: `mer` and `mer_migrations` dumped first to `infrastructure/supabase/backups/2026-11-06-mer-before-governance-server.sql` (owner-only; the migration does not touch them). Applied Governance's migration; the first copy from the running Mero holds Maintainer and Owner (active), Observer and Contributor (deprecated) and the two rules. Governance's server runs at http://localhost:8788 (launch config `governance`). Setup ran on 2026-11-07: `noi gov setup --handle hiddenstack --name …` made the first owner (Maintainer and Owner in `noi`). The first link expired unused (the sign-in page was tried instead and refused, since no passkey existed yet); `noi gov passkey add hiddenstack` gave a fresh link, opened in Safari, and a Touch ID passkey was added: the record holds "a link for the first passkey", "passkey added from a link" and "signed in". After this the sign-in page says to open the one-time link first, and the passkey-name field has `autocomplete="off"` (Safari had filled it with the handle).

## Mero asks Governance · 2026-11-07

```sh
cargo clippy --workspace --all-targets --features noi-gov/server   # clean
cargo test --workspace                                             # all pass
NOI_TEST_ADMIN_URL=postgresql://postgres:…@127.0.0.1:55322/postgres \
  cargo test -p noi-mer --test governance -- --ignored              # Mero asking a real Governance
NOI_TEST_ADMIN_URL=… cargo test -p noi-mer --test postgres -- --ignored
NOI_TEST_ADMIN_URL=… cargo test -p noi-gov --features server --test server -- --ignored
pnpm --dir ../ui/apps/explorer run typecheck && pnpm --dir ../ui/apps/explorer test
```

`crates/noi-mer/tests/governance.rs` runs Mero and a real Governance server on a disposable database, with a software passkey: the door holds only the three roles and two rules under `noi.gov`; Governance copies through it; signed out, nothing is read; signed in as a maintainer, Mero reads for you, and any other name is refused; a made-up session is no one; an agent vouched for by a test key, sponsored by you and allowed to propose only in `noi.inv` proposes there and is refused elsewhere, and never approves; approving without a touch is refused by `noi.gov.rules.fresh-touch`; Mero names the places (`noi.inv`, `noi.inv.step-three`); a touch for other places is refused; the right touch approves the batch, and every event of the new meron carries one `governance:record:N` (the proposal by design-agent, the transitions by hiddenstack); a used touch is refused; Governance's record holds allowed and refused answers for read, propose and review; with Governance down, Mero refuses reading and proposing. Unit tests: no answer means no (`noi-gov` client), places are named once in order, nobody types a name and the terminal changes nothing but proposals (`noi` CLI), credentials come only from `Authorization`, never a cookie, and the operator only reads.

Live: `mer`, `mer_migrations`, `gov` and `gov_migrations` dumped first to `infrastructure/supabase/backups/2026-11-07-mer-and-gov-before-step-3.sql` (owner-only). `runtime-logins.py` turned on both logins and wrote the two owner-only files. Checked as the operator with `SET ROLE`/`has_*_privilege`: Mero's login is refused on schema `gov`; Governance's has no use of `mer`; neither can create tables in their schema; Governance's cannot update `gov.record`. Both servers restarted with their own logins (`.claude/launch.json`); Governance copied 4 roles and 2 rules through the door. Mero refuses the signed out (403, "no grant allows read on noi"), a made-up session (401), another scheme (401) and a signed-out approval (401, before any lookup); its old pages are gone (404). The Explorer in the browser pane (signed out) shows "Sign in to see Mero". Opened in Safari with the first owner's sign-in from that morning, the Explorer read all 116 merons: Governance's record shows `hiddenstack · read · allowed` for 116 and 17 places (records 16 and 17), after the visitor refusals (13 to 15).

## Request logs · 2026-11-07

`cargo test -p noi-log` (5 tests, on the real formatting): a link's token and a query never reach a line; only well-formed request IDs are kept; one line per request with no secret in it (a request carrying `Authorization: Session …`, a session cookie, a link token and a query: none appears); a caller's request ID kept and returned; a decision during the request carries its ID and who asked; JSON lines carry the server, the full request ID and the status; `NOI_LOG=warn` writes nothing for an ordinary request. The workspace tests, clippy and the three real-database tests pass.

Downloads for the switch to `tracing-subscriber`, from crates.io, checked against `Cargo.lock`: tracing-subscriber 0.3.23 (214 KB), sharded-slab 0.1.7 (58 KB), valuable 0.1.1 (29 KB), tracing-log 0.2.0 (18 KB), thread_local 1.1.10 (16 KB), tracing-serde 0.2.0 (8 KB), matchers 0.2.0 (7 KB): about 350 KB. `cargo fetch` also fetched two crates already in the lock file for ed25519 on other platforms, fiat-crypto 0.2.9 (495 KB) and curve25519-dalek-derive 0.1.1 (12 KB).

Live, after restarting both servers: a signed-out `GET /api/registry` on Mero (403) wrote `request{service="mero" id=52e08bde-… path=/api/registry who="visitors"}: answered status=403`, and Governance wrote lines in the same `id=52e08bde-…` span for `/api/who` and `may: refused action=read places=116 touch=false record=37 why=no grant allows read on noi`. A made-up session (401) and `GET /link/LINK-SECRET-456` (logged as `path=/link/…`) left no secret in either log.

## Touch ID in Review · 2026-11-07

`pnpm --dir ui/apps/explorer run typecheck` and `pnpm --dir ui/apps/explorer test` (23 tests, 4 new in `test/passkey.test.mjs`: base64url both ways; Governance's request options carry bytes where WebAuthn wants them and the original is unchanged; the answer goes back in base64url; a cancelled or impossible touch says to use Safari). The touch semantics underneath (Mero's places, a touch for other places refused, the right touch approving the whole batch, a used touch refused) are in `noi-mer/tests/governance.rs`. Live: the Review pages compile and, signed out, show "Sign in to see Mero". The browser inside the Claude app reports WebAuthn and a platform authenticator, but holds no passkey for hiddenstack (it cannot reach Apple Passwords). The touch itself needs the first owner, in Safari: tried by them at 19:00 the same day and it worked. They proposed a change to `noi` (No Origins Infrastructure) from its Change form (Governance record 73, `propose` allowed) and approved it with Touch ID: record 82 `touch`, record 83 `review` allowed, and Mero's `meron.update` by hiddenstack carries `governance:record:83`. The change altered nothing visible (same name, definition, responsibility and spec); the meron's revision went from 3 to 4.
`noi-mer/tests/governance.rs` now also proposes an update that changes nothing (refused, "changes nothing") and a rename to the same path (refused, "already at this path"), then an update with one real difference (accepted).

## Governance's data · 2026-11-07

`noi-gov` unit tests (16, including `role_actions` and device labels) and `tests/server.rs` on a disposable database: your Profile shows your roles, one passkey and your sign-ins (one marked as this one) and no token, hash or credential; an owner sees accounts (hiddenstack, visitors, design-agent, steward), design-agent's page (sponsor, runs; no run token), the roles (owner's verbs `governance`, its holder) and the rules (fresh-touch with the view exception), and the record newest first, by page, refusals only, and by handle, all without a touch; a maintainer who is not an owner is refused (`no grant allows view`), a visitor too (`at most reading`); signing out one device works once, for your own only, and leaves this sign-in working; signing out everywhere ended the steward's two sign-ins. Over HTTP: `/api/profile` names the sign-in's device ("Safari on a Mac"), `/api/accounts` without view is 403, and signed out `/api/profile` is 403. All workspace and real-database tests pass; clippy clean.

Live, 7 Nov: hiddenstack proposed the fresh-touch rule's view exception in the Explorer (Safari) and approved it with Touch ID. Governance's record holds the touch (114), the review (115) and the copy (116); `gov.policies` holds `noi.gov.rules.fresh-touch` at revision 4 with `action == Action::"view"`; `GET /api/accounts` in Safari answered 200, recorded as `view` allowed for hiddenstack (119, 120).

Live: `gov` and `gov_migrations` dumped to `infrastructure/supabase/backups/2026-11-07-gov-before-session-ids.sql`; the migration applied (sessions now have `id` and `device`); both servers restarted. Signed out, `/api/profile` and `/api/accounts`, `/api/roles`, `/api/record` are refused (403).

## Editing roles and rules · 2026-11-08

`noi-gov` `form` tests (6): both rules and both roles in `data/gov` go to the form and back to the same text; the fresh-touch rule reads as its five parts (the same JSON the Explorer's sentence test uses); the same meaning written differently (reordered, a one-action list) still reads; what the form can't say is written by hand, with the reason (no actions, a `when`, a negation, an exception outside "every", annotations, `is`, blanks, not Cedar); the form refuses no actions, unknown verbs, names that aren't plain (a quote can't reach Cedar), an account that isn't an ID, a system twice, every action excepted, and a role with exceptions; no verb belongs to two systems. `noi` unit test: the read and write requests as the Explorer sends them, including a written-by-hand reading, the verbs, and refusing unknown fields. Explorer: `test/sentence.test.mjs` (5: both rules in words, who with names, what a change adds and removes, roles), typecheck, style tests (31 in all). Clippy clean, all workspace tests pass.

Live: Mero restarted; signed out, `POST /api/cedar/read` is 401. The changed pages build and render signed out; the mock page `/designs/gov/rule` was checked in the app's browser (the sentence follows each click, sending waits for Mero, hand mode and back, "it's viewing" highlighted as added). Signed in, in Safari (8 Nov): the user checked the rule's page and the Change page and said they look right; Mero's log shows three `POST /api/cedar/read` as hiddenstack, all 200. Not yet seen live: a signed-in click asking Mero to write Cedar, and a role or rule change in Review.

## claude-code · 2026-11-08

Live: `gov.policies` holds `noi.gov.roles.proposer` (active, read and propose); `gov.vouchers` holds `hyperbase:this-mac`; `gov.accounts` holds claude-code (agent, active, sponsor hiddenstack, vouched by hyperbase:this-mac) with a live grant of Proposer in `noi`, granted by hiddenstack. The record: voucher-add (167), touch, add-agent allowed and "agent made" (192–194), touch, grant allowed and "granted" (199–201). `noi propose --agent claude-code` made batch `02577070-465c-4838-b7dc-2fb9f0d7b6f4`, proposer claude-code, its one change waiting with a passing test run; hiddenstack approved it with Touch ID (record 222 touch, 223 review, 224 copy), so the Proposer role is at revision 4 with the clearer definition. Not run live: claude-code trying to approve (Claude Code's safety check refuses an agent's approval attempt even as a test); `crates/noi-mer/tests/governance.rs` covers that an agent never approves. The New role page and the Governance tab typecheck and build; they were used signed in by the user in Safari.

## Production pieces · 2026-11-08

Tests: `noi-log` (10: health ready only when every part answers; health checks stay out of the info log; a window allows so many then says how long to wait; too big and too slow are refused in words; a failure reaches the problems with its reason and no secret, health checks and normal answers do not); `noi-gov` `tests/server.rs` on a disposable database (health over HTTP; ten sign-in starts a minute from one address, then 429 with the wait, recorded once; five failed touches recorded and then a sixth touch and a sign-in wait 15 minutes, while another person still touches; problems kept and read by an owner, refused to a newcomer and a visitor); `noi-mer` `tests/postgres.rs` (the database answers; problems kept newest first, paged, refused below 500; migration counts 12 and 11) and `tests/governance.rs` unchanged and passing. Clippy clean with warnings denied; every workspace test passes.

Live, 8 Nov: `/health/alive` and `/health/ready` answer on Mero, Governance and the app; with the old Governance running, Mero's ready said `"governance": "not ok"` (503). A 2 MB request to Governance and a 6 MB one to Mero were refused (413, in words). The sign-in start limit was not tripped live (it would lock this Mac's own sign-in for a minute); the disposable-database test covers it. Migrations `202611080001_problems` applied to Mero and Governance after a backup (`2026-11-08-mer-and-gov-before-problems.sql`); `noi_mer_runtime` may insert into `mer.problems` but not update it; `noi_gov_runtime` may insert into `gov.problems`, not delete, and cannot read `mer.problems`. Signed out, `/api/problems` is 401 at Mero and 403 at Governance.

Images, 8 Nov: with the user's OK, pulled `rust:1.99-slim-bookworm`, `debian:bookworm-slim` and `node:22-bookworm-slim`; the crates came from this Mac's cache (`cargo vendor --offline`, 503 crates, `noi/vendor`, ignored) and pnpm installed the app's packages at the lockfile's versions. Built `noi/mero:dev` and `noi/governance:dev` (123 MB each) and `noi/app:dev` (286 MB). The first build failed because the ignore list's `**/target` also dropped `cc`'s own `src/target` folder, and a `*.pem` rule would have dropped crates' sample certificates; the secret rules now cover only our own folders. Inside each image: no `*.local.*`, vouching key or `.env` file; Mero and Governance run as uid 10001, the app as `node`; the image history holds no password. `try-here.sh up` (dev servers stopped) brought all three to healthy; from this Mac, `/health/ready` was 200 on 8787, 8788 and 3000, the app's `/merons` asked to sign in, and Mero refused a signed-out read after asking Governance (record 244); logs were JSON lines. `try-here.sh down` removed them, and the dev servers came back healthy.

## Governance's pages in the one app · 2026-11-08

Tests: `noi-gov` `tests/server.rs` on a disposable database (the first-passkey link is `http://localhost:3000/gov/link#…`, its token after `#`; pages given without a final `/` still make links inside `gov/`), `noi-mer` `tests/governance.rs` (software passkeys still sign in and touch) and every other workspace test pass; clippy clean with warnings denied. The app: typecheck, 47 tests (new: Governance's session cookie read from its answer with its lifetime; signing in sends you back only to a page of this app; creation options and a new passkey's public half in base64url), `next build`.

Live, 8 Nov: Governance's `/`, `/sign-in` and `/link/…` answer 404; its health and API answer. `/merons` signed out links to `/gov/sign-in?back=%2Fmerons`. On `/gov/sign-in`, signing in as hiddenstack reached Governance (`POST /api/sign-in/start` 200) and stopped at the passkey in the Claude app's browser, which cannot use it, with the message to use Safari. `/gov/link` with no token says so; `/gov/link#…` with a made-up token was refused by Governance ("this link has expired or was used"). With `logging.serverFunctions` off, the made-up token is in neither server's log. Both pages fit at 320, 599, 600, 839, 840 and 1440 px, light and dark, with no target under 44 px. Not run here: a real sign-in and a real first passkey (they need Safari and the user's touch).

## Subdomains on this Mac · 2026-11-08

Checked before deciding: macOS answers every `*.localhost` name with 127.0.0.1 (`dscacheutil`), `.test` names not at all. WebKit (a `WKWebView` probe): `gov.no-origins.localhost:3000` loads as a secure context with `PublicKeyCredential`, and a cookie for `no-origins.localhost` set on gov is sent on mero. Chromium: the same, and it takes RP ID `no-origins.localhost` on gov while refusing `localhost` there.

Tests: `noi-gov` `tests/server.rs` on a disposable database with base name `no-origins.localhost` (over https, since the software passkey takes http only for plain localhost): links open at `https://gov.no-origins.localhost:3000/link#…`; sign-ins on gov's name, touches on mero's; `another_passkey_link` refused for an unknown handle, recorded once, and its passkey signs in beside the first; a passkey used on a name outside the base name is refused. `noi-mer` `tests/governance.rs` with touches on mero's name. Every workspace test passes; clippy clean. The app: 53 tests (new: names and systems, the front desk's rewrites and redirects, plain localhost sent on, addresses keep scheme and port, sign-in sends you back only to our own names), typecheck, `next build` (with the Proxy).

Live, 8 Nov: `gov` schema backed up (`2026-11-08-gov-before-another-passkey.sql`), migration `202611080002_another_passkey` applied (links may be `another-passkey`). Governance starts with its pages at `http://gov.no-origins.localhost:3000/` and offers sign-in with RP ID `no-origins.localhost`. The front desk: `localhost:3000/merons` → 307 to mero's name, `/gov/sign-in` → gov's `/sign-in`, `/health/ready` passes through (200); gov's `/sign-in` and `/link` 200, `/gov/sign-in` → `/sign-in`, `/merons` → mero; eidos's `/` 200; the base name → mero. Signed out on mero's Review, the link goes to `gov.…/sign-in?back=` mero's Review; the tabs point at each system's name; signing in reached Governance and stopped at the passkey in the Claude app's browser. The gallery renders on eidos's name; a theme chosen there holds on mero. No console errors. Not run here: the user's new passkey on `no-origins.localhost` and a real sign-in and approval with it (Safari and Touch ID).

## Reinstate, accounts and sign-up · 2026-11-09

Tests: `noi-inv` (lifecycle: forward one step, and deprecated → active; retired stays final). `noi-mer` `tests/postgres.rs`: a meron reinstated and deprecated again directly; through Review, a reinstate without a reason is refused, with one it test-runs, is approved, meets today's invariants and is active, and its event keeps the reason; migrations count 12. `noi-gov` `tests/server.rs` with a stand-in mail server: setup and invitations need an email; sign-up refused while Observer is deprecated; a bad email and a taken handle are said and nothing is sent; a sign-up's email carries a link on gov's name, no account exists until it is opened, then the account is an Observer in `noi` (reads, cannot propose) and the link works once; signing in with the email in other capitals; the same email again gets "already has an account" and no link; the fourth sign-up in an hour to one email is refused; a lost-passkey request for an unknown email sends nothing, for a known one a link that adds a passkey that signs in; no address in the record. `mail.rs` against the real mail catcher (`NOI_TEST_SMTP=smtp://127.0.0.1:55325`, ignored by default): delivered, a line starting with a dot intact. Clippy and fmt clean; every workspace test passes. The app: 53 tests, typecheck, `next build` with `/gov/sign-up` and `/gov/lost`.

Live, 9 Nov: Mero's schema backed up (`2026-11-08-mer-before-reinstate.sql`) and `202611080002_reinstate` applied (the lifecycle guard and Review's change kinds). Mero and Governance backed up (`2026-11-09-mer-and-gov-before-mail-restart.sql`); Supabase's `smtp_port = 55325` opened and the stack restarted (118 merons and 3 accounts after; Mero and Governance reconnected, all ready). Governance's `202611090001_sign_up` applied; Governance runs with `NOI_GOV_MAIL=smtp://127.0.0.1:55325`. On gov's name: the sign-up page refuses "signing up opens once the Observer role is active"; the lost-passkey page gives the same answer for an unknown email and the catcher stays empty. claude-code proposed "Bring Observer back" (`41259f5d-…`): its test run meets the Role invariant and passes `gov.role`; Review shows Reinstate with the reason. Not done here: the owner's approval with Touch ID, the owner's email, and a real sign-up in Safari.

Fix, 9 Nov: opening any link failed ("Governance could not answer, so no"; Problems: `permission denied for table sign_ups`): `202611090001` made `gov.sign_ups` without rights for `noi_gov_runtime`, and the tests run as the owner. `202611090002_sign_up_grants` grants SELECT, INSERT, UPDATE and DELETE on it (applied on this Mac); `tests/server.rs` now checks that Governance's login can read every `gov` table and keep sign-ups.

Fix, 9 Nov: signed in on gov in Safari, mero still saw a visitor. A WebKit probe (a small server on 127.0.0.1:3999 setting cookies for `no-origins.localhost`) showed Safari's engine withholds a SameSite=Strict cookie on a script navigation from gov to mero, treating the two names under `.localhost` as two sites, and sends it when the address is typed; Lax is sent both ways. The app's session cookie is now SameSite=Lax.

## Review fixes · 2026-11-09

From the review of Governance and sign-in (findings 2, 4, 5, 7 and the app's listening address):
- **A failed answer closes its prompt.** Undoing a failed sign-in, touch or new passkey also undid closing its prompt, so one prompt could be answered again until it expired; now it is closed apart from the undone work. Tested: a wrong answer, then the right one to the same prompt, is refused "expired or was used".
- **A vouch starts now and buys one run token.** A vouch whose start is in the future is refused; each vouch's SHA-256 is kept with the run token it bought (`202611090003_vouch_once`, applied on this Mac after `2026-11-09-gov-before-vouch-once.sql`), so the same vouch is refused the second time. Tested both.
- **The visitor's address only from a header the host sets.** Next keeps an X-Forwarded-For a visitor sends, so the app no longer reads it; `NOI_VISITOR_HEADER` names the header the hosting service sets (its last entry). Unset on this Mac, so Governance counts the app's own address. Tested.
- **Governance's tests run as its own login.** Migrations run as the owner; everything else as a throwaway login holding only `noi_gov_runtime`, dropped afterwards. The whole test passes that way.
- **The app listens on this Mac only.** `next dev`/`next start` with `--hostname localhost` (it binds `[::1]:3000`; macOS gives `*.localhost` names both loopback addresses, and WebKit loads gov's sign-in). The front desk now rewrites from the request's own URL; with 127.0.0.1 it looped, since Next calls that address localhost inside the front desk. From the Mac's network address the app is refused.

Not changed here: OrbStack's `docker.expose_ports_to_lan` is true, so the database stack's ports (database with the local default password, mail catcher, Supabase API and Studio) are reachable from the local network; that is OrbStack's setting, for the owner to change.

## Your own pages under /account · 2026-11-09

Agreed 9 Nov (Governance Pages board): sign in, sign up, a lost passkey and add your passkey moved to `gov.…/account/sign-in`, `/account/sign-up`, `/account/lost` and `/account/link#TOKEN`; `/account` opens sign-in until Your account is built. Governance's emails and links point there (`SIGN_IN_PAGE`, `link_url`, one place for both). From the review: the app asks Governance one way (`call`, with `asYou` and `opening` on top) instead of five copies; sign-up and lost passkey share one email-a-link form, and `mailInbox()` says where emails wait on this Mac; "Signed out: sign in first." no longer names an address.

Tests: every workspace test, including the database tests (links open at `https://gov.no-origins.localhost:3000/account/link#…`; the "already has an account" email points at `/account/sign-in`); clippy and fmt clean. The app: 56 tests (new: the front desk for `/account/…`, back links refusing the new pages and allowing `/account`, `mailInbox`), typecheck, `next build`.

Live, 9 Nov: Governance rebuilt and restarted. On gov's name `/account/sign-in`, `/account/sign-up`, `/account/lost` and `/account/link` answer 200, `/account` → `/account/sign-in`, `/gov/account/sign-in` → gov's `/account/sign-in`, and the old `/sign-in`, `/sign-up`, `/lost` and `/link` 404. Signed out, Merons links to `gov.…/account/sign-in`. Sign up and Lost your passkey look as before; signed in, `/account` shows who you are. Not run: a sign-up through the new form (it would make a sign-up in this Mac's database); its email's link is covered by the database tests.

## Signing in with no typing, the lockout, sessions that run on · 2026-11-09

Agreed 9 Nov after the walk-through of Governance. **Signing in:** "Sign in with a passkey" asks Governance for a prompt that names nobody (`sign_in_any_start`, webauthn-rs `conditional-ui`, migration `202611090004_sign_in_any`: a sign-in prompt may have no account); the browser offers the site's passkeys and the answer names whose it is (`verify_any`: an active person, and one of their passkeys). The handle stays as the fallback under "Use your handle instead"; the email no longer signs in. **Lockout (finding 1, E):** failed sign-ins slow down the address trying, five in 15 minutes (`limit_failed_sign_ins`), and no longer lock the person; failed touches still lock their person, and only touches count. **Sessions (G):** each use moves the end to 12 hours away, at most 30 days after signing in, written at most every few minutes; the cookie lasts 30 days.

Tests: the database tests sign in with no typing (the software passkey can't choose, so it is told which of its own to use and its answer names the account, as a browser's does); an answer naming nobody here, or the visitors account, and a bad signature are refused and recorded (against the person when there is one); an email no longer starts a sign-in; five failed touches no longer stop that person signing in; a session an hour from its end moves to 12 hours away, isn't written again minutes later, and stops 30 days after signing in. Over HTTP: no handle gives a prompt naming no passkey; five junk answers from one address and that address waits ("5 sign-ins failed from here in 15 minutes: wait 15 minutes"), while another address and the person themselves still start. `noi_log` `Window::waits`. Every workspace test passes; clippy and fmt clean. The app: 56 tests, typecheck, `next build`.

Live, 9 Nov: `gov` backed up (`2026-11-09-gov-before-sign-in-any.sql`), migration `202611090004` applied as the operator, Governance rebuilt and restarted. A start with no handle answers a prompt naming no passkey; with `hiddenstack`, one naming its 3 passkeys; with an email, refused. The sign-in page signed out (WebKit, no cookies): one "Sign in with a passkey" button, "Use your handle instead" folded below, no email box. A page view moved the in-app browser's session to 12 hours away. The user signed out and back in with their passkey in Safari with Touch ID: it worked. Governance recorded a sign-out and a sign-in for hiddenstack, and the new session ends 12 hours away. A session made before today keeps its old 12-hour cookie until the next sign-in.

## Governance's home, Accounts and public profiles · 2026-11-09

Agreed 9 Nov (Governance Flow board): gov's `/` is a dashboard that shows what fits whoever is looking, with no forms; Give a role moved to the person's profile at the base name's `/@handle`, Add an agent to `gov.…/accounts`; Add a passkey lands on the dashboard. Governance: `GET /api/dashboard` (signed out, nothing asked; signed in, you and your roles; with `view`, how many hold each role, the latest changes and what needs attention) and `GET /api/people/{handle}` (public: handle, name, person or agent, since; active people and agents only). The app: the dashboard, the Accounts page, the profile page (`/at/[handle]`, shown for `/@handle` by the front desk), Give a role with the person fixed, Governance's own list (Dashboard, Your profile, and for owners Accounts, Problems, New role), changes in words (`lib/changes.ts`).

Tests: the database tests ask for the home signed out (`{"you": null}`), as a maintainer who isn't an owner (themselves and their roles, no changes or counts) and as an owner (counts, at most 8 changes of change kinds only, newest first, the steward's invitation by hiddenstack among them, no copy that moved nothing, attention); public profiles for a person and an agent, none for the visitors account or a handle no one has, no email in them. Over HTTP: the home and a profile answer with no sign-in, an unknown handle 404. A unit test for which revisions a copy moved. Every workspace test passes; clippy and fmt clean. The app: 60 tests (new: changes in words; the front desk for `/@handle`, `/%40handle`, `/at/…` and other names), typecheck, `next build`.

Live, 9 Nov: Governance rebuilt and restarted. `/api/dashboard` signed out answers `{"you":null}`; `/api/people/hiddenstack` and `/claude-code` answer, `/visitors` 404. In the app: gov's `/`, `/accounts` and `no-origins.localhost:3000/@hiddenstack` answer 200, `@nobody-here` 404, `/@hiddenstack` on gov's name and `/at/hiddenstack` on the base name → `no-origins.localhost:3000/@hiddenstack`. Signed out (WebKit, no cookies, desktop and phone width): what Governance is, Sign in with a passkey and Sign up; a profile shows name, handle, an agent, since. Signed in as an owner (the in-app browser): you and your two roles, the four roles each in a sentence with how many hold it, recent changes in words (grants, the agent, the vouch, Mero's revisions, setup), nothing waiting; Accounts lists people, agents and visitors with Add an agent folded; claude-code's profile shows its sponsor, purpose, Proposer in noi and Give a role. At 375 px nothing is wider than the window and every target meets the minimum. The dev server needed a restart before new CSS module classes reached the server's render. Not run: giving a role or adding an agent from the new pages (Touch ID, in Safari).

## Your account · 2026-11-09

Agreed 9 Nov (recovery decisions 6 and Q; finding P). Governance: `own.rs` (a change to your own account, a touch for exactly it, add a passkey while signed in, remove one, end sign-ins, change email by a link to it, notices), migrations `202611090005_your_account.sql` (a sign-in and a touch remember their passkey; a ceremony to add a passkey; `gov.email_changes`) and `202611090006_sign_ins_and_their_passkeys.sql` (earlier sign-ins learn their passkey from the record entry written with them), and `build.rs`, so a new migration rebuilds Governance: without it `migrate` ran without the new file, found when the backfill didn't apply. `/api/profile` gains your email and each sign-in's passkey; `/api/profile/sign-out` (ending another sign-in with no touch) is gone. The app: `gov.…/account` (signed out, the sign-in page and back), `gov.…/account/email#token`, one Touch ID hook for every Governance form (`app/gov/touch.tsx`), one `Line` for its cards, Your account in Governance's list and on the home.

Tests: the database tests make an account by signing up (no notice for its first passkey), refuse a change with no touch and record it, refuse removing the only passkey, add a passkey with a touch (once; the email is told, naming it, how and the browser), refuse removing the passkey that confirmed it and a touch made for another passkey, remove one (its sign-in ends, another passkey's goes on, it signs no one in either way), refuse ending this sign-in by its ID, end the other two, change the email (not until the link is opened; the old address told, not of the new one; the link once), refuse the same email, answer the same for one with an account (that address told, no link), stop at three an hour, and keep every address out of the record. The lost-passkey and command-line passkeys now send a notice. Over HTTP: a touch for a change needs a sign-in, an unknown change is refused, a made-up email link 403. A unit test: a touch names the change and what it is about, and is never an owner's action. Every workspace test passes; clippy and fmt clean. The app: 60 tests (new: the email link page is never a way back), typecheck, `next build`.

Live, 9 Nov: backup `2026-11-09-gov-before-your-account.sql`, both migrations applied, Governance rebuilt and restarted; 11 sign-ins learned their passkey (your Safari sign-in used the passkey added 8 Nov 17:47). `gov.…/account` signed out → `/account/sign-in?back=/account`; `/account/email` answers, and at 375 px nothing is wider than the window; a made-up link says it has expired or was used. Tried by hiddenstack in Safari the same morning ("they work"): added an email with Touch ID and the link (record 788 to 790), removed the Claude app's passkey (793, 794; the sign-in it made ended), and was refused removing Safari's passkey while confirming with it (touch 797, the guard). Not tried live: adding a passkey, ending another sign-in by itself, a notice email. The fit test can't run since step 3 (7 Nov): it reads Mero's registry signed out, which Mero refuses.

## Roles, the record, Accounts and profiles · 2026-11-09

Agreed 9 Nov (board page "Governance Step 5", decisions 1 to 5; 5 revised: stop recording allowed reads, finding I). Governance: `may` records no allowed read; `record_page` with `show` and one person's part; public agent sponsor and purpose; accounts with roles and last sign-in. Mero's client takes an answer with no record number. The app: Roles and The record pages, Accounts rows, the profile for owners and for yourself, End a role and End their sign-ins (Touch ID), the record's words (`recordWords` in `lib/changes.ts`), Roles and The record in Governance's list, the home's role lines to Roles; the app's tsconfig allows `.ts` endings, so `lib/changes.ts` can import `lib/sentence.ts` under Node's test runner.

Tests: the database tests check an allowed read gets no record number and adds nothing to the record, a refused one does, proposing still does; the record's views (everything holds no allowed read; changes holds no sign-in, notice, limit or view and no copy that moved nothing, and has a grant with its person and role; sign-ins only sign-in kinds; refused only refusals; an unknown view refused) and one person's part (by them or about them); an agent's public sponsor and purpose, a person's without; accounts with roles by name and a last sign-in. Mero's Governance test: allowed reads are not in the record, refused ones are. The app: 63 tests (new: the record's words for decisions, sign-ins, touches, Your account, copies). Every workspace test passes; clippy and fmt clean; typecheck and `next build`.

Live, 9 Nov: Mero and Governance rebuilt and restarted together (Mero's client must take an answer with no record number). `/api/people/claude-code` shows its sponsor and purpose; a signed-out read is refused and recorded (802); `@claude-code` shows them at 375 px with nothing wider than the window; `gov.…/roles`, `/record` and `/accounts` answer, signed out with the sign-in gate. Not seen: the signed-in pages (the in-app browser is signed out); End a role and End their sign-ins not tried (Touch ID, in Safari).

## Architecture review, group A · 2026-11-09

Agreed 9 Nov (board page "How It Is Built", the order A to E; details in `Planning/architecture-review.md`). Fixed: the open redirect after sign-in (`backTo`); an invite asks "grant" in each role's place with the same touch (`may_together`, `Proof` in decide.rs); emails go after Governance's lock is free, and a lost-passkey email after the answer (`send_later`); Governance answers its own failure with an error, not a refusal with database text (`Failure` in decide.rs), Mero says only that it could not answer, the app says plain words and names commands only on this Mac (`lib/backend.ts`, `app/error.tsx`); time limits on the app's calls (10 s reads, 30 s writes); the mock design pages on this Mac only; a one-time link leaves the address bar as its page opens, and a broken one says so. Moved to C: owners-only hand-written Cedar (needs a Governance action and a rule change through Review). `noi-gov/build.rs` already rebuilds on a new migration.

Tests: an inviter who may not grant can't give Owner, and no account is made; inviting with no role needs only invite; the owner's invite recorded a grant decision; with its right to read its copy of the rules taken away, Governance answers an error and records only "Governance could not decide, so no", then answers again; the lost-passkey email arrives after the answer; redirect cases for tab, newline, return, space, backslash, `..`, an unknown subdomain and HTTP hosted. Every workspace test passes; clippy and fmt clean; the app's 63 tests, typecheck and `next build` pass.

Live, 9 Nov: Mero and Governance rebuilt and restarted. A sign-in page with `back=/<tab>/evil.example` sends back to Mero's own page; `/account/link#…` leaves the address bar at once and keeps the token for the button; `/account/email#%E0%A4%A` says the link has no token; with Mero stopped, a page shows "This page couldn't load", plain words and, on this Mac, how to start it.

## Step 6: public Merons, Review closed, pages show what you may do · 2026-11-09

Agreed 9 Nov (board page "Governance Step 6", decisions 1 to 4). Mero: `read-review` (noi-gov `Action::ReadReview`), Review and its places ask it, `just_proposed`, batches carry `places` and `may_decide`, `/api/review/waiting`, `/api/registry?under=`; Mero's client remembers who for 30 s (by SHA-256) and asks `may_preview`. Governance: `may_preview` (`Proof::AsIfTouched`, at most 50 questions, nothing recorded), `POST /api/may/preview`. The local test policy reads `read-review` as reading. The app: `mayHere`, meron pages offer Change and New role only where you may propose, Review offers deciding only on batches you may decide and says why otherwise, Review signed out asks you to sign in for Review, Governance's signed-in pages check you with Governance (`profile`, read once per request) and read `govSnapshot` (noi.gov only), the badge from the count, words for `read-review`.

Tests: Governance's preview as an owner (review, propose, grant: yes, as if touched), as a visitor holding Reader (read yes, read-review and propose no), nothing recorded, 51 questions refused. Mero: an agent that may propose but not read Review is refused Review and the count but gets its batch back; a maintainer sees the batch's places and the count; reading under noi.gov holds only noi.gov, and a place with `%` is refused. Every workspace test passes; clippy and fmt clean. The app: 63 tests, typecheck, `next build`.

Live, 9 Nov: Mero and Governance rebuilt and restarted together. Signed out: the count and the noi.gov read are refused and recorded; the preview answers no to read and read-review and records nothing; `/merons` asks to sign in for Mero, `/review` for Review, `/roles` for Governance. claude-code proposed the batch "Read Review: Observer and Proposer" (Observer and Proposer gain `read-review`; Observer's description reworded, J): both changes check out and wait, and the agent got its batch back without reading Review. hiddenstack approved it in Review with Touch ID (records 845, 846; Governance copied it at once, 847: Observer revision 6, Proposer revision 5). Giving visitors Observer was then refused ("visitors may be granted reading, and nothing more": the check wanted every action to be `read`); fixed the same day, `read-review` counts as reading there while rule 5 still refuses it to visitors, with a test; Governance restarted. hiddenstack then gave visitors Observer in noi at 12:13. Signed out since: Mero's registry answers 200; Review and its count are refused ("signed out: at most reading"); meron pages show the tree and no Change; Review and Governance's pages ask to sign in. The fit test adapts to Review being closed signed out, and finds Playwright's headless shell at either of its folders. With the shell downloaded again (Playwright 1.56.1, `chromium_headless_shell-1194`, at the user's word), it passes all 31: 30 pages signed out (Merons, the gallery, Governance's home, sign-in, sign-up, lost, both link pages, a profile, a meron of every kind, two groups) at every window edge from 320 to 1440 px, light and dark, and reduced motion. Signed-in pages are not in it: it runs with no sign-in.

## Step 7: every yes for exactly what is done · 2026-11-09

Agreed 9 Nov (board page "Governance Step 7", decisions 1 to 6). Governance: one path for every decision (`Ask`, `decide_all`, `ask_alone`, `decide_in`); `intent` with `about`; `touch_start_about`, `may_about`; owner actions decided where written; `Change::ChangeEmail { email }` names a fingerprint; `no_after_touch`; `keep_up` and `gov.copies.version`; `tidy` every hour; a sign-up's account made at its passkey (`sign_up_waiting`, `make_signed_up`, `sign_up_passkey`); `write-cedar` in `GOVERNANCE_ACTIONS`. Mero: `touch_for` in its places answer and decisions, `change_actions` on approval, containers among the places, `hand_written` and `write-cedar` on proposing, `rules_version` sent with each question, `NewBatch.touch`. The app: Review's touch from Mero's `about`; grant, end a role and add an agent name their details; a new email's touch names it; the Change and New role forms ask Touch ID for hand-written Cedar (`useCedarTouch`, `askCedarTouch`). Migrations 202611090007 (copy versions), 0008 (Governance may delete expired rows), 0009 (a sign-up's prompt names nobody); backup `2026-11-09-mer-and-gov-before-step-7.sql`.

Tests: a touch for one role or place gives no other; a touch to send back doesn't approve; approving asks relate and transition; hand-written Cedar is refused without a touch and proposed with one, and refused to an agent (the local policy too); `keep_up` answers on the same version and refuses a different one it can't copy; `tidy` clears expired touches with Governance's own login; opening a sign-up's link and pressing makes no account; a refusal after a good touch is recorded; invites still ask grant; unit tests for intents with `about` and for `rules_version`. Every workspace test passes; clippy and fmt clean. The app: 63 tests, typecheck, `next build`; the fit test passes 31 of 31.

Live, 9 Nov: the three migrations applied; Mero then Governance restarted. Governance's copy at start carries its version, and a signed-out read passes `keep_up` with no further copy; Mero's places answer refuses an unknown decision (422). Not tried: anything with Touch ID (approving, giving or ending a role, a new email, hand-written Cedar, a sign-up), which needs Safari.

