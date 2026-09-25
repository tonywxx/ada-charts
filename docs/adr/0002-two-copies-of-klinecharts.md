# Two copies of klinecharts coexist

`@klinecharts/pro@0.1.x` is compiled against the klinecharts **v9** runtime (`loadMore`, `applyMoreData`, the v9 `createIndicator` signature, string enums) but declares `klinecharts: ">=9.0.0"` as its peer dependency — so it resolves to the v10 the rest of the repo needs and calls methods that no longer exist there. We install v9 under the alias `klinecharts-v9` and add a `resolveId` plugin, `klinechartsProUsesV9()` in `vite.config.ts`, that redirects **only** Pro's own `klinecharts` import to it, with `optimizeDeps.exclude` so the redirect also applies in dev. `KChart` and `@klinecharts/extension` stay on v10.

The redirect must name **v9's ESM file** (`klinecharts-v9/dist/index.esm.js`), not the package. Resolving the package follows its `main` field into `index.cjs`, and an ESM importer cannot take a named binding such as `utils` or `init` from that: the failure is silent until collection time, when Storybook's vitest project reports `does not provide an export named 'utils'` and the whole story file collects zero tests.

## Consequences

- Both copies land in any bundle that contains `KChartPro`. The size cost is deliberate: it is cheaper than dropping either Wrapper, and neither engine's runtime is patched.
- **The redirect only holds while Pro is bundled, not externalised.** A library build that lists `klinecharts` as external lets Pro's bare import escape the plugin, where it resolves against the consumer's copy again — reintroducing the missing-method failure downstream. This was confirmed after the fact: the first `vite build` shipped a Pro entry importing `init`, `utils` and `ActionType` from bare `klinecharts`, i.e. the consumer's v10.
- **How the packaging carries it (see `scripts/build-lib.mjs`):** the library is built in two passes. The `t-chart` / `k-chart` pass externalises the engines. The `k-chart-pro` pass externalises React only and pins `klinecharts` to v9's **ESM file** through `resolve.alias`, so Pro and the alias land in the one 585 kB artefact and no consumer configuration is required. The dev-time `resolveId` plugin remains, for `pnpm dev` and Storybook.
- This is an upstream defect. Re-check when `@klinecharts/pro` moves past 0.1.x: if it targets v10, both the alias and the plugin get deleted.
