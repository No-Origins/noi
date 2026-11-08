# No Origins UI

The front ends of No Origins Infrastructure. They are part of the repository's one pnpm workspace, kept at the top of the No Origins folder with one lockfile: run `pnpm install` there, once, for everything. Data never lives here: it comes from Mero (`../noi`).

- `packages/eio-tokens` (`@noi/eio-tokens`): Eidos tokens, generated from Mero, with the fonts bundled for offline use.
- `packages/eio-react` (`@noi/eio-react`): Eidos components, built only from the tokens. Button, Field, Badge and Count, Tabs and Tab, Card, TreeRow, Swatch, Icon, MenuIcon (☰ that turns into ✕), Panes (a list and its page) with WhenOnePane and WhenTwoPanes, and Drawer (a modal panel that covers the window, growing out of the button that opens it). A TreeRow with `onToggle` has its arrow as its own button, and `appear` drops in a row an arrow revealed. `pnpm test` there checks the agreed rules on every component's styles: colors only from roles, lengths only from tokens, no window widths, durations or curves of their own, and every token it reads exists.
- `apps/explorer`: the Explorer, the app for Mero (Next.js). `pnpm dev` serves it on port 3000. It reads Mero through `noi serve` (port 8787) as you, signed in through Governance (port 8788); set `MERO_URL` and `GOVERNANCE_API` to point elsewhere. Start both first. It works in every window from a 320 px phone up: where two panes fit, a list sits beside its page; where one pane fills the window, the page fills it and a menu button opens a menu over the whole window with the views, this view's list (the tree, or the batches) and Theme. In the tree an arrow opens or closes its row and a name opens its page. `/merons/…` browses Mero by path: the tree and search, and a page for each kind of meron with its connections and record; `/merons` shows the root. `/review` lists batches of proposed changes, draws each change as it would be with its test run, and approves, sends back or rejects them; Change on a meron sends your own edit there. Deciding asks for your touch first (Touch ID, in Safari) through Governance. `/eidos` shows every component in light and dark. The theme you pick is a cookie, so the server paints the page in it. `pnpm test` checks the Explorer's styles: no window widths of their own, and every token they read exists. `pnpm test:fit`, with the explorer and mero launch settings running, opens every kind of page at both edges of every window class (320 px up to 1440 px, the edges read from the tokens) in light and dark, opens the menu wherever it shows, and fails if a page or the menu is wider than the window or a control is under the 44 px target. It also checks that with reduced motion every transition and animation lasts 0 s. It drives a headless Chrome over the DevTools protocol; set `CHROME` to choose one. It can't run today: since sign-in (7 Nov) Mero refuses its signed-out reads, and a way for tests to read Mero isn't decided yet.
- `apps/hyperbase-studio`: the app for Hyperbase. Later.

## Using the tokens in an app

Add the packages to the app's `package.json` as `"@noi/eio-tokens": "workspace:*"`, then import the CSS once, in the root layout:

```tsx
import '@noi/eio-tokens/tokens.css'
import '@noi/eio-tokens/fonts.css'
```

Every role, size, space, corner and border is a CSS variable named from its path in Mero, such as `--eio-color-text-primary` for `noi.eio.color.text.primary`. Text styles are classes, such as `.eio-type-style-heading`. Colors are roles only: palette colors are not CSS variables, so components cannot skip a role. Set `data-theme="dark"` or `data-theme="light"` on any element to choose a theme for it; without one, the page follows the system. For values in code, `import { tokens, windowClass } from '@noi/eio-tokens'`.

Window classes are the only place a window width is written: `tokens.css` switches four variables at each class's width. `--eio-window-margin` is the page margin, `--eio-window-panes` is 1 or 2, and `--eio-window-one-pane` and `--eio-window-two-panes` are `display` values (`contents` or `none`) for what shows only where one pane fills the window, or only where two sit side by side. Read these instead of writing a `@media` width; the rules tests fail on any other. Panes from `@noi/eio-react` does the list-and-page layout with them; on one pane, offer the list in a Drawer.

Motion is three durations and one curve: `--eio-motion-duration-ms100` (hover, press and selection fading their color), `-ms200` (opening rows, anything leaving), `-ms300` (anything arriving), and `--eio-motion-easing-standard`. With the system asking for reduced motion, `tokens.css` sets every duration to `0ms`. Write `transition: background-color var(--eio-motion-duration-ms100) var(--eio-motion-easing-standard)`, never a duration or a curve of your own; the rules tests fail on one. Focus rings, page changes and the theme switch never animate.

## Regenerating the tokens

Mero writes them itself after each approval in Eidos (`noi serve --eio-tokens`, as the launch setting `mero` runs it). To write them by hand, as the operator, run from `../noi`:

```sh
scripts/noi-dev export eio --output ../ui/packages/eio-tokens
```

It writes `tokens.css`, `tokens.ts` and `tokens.json` from the active Eidos merons only. Colors resolve with the same Rust code that checks their contrast. Do not edit those files by hand.

The fonts change rarely. To fetch them again, run `node scripts/fetch-fonts.mjs` in `packages/eio-tokens`. It downloads, from Google Fonts, the scripts each font meron lists, with their Open Font License files, and rewrites `fonts.css`.
