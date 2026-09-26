# TChartPro vs KChartPro：性能对比报告

两个 Pro 级全功能金融 K 线组件，建立在**两个不同的渲染引擎**上：

| | 组件 | 引擎 | 位置 |
| --- | --- | --- | --- |
| T | `TChartPro` | `lightweight-charts` v5 + `lightweight-charts-drawing` | [TChartPro.tsx](file:///Users/tony/github/ada-charts/src/components/lightweight-charts-pro/TChartPro.tsx) |
| K | `KChartPro` | `@klinecharts/pro`（内含 `klinecharts` v9 运行时） | [KChartPro.tsx](file:///Users/tony/github/ada-charts/src/components/klinecharts-pro/KChartPro.tsx) |

所有数字取自 [perf/results.json](file:///Users/tony/github/ada-charts/perf/results.json)，由 [scripts/bench-charts.mjs](file:///Users/tony/github/ada-charts/scripts/bench-charts.mjs) 在无头 Chromium 里跑出。报告里没有一个手写的数字。

---

## 一、结论摘要

1. **小数据量下两者同级。** 500–2000 根 K 线、无指标时首屏 20.9ms / 20.9ms（T）对 19.2ms / 17.0ms（K）；带上 6 个指标是 29.9ms / 39.8ms 对 22.4ms / 21.3ms。交互与流式更新都贴着 60Hz 帧预算（16.7ms），没有长任务。这个区间选谁看功能，不看性能。
2. **大数据量 + 多指标仍是分水岭。** 30000 根 + 6 个指标：首屏 420.0ms 对 42.45ms（**9.9 倍**），常驻堆 196.77MB 对 15.71MB（**12.5 倍**），流式更新 92.8ms/根 对 22.0ms/根（**4.2 倍**，且 T 侧 120 次更新触发了 60 个长任务，K 侧只有 2 个）。
3. **流式这一项本轮已被修掉一大半：305.3ms/根 → 92.8ms/根（3.3 倍），长任务 120 → 60。** 原来的写法把「整份数据全量重算指标 + 对每条 series 全量 `setData`」放在每根 K 线上，现在换成了「指标层跟随数据集、尾部 `pop/push` + 每条 series 一次 `update`」。剩下的 4.2 倍差距经定位主要不在指标算法里 —— 见第五节，把它继续压缩需要动的是「10 条长系列在引擎上的 update/绘制」，而不是把 27 个指标改成增量。
4. **首屏与内存这两项与数据量的关系形状不同。** KChartPro 从 500 到 30000 根基本平坦（19.2 → 14.05ms 无指标，22.4 → 42.45ms 有指标）；TChartPro 是线性甚至超线性（20.9 → 44.5ms，29.9 → 420.0ms）。这两项本轮没有变化，因为它们的成本是「一次性把整份历史和全部指标建出来」，本来就是必需的一次。
5. **包体几乎打平，各有胜面。** 交付体积（含引擎、不含 React）：TChartPro 653.26KB / 143.55KB gzip，KChartPro 607.22KB / 153.18KB gzip。K 的 raw 小 7.1%，T 的 gzip 小 6.3%。
6. **交互（平移/缩放）本身测不出差别**，两个引擎 120 次滚轮的同步耗时都 ≤0.07ms/次、末次事件后 2 帧内停止重绘。长任务只有一格非零：T · 30 000 +指标 的平移窗口开头有 1 个约 125ms 的长任务（3 次运行稳定复现），而紧随其后的缩放窗口为 0 —— 这是上一段流式积压的余波（测量顺序是 stream → pan → zoom，中途不卸载），不是平移的开销，详见 4.5。

---

## 二、功能面对照

功能数量取自两个库自己的注册表（`getSupportedIndicators()` / `getSupportedOverlays()` / `getToolRegistry().getAll()`），不是手维护的清单。

| 维度 | TChartPro | KChartPro |
| --- | --- | --- |
| 指标数量 | **27** | **27**（v9 原生） |
| 指标实现位置 | 本仓库 JS，画成普通 series | 引擎内部 |
| 画线工具 | **67** | 32 个 overlay（画线栏是其子集） |
| 工具栏 | 自研 React 组件 | 引擎自带 |
| 数据契约 | `TChartProDatafeed`（`getHistory` / `subscribe`） | `Datafeed`（`getHistoryKLineData` / `subscribe`） |
| 主题 | `theme` + Theme token 扇出 | `theme` + `styles` 覆盖引擎样式表 |
| 时区 | 本层补格式化器（引擎无此选项） | 引擎 `setTimezone` |
| i18n | `locale`（`en-US` / `zh-CN`） | `locale`（引擎提供） |
| 水印 | `TChart` 的 `watermarkText` + `watermarkVisible` | 引擎自带 `watermark` |
| 画线持久化 | `drawings` / `onDrawingsChange` + `exportDrawings` / `importDrawings` | 无（留在引擎内部） |
| 磁吸 / 锁定 / 撤销 | `magnet` / `lockNewDrawings` / 控制器内置 | 画线栏内置 |
| 命令式 API | `chart()`、`mainSeries()`、`drawings()`、`set*`/`get*` 成对、`setTool` | 仅 theme / locale / timezone / styles / symbol / period 的 set/get |
| 挂载后可改的 props | 指标、symbol、周期、主题、时区、画线（全部） | 仅主题、语言、时区、样式、symbol、周期 |
| 容器尺寸自适应 | `autoSize` / `width` / `height` | `autoSize` / `width` / `height`（挂载后不可改，无容器 resize） |
| 卸载 | 本层销毁图表与画线层 | 借 v9 的 `dispose(host)` 找回内部实例 |
| 附带 CSS | 无（工具栏样式内联） | `@klinecharts/pro` 样式表 35.55KB |

指标集合两边完全一致（27 个），画线工具 TChartPro 是 KChartPro 的 2 倍以上。TChartPro 的 API 面明显更宽：K 侧受限于 `KLineChartPro` 只发布了少数 setter，数据与图表实例都是私有的。

---

## 三、测量方法

### 怎么测的

**在压缩过的生产包上测，不测 dev 模式。** `vite dev` 下 React 的开发构建渲染成本高好几倍，而 TChartPro 在 React 里做的事远多于 KChartPro，dev 模式会系统性地偏袒轻的那一层。驱动脚本先用与库构建相同的 klinecharts v9 别名打一份 production bundle，再用静态服务端出来。

- **页面**：[perf/harness.tsx](file:///Users/tony/github/ada-charts/perf/harness.tsx) 把任一 Wrapper 挂进固定的 900×520 容器，把测量值挂到 `window.__perf`。
- **数据**：[perf/dataset.ts](file:///Users/tony/github/ada-charts/perf/dataset.ts) 用固定种子的 PRNG 生成合成 OHLCV（首价 60000，±1% 随机游走），保证可复现。
- **双引擎数据源**：[perf/feeds.ts](file:///Users/tony/github/ada-charts/perf/feeds.ts) 按各自的 `Datafeed` 契约实现，并把 `subscribe` 回调暴露给驱动，由驱动自己按帧推送，不等定时器。两个数据源的 `getHistory*` 都带**同一个** `setTimeout(0)` 的 I/O 边界，避免任一引擎拿到更便宜的历史路径。
- **浏览器**：无头 Chromium，`--js-flags=--expose-gc --enable-precise-memory-info`（前者给出真正的 GC，后者让 `performance.memory` 精细而非量化），60Hz 帧间隔实测 16.7ms。
- **不碰私有字段**：两侧都只走公开契约。KChartPro 没有数据访问器，所以它靠**引擎自己的 loading 指示器**就绪作信号（用 MutationObserver 捕捉，而不是逐帧轮询 —— 面对本地数据源指示器只存在约一个宏任务，轮询会整个错过然后白等满超时）。

### 每个数字的定义

| 指标 | 定义 |
| --- | --- |
| `engineReadyMs` | 从 `render()` 到 `onChartReady`（两边都是「引擎对象构造完成」） |
| `firstPaintMs` | 从 `render()` 到 **K 线可被认为已在屏幕上**。T 侧信号是主系列持有全部 K 线；K 侧信号是引擎收起 loading 指示器。两者都再等一帧作为绘制的代价 |
| `retainedHeapMB` | 挂载后相对基线的常驻 JS 堆。两侧都是「回收 → 稳定 → 再回收 → 读数」，另外基线本身也做两轮回收，避免上一次挂载的短命对象污染读数 |
| `domNodes` / `canvases` | 容器内的元素数 / canvas 数 |
| `streamAvgDispatchMs` | 一次 tick 推送的同步耗时 |
| `streamWindowMs` | 120 次 tick 的墙钟时间（每帧一次更新）。健康值约 1970ms = 120 帧，即**贴着帧预算的地板** |
| `streamLongTaskMs` / `longTasks` | 窗口内超过 50ms 的主线程任务总时长 / 个数 |
| `panAvgSyncMs` / `zoomAvgSyncMs` | 一次滚轮事件的同步耗时 |
| `panSettleMs` / `zoomSettleMs` | 末次事件之后 canvas 继续重绘的毫秒数（2 帧稳定判据，因此地板约 33ms） |

**怎么读「贴着地板」的格子**：墙钟 ≈ 1970ms 表示更新没有成为瓶颈，是测试台每帧一次的循环在限速 —— 这类格子只能读作「≥60 次/秒，未测出上限」。

### 怎么复现

```bash
pnpm perf              # 完整矩阵，约 7 分钟
PERF_QUICK=1 pnpm perf # 冒烟版
```

矩阵：K 线数 `[500, 2000, 10000, 30000]` × 指标 `[无, 有]` × 引擎 `[T, K]`，重复 3/3/2/2 次，报告取中位数。指标组合两边一致：主图 `MA + BOLL + EMA`，副图 `VOL + MACD + RSI`。

---

## 四、性能数据

### 4.1 首屏：从挂载到 K 线在屏幕上

| K 线数 | T 无指标 | T +6 指标 | K 无指标 | K +6 指标 | T/K 比 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 20.9 ms | 29.9 ms | 19.2 ms | 22.4 ms | 1.1× / 1.3× |
| 2 000 | 20.9 ms | 39.8 ms | 17.0 ms | 21.3 ms | 1.2× / 1.9× |
| 10 000 | 25.1 ms | 143.2 ms | 16.3 ms | 22.2 ms | 1.5× / **6.5×** |
| 30 000 | 44.5 ms | **420.0 ms** | 14.1 ms | **42.5 ms** | 3.2× / **9.9×** |

拆开看 `engineReadyMs`（引擎构造完成，不含绘数据）：

| K 线数 | T 无指标 | T +指标 | K 无指标 | K +指标 |
| ---: | ---: | ---: | ---: | ---: |
| 500 | 3.8 ms | 6.7 ms | 3.6 ms | 4.9 ms |
| 2 000 | 4.3 ms | 15.0 ms | 3.8 ms | 4.7 ms |
| 10 000 | 9.6 ms | 51.4 ms | 2.8 ms | 4.6 ms |
| 30 000 | 23.1 ms | 193.7 ms | 3.9 ms | 5.1 ms |

KChartPro 的引擎构造时间在 30000 根时仍是 3.9ms（无指标）/ 5.1ms（有指标）—— **和数据量无关**。TChartPro 是 23.1ms / 193.7ms，随数据量线性上升。

### 4.2 常驻内存

| K 线数 | T 无指标 | T +6 指标 | K 无指标 | K +6 指标 |
| ---: | ---: | ---: | ---: | ---: |
| 500 | 0.69 MB | 3.59 MB | 0.18 MB | 0.43 MB |
| 2 000 | 1.85 MB | 13.76 MB | 0.37 MB | 1.19 MB |
| 10 000 | 8.76 MB | 66.65 MB | 1.22 MB | 5.33 MB |
| 30 000 | 25.67 MB | **196.77 MB** | 3.44 MB | **15.71 MB** |

折成每根 K 线：T + 6 指标 = **6.72 KB/根**，K + 6 指标 = **0.54 KB/根**（12.5 倍）。无指标时 T 是 0.88 KB/根、K 是 0.12 KB/根。

用本仓库自己的 `OKX_HISTORY_LIMIT = 300` 作参照，30000 根是它的 100 倍 —— 那 196.77MB 是「加载 100 屏历史外加 6 条指标线」的代价。

### 4.3 DOM 与 canvas

| | T 无指标 | T +指标 | K 无指标 | K +指标 |
| --- | ---: | ---: | ---: | ---: |
| DOM 节点 | 46 | 88 | 123 | 150 |
| canvas | 7 | 19 | 6 | 18 |

KChartPro 的 DOM 节点是 TChartPro 的 2.7 倍（引擎自带工具栏的代价），但 canvas 数几乎相同：两边都是「每个指标面板多一张 canvas」（7→19、6→18）。

### 4.4 流式更新：120 次 tick，每帧一次

| 引擎 / 规模 | 同步耗时/次 | 120 次墙钟 | 每根墙钟 | 长任务 |
| --- | ---: | ---: | ---: | ---: |
| T · 2 000 无指标 | 0.02 ms | 1 971.8 ms | 16.4 ms（地板） | 0 / 0 |
| T · 2 000 +指标 | 0.02 ms | 1 973.9 ms | 16.4 ms（地板） | 0 / 0 |
| T · 30 000 无指标 | 0.01 ms | 1 988.7 ms | 16.6 ms（地板） | 0 / 0 |
| T · 30 000 +指标 | 0.01 ms | **11 137.8 ms** | **92.8 ms** | **7 710 ms / 60** |
| K · 2 000 无指标 | 0.06 ms | 1 976.8 ms | 16.5 ms（地板） | 0 / 0 |
| K · 2 000 +指标 | 1.27 ms | 1 977.7 ms | 16.5 ms（地板） | 0 / 0 |
| K · 30 000 无指标 | 0.05 ms | 1 974.1 ms | 16.5 ms（地板） | 0 / 0 |
| K · 30 000 +指标 | 19.19 ms | 2 639.3 ms | **22.0 ms** | 121 ms / 2 |

几点值得单独说：

- **T 侧的 30 000 + 指标已经从「不可用」变成「勉强可用、但仍会击穿帧预算」**：92.8ms/根 ≈ 10.8 次/秒，120 根新 K 线 11.1 秒推完；60 个长任务平均 128ms 阻塞主线程。这一格是本轮改动的直接对象，从 305.3ms/根（3.3 次/秒、120 个长任务、36.6 秒推完）降下来。
- **2 000 + 指标这一格顺带被拉回帧预算内**：16.4ms/根，和 KChartPro 一样贴着地板。修好之前它是同规模下唯一越界的格子（18.8ms/根）。
- **T 侧的「同步耗时 0.01ms」仍然是假象**：推送本身几乎免费，因为全部计算被推迟到 React 重渲染与 effect 里 —— 代价被搬走，没有被消除。这正好解释了为什么它的同步数字看起来比 K 还漂亮，而墙钟仍差 4.2 倍。要看真实的账，第五节有逐项分解。
- **K 侧在 2 000 + 指标下同步耗时 1.27ms，比 T 的 0.02ms 差两个数量级**，但墙钟仍在地板上 —— 两者都塞得进一帧。K 的代价是同步的、可预测的；T 的代价是异步的、会击穿帧预算的。

### 4.5 交互：120 次滚轮平移 / 缩放

| 引擎 / 规模 | pan 同步/次 | zoom 同步/次 | pan 长任务 (ms) | zoom 长任务 (ms) | pan 停止重绘 | zoom 停止重绘 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| T · 2 000 无指标 | 0.05 ms | 0.07 ms | 0 | 0 | 30.5 ms | 33.0 ms |
| T · 2 000 +指标 | 0.05 ms | 0.06 ms | 0 | 0 | 28.5 ms | 32.0 ms |
| T · 30 000 无指标 | 0.05 ms | 0.07 ms | 0 | 0 | 30.2 ms | 32.9 ms |
| T · 30 000 +指标 | 0.05 ms | 0.05 ms | **125** | 0 | 28.1 ms | 31.9 ms |
| K · 2 000 无指标 | 0.05 ms | 0.05 ms | 0 | 0 | 32.2 ms | 33.0 ms |
| K · 2 000 +指标 | 0.05 ms | 0.05 ms | 0 | 0 | 32.3 ms | 33.2 ms |
| K · 30 000 无指标 | 0.06 ms | 0.05 ms | 0 | 0 | 32.9 ms | 32.4 ms |
| K · 30 000 +指标 | 0.05 ms | 0.05 ms | 0 | 0 | 32.4 ms | 34.5 ms |

**同步路径这一项是平手，而且要说清是「没测出差别」而不是「都没有问题」。** 所有格子同步耗时 ≤0.07ms；「停止重绘」全部落在 28–35ms，而那正好是判据本身的地板（2 帧 ≈ 33ms）。所以结论只能到「两个引擎都在 2 帧内停止重绘，本方法的分辨率不足以分出高下」，不能推断两者在持续拖拽下的表现完全相同。

**唯一一个非零的长任务格子值得单独解释。** T · 30 000 +指标 的平移窗口里有 **1 个约 125ms 的长任务**，3 次运行分别 119 / 125 / 129ms —— 稳定复现，不是抖动。它落在窗口**开头**，而紧接着的缩放窗口为 0。原因是测量顺序：驱动在同一个挂载上先跑完 120 次流式推送，**立刻**开始平移（`stream → pan → zoom`，中间没有卸载或等待），而 T 侧这一格的流式阶段留下了 7.7s 的主线程积压，余波正好落进平移窗口的开头。所以这 125ms 应读作**流式代价的溢出**，不是平移本身的开销 —— 它恰好又一次说明了 T 侧「代价是异步的」这件事：账会记到下一个窗口头上。

### 4.6 交付体积

TChartPro 把 `lightweight-charts-drawing` 打进自己的包，但 `lightweight-charts` 是 external 由下游解析；KChartPro 除 React 外什么都不外链，v9 被别名钉进它的包里。

| | raw | gzip |
| --- | ---: | ---: |
| `dist/t-chart-pro.js` | 468.48 KB | 84.68 KB |
| `lightweight-charts` v5（peer，下游自带） | 184.78 KB | 58.87 KB |
| **TChartPro 合计** | **653.26 KB** | **143.55 KB** |
| `dist/k-chart-pro.js`（已含 v9 运行时） | 571.67 KB | 142.10 KB |
| `dist/ada-charts.css`（`@klinecharts/pro` 样式表） | 35.55 KB | 11.08 KB |
| **KChartPro 合计** | **607.22 KB** | **153.18 KB** |

参照物：完整的 `klinecharts` v9 单文件是 585.45KB raw / 85.72KB gzip。也就是说 `dist/k-chart-pro.js` 的 571.67KB 几乎就是 v9 本身加一层 Pro UI —— 两者不是相加关系。

**读法**：raw 体积 KChartPro 小 7.1%，gzip 体积 TChartPro 小 6.3%。差异不超过一成，不构成选型理由；真正要留意的是 KChartPro 会把 Vite 别名锁进产物（ADR-0002），仓库必须同时装 v10 与 v9 两份 klinecharts。

---

## 五、为什么会有这个差距

### TChartPro 的成本模型

指标计算在组件里，代码在 [TChartPro.tsx](file:///Users/tony/github/ada-charts/src/components/lightweight-charts-pro/TChartPro.tsx#L361-L371)：

```tsx
const layer = useMemo(
    () => createIndicatorLayer(mainList, subList, chartThemeOf(theme)),
    [mainList, subList, theme],
);
layer.advance(data);
const tracks = layer.tracks;
```

**`data` 不在依赖里。** 指标层（[t-chart-pro-indicators.ts](file:///Users/tony/github/ada-charts/src/components/lightweight-charts-pro/t-chart-pro-indicators.ts#L1253-L1490)）比每一根 K 线活得久：每套指标集合与主题只建立一次，其后的每一份数据集都是「跟随」而非「重建」。跟随之所以可行，靠的是两条性质：

- `mergeCandle` 只重建数据集的末项，它之前的数组元素按引用带过 —— 因此逐元素比较引用即可**证明**前缀未变；
- 27 个指标都是因果的（index `i` 只依赖 `bars[0..i]`），前缀未变即取值未变。

一旦证明不成立（换了标的、有 K 线被排序插进中间），就退回整算 —— 所以跟随是「可证明时为真」，不是赌。

推送侧也从「每条 series 全量 `setData`」变成尾部 `pop/push` + 每根一次 `update`（[TChartPro.tsx](file:///Users/tony/github/ada-charts/src/components/lightweight-charts-pro/TChartPro.tsx#L405-L440)）：

```tsx
const plan = layer.advance(data);
const wholesale =
    plan.kind === "reset" || reached?.engine !== engine || reached.tracks !== tracks;
if (wholesale) {
    seriesRef.current.forEach((series, index) => {
        const track = tracks[index];
        series.setData((track ? (track.perBarColors ?? track.data) : []) as never);
    });
    return;
}
plan.pushes.forEach((push, index) => {
    const series = seriesRef.current[index];
    if (!series || !push.point) return;
    if (push.whole) series.setData([push.point] as never);
    else series.update(push.point as never);
});
```

`wholesale` 只在重建、换图表、换指标集合时为真 —— 来一根新 K 线不会。**尾部可以不止一根，而且这是常态而非特例**：一次渲染超过一帧时 rAF 先于 React 的调度任务执行，同一帧内两根 K 线会并入同一批，于是交给指标层的数据集一次增长 2 项。临时探针实测 120 次 tick 只产生 61 次 render。因此跟随的实现是「前缀证明 + 尾部逐根追加」，而不是只处理「正好多一根」。

**改动效果**：30000 根 + 6 指标下每根墙钟 **305.3ms → 92.8ms（3.3 倍）**，长任务 **120 → 60**；2000 根 + 指标这一格顺带从 18.8ms 回到 16.4ms 的帧预算地板。

#### 剩下的 4.2 倍在哪里

用一次性临时探针（组件内的 `performance.now()` 标记）+ CDP `Performance.getMetrics`，对 30000 根 + 6 指标这一格做分项。120 次 tick，其中 61 次 render：

| 分项 | 总计 | ms/根 |
| --- | ---: | ---: |
| `layer.advance`（指标算术 + 点位映射） | 1 614.6ms | 13.46 |
| 每条 series 一次 `update()`（`pushMs`，10 条） | 469.4ms | 3.91 |
| `TChart` 的数据 effect（含 `decideDataPatch`） | 936.1ms | 7.80 |
| `normalizeChartData`（在该 effect 之内） | 113.8ms | 0.95 |
| 参考线重建 | 13.7ms | 0.11 |
| 图表 props 重建 | 1.6ms | 0.01 |
| **本仓库代码合计**（上列求和；部分分项相互嵌套，故为**上限**） | **≈3 149ms** | **≈26** |
| 墙钟（`pnpm perf` 口径） | 11 030.8ms | 91.9 |
| **差额 = 墙钟 − 本仓库代码** | **≈7 869ms** | **≈66** |

同一窗口的 CDP 计数：

| CDP 计数器 | 值 |
| --- | ---: |
| `ScriptDuration` | 10.65s |
| `TaskDuration` | 11.03s |
| `LayoutDuration` | **0** |
| `RecalcStyleDuration` | **0** |

两个读数合起来的含义：

1. **96.5% 的时间是脚本执行**（10.65s / 11.03s），布局与样式重算都是 0 —— 不是 CSS 或 DOM 布局的锅；
2. 其中约 7.5s 的脚本时间**既不在上面的标记里，也不是布局**。它落在 React 的 render / commit / reconcile 与 `lightweight-charts` 自身的 update / 绘制回调上（引擎的 rAF 绘制同样算脚本）。

由此可以读出一条关键判断：**把 27 个指标改成「有状态可续算」最多只能消掉 `layer.advance` 那 13.5ms/根**，把 92.8ms/根 拉到约 78ms/根 —— **够不到 KChartPro 的 22.0ms/根**。量级在另一侧：**10 条 30000 点的 series 在 `lightweight-charts` 上的 update 与绘制**（约 62ms/根）。要动它只能减少每条 series 的点数或系列数，或者改成自己绘制覆盖层 —— 属于**设计变更**，不是算术优化。

顺带测到、与直觉相反的一点：**`series.update()` 并不是 O(1)。** 同样的调用，`pushMs` 在 2000 根是 0.384ms/根，在 30000 根是 3.91ms/根，随 N 增长。

作为对照，2000 根 + 6 指标那一格：墙钟 1 984.6ms、`ScriptDuration` 1.26s、本仓库代码约 5.4ms/根 —— 整体处在地板上，没有可拆的余量。

### KChartPro 的成本模型

指标、数据、绘制全在引擎内部，v9 按增量维护其数据列表并在渲染时只画可见区间。本层做的事极少：`KLineChartPro` 只发布 theme / styles / locale / timezone / symbol / period 的 set/get，[KChartPro.tsx](file:///Users/tony/github/ada-charts/src/components/klinecharts-pro/KChartPro.tsx#L234-L256) 就只镜像这几个。因此：

- 首屏与数据量脱钩（`getHistoryKLineData` 的数组交给引擎后，引擎自己按需取用）；
- 内存只保留引擎需要的那份数据结构（30000 + 指标 15.71MB）；
- 每 tick 的代价是引擎内部的增量更新（30k + 指标 22.0ms/根，其中 19.19ms 是同步派发）。

代价是这份能力**不可见也不可控**：数据与图表实例私有，本层无法读取、无法断言、无法局部更新。也正因为指标不在 React 里、不画成 series，「10 条长 series 的 update/绘制」这笔开销在 KChartPro 的架构里根本不存在。

---

## 六、优点与缺点

### TChartPro

**优点**

1. **指标与数据全程走公开 API，因此可测、可断言。** 27 个指标是纯 JS 计算后画成普通 series，值可以直接读出来比对 —— 本仓库的单元测试（7 个文件 / 84 个用例）正是建立在这上面，指标数值也已与 klinecharts v9 逐位对齐到 6 位小数。增量层本身也有等价性测试：任一批次推进之后，其轨迹都与一次性路径 `buildIndicatorTracks` 逐格相等。
2. **API 面最宽。** `chart()`、`mainSeries()`、`drawings()`、成对的 `set*`/`get*`、`setTool`，加上 `drawings` / `onDrawingsChange` / `exportDrawings` / `importDrawings` —— 画线可序列化、可回灌、可程序化驱动，指标在挂载后仍可任意增删。
3. **画线能力是 KChartPro 的两倍以上**：67 种工具对 32 个 overlay，且带磁吸、锁定、撤销、清空。
4. **gzip 交付体积略小**（143.55KB vs 153.18KB），且 `lightweight-charts` 作为 peer 由下游解析，不会出现两份引擎。
5. **小数据量下与 KChartPro 同级**：500–2000 根带 6 指标首屏 29.9ms / 39.8ms，流式 16.4ms 贴地板、长任务 0。
6. **无指标时 30000 根仍可用**：44.5ms 首屏、25.67MB，流式 16.6ms 贴地板。
7. **组合而非重写**：`TChartProProps extends TChartProps`，`TChart` 的全部 props 保留可用；时区这一层补上了 lightweight-charts 本身没有的格式化器。

**缺点**

1. **30000 根 + 多指标下仍击穿帧预算。** 指标层已是增量跟随、推送已降到每根一次 `update`，但每根仍要 92.8ms（≈10.8 次/秒），120 根新 K 线的流式窗口里有 60 个长任务、平均 128ms。**并且继续优化指标算术解决不了它**：指标算术只占 13.5ms/根，其余约 62ms/根在「10 条 30000 点 series 的 update 与绘制 + React 提交」上（第五节有逐项分解）。要做成实时，需要动的是系列规模或绘制方式。
2. **内存随「K 线数 × 指标数」线性膨胀**：每根 6.72KB（含 6 指标），是同规模 KChartPro 的 12.5 倍；30000 根 + 指标达到 196.77MB。指标画成 series 就意味着每个点都是一个引擎侧对象，这笔开销是架构自带的。
3. **首屏超线性增长**：从 500 根的 29.9ms 到 30000 根的 420.0ms（14 倍），中途 10000 根就已是 143.2ms。
4. **待办：指标算法由本仓库维护。** 与引擎升级解耦是好事，但正确性也要自己兜（此前就修过 MACD 的 DEA 初值、TRIX 的 null 前值提前返回、CR 的均线越界读取三处偏差）。
5. **文档漂移**：[README.md](file:///Users/tony/github/ada-charts/README.md#L18) 写「68 tool types」，而 `getToolRegistry().getAll()` 实际返回 **67**。报告以运行时注册表为准。

### KChartPro

**优点**

1. **首屏与数据量基本无关。** 500 → 30000 根：无指标 19.2 → 14.1ms，有 6 指标 22.4 → 42.5ms；引擎构造 3.6–5.1ms。30000 根无指标下的 14.1ms 甚至短于一帧。
2. **内存极省。** 30000 根 + 6 指标 15.71MB、无指标 3.44MB —— 只有 TChartPro 的 1/12.5 与 1/7.5。
3. **大数据量下的实时更新仍然可用。** 30k + 指标 22.0ms/根（T 是 92.8ms），120 次更新只产生 2 个长任务、共 121ms。
4. **开箱即全。** 工具栏、画线栏、指标选择、周期切换、水印、主题、i18n、时区全部由引擎提供，本层只需镜像；27 个指标与 32 个 overlay 都不需要本仓库维护算法。
5. **卸载路径可靠。** `KLineChartPro` 不提供 teardown，本层通过 v9 自注册的 `[k-line-chart-id]` 宿主属性找回内部实例并调用 v9 的 `dispose`，避免残留一个对着将被丢弃的 DOM 继续运行的图表。
6. **raw 体积略小**（607.22KB vs 653.26KB）。

**缺点**

1. **引擎不可外链，仓库要装两份 klinecharts。** `@klinecharts/pro` 按 v9 编译，别名必须钉进产物（[ADR-0002](file:///Users/tony/github/ada-charts/docs/adr/0002-two-copies-of-klinecharts.md)），下游拿到的是一个自带引擎的 571.67KB 包，且 gzip 总量比 TChartPro 大 6.7%。
2. **能力天花板由引擎决定。** `KLineChartPro` 只发布了 theme / styles / locale / timezone / symbol / period 的 set/get：没有数据访问器、没有 `resize`、没有 teardown。
3. **多个 props 挂载后改不动。** `mainIndicators`、`subIndicators`、`drawingBarVisible`、`watermark`、`width`、`height`、`periods` 只在构造时生效，变更需要重建整个图表。
4. **容器尺寸变化无法触达。** 其内部 v9 图表只监听 window resize，仅容器变化这条路在这里无从触达 —— 代码里直接写明了这个缺口，而不是去戳私有字段。
5. **不可测。** 数据与图表实例私有，测试只能依赖 DOM 信号与最终像素，无法像 TChartPro 那样断言指标数值。
6. **DOM 节点 2.7 倍**（123 vs 46），工具栏是引擎自带的黑盒，样式定制只能走样式表覆盖。
7. **画线工具少一半以上**（32 个 overlay vs 67 种工具），且画线状态留在引擎内部，没有序列化/回灌接口。

---

## 七、选型建议

| 场景 | 建议 | 理由 |
| --- | --- | --- |
| ≤2000 根 K 线，任何指标组合 | 看功能，不看性能 | 首屏与交互同级，长任务为 0 |
| 长历史（≥10000 根）+ 多指标，且要实时更新 | **KChartPro** | T 侧 92.8ms/根（≈10.8 次/秒）仍会击穿帧预算；K 侧 22.0ms/根 |
| 长历史 + 多指标，静态展示 | **KChartPro** | 首屏 9.9 倍差距、内存 12.5 倍差距 |
| 需要断言/测试指标数值，或要程序化驱动画线 | **TChartPro** | 全公开 API；K 侧数据与实例私有 |
| 需要挂载后动态增删指标、或丰富的画线工具 | **TChartPro** | K 侧指标 props 挂载后不可改，画线工具少一半 |
| 移动端 / 内存敏感 | **KChartPro** | 30000 根 + 指标 15.71MB，是 T 的 1/12.5 |
| 极致 gzip 体积、避免两份引擎 | **TChartPro** | gzip 小 6.3%，引擎走 peer |

**如果只能记一句话**：TChartPro 把引擎缺的东西（指标、画线、工具栏）搬到了 React 层，换来了开放与可测，代价是这些指标要画成 series —— 30000 根下就是 10 条 30000 点的线，而「长系列在引擎上的 update/绘制 + React 提交」这笔开销约 62ms/根，不是把指标算法改成增量就能消掉的；KChartPro 把一切都留在引擎里，换来了平坦的性能曲线，代价是不可观测、不可热改、不可外链。这个取舍在 2000 根以内看不出来，到 30000 根就是一个数量级。

---

## 八、测量局限（读数字前请先读这一节）

1. **单机、无头、单浏览器。** macOS 上的无头 Chromium 153，60Hz 帧间隔实测 16.7ms。绝对值换机器会变，倍数关系应当稳定。
2. **合成数据。** 固定种子的随机游走 OHLCV。指标计算量取决于长度而非价格，所以价格分布不影响结论；但真实行情的跳空、复权、缺失 bar 没有被覆盖。
3. **两侧的就绪信号本质不同。** T 侧是主系列持有全部 K 线（精确），K 侧是引擎收起自带 loading 指示器（引擎未发布数据访问器，这是最近似的诚实证据；`readySignal` 字段逐行记下了每一格用的是哪个信号，本次运行全部命中 `loading-spinner`，无退化到固定帧的情况）。因此 `firstPaintMs` 是**可比的**，但不是逐字节同定义。
4. **`firstPaintMs` 含不足一帧的绘制等待**，所以几十毫秒的那些格子里有一部分不是引擎计算。要看纯计算请对比 `engineReadyMs` 与内存。
5. **流式场景是 60 次/秒的极限压力**，高于真实 1D K 线的更新频率。标「贴地板」的格子测不出上限，只证明「至少 60 次/秒」。
6. **交互项的分辨率不足。** 28–34ms 的「停止重绘」落在判据自身的地板（2 帧）附近，只能得出「两者都在 2 帧内停止」，不能区分持续拖拽下的表现。
7. **30 000 根是本仓库 `OKX_HISTORY_LIMIT = 300` 的 100 倍**，属于压力测试而非典型负载。`pnpm test:storybook` 目前有一个与本次改动无关的既有问题（`TChart.stories.tsx` 的 `Object is disposed`，来自 lightweight-charts 的 rAF 竞态）。
8. **每次运行都是新的挂载/卸载序列**，堆数字依赖 `--expose-gc` 的真实回收；没有该标志时 `retainedHeapMB` 会是 `null` 而不是一个猜测值。
9. **第五节的分项分解来自一次性临时探针，不能由 `pnpm perf` 复现。** 那些 `performance.now()` 标记与 CDP `Performance.getMetrics` 读数是定位过程中临时加入、定位完即删除的，仓库里没有留下插桩代码，所以 `perf/results.json` 只包含第四节那张表里的量。两点注意：分项表里若干标记相互嵌套（例如 `decideDataPatch` 跑在 `TChart` 的数据 effect 之内），因此「本仓库代码合计」是求和后的**上限**；单条分项来自一次运行，看量级可以，逐位比较不必当真。结论所依赖的三个量级 —— 96.5% 是脚本执行、布局与样式重算为 0、指标算术只占 13.5ms/根 —— 都远大于这些误差。
10. **`firstPaintMs` 会随机器负载漂移，尤其是最重的两格。** 本轮 30000 根 + 6 指标 T 侧为 420.0ms（此前一轮同格子为 386.65ms），K 侧同格为 42.45ms；K 侧 30000 根无指标为 14.05ms，甚至短于一帧。这类「接近或短于一帧」的读数更适合当量级看，不宜当精确值引用，倍数关系比绝对值稳定。