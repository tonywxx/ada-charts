# Graph Report - ada-charts  (2026-09-27)

## Corpus Check
- 98 files · ~141,327 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .css 3)

## Summary
- 1274 nodes · 2534 edges · 102 communities (67 shown, 35 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 252 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d429dbbe`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- t-chart-pro-indicators.ts
- KChartPro.stories.tsx
- t-chart-options.ts
- harness.tsx
- adachart-pro-overlay-icons.tsx
- AdaChart.stories.tsx
- AdaChartPro.stories.tsx
- t-chart-pro-options.ts
- package.json
- TChart.stories.tsx
- DrawingController
- TChartPro
- adachart-window-config.ts
- t-chart-pro-toolbar.tsx
- bench-charts.mjs
- adachart-pro-dialogs.tsx
- AdaChartPro
- TChartPro.stories.tsx
- compilerOptions
- adachart-pro-datafeed.ts
- okx-stream.ts
- exports
- adachart-pro-layering.test.ts
- devDependencies
- AdaChartPro.tsx
- compilerOptions
- adachart-pro-datafeed.test.ts
- lightweight-charts-pro/okx-datafeed.ts
- adachart/__data__/okx-live.ts
- okx.ts
- adachart-pro-options.ts
- OkxStream
- scripts
- compilerOptions
- okx-kline.ts
- build-lib.mjs
- lightweight-charts/__data__/okx-live.ts
- adachart-pro-drawing-tools.ts
- dependencies
- AdaChart.tsx
- adachart-pro-toolbar.tsx
- .harness-burst.tsx
- react-dom
- adachart-pro-drawing-bar.tsx
- .oxlintrc.json
- ada-charts
- peerDependencies
- ADR-0005: The volume overlay is a study of its own
- react
- tsconfig.json
- Domain Docs
- Issue Tracker
- Triage Labels
- Bar Size
- Candle
- Chart Type
- Closed Candle
- Data Item
- Downstream Project
- Engine
- Live Data
- Marker
- Open Candle
- Price Precision
- Reference Line
- Series
- Snapshot
- Streaming Data
- Theme
- Watermark
- Wrapper
- ADR-0001: Wrappers do not hide the engine
- ADR-0002: Two copies of klinecharts coexist
- ADR-0004: Bar aggregation belongs to the source
- Chart Pro Comparison Report
- Performance Bench Index
- Favicon Logo
- Icon Symbols
- .bench-adachart-burst-after.mjs
- .bench-adachart-burst-correct.mjs
- .bench-adachart-burst.mjs
- .bench-adachart-profile.mjs
- .bench-adachart-profile-after.mjs
- AdaChart / AdaChartPro 实施计划
- feeds.ts
- TChartPro.tsx
- adachart-options.ts
- theme.ts
- AdaChart
- 变更记录（主图成交量叠加 `vol-main` 与指标分组）
- 验证记录（Storybook 实测）
- price-precision.ts
- data-patch.test.ts
- jsx-source.ts
- AdaChartPro 阶段 6 —— 新计划
- Issue tracker: GitHub
- Domain Docs
- dataset.ts
- TChartProDatafeed
- 验证记录（S4）
- triage-labels.md

## God Nodes (most connected - your core abstractions)
1. `AdaChartPro()` - 40 edges
2. `TChartPro()` - 35 edges
3. `DrawingController` - 34 edges
4. `AdaChart()` - 33 edges
5. `line()` - 27 edges
6. `AdaChartProApi` - 24 edges
7. `TChartProApi` - 24 edges
8. `react` - 23 edges
9. `klinecharts` - 22 edges
10. `TChart()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `六、决定记录` --references--> `AdaChartPro()`  [INFERRED]
  .trae/documents/ada-chart-pro-plan-phase2.md → src/components/adachart-pro/AdaChartPro.tsx
- `发现 2 —— step 类画线的 500ms 点击窗口（引擎层，记为已知限制）` --references--> `AdaChartPro()`  [INFERRED]
  .trae/documents/ada-chart-pro-plan.md → src/components/adachart-pro/AdaChartPro.tsx
- `遗留与取舍` --references--> `AdaChartPro()`  [INFERRED]
  .trae/documents/ada-chart-pro-plan.md → src/components/adachart-pro/AdaChartPro.tsx
- `同时要改的四处` --references--> `AdaChart()`  [INFERRED]
  .trae/documents/ada-chart-pro-plan.md → src/components/adachart/AdaChart.tsx
- `二、已核实「不需要做」（避免重复劳动）` --references--> `structuralKey()`  [INFERRED]
  .trae/documents/ada-chart-pro-plan-phase2.md → src/components/adachart/adachart-options.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Chart Pro Implementation Variants** — docs_perf_chart_pro_comparison_tchartpro, docs_perf_chart_pro_comparison_kchartpro, docs_perf_chart_pro_comparison_adachartpro [EXTRACTED 1.00]

## Communities (102 total, 35 thin omitted)

### Community 0 - "t-chart-pro-indicators.ts"
Cohesion: 0.06
Nodes (72): averagePriceFigures(), awesomeOscillatorFigures(), barColor(), BarColouring, biasFigures(), bollinger(), bollingerFigures(), brarFigures() (+64 more)

### Community 1 - "KChartPro.stories.tsx"
Cohesion: 0.10
Nodes (23): @klinecharts/pro, klinecharts-v9, areKChartProPropsEqual(), KCHARTPRO_DEFAULT_PERIODS, KCHARTPRO_DEFAULTS, KChartProResolvedProps, KChartProMemo, KChartProProps (+15 more)

### Community 2 - "t-chart-options.ts"
Cohesion: 0.14
Nodes (31): areTChartPropsEqual(), buildChartOptions(), buildEmaSeriesOptions(), buildMainSeriesOptions(), buildPriceLineSpecs(), buildSeriesStyleOptions(), buildVolumeSeriesOptions(), calcEMA() (+23 more)

### Community 3 - "harness.tsx"
Cohesion: 0.13
Nodes (28): api, canvasSignature(), chartCanvas(), collectGarbage(), Engine, finish(), HarnessApi, heapMB() (+20 more)

### Community 5 - "AdaChart.stories.tsx"
Cohesion: 0.06
Nodes (38): AdaChartStory(), Area, BollingerRsi, BuiltInOverlays, Candlestick, CandleStroke, ChineseLocale, CHIP_ON_STYLE (+30 more)

### Community 6 - "AdaChartPro.stories.tsx"
Cohesion: 0.08
Nodes (27): LiveSeriesState, LiveSource, ChineseLocale, COMPONENT_ARG_TYPES, CONTROLS, CustomStyles, DarkTheme, Default (+19 more)

### Community 7 - "t-chart-pro-options.ts"
Cohesion: 0.18
Nodes (14): areTChartProPropsEqual(), dateOf(), formattersFor(), isIntradayBarSize(), MESSAGES, resolveTChartProProps(), TCHARTPRO_DEFAULT_BAR_SIZES, TCHARTPRO_DEFAULT_CHART_TYPE (+6 more)

### Community 8 - "package.json"
Cohesion: 0.09
Nodes (22): files, name, private, type, version, @klinecharts/extension, ref_node_module, oxlint (+14 more)

### Community 9 - "TChart.stories.tsx"
Cohesion: 0.07
Nodes (27): OkxBar, Area, Bar, Baseline, Candlestick, COMPONENT_ARG_TYPES, CONTROLS, DarkTheme (+19 more)

### Community 11 - "TChartPro"
Cohesion: 0.12
Nodes (4): mergeCandle(), TChartPro(), TChartProApi, toDataItem()

### Community 12 - "adachart-window-config.ts"
Cohesion: 0.15
Nodes (20): vitest, AdaChartIndicator, ADACHART_BUILT_IN_INDICATORS, LiveWindow, LiveWindowProps, nextPaneId(), addSubPane(), DEFAULT_CONFIG (+12 more)

### Community 13 - "t-chart-pro-toolbar.tsx"
Cohesion: 0.21
Nodes (11): chartThemeOf(), messageFor(), tChartPropsForTheme(), CATEGORY_LABELS, DARK_SURFACE, LIGHT_SURFACE, Panel, TChartProToolbar() (+3 more)

### Community 14 - "bench-charts.mjs"
Cohesion: 0.19
Nodes (18): buildPerfBundle(), ENGINES, gzipSize(), INDICATOR_MODES, klinechartsProUsesV9(), main(), median(), medianOf() (+10 more)

### Community 15 - "adachart-pro-dialogs.tsx"
Cohesion: 0.16
Nodes (14): AdaChartProIndicatorParamsDialog(), AdaChartProIndicatorParamsDialogProps, AdaChartProSettingsDialog(), AdaChartProSettingsDialogProps, AdaChartProTimezoneDialog(), AdaChartProTimezoneDialogProps, Modal(), ModalProps (+6 more)

### Community 16 - "AdaChartPro"
Cohesion: 0.10
Nodes (14): AdaChartPro(), AdaChartProApi, useSteered(), okxCandlesUrl(), S1 —— 补上 perf 的 pan/zoom settle 空洞（高）, S2 —— 给水印层序加回归护栏（高）, S3 —— 把 step 类画线的 500ms 引擎窗口写进 ADR（中）, S4 —— 补齐 6 个未实测 story 的验收（中） (+6 more)

### Community 17 - "TChartPro.stories.tsx"
Cohesion: 0.11
Nodes (18): AllIndicators, ChineseAsiaShanghai, COMPONENT_ARG_TYPES, CONTROLS, CustomPalette, Dark, Default, FourHourBars (+10 more)

### Community 18 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+11 more)

### Community 19 - "adachart-pro-datafeed.ts"
Cohesion: 0.18
Nodes (14): AdaChartProDataState, barCache, fetchBarsFor(), fetchPage(), fetchPageFor(), instIdOf(), observeBars(), OkxDataLoader (+6 more)

### Community 20 - "okx-stream.ts"
Cohesion: 0.16
Nodes (8): OkxCandle, OKX_STREAM_BARS, OKX_STREAM_URL, OkxStreamHandlers, OkxStreamMessage, splitChannelKey(), FakeSocket, hub()

### Community 21 - "exports"
Cohesion: 0.11
Nodes (18): import, import, types, types, exports, ./adachart, ./adachart-pro, ./adachart-pro.css (+10 more)

### Community 22 - "adachart-pro-layering.test.ts"
Cohesion: 0.14
Nodes (15): ref_node_fs, ref_node_path, ref_node_url, BARS, fetchBar(), OUT_FILE, series, snapshot (+7 more)

### Community 23 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, oxlint, playwright, storybook, @storybook/addon-docs, @storybook/addon-vitest, @storybook/react, @storybook/react-vite (+9 more)

### Community 24 - "AdaChartPro.tsx"
Cohesion: 0.16
Nodes (21): src_components_adachart_pro_adachart_pro, ADACHARTPRO_DEFAULT_LINE_COLORS, ADACHARTPRO_DEFAULT_SETTINGS, ADACHARTPRO_FALLBACK_LINE_COLOR, ADACHARTPRO_INDICATOR_FEATURE_IDS, AdaChartProIndicatorFeatureId, DATE, dateFormatOptions() (+13 more)

### Community 25 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 26 - "adachart-pro-datafeed.test.ts"
Cohesion: 0.18
Nodes (8): FakeSocket, PERIOD, request(), row(), rowsEndingAt(), streamOver(), SYMBOL, OKX_HISTORY_LIMIT

### Community 27 - "lightweight-charts-pro/okx-datafeed.ts"
Cohesion: 0.19
Nodes (9): barCache, fetchBar(), fetchBarsFor(), OkxTChartDatafeed, symbolOf(), toCandle(), TChartProCandle, TChartProFeedCallback (+1 more)

### Community 28 - "adachart/__data__/okx-live.ts"
Cohesion: 0.19
Nodes (12): AdaChartStoryParameters, useLiveSeries(), LIVE_BARS, LiveBar, liveBarByKey(), LiveWindow, loadLiveWindow(), mergeLiveCandle() (+4 more)

### Community 29 - "okx.ts"
Cohesion: 0.13
Nodes (16): fetchBar(), barCache, fetchBar(), fetchBarsFor(), INSTRUMENTS, okxBarFor(), OkxDatafeed, toKLineData() (+8 more)

### Community 30 - "adachart-pro-options.ts"
Cohesion: 0.15
Nodes (18): ADACHARTPRO_DEFAULT_PERIODS, ADACHARTPRO_DEFAULTS, AdaChartProResolvedProps, areAdaChartProPropsEqual(), isPlainObject(), mergeAdaChartProStyles(), OKX_BAR_SUFFIX, PERIOD_LABEL_SUFFIX (+10 more)

### Community 32 - "scripts"
Cohesion: 0.15
Nodes (13): scripts, build, build-storybook, dev, lint, okx:sample, perf, preview (+5 more)

### Community 33 - "compilerOptions"
Cohesion: 0.15
Nodes (12): ./tsconfig.app.json, compilerOptions, declaration, declarationMap, emitDeclarationOnly, noEmit, outDir, rootDir (+4 more)

### Community 34 - "okx-kline.ts"
Cohesion: 0.24
Nodes (10): BARS, cache, fetchCandles(), fromSnapshot(), loadOkxKLines(), loadOkxLatestBar(), OkxBar, OkxKLineSet (+2 more)

### Community 35 - "build-lib.mjs"
Cohesion: 0.18
Nodes (8): ADA_PRO_ENTRY, ENTRIES, ADR-0002, PRO_ENTRY, requireFromRoot, root, TPRO_ENTRY, v9Entry

### Community 36 - "lightweight-charts/__data__/okx-live.ts"
Cohesion: 0.21
Nodes (14): BARS, cache, describeCandleSet(), fetchCandles(), fromSnapshot(), loadOkxCandles(), markersFor(), OkxCandleSet (+6 more)

### Community 37 - "adachart-pro-drawing-tools.ts"
Cohesion: 0.24
Nodes (11): AdaChartProDrawingBar(), ADACHARTPRO_DRAWING_GROUP_ID, ADACHARTPRO_DRAWING_GROUPS, ADACHARTPRO_DRAWING_MESSAGES, AdaChartProDrawingTool, cloneGroup(), drawingGroupsFor(), drawingMessage() (+3 more)

### Community 38 - "dependencies"
Cohesion: 0.22
Nodes (9): dependencies, klinecharts, @klinecharts/extension, @klinecharts/pro, klinecharts-v9, lightweight-charts, lightweight-charts-drawing, react (+1 more)

### Community 39 - "AdaChart.tsx"
Cohesion: 0.18
Nodes (12): klinecharts, ACTION_KEYS, ACTIONS, AdaChartConvenienceStyleProps, AdaChartEventProps, AdaChartMemo, AdaChartProps, AdaChartResolvedProps (+4 more)

### Community 40 - "adachart-pro-toolbar.tsx"
Cohesion: 0.31
Nodes (8): MAIN_INDICATORS, SUB_INDICATORS, periodLabel(), AdaChartProToolbar(), AdaChartProToolbarProps, Panel, samePeriod(), symbolLabel()

### Community 41 - ".harness-burst.tsx"
Cohesion: 0.13
Nodes (28): api, canvasSignature(), chartCanvas(), collectGarbage(), Engine, finish(), HarnessApi, heapMB() (+20 more)

### Community 42 - "react-dom"
Cohesion: 0.29
Nodes (6): react-dom, App(), Hero Illustration, React Logo, Vite Logo, src_index

### Community 43 - "adachart-pro-drawing-bar.tsx"
Cohesion: 0.50
Nodes (4): AdaChartProDrawingBarProps, OpenList, AdaChartProDrawingGroup, AdaChartProOverlayIcon()

### Community 44 - ".oxlintrc.json"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 45 - "ada-charts"
Cohesion: 0.19
Nodes (12): ADR-0002: Two Copies of Klinecharts, ADR-0003: AdaChartPro is the v10-native Pro layer, AdaChartPro, KChartPro, TChartPro, ada-charts, Build & Checks, Components (+4 more)

### Community 46 - "peerDependencies"
Cohesion: 0.40
Nodes (5): peerDependencies, klinecharts, lightweight-charts, react, react-dom

### Community 47 - "ADR-0005: The volume overlay is a study of its own"
Cohesion: 0.67
Nodes (3): Indicator, Pane, ADR-0005: The volume overlay is a study of its own

### Community 48 - "react"
Cohesion: 0.29
Nodes (5): react, @storybook/react, EngineMount, EngineMountOptions, preview

### Community 79 - ".bench-adachart-burst-after.mjs"
Cohesion: 0.15
Nodes (21): ref_node_zlib, buildPerfBundle(), ENGINES, gzipSize(), INDICATOR_MODES, klinechartsProUsesV9(), LIVE_SIZES, main() (+13 more)

### Community 80 - ".bench-adachart-burst-correct.mjs"
Cohesion: 0.15
Nodes (21): playwright, buildPerfBundle(), ENGINES, gzipSize(), INDICATOR_MODES, klinechartsProUsesV9(), LIVE_SIZES, main() (+13 more)

### Community 81 - ".bench-adachart-burst.mjs"
Cohesion: 0.16
Nodes (20): buildPerfBundle(), ENGINES, gzipSize(), INDICATOR_MODES, klinechartsProUsesV9(), LIVE_SIZES, main(), median() (+12 more)

### Community 82 - ".bench-adachart-profile.mjs"
Cohesion: 0.16
Nodes (20): buildPerfBundle(), ENGINES, gzipSize(), INDICATOR_MODES, klinechartsProUsesV9(), LIVE_SIZES, main(), median() (+12 more)

### Community 83 - ".bench-adachart-profile-after.mjs"
Cohesion: 0.16
Nodes (20): buildPerfBundle(), ENGINES, gzipSize(), INDICATOR_MODES, klinechartsProUsesV9(), LIVE_SIZES, main(), median() (+12 more)

### Community 84 - "AdaChart / AdaChartPro 实施计划"
Cohesion: 0.12
Nodes (18): ioLatency(), libPass(), saveImage(), KChartPro(), resolveKChartProProps(), AdaChart / AdaChartPro 实施计划, Context, 变更记录（lint 清理与画线栏箭头改版） (+10 more)

### Community 85 - "feeds.ts"
Cohesion: 0.17
Nodes (14): PerfCandle, adaChartProFeed(), FeedHandle, kChartFeed(), PERF_PERIOD, PERF_PERIOD_V10, PERF_SYMBOL, PERF_SYMBOL_V10 (+6 more)

### Community 86 - "TChartPro.tsx"
Cohesion: 0.20
Nodes (12): lightweight-charts, lightweight-charts-drawing, DrawingControllerEvents, DrawingToolEntry, MagnetBar, TChartProMagnet, TChartProToolbarProps, barsOf() (+4 more)

### Community 87 - "adachart-options.ts"
Cohesion: 0.20
Nodes (11): ADACHART_BUILT_IN_OVERLAYS, ADACHART_CANDLE_TYPES, ADACHART_EXTENSION_OVERLAYS, ADACHART_LOCALES, ADACHART_OVERLAY_NAMES, ADACHART_PERIOD_TYPES, buildConvenienceStyles(), buildInitOptions() (+3 more)

### Community 88 - "theme.ts"
Cohesion: 0.35
Nodes (8): DARK_STYLES, LIGHT_STYLES, mergeStyles(), themeStyles(), DARK_THEME, LIGHT_THEME, ADR-0001, withAlpha()

### Community 89 - "AdaChart"
Cohesion: 0.29
Nodes (10): AdaChart(), createMemoryDataLoader(), ensureExtensionOverlays(), normalizeKLineData(), resolvePeriod(), sameKLineData(), structuralKey(), `AdaChartPro.tsx` (+2 more)

### Community 90 - "变更记录（主图成交量叠加 `vol-main` 与指标分组）"
Cohesion: 0.22
Nodes (10): ensureVolumeOverlay(), resolveSymbol(), volumeOverlayAxisRange(), 变更记录（主图成交量叠加 `vol-main` 与指标分组）, 实现要点（都是从引擎源码核出来的）, 成交量精度的修复（1m 图例显示 `0`）, 拍板, 改动清单 (+2 more)

### Community 91 - "验证记录（Storybook 实测）"
Cohesion: 0.25
Nodes (7): tool(), 发现 1 —— 水印曾被完全遮挡（已修复）, 发现 2 —— step 类画线的 500ms 点击窗口（引擎层，记为已知限制）, 覆盖范围与未覆盖项, 验收点逐条, 验证, 验证记录（Storybook 实测）

### Community 92 - "price-precision.ts"
Cohesion: 0.36
Nodes (6): buildSeriesCommonOptions(), resolvePriceFormat(), countDecimals(), MAX_PRICE_DECIMALS, PricePrecision, pricePrecisionOf()

### Community 93 - "data-patch.test.ts"
Cohesion: 0.32
Nodes (4): DataPatch, decideDataPatch(), Bar, bars()

### Community 94 - "jsx-source.ts"
Cohesion: 0.43
Nodes (6): jsxKey(), jsxSource(), jsxString(), jsxValue(), stacked(), DEFAULTS

### Community 95 - "AdaChartPro 阶段 6 —— 新计划"
Cohesion: 0.25
Nodes (7): AdaChartPro 阶段 6 —— 新计划, 一、依据, 七、验证记录（S1 + S2 + S4）, 二、已核实「不需要做」（避免重复劳动）, 五、明确不做, 六、决定记录, 四、建议顺序

### Community 96 - "Issue tracker: GitHub"
Cohesion: 0.29
Nodes (6): Conventions, Issue tracker: GitHub, Pull requests as a triage surface, Wayfinding operations, When a skill says "fetch the relevant ticket", When a skill says "publish to the issue tracker"

### Community 97 - "Domain Docs"
Cohesion: 0.33
Nodes (5): Before exploring, read these, Domain Docs, File structure, Flag ADR conflicts, Use the glossary's vocabulary

### Community 98 - "dataset.ts"
Cohesion: 0.60
Nodes (5): continueCandles(), LAST_OPEN, makeCandles(), mulberry32(), round2()

### Community 100 - "验证记录（S4）"
Cohesion: 0.50
Nodes (4): `WithIndicators` 的 4 条额外断言（主图指标是否与蜡烛共 pane）, 与既有判断的关系, 逐条, 验证记录（S4）

## Knowledge Gaps
- **450 isolated node(s):** `$schema`, `plugins`, `react/rules-of-hooks`, `react/only-export-components`, `klinechartsV9Esm` (+445 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 556 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `KChartPro.stories.tsx`, `t-chart-options.ts`, `harness.tsx`, `adachart-pro-overlay-icons.tsx`, `AdaChart.stories.tsx`, `AdaChartPro.stories.tsx`, `package.json`, `TChart.stories.tsx`, `t-chart-pro-toolbar.tsx`, `adachart-pro-dialogs.tsx`, `TChartPro.stories.tsx`, `adachart-pro-layering.test.ts`, `AdaChartPro.tsx`, `AdaChart.tsx`, `adachart-pro-toolbar.tsx`, `.harness-burst.tsx`, `react-dom`, `adachart-pro-drawing-bar.tsx`, `TChartPro.tsx`?**
  _High betweenness centrality (0.212) - this node is a cross-community bridge._
- **Why does `klinecharts` connect `AdaChart.tsx` to `KChartPro.stories.tsx`, `okx-kline.ts`, `harness.tsx`, `AdaChart.stories.tsx`, `AdaChartPro.stories.tsx`, `package.json`, `.harness-burst.tsx`, `adachart-pro-toolbar.tsx`, `adachart-pro-drawing-bar.tsx`, `adachart-pro-datafeed.ts`, `feeds.ts`, `adachart-options.ts`, `theme.ts`, `AdaChartPro.tsx`, `adachart-pro-datafeed.test.ts`, `adachart/__data__/okx-live.ts`, `okx.ts`, `adachart-pro-options.ts`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `AdaChartPro()` connect `AdaChartPro` to `harness.tsx`, `验证记录（S4）`, `adachart-pro-drawing-tools.ts`, `AdaChartPro.stories.tsx`, `.harness-burst.tsx`, `ada-charts`, `adachart-pro-dialogs.tsx`, `adachart-pro-datafeed.ts`, `AdaChart / AdaChartPro 实施计划`, `adachart-pro-layering.test.ts`, `AdaChartPro.tsx`, `变更记录（主图成交量叠加 `vol-main` 与指标分组）`, `验证记录（Storybook 实测）`, `adachart-pro-options.ts`, `AdaChartPro 阶段 6 —— 新计划`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Are the 22 inferred relationships involving `AdaChartPro()` (e.g. with `mount()` and `mount()`) actually correct?**
  _`AdaChartPro()` has 22 INFERRED edges - model-reasoned connections that need verification._
- **Are the 15 inferred relationships involving `TChartPro()` (e.g. with `mount()` and `mount()`) actually correct?**
  _`TChartPro()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **Are the 19 inferred relationships involving `AdaChart()` (e.g. with `Components` and `AdaChart.tsx`) actually correct?**
  _`AdaChart()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **What connects `$schema`, `plugins`, `react/rules-of-hooks` to the rest of the system?**
  _450 weakly-connected nodes found - possible documentation gaps or missing edges._