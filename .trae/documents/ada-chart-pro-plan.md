# AdaChart / AdaChartPro 实施计划

## Context

**双引擎路线终止。** 以 `klinecharts` v10 作为唯一底层引擎；`KChart` 正式对外命名为 **`AdaChart`**；在其上新建 **`AdaChartPro`**（原计划里的 `AdaChartsPro` 更名，与 `AdaChart` 配对，沿用仓库 `TChart`/`TChartPro`、`KChart`/`KChartPro` 的命名习惯）。

作出这个决定的证据（引擎不对称）：

| | lightweight-charts 5.2.1 | klinecharts 10.0.3 |
| --- | --- | --- |
| 内置指标 | **0**（要自己写） | **27** |
| 内置画线 | **0**（只有 `attachPrimitive`） | **16** + `@klinecharts/extension` 18 个，原生支持分步交互绘制 |
| 多面板 / 多 y 轴 | v5 有 `addPane`，以单 y 轴为主 | 原生多 pane，v10 支持一窗多 y 轴 |
| ESM gzip | ~60 KB | ~103 KB（UMD min 59.8 KB） |
| 依赖 | `fancy-canvas` | **零依赖** |
| 许可 | Apache-2.0，要求署名 TradingView | Apache-2.0，无附加要求 |

结论：`TChartPro` 那条线是在给一个纯渲染内核**自补 27 个指标 + 整套画线 + 多面板**；这些在 klinecharts 上都是白送的。选 klinecharts 当唯一基座后，Pro 层的工作量从「造工具栏 + 造 27 个指标 + 造画线」收缩为「造工具栏 + 组装已有能力」。

## 已拍板决定

1. **唯一引擎**：`klinecharts` v10。`KChart` 底层已经是它（直接 import `init`/`dispose`/`Chart`），因此这条决定在代码上零成本。
2. **命名**：`AdaChart` + `AdaChartPro`。
3. **更名方式**：re-export 薄壳。新建 `src/components/ada-chart.tsx` 转出 `KChart`，**不物理重命名** `src/components/klinecharts/` 目录与文件名，**不改 `KChart.tsx` 内部任何逻辑**。
4. **不做 deprecated alias**：目前无下游调用，`package.json` 的 `./k-chart` 导出**直接换成** `./ada-chart`，不留旧路径。
5. **`TChart` / `TChartPro` 冻结不删**：代码保留、下游仍可用，不再投入新功能。删除它们要同时改 `package.json` exports、`vite.config.ts`、ADR-0001，是独立任务。
6. **`KChartPro` 一并冻结**：`@klinecharts/pro` + `klinecharts-v9` 别名链保留。它是仓库里唯一「纯历史包袱」的依赖，将来摘掉是一个清晰、独立的任务。
7. **AdaChartPro 公开 props 用 v10 原生词汇**：`period: { type, span }`、数据源用 v10 的 `DataLoader`。
8. **工具栏核心对等**：周期切换、指标选择（主图 + 副图）、画线面板、主题切换；标的搜索**可选**（调用方提供 `symbols` 时才出现）。
9. **性能报告变三方对比**：`TChartPro` / `KChartPro` / `AdaChartPro`，同一批更新。

`CONTEXT.md` **不用改**：其 Engine 定义是「Wrapper 所包裹的第三方图表库」，klinecharts 仍是第三方，定义继续成立。

## 已查证的技术结论（依据：`node_modules/.pnpm/klinecharts@10.0.3/.../dist/index.d.ts`）

| 事项 | 结论 | 依据行 |
| --- | --- | --- |
| `Period` | `{ type: PeriodType; span: number }`，`PeriodType` 为 `"second"…"year"` | L128-132 |
| `SymbolInfo` | `{ ticker; pricePrecision; volumePrecision; [key: string]: unknown }` —— 带索引签名，`name`/`shortName`/`exchange` 仍合法 | L146-151 |
| `DataLoader` | `getBars({ type, timestamp, symbol, period, callback })`；可选 `subscribeBar` / `unsubscribeBar` | L157-174 |
| 指标 API | `createIndicator(value, isStack?)`、`removeIndicator(filter?)`、`overrideIndicator(create)`；**`isStack` 即「叠加到既有面板」**，对应主图 / 副图 | L1163、L976-977 |
| 画线 API | `createOverlay(value)`、`removeOverlay(filter?)`；原生交互式绘制 `OverlayDrawingMode = "step" \| "continuous"`，overlay 带 `currentStep`/`totalStep` 与 `onDrawStart`/`onDrawing`/`onDrawEnd`/`onRemoved` | L1165、L979、L1001-1006、L1067 |
| 水印 | **v10 无 watermark API**（全文无匹配）→ 由本层补 | 全文无 |

另外已确认：Vite 8 支持 `build.lib.cssFileName`（`node_modules/vite/dist/node/index.d.ts:3035-3040`），用于避免新构建遍覆盖 `dist/ada-charts.css`。

## 阶段 0：基座命名（先做，独立可验）

### 新建 `src/components/ada-chart.tsx`

```tsx
export {
	KChart as AdaChart,
	KChart as default,
} from "./klinecharts/KChart";

export type {
	KChartProps as AdaChartProps,
	KChartIndicator as AdaChartIndicator,
	KChartConvenienceStyleProps as AdaChartConvenienceStyleProps,
	KChartEventProps as AdaChartEventProps,
	KChartResolvedProps as AdaChartResolvedProps,
} from "./klinecharts/KChart";
```

`KChart.tsx` 内部是 memo 组件（`KChartMemo`），re-export 直接透传，不额外包一层，避免多一层 ref 转发。

### 同时要改的四处

| 文件 | 改动 |
| --- | --- |
| `scripts/build-lib.mjs` | `ENTRIES` 的 `"k-chart": "src/components/klinecharts/KChart.tsx"` → `"ada-chart": "src/components/ada-chart.tsx"` |
| `package.json` | `./k-chart` → `./ada-chart`（types `./dist/components/ada-chart.d.ts`，import `./dist/ada-chart.js`） |
| `tsconfig.build.json` | `include` 加 `src/components/ada-chart.tsx` |
| `consumer-probe.tsx` | `./dist/k-chart.js` → `./dist/ada-chart.js`；`KChart` → `AdaChart` |

**验证**：`pnpm build` 后 `dist/ada-chart.js` 出现、`dist/k-chart.js` 消失；`dist/ada-charts.css`、`dist/k-chart-pro.js`、`dist/t-chart-pro.js`、`dist/t-chart.js` 的字节数不变。

## 阶段 1–2：AdaChartPro 组件本体

新建 `src/components/ada-chart-pro/`：

### `ada-chart-pro-options.ts`
默认值与 v10 词汇、纯函数，便于单测。

- `ADACHARTPRO_DEFAULTS`：width 900 / height 520 / autoSize / theme `light` / locale `en-US` / timezone `UTC` / drawingBarVisible / `ticker` BTC-USDT / 精度 / `mainIndicators: ["MA"]` / `subIndicators: ["VOL"]`（沿用 `KCHARTPRO_DEFAULTS` 的取值，保持两个 Pro 层默认一致）。
- `ADACHARTPRO_DEFAULT_PERIODS: Period[]` —— v10 形状，对应原 6 档：`{minute,1}` `{minute,15}` `{hour,1}` `{hour,4}` `{day,1}` `{week,1}`。
- `areAdaChartProPropsEqual` —— 浅比较器。
- `okxBarFor(period: Period): string` —— v10 形状的 OKX bar 映射（`minute→m`/`hour→H`/`day→D`/`week→W`/`month→M`/`year→Y`/`second→s`）。**另写一份，不修改** `klinecharts-pro/okx-datafeed.ts` 里那份。
- `resolveAdaChartProProps(props)` —— 合并默认值。

### `ada-chart-pro-datafeed.ts`
v10 `DataLoader` 的 OKX 实现，复用 `src/okx.ts` 的 `fetchOkxCandles` / `okxSnapshotCandles` / `OKX_INST_ID`。

```ts
export class OkxDataLoader implements DataLoader {
  getBars(params: DataLoaderGetBarsParams): Promise<void>   // type==="init" 时回调历史；okxSnapshotCandles 兜底
  subscribeBar(params: DataLoaderSubscribeBarParams): void  // 轮询同一端点，把最新一根推给 params.callback
  unsubscribeBar(params: DataLoaderUnsubscribeBarParams): void
  dispose(): void
}
```

轮询节奏、in-flight 去重、快照兜底、浅拷贝等策略沿用 `okx-datafeed.ts`（复制结构，不 import 该文件，避免与 pro 类型耦合）。

### `adachart-pro-toolbar.tsx`
纯 React 工具栏，**结构模板**是 `src/components/lightweight-charts-pro/t-chart-pro-toolbar.tsx`。

- props：`theme`/`onThemeChange`、`periods` + `period` + `onPeriodChange`、主/副指标当前值与增删回调、可选 `symbols` + `symbol` + `onSymbolChange`。
- 指标名复用 `k-chart-options.ts` 的 `KCHART_BUILT_IN_INDICATORS`。
- 不做 pro 那套设置面板与完整搜索面板。
- **画线不在这里**：初版曾有一个「画线」下拉面板，左侧画线栏到来后即移除，工具因此只有一个入口。见「变更记录（左侧画线栏）」。

### `adachart-pro-drawing-bar.tsx` / `adachart-pro-drawing-tools.ts` / `adachart-pro-overlay-icons.tsx`

左侧竖向画线栏，形状移植自 `@klinecharts/pro`：分组图标 + 展开箭头、模式（光标 / 弱磁 / 强磁）、锁定、显示 / 隐藏、清空全部。三个文件的分工：

- `adachart-pro-drawing-tools.ts` —— 纯数据与纯函数：6 组共 34 个工具、en-US / zh-CN 两套文案、`drawingMessage`（缺语言回退 en-US、缺键回退键名）、`drawingGroupsFor`（按 `drawingTools` 过滤，整组被滤空即整组丢弃）。node 环境可测。
- `adachart-pro-overlay-icons.tsx` —— 42 个内联 SVG，从 `@klinecharts/pro` 的编译产物精确抽取，`fill: currentColor`、自身不带颜色。
- `adachart-pro-drawing-bar.tsx` —— 纯呈现：所有取值向上汇报，`AdaChartPro` 持有；自己只持有「哪个子列表展开」。

### `AdaChartPro.tsx`
组合 `AdaChart` + 工具栏 + 水印层。

