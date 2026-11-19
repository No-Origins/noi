# No Origins

No Origins Infrastructure (NOI) is a small set of systems for building software in which every change is
proposed, checked and approved before it is real.

- **Mero** is the registry: every *meron* (a design token, a role, a rule, an invariant) with its spec, its
  state and its history. Changes arrive as proposals, are tested, and wait in Review.
- **Invariants** are the rules every meron must always pass, checked before anything is written.
- **Governance** decides who may do what. People sign in with passkeys and approve with a touch; agents act
  through runs that the machine they run on vouches for, and only ever propose. Every answer is recorded.
- **Eidos** is the design system: its tokens are merons, its components are in `@noi/eio-react`.
- **Hyperbase**, where agents will run, comes later.

It is in development on one Mac. Nothing is hosted yet.

## What is where

| Folder | What it holds |
| --- | --- |
| `noi/` | The Rust side, one Cargo workspace: Mero's and Governance's servers, the Invariants' and Eidos's checks, request logs; their migrations, Mero's data and the docs |
| `ui/apps/explorer` | The Explorer (Next.js), the one app: browsing Mero, Review, the Eidos components and Governance's pages |
| `ui/packages/eio-tokens` | Eidos tokens as CSS and TypeScript, made by Mero's writer on each branch (`pnpm eio:write`) and checked by Mero |
| `ui/packages/eio-react` | Eidos components, built only from the tokens |
| `infrastructure/containers` | Container images for the servers and the app |
| `infrastructure/supabase` | The local Postgres (Supabase) every system shares, each in its own schema |

One pnpm workspace covers the TypeScript side, with one lockfile at the top.

## Start it on a Mac

It needs Node.js 22 or later, pnpm 10.33, Rust (stable) and Docker.

```sh
pnpm install --frozen-lockfile                        # once, for the whole workspace
pnpm --dir infrastructure/supabase run stack:start    # the shared database
```

Then follow [noi's README](noi/README.md) for each server's own database login, the migrations, Governance's
first owner, and starting Mero (port 8787) and Governance (port 8788). The Explorer runs with
`pnpm --dir ui/apps/explorer dev` on port 3000, where each system has its own name (agreed 8 Nov): <http://mero.no-origins.localhost:3000> (Merons, Review), <http://gov.no-origins.localhost:3000> (Governance, sign in), <http://eidos.no-origins.localhost:3000> (the gallery). macOS sends every `*.localhost` name to this Mac, so nothing needs installing; plain `localhost:3000` sends you on. Sign in on gov with your passkey; the sign-in holds on every name. Hosted, the base name is `no-origins.com` (`NOI_DOMAIN`).

## How a change gets in

A person or an agent proposes it. Mero tests it against the Invariants and shows it in Review, where a person
who may approve does so with Touch ID. Governance records who approved what; Mero applies it and writes the
record number beside it. Eidos components are code today; bringing them into the same review is planned.

## Checks

```sh
pnpm --filter @noi/eio-react test && pnpm --filter explorer test     # the Eidos rules, the Explorer's styles
pnpm -r --filter "./ui/**" run typecheck
(cd noi && cargo test --workspace)
```

## Licence

MIT: see [LICENSE](LICENSE). The fonts in `ui/packages/eio-tokens/fonts` keep their own Open Font Licences.
