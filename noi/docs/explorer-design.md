# Explorer design and verification gate

The registry integration suite passed against a disposable database on a local Supabase PostgreSQL server before explorer authoring began. The dedicated No Origins Systems development database is seeded separately with the reference records.

Design direction: a working architecture atlas. A pale blue plotting field carries a directed meron map, with a quiet navigation rail and a readable inspector. The map is the primary content. Invariants/Governance peer relationships must come from the registry's structural edges, not fixed artwork.

Tokens: plotting field `#eef2f7`, paper `#fcfdff`, ink `#23374b`, secondary `#63778a`, Invariants/structure blue `#275cdd`, governance teal `#177b74`. Typeface: local Avenir Next with humanist system fallbacks; paths use a restrained monospace face because their exact segment structure matters. Keep ordinary labels in sentence case.

Layout: left navigation/search/filter rail, expanding central graph, right meron inspector. The graph uses a deterministic layered layout from explicit containment, delaying root-level non-system leaves by one band so foundational systems remain visibly peers. Uncontained nodes are roots; no synthetic namespace merons are introduced. Filters never alter storage. Responsive layouts move the inspector below the map and compact navigation. Keyboard meron lists provide access without depending on SVG hit targets.

Review: no dashboard metric-card grid, decorative gradient, giant marketing hero, or status invented from successful page loading. The only status is database snapshot freshness. Selection highlights actual incident edges. The graph uses declared predicates, arrows, a visible legend and explicit lifecycle labels. Empty filters and connection failure offer concrete recovery. Automatic polling respects the current selection; failure retains the last snapshot and labels it stale.

## Design-system adoption

The current explorer is retained as an interim visual tool. Once the No Origins design system is established, update the explorer to use its components, tokens and interaction patterns. Do not redesign it ahead of that foundation; its data remains a projection of the registry.