```ts
export interface AdaChartProProps {
  dataLoader?: DataLoader;          // 不传则用内置 OkxDataLoader
  symbol?: Partial<SymbolInfo>;
  period?: Period;
  periods?: Period[];               // 工具栏周期预设
  width?: number; height?: number; autoSize?: boolean;
  theme?: "light" | "dark";
  locale?: string; timezone?: string;
  watermark?: string;
  mainIndicators?: string[];
  subIndicators?: string[];
  drawingBarVisible?: boolean;
  drawingTools?: readonly string[];
  symbols?: readonly SymbolInfo[];  // 提供时才显示标的搜索
  styles?: DeepPartial<Styles>;
  onChartReady?: (api: AdaChartProApi) => void;
}

export interface AdaChartProApi {
  chart(): Chart | null;
  setSymbol/getSymbol; setPeriod/getPeriod;
  setTheme/getTheme; setLocale/getLocale; setTimezone/getTimezone;
  setMainIndicators/setSubIndicators;
  setTool(tool: string | null): void; getTool(): string | null;
}
```

结构性行为（**交给 `AdaChart` 已有能力，不重复实现**）：

- **状态**：`symbol`/`period`/`theme`/`locale`/`timezone`/`mainIndicators`/`subIndicators`/`activeTool` 用 React state（受控 + props 初值），变化后作为 props 交给内部 `<AdaChart>`。`AdaChart` 已用 setter 增量下发样式/locale/timezone，并按 `structuralKey` 只在指标/画线组合真变时重建。
- **指标**：`mainIndicators` → `indicators`（`createIndicator(name, isStack=true)`）；`subIndicators` → 同 prop 但 `stack: false` 各自成面板。`KChartIndicator` 已支持 `stack`。
- **交互式画线**：用 `onChartReady` 拿原始 `Chart` 存 ref；工具选中时 `chart.createOverlay({ name: tool })` 并挂 `onDrawEnd`，画完自动清空 `activeTool`。清空用 `getOverlays()` + `removeOverlay()`。
- **水印**：容器内绝对定位、`z-index` 低于 canvas、`pointer-events: none` 的 `<div>`，仅 `watermark` 有值时渲染。
- **就绪信号**：首次 `onChartReady` 后给容器打 `data-ada-chart-pro-ready="true"`，供 harness 观察。
- **销毁**：无需任何 v9 式 hack —— `AdaChart` 的 `destroy` 已调 v10 `dispose(chart)`。

### `ada-chart-pro.css`
工具栏与水印样式，独立文件，由组件 import。**不用** `@klinecharts/pro` 的样式表。

### `AdaChartPro.stories.tsx`
对应 `KChartPro` 那 9 个 story 的功能面：Default、DarkTheme、ChineseLocale、Watermark、WithIndicators、NoDrawingBar、MinuteBars、FourHourBars、CustomStyles。

### `ada-chart-pro-options.test.ts`
`okxBarFor` 的 7 种 period 映射、`resolveAdaChartProProps` 默认值合并、`areAdaChartProPropsEqual`。纯函数、node 环境。

## 阶段 3：构建与导出

| 文件 | 改动 |
| --- | --- |
| `scripts/build-lib.mjs` | 新增第四遍 `libPass(ADA_PRO_ENTRY, { external: (id) => isReact(id) \| isEngine(id), cssFileName: "ada-chart-pro" })`（与 `ENTRIES` 同策略：纯 v10 + React）。**必须显式设 `cssFileName`** —— Vite lib 模式 CSS 产物名默认取 package.json 的 `name`，不设会覆盖 `k-chart-pro` 那遍产出的 `dist/ada-charts.css`。需要给 `libPass` 增加传递 `cssFileName` 的能力。已有三遍一行不动。 |
| `package.json` | `exports` 增 `./ada-chart-pro`（types `./dist/components/ada-chart-pro/AdaChartPro.d.ts`，import `./dist/ada-chart-pro.js`）与 `./ada-chart-pro.css`（`./dist/ada-chart-pro.css`）。`dependencies` **不变**。 |
| `tsconfig.build.json` | `include` 加 `src/components/ada-chart-pro/AdaChartPro.tsx` |

## 阶段 4：perf 与报告

| 文件 | 改动 |
| --- | --- |
| `perf/harness.tsx` | `Engine` 加 `"ada-chart-pro"`；加挂载/流式路径；就绪信号用 `data-ada-chart-pro-ready` |
| `perf/feeds.ts` | 加 `adaChartProFeed(candles)`：v10 `DataLoader`，保留 `ioLatency()` 与暴露 `push` 的做法 |
| `scripts/bench-charts.mjs` | 把新引擎加进矩阵与产物测量；新增 `dist/ada-chart-pro.css` 尺寸项 |
| `docs/perf/chart-pro-comparison.md` | 改三方对比 |

**口径约束**：`perf/harness.tsx` 现在从 klinecharts **v9** 别名取指标/overlay 数量（受构建别名影响）。新增引擎后若要取 v10 数字，**不得改动 KChartPro 那一列的既有口径**，否则三方不可比；新数字单列。

## 阶段 5：文档

| 文件 | 改动 |
| --- | --- |
| `docs/adr/0003-adachart-pro-is-the-v10-native-pro-layer.md` | **新建**。要点：单引擎策略（klinecharts v10）与证据；`KChart` → `AdaChart` 是**品牌改名、不改 API 契约**，公开 props 与类型仍全是 klinecharts v10 原生词汇，因此**不违反 ADR-0001**；`TChart`/`TChartPro`/`KChartPro` 冻结不删；`AdaChartPro` 建在 `AdaChart` 上，工具栏纯 React；水印由本层补（v10 无此 API）；交互式画线走 `createOverlay` + `onDrawEnd`；ADR-0002 继续有效。**不修改 ADR-0001 / ADR-0002**。 |
| `README.md` | Components 表：`KChart` 行改为 `AdaChart`；新增 `AdaChartPro` 行；`TChartPro`/`KChartPro` 标注冻结（frozen）、不再投入新功能 |

## 复用清单（不要重写）

- `src/components/klinecharts/KChart.tsx` —— 底座：生命周期、setter 增量下发、指标/画线/面板重建、`dispose`
- `src/components/klinecharts/k-chart-options.ts` —— `KCHART_BUILT_IN_INDICATORS`、`KCHART_OVERLAY_NAMES`、`ensureExtensionOverlays`、`createMemoryDataLoader`、`normalizeKLineData`、`structuralKey`、`buildStyles`
- `src/components/klinecharts/k-line-styles.ts` —— `mergeStyles`、`themeStyles`
- `src/okx.ts` —— `fetchOkxCandles`、`okxSnapshotCandles`、`OKX_INST_ID`
- `src/engine-mount.ts`、`src/price-precision.ts`
- `src/components/lightweight-charts-pro/t-chart-pro-toolbar.tsx` —— 仅作**结构模板**参考
- `src/components/klinecharts-pro/k-chart-pro-options.ts` —— 仅作**默认值取值**参考（不 import）

## 防回归硬约束

- 下列文件的 `git diff` 必须为空：
  - `src/components/klinecharts/**`（只新增 `ada-chart.tsx` 在 `src/components/` 下，不在该目录内）
  - `src/components/lightweight-charts/**`、`src/components/lightweight-charts-pro/**`
  - `src/components/klinecharts-pro/**`
  - `vite.config.ts`、`docs/adr/0001-*.md`、`docs/adr/0002-*.md`
- 构建后字节数不变：`dist/ada-charts.css`、`dist/k-chart-pro.js`、`dist/t-chart-pro.js`、`dist/t-chart.js`
- `dist/k-chart.js` 消失、`dist/ada-chart.js` 出现 —— **预期**（无下游调用，不做 alias）

## 验证

- `pnpm lint` —— 期望 0 error（当前基线 15 warning）
- `pnpm test` —— 期望全绿（当前 7 files / 84 passed，加新单测后更多）
- `pnpm build` —— 四遍库构建 + `tsc -b` + `.d.ts` 全通过
- `pnpm perf` —— 三方矩阵跑通；`pageErrors` 为空；KChartPro 既有数字（`firstPaint 42.45` / `retainedHeap 15.71` / `streamWindow 2639.3`）保持稳定，作为「K 侧未被影响」的证据
- story 验收点：主题切换同时影响工具栏与图表配色；周期切换经工具栏触发并重载数据；主/副图指标增删各归其位；画线栏能选工具、画完 `activeTool` 自动清空，模式 / 锁定 / 显示 / 清空全部各就各位，`drawingBarVisible:false` 隐藏整条左栏；水印在 canvas 之后可见且不吃鼠标事件；`zh-CN` + `Asia/Shanghai` 生效

## 风险与已知取舍

- **改名动了产物文件名**：`dist/k-chart.js` → `dist/ada-chart.js`。无下游调用，已确认可接受。为控制 diff，阶段 0 单独做、单独验。
- **水印**：v10 无此 API，本层用 DOM 图层实现。它是 DOM 图层而非图表自己画的，位于图表层**之下**、只在 canvas 的透明处透出（因此不遮盖蜡烛与十字光标），不随图表缩放、不进 `getConvertPictureUrl` 截图。表面色必须涂在 `.adachart-pro__body` 而不能由 `AdaChart` 涂，否则水印被完全遮挡 —— 见验证记录「发现 1」。这一点写进 ADR-0003。
- **`features()` 口径**：见阶段 4 的口径约束，不得改动 KChartPro 那一列。
- **交互式画线**：`createOverlay({ name })` 的逐笔绘制依赖引擎内部状态机，`"step"`（点击式）与 `"continuous"`（自由笔）两种 `drawingMode` 需在 story 里各验一个；若某工具在 v10 下行为异常，记录为已知限制而非自行修补引擎。
- **不碰的范围**：`@klinecharts/pro`、`klinecharts-v9`、`vite.config.ts` 的插件与 `optimizeDeps`、`build-lib.mjs` 已有三遍、ADR-0001、ADR-0002、`src/components/klinecharts/**`、`src/components/lightweight-charts*/**`、`src/components/klinecharts-pro/**`
- **明确不做**：README 第 18 行 "68 tool types" 与运行时 67 的漂移；`TChart.stories.tsx` 导致的 `pnpm test:storybook` "Object is disposed" 既有失败

## 验证记录（Storybook 实测）

**环境**：Storybook 10（`pnpm storybook --ci`，`http://localhost:6006`）+ Playwright Chromium，视口 1240×900。

**方法**：以 `iframe.html?id=<story>&viewMode=story` 直接挂载 story，用真实 DOM 点击与鼠标手势驱动，断言只落在可观测事实上 —— 上下文属性、computed style、canvas 像素合成哈希、OKX 网络请求、引擎交给 `Intl.DateTimeFormat` 的 `timeZone` 实参，以及「隐藏某元素前后截图是否逐字节相同」。

**结果：18 项检查全部通过。**

首轮 17/18，唯一失败项是验收点 5 的「可见」半边（见「发现 1」）。修复后重跑 18/18，`C5b` 由 FAIL 转 PASS；`pnpm lint` 0 error、`pnpm test` 92 passed、`pnpm build` 通过。

### 验收点逐条

