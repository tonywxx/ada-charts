# ada-charts

A chart/visualization component library for displaying data in downstream projects. Built with **Vite + React + TypeScript**.

## Tech Stack

- [Vite](https://vitejs.dev/) — build tool and dev server
- [React 19](https://react.dev/) — UI framework
- [TypeScript](https://www.typescriptlang.org/) — type safety
- [klinecharts](https://klinecharts.com/) v10 — charting engine
- [Storybook](https://storybook.js.org/) 10 — component docs, with [Autodocs](https://storybook.js.org/docs/writing-docs/autodocs)

## Components

| Component | Path | Description |
| --- | --- | --- |
| `AdaChart` | `src/components/adachart/AdaChart.tsx` | Declarative wrapper over `klinecharts` v10, including its overlay and indicator catalogue. |
| `AdaChartPro` | `src/components/adachart-pro/AdaChartPro.tsx` | The v10-native Pro layer, built on `AdaChart`: toolbar (symbol search, periods, indicator picker, drawing palette, theme toggle), watermark and a `DataLoader`-driven live pipeline out of the box — with the indicator work left to the engine. |

`AdaChart` and `AdaChartPro` are the only components in this repository. The
`lightweight-charts`-based wrappers (`TChart`, `TChartPro`) now live in the separate
[`tcharts`](https://github.com/tonywxx/tcharts) repository, and the v9-based
`KChartPro` wrapper has been removed — see
[ADR-0003](docs/adr/0003-adachart-pro-is-the-v10-native-pro-layer.md).

Props are documented bilingually (English + 中文) in JSDoc, which Storybook's Autodocs
extracts into the ArgsTable; defaults live in each component's `*-options.ts` and feed
both the runtime and the docs.

## Documentation

```bash
pnpm storybook          # http://localhost:6006 — browse Charts/AdaChart → Docs
pnpm build-storybook    # static docs site into storybook-static/
pnpm okx:sample         # refresh the offline fallback snapshot
```

The stories render **live market data**: each time a docs page is opened they
request the latest 300 `BTC-USDT` candles per bar size (`1D`, `4H`, `1m`) from
the OKX public market API. Requests are cached per bar size for the lifetime of
the page, so opening the all-in-one Docs page costs three calls, not one per
story. Every chart is labelled `live` or `snapshot` with its fetch time, so the
data source is never ambiguous.

If OKX is unreachable (offline, blocked, rate-limited) the stories fall back to
the snapshot committed at
`src/__data__/btc-usdt.json` — regenerated with
`pnpm okx:sample` — and label themselves `snapshot` rather than pretending to be
current.

## Getting Started

```bash
pnpm install
pnpm dev
```

## Build & Checks

```bash
pnpm build      # type-check + production build
pnpm preview    # preview the production build locally
pnpm lint       # lint (oxlint)
```

## Notes

This repository collects reusable chart/visualization display components for use in AdaQ and other downstream projects.

## Reusing the complete chart

Import `AdaChartPro` from `ada-charts/adachart-pro` and its stylesheet from `ada-charts/adachart-pro.css`. The component owns candle tooltip settings and rendering, chart-type shortcuts, the complete period menu, Reset, manual viewport retention during live updates, drawing tools, indicators, themes and sizing. Use `fill` inside a parent with an explicit height to fill both dimensions.

`onChartReady` supplies `AdaChartProApi`. `getConfiguration(previous?, instrumentKey?)` exports a validated snapshot of indicators, drawing geometry/names, pane heights, viewport, native settings and tooltip preferences. `await setConfiguration(snapshot, instrumentKey?)` restores it after the internal React state commits. `onConfigurationChange` signals that a new snapshot can be saved. Supplying the previous snapshot preserves saved viewport/pane geometry until a pan, zoom, Reset or pane drag explicitly changes it; a snapshot without a previous value reads the complete current geometry. Cancelled restores reject with `AbortError`; consumers may ignore those. The host application owns persistence and the instrument key, which can name any venue.

For OKX consumers with a request budget/cache, `useCandleData` accepts `readPage` and `onSelectionChange`, and returns a stable `loader` plus `observation`. Pass `observation.status` as `dataStatus`, and optionally `onRefresh`, to display transport errors and retries in the chart. Candle validation, history/stream isolation, duplicate/finality checks, shared subscriptions and stale detection stay in this package. A custom `dataLoader` remains supported for other venues. `candleTooltip`, `onCandleTooltipChange`, `theme` and `onThemeChange` connect application preferences without importing an application store.

Run `pnpm test:standalone` for the application-independent StrictMode example and browser regression. New reusable chart features belong here and must work in that example; consuming applications provide business context, transport policy and storage.
