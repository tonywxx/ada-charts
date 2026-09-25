# Wrappers do not hide the engine

`TChart`, `KChart` and `KChartPro` present three charting engines whose option shapes genuinely differ (see `CONTEXT.md`: _Engine_, _Wrapper_). We keep each engine's own vocabulary visible through the props interface — flat keys named after library paths, per-domain override bags, `onChartReady` — rather than narrowing to a small intent-named surface. Depth is added **on top of** an engine's surface, never instead of it.

## Considered options

- Collapse `TChart`'s ~170 props into a few dozen intent-named ones and expose imperative actions through a `ref`. Rejected: it removes the thing the library exists to provide — a declarative spelling of the whole engine — and gutting the props also guts the Storybook ArgsTable that `TCHART_DEFAULTS` feeds.
- Merge `TChart`'s seven `*Override: DeepPartial<…>` bags into one `libraryOptions` bag. Rejected: one anonymous bag offers the same escape hatch with less structure, and the seven named bags keep the engine's own grouping visible.
- Rewrite `KChart`/`KChartPro`'s `onChartReady` so it hands out a curated command object instead of the raw instance. Rejected for the same reason: the instance _is_ the documented surface.

## Consequences

- A wide props interface is not evidence of a shallow module in this repo. Judging depth by prop count will keep producing false positives; judge instead by whether a **decision** is duplicated across Wrappers.
- Refactors here should move computation behind the props — one source of truth per decision — not shrink the props.