| # | 验收点 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 主题切换同时影响工具栏与图表配色 | 通过 | `data-theme` `light`→`dark`；工具栏背景 `rgb(241,243,247)`→`rgb(31,31,40)`；图表表面 `rgb(255,255,255)`→`rgb(22,22,28)`；canvas 合成像素哈希变化 |
| 2 | 周期切换经工具栏触发并重载数据 | 通过 | 初始 `1D` 为 active；点击 `4H` 后 active 变 `4H`，并观测到新请求 `…&bar=4H&limit=300` |
| 3 | 主/副图指标增删各归其位 | 通过 | `BOLL` 只在 Main 勾选、`MACD` 只在 Sub；取消 `VOL` 后 Sub 该行变回 unchecked；pane 数 6→8→10→8 |
| 4 | 画线工具可选中、画完 `activeTool` 自动清空 | 通过 | 面板 35 项含 `segment`/`brush`；选中后按钮为 `Draw · segment` / `Draw · brush` 且带 `--active`；两种模式画完后按钮均回到 `Draw` 并失去 `--active`。[AdaChartPro.tsx](file:///Users/tony/github/ada-charts/src/components/adachart-pro/AdaChartPro.tsx) 中 `onDrawEnd` 是清空 `tool` 的唯一路径，故这是 overlay 走完全部锚点的充分证据 |
| 5 | 水印在 canvas 之后可见且不吃鼠标事件 | 通过（首轮「可见」失败，已修复） | 首轮：隐藏水印前后截图**逐字节相同**，说明它一个像素都没画出来。修复后：水印保持 `z-index: 0`（图表仍在它之上），`pointer-events: none`，中心 `elementFromPoint` 命中 `canvas`，且隐藏水印后截图明显变化。见「发现 1」 |
| 6 | `zh-CN` + `Asia/Shanghai` 生效 | 通过 | 工具栏为 指标/画线/主题；面板分区为 主图/副图；引擎 `setTimezone` 交给 `Intl.DateTimeFormat` 的 `timeZone` 实参为 `Asia/Shanghai`（对照组默认 story 为 `UTC`，证明这是真变化而非默认值） |

全部交互过程中**零 `pageerror`、零 `console.error`**。

### 发现 1 —— 水印曾被完全遮挡（已修复）

计划称水印「在 canvas 之后可见」。首轮实测：**它一个像素都没有画出来。**

把 `.adachart-pro__watermark` 设为 `display:none` 后，同一区域截图与设置前**逐字节相同**（14447B == 14447B）；而把它的 `opacity` 提到 `1`、`z-index` 提到 `9` 置于最上后截图立刻不同（14447B → 20121B）—— 说明**字形渲染正常，纯粹被遮挡**。

遮挡链：

- `AdaChartPro` 当时把 `backgroundColor={ADACHARTPRO_BACKGROUND[theme]}`（`#ffffff` / `#16161c`，均不透明）交给 `AdaChart`；
- `AdaChart` 把该背景作为**内联 `background` 涂在它自己的宿主 div 上**，而该 div 是 `.adachart-pro__chart` 的子元素 —— `.adachart-pro__chart` 是 `z-index: 1`，水印是 `z-index: 0`；
- `klinecharts` 自己的 canvas 确实透明，但**封装层涂的背景不透明**，于是水印被整个挡住。

**修复**（经确认取「压在数据之下」，即保留 CSS 注释里「图表压在水印之上」的原意）：

1. [adachart-pro.css](file:///Users/tony/github/ada-charts/src/components/adachart-pro/adachart-pro.css) 新增 `--adacp-surface`（light `#ffffff` / dark `#16161c`，与原常量取值一致），并把 `background: var(--adacp-surface)` 涂在 `.adachart-pro__body` 上 —— 也就是承载 canvas 的元素**之外**，因而位于水印之下。
2. [AdaChartPro.tsx](file:///Users/tony/github/ada-charts/src/components/adachart-pro/AdaChartPro.tsx) 改传 `backgroundColor="transparent"`，宿主 div 不再涂任何颜色。
3. 删除已无用的 `ADACHARTPRO_BACKGROUND` 常量（表面色的唯一来源改为 CSS 变量，与工具栏同一套主题机制）。

两处注释都写明了这个不变量：把背景挪回图表层会让水印重新不可见。

**复验**：宿主 div computed background 变为 `rgba(0, 0, 0, 0)`；隐藏水印前后截图不再相同（18337B vs 14390B）；水印仍为 `z-index: 0` 且在图表的 `z-index: 1` 之下；`pointer-events: none`，中心 `elementFromPoint` 命中的是 `canvas`。截图中 `ADA · CHARTS` 于蜡烛空隙处清晰可见，蜡烛本身未被染色。

至于计划风险节写的「它是画在 canvas 之上的普通元素」：在修复后这句话按**字面**已不准确（水印在 canvas 之下，只在 canvas 的透明处透出）。该句原本要表达的是「它是 DOM 图层、不是图表自己画的」这一取舍，这一点仍然成立；两处措辞的冲突已按「图表压在水印之上」统一。

### 发现 2 —— step 类画线的 500ms 点击窗口（引擎层，记为已知限制）

初次自动化时 `segment`（`drawingMode: "step"`）两次点击后未完成。这不是 `AdaChartPro` 的缺陷，而是 `klinecharts` 事件层的双击消歧窗口：

- [EventHandlerImp._mouseDownHandler](file:///Users/tony/github/ada-charts/node_modules/klinecharts/dist/index.esm.js#L1823-L1827) 在**第一次 `mousedown`** 时启动 `Delay.ResetClick`（500ms）计时器并记下 `_clickCoordinate`；
- 落在该窗口内的第二次 `mouseup`（[`:L1732-L1745`](file:///Users/tony/github/ada-charts/node_modules/klinecharts/dist/index.esm.js#L1732-L1745) 中 `++_clickCount` 后 `_clickCount > 1`）会走**双击分支**：仅当与 `_clickCoordinate` 的曼哈顿距离 < 5px 才派发 `mouseDoubleClickEvent`，**否则什么都不派发** —— `mouseClickEvent` 被整个吞掉。

因此判据不是「两次点击的间隔」，而是**首击 `mousedown` → 次击 `mouseup` 的总跨度必须 > 500ms**。实测 5 组配置全部吻合（跨度 389 / 479ms 失败，592 / 710 / 711ms 成功）；固定间隔不变、只拉长按压时长也能从失败翻为成功，从而排除「间隔本身」这一解释。

影响面：所有 step 类 overlay（`segment`、`straightLine`、`rayLine`、`fibonacciLine` …），不只是 `segment`；自由笔 `brush`（`continuous`）走 down/move/up 单手势，**不受影响**。真人落两个锚点通常远超 500ms，但**极快的连点会丢掉第二个锚点** —— 按本文「风险与已知取舍」的约定记为已知限制，不自行修补引擎。

### 覆盖范围与未覆盖项

- 已实测 story：**9/9** —— `Default`（验收点 1–4 与对照组）、`Watermark`（验收点 5）、`ChineseLocale`（验收点 6）、`DarkTheme`、`WithIndicators`、`NoDrawingBar`、`MinuteBars`、`FourHourBars`、`CustomStyles`（后 6 个见「验证记录（S4）」）。
- 未实测 story：无。
- 判断保留：后 6 个与上述 3 个走同一条代码路径，仅 args 取值不同，其中 `DarkTheme` 的配色已由验收点 1 的主题切换覆盖。S4 的实测与此一致 —— 除 args 指定的取值外，DOM 结构、pane 布局、指标归属逐项相同。一处补充：`WithIndicators` 虽同路径，却把主图指标从 1 个（`Default` 的 MA）提到 3 个、副图从 1 个（VOL）提到 3 个，恰是「同一路径 + 更大取值」把 pane 溢出缺陷顶了出来（见阶段 6 的 S1），`Default` 的规模不足以暴露它。
- 画线只验了 `segment` 与 `brush` 两个代表，符合「两种 `drawingMode` 各验一个」的要求。
- 数据来自真实 OKX 网络（`curl` 返回 HTTP 200，story 未落到 `okxSnapshotCandles` 兜底），因此验收点 2 的请求断言是真实流量。

## 验证记录（S4）

**环境**：与上节相同（Storybook 10 `pnpm storybook --ci`，`http://localhost:6006`）+ Playwright Chromium 1.63.0，无头模式，视口 1240×900。

**方法**：一次性脚本 `/tmp/s4-verify/verify.mjs`（未入库；从 `/tmp` 运行，以绝对路径 import 仓库的 `node_modules/playwright/index.mjs`）。每个 story 新开一页，以 `iframe.html?id=<story>&viewMode=story` 挂载，等 `[data-adachart-pro-ready='true']` 出现后，再等全部 canvas 连续 3 帧合成哈希不变（`waitStable`，上限 8s），然后收集：`data-theme`；工具栏 / `.adachart-pro__body` / 图表宿主的 computed background；工具栏的分组与按钮（文案 + 是否 `--active`）；pane 容器的 DOM `offsetTop` 与 `getBoundingClientRect().height`；全部 canvas 的 FNV-1a 合成哈希；OKX 请求 URL；`chart.getIndicators({})`；`chart.getPaneOptions()` 与 `chart.getSize(id)`；`chart.getStyles()`；以及每页的 `pageerror` 与 `console.error`。

> 引擎实例取自页面内 React fiber 上的 `chartRef`（`AdaChartPro` 与 `AdaChart` 各存一份），只读、未改任何产品代码。
> pane 的「高度」与「归属」各有两条独立证据：DOM 侧读 pane 容器的 height 与相对 inner 的 top；引擎侧 `getPaneOptions()` 给 pane id、`getSize(id)` 给同一 id 的 top/height，两者按 top 对齐即可把 id 映射到 DOM 元素。`chart.getIndicators({})` 每条返回 `name` + `paneId`，这是「某指标落在哪个 pane」的直接事实。

**结果：6 个 story 全部通过；7 次挂载（6 个 story + `Default` 对照）零 `pageerror`、零 `console.error`。**

### 逐条

| # | 验收点 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | `DarkTheme`：`theme:"dark"` 落在工具栏、表面与画布 | 通过 | `data-theme="dark"`；工具栏 bg `rgb(31, 31, 40)`（`Default` 对照 `rgb(241, 243, 247)`）；`.adachart-pro__body` bg `rgb(22, 22, 28)`（对照 `rgb(255, 255, 255)`）；图表宿主 inline `background: transparent` → computed `rgba(0, 0, 0, 0)`；首个 canvas 合成哈希 `3406038600` ≠ `Default` 的 `933386663` |
| 2 | `WithIndicators`：4 条 pane 断言 | 通过 | 见下节；pane 容器 top/height = (0, **191**) / (192, **100**) / (293, **100**) / (394, **100**) / (494, **26**，x 轴)；canvas **18** 个（4 个图表面板各 4 个 + x 轴 2 个） |
| 3 | `NoDrawingBar`：`drawingBarVisible:false` **只**摘掉画线组 | 通过 | 工具栏分组 **3 → 2**（子按钮数 `[6, 1, 1]` → `[6, 1]`），`Draw` 按钮消失；周期组 6 键 `1m/15m/1H/4H/1D/1W` 仍在且 `1D` 为 active；指标组 `Indicators` 仍在，点开 panel 有 `Main`/`Sub` 两分区、**54** 个 checkbox（27 × 2）；`Theme` 按钮仍在；点击 `4H` 后 `4H` 转 active 并发起 `…&bar=4H&limit=300`；pane 仍 `[393, 100, 26]`；DOM 节点 **37 → 35**（正好少掉画线组的 group 与其 button）（**本条记录早于画线栏迁到左侧**：那时画线组还在工具栏上。迁栏后工具栏已无画线组，`drawingBarVisible:false` 的作用改为隐藏整条左栏 —— 该 story 需重新实测，见「变更记录（左侧画线栏）」） |
| 4 | `MinuteBars`：`period:{type:"minute", span:1}` 生效 | 通过 | 工具栏 `1m` 为 active（其余 5 档 inactive）；请求 `…&bar=1m&limit=300` |
| 5 | `FourHourBars`：`period:{type:"hour", span:4}` 生效 | 通过 | 工具栏 `4H` 为 active（其余 5 档 inactive）；请求 `…&bar=4H&limit=300` |
| 6 | `CustomStyles`：`theme:"dark"` + `styles` 透传 | 通过 | `data-theme="dark"`；工具栏 `rgb(31, 31, 40)`；`chart.getStyles().candle.type === "area"`、`candle.area.lineColor === "#22d3ee"`、`candle.area.smooth === true`；首个 canvas 哈希 `304886092` ≠ `DarkTheme`（同为暗色但 `candle_solid`）的 `3406038600` |
| 7 | 新增检查项零 `pageerror` / 零 `console.error` | 通过 | 7 次挂载的 `pageerror` 与 `console.error` 计数**全部为 0**（`pageErrors: []`、`consoleErrors: []`） |
| 8 | 对照组：`Default` 同页主题切换 | 通过 | 空操作对照：`hashBeforeToggle` 与等待 800ms 后的 `hashAfterNoop` **逐字节相同**（`933386663\|216810080\|2118396276\|…`），说明该页画布在这段时间内不动；点 `Theme` 后 `data-theme` `light`→`dark`、工具栏 `rgb(241, 243, 247)`→`rgb(31, 31, 40)`、第 3 / 7 / 9 个 canvas 哈希变为 `3602811940` / `1296394720` / `1850732512` —— 配色变化可归因于主题而非行情跳动 |

### `WithIndicators` 的 4 条额外断言（主图指标是否与蜡烛共 pane）

前置：`chart.getPanes` 不存在于 v10 的公开 API，故用 `getPaneOptions()` + `getSize(id)` + `getIndicators({})`。

| # | 验收点 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 存在一个高度 > 0 的价格主图 pane（CSS 布局事实） | 通过 | DOM 首个 pane 容器 `top = 0`、`height = **191**`（宽 1240），内含 4 个 canvas；引擎侧 `getSize("candle_pane")` = `top 0 / height 191`，与它按 top 对齐为同一元素 |
| 2 | 主图指标 MA/BOLL/EMA 与蜡烛在**同一个** pane | 通过 | `getIndicators({})`：`MA → candle_pane`、`BOLL → candle_pane`、`EMA → candle_pane`；即三者都落在上面那个 191px 的 pane（蜡烛所在面板），而非各自独立 pane |
| 3 | 副图 VOL/MACD/RSI **各自独立** pane | 通过 | 三条 `paneId` 互不相同：`indicator_pane_…_5`（top 192）/ `…_2`（top 293）/ `…_5`（top 394），height 均 **100** |
| 4 | 所有 pane 高度都 > 0（无 pane 被溢出挤成 0） | 通过 | 5 个 pane 容器 top/height = (0, **191**) / (192, **100**) / (293, **100**) / (394, **100**) / (494, **26**x轴)；**没有任何 pane 高度为 0**；191 + 1 + 100 + 1 + 100 + 1 + 100 + 26 = **520** = 容器高，即发生零溢出 |

口径提示：本记录的「pane 数」把 x 轴容器单列 —— `getPaneOptions()` 共返回 5 项（4 个图表面板 + `x_axis_pane`）。阶段 6 的 S1 记「pane 数由 7 降为 4」时按图表面板计（不含 x 轴），与此一致。

### 与既有判断的关系

- 未发现与「同一代码路径，仅 args 取值不同」相矛盾的证据：`DarkTheme` / `NoDrawingBar` / `MinuteBars` / `FourHourBars` / `CustomStyles` 的 DOM 结构、pane 布局、指标归属与 `Default` 逐项相同，差异全部落在 args 指定的那一项上（主题 / 一个分组 / 周期档位 / `styles`）。
- `WithIndicators` 是本轮唯一「同路径但更大取值」的 story，其 pane 布局（4 个图表面板、零 0 高）与 S1 修复后的预期吻合，可作为该修复在 Storybook 侧的独立复核。
- 唯一需要留意的观测：跨 story 直接比 canvas 哈希会被实时行情干扰（同为亮色的 `Default` 与 `NoDrawingBar` 本次恰好同值，而 `MinuteBars` 因 1m 数据不同而不同），因此本记录只在**同一页内**用哈希作差（第 8 条的空操作对照即是为此设的）。

## 变更记录（左侧画线栏）

**背景**：`AdaChartPro` 初版把画线入口放在顶部工具栏的一个下拉面板里，而 `KChartPro`（`@klinecharts/pro`）把它放在图表左侧的竖向栏上 —— 后者还多出模式 / 锁定 / 显示 / 清空全部四项层控制。按「与 `KChartPro` 完整对齐」的要求补齐：入口迁到左侧，顶部下拉移除，工具只有一个家。

**移植方式**：`@klinecharts/pro` 是编译产物，它的画线栏**不是本仓库代码**，因此「移植」= 用 React 重写 UI + 从其 bundle 精确抽取内联 SVG（一次性脚本抽取，不入库）。产物不变：画线栏仍是本层自己写的 DOM，`@klinecharts/pro` 依然只是一个被冻结的依赖。

**新增文件**（4 个，都在 `src/components/adachart-pro/`）：

| 文件 | 内容 |
| --- | --- |
| `adachart-pro-drawing-tools.ts` | 6 组共 34 个工具、en-US / zh-CN 两套文案、`drawingMessage`、`drawingGroupsFor` |
| `adachart-pro-overlay-icons.tsx` | 42 个内联 SVG |
| `adachart-pro-drawing-bar.tsx` | 左侧栏组件，纯呈现 |
| `adachart-pro-drawing-tools.test.ts` | 11 个单测 |

**与源实现的三处刻意偏离**（都写在代码注释里）：

1. **创建 overlay 时补 `groupId`**。源里 list-item 点击只 `createOverlay(name)`、不带 `groupId`，于是「清空全部」（`removeOverlay({ groupId })`）漏掉这些 overlay。本实现一律带上 `ADACHARTPRO_DRAWING_GROUP_ID`（`"drawing_tools"`，与源同一字面量），因此清空 = 画线栏画的一切。
2. **创建时传 `mode` / `lock`，但刻意不传 `visible`**。源的 `overrideOverlay` 只遍历**已存在**的 overlay，所以磁吸切换对**下一条**画线无效 —— 本实现在 `createOverlay` 里带上 `mode` / `lock` 把它补上。`visible` 不能带：引擎 `OverlayView.drawImp` 是 `if (isValid(progressOverlay) && progressOverlay.visible) …`，传 `visible: false` 会让**正在画的那条**不可见，看起来像工具坏了而不是被隐藏。
3. **第六组「更多」**。源把 `brush` / `simpleAnnotation` / `simpleTag` / `measure` 留在五组之外（它靠顶部工具栏收纳这几个）。顶部下拉既已移除，不收纳就会丢 4 个工具；该组除成员外的一切（图标、文案）都是本层自己的。

**另一处实现细节**：`handleRemoveAll` 除 `removeOverlay({ groupId })` 外还 `setTool(null)`。引擎移除**绘制中**的 overlay 时**不触发 `onDrawEnd`**（`removeOverlay` 只清空 `_progressOverlayInfo`），不清工具会让画线栏继续高亮一个已无物可画的工具。

**布局**：`.adachart-pro__main` 为 `display: flex`；左栏 `flex: 0 0 auto`、宽 52px，`.adachart-pro__body` 取余下宽度并继续承载 `--adacp-surface`。水印不变量不受影响 —— 表面色仍涂在 `.adachart-pro__body` 上，画线栏在它左侧之外（见「发现 1」）。

**编辑期的一处坑**：选中工具那个 effect 必须**不能**把 `overlayMode` / `overlayLocked` 列为依赖。列了的话，在一条 overlay 画到一半时切换磁吸会把它拆掉重建 —— 而处于绘制态的 overlay 只存在于引擎的 `_progressOverlayInfo`、**不在** `_overlays` 的 pane 映射里，重建会让这条半成品遗留在所有映射之外（不可见、不可删的孤儿）。登记侧因此改用独立的 `drawingRef`，在一个无依赖列表的 effect 里按字段同步，effect 读 `drawingRef.current.mode` 而依赖仍是 `[tool, ready]`。

**体积代价**：42 个内联 SVG 使 `dist/adachart-pro.js` 由 **171.60 kB / 42.69 kB gzip** 增至 **251.90 kB / 64.88 kB gzip**（+80.30 kB raw / +22.19 kB gzip）；`dist/adachart-pro.css` 由 **2.11 kB / 0.75 kB gzip** 增至 **4.38 kB / 1.17 kB gzip**。这是「精确移植 SVG」这一决定的直接成本；要压缩可以改为「图标按需传入」或精灵图，代价是与源不再逐字一致。

**验证**（迁栏后重跑）：

- `pnpm lint` —— **22 warnings / 0 errors**，无一条落在新增或改动的画线栏文件上（全部是既有的 `set-state-in-effect` 与 `t-chart-pro-toolbar.tsx` 缺依赖告警）。
- `pnpm test` —— **10 files / 110 passed**，其中新增的 `adachart-pro-drawing-tools.test.ts` **11 passed**。该测试里的 `ADACHART_OVERLAY_NAME_COUNT = 34` 是写死的字面量：unit project 是 node 环境，import `adachart-options.ts` 会把 klinecharts 拉进来并读到 `window`。
- `pnpm build` —— 四遍库构建 + `tsc -b` + `.d.ts` 全通过。

三项在修掉下述 `box-sizing` 缺陷后**重跑，结果同上**（22 warnings / 0 errors、110 passed、构建通过；`adachart-pro.css` 因新增两条 `box-sizing` 由 4.33 kB 变 4.38 kB）。

**实测**（本轮补做）：Storybook 6007 + Playwright Chromium 无头，视口 1240×900；**阻断 `www.okx.com`** 使 `OkxDataLoader` 落到提交进仓库的快照，数据因此确定；判定不靠画布哈希，而是沿 React fiber 取出 `klinecharts` 实例，直接读 `getPaneOptions()` / `getOverlays()` / `getIndicators()` 与 DOM 几何。下列为实测结论：

- **图标**：6 组 + 模式 + 锁定 + 隐藏 + 清空 = 10 行、7 个展开箭头（6 组 + 模式）。子列表内 36 个图标（34 工具 + 2 磁吸）与栏内 17 个 svg **全部 `getBBox()` 非零**（栏内 bbox 共 11 种尺寸，`16x3` 到 `17x17`；箭头 `4x6` viewBox 单位、CSS 6×9）。移植的图标以 `defs` + `g` + `use` 组合的（如 Lock）同样渲染 —— 只按「子元素是否为 path/rect/circle」判空会误判，实测改用 `getBBox()`。
- **子列表**：7 组全部展开成功，条目数 **11 / 2 / 4 / 7 / 6 / 4**，加模式子列表 **2**，共 **36**（34 工具 + 2 磁吸）。几何：起点 `x=52`、即与轨道右边界 **gap 0**；宽 200；`z-index: 10`；首个条目 `elementFromPoint` 命中列表自身（未被图表遮挡）；无一组超出视口下边界。
- **主题跟随**：light 栏底 `rgb(241, 243, 247)` / 文字 `rgb(30, 35, 41)`；dark `rgb(31, 31, 40)` / `rgb(178, 181, 190)`。两者随 `data-theme` 切换。
- **画线**：点组图标 → 该行 `--selected`；点图一次 → `getOverlays()` 得 1 条 `horizontalStraightLine`，`groupId: "drawing_tools"`、`visible: true`、`lock: false`、`mode: "weak_magnet"`、`points: 1`；`onDrawEnd` 后工具自动取消高亮。**偏离 1（补 `groupId`）实测生效**。
- **隐藏**：开关后 `visible: false`，再点回 `true`，按钮 title 在 Hide / Show 间切换。**它是层状态、只作用于已有 overlay，不影响正在绘制的那条** —— 正因如此 `createOverlay` 才刻意不传 `visible`（偏离 2）。实测隐藏状态下再选工具仍能落下锚点，该偏离按设计生效。
- **锁定**：`lock: true`；对照实验 —— 未锁定时拖动使 overlay 的 `value` 由 `78047.78` 变为 `63328`（动了），锁定后同样拖动 `value` 不变（没动）。
- **模式**：初始 glyph title 为 `Cursor`（当前处于磁吸，点击回 normal）；点图标 → title 变 `Weak Magnet` 且按钮高亮；子列表两项 Weak / Strong Magnet；选 Strong 后 glyph title 回到 `Cursor`，随后新画的 overlay `mode: "strong_magnet"` —— **偏离 2（创建时传 `mode`）实测生效**，源实现在此处会漏掉下一条。
- **清空全部**：2 条 → 0 条，并同时取消已选工具（`--selected` 消失）；工具已选中但一个锚点都没落下的情形同样被清掉 —— 即 `handleRemoveAll` 里那句 `setTool(null)` 确有作用。
- **`NoDrawingBar`**：整条 `.adachart-pro__drawing-bar` 不渲染，`.adachart-pro__main` 仍在，body 由 1188 恢复为 **1240**（整宽）。S4 记录第 3 条补注的语义成立。
- **`WithIndicators`**：**5 个 pane** = 蜡烛 + 3 副图 + x 轴，即 **4 个图表面板**；实测高度 **191 / 100 / 100 / 100 / 26 = 517**，图表高 520，余 3px 为 pane 分隔线 → **零溢出**成立。指标归属：MA / BOLL / EMA → `candle_pane`，VOL / MACD / RSI 各占一个 pane。body 宽 1188（左栏占 52）。
- 全部 7 个 story 实测过程中 **无 pageerror**。

**实测发现并修掉的一处布局缺陷**：`.adachart-pro__drawing-item` 原本只有 `width: 100%` + `padding-right: 14px`，而 CSS 默认 `box-sizing: content-box`，于是这一行在 51px 宽的轨道里量到 51 + 14 = 65px（实测 `x=-7..59`）。后果有三：行盒两侧各溢出 7px；展开箭头落在 `37..51` **之外**、压到图表上 6px；子列表的 `left: calc(100% + 1px)` 从虚高的右边缘起算，实测起点 `x=59`、与轨道 **gap 7px**（源实现里是 `left: calc(100% + 1px)` 贴着轨道、gap 0）。修法是给该行与画线栏各加 `box-sizing: border-box`。修后实测：轨道 **52**（含 1px 右边界，与源 `box-sizing: border-box` 同）、行盒 `0..51`、箭头 `37..51`（回到轨道内）、子列表起点 `x=52`、gap **0**、body **1188**；`WithIndicators` 的 body 宽同时由 1187 变为文档预期的 1188。这条缺陷是「凭静态阅读断言几何」漏掉的典型 —— 正是本轮补测的意义。

**与源的另一处有意偏离（记录，未改）**：源的展开箭头默认 `opacity: 0`、仅在该行 `:hover` 时显现；本实现让箭头常驻。理由是常驻才可发现、也才可测；若要逐字对齐可改为 hover 显现。箭头的 CSS 尺寸本实现为 6×9，源为 4×6（见 `adachart-pro.css` 中的说明）。

## 变更记录（截图与全屏）

**背景**：左侧画线栏补齐后，与 `KChartPro` 的差距只剩顶部工具栏的**截图**与**全屏**两个按钮（源见 `@klinecharts/pro` bundle 的 `onScreenshotClick` 与全屏点击处理）。本轮补上。

**实现**（改动 3 个文件，均在 `src/components/adachart-pro/`）：

| 文件 | 内容 |
| --- | --- |
| `adachart-pro-toolbar.tsx` | 两个按钮、`MESSAGES` 新增 5 条文案、`saveImage()`、截屏对话框与其遮罩、Esc 关闭 |
| `AdaChartPro.tsx` | `rootRef`、`screenshot` / `isFullscreen` 两个 state、`handleScreenshot` / `handleFullscreenToggle` / `closeScreenshot`、`fullscreenchange` 监听 |
| `adachart-pro.css` | `:fullscreen` 下的布局，以及对话框 / 遮罩样式 |

**职责切分沿用既有约定**：工具栏不持有图表状态。截图必须拿到 `Chart` 实例、全屏必须拿到被最大化的那个元素，两者都只有 Wrapper 有，因此 Wrapper 只把结果（`screenshot` / `isFullscreen`）与意图（三个回调）交给工具栏；工具栏负责渲染对话框，既不截取也不保存图片。

**全屏状态取自文档而非自己的点击**：源用四个 `*fullscreenchange` 事件做 `toggle`（`setIsFullscreen(v => !v)`），浏览器不经其手退出时就会记反。本实现写成 `document.fullscreenElement === rootRef.current` —— Esc、系统手势、别的元素请求全屏都能被正确反映。同理，请求作用在**根元素**（`.adachart-pro`）而非图表上，工具栏与画线栏因此一同进入全屏。

**`!important` 的来由**：`AdaChart` 会在自己的宿主 `<div>` 上**内联**写像素 `height`（以及 `autoSize: false` 时的像素 `width`），而根元素在 `autoSize: false` 时也被内联写像素 `width`。内联样式压得过 UA 样式表里的 `:fullscreen { width: 100%; height: 100% }`，因此 `.adachart-pro:fullscreen` 的宽度与 `.adachart-pro__chart > div` 的宽高各需一处强制。定尺寸模式下的宽度强制是本轮由这条推理补上的，不是先实测到缺陷才补。

**对话框结构与 a11y**：遮罩若不是真 `<button>`，`oxlint` 会因「静态元素上挂 `onClick`」报错；改成真按钮后又需要「点击遮罩关闭、点击对话框不关闭」。解法是让遮罩与 `role="dialog" aria-modal="true"` 的对话框**互为兄弟**且都是 `position: fixed`（父元素为 static）。于是遮罩可点、可聚焦、可键盘触发，而对话框自身的点击不会冒泡进遮罩，也不需要 `stopPropagation`；另加 effect 使 **Esc** 也能关闭。

**与源的三处有意偏离**（都写在代码注释里）：

1. **截图底色读 `--adacp-surface`**，而非源里硬编码的 `#151517` / `#ffffff`。本项目的暗色表面是 `#16161c`，照抄源会得到一张与屏幕不一致的图。
2. **下载文件名为 `screenshot.jpg`**（源为无扩展名的 `screenshot`），否则多数工具认不出这是 jpeg。
3. **只用标准 Fullscreen API**，不写 `webkit` / `moz` / `ms` 前缀分支。

**体积代价**：`dist/adachart-pro.js` 由 **251.90 kB / 64.88 kB gzip** 增至 **255.02 kB / 65.68 kB gzip**（+3.12 kB raw / +0.80 kB gzip）；`dist/adachart-pro.css` 由 **4.38 kB / 1.17 kB gzip** 增至 **5.69 kB / 1.42 kB gzip**。

**验证**：

- `pnpm lint` —— **22 warnings / 0 errors**。新加的 Esc effect 起初按 `props.onScreenshotClose` 取值，多出 1 条 `exhaustive-deps`（23 条）；改为在组件顶部解构 `onScreenshotClose` 后回到基线的 22 条，无一条落在本轮新增代码上。
- `pnpm test` —— **10 files / 110 passed**（本轮未新增测试：纯 DOM / 浏览器 API 接线的价值在实测而不在单测）。
- `pnpm build` —— 全部构建通过，体积如上。

**实测**（Storybook 6006 + Playwright Chromium 无头，视口 1240×900；阻断 `www.okx.com` 使行情落到快照）：

- **按钮**：英文 story 工具栏末端为 `Screenshot` / `Full Screen`，中文 story 为 `截屏` / `全屏`。
- **截屏对话框**：点 `Screenshot` 后 `.adachart-pro__modal` 出现，`role="dialog"`、`aria-modal="true"`，标题随语言（`Screenshot` / `截屏`），按钮为 `×` 与 `Save` / `保存`；遮罩是 `BUTTON`、`aria-label` 为 `Close` / `关闭`。
- **截取内容**：`img.src` 以 `data:image/jpeg;base64,` 开头，`naturalWidth × naturalHeight` = **1188 × 520** —— 与 `chart.getSize()` 完全一致（即整个图表）；渲染尺寸 500×219（`max-width: 100%` 生效）。
- **底色与主题一致**：light 表面 `#ffffff`，图片左上 / 右下角像素均为 `rgb(255, 255, 255)`；dark 表面 `#16161c`，两角为 `rgb(23, 22, 28)`（jpeg 有损编码的 ±1 舍入）。这是偏离 1 的目的所在。
- **保存**：点 `Save` 触发下载事件，`suggestedFilename` = **`screenshot.jpg`**，无 failure。
- **三种关闭方式**：`×`、遮罩（点左上空白处）、`Esc` 均使 `.adachart-pro__modal` 消失，关闭后计数 **0**。（脚本侧的一个记录：遮罩覆盖整屏且与对话框同名 `Close`，`getByRole('button', { name: 'Close' }).first()` 会先命中遮罩、而遮罩中心被居中对话框挡住 —— 实测因此改用 `.adachart-pro__modal-close` 与遮罩自身的类名定位。）
- **全屏（`autoSize: true`，默认 story）**：进入前 root 559 / 图表 520 / `chart.getSize().height` 520；点 `Full Screen` 后 `document.fullscreenElement.className` = **`adachart-pro`**，计算样式 `display: flex` / `flex-direction: column`，root **900**，body / 图表 / 图表宿主均 **861**（= 900 − 39 工具栏），引擎 `getSize().height` **861**；按钮文案变为 `Exit Full Screen`。点 `Exit Full Screen` 后 `fullscreenElement` 为 `null`，一切回到 **520**，文案回到 `Full Screen`。注意图表宿主的内联 `height` 全程是 `520px` —— 861 正是 `!important` 压过它的结果。
- **全屏（`autoSize: false`）**：用 story args（`args=autoSize:false;width:720`）造出定尺寸场景。进入前 root 720×559、图表宿主 720×520（内联 `width: 720px`）；进入后 root **1240×900**、图表宿主 **1188×861** —— 内联的 720px 被两处 `!important` 压过；退出后回到 720×520。
- **无 pageerror**：四个 story（`default` / `chinese-locale` / `dark-theme` / 定尺寸）全程零 pageerror。

## 待补清单（与 `@klinecharts/pro` 的差距）

**方法**：逐条读 `node_modules/@klinecharts/pro/dist/` 的 `index.d.ts`、`klinecharts-pro.css`（类名即 UI 分区）、`klinecharts-pro.js`（约 215 kB，压缩后仍带标识符名）。下表的行号都指 `klinecharts-pro.js`。

**先记一个前提**：pro 建在 **klinecharts v9** 上，它写的是 v9 的样式路径；本仓库是 v10。v10 的 `Styles.yAxis` 是 `AxisStyle`，只有 `show / size / axisLine / tickLine / tickText`（`node_modules/klinecharts/dist/index.d.ts:457-463`）—— **没有** pro「设置」对话框里的「价格轴类型（normal / percentage / log）」，`YAxisOverride`（`index.d.ts:678-680`）里也没有；「反转坐标」可用 `overrideYAxis({ reverse })` 落地。因此设置对话框不能 1:1 照搬，须逐项确认 v10 落点。可确认存在对应项的 6 个：`grid.show`、`candle.type`、`candle.priceMark.last.show`、`candle.priceMark.high.show`、`candle.priceMark.low.show`、`indicator.lastValueMark.show`。

| # | 差距 | 证据（pro 侧） | 类别 |
| --- | --- | --- | --- |
| 1 | **设置对话框**：宽 320，[确定]；蜡烛样式 select（candle_solid / candle_stroke / candle_up_stroke / candle_down_stroke / ohlc / area）、显示最新价 / 最高价 / 最低价 / 指标最新值四个 switch、价格轴类型 select（normal / percentage / log）、反转坐标 switch、显示网格 switch；改动以深合并 partial styles 实时生效 | 定义 `:2962-3017`，触发 `:2543`，宽 `:2931`，应用 `:3024-3030` | A 面板 |
| 2 | **时区选择对话框**：宽 320，select + [确定]；项为 `{key, text}` 且 text 本地化 | 触发 `:3808`；`setTimezone` 存 `{key, text: b9(timezone, locale)}` `:3382-3387` | A 面板 |
| 3 | **指标参数设置对话框**：宽 360，标题=指标名，按指标生成 calcParams 输入（precision / min），支持 `lines[i].color` 样式键 | 定义 `:3243-3280`，入口 `:3500-3509`，参数表 `:3117-3242` | A 面板 |
| 4 | **指标图例（tooltip）图标接线**：`visible` / `invisible` → `overrideIndicator({visible})`；`setting` → 开参数对话框；`close` → `removeIndicator`（主/副图分别处理并同步工具栏勾选） | `:3483-3521` | B 接线 |
| 5 | **画线栏折叠/展开按钮**：周期栏最左汉堡 `onMenuClick` 切换画线栏可见性并 `chart.resize()`，本地状态由 `drawingBarVisible` 播种 | `:3795-3800`、`:3369` | B 接线 |
| 6 | **`setStyles` / `getStyles`**：pro 的 `ChartPro` 接口有 | `index.d.ts:45-46` | B 接线 |
| 7 | **历史翻页**：`chart.loadMore()` → 按周期对齐的区间取 500 根 → `applyMoreData`；区间算法覆盖 minute / hour / day / week / month / year | `:3478-3482`、`:3396-3434` | C 正确性 |
| 8 | **价格单位 + 精度**：`symbol.priceCurrency` 大写后挂到价格轴 DOM（`.klinecharts-pro-price-unit`）；标的变化时 `setPriceVolumePrecision(pricePrecision ?? 2, volumePrecision ?? 0)` | `:3466-3467`、`:3526` | C 正确性 |
| 9 | **日期格式随周期变化**：`customApi.formatDate` 按 `period.timespan` 切格式（minute→轴 `HH:mm` / 浮层 `YYYY-MM-DD HH:mm`；hour→`MM-DD HH:mm`；day/week→`YYYY-MM-DD`；month→`YYYY-MM`；year→`YYYY`） | `:3438-3453` | C 正确性 |
| 10 | **加载中 / 空状态**：`.klinecharts-pro-loading`（三圆点）与 `.klinecharts-pro-empty`（图标） | `:2139` | C 正确性 |
| 11 | **标的选择按钮里的 `symbol.logo`** 图片 | `:2530-2536` | D 小项 |

**已对齐（不重做）**：周期档位、指标主/副选择（本实现列全 27 个内置指标，pro 的模态框是固定清单）、主题切换、截图、全屏、水印、左侧画线栏（5+1 组 + 模式/锁定/显示/清空全部）、`drawingBarVisible` prop、`DataLoader` 接口与 OKX 轮询 / 快照回退、中英文案、`setSymbol` / `setPeriod` / `setTheme` / `setLocale` / `setTimezone` 等 getter/setter。

**本实现比 pro 多的**：第六组「更多」（brush / simpleAnnotation / simpleTag / measure，pro 把这 4 个留在工具栏外）、画线 overlay 一律带 `groupId`（「清空全部」因此可靠，pro 会漏）、`AdaChartProApi` 多出 `chart()` / `setTool` / `getTool` / `setMainIndicators` / `setSubIndicators`。

**执行顺序**（用户拍板：两个对话框先做，其余全部补齐）：1 → 2 → 3+4 → 5+10+11 → 7+8+9 → 6 → 验证与记录。
**状态**：上表 11 项已全部落地，见下节变更记录。

## 变更记录（11 项差距补齐）

| # | 落地位置 | 证据 |
| --- | --- | --- |
| 1 设置对话框 | `adachart-pro-dialogs.tsx` 的 `AdaChartProSettingsDialog`（宽 320） | 单测断言 `role="dialog"` / `aria-modal` / `width:320px` / 7 个 `__field-label` / 6 个 checkbox / 1 个 select / 6 个蜡烛 option / `checked=` 计数 4；浏览器实测计算宽度 320、7 个字段、Esc 可关 |
| 2 时区对话框 | `AdaChartProTimezoneDialog`（宽 320，select + [确定]） | 浏览器实测 20 个 option、当前值选中、Esc 可关；单测覆盖「列表外的时区被追加而非替换」（`Europe/Kyiv` → option 数 +1 且选中） |
| 3 指标参数对话框 | `AdaChartProIndicatorParamsDialog`（宽 360，标题=指标名） | 单测断言 number 数 = `calcParams` 数、color 数 = `lineColors` 数，`VOL`（`lineColors: []`）时 color 数为 0 |
| 4 图例图标接线 | `handleIndicatorFeatureClick`（`AdaChartPro.tsx:797-830`） | `visible` → `overrideIndicator({visible: !current.visible})`；`setting` → `indicatorParamsOf(chart, id)` 开参数对话框；`close` → 从 main/sub 清单去掉该名字，由 `AdaChart` 的协调 effect 真正移除 |
| 5 画线栏折叠按钮 | 工具栏首按钮（`title="Menu"`）+ `handleToggleDrawingBar`（不再手动 `resize()`，见下文「lint 清理」一节） | 浏览器实测：默认 story 画线栏存在且 `aria-pressed="true"`，点击后消失、`aria-pressed="false"`，再点恢复；`no-drawing-bar` story 载入即 `aria-pressed="false"`、`.adachart-pro__drawing-bar` 计数 0 |
| 6 `setStyles` / `getStyles` | `AdaChartProApi`（`AdaChartPro.tsx:573-575`） | `setStyles` 的补丁进入 `styles` 合成树（`apiStyles` 层），不直接调实例方法；`getStyles()` 读引擎当前树 |
| 7 历史翻页 | `OkxDataLoader.getBars` 的 forward / backward 分支；OKX 的 `after` / `before` 两个反向键由 `okxCandlesUrl`（`src/okx.ts`）表达 | 单测 10 例：init 整窗升序、forward 用 `after` 且丢边界那根、满页判定、backward 用 `before`、timestamp 为 null 时不请求 |
| 8 价格单位 + 精度 | `priceUnit`（`symbol.priceCurrency` 大写）+ 绝对定位徽标挂进 `chart.getDom(CANDLE_PANE_ID, "yAxis")` | 浏览器实测徽标文案 `USDT`，计算样式 `position: absolute` / `font-size: 10px` / `pointer-events: none` |
| 9 日期格式随周期 | `dateFormatterFor(period.type, locale, timezone)` 经 `formatter` prop 下发 | 单测断言各周期形状，以及忽略引擎自带的 `dateTimeFormat` / `template` |
| 10 加载 / 空状态 | 三圆点遮罩 + 50px SVG 空状态图标，由 `observeBars` 的 `dataState` 驱动 | 单测：loading→ready、loading→empty、翻页不上报、push 把 empty 升级为 ready |
| 11 `symbol.logo` | 工具栏标的选择按钮内的 `<img class="adachart-pro__logo" alt="">` | 浏览器实测：picker 面板列出 2 项，点击后按钮文案由 `BTC-USDT` 变为 `ETH/USDT`，logo `src` 以 `data:image/svg+xml` 开头、计算 `border-radius: 50%` |

**四处有意偏离**：

1. **「价格轴类型」（normal / percentage / log）不移植**。v10 的 `Styles.yAxis` 是 `AxisStyle`，只有 `show / size / axisLine / tickLine / tickText`，`YAxisOverride` 里也没有这一项（见本文档上方「先记一个前提」）。硬加只会得到一个不生效的控件。设置对话框因此是 7 行而非 pro 的 8 行。
2. **`visible` 图标只改引擎、不回写工具栏勾选**，与 pro 相同；`close` 图标则直接改 main/sub 清单，而不是调 `removeIndicator` —— 两者效果相同，但清单是这份实现的唯一真相来源，少一次状态回写就少一处可能不一致。
3. **日期格式用 `Intl.DateTimeFormat` 选项而非固定模板字符串**。pro 按 `period.timespan` 切一串写死的模板；用 `Intl` 的选项（`month: "2-digit"` 等）能随语言与时区自动正确，代价是形状要逐个周期写明（已由单测钉住）。
4. **截图下载名带 `.jpg` 扩展名**（pro 是不带扩展名的 `screenshot`），见上一节变更记录。

**修好的一个缺陷**：`BarCache` 原本在把数据交出后仍保留引用，使 `observeBars` 的 loading→ready 判定可能被上一轮的缓存伪造成「有数据」。现在落地即删（`adachart-pro-datafeed.ts`）。

**新增文案键**（`adachart-pro-messages.ts`）：`settings`、`timezone`、`loading`、`empty`、`indicatorSettings`、`parameter`、`lineColor`、`candleType`、`reverseCoordinate`、`gridShow`、`menu`、四个开关标签（`lastPriceShow` / `highPriceShow` / `lowPriceShow` / `indicatorLastValueShow`）等，中英各一份。

**验证**

- `pnpm lint` → **25 warnings / 0 errors**（基线 22）。新增 3 条：`AdaChartPro.tsx` 的 2 条 `react(refs)`（`loaderRef.current = dataLoader` 在渲染期写入 —— 子组件的挂载 effect 先于父组件运行，而 `AdaChart` 在同一 effect 里就会向 loader 要首屏数据，只能渲染期写）与 1 条 `set-state-in-effect`（`drawingBarVisible` 的 prop 同步 effect，与既有 6 条同类）。均为 warning，0 error。
- `pnpm test` → **151 passed / 13 files**（基线 110 / 8 files）。本窗口新增 `adachart-pro-settings.test.ts`（18 例）、`adachart-pro-datafeed.test.ts`（10 例）、`adachart-pro-dialogs.test.tsx`（8 例）；`adachart-pro-options.test.ts` 由 11 增至 13 例。
- `pnpm build` → 成功。`dist/adachart-pro.js` **274.42 kB（gzip 71.37 kB）**；`dist/adachart-pro.css` **7.67 kB（gzip 1.83 kB）**。
- **Storybook 6006 实测**（Playwright Chromium，iframe 视图）：默认 story 10 个 canvas、工具栏 13 个按钮、零 pageerror；设置 / 时区对话框宽度 320、Esc 可关；**Sub 组勾选 RSI 后 canvas 由 10 → 14、最高 canvas 由 393px → 292px，取消后回到 10 / 393** —— 新增一个副面板的确证；画线栏开关的 `aria-pressed` 与可见性同步；价格单位与标的选择器如表中所述。

**三条被推翻的浏览器结论**（记录在此，避免下次重复踩）：

1. 首轮代理报「设置对话框约 500px 宽，含主题 / 语言 / 时区 / 水印 / 主副指标列表」。本实现是 320px、蜡烛样式 + 6 个开关，代理量到的应是 Storybook 自身的面板。已改用 `adachart-pro-dialogs.test.tsx` 的静态标记断言作为确定性证据。
2. 首轮代理报「勾选 RSI 无变化」。原因是点在了 **Main** 组的 RSI 上 —— 主图指标叠加到既有蜡烛面板，本就不该新增 canvas。改点 **Sub** 组后得到上面的 10 → 14。
3. 另：`NoDrawingBar` 的 story id 是 `charts-adachartpro--no-drawing-bar`，代理首轮用的 `--nodrawingbar` 不存在 —— 属 URL 写错，不是产品缺陷。

## 变更记录（lint 清理与画线栏箭头改版）

### lint：25 → 15 条 warning，`AdaChartPro` 清零

- **8 个 prop 同步 effect → 模块级 `useSteered`**（`AdaChartPro.tsx:220-227`）：在渲染期比较 prop 的*引用*，变了才把 state 取成解析后的值。这正是 React 为「prop 变了，据此调整跟随它的 state」记载的写法，消掉 8 条 `set-state-in-effect`。顺带修掉原写法的一个真实缺陷：`resolved.*` 每次渲染都是新对象，以它为依赖的 effect 会在父层每次渲染时重新触发，每次都多级联出一次渲染。
- **loader 的 ref 写入从渲染期挪进 effect**，包装器改由模块级 `observedLoaderFor(current, onState)` 在调用时读取实体（`AdaChartPro.tsx:242-252`）。
- **依赖数组显式列出 `useSteered` 交回的 7 个 setter**。它们本身就是稳定的 `useState` setter（只是经自定义 hook 返回后 linter 不再认得），列出不改变记忆化效果，`useMemo` 造出的 `api` 依旧一生一个引用。
- **`AdaChartPro.tsx` 仅剩的 1 条 `react(refs)` 按行抑制**，位置是「把读取 ref 的取值函数交给 `observedLoaderFor`」那一行。实测过 5 种替代写法 —— 裸闭包、直接传 ref 盒子、藏进自定义 hook、用普通盒子代替 ref、先经 `useCallback` —— 全部被规则拦下（普通盒子改触发 `react(immutability)`）。故按行 `oxlint-disable-next-line react/refs` 并写明理由：`observeBars` 只把这个函数存下来，图表索要数据时才调用，绝不在渲染期。
- **剩余 15 条全在冻结目录 `lightweight-charts-pro/`**（`TChartPro.tsx` 14 条 + `t-chart-pro-toolbar.tsx` 1 条；10 条 `set-state-in-effect` + 5 条 `exhaustive-deps`）。这些文件相对 HEAD 未被改动，是基线而非本次引入；用户明确表示不处理，因此不动冻结代码。
- **删掉了画线栏折叠后的手动 `chart.resize()`**。`AdaChart` 在图表宿主上保持的 `ResizeObserver`（`src/engine-mount.ts:96-103`）已经覆盖宿主宽度变化，重复调用只会对同一个盒子测两遍。实测确认无副作用：隐藏画线栏后 canvas 由 644px → 696px（属性宽 1288 → 1392）。

### 画线栏展开箭头改版（推翻上一轮的「常显箭头」偏离）

用户指出行内那个 `>` 箭头很难看，要求去掉 / 变小 / 换样式，并以 `@klinecharts/pro` 的观感为准。上一轮「为箭头在行内预留右侧 14px 槽位、箭头 14×24 常显」正是难看的来源，现按 pro 原版改回：

| 项 | 改前 | 改后（= pro） |
| --- | --- | --- |
| 箭头盒 | 14×24，`top:50%` + `translateY(-50%)`，常显 | 10×32，`top:0; right:0`，`opacity:0`，`transition:all .2s`，`border-radius:2px 0 0 2px` |
| 显隐 | 始终可见 | `.adachart-pro__drawing-item:hover` / `.adachart-pro__icon-arrow:focus-visible` / `--open` 三者任一 |
| 旋转 | 箭头盒自身 `translateY(-50%) rotate(180deg)` | 只让内部 svg `rotate(180deg)`，窄条的圆角因此留在原处 |
| chevron 尺寸 | 6×9 | 4×6 |
| 行内预留 | `padding-right:14px` + `box-sizing:border-box` | 二者都去掉：行占满 51px 内容宽、图标居中，箭头改为叠在右缘之上 |

比 pro 多一条 `:focus-visible`：箭头是真实 `<button>`，没有 hover 的键盘用户仍要能看见它。

**验证**

- `pnpm lint` → **15 warnings / 0 errors**（`AdaChartPro` 已清零，余下 15 条为冻结目录基线）。
- `pnpm test` → **151 passed / 13 files**。
- `pnpm build` → 成功。`dist/adachart-pro.js` **274.06 kB（gzip 71.34 kB）**；`dist/adachart-pro.css` **7.82 kB（gzip 1.86 kB）**，较上轮 +0.15 kB，即新增的箭头规则。
- **Storybook 6006 实测**：轨道仍 52px、行 `padding` 全 0、箭头 10×32 且静止 `opacity:0`、chevron svg 4×6、展开时 svg 的 `transform` 为 `matrix(-1,0,0,-1,0,0)`（即 180°）、图标按钮中心与轨道中心相差 0.5px（图标已居中）、无 CSS 相关报错；隐藏画线栏后 canvas 变宽如上。

> 另记一条构建教训：`pnpm lint` 跑的是 oxlint，**不做类型检查**。本轮的 `useSteered` 引用了未导入的 `Dispatch` / `SetStateAction`，并把 `symbol` 的类型推断拓宽成 `Partial<SymbolInfo>`，lint 全绿而 `pnpm build`（`tsc -b`）报 5 条错。以后动了 TS 代码必须跑一次 `pnpm build` 才算验证过。

### 画线栏组图标改为展开子列表（有意偏离 pro）

用户反馈：「有 `>` 箭头的行，点 icon 没反应，只能点小箭头才出现 menu，应该是点 icon 也弹出 menu 才对」。

先把源实现就地核实一遍（`node_modules/@klinecharts/pro/dist/klinecharts-pro.js`，画线栏渲染处）：

```js
W.$$click = () => { e.onDrawingItemClick({ groupId: _9, name: k.icon, ... }) };  // 图标 → 选中该组第一个工具
c1.$$click = () => { k.key === S() ? A("") : A(k.key) };                          // 箭头 → 展开/收起子列表
```

即**源实现正是「图标选中默认工具、箭头展开列表」**，我们此前与它一致。但用户看到的现象是「点图标没反应」——因为选中工具在你在图上拖动之前不会画出任何东西，于是「只选中」的点击读起来就是什么也没发生。

因此按用户要求改成：组图标 `onClick` 由 `props.onToolChange(group.tools[0].name)` 改为 `toggle(group.key)`，与箭头同一动作；选中改由列表里的条目承担（`adachart-pro-drawing-bar.tsx:121`，`adachart-pro-drawing-tools.ts` 的 `tools` 注释同步更新）。组内工具不再有「一键选中默认工具」这条捷径，换来的是每个工具都走同一条路径、且图标点击必有可见结果。

**未改动**：模式行的图标仍然是切换 normal ↔ 磁吸档（那条有自己的可见反馈，用户没提），箭头仍是展开磁吸子列表；lock / visible / remove 三行本就没有箭头。

**验证**：`pnpm lint` 15 warnings / 0 errors；`pnpm test` 151 passed / 13 files；`pnpm build` 成功。Storybook 实测（`charts-adachartpro--default`）：点第一个组图标（`title="Horizontal Line"`）后 `.adachart-pro__drawing-list` 由 0 → 1，列出 Horizontal Line / Horizontal Ray / Horizontal Segment / Vertical Line / Vertical Ray / Vertical Segment / Trend Line / Ray / Segment / Arrow / Price Line 共 11 项；再点同一次图标 → 0（可反复开合）。

## 变更记录（主图成交量叠加 `vol-main` 与指标分组）

用户诉求（原话）：「不替换默认的 vol 了成本太大，直接加一个 vol-main 把，即代表在主图上显示的 vol」「默认配置，主题显示 EMA + vol-main，副图一个 pane 显示 MACD」「副图内的 vol 带 ma 的就不动了」。即 TradingView 那种 volume overlay，且默认就打开。

### 拍板

1. **不覆盖引擎内置 `VOL`**。`VOL` 是 `calcParams:[5,10,20]` + 四条 figure（三条均线 + 一根柱），均线是它的形状而不是开关；且引擎的指标注册表是**整页全局 map**，同名重注册会静默替换掉页面上所有图（含冻结的 `TChartPro`）的 `VOL`。而 `getIndicatorClass` 未导出，内置模板也克隆不了。因此新增一个名字 `vol-main`，只画柱。
2. **不注册 `VOL+MA`**，副图 `VOL` 一字不动 —— 两个指标，不是一个指标的两档。
3. `ADACHART_BUILT_IN_INDICATORS` 保持**纯引擎清单**（`getSupportedIndicators()` 的结果），`vol-main` 只进 `MAIN_INDICATORS`；原因是 `adachart-window-config.test.ts` 里那条编译期不变量（引擎每个指标必须恰好在两份清单之一）必须仍然是在说 klinecharts。
4. 清单分**主图组 / 副图组**两层都落：数据层两份清单，UI 层 `AdaChartPro` 工具栏两个下拉分别只列各自那组。接受的代价：`RSI` 不再被**提供**在主图（它本来也画不上去，因为没有价格）。
5. 默认**只改 `AdaChart`**（网格模型的 `DEFAULT_CONFIG`），`AdaChartPro` 的 `mainIndicators`/`subIndicators` 与 `ADACHART_DEFAULTS.indicators`（MA + VOL）都不动。
6. 量柱占面板**底部 20%** 写死，不做 prop。

### 改动清单

| 文件 | 改动 |
| --- | --- |
| `src/components/adachart/adachart-window-config.ts` | 新增 `VOLUME_OVERLAY_INDICATOR = "vol-main"`；`MAIN_INDICATORS` 追加它；`DEFAULT_CONFIG` 改为 `main: ["EMA", "vol-main"]` + `panes: [{ id: "macd_pane", indicator: "MACD" }]`；两份清单的注释改写为「引擎每个名称都在其一，`MAIN_INDICATORS` 另含本库自加的那一个」 |
| `src/components/adachart/adachart-options.ts` | `volumeOverlay: IndicatorTemplate<VolumeOverlayDatum>`（`series:"volume"`、`minValue:0`、单条 bar figure、颜色逐根按 `open/close` 从 `indicator.styles.bars[0]` 解析）+ `ensureVolumeOverlay()` 守卫式注册；`resolveSymbol` 补上默认标的的成交量精度（`DEFAULT_VOLUME_MIN_MOVE = 0.01` ⇒ 2 位）；`ADACHART_BUILT_IN_INDICATORS` 注释注明「刻意不含 vol-main」 |
| `src/components/adachart/AdaChart.tsx` | `VOLUME_OVERLAY_Y_AXIS_ID` / `VOLUME_OVERLAY_PANE_SHARE = 0.2` / `volumeOverlayAxisRange`（不导出，避免 fast-refresh 告警）；`create` 里调 `ensureVolumeOverlay()`；指标协调 effect 里给 `vol-main` 带 `yAxisId` 并 stack 到 `candle_pane`，随后 `overrideYAxis({ needWidget:false, gap:{top:0,bottom:0}, createRange })` |
| `src/components/adachart-pro/adachart-pro-toolbar.tsx` | 两个下拉改用 `MAIN_INDICATORS` / `SUB_INDICATORS`（原先两处都列 `ADACHART_BUILT_IN_INDICATORS`） |
| `src/components/adachart/adachart-window-config.test.ts` | 同步默认配置/切换/加 pane 的断言，并新增一条「默认打开的 vol-main 确实在主图清单里」 |
| `docs/adr/0005-volume-overlay-is-its-own-study.md` | 新建 ADR，含实测小节 |

### 实现要点（都是从引擎源码核出来的）

- **计数不能与价格共用坐标轴**：`createRangeImp` 取「画在该轴上一切的并集」，成交量上去会把蜡烛压平；`isDefaultYAxis`/`isManualYAxis` 才用蜡烛高低。因此给 `vol-main` 独立的 `yAxisId`，并 `needWidget:false`（面板已有价格刻度）。
- **band 不能用 `gap` 表达**：`:1094-1106` 是 `topRate = top; if (topRate >= 1) topRate /= height` —— **gap ≥1 被读作像素、<1 被读作数据范围比例，而比例无法超过 1**，gap 最多把数据压到下半部分。改为作用在轴的 **`createRange`**：`to = defaultRange.to / 0.2`（范围拉长 5 倍 ⇒ 柱只占底部 1/5），同时把 `gap` 归零，否则布局模板的 `{top:0.2, bottom:0.1}` 会在这条已拉长的范围上再加内边距、把柱抬离底部。
- **顺序固定**：`overrideYAxis` 在所指轴不存在时提前返回（`:15561-15566`），而轴随指标一起建立，所以必须 `createIndicator` 之后再 override。
- 横向网格线只来自面板的**默认** y 轴（`:7931-7937` 用 `getYAxisComponentById()` 无参），叠加轴不加网格线；蜡烛读 `candleBarOptions.yAxisId`（`:6539`）、指标读 `indicator.yAxisId`（`:7992/8041`），因此叠加轴不影响蜡烛。

### 验证

`pnpm lint` 15 warnings / 0 errors（基线不变）；`pnpm test` 186 passed / 15 files；`pnpm build` 成功（`dist/adachart-pro.js` 279.35 kB / gzip 72.94 kB，此前 278.09 kB）。

Storybook 6006 + Playwright 实测 `charts-adachart--multi-period-grid`（六个窗口实时 BTC-USDT，`INITIAL_BAR_KEYS = 1m/5m/15m/1H/4H/1Dutc`）。探针把每个主图 canvas **先合成到白底**再取像素 —— 柱是 0.7 alpha、蜡烛是实色，在未知背景上无法区分：

| 档位 | 最高柱柱顶（占面板高） | 最深柱柱底 |
| --- | --- | --- |
| 1m | 0.503 | 0.993 |
| 5m | **0.797** | 0.993 |
| 15m | **0.797** | 0.993 |
| 1H | 0.399 | 0.993 |
| 4H | 0.582 | 0.993 |
| 1Dutc | **0.797** | 0.993 |

- 柱底全部 0.993 ⇒ 贴住面板最后一行，`gap` 归零生效（模板自带的 bottom 0.1 会把它们抬起来）。
- 柱顶 0.797 vs 设计值 0.800 ⇒ `1/0.2` 拉伸生效；其余窗口更低，因为范围取自引擎（按数据而非按像素），可见区之外更高的柱会把范围顶上去 —— 与 TradingView 在同一滚动位置的表现一致。
- 蜡烛未被压扁：价格轴仍占满面板，独立轴达到了它的目的。
- 图例实测显示 `vol-main  VOLUME: 16`（副图 `MACD(12,26,9)` 正常）；页面无 error。
- 过程中确认过：`calc` 收到的数据确实带 `volume`（300 根，字段完整），数据链路无需改动 —— 一度误判为「volume 丢了」，实为 Playwright 打印对象时吞掉了字段。

### 成交量精度的修复（1m 图例显示 `0`）

- 症状：1m 档位的 `vol-main` 图例显示 `VOLUME: 0`（不足 1 的成交量被写成 0），蜡烛 tooltip 的 `Volume:` 同样。
- 根因（三级证据）：① 图例数值由 `indicator.precision` 经 `toFixed` 格式化（引擎 `getIndicatorTooltipData`）；② 该精度来自引擎的 `_synchronizeIndicatorSeriesPrecision` —— `series:"volume"` 的指标一律取 symbol 的 `volumePrecision`；③ `resolveSymbol` 原本返回 `volumePrecision: undefined`，于是落到引擎的 `SymbolDefaultPrecisionConstants.VOLUME = 0`。
- 走不通的路（实测）：在模板上写 `precision: 2`。引擎 `override` 确实会设 `_lockSeriesPrecision = true`，但构造函数在 `override` 之后立刻把它重置为 `false`（`index.esm.js:3192-3194`），随后 `addIndicator` 的同步把它覆盖成 symbol 的精度。插桩日志 `DBG p 0 number 0.08719974` 证实精度恒为 0。
- 落点：`resolveSymbol`（`adachart-options.ts`）补上 `volumePrecision: props.symbol?.volumePrecision ?? DEFAULT_VOLUME_PRECISION`，其中 `DEFAULT_VOLUME_MIN_MOVE = 0.01` 经 `pricePrecisionOf` 得 2 位 —— 与 `ADACHARTPRO_DEFAULTS` / `KCHARTPRO_DEFAULTS` 表述一致（tick 才是事实）。价格精度**不动**：引擎自己的兜底值两位小数已可用，改了会波及所有 AdaChart story 的价格轴。
- 复测（Storybook 6006 + Playwright，MultiPeriodGrid 实数据）：1m 图例 `VOLUME: 0.68`、蜡烛 tooltip `Volume: 0.68`；1Dutc 仍折叠显示 `VOLUME: 6.356K`；价格轴仍两位小数；页面无 error。

### 遗留与取舍

- band 不是 prop：比例是常量，若将来要可调，应是**轴**的设置而不是图表的设置。
- 成交量精度只在标的没声明时补默认值；需要别的精度仍可传 `symbol.volumePrecision`。
- `AdaChartPro` 工具栏主图下拉不再提供 `RSI`（分组后的显式代价，已写进 `adachart-pro-toolbar.tsx` 头部注释）。
- 验证用的临时 Playwright 脚本放在 `/tmp`，已随 Storybook 一起清理，未进仓库。


