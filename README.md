# ada-charts

A chart/visualization component library for displaying data in downstream projects. Built with **Vite + React + TypeScript**.

## Tech Stack

- [Vite](https://vitejs.dev/) — build tool and dev server
- [React 19](https://react.dev/) — UI framework
- [TypeScript](https://www.typescriptlang.org/) — type safety
- [lightweight-charts](https://tradingview.github.io/lightweight-charts/) v5 — charting engine
- [Storybook](https://storybook.js.org/) 10 — component docs, with [Autodocs](https://storybook.js.org/docs/writing-docs/autodocs)

## Components

| Component | Path | Description |
| --- | --- | --- |
| `TChart` | `src/components/lightweight-charts/TChart.tsx` | Declarative wrapper over `lightweight-charts` v5: candlestick, line, area, bar, histogram and baseline series, with optional volume overlay, EMA overlay, reference lines, watermark, markers and full axis/interaction control. |

Props are documented bilingually (English + 中文) in JSDoc, which Storybook's Autodocs
extracts into the ArgsTable; defaults live in `TCHART_DEFAULTS` in `t-chart-options.ts`
and feed both the runtime and the docs.

## Documentation

```bash
pnpm storybook          # http://localhost:6006 — browse Charts/TChart → Docs
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
`src/components/lightweight-charts/__data__/btc-usdt.json` — regenerated with
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
