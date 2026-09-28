# TChartPro vs KChartPro vs AdaChartPro：性能对比报告

三个 Pro 级全功能金融 K 线组件，建立在**两种渲染引擎**上：

| | 组件 | 引擎 | 位置 |
| --- | --- | --- | --- |
| T | `TChartPro` | `lightweight-charts` v5 + `lightweight-charts-drawing` | [TChartPro.tsx](file:///Users/tony/github/ada-charts/src/components/lightweight-charts-pro/TChartPro.tsx) |
| K | `KChartPro` | `@klinecharts/pro`（内含 `klinecharts` v9 运行时） | [KChartPro.tsx](file:///Users/tony/github/ada-charts/src/components/klinecharts-pro/KChartPro.tsx) |
| A | `AdaChartPro` | `klinecharts` v10（经 `AdaChart`） | [AdaChartPro.tsx](file:///Users/tony/github/ada-charts/src/components/adachart-pro/AdaChartPro.tsx) |

K 与 A 是同一个引擎家族的两代：K 锁在 v9 的第三方 Pro 封装里，A 建在 v10 原生 Wrapper 之上，两者不是同一份代码的两个配置。

所有数字取自 [perf/results.json](file:///Users/tony/github/ada-charts/perf/results.json)，由 [scripts/bench-charts.mjs](file:///Users/tony/github/ada-charts/scripts/bench-charts.mjs) 在无头 Chromium 里跑出。报告里没有一个手写的数字。

---

## 一、结论摘要

1. **AdaChartPro 把 KChartPro 的性能曲线搬了过来，同时保住了开放 API。** 30000 根 + 6 指标：常驻堆 **16.64MB 对 K 的 15.71MB**（差 6%）、对 T 的 196.75MB（**11.8 倍**）；流式每根墙钟 **21.77ms 对 K 的 22.38ms**、对 T 的 90.82ms（**4.2 倍**）。这两项上 A 与 K 是同一档次，T 在另一档。
2. **首屏是 A 唯一明显落后 K 的一项，但远远甩开 T。** 30000 根 + 6 指标：A 74.35ms、K 36.5ms（**A 是 K 的 2.0 倍**）、T 396.4ms（**A 是 T 的 1/5.3**）。这个 2.0 倍里有一半是口径差（见第八节第 3 条：K 的信号是「自带指示器消失」，A 的是「数据已在引擎里」），另一半是真实的：A 的指标由挂载后的 effect 建立，K 的指标在构造时就一起交进去。
3. **三个引擎的引擎构造时间都是平的，只有 T 不**。`engineReadyMs` 在 30000 根 + 指标下：A 2.45ms、K 4.65ms、T **180.05ms**。所以 T 的首屏劣势不是「引擎更重」，而是「整份历史与全部指标都要在 React 侧先建出来」。
4. **每 tick 的代价形态：A 与 K 是同步且可预测的，T 是异步且会击穿的。** 30000 根 + 6 指标下单次派发的同步耗时：A 20ms、K 19.37ms、T **0.01ms**。T 这个漂亮的数字是假象——代价被推迟到 React 重渲染与 effect 里，结果是 120 根新 K 线要花 10.9 秒推完、触发 61 个长任务（A 是 2 个、K 是 2 个）。
5. **A 的本层产物是三者中最小的。** `dist/adachart-pro.js` 171.63KB + `dist/adachart-pro.css` 2.18KB = **173.81KB raw / 43.47KB gzip**，对 T 的 468.48KB/84.68KB 与 K 的 571.67KB/142.10KB。引擎作为 peer 由下游解析，且与 `AdaChart` 共用同一个 v10 实例。**含引擎**的总交付：A 832.48KB/143.14KB、T 653.26KB/143.55KB、K 607.22KB/153.18KB——A 的 raw 最大（v10 单文件 658.67KB 大于 v9 的 585.45KB 与 `lightweight-charts` 的 184.78KB），gzip 最小。
6. **交互（平移/缩放）三家都测不出差别**，所有格子的同步耗时 ≤0.11ms/次、末次事件后 2 帧内停止重绘。唯一非零的长任务格子是 T · 30 000 +指标 的平移窗口开头 119ms——这是流式积压的余波（测量顺序是 stream → pan → zoom，中途不卸载），不是平移的开销，详见 4.5。
7. **A 的画线工具是 34 个，T 是 67 个，K 是 32 个。** A 的 34 = v10 内置 16 + `@klinecharts/extension` 18。数量后来居上于 K、仍只有 T 的一半；且 A 与 K 一样没有画线序列化/回灌接口。
8. **这份报告不再用于选型，因为选型已经发生。** [ADR-0003](file:///Users/tony/github/ada-charts/docs/adr/0003-adachart-pro-is-the-v10-native-pro-layer.md) 把 `AdaChart` / `AdaChartPro` 定为唯一在开发的主线，`TChartPro` 与 `KChartPro` 冻结保留。第七节改成了「什么情况下仍然值得用 T 或 K」——以及那个情况下你要放弃什么。

---

## 二、功能面对照

功能数量取自各库自己的注册表（`getSupportedIndicators()` / `getSupportedOverlays()` / `getToolRegistry().getAll()`），不是手维护的清单。**两列 klinecharts 读的是两个不同版本**：K 读 `klinecharts-v9`，A 读 `klinecharts`（v10）。

| 维度 | TChartPro | KChartPro | AdaChartPro |
| --- | --- | --- | --- |
| 指标数量 | **27** | **27**（v9 原生） | **27**（v10 原生） |
| 指标实现位置 | 本仓库 JS，画成普通 series | 引擎内部 | 引擎内部 |
| 画线工具 | **67** | 32 个 overlay（画线栏是其子集） | 34 个 overlay（16 内置 + 18 扩展） |
| 工具栏 | 自研 React 组件 | 引擎自带 | 自研 React 组件 |
| 数据契约 | `TChartProDatafeed`（`getHistory` / `subscribe`） | `Datafeed`（`getHistoryKLineData` / `subscribe`） | `DataLoader`（`getBars` / `subscribeBar` / `unsubscribeBar`） |
| 主题 | `theme` + Theme token 扇出 | `theme` + `styles` 覆盖引擎样式表 | `theme` + `styles` 覆盖引擎样式 |
| 时区 | 本层补格式化器（引擎无此选项） | 引擎 `setTimezone` | 引擎 `setTimezone` |
| i18n | `locale`（`en-US` / `zh-CN`） | `locale`（引擎提供） | `locale`（引擎 + 本层工具栏文案） |
| 水印 | `TChart` 的 `watermarkText` + `watermarkVisible` | 引擎自带 `watermark` | 本层 DOM（v10 无 watermark API） |
| 画线持久化 | `drawings` / `onDrawingsChange` + `exportDrawings` / `importDrawings` | 无（留在引擎内部） | 无（留在引擎内部） |
| 磁吸 / 锁定 / 撤销 | `magnet` / `lockNewDrawings` / 控制器内置 | 画线栏内置 | 画线栏内置 |
| 命令式 API | `chart()`、`mainSeries()`、`drawings()`、`set*`/`get*` 成对、`setTool` | 仅 theme / locale / timezone / styles / symbol / period 的 set/get | `chart()` + theme / locale / timezone / symbol / period / 指标 / tool 的 set/get 成对 |
| 挂载后可改的 props | 指标、symbol、周期、主题、时区、画线（全部） | 仅主题、语言、时区、样式、symbol、周期 | 主题、语言、时区、标的、周期、指标、画线工具 |
| 容器尺寸自适应 | `autoSize` / `width` / `height` | `autoSize` / `width` / `height`（挂载后不可改，无容器 resize） | `autoSize`（`ResizeObserver` 跟随容器） / `width` / `height` |
| 卸载 | 本层销毁图表与画线层 | 借 v9 的 `dispose(host)` 找回内部实例 | 本层停掉数据源轮询 + 引擎自己的卸载路径 |
| 附带 CSS | 无（工具栏样式内联） | `@klinecharts/pro` 样式表 35.55KB | 工具栏与水印样式表 2.18KB |

三边的指标集合完全一致（27 个）。画线工具 TChartPro 仍是另两者的 2 倍。KChartPro 与 AdaChartPro 的差别不在功能面上，而在**指标的归属**：K 的指标在 `@klinecharts/pro` 的私有实例里，A 的指标在 `AdaChart` 交出的 `Chart` 实例上——同一个引擎的公开 API 就能读到数据（`getDataList()`）、读到 overlay、增删指标。

---

## 三、测量方法

### 怎么测的

**在压缩过的生产包上测，不测 dev 模式。** `vite dev` 下 React 的开发构建渲染成本高好几倍，而 TChartPro 在 React 里做的事远多于另外两者，dev 模式会系统性地偏袒更轻的那一层。驱动脚本先打一份 production bundle，再用静态服务端出来。

- **页面**：[perf/harness.tsx](file:///Users/tony/github/ada-charts/perf/harness.tsx) 把任一 Wrapper 挂进固定的 900×520 容器，把测量值挂到 `window.__perf`。
- **数据**：[perf/dataset.ts](file:///Users/tony/github/ada-charts/perf/dataset.ts) 用固定种子的 PRNG 生成合成 OHLCV（首价 60000，±1% 随机游走），保证可复现。
- **三引擎数据源**：[perf/feeds.ts](file:///Users/tony/github/ada-charts/perf/feeds.ts) 按各自的契约实现（T 用 `TChartProDatafeed`、K 用 `Datafeed`、A 用 v10 的 `DataLoader`），并把订阅回调暴露给驱动，由驱动自己按帧推送，不等定时器。三份数据源的取历史路径都带**同一个** `setTimeout(0)` 的 I/O 边界，避免任一引擎拿到更便宜的历史路径。
- **两版 klinecharts 同时在场**：K 需要 v9，A 与 `@klinecharts/extension` 需要 v10，所以打包含**两份**。原先「把裸 `klinecharts` 全局别名到 v9」的写法在页面上没有 v10 时无害，现在不行了，改成了 ADR-0002 里 `vite.config.ts` 用的那种 **importer 限定重定向**（只有 `@klinecharts/pro` 自己的引用走 v9），并由 [scripts/bench-charts.mjs](file:///Users/tony/github/ada-charts/scripts/bench-charts.mjs) 里同名的 `klinechartsProUsesV9()` 插件实现。
- **浏览器**：无头 Chromium，`--js-flags=--expose-gc --enable-precise-memory-info`（前者给出真正的 GC，后者让 `performance.memory` 精细而非量化），60Hz 帧间隔实测 16.6ms。
- **不碰私有字段**：三边都只走公开契约。KChartPro 没有数据访问器，所以它靠**引擎自己的 loading 指示器**就绪作信号（用 MutationObserver 捕捉，而不是逐帧轮询 —— 面对本地数据源指示器只存在约一个宏任务，轮询会整个错过然后白等满超时）；TChartPro 靠主系列持有全部 K 线；AdaChartPro 靠 v10 交出的 `Chart.getDataList()`。

### 每个数字的定义

| 指标 | 定义 |
| --- | --- |
| `engineReadyMs` | 从 `render()` 到 `onChartReady`（三边都是「引擎对象构造完成」） |
| `firstPaintMs` | 从 `render()` 到 **K 线可被认为已在屏幕上**。T / A 的信号是引擎的数据列表持有全部 K 线；K 的信号是引擎收起 loading 指示器。三者都再等一帧作为绘制的代价 |
| `retainedHeapMB` | 挂载后相对基线的常驻 JS 堆。三边都是「回收 → 稳定 → 再回收 → 读数」，另外基线本身也做两轮回收，避免上一次挂载的短命对象污染读数 |
| `domNodes` / `canvases` | 容器内的元素数 / canvas 数 |
| `streamAvgDispatchMs` | 一次 tick 推送的同步耗时 |
| `streamWindowMs` | 120 次 tick 的墙钟时间（每帧一次更新）。健康值约 1970ms = 120 帧，即**贴着帧预算的地板** |
| `streamLongTaskMs` / `longTasks` | 窗口内超过 50ms 的主线程任务总时长 / 个数 |
| `panAvgSyncMs` / `zoomAvgSyncMs` | 一次滚轮事件的同步耗时 |
| `panSettleMs` / `zoomSettleMs` | 末次事件之后 canvas 继续重绘的毫秒数（2 帧稳定判据，因此地板约 33ms） |

**怎么读「贴着地板」的格子**：墙钟 ≈ 1970ms 表示更新没有成为瓶颈，是测试台每帧一次的循环在限速 —— 这类格子只能读作「≥60 次/秒，未测出上限」。

### 怎么复现

```bash
pnpm perf              # 完整矩阵
PERF_QUICK=1 pnpm perf # 冒烟版
```

矩阵：K 线数 `[500, 2000, 10000, 30000]` × 指标 `[无, 有]` × 引擎 `[T, K, A]`，重复 3/3/2/2 次，报告取中位数。指标组合三边一致：主图 `MA + BOLL + EMA`，副图 `VOL + MACD + RSI`。

---

## 四、性能数据

### 4.1 首屏：从挂载到 K 线在屏幕上

| K 线数 | T 无指标 | T +6 指标 | K 无指标 | K +6 指标 | A 无指标 | A +6 指标 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 20.7 ms | 30.5 ms | 17.5 ms | 22.6 ms | 26.1 ms | 26.2 ms |
| 2 000 | 21.2 ms | 38.8 ms | 16.9 ms | 21.8 ms | 26.1 ms | 26.7 ms |
| 10 000 | 25 ms | 141.85 ms | 15.95 ms | 20.5 ms | 23.4 ms | 34.35 ms |
| 30 000 | 43.45 ms | **396.4 ms** | 13.45 ms | **36.5 ms** | 24.9 ms | **74.35 ms** |

30 000 根 + 6 指标这一格的倍数：A 是 T 的 **1/5.3**，A 是 K 的 **2.0 倍**。

拆开看 `engineReadyMs`（引擎构造完成，不含绘数据）：

| K 线数 | T 无指标 | T +指标 | K 无指标 | K +指标 | A 无指标 | A +指标 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 4.1 ms | 8 ms | 2.7 ms | 4.4 ms | 1.9 ms | 2 ms |
| 2 000 | 4.9 ms | 14.4 ms | 2.9 ms | 4.4 ms | 2 ms | 1.7 ms |
| 10 000 | 9.8 ms | 51.35 ms | 2.95 ms | 4.35 ms | 2.15 ms | 2.05 ms |
| 30 000 | 22.85 ms | 180.05 ms | 3.15 ms | 4.65 ms | 2.6 ms | 2.45 ms |

K 与 A 的引擎构造时间都和数据量无关（30000 根时 3.15–4.65ms 与 2.45–2.6ms），T 是 22.85ms / 180.05ms，随数据量线性上升。

**A 的首屏曲线形状值得单独说：** 无指标时 26.1 → 24.9ms，30000 根反而更快，说明这条曲线基本平；带指标时 26.2 → 74.35ms 才抬起来。抬起来的那一段落在「历史落到引擎 + 6 个指标建立」上，而不是引擎构造上——构造时间始终 ≤2.6ms。

### 4.2 常驻内存

| K 线数 | T 无指标 | T +6 指标 | K 无指标 | K +6 指标 | A 无指标 | A +6 指标 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 0.7 MB | 3.6 MB | 0.18 MB | 0.43 MB | 0.22 MB | 0.47 MB |
| 2 000 | 1.85 MB | 13.76 MB | 0.37 MB | 1.19 MB | 0.35 MB | 1.25 MB |
| 10 000 | 8.76 MB | 66.64 MB | 1.23 MB | 5.33 MB | 1.23 MB | 5.65 MB |
| 30 000 | 25.68 MB | **196.75 MB** | 3.44 MB | **15.71 MB** | 3.44 MB | **16.64 MB** |

折成每根 K 线（30000 根 + 6 指标）：T = **6.56 KB/根**，K = **0.52 KB/根**，A = **0.55 KB/根**。无指标时 T 是 0.86 KB/根，K 与 A 都是 0.11 KB/根。

A 与 K 在这一项上差 6%，两条曲线几乎重合；两者都比 T 小一个数量级。原因是同一个：指标不在 React 里、也不画成 series，就不存在「每个点一个引擎侧对象」那笔账。

用本仓库自己的 `OKX_HISTORY_LIMIT = 300` 作参照，30000 根是它的 100 倍 —— T 的 196.75MB 是「加载 100 屏历史外加 6 条指标线」的代价，A 的 16.64MB 是同一个负载在引擎内的代价。

### 4.3 DOM 与 canvas

| | T 无指标 | T +指标 | K 无指标 | K +指标 | A 无指标 | A +指标 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| DOM 节点 | 46 | 88 | 123 | 150 | **29** | **56** |
| canvas | 7 | 19 | 6 | 18 | 6 | **18** |

两个方向相反的极端：

- **A 的 DOM 最少**（29 → 56），因为工具栏是自研的紧凑 React 组件，而 K 的 123 → 150 里装的是引擎自带的整套工具栏。
- **canvas 数上 A 与 K 现在完全一致**（都是 6 → 18；上一轮 +指标 格是 30）。v10 给每个 pane 分层建 canvas：主 pane 6 张，每个指标 pane 再 4 张 —— 所以 canvas 数取决于**指标落在哪个 pane**。上一轮那 30 张正是 pane 语义用错的结果：6 个指标各自开了一个 pane，把价格面板挤出 0 高（详见 4.5）。修复后主图指标叠加进价格 pane、只有副图 3 个各开一个，于是 6 + 3 × 4 = 18，与 K 的 18 相等。canvas 数不代表更慢——A 的流式数字与 K 同级（4.4）——但读它时要按这个口径理解。

**这一格本轮变了，是修复的结果，不是噪声：** 主图指标曾因 v10 的 pane 语义被各自开成独立 pane，A 的 +指标 格因此有 30 张 canvas、83 个 DOM 节点；显式落到价格面板后降到 18 张 / 56 个，30000 根 + 6 指标的常驻堆也随之从 16.68MB 微降到 16.64MB（4.2）；T 与 K 的 canvas / DOM 数本轮未动。

### 4.4 流式更新：120 次 tick，每帧一次

| 引擎 / 规模 | 同步耗时/次 | 120 次墙钟 | 每根墙钟 | 长任务 |
| --- | ---: | ---: | ---: | ---: |
| T · 2 000 无指标 | 0.02 ms | 1 974.8 ms | 16.5 ms（地板） | 0 / 0 |
| T · 2 000 +指标 | 0.02 ms | 1 969.3 ms | 16.4 ms（地板） | 0 / 0 |
| T · 30 000 无指标 | 0.01 ms | 1 979.9 ms | 16.5 ms（地板） | 0 / 0 |
| T · 30 000 +指标 | 0.01 ms | **10 898.2 ms** | **90.82 ms** | **7 559 ms / 61** |
| K · 2 000 无指标 | 0.08 ms | 1 972.7 ms | 16.4 ms（地板） | 0 / 0 |
| K · 2 000 +指标 | 1.27 ms | 1 976 ms | 16.5 ms（地板） | 0 / 0 |
| K · 30 000 无指标 | 0.06 ms | 1 972.3 ms | 16.4 ms（地板） | 0 / 0 |
| K · 30 000 +指标 | 19.37 ms | 2 685.2 ms | **22.38 ms** | 124 ms / 2 |
| A · 2 000 无指标 | 0.06 ms | 1 971.6 ms | 16.4 ms（地板） | 0 / 0 |
| A · 2 000 +指标 | 1.28 ms | 1 972.1 ms | 16.4 ms（地板） | 0 / 0 |
| A · 30 000 无指标 | 0.05 ms | 1 972.2 ms | 16.4 ms（地板） | 0 / 0 |
| A · 30 000 +指标 | 20 ms | **2 612.8 ms** | **21.77 ms** | 145 ms / 2 |

几点值得单独说：

- **30000 根 + 6 指标这一格，A 与 K 是同一档：21.77ms/根对 22.38ms/根，长任务 2 个对 2 个。** 两者都仍然超出一帧的 16.6ms 预算（约 46 次/秒与 45 次/秒），但 120 根新 K 线能在 2.6 / 2.7 秒内推完，不会积压。
- **T 侧的同一格已经从「不可用」改善到「勉强可用、但仍会击穿帧预算」**：90.82ms/根 ≈ 11.0 次/秒，120 根要 10.9 秒推完；61 个长任务平均 124ms 阻塞主线程。这一格是「指标层跟随数据集 + 尾部 `pop/push` + 每条 series 一次 `update`」那轮改动之后的结果（改动前是同机同法的 305.3ms/根，见第五节）。A 是它的 **1/4.2**。
- **T 侧的「同步耗时 0.01ms」仍然是假象**：推送本身几乎免费，因为全部计算被推迟到 React 重渲染与 effect 里 —— 代价被搬走，没有被消除。A 与 K 的数字（20 / 19.37ms）看起来差两个数量级，但那才是**同步且可控**的账：它发生在那儿，不发生在下一个窗口里。
- **A 与 K 在 2000 根 + 指标下都贴着地板**（16.4 / 16.5ms，长任务 0），而这一格在 T 侧修好之前是唯一越界的格子。
- **A 在 2000 根 + 指标下的同步耗时是 1.28ms，与 K 的 1.27ms 基本重合**，不是巧合：两者都是「引擎内部的增量更新」这一类工作的同一个量级。

### 4.5 交互：120 次滚轮平移 / 缩放

| 引擎 / 规模 | pan 同步/次 | zoom 同步/次 | pan 长任务 (ms) | zoom 长任务 (ms) | pan 停止重绘 | zoom 停止重绘 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| T · 2 000 无指标 | 0.06 ms | 0.11 ms | 0 | 0 | 30.1 ms | 32.6 ms |
| T · 2 000 +指标 | 0.05 ms | 0.06 ms | 0 | 0 | 28.5 ms | 31.7 ms |
| T · 30 000 无指标 | 0.05 ms | 0.07 ms | 0 | 0 | 31.5 ms | 32.2 ms |
| T · 30 000 +指标 | 0.05 ms | 0.07 ms | **119** | 0 | 28.4 ms | 32.4 ms |
| K · 2 000 无指标 | 0.05 ms | 0.06 ms | 0 | 0 | 32.7 ms | 33.3 ms |
| K · 2 000 +指标 | 0.04 ms | 0.05 ms | 0 | 0 | 29 ms | 33.1 ms |
| K · 30 000 无指标 | 0.05 ms | 0.04 ms | 0 | 0 | 32.3 ms | 33 ms |
| K · 30 000 +指标 | 0.05 ms | 0.05 ms | 0 | 0 | 30.8 ms | 33.2 ms |
| A · 2 000 无指标 | 0.04 ms | 0.05 ms | 0 | 0 | 30.5 ms | 33.5 ms |
| A · 2 000 +指标 | 0.05 ms | 0.05 ms | 0 | 0 | 32.7 ms | 33.4 ms |
| A · 30 000 无指标 | 0.05 ms | 0.07 ms | 0 | 0 | 32.1 ms | 33.4 ms |
| A · 30 000 +指标 | 0.06 ms | 0.06 ms | 0 | 0 | 31.9 ms | 33.6 ms |

**同步路径这一项是平手，而且要说清是「没测出差别」而不是「都没有问题」。** 所有格子同步耗时 ≤0.11ms；「停止重绘」全部落在 28–34ms，而那正好是判据本身的地板（2 帧 ≈ 33ms）。所以结论只能到「三个引擎都在 2 帧内停止重绘，本方法的分辨率不足以分出高下」，不能推断它们在持续拖拽下的表现完全相同。

**上一轮那两格 +指标 的「不可读」已经关闭，根因在产品而不在判据：** `canvasSignature()` 在取样 canvas 的高度为 0 时返回 `null`，而上一轮 A 的两格 +指标 恰好如此 —— 主图指标因 pane 溢出把价格面板挤成了 0 高，`querySelector("canvas")` 取到的第一张正是它，于是判据只能返回 `null`。换言之那不是「测不出来」，是**产品把价格主图挤没了**：v10 的 `isStack` 并不负责共用面板，未显式指定 `paneId` 的指标必然自开一个 pane（见 4.3）。修复后两格都读到了真实值 —— 上表 30000 +指标 pan 31.9ms / zoom 33.6ms、2000 +指标 pan 32.7ms / zoom 33.4ms，都落在判据地板附近。第八节第 6 条同步更新。

**唯一一个非零的长任务格子值得单独解释。** T · 30 000 +指标 的平移窗口里有 **1 个约 119ms 的长任务**，落在窗口**开头**，而紧接着的缩放窗口为 0。原因是测量顺序：驱动在同一个挂载上先跑完 120 次流式推送，**立刻**开始平移（`stream → pan → zoom`，中间没有卸载或等待），而 T 侧这一格的流式阶段留下了 7.6s 的主线程积压，余波正好落进平移窗口的开头。所以这 119ms 应读作**流式代价的溢出**，不是平移本身的开销 —— 它恰好又一次说明了 T 侧「代价是异步的」这件事：账会记到下一个窗口头上。A 与 K 在这一格都没有长任务，因为它们的流式窗口干脆就没留下积压。

### 4.6 交付体积

TChartPro 把 `lightweight-charts-drawing` 打进自己的包，但 `lightweight-charts` 是 external 由下游解析；KChartPro 除 React 外什么都不外链，v9 被别名钉进它的包里；AdaChartPro 与 TChartPro 同策，external 掉 `klinecharts`，`@klinecharts/extension` 则打进自己的包。

| | raw | gzip |
| --- | ---: | ---: |
| `dist/t-chart-pro.js` | 468.48 KB | 84.68 KB |
| `lightweight-charts` v5（peer，下游自带） | 184.78 KB | 58.87 KB |
| **TChartPro 合计** | **653.26 KB** | **143.55 KB** |
| `dist/k-chart-pro.js`（已含 v9 运行时） | 571.67 KB | 142.10 KB |
| `dist/ada-charts.css`（`@klinecharts/pro` 样式表） | 35.55 KB | 11.08 KB |
| **KChartPro 合计** | **607.22 KB** | **153.18 KB** |
| `dist/adachart-pro.js`（含 `@klinecharts/extension`） | 171.63 KB | 42.70 KB |
| `dist/adachart-pro.css`（工具栏与水印样式表） | 2.18 KB | 0.77 KB |
| **AdaChartPro 本层小计** | **173.81 KB** | **43.47 KB** |
| `klinecharts` v10（peer，下游自带，与 `AdaChart` 共用） | 658.67 KB | 99.67 KB |
| **AdaChartPro 含引擎合计** | **832.48 KB** | **143.14 KB** |

参照物：完整的 `klinecharts` v9 单文件是 585.45KB raw / 85.72KB gzip，v10 是 658.67KB / 99.67KB；`dist/k-chart-pro.js` 的 571.67KB 几乎就是 v9 本身加一层 Pro UI —— 两者不是相加关系。

**读法：**

- **AdaChartPro 自己那一层是三者中最小的**，173.81KB raw / 43.47KB gzip，不到 TChartPro 的 40%、KChartPro 的 30%。它薄，是因为指标、数据、绘制、画线全在引擎里，本层只剩工具栏 + 水印 + 状态。
- **加上引擎后 raw 反而最大**（832.48KB），因为 v10 单文件比 v9 大 73KB、比 `lightweight-charts` 大 474KB。但 **gzip 后是最小的**（143.14KB 对 T 的 143.55KB、K 的 153.18KB）—— 三个总量都在 143–153KB 这个带里，差异不超过 7%，**不构成选型理由**。
- **真正的结构差别在「引擎能不能外链」**：A 与 T 把引擎交给下游（并可被同项目的其它组件共用），K 必须把 v9 钉进产物（ADR-0002）。下游同时用 A 与 K 时，两份 klinecharts 会同时在包里。

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

**改动效果**：30000 根 + 6 指标下每根墙钟 **305.3ms → 90.82ms（3.4 倍）**，长任务 **120 → 61**；2000 根 + 指标这一格顺带从 18.8ms 回到 16.4ms 的帧预算地板。（305.3ms 是改动前同机同法的一次读数，不在本轮的 `results.json` 里。）

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

由此可以读出一条关键判断：**把 27 个指标改成「有状态可续算」最多只能消掉 `layer.advance` 那 13.5ms/根**，把 90.82ms/根 拉到约 77ms/根 —— **够不到 KChartPro 的 22.38ms/根，也够不到 AdaChartPro 的 21.77ms/根**。量级在另一侧：**10 条 30000 点的 series 在 `lightweight-charts` 上的 update 与绘制**（约 66ms/根）。要动它只能减少每条 series 的点数或系列数，或者改成自己绘制覆盖层 —— 属于**设计变更**，不是算术优化。这也正是 ADR-0003 选择「换一个把指标当一等公民的引擎」而不是「继续优化这一层」的依据。

顺带测到、与直觉相反的一点：**`series.update()` 并不是 O(1)。** 同样的调用，`pushMs` 在 2000 根是 0.384ms/根，在 30000 根是 3.91ms/根，随 N 增长。

### KChartPro 的成本模型

指标、数据、绘制全在引擎内部，v9 按增量维护其数据列表并在渲染时只画可见区间。本层做的事极少：`KLineChartPro` 只发布 theme / styles / locale / timezone / symbol / period 的 set/get，[KChartPro.tsx](file:///Users/tony/github/ada-charts/src/components/klinecharts-pro/KChartPro.tsx#L234-L256) 就只镜像这几个。因此：

- 首屏与数据量脱钩（`getHistoryKLineData` 的数组交给引擎后，引擎自己按需取用）；
- 内存只保留引擎需要的那份数据结构（30000 + 指标 15.71MB）；
- 每 tick 的代价是引擎内部的增量更新（30k + 指标 22.38ms/根，其中 19.37ms 是同步派发）。

代价是这份能力**不可见也不可控**：数据与图表实例私有，本层无法读取、无法断言、无法局部更新。

### AdaChartPro 的成本模型

A 的架构与 K 是同一类 —— 指标、数据、绘制、画线都在引擎里 —— 但引擎换了，且中间隔着一层**公开的** `AdaChart`：

- `AdaChartPro` 只持有工具栏状态（主题 / 语言 / 时区 / 标的 / 周期 / 指标清单 / 当前工具），把它解析成 `AdaChart` 的 props；指标以 `{ name, stack }` 交下去，由 `AdaChart` 的 effect 调 `chart.createIndicator` 建在引擎里，**不是**画成 series。
- 数据经 v10 的 `DataLoader` 契约（`getBars` / `subscribeBar`）进入引擎，`AdaChartPro` 只负责在卸载时停掉默认数据源的轮询计时器。
- v10 没有 watermark API，所以水印是本层的一个 DOM 节点（`pointer-events: none`，压在图表下面）。

这就解释了本轮测到的三件事：

1. **内存与流式为什么与 K 同级。** 30000 根 + 6 指标：16.64MB / 21.77ms 每根。指标不存在于 React 树里，也就没有「10 条 30000 点 series 的 update 与绘制」这笔账 —— 那笔账（第五节上半部分分解出的约 66ms/根）在 A 与 K 的架构里根本不存在。
2. **引擎构造为什么是平的。** 1.7–2.6ms，与数据量无关。引擎构造不接触数据。
3. **首屏为什么比 K 慢约一倍。** 30000 根 + 6 指标 74.35ms 对 36.5ms。两个原因叠在一起：**口径上**，K 的信号是「自带 loading 指示器消失」，A 的信号是「引擎的数据列表已经持全部 K 线」，后者晚一步、也更严格；**实现上**，K 的 `KLineChartPro` 在构造时就把指标和数据一起交进去，A 的指标是 `AdaChart` 挂载后由 effect 创建的，所以 30000 根 × 6 指标的建立时间落在首屏窗口里。同一份 6 个指标在 T 那里要花 396.4 − 43.45 = 353ms 才建完，A 只花 ≈72ms（74.35 − 2.45 里还含数据落地），因为引擎是在 C++-like 的紧凑数组上跑同一批算术，而不是在 React 的 effect 与 series 对象上。

**A 的可观测性比 K 强，比 T 弱。** `AdaChartProApi.chart()` 交出的就是 v10 的实例，因此 `getDataList()`、`getOverlays()`、`createIndicator()`、`removeOverlay()` 都可达（本报告就靠 `getDataList()` 做就绪判定）；但指标值本身仍由引擎计算，不像 TChartPro 那样是普通 JS 数组、可以逐位断言。

---

## 六、优点与缺点

### TChartPro

**优点**

1. **指标与数据全程走公开 API，因此可测、可断言。** 27 个指标是纯 JS 计算后画成普通 series，值可以直接读出来比对 —— 本仓库的单元测试正是建立在这上面，指标数值也已与 klinecharts v9 逐位对齐到 6 位小数。增量层本身也有等价性测试：任一批次推进之后，其轨迹都与一次性路径 `buildIndicatorTracks` 逐格相等。
2. **API 面最宽。** `chart()`、`mainSeries()`、`drawings()`、成对的 `set*`/`get*`、`setTool`，加上 `drawings` / `onDrawingsChange` / `exportDrawings` / `importDrawings` —— 画线可序列化、可回灌、可程序化驱动，指标在挂载后仍可任意增删。
3. **画线能力是另两者的两倍**：67 种工具对 34（A）/ 32（K），且带磁吸、锁定、撤销、清空。
4. **gzip 交付体积与 A 基本持平**（143.55KB vs 143.14KB），且 `lightweight-charts` 作为 peer 由下游解析。
5. **小数据量下与另两者同级**：500–2000 根带 6 指标首屏 30.5ms / 38.8ms，流式 16.4ms 贴地板、长任务 0。
6. **无指标时 30000 根仍可用**：43.45ms 首屏、25.68MB，流式 16.5ms 贴地板。
7. **组合而非重写**：`TChartProProps extends TChartProps`，`TChart` 的全部 props 保留可用；时区这一层补上了 lightweight-charts 本身没有的格式化器。

**缺点**

1. **30000 根 + 多指标下仍击穿帧预算。** 指标层已是增量跟随、推送已降到每根一次 `update`，但每根仍要 90.82ms（≈11.0 次/秒），120 根新 K 线的流式窗口里有 61 个长任务、平均 124ms。**并且继续优化指标算术解决不了它**：指标算术只占 13.5ms/根，其余约 66ms/根在「10 条 30000 点 series 的 update 与绘制 + React 提交」上（第五节有逐项分解）。要做成实时，需要动的是系列规模或绘制方式。
2. **内存随「K 线数 × 指标数」线性膨胀**：每根 6.56KB（含 6 指标），是同规模 A 的 11.8 倍、K 的 12.5 倍；30000 根 + 指标达到 196.75MB。指标画成 series 就意味着每个点都是一个引擎侧对象，这笔开销是架构自带的。
3. **首屏超线性增长**：从 500 根的 30.5ms 到 30000 根的 396.4ms（13.0 倍），中途 10000 根就已是 141.85ms。
4. **指标算法由本仓库维护。** 与引擎升级解耦是好事，但正确性也要自己兜（此前就修过 MACD 的 DEA 初值、TRIX 的 null 前值提前返回、CR 的均线越界读取三处偏差）。
5. **文档漂移**：[README.md](file:///Users/tony/github/ada-charts/README.md#L18) 写「68 tool types」，而 `getToolRegistry().getAll()` 实际返回 **67**。报告以运行时注册表为准。
6. **已冻结**（ADR-0003）：不再接收新功能，只保留构建、导出与本文档的可复现性。

### KChartPro

**优点**

1. **首屏三家最快。** 500 → 30000 根：无指标 17.5 → 13.45ms，有 6 指标 22.6 → 36.5ms；30000 根无指标下的 13.45ms 甚至短于一帧。比 A 的同格快 2.0 倍（36.5 对 74.35）。
2. **内存极省。** 30000 根 + 6 指标 15.71MB、无指标 3.44MB —— 与 A 同级（16.64MB / 3.44MB），是 TChartPro 的 1/12.5 与 1/7.5。
3. **大数据量下的实时更新仍然可用。** 30k + 指标 22.38ms/根（T 是 90.82ms），120 次更新只产生 2 个长任务、共 124ms。
4. **开箱即全。** 工具栏、画线栏、指标选择、周期切换、水印、主题、i18n、时区全部由引擎提供，本层只需镜像；27 个指标与 32 个 overlay 都不需要本仓库维护算法。
5. **卸载路径可靠。** `KLineChartPro` 不提供 teardown，本层通过 v9 自注册的 `[k-line-chart-id]` 宿主属性找回内部实例并调用 v9 的 `dispose`，避免残留一个对着将被丢弃的 DOM 继续运行的图表。
6. **raw 体积比 A 的含引擎总量小**（607.22KB vs 832.48KB）。

**缺点**

1. **引擎不可外链，仓库要装两份 klinecharts。** `@klinecharts/pro` 按 v9 编译，别名必须钉进产物（[ADR-0002](file:///Users/tony/github/ada-charts/docs/adr/0002-two-copies-of-klinecharts.md)），下游拿到的是一个自带引擎的 571.67KB 包，且 gzip 总量最大（153.18KB）。
2. **锁在 v9，无法跟随 klinecharts 升级。** 这不是风格问题：ADR-0002 的重定向是按 v9 的运行时编译产物做的，v10 的 API 变化它吃不下。升级 klinecharts 只会改善 `AdaChart` / `AdaChartPro`。
3. **能力天花板由引擎决定。** `KLineChartPro` 只发布了 theme / styles / locale / timezone / symbol / period 的 set/get：没有数据访问器、没有 `resize`、没有 teardown。
4. **多个 props 挂载后改不动。** `mainIndicators`、`subIndicators`、`drawingBarVisible`、`watermark`、`width`、`height`、`periods` 只在构造时生效，变更需要重建整个图表。
5. **容器尺寸变化无法触达。** 其内部 v9 图表只监听 window resize，仅容器变化这条路在这里无从触达 —— 代码里直接写明了这个缺口，而不是去戳私有字段。A 用 `ResizeObserver` 补上了这一条。
6. **不可测。** 数据与图表实例私有，测试只能依赖 DOM 信号与最终像素，无法像 TChartPro 那样断言指标数值。
7. **DOM 节点最多**（123 vs A 的 29 与 T 的 46），工具栏是引擎自带的黑盒，样式定制只能走样式表覆盖，还要额外背 35.55KB CSS（A 只需 2.18KB）。
8. **画线工具最少**（32 个 overlay，A 是 34、T 是 67），且画线状态留在引擎内部，没有序列化/回灌接口。
9. **已冻结**（ADR-0003）：保留构建与导出，不再投新功能。

### AdaChartPro

**优点**

1. **内存与流式与 KChartPro 同级，同时甩开 TChartPro 一个数量级。** 30000 根 + 6 指标：**16.64MB**（K 15.71、T 196.75）、**21.77ms/根**（K 22.38、T 90.82），长任务 2 个（K 2、T 61）。这是本轮最重要的结果：换到 v10 之后，「引擎侧指标」的性能曲线被完整保留。
2. **引擎构造平坦**（1.7–2.6ms，与数据量无关），首屏全程可控：无指标时 26.1 → 24.9ms，30000 根反而更快；带指标时最差一格 74.35ms，仍是 T 的 1/5.3。
3. **本层产物最小。** `dist/adachart-pro.js` 171.63KB / gzip 42.70KB，加 CSS 合计 173.81KB / 43.47KB —— 不到 TChartPro 的 40%、KChartPro 的 30%。指标、数据、绘制、画线都在引擎里，本层只剩工具栏、水印与状态。
4. **引擎可外链，与 `AdaChart` 共用同一个 v10 实例。** 下游不会因为用了 Pro 就多背一份引擎，这与 KChartPro 把 v9 钉进产物形成直接对照。
5. **DOM 节点最少**（29 / 56），工具栏是自研 React 组件，样式表只有 2.18KB —— 而 KChartPro 要额外加载 35.55KB 的引擎样式表。
6. **挂载后可改的东西最多。** 主题、语言、时区、标的、周期、指标清单、画线工具都可由工具栏或命令式 API 改动，且 `autoSize` 走 `ResizeObserver` 跟随容器 —— 这两条 KChartPro 都做不到。
7. **指标由引擎增量维护**，本仓库不需要维护 27 个算法，也不欠算法正确性的账。
8. **底层实例是公开的。** `AdaChartProApi.chart()` 就是 v10 的 `Chart`，`getDataList()` / `getOverlays()` / `createIndicator()` 都可达（本报告的就绪判定就靠它），比 KChartPro 的「只能靠 DOM 信号与像素」高一个档次。
9. **唯一可升级的引擎。** 升级 `klinecharts` 直接改善 `AdaChart` 与 `AdaChartPro`，改一行依赖即可；KChartPro 做不到这一点。

**缺点**

1. **首屏是唯一明显落后 KChartPro 的一项。** 30000 根 + 6 指标 74.35ms 对 36.5ms（2.0 倍）。其中一部分是口径（K 的就绪信号更宽松，见第八节第 3 条），一部分是真实的：指标在挂载后由 effect 创建，而 K 的指标在构造时一起交进去。
2. **30000 根 + 6 指标下单根仍超一帧。** 21.77ms/根 ≈ 46 次/秒，仍在 16.6ms 的预算之外；这一格与 K 同级，但「与 K 同级」不等于「够快」。
3. **canvas 数随 pane 数分层增长**（本轮 18，与 K 的 18 持平、比 T 的 19 少一张；修复前主图指标各自开 pane 时曾是 30）。v10 给每个 pane 分层建 canvas，这是渲染管线的形状，不是错误，但资源受限的环境要按这个口径评估。
4. **画线工具只有 TChartPro 的一半**（34 对 67），且与 KChartPro 一样没有画线的序列化/回灌接口，画线状态留在引擎内部。
5. **工具栏、水印、指标选择器由本层维护。** 这是「薄」的另一面：v10 不提供这些，所以它们的正确性与外观是本仓库的责任；v10 没有 watermark API，水印是一个本层 DOM 节点。
6. **依赖 `klinecharts` v10 作为 peer。** 下游若同时使用 KChartPro，包里会同时出现 v10 与 v9 两份 klinecharts（ADR-0002 的既成事实，直到 KChartPro 停止使用）。
7. **指标值不可断言。** 与 KChartPro 同病：指标在引擎内部算，测试只能间接验证（本仓库的 27 个指标数值对齐测试是建立在 TChartPro 的实现上的）。

---

## 七、选型建议

**这张表已经不再是「二选一」。** [ADR-0003](file:///Users/tony/github/ada-charts/docs/adr/0003-adachart-pro-is-the-v10-native-pro-layer.md) 把 `AdaChart` / `AdaChartPro` 定为唯一在开发的主线，`TChartPro` 与 `KChartPro` 冻结保留。所以下面回答的是「什么情况下仍然值得用 T 或 K，以及那样做要放弃什么」。

| 场景 | 建议 | 理由 |
| --- | --- | --- |
| 新功能、新页面、任何默认选择 | **AdaChartPro** | 内存 16.64MB 与流式 21.77ms/根都与 K 同级，本层产物最小（43.47KB gzip），引擎可外链且可升级 |
| 需要断言 / 测试指标数值，或程序化驱动画线、67 种画线工具 | TChartPro（冻结） | 全公开 API、指标是普通 JS 数组；代价是 30000 根 + 指标 196.75MB、90.82ms/根 |
| 已经在用 KChartPro、且不打算迁移 | 继续用（冻结） | 首屏最快（36.5ms 对 A 的 74.35ms）；代价是锁在 v9、props 挂载后改不动、多背 35.55KB CSS |
| 长历史（≥10000 根）+ 多指标，且要实时更新 | **AdaChartPro**（次选 KChartPro） | T 侧 90.82ms/根仍会击穿帧预算；A 与 K 都在 22–23ms/根 |
| 长历史 + 多指标，静态展示，首屏是硬指标 | **KChartPro** | 36.5ms 对 A 的 74.35ms；内存与流式两者相当 |
| 需要挂载后动态增删指标、或跟随容器尺寸变化 | **AdaChartPro** | K 的指标 props 与尺寸都只能在构造时确定 |
| 移动端 / 内存敏感 | **AdaChartPro** | 30000 根 + 指标 16.64MB，是 T 的 1/11.8 |
| 极致交付体积 | **AdaChartPro** | 本层 173.81KB raw / 43.47KB gzip；总量 gzip 也最小（143.14KB） |

**如果只能记一句话**：这份报告原本要回答「T 开放但重，K 平坦但封闭，选哪个」——现在答案是**都不选，改成把 K 的性能曲线搬到 A 自己的引擎上**。`AdaChartPro` 的内存（16.64MB）与流式（21.77ms/根）和 KChartPro 在同一档，而本层产物只有它的 30%、API 面更宽、引擎可外链可升级；代价是首屏比 K 慢约 2.0 倍（74.35 对 36.5ms）与画线工具只有 TChartPro 的一半。而 TChartPro 那份「30000 根下 196.75MB / 90.82ms 每根」的账单，恰恰是 ADR-0003 决定换引擎而不是继续优化 React 层的依据：那一层剩下的开销不在指标算术里，而在 10 条 30000 点 series 的 update 与绘制上，不是把算法改成增量就能消掉的。

---

## 八、测量局限（读数字前请先读这一节）

1. **单机、无头、单浏览器。** macOS 上的无头 Chromium 153，60Hz 帧间隔实测 16.6ms。绝对值换机器会变，倍数关系应当稳定。
2. **合成数据。** 固定种子的随机游走 OHLCV。指标计算量取决于长度而非价格，所以价格分布不影响结论；但真实行情的跳空、复权、缺失 bar 没有被覆盖。
3. **三侧的就绪信号本质不同，且 K 侧偏乐观。** T 与 A 的信号是「引擎的数据列表持有全部 K 线」（精确），K 的信号是「引擎收起自带 loading 指示器」（引擎未发布数据访问器，这是最近似的诚实证据）。K 的指示器在历史 Promise resolve 时就消失，早于 T / A 判定的「数据已在引擎里」，所以 `firstPaintMs` 是**可比的**，但不是逐字节同定义，而且这一口径差别对 K 有利。`readySignal` 字段逐行记下了每一格用的是哪个信号：本轮 T 与 A 全部命中 `series-data`、K 全部命中 `loading-spinner`，无退化到固定帧的情况。
4. **`firstPaintMs` 含不足一帧的绘制等待**，所以几十毫秒的那些格子里有一部分不是引擎计算。要看纯计算请对比 `engineReadyMs` 与内存。
5. **流式场景是 60 次/秒的极限压力**，高于真实 1D K 线的更新频率。标「贴地板」的格子测不出上限，只证明「至少 60 次/秒」。
6. **交互项的分辨率不足；上一轮的「缺一项」已经关闭。** 28–34ms 的「停止重绘」落在判据自身的地板（2 帧）附近，只能得出「三者都在 2 帧内停止」，不能区分持续拖拽下的表现。上一轮 AdaChartPro 的两格 +指标 下该判据返回 `null`，根因在产品而不在判据：`canvasSignature()` 在取样 canvas 高度为 0 时返回 `null`（见 4.5），而当时主图指标各自开 pane 把价格面板挤成了 0 高。修复后两格都读到了真实值（30000 +指标 31.9 / 33.6ms、2000 +指标 32.7 / 33.4ms），这一缺口关闭。
7. **30 000 根是本仓库 `OKX_HISTORY_LIMIT = 300` 的 100 倍**，属于压力测试而非典型负载。`pnpm test:storybook` 目前有一个与本次改动无关的既有问题（`TChart.stories.tsx` 的 `Object is disposed`，来自 lightweight-charts 的 rAF 竞态）。
8. **每次运行都是新的挂载/卸载序列**，堆数字依赖 `--expose-gc` 的真实回收；没有该标志时 `retainedHeapMB` 会是 `null` 而不是一个猜测值。
9. **第五节 TChartPro 的分项分解来自一次性临时探针，不能由 `pnpm perf` 复现。** 那些 `performance.now()` 标记与 CDP `Performance.getMetrics` 读数是定位过程中临时加入、定位完即删除的，仓库里没有留下插桩代码，所以 `perf/results.json` 只包含第四节那张表里的量。两点注意：分项表里若干标记相互嵌套（例如 `decideDataPatch` 跑在 `TChart` 的数据 effect 之内），因此「本仓库代码合计」是求和后的**上限**；单条分项来自一次运行，看量级可以，逐位比较不必当真。结论所依赖的三个量级 —— 96.5% 是脚本执行、布局与样式重算为 0、指标算术只占 13.5ms/根 —— 都远大于这些误差。
10. **`firstPaintMs` 会随机器负载漂移，尤其是最重的两格。** 30000 根 + 6 指标：T 侧本轮 396.4ms（上一轮同格 424.65ms、再上一轮 420.0ms），K 侧 36.5ms（上一轮 38.75ms），A 侧 74.35ms。这类读数更适合当量级看，不宜当精确值引用，倍数关系比绝对值稳定。
11. **本页现在同时加载 v9 与 v10 两份 klinecharts。** 两份都在 `perf/dist` 里、都在测试开始前就已求值，三列共享同一份基线；但这也意味着本页的 bundle 比早先的双引擎版本更大，跨报告版本比较绝对值时要注意这一点。功能数量在**预热之后**读取，因为 `@klinecharts/extension` 的画线工具在首次挂载时才注册 —— 否则 A 的 overlay 数会被少报成 16。
