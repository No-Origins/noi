# Architecture and decisions

## Provenance and status

Source: [Invariants Integration Review 001](chatgpt-conversation://6ae2b15f-f280-83ee-ac15-9b7222f1dcbd), IR-001 and the consolidated Invariants working draft v0.2.0, retrieved 2026-10-29. The individual working drafts have since been retrieved from the architecture chats and reconciled in `specifications/reconciliation.md`; historical source text and message IDs are retained in `specifications/sources/`. The profiles describe implemented behavior and explicit deferred differences, without declaring the drafts stable. The later user decision selects Rust and Supabase over the earlier TypeScript/SQLite suggestions.

## Domain boundaries

`noi.inv` and `noi.gov` are peer foundational systems structurally contained by `noi`. The registry is an Invariants implementation capability, not a third foundation. Invariants validates structure, identity, relationships, lifecycle and declared evolution evidence. Governance interprets governance references and makes authority/policy/approval decisions. A `governed-by` edge or a `rule/policy` meron does not itself authorize anything.

Three Rust crates keep Invariants and Governance independent: neither core depends on the other. The registry composes both. The same Rust methods serve CLI operations and future HTTP/MCP adapters. The explorer exposes read-only HTTP; no remote mutation API or agent protocol is claimed to exist.

## Persistence and transaction boundary

PostgreSQL is authoritative for current merons, all historical identifiers, relationships, architectural generations, independent releases and immutable change events. Specifications are authored in source control. Exported JSON and diagrams are derived representations. A migration-owner applies schema changes; a backend runtime uses a separate, non-login group role through a dedicated login.

Every mutation takes a transaction-scoped PostgreSQL advisory lock before reading current state, then validates the proposal and revisions, asks Governance about the concrete intent, writes records and an authorization-tagged event, and commits. An event failure rolls back the mutation. The deliberately coarse lock serializes registry mutations and graph validation in this foundation. It is a correctness-first choice for a small registry, not a high-throughput design. Reads use ordinary snapshots; full graph exports use one repeatable-read transaction.

Database triggers add structural protection for direct backend SQL, but Governance remains a trusted runtime boundary. Possession of backend credentials allows SQL writes without calling Rust; these credentials must never reach agents or browsers. A database owner can override triggers, grants and audit retention. The append-only history is not a cryptographic, tamper-proof audit ledger.

## Identity and structure

UUIDs are assigned once. All foreign keys use UUIDs. Canonical paths are human-readable names and can change through `rename`; historical names remain permanently reserved and resolve to the same UUID. This implementation does not permit renaming back to an old alias, or renaming the three foundation paths. There is no hard-delete operation.

Namespace spelling does not establish structural parentage. Only `contains` does, with one parent per meron. Intermediate namespace segments (e.g. `tokens.color.text`) need not be registered systems. Thus reference components and tokens can be directly contained by NOI while retaining meaningful paths. Invariants/Governance may only acquire NOI as their structural parent. Dependency and containment graphs are independently acyclic.

## Lifecycle and evolution choices

The consolidated draft uses `proposed`; the earlier review says `draft`. We choose `proposed` as the admission state, followed by `registered → active → deprecated → retired`. Retirement preserves records and aliases, blocks new relationships and edits, and requires removal of incoming references and outgoing containment. Meron lifecycle does not implicitly transition releases.

Release records are separate: `planned → experimental → stable → deprecated → unsupported`. Inherited release mode is default. The NOI root is independent; the reference domains and other examples inherit through containment. Independent release boundaries stop inheritance even if they have no stable release. No seed generation/version is fabricated. Generations have positive numbers and an immutable recorded rationale; determining whether a lineage is architecturally justified remains Governance/human review.

Compatibility is not inferred from semantic version numbers or text edits. Updates record impact, rationale, supplied invariant checks and the transitive consumers of dependencies/invariants. A caller's non-breaking claim needs evidence but is not certified by an evaluator. Breaking/unknown evolution invokes a distinct Governance action. Invariants, consumer acknowledgments, release/generation requirements and approvals need a production Governance adapter and formal evaluation capabilities.

## Explorer sequence

Registry/database integration verification precedes explorer implementation. The explorer reads `/api/registry`, built from a transaction-consistent live database snapshot. The layout is deterministic from `contains` edges and stable paths. Other edges and release records come from that same snapshot. View filters, search, zoom and selection are local presentation state only. No drag operation, meron edit, or graph definition is persisted separately.

Initial views: complete graph, structural hierarchy, dependencies, governance; type/state filters; meron inspector; incoming/outgoing relations; release ownership; download of the current fetched snapshot; polling with an explicit stale state on failure. Future work: incremental event streaming, invariant impact reviews, generations across time and authenticated per-user projections.

## Upstream references

- [Supabase local development](https://supabase.com/docs/guides/local-development)
- [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [SQLx embedded migrations](https://docs.rs/sqlx/0.8.6/sqlx/macro.migrate.html)

## Shared infrastructure ownership

Supabase now lives at `/Users/hiddenstack/No Origins/infrastructure/supabase`, independently of this application. The same No Origins Systems database, volumes and ports are retained. The registry owns `mer`; other applications own separately assigned schemas and permissions. The registry's migration history is isolated in `mer_migrations._sqlx_migrations` using a dedicated migration connection. Existing registry-only public history is verified before adoption; mixed or inconsistent history is refused.

Application identity and the No Origins brand do not dictate a physical database boundary. The initial recommendation is one shared local platform, with separate environments and the option to split applications when isolation, recovery or workload needs justify it. See the shared platform's database-boundaries document for ownership and limits. Meron mutations continue through the registry's Invariants/Governance operations; a shared database does not grant other applications authority over Invariants tables.

## Minimum local governance

Superseded on 2026-11-07 by step 3 ("Mero asks Governance", below); kept as history. `ScopedAuthorizer` implemented GOV-001 using operator-controlled, versioned subject/scope assignments. Observers read, contributors read/propose, and maintainers execute existing-definition, graph, lifecycle and release changes. Parent restrictions cannot be widened by a child grant. The local CLI accepts a policy file and explicit subject; it does not authenticate remote users. See `specifications/GOV-001.md` for the manual review handoff and limits.

## Meron spec and invariants · implemented 2026-11-02

Decided and built for the first Eidos token (lime). Migration `202611020001_spec_invariants.sql`; checks in `noi-inv` (`InvariantSpec`, `conform`) and the registry operations.

- Every meron has a fixed `spec` field holding its checked content, such as a color token's value. `metadata` remains free-form notes that NOI never checks and products never rely on; `semantics` remains the human description.
- Invariants are merons of type `invariant`. An invariant's `spec` declares `applies_to` (a primary type and optional subtype) and a JSON Schema. A meron must pass every invariant that applies to it, so invariants can only add rules. If no invariant applies, `spec` must be empty. Invariants's built-in rules govern invariants themselves: they cannot apply to invariants, and what they apply to is fixed once created.
- Only admitted invariants (registered, active or deprecated) apply, so a contributor's proposed invariant changes nothing until a maintainer registers it. A meron's `spec` is checked when it is proposed or updated, and again when it is registered.
- Subtypes come from the fixed `mer.subtypes` list, so a misspelled subtype cannot silently escape its invariants. Adding a subtype is a migration.
- Invariant checks are deterministic: schemas use the 2020-12 dialect and may only reference themselves (`#…`), so a check reads only the meron and the invariant and any past check can be re-run with the same result.
- An invariant's version is its meron revision, and only the current revision applies. Registering or changing an admitted invariant is checked against every admitted meron it covers and refused if any would fail; those merons are fixed first. A gradual move loosens the invariant, migrates merons one at a time, then tightens it. An invariant cannot retire while it covers admitted merons. Events record the invariant revisions a meron was checked against (`invariants`) and the merons an invariant was checked against (`covered`).
- First use, recorded in `data/eio/`: `noi.eio` (system/design-system, independent release mode, its own Governance scope) contains `noi.eio.inv.color-token` and `noi.eio.color.palette.lime` (token/color, `spec.value` = `oklch(0.896 0.196 119.552)`, `#CEEE38`).
- Deferred: hash-chained, tamper-evident history and signed changes.

## Color roles and named checks · built 2026-11-02

Agreed on the Eidos board ("Color Rules" and "Color Roles" pages) and built for the first Eidos color set. Migration `202611020002_color_roles.sql`; color math and the role check in the new `noi-eio` crate; named checks in `noi-inv`; wiring in the registry's `checks` module.

- An invariant can name further checks a JSON Schema cannot express, each with object parameters: `"checks": [{"name": "eio.color-role", "params": {...}}]`. Invariants stores only names and parameters. The registry runs the checks it knows and refuses an invariant naming any other. `noi-inv` and `noi-gov` stay free of design-system knowledge; `noi-eio` depends on neither and has no storage.
- Palette colors (`token/color`) hold OKLCH values. Color roles (`token/color-role`, a new subtype) hold a `light` and a `dark` value, each a reference to a palette color or a mix of two (lime 14% into the page, as Circles does), plus the surfaces they are read on with a kind: `text` or `ui` (borders and focus). Decorative roles declare no pairs.
- The `eio.color-role` check resolves every reference to an admitted palette color and computes WCAG 2 contrast from OKLCH for each declared pair in both themes. The minimums (4.5 : 1 text, 3 : 1 ui) are parameters of the color-role invariant, so only a maintainer can change them. It runs when a role is proposed, updated or registered.
- A check now reads more than the meron and its invariant, so history records the invariant revision and every meron revision it read (`checks[].read`); a past check can still be re-run.
- When a role is registered, or an admitted role is updated, the registry sets its `depends-on` links to exactly what it reads, under the same Governance decision. A palette color in use therefore cannot retire, and its consumers appear in every update request.
- Updating any meron re-runs the checks of everything that reads it, with the proposed value in place, and refuses the update if a role would fail. Registering or changing an invariant re-runs its named checks on every admitted meron it covers.
- Palette colors carry a fixed `family` (brand or neutral) in the next color-token invariant version in `data/eio/`; status colors come later.
- Contrast is a validity rule, so it belongs to Invariants's checks, not Governance. Governance still decides who may change colors, roles and the minimums.

## Typography and the text-style check · built 2026-11-03

Agreed on the Eidos board ("Typography" page, agreed 3 Nov): four fonts with one job each (Yatra One for hero and display in English and Devanagari, Tenor Sans for titles, Geist for headings, body and captions, Geist Mono for labels and numbers), eight text styles (hero, display, title, heading, label, body, caption, mono), and 11 rules. Migration `202611030001_typography.sql`; the check in `noi-eio` (`typography.rs`); the same registry machinery as color roles.

- Three new token subtypes, each with an invariant in `data/eio/`: `font-family` (family name, the weights and scripts the font file actually has, true italic or not, license, source, an optional smallest size), `font-size` (one step of the 12 → 48 px ladder against a 16 px base) and `text-style` (font, optional fallback, size step, line height in px, weight, tracking, case, and whether it is reading text). Line height belongs to the style, not the size step. A style has no color field: text color comes from the color roles.
- What the schemas hold alone: the license must be `OFL-1.1` (a new one needs a maintainer), sizes must be on the ladder, and a style lists everything about itself.
- The `eio.text-style` check resolves the style's fonts and size step to admitted merons and holds it to the agreed rules: the weight must be one the font has (only the main font's; a fallback draws at its nearest weight and apps turn off faked bold and italic); no style below 12 px; a font's own smallest size (Tenor Sans: 24 px); reading text at least 16 px with line height at least 1.5 × size; and any style whose font or fallback can draw Devanagari has line height at least 1.25 × size, because its marks span 1.18 em. A fallback must add a script its font lacks. The minimums are parameters of the text-style invariant.
- Styles depend on exactly the fonts and size step they read, so a font or size in use cannot retire, and changing one (dropping Geist's 600 weight, say) re-checks every style that reads it.
- The Devanagari rule sets the title at 30 / 40 px rather than 30 / 36, since titles fall back to Yatra One for Devanagari.
- Size steps are named by their px value (`noi.eio.type.size.px16`) because a path segment cannot start with a digit (Tailwind's `3xl`); the Tailwind name is kept in metadata.

## Spacing, sizes and the reference check · built 2026-11-03

Agreed on the Eidos board ("Spacing and Sizing" page, agreed 3 Nov): a 4 px grid, a 0 to 64 px spacing scale, six spacing roles named by job, two control heights, a 44 × 44 touch target, three icon sizes, and 9 rules. Migration `202611030002_spacing.sql`; the check in `noi-eio` (`reference.rs`).

- Three new token subtypes, each with an invariant in `data/eio/`: `space` (one step of the scale: 0, 4, 8, 12, 16, 24, 32, 48 or 64 px), `space-role` (a reference to one step, nothing else) and `size` (a control height, touch target or icon size in px, a multiple of 4). Only the steps a role uses are proposed: 8, 16, 24 and 48.
- The roles: `space.gap.inline` 8, `space.gap.stack` 16, `space.gap.group` 24, `space.gap.section` 48, `space.inset.control` 16, `space.inset.card` 24. The sizes: `size.control.default` 40, `size.control.large` 48, `size.target.minimum` 44, `size.icon.small` 16, `size.icon.default` 20, `size.icon.large` 24.
- The `eio.reference` check is generic: its parameters name the spec field that holds a path and the token subtype it must point at (`{"field": "ref", "subtype": "space"}`). The registry resolves the path to an admitted token of that subtype and links the role to it with `depends-on`, as for color roles and text styles, so a step in use cannot retire. Later groups can reuse it with their own parameters.
- Text sits on the grid: the text-style invariant (revision 4 in the live registry since 2026-11-03) requires every line height to be a multiple of 4; all 8 registered styles pass it.
- Touch targets, icons fitting their line and naming by job are people-reviewed until components exist.

## Layout · built 2026-11-03

Agreed on the Eidos board ("Layout" page, agreed 3 Nov): layout follows the width of the window, not the device. Migration `202611030003_layout.sql`; no new check.

- One new token subtype, `window`, with an invariant in `data/eio/`: a window class records the narrowest window it covers (`minWidth`: 0, 600 or 840, so a fourth class needs a maintainer) and how many panes fit (1 or 2). The classes: `noi.eio.layout.window.compact` (under 600, one pane), `.medium` (600 to 839, one pane), `.expanded` (840 and up, two panes).
- Margins and the pane gap are spacing roles on existing steps, checked by the reference check: `space.margin.compact` 16, `space.margin.medium` 24, `space.margin.expanded` 24, `space.gap.pane` 24.
- Content widths are sizes: `size.width.reading` 560 (about 74 characters of Geist 16, measured at 7.47 px a character) and `size.width.page` 1200, centered. The size invariant allows up to 1600 px (revision 4 in the live registry since 2026-11-03). Once widths are registered, lowering the limit again is refused.
- No column grid tokens: layouts use window classes, panes, margins and widths until a layout needs columns.

## Shape and borders · built 2026-11-03

Agreed on the Eidos board ("Shape and Borders" page, agreed 3 Nov). Migration `202611030004_shape.sql`; no new check.

- Two new token subtypes, each with an invariant in `data/eio/`: `radius` (a corner role: `px` from 0, 4, 8, 12, 16 or 24, or `full` for fully round, exactly one of the two) and `border-width` (1 or 2 px, the only values off the 4 px grid). Roles hold their values directly, as sizes do: there are too few corners and widths to share, so the invariants hold the scale instead of separate scale tokens.
- A first version, chosen to change later: `noi.eio.radius.button` and `.pill` fully round, `.field` and `.card` 16. Each job has its own role, so one can change without the others; changing the scale itself is refused while a role uses the value being removed.
- `noi.eio.border.width.default` 1 px (card edges, dividers, fields) and `.focus` 2 px (the focus ring, drawn 2 px outside the control). Border colors are the registered color roles; borders are solid only for now.


## Governance roles and rules in Cedar · built 2026-11-06

Agreed on the board ("What Governance Is" and "Governance Sign-in", decisions and rules agreed 6 Nov): roles and rules are merons under `noi.gov`, written in Cedar, proposed in Review and approved by an owner; Governance enforces from its own copy of what was approved, so it never reads Mero mid-change. Migration `202611060002_governance_roles.sql` (subtype `rule/role`; `rule/policy` was already registered); the checks in `noi-gov` (`cedar.rs`, using `cedar-policy` 4.14).

- Each system declares its actions in code. Mero's are `noi_gov::Action::ALL`; Governance's are `GOVERNANCE_ACTIONS` (invite, add-agent, change-account, remove-passkey, grant, end-grant, end-session), carried out once Governance's server is built. Each system is also a Cedar action group, so a role can grant every Mero action with `action in Action::"mero"`.
- The Cedar schema (`schema_text()`) is built from those lists: an `Account` is in the `Role`s it holds where a request acts and in its `Scope`; a `Scope` is in its parent scope; every action carries `context.fresh_signature`.
- `gov.role` (the role invariant, `noi.gov.inv.role`): one Cedar permit template with two blanks, `principal == ?principal` and `resource in ?resource`, naming only actions its `system` declares, valid against the schema in strict mode. A grant fills the blanks.
- `gov.rule` (the rule invariant, `noi.gov.inv.rule`): one Cedar policy with no blanks, valid against the schema in strict mode.
- Only two roles exist on day one, both for the first owner: maintainer (every Mero action) and owner (every Governance action), with two rules (a fresh touch to approve or change access; only owners approve in `noi.gov`), in `data/gov/`. Approving a new role is a Mero review, so the first owner needs maintainer as well as owner. Every other role, such as one for design-agent or for signed-out visitors, is made later by an owner in the UI (decided 6 Nov; observer and contributor were dropped from the first batch). `noi-gov/tests/agreed_roles.rs` links them as grants and checks the decisions: nothing without a grant, a role works only where it is granted, a session without a touch cannot approve or change access, only owners approve roles and rules.
- Governance's server enforces them for Mero since step 3 (7 Nov); approving them was the last approval made the old way.

## Governance's server · built 2026-11-06 (step 2)

Agreed on the board ("Governance Server", all three decisions 6 Nov). `noi-gov` gains a `server` feature (Mero builds without it) and the `noi-gov` binary, also reached as `noi gov …`. Schema `gov` has its own migrations (`crates/noi-gov/migrations`, history in `gov_migrations`) and runtime role `noi_gov_runtime`; Mero's role gets nothing in it.

- **Who:** `accounts` (permanent ID, handle, display name, kind person/agent/visitors, state, made by; agents also sponsor, purpose, vouched by), `handles` (every handle ever used, append-only, so none is reused), `passkeys` (webauthn-rs public halves and counters), `links` (one-time: first passkey 10 min, invitation 24 h).
- **Proof:** `sessions` (12 h), `touches` (a passkey signature over exactly one action on exactly these resources, once, within 60 s, for the session that made it), `run_tokens` (15 min). Sessions, links and run tokens are random 32-byte tokens kept only as SHA-256 hashes, so nothing stored can sign anyone in. Governance needs no signing key of its own: every system asks it, so tokens need not be self-verifying.
- **Access:** `grants` (account, role path, place; ended, never deleted), `policies` + `copies` (its own copy of the roles and rules approved in Mero, taken from Mero's `GET /api/governance/roles-and-rules` since step 3 (it was `GET /api/registry`); each is checked again with `gov.role`/`gov.rule`; a copy that fails or holds no roles is refused and the last copy stays; roles no longer in Mero end their grants: decision 2). Deprecated roles stay in the copy so existing grants work, but get no new grants.
- **"May they?"** (`POST /api/may`): finds the asker (session, run token, or visitors), refuses undeclared actions, refuses anything but reading when signed out (rule 5), uses a matching touch for `context.fresh_signature`, links the asker's grants into the copied role templates, adds the copied rules, and asks Cedar for every resource. A resource is a place (`Scope`, in every place above it) or an account (in `noi`); the asker is in each `Role` they hold where the resource is. Errors, no copy or no answer mean no.
- **Record:** every answer, sign-in (failed ones too), touch, passkey, grant, invitation, agent, run token, copy and setup, append-only (update, delete and truncate are refused by triggers).
- **Agents:** a platform vouches with a short EdDSA JWT (`kid` names the voucher in `gov.vouchers`, audience `noi-gov`, at most 5 min); the agent must be active, vouched for by that platform, and its sponsor active (decision 12). On this Mac the platform block is `hyperbase:this-mac`, an Ed25519 key in an owner-only file (`noi gov voucher add-this-mac`); `noi gov vouch` signs as Hyperbase will.
- **First owner:** `noi gov setup --handle --name`, only while no live Owner grant exists: the person, Maintainer and Owner in `noi`, and a 10-minute first-passkey link. `noi gov passkey add HANDLE` gives a new first-passkey link only while the account has none.
- **HTTP** (loopback, port 8788, open as `http://localhost:8788`): Host must be this machine, any Origin must be localhost, POSTs must be JSON. Governance serves its own small pages for the first passkey and sign-in; the session is an HttpOnly, SameSite=Strict cookie that no response body contains. Passkeys use RP ID `localhost` on any port, so the Explorer can use them in step 4.
- Not yet: suspending, closing or renaming accounts and removing passkeys (`change-account`, `remove-passkey`) are declared but not built; sign-in in the Explorer is step 4. (Mero asking, and Governance's own database login, came with step 3, below.)

## Mero asks Governance · built 2026-11-07 (step 3)

Agreed on the board ("Mero Asks Governance", both decisions 7 Nov). Who you are comes only from signing in (rule 1): `--review-as`, `NOI_ACTOR`, `--actor`, `--dev-actor`, `--governance-policy` and the file of names (`governance.local.json`) are gone; the file and Mero's old pages on port 8787 are archived in `infrastructure/supabase/backups/2026-11-07-step-3-retired/`.

- **The boundary is asynchronous.** `noi_gov::Authorizer::authorize` returns a future (`Answer`), so an authorizer can ask Governance's server while the registry holds its write lock. `Credential` (session, run token, visitor) and `Target` live in `noi-gov`'s library; `places()` names each resource's path once, in order: what Mero asks about and what a touch is for.
- **`AskGovernance`** (feature `client`, the only authorizer Mero's binary uses for people and agents): `POST /api/may` with the credential, the action, the places and, for `review` only, the touch. Allowed means `Decision::Allow { reference: "governance:record:N" }`; the answer's handle must equal the actor Mero records, so Mero never writes a name Governance did not give. No answer within 5 s, an unreadable answer, or a refusal means no. `GovernanceClient::who` (`POST /api/who`) names the holder of a credential; `run_token` trades a vouch; `copy` asks Governance to copy again.
- **Mero's server** (`noi serve`, loopback, no identity of its own): each request carries `Authorization: Session <token>` (from the Explorer's server, read from Governance's HttpOnly cookie) or `Run <token>`, or nothing (a visitor). Cookies are not read. Signed out, a change is refused before anything is looked up. `POST /api/review/places` says what approving (every waiting proposal of these, or these batches) or sending back or rejecting asks about; `approve`, `send-back` and `reject` take the `touch`. After an approval that changes `noi.gov`, Mero asks Governance to copy again. `GET /api/governance/roles-and-rules` is the one read Mero answers without asking: the rule merons under `noi.gov`, which Governance needs in order to answer at all (rule 8: they hold no secrets).
- **One approval, one question** (decision 1): approving asks once, with the touch; the batch's steps then run under `UnderApproval`, which repeats that answer, so every step's event carries the same record number and the proposer is not asked again.
- **The terminal** (decision 2): `get`, `list`, `history`, `review`, `effective-release` and `export` read as the operator (`Operator` allows reading only; the operator holds the database password and is not an account). `propose` and `revise` act for an agent with `NOI_RUN_TOKEN`, or with `--agent`, which plays Hyperbase's tool runner: `noi-gov vouch` signs with this Mac's key and `/api/run-tokens` trades it for a 15-minute run token. `approve`, `send-back`, `reject`, `update`, `rename`, `transition`, `relate`, `unrelate`, `plan-release`, `transition-release` and `seed` are gone from the terminal.
- **Reading one batch** needs reading only what it touches; reading all of Review also needs reading `noi`. So an agent allowed in one place sees the batch it proposed.
- **Rename** asks about both places, where the meron is and where it would go.
- **Database logins:** `noi_mer_runtime` (schema `mer` only) and `noi_gov_runtime` (schema `gov` only; it cannot update `gov.record`) can now log in, with SCRAM verifiers set by `infrastructure/supabase/runtime-logins.py` (the database logs role changes, so a password is never sent). The passwords are only in `noi/mero.local.env` and `noi/governance.local.env` (0600, ignored by Git). The operator keeps `postgres`. `LocalDevelopmentGrant` and `ScopedAuthorizer` remain only as test stand-ins; no binary uses them.
- **The Explorer** passes your sign-in to Mero from its server; signed out, or with no grant, it shows "Sign in to see Mero" with a link to Governance's sign-in page. Open it at `localhost`, not `127.0.0.1`, so the browser sends Governance's cookie. Approving, sending back and rejecting wait for the touch in the Explorer (step 4); proposing works signed in.
- Limits on this Mac: agents still run in your shell, as you, so they could read the login files and this Mac's Hyperbase key (sandboxes fix this). No agent account or voucher key exists yet: you add design-agent and its role in step 4.

## Request logs · built 2026-11-07

Agreed 7 Nov ("logs now, the rest later"): request logs now; health checks, limits, errors you can see and packaging as their own step before hosting (board: Servers and Apps, part 6).

- **`noi-log`**, built on `tracing` and `tracing-subscriber` 0.3 (switched the same day at the user's request from a small logger of our own; only the `std`, `fmt`, `env-filter`, `json`, `smallvec` and `tracing-log` features, no colours). `init()` logs on standard error; `NOI_LOG` sets how much (default `info,hyper=warn,h2=warn,reqwest=warn`); `NOI_LOG_FORMAT=json` writes one JSON object per line. `around(service, router)` runs every request in a `request` span (server, request ID, method, path, and `who`, recorded by `noi_log::who` once the server knows) and writes `answered status=… ms=…` when it is answered. Anything else logged during the request, by us or a library, carries the span.
- **Nothing secret:** no headers, no bodies, no query strings; a one-time link's token is cut from its path (`/link/…`). Mero records the handle Governance gave; Governance's `may: allowed` or `may: refused` line has the action, how many places, whether a touch came, the record number and, for a refusal, why. Credentials never appear.
- **One request, both servers:** the request ID comes from a well-formed `x-request-id` or is new; it goes back on the response, and Mero sends it on to Governance (`GovernanceClient::for_request`), so Mero's line and Governance's `who`, `may` and request lines share it.
- Not yet: metrics or a log collector; they can come with the production step.

## Touch ID in Review · built 2026-11-07

The first piece of step 4, so approving works again (since step 3 nothing could be approved without a touch).

- **In the Explorer** (`ui/apps/explorer`): Approve all, Approve, Send back and Reject each ask for a touch first. `askTouch` (a server action) asks Mero which places the decision covers (`POST /api/review/places`, whole batches for approving) and Governance to start a touch for exactly that action and those places (`POST /api/touch/start`, with your session cookie passed on from the Explorer's server, `lib/governance.ts`). The browser asks for Touch ID (`navigator.credentials.get`, options decoded by `lib/passkey.ts`), `finishTouch` sends the answer to Governance (`/api/touch/finish`), and the decision goes to Mero with the touch. A note is checked before Touch ID asks. While it asks, the page shows what the touch is for.
- **Passkeys belong to localhost on this Mac**, and Governance accepts any port (`allow_any_port`), so a touch made on localhost:3000 checks out. Your passkey is in Apple Passwords: Safari, Chrome and Dia can use it; the browser inside the Claude app cannot (it has its own, empty passkey store), and the Explorer says so instead of failing silently.
- After an approval in `noi.gov`, Mero asks Governance to copy the roles and rules again, and the page says so.
- **A change that changes nothing is refused** (7 Nov, after the first real approval updated `noi` without changing anything): an update that leaves every field as it is, or a rename to the path the meron already has, is refused when proposed or revised, before a batch is made (`refuse_no_op` in `review.rs`).

## Governance's data · built 2026-11-07

What Governance's pages will show, whatever the layout (`src/server/views.rs`). Nothing returned contains a token, a hash, a credential ID or a public key.

- **Profile** (`GET /api/profile`, your own; no verb needed): handle, name, kind, since; your live roles (role, place, when, who granted it); your passkeys by name (added, last used); where you are signed in (device, started, ends, which one is this). `POST /api/profile/sign-out {session}` ends one of your own sign-ins by its public ID; `POST /api/profile/sign-out-everywhere` ends them all and clears the cookie. Signing out needs no touch.
- **Sessions** gain a public `id` and a `device` label (migration `202611070001_session_ids.sql`), set from the User-Agent at sign-in or link ("Safari on a Mac", "the Claude app on a Mac"); only a label, never a decision.
- **The `view` verb** (Governance's eighth): `GET /api/accounts` (everyone, with sponsor and how many roles), `GET /api/accounts/{handle}` (its roles, passkeys by name, live sign-ins, an agent's last 20 runs), `GET /api/roles` (each role's verbs from its Cedar, its state, who holds it where; the rules; when the copy was taken), `GET /api/record?before=&who=&kind=&refused=&limit=` (newest first, 1–200 entries, `next` for the page after). Each asks "may they view, in noi?" and is recorded. Owners hold every Governance verb, so they get `view`; signed out, at most reading, so never.
- **The fresh-touch rule** (`data/gov/rules/fresh-touch.json`) gains `|| action == Action::"view"`: viewing changes nothing, so it needs no touch; every Governance verb that changes something still does. The live rule changed the same way: hiddenstack proposed it in the Explorer and approved it with Touch ID (7 Nov, Governance's record 114 touch, 115 review, 116 copy); Governance's copy is revision 4, and the first views were allowed without a touch (records 119 and 120).

## Editing roles and rules · built 2026-11-08

Nobody types Cedar (all five decisions agreed 8 Nov; board page "Editing Roles and Rules"). Cedar stays what is stored and checked; a form writes it, and every role and rule reads as a sentence.

- **The five parts** (`noi-gov/src/form.rs`): a rule forbids or permits · who (anyone, holders of a role, one account) · doing (per system: every action except some, which also covers actions added later, or only some) · where (everywhere, or one place and everything under it) · unless (a fresh touch, holding a role; an excepted action is an "unless" too). A role is one system and every one of its actions or some of them. `write_rule` and `write_role` write the Cedar in one layout and run the same checks Mero runs on a proposal; names that go inside Cedar quotes must be plain (lowercase letters, digits, dots and dashes), accounts must be IDs.
- **Reading is strict, then proven.** `read_rule` and `read_role` accept only what the parts can say; anything else is "written by hand", with the reason. A reading counts only when the Cedar written from it means exactly what is stored: the Cedar library's own JSON form of both is compared, setting aside only what cannot change the meaning (the order of a list of actions or of `||`, a one-action list, `in` an action that holds no others). Every role and rule in `data/gov` goes to the form and back to the same text (test).
- **Mero's server** answers `POST /api/cedar/read {items: [{kind: "rule", cedar} | {kind: "role", system, cedar}]}` with each reading (`{form}` or `{by_hand}`) and every system's verbs, and `POST /api/cedar/write {kind, form}` with `{cedar}` or a 422 in words. Both need a sign-in; they read no data, only the text sent (at most 200 items, 20 000 characters each).
- **The Explorer** never parses or writes Cedar. The Change page for a role or rule shows the editor (`app/merons/CedarEditor.tsx`) instead of the JSON box: each click asks Mero for the Cedar, the sentence (`lib/sentence.ts`) updates at once, and sending waits until Mero has written it. Owners (from Governance's Profile) may switch to writing Cedar by hand; a rule the form can't read opens as Cedar, read-only for everyone else. A rule's page shows the sentence above its Cedar; Review shows a role's or rule's change as the sentence before and after, what it adds highlighted and what it removes struck through, with the Cedar one click away. If Mero can't read a side, Review shows the Cedar as before.
- Mock page with sample data: `/designs/gov/rule`.

## claude-code · added 2026-11-08

The first agent account (option B, agreed 7 Nov; steps and decisions agreed 8 Nov, board page "Adding claude-code").

- **The Proposer role** (`noi.gov.roles.proposer`, Mero: `read` and `propose`), made by hiddenstack with the Explorer's new **New role** page (on the Roles group: name, definition, responsibility, one system and its verbs through the role editor, why) and approved in Review with Touch ID. Governance copied it at once.
- **This Mac vouches** (`noi gov voucher add-this-mac --key-file hyperbase-vouch.local.pem`): an Ed25519 key, the private half in `noi/hyperbase-vouch.local.pem` (owner-only, ignored), the public half in `gov.vouchers` as `hyperbase:this-mac`. Hyperbase takes this over when it runs agents. Known limit: anything running as the user on this Mac can read the key; an agent can still only propose.
- **claude-code** (agent, sponsored by hiddenstack, signed for only by `hyperbase:this-mac`) and its grant of Proposer in `noi` were made on the Explorer's plain **Governance** tab (`/gov`: add an agent, give a role, the accounts), each with a fresh touch for exactly that action (`add-agent` in noi; `grant` on the account). These pages are plain until the layout.
- **How it proposes:** `noi propose <files> --agent claude-code --started-by hiddenstack` signs a one-minute vouch with the key, trades it at Governance for a 15-minute run token, and sends the batch as claude-code. It reads and proposes anywhere in noi; approving, sending back and rejecting need a person's touch.

## Production pieces · built 2026-11-08

The four pieces agreed for before hosting (board page "Production Pieces"). Shared parts live in `noi-log` (now: logs, health, limits).

- **Health checks** (`noi_log::health`): `/health/alive` (running) and `/health/ready` (can do its job) on Mero (its database, and Governance answers), Governance (its database, and a copy of the roles and rules) and the one app (`app/health/*/route.ts`: Mero and Governance answer). No sign-in; the body is only `ok` or which part is `not ok`. Health requests log at debug, so a host's probes don't fill the log.
- **Limits** (`noi_log::limits`): Governance takes at most 1 MB a request, Mero 5 MB (a batch); every answer within 30 seconds, else 503 "this took longer than 30 seconds, so it was stopped". Refusals are JSON in words. Governance counts starts (`Window`, in memory): sign-in and one-time-link starts per address, touch starts per sign-in (they arrive from the one app's server, whose address says nothing about who asks), 10 a minute each, then 429 with how long to wait; one refusal a minute per key is recorded (`limit`). Failed sign-ins and, now, failed touches are recorded; five in 15 minutes and that person waits 15 minutes (counted from the record, so it holds across restarts; a cancelled touch never finished, so it doesn't count). Behind a hosted proxy the address will need the proxy's forwarded address, set when we host.
- **Problems** (`noi_log::around_reporting`, `mer.problems`, `gov.problems`): every answer of 500 or more (health checks aside) is kept with its request ID, method, path (no query; a link's token cut) and the inner reason (`noi_log::Why`, set by the server; the asker never sees it). Each runtime login may add and read its own problems, never change them or read the other's. `GET /api/problems` on each server, for those who may view (owners; Mero asks Governance). The one app's **Problems** page (`/gov/problems`) lists both, newest first. If a problem can't be written, the log line remains.
- **Images** (`infrastructure/containers/`): `noi.Dockerfile` (targets `mero` and `governance`: built on rust 1.99 slim from `noi/vendor`, run on debian bookworm slim as an unprivileged user, JSON logs, `NOI_IN_CONTAINER=1`) and `app.Dockerfile` (node 22 slim, Next's standalone output). Each has its own `.dockerignore` that lets in only what the build needs and keeps every `*.local.*`, `*.pem` and `.env` out. Health checks are built in. Inside an image a server may listen on the container's own network (`noi_log::in_container`); on this Mac, loopback only. `compose.yaml` and `try-here.sh` run the three together on this Mac against today's database: they share one network, so they reach each other at 127.0.0.1, and each database login comes from its owner-only env file into that run's environment only. Migrations stay a one-off operator command.
