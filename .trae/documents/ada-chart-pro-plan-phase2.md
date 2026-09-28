# AdaChartPro 阶段 6 —— 新计划

> 已确认范围：首轮 **S1 + S2**，随后追加 **S4**（见第六节的决定记录）；S3 未获批，S5 / S6 明确不做。
> 阶段 0–5 的产物已全部完成并通过构建/测试，因此本文只收录**经证据确认仍未完成**的事项，不重述已完成的工作。

## 一、依据

- 阶段 0–5 产物核查：`dist/adachart-pro.js`、`dist/adachart-pro.css`、`package.json` 的 `./adachart-pro` 与 `./adachart-pro.css` 导出、`src/components/adachart-pro/` 下 7 个文件、9 个 story —— 全部在位。
- 验证记录：`ada-chart-pro-plan.md` 的「验证记录」节 —— 6 个验收点、18 项检查全部通过（含水印修复后的复跑）。
- `ADR-0003`、`perf/results.json`、`src/**` 现状。

## 二、已核实「不需要做」（避免重复劳动）

这三项此前被认为待办，本次逐条核实后确认已闭合：

1. **`structuralKey` 的 `stack` 字段已在白名单中** —— [adachart-options.ts](file:///Users/tony/github/ada-charts/src/components/adachart/adachart-options.ts#L428) 第 428 行 `if ("stack" in record) out.stack = record.stack;`。ADR-0003 第 14 行的要求已落实，无需破例修改冻结目录。
2. **`src/**` 无任何 `TODO` / `FIXME` / `XXX` / `HACK`** —— 全目录检索零命中。
3. **`adaChartPro` 在 perf 矩阵中已有完整的 mount + live 指标** —— 不是「只有体积数据」：`mountSummary` 有 8 行（500/2000/10000/30000 条 × 指标开关）、`liveSummary` 有 4 行，另有逐次原始记录。

## 三、待办

| # | 事项 | 证据 | 优先级 |
| --- | --- | --- | --- |
| S1 | 补上 perf 的 pan/zoom settle 空洞 | `liveSummary` 中仅 2 行为 `null`，恰是 `ada-chart-pro` + `indicators: true` | 高 |
| S2 | 给水印层序加回归护栏 | 护栏目前只在临时脚本里，缺陷可静默复发 | 高 |
| S3 | 把 step 类画线的 500ms 引擎窗口写进 ADR | 验证记录「发现 2」，5 组配置复现 | 中 |
| S4 | 补齐 6 个未实测 story 的验收 —— **已完成** | `ada-chart-pro-plan.md`「验证记录（S4）」：6 个 story 逐条实测，9/9 有记录，7 次挂载零 `pageerror` / 零 `console.error` | 中 |
| S5 | 收敛 `AdaChartPro` 自身的 7 条 lint warning | `pnpm lint` 22 warning 中 7 条属新增组件 | 中 |
| S6 | 决定是否封装截图导出 | `AdaChartProApi` 无导出方法，能力只在 `api.chart()` | 低（需你决定） |

### S1 —— 补上 perf 的 pan/zoom settle 空洞（高）

**证据**：`liveSummary` 12 行里只有 2 行的 `panSettleMs` / `zoomSettleMs` 为 `null`，且**恰好**是 `ada-chart-pro` + `indicators: true` 的两行（2000 与 30000 条都复现）。同一引擎 `indicators: false` 为 32.7 / 33.1ms；另两个引擎的 8 行全部有值。这说明它在**指标开启**时才不等收敛，属可复现的孤立空洞。

**为什么重要**：ADR-0003 把 `AdaChartPro` 的性能契约系在「逐笔增量」上，而增量路径正是在指标叠层（30 个 canvas）时才显出差别 —— 偏偏这一列缺数。对比报告现在无法就「指标开启时的平移/缩放缓动」给出 AdaChartPro 的数字。

**方向**：先在 `perf/harness.tsx` 与 `scripts/bench-charts.mjs` 定位 settle 判据为何在 30 canvas 下不收敛（静默窗口与 long task 的先后、是否在 long task 未结束即判超时）。**修的是测量，不是产品** —— 除非根因确实指向产品。

**结论：根因确实指向产品。** 定位链条如下：

1. `liveSummary` 的 2 行 `null` 同时 `windowMs ≈ 1998`（正常行 ≈ 2031），说明 `settleMs` 是**同步返回的 null**，耗时约 0 —— 不是等不到收敛，而是判据一开始就放弃。
2. Playwright 实测 canvas 尺寸：`indicators: false` 时首个 canvas 为 `833x494`；`indicators: true` 时为 **`831x0`**。`canvasSignature()` 在 `height <= 0` 时返回 `null`，`waitForStableCanvas()` 遂直接返回 `null`。`waitForTimeout(1000)` 复测仍为 0，**不是布局瞬态**。
3. 枚举 pane 容器（`indicators: true`）：共 **7 个 pane**，高度 `0 / 100×4 / 88 / 0 / 26(x轴)`，合计 514 ≈ 容器 520 —— **溢出把两个 pane 挤成 0 高**。全容器截图里没有独立的价格主图，`MA` / `BOLL` / `EMA` 各自开了带蜡烛的 pane，`RSI` 被挤没；逐 pane 截图证实 `pane-2` = MA+蜡烛、`pane-4` = BOLL+蜡烛、`pane-10` = MACD。
4. 引擎源码定根因（`klinecharts` v10 dist）：`ChartImp.createIndicator` 第 15271 行 `indicator.paneId ??= createId(PaneIdConstants.INDICATOR)` —— **不传 `paneId` 就必然新建 pane**；`StoreImp.addIndicator` 第 14162–14165 行里 `isStack` 只控制「是否先清空目标 pane 已有指标」。因此 `AdaChart` 把 `stack` 当 `isStack` 传，在 v10 里**根本无法叠加到主图**，[AdaChartIndicator](file:///Users/tony/github/ada-charts/src/components/adachart/AdaChart.tsx#L183-L190) 原先「`stack` overlays it onto a pane that already exists」的注释在 v10 下不成立。

**为什么此前验收能过**：`Default`（MA+VOL，3 pane，主图仍剩 294px）不破；只有 `WithIndicators` / perf 指标模式（6 指标）才破 —— 解释了 18 项检查为何未拦住它。

**处置（经你批准：破例修产品）**：在冻结目录 [AdaChart.tsx](file:///Users/tony/github/ada-charts/src/components/adachart/AdaChart.tsx) 内把 `stack: true` 的指标改为**显式传 `paneId: 'candle_pane'`**（`CANDLE_PANE_ID` 常量，注释写明 v10 未导出该常量及 `isStack` 的真实语义），并保留 `isStack = stacked` 以免清空同面板已建的主图指标；条目上显式给出的 `paneId` 依然优先。价格面板由 `ChartImp` 构造函数（dist 第 14649 行）**预先建立**，故该 id 在指标创建时必定存在。修好后 pane 数由 7 降为 4，主图非退化，S1 的测量空洞随根因一并消失 —— **因此未再改 `perf/harness.tsx`**，避免在根因已修的前提下增加无谓的测量改动。

**验收**：`pnpm perf` 后 `liveSummary` 中 `ada-chart-pro` 两行的 settle 均为数值；`pageErrors` 仍为空；KChartPro 既有数字保持稳定（作为「冻结侧未被影响」的证据）。

### S2 —— 给水印层序加回归护栏（高）

**证据**：本次水印缺陷的本质是「表面色所在图层」与「z-index 次序」必须同时正确 —— 任何一个单独看都是合理的，合起来才遮挡。而护栏目前只存在于我本次的一次性脚本里（已随 `/tmp` 丢弃），**这个缺陷可以静默复发**。

**方向**：仓库已有 [adachart-pro-options.test.ts](file:///Users/tony/github/ada-charts/src/components/adachart-pro/adachart-pro-options.test.ts)（vitest，8 个用例）但**没有组件级测试**。加一条能断言「表面色落在 `.adachart-pro__body`、图表宿主为透明」的测试。

**取舍**：`pnpm test:storybook` 目前有既有失败（`TChart.stories.tsx` 的 "Object is disposed"，计划已列「明确不做」），因此走 vitest 比 Storybook play 测试更稳。

**验收**：新测试在 `pnpm test` 中运行；并且**能捕获回退** —— 临时把 `backgroundColor` 改回不透明、或把 `background` 挪回 `.adachart-pro__chart` 时，该测试必须变红。

### S3 —— 把 step 类画线的 500ms 引擎窗口写进 ADR（中）

**证据**：验证记录「发现 2」。判据是**首击 `mousedown` → 次击 `mouseup` 的跨度必须 > 500ms**（`Delay.ResetClick` 从首次 `mousedown` 起算；窗口内的第二次 `mouseup` 走双击分支，仅 5px 内才派发事件，否则整个吞掉），5 组配置全部吻合。

**方向**：这是**已发布产品上真实存在的用户约束**（快速连点会丢第二个锚点），目前只写在计划文档里。ADR-0003 已因水印增加过一条 consequence，同类约束应同样落档。

**验收**：ADR-0003 新增一条 consequence，写明判据、影响面（所有 step 类 overlay；`brush` 不受影响）与「不自行修补引擎」的取舍。

### S4 —— 补齐 6 个未实测 story 的验收（中）

**证据**：验证记录「覆盖范围与未覆盖项」。已实测 3 个（`Default` / `Watermark` / `ChineseLocale`），未实测 6 个：`DarkTheme`、`WithIndicators`、`NoDrawingBar`、`MinuteBars`、`FourHourBars`、`CustomStyles`。

**重点**：`NoDrawingBar` 值得单独看 —— `drawingBarVisible: false` 时工具栏是否仍渲染、开关是否**只**影响画线组而不误伤周期/指标组。其余几个主要验证 args 取值路径。

**验收**：9/9 story 有实测记录，新增检查项同样零 `pageerror`。

### S5 —— 收敛 `AdaChartPro` 自身的 7 条 lint warning（中）

**证据**：`pnpm lint` 0 error / 22 warning，其中 7 条为 `react(set-state-in-effect)`，位于 [AdaChartPro.tsx](file:///Users/tony/github/ada-charts/src/components/adachart-pro/AdaChartPro.tsx#L180-L208) 第 180–208 行的 props→state 同步 effect。

**方向**：这是「prop 驱动 state」的既有写法。可选收敛方式：把 prop→state 同步改为 render 期派生比较，或把 state 收进 reducer 并只在 prop 变化时派发。**需先确认是否值得动** —— 该处「仅当 `props.x !== undefined` 才覆盖」的语义是刻意的（见该处注释），改动有回归风险。

**验收**：`pnpm lint` warning 22 → 15（回到基线）、0 error；`pnpm test` 92 passed 不降；6 个验收点复跑仍全过。

### S6 —— 是否封装截图导出（低 · 需你决定）

**证据**：`AdaChartProApi` 暴露 `chart()`（返回原始 `Chart`），`AdaChart` 的 `onChartReady` 注释明确提到可拿到 `getConvertPictureUrl`；但 `AdaChartProApi` **未包装**导出能力。

**取舍**：水印是 DOM 图层，**不会**出现在导出的图片里（计划风险节已记）。若封装，必须在签名与文档里写明这一点，否则用户会以为导出的图带水印。

**选项**：不封装（现状，用户走 `api.chart()`）／封装 `toPicture()` 并在文档写明水印不入图。

**验收**：若封装，补一条测试断言返回的是 data URL 且长度 > 0。

## 四、建议顺序

S1 → S2 → S3 → S4 → S5 →（S6 待定）。

理由：S1 让性能对比表不再有洞，S2 把本次刚发现的缺陷锁死、防止复发，S3 是一次性的落档、代价很小；S4/S5 是覆盖面与整洁度，可随后。

## 五、明确不做

- **不修补 `klinecharts` 引擎** —— S3 只落档，不动引擎源码。
- README 第 18 行 "68 tool types" 与运行时 67 的漂移。
- `pnpm test:storybook` 的既有失败（`TChart.stories.tsx` "Object is disposed"）。
- 冻结目录：`src/components/klinecharts/**`、`src/components/klinecharts-pro/**`、`src/components/lightweight-charts*/**`。
- 不重跑完整 `pnpm perf`，除非是为了 S1。

## 六、决定记录

原先待定的三件事已定：

1. **范围**：**只做高优先 —— S1 + S2**。S3 / S4 未获批，本轮不做。
2. **S5**：**先不动** —— 它触及 `AdaChartPro` 的 prop→state 写法，语义刻意（「仅当 `props.x !== undefined` 才覆盖」），回归风险大于收益。
3. **S6**：**不封装**截图导出 —— 保持现状（用户走 `api.chart()`）。

实施中新增一项裁决：

4. **S1 的破例**：S1 根因指向产品（见上节），修它必须动冻结目录。经你批准，**破例修改 `src/components/adachart/AdaChart.tsx`**，把 `stack: true` 的指标改为显式传 `paneId: CANDLE_PANE_ID`。破例范围仅限该文件内这一处语义 + `CANDLE_PANE_ID` 常量，不改动其他冻结内容。这与第五节「冻结目录」的默认约定构成一条**已获批准的例外**，如需回溯以本节为准。
5. **追加 S4**：S1 + S2 收尾后你追加执行 S4（补齐 6 个未实测 story 的验收）。S4 只做实测与落档，**不改产品代码**。S3 仍未获批。

## 七、验证记录（S1 + S2 + S4）

| 项目 | 结果 |
| --- | --- |
| S2 护栏：`adachart-pro-layering.test.ts` | 7/7 通过（4 条 CSS 不变量 + 3 条 SSR 渲染断言） |
| S2 护栏有效性 | 临时把 `backgroundColor` 改回不透明、并把 `background` 挪回 `.adachart-pro__chart` 后，**3 条用例变红**（`paints it on .adachart-pro__body`、`leaves .adachart-pro__chart with no background of its own`、`gives the chart's host element nothing opaque to paint`），确认护栏真能捕获回退；改动已全部还原 |
| `pnpm test` | 9 文件 / 99 用例全通过 |
| `pnpm lint` | 0 error / 22 warning（与改动前同量，未新增） |
| `pnpm build` | 成功；`dist/adachart-pro.css` 2.23 kB / gzip 0.78 kB，`dist/adachart-pro.js` 175.75 kB / gzip 44.90 kB |
| `pnpm perf` | 重跑成功（`generatedAt` 2026-09-27T01:52:53.546Z）。`ada-chart-pro` 两格 +指标 的 settle 由 `null` 变为数值 —— 30000：pan **31.9ms** / zoom **33.6ms**；2000：pan **32.7ms** / zoom **33.4ms**。`pageErrors` = `[]` |
| S1 修复的连带观测 | `ada-chart-pro` +6 指标的 canvas **30 → 18**（与 `k-chart-pro` 的 18 相等）、DOM 节点 **83 → 56**、30000 根常驻堆 **16.68 → 16.64MB**、流式每根墙钟 **22.95 → 21.77ms** |
| 冻结侧未被影响 | `k-chart-pro` / `t-chart-pro` 的 canvas 与 DOM 数本轮完全未动（6/18、123/150；7/19、46/88），堆内存小数位几乎不动 —— 作为「修复未波及冻结侧」的证据 |
| 对比报告同步 | [chart-pro-comparison.md](file:///Users/tony/github/ada-charts/docs/perf/chart-pro-comparison.md) 全部数字已按新 `results.json` 逐项对齐并重算派生倍数；§4.5 原先的「测量缺口」段落改写为「根因在产品、现已关闭」，§4.3 补上修复对 canvas/DOM/堆的影响 |
| ADR-0003 同步 | 第 14 行原写「`stack` 决定 `createIndicator` 的 `isStack` 参数」，已更正为「`stack` 决定显式 `paneId`」并写明 v10 的真实语义与 pane 溢出后果；第 18 行的水印护栏由「截图比对」改为指向新的 `.test.ts` 护栏 |
| S4：6 个未实测 story | Storybook 10（`pnpm storybook --ci`）+ Playwright Chromium 无头、视口 1240×900 实测 `DarkTheme` / `WithIndicators` / `NoDrawingBar` / `MinuteBars` / `FourHourBars` / `CustomStyles`，全部通过；7 次挂载（6 story + `Default` 对照）**零 `pageerror`、零 `console.error`**。逐条证据见 [ada-chart-pro-plan.md](file:///Users/tony/github/ada-charts/.trae/documents/ada-chart-pro-plan.md) 的「验证记录（S4）」；`src/**` 未改动（实测前后 mtime 不变） |
| S4 顺带复核 S1 | `WithIndicators` 实测 `getIndicators({})` 得 `MA/BOLL/EMA → candle_pane`，`VOL/MACD/RSI` 落在三个互不相同的 `indicator_pane_*`；pane 容器高度 `191 / 100 / 100 / 100 / 26(x轴)`，**无 0 高 pane**，合计 520 = 容器高（零溢出）、canvas 18 个 —— 修复在真实浏览器侧独立复核通过 |
| S4 顺带复核 S2 | 实测图表宿主 inline `background: transparent` → computed `rgba(0, 0, 0, 0)`，表面色落在 `.adachart-pro__body`（`rgb(255, 255, 255)` / dark `rgb(22, 22, 28)`），与护栏所断言的不变量一致 |

> S2 为何用 vitest 而非 Storybook play：`pnpm test:storybook` 有既有失败（`TChart.stories.tsx` "Object is disposed"，第五节已列「明确不做」），vitest 更稳。SSR 断言需先在 `beforeAll` 里打桩 `globalThis.window = { navigator: { userAgent: "node" } }` 再动态 `import` 组件 —— `klinecharts` dist 第 1351 行 `isAppleOS()` 在模块加载期读 `window.navigator.userAgent` 且无 `typeof window` 守卫。