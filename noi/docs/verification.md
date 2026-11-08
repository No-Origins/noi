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
