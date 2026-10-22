# Two copies of klinecharts coexist

> **Status — superseded.** The arrangement this ADR describes is **gone**. The
> repo no longer installs a second copy of klinecharts, no longer aliases a v9
> one, and no longer carries the redirect that kept the two apart: the v9
> runtime, the `klinecharts-v9` alias and the `klinechartsProUsesV9()` plugin
> were all removed. There is exactly one engine here now — `klinecharts` v10.
>
> The decision below is kept as the record of *why* the second copy existed and
> *what* it cost, because the v9 Pro layer is still what this repo's Pro layer
> was ported from, and the reasoning is what tells a future reader that the port
> is a port and not a coincidence.

`@klinecharts/pro@0.1.x` is compiled against the klinecharts **v9** runtime (`loadMore`, `applyMoreData`, the v9 `createIndicator` signature, string enums) but declares `klinecharts: ">=9.0.0"` as its peer dependency — so it resolves to the v10 the rest of the repo needs and calls methods that no longer exist there. We install v9 under the alias `klinecharts-v9` and add a `resolveId` plugin, `klinechartsProUsesV9()` in `vite.config.ts`, that redirects **only** Pro's own `klinecharts` import to it, with `optimizeDeps.exclude` so the redirect also applies in dev. `AdaChart` and `@klinecharts/extension` stay on v10.

The redirect must name **v9's ESM file** (`klinecharts-v9/dist/index.esm.js`), not the package. Resolving the package follows its `main` field into `index.cjs`, and an ESM importer cannot take a named binding such as `utils` or `init` from that: the failure is silent until collection time, when Storybook's vitest project reports `does not provide an export named 'utils'` and the whole story file collects zero tests.

The alias must point at **v9**, not at v10. `klinecharts-v9` is `npm:klinecharts@^9.8.10`; aliasing it to v10 makes the "v9 copy" a second v10, which satisfies nothing — the two copies stop being two versions and the redirect becomes a no-op that still looks like a safeguard.

## Consequences

- **The two copies no longer meet, because nothing needs them to.** `KChartPro` — the only wrapper that imported the v9-compiled Pro package at runtime — was removed from this repo, and `AdaChartPro` reimplements that layer on top of v10. So the v9 runtime, the alias and the redirect all went with it: `dist/adachart.js` and `dist/adachart-pro.js` each externalise `klinecharts` and resolve it to the consumer's single v10 — one engine, one instance, shared with `@klinecharts/extension`. The v9 Pro layer survives as a **design reference** only (its drawing-bar grouping, glyphs and wording are what this repo's Pro layer was ported from), and a citation to a published package needs no dependency.
- **The redirect only held while Pro was bundled, not externalised.** A library build that lists `klinecharts` as external lets Pro's bare import escape the plugin, where it resolves against the consumer's copy again — reintroducing the missing-method failure downstream. This was confirmed after the fact: the first `vite build` shipped a Pro entry importing `init`, `utils` and `ActionType` from bare `klinecharts`, i.e. the consumer's v10.
- **How the packaging carried it (see `scripts/build-lib.mjs`):** there was a `k-chart-pro` pass that externalised React only and pinned `klinecharts` to v9's **ESM file** through `resolve.alias`, so Pro and the alias landed in one artefact with no consumer configuration required. That pass is gone with `KChartPro`; both remaining passes externalise React and `klinecharts`, so the engine is resolved by the consumer and the two entries share one v10 instance.
- This is an upstream defect. Re-check when `@klinecharts/pro` moves past 0.1.x: if it targets v10, the last thing that needed the v9 copy loses its reason to exist.
