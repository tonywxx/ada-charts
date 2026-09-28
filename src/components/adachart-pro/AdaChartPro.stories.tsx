import type { Meta, StoryObj } from "@storybook/react";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import type { DataLoader, KLineData, Period } from "klinecharts";
import { jsxSource } from "../../jsx-source";
import { OKX_INST_ID } from "../../okx";
import {
	sharedOkxStream,
	type OkxStreamBar,
	type OkxStreamStatus,
} from "../../okx-stream";
import {
	LIVE_BARS,
	loadLiveWindow,
	mergeLiveCandle,
	type LiveSource,
} from "../adachart/__data__/okx-live";
import {
	MAIN_INDICATORS,
	SUB_INDICATORS,
	VOLUME_OVERLAY_INDICATOR,
} from "../adachart/adachart-window-config";
import AdaChartPro, { type AdaChartProProps } from "./AdaChartPro";
import {
	ADACHARTPRO_DEFAULTS,
	ADACHARTPRO_DEFAULT_PERIODS,
} from "./adachart-pro-options";

/**
 * `AdaChartPro` draws entirely from **live** OKX data: the Pro layer pulls its
 * own candles through the built-in `OkxDataLoader`, so a story only configures
 * the chart — the market data arrives on its own, exactly like a real trading
 * terminal. When the network is unavailable the loader falls back to the
 * committed snapshot instead of failing.
 *
 * `AdaChartPro` 完全使用**实时** OKX 数据：Pro 层通过内置的 `OkxDataLoader` 自行拉取
 * K 线，因此 story 只需配置图表 —— 行情会像真实交易终端那样自行到达。网络不可用时，
 * loader 回退到提交进仓库的快照而非报错。
 */

/**
 * Select-style controls that the type inference alone cannot render.
 *
 * The two indicator lists are the toolbar's own, not the engine's inventory: each
 * side offers exactly the studies that may be placed there — `vol-main`, this
 * library's main-pane volume overlay, is a main study the engine's list has never
 * heard of, and the engine's `VOL` is a sub study. A control offering the engine's
 * list instead could not show the default's `vol-main`, and a reader ticking any
 * box would silently lose it.
 *
 * 类型推断无法自动渲染的下拉控件。
 *
 * 两份指标清单用的是工具栏自己那两份、而不是引擎的目录：每一侧只提供可以放在那一侧的指标 ——
 * `vol-main`（本库的主图成交量叠加）是引擎清单从未听过的主图指标，而引擎的 `VOL` 是副图指标。
 * 控件若改用引擎那份清单，既显示不出默认值里的 `vol-main`，读者一勾选别的框还会把它悄悄丢掉。
 */
const CONTROLS = {
	theme: { control: "inline-radio", options: ["light", "dark"] },
	locale: { control: "inline-radio", options: ["en-US", "zh-CN"] },
	mainIndicators: { control: "check", options: [...MAIN_INDICATORS] },
	subIndicators: { control: "check", options: [...SUB_INDICATORS] },
} as const;

/** Props that carry objects, arrays or callbacks, so no widget fits them. 携带对象、数组或回调、不适合任何控件的属性。 */
const NO_CONTROL = [
	"symbol",
	"period",
	"periods",
	"dataLoader",
	"drawingTools",
	"symbols",
	"styles",
	"onChartReady",
] as const;

const COMPONENT_ARG_TYPES = {
	...Object.fromEntries(
		Object.entries(ADACHARTPRO_DEFAULTS).map(([name, defaultValue]) => [
			name,
			{
				table: { defaultValue: { summary: JSON.stringify(defaultValue) } },
				...(name in CONTROLS ? CONTROLS[name as keyof typeof CONTROLS] : {}),
			},
		]),
	),
	...Object.fromEntries(
		NO_CONTROL.map((name) => [name, { control: false as const }]),
	),
};

/**
 * The bar sizes the live story's toolbar offers: exactly the ones OKX's push feed
 * serves, so every preset a reader can pick keeps updating. `AdaChart`'s live grid
 * works from the same list.
 *
 * 实时 story 的工具栏提供的周期档位：正好是 OKX 推送源接受的那些，因此读者能选到的每个档位都会持续
 * 更新。`AdaChart` 的实时网格用的是同一份清单。
 */
const LIVE_PRO_PERIODS: Period[] = LIVE_BARS.map((entry) => entry.period);

/** Which bar in the push feed a period names. 某个周期在推送源里的档位。 */
const LIVE_BAR_BY_PERIOD = new Map<string, OkxStreamBar>(
	LIVE_BARS.map((entry) => [
		`${entry.period.type}:${entry.period.span}`,
		entry.bar,
	]),
);

function liveBarFor(period: Period): OkxStreamBar {
	return LIVE_BAR_BY_PERIOD.get(`${period.type}:${period.span}`) ?? "1m";
}

/** Where the live story opens: the finest bar, as `AdaChart`'s ladder does. 实时 story 开在哪个档位：最细的那个，与 `AdaChart` 的阶梯一致。 */
const LIVE_START = LIVE_BARS[0];

const STRIP_STYLE: CSSProperties = {
	font: "11px/1.4 ui-monospace, monospace",
	color: "#64748b",
	padding: "4px 8px",
	background: "#f8fafc",
	borderBottom: "1px solid #e2e8f0",
	display: "flex",
	justifyContent: "space-between",
	gap: 12,
};

/** `2026-09-27 14:03 UTC`, the resolution the bars themselves are drawn at. `2026-09-27 14:03 UTC`，与蜡烛本身的粒度一致。 */
function minuteStamp(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 16).replace("T", " ");
}

/** What the strip above a live window shows. 实时窗口上方状态条展示的内容。 */
interface LiveProStripState {
	bar: string;
	source: LiveSource | null;
	status: OkxStreamStatus;
	bars: number;
	last: KLineData | null;
}

const EMPTY_STRIP: LiveProStripState = {
	bar: LIVE_START.bar,
	source: null,
	status: "connecting",
	bars: 0,
	last: null,
};

/** A loader the story itself owns, so it can also stop it on unmount. 本 story 自己拥有的 loader，因此在卸载时也能停掉它。 */
interface LiveProLoader extends DataLoader {
	dispose(): void;
}

/**
 * `AdaChart`'s live window, written in the shape `klinecharts` v10 asks for.
 *
 * The pieces are that window's pieces, unchanged: history comes from
 * `loadLiveWindow` (with its committed-snapshot fallback), the live tail from the
 * shared socket, and the window's last bar from `mergeLiveCandle`. What differs is
 * only the contract — a live window hands `AdaChart` an array through `data`, and
 * `AdaChartPro` has no such prop, so the same fetch and the same subscription are
 * expressed as a {@link DataLoader} instead. There are no pages: the window draws
 * one snapshot and then the pushes, so both history directions answer "nothing
 * more" and the engine stops asking.
 *
 * The reports are the one addition. A strip that says what the feed is doing needs
 * to hear about it, and the loader is the only thing that does — so every step
 * it takes is announced through `report`.
 *
 * `AdaChart` 的实时窗口，按 `klinecharts` v10 要求的形状书写。
 *
 * 零件就是那个窗口的零件、原样不变：历史来自 `loadLiveWindow`（含提交进仓库的快照兜底），实时末根
 * 来自共享 socket，窗口的最后一根由 `mergeLiveCandle` 合并。不同的只是契约 —— 实时窗口通过 `data`
 * 把数组交给 `AdaChart`，而 `AdaChartPro` 没有这个属性，因此同一套取数与同一份订阅改以
 * {@link DataLoader} 表达。它没有翻页：窗口只画一份快照、此后全靠推送，因此两个历史方向都回答
 * 「没有了」，引擎随即停止索要。
 *
 * 上报是唯一新增的部分。一条会说明数据源在做什么的状态条需要听到这些事，而唯一知道的就是 loader ——
 * 因此它每一步都经 `report` 说出来。
 */
function createLiveLoader(
	report: (state: LiveProStripState) => void,
): LiveProLoader {
	const releases = new Map<string, () => void>();
	let bar: OkxStreamBar = LIVE_START.bar;
	let source: LiveSource | null = null;
	let status: OkxStreamStatus = "connecting";
	let bars: KLineData[] = [];

	const publish = () =>
		report({ bar, source, status, bars: bars.length, last: bars.at(-1) ?? null });

	return {
		async getBars(params) {
			// `init` and `update` are the two whole-window requests; `forward` and
			// `backward` are the reader reaching an edge, which a window holding one
			// snapshot has nothing to answer.
			// `init` 与 `update` 是两个整窗请求；`forward` 与 `backward` 是读者触到边缘，而只持有一份
			// 快照的窗口对此无话可说。
			if (params.type !== "init" && params.type !== "update") {
				params.callback([], false);
				return;
			}
			bar = liveBarFor(params.period);
			const window = await loadLiveWindow(bar);
			bars = window.bars;
			source = window.source;
			publish();
			params.callback(bars, { forward: true, backward: false });
		},
		subscribeBar(params) {
			bar = liveBarFor(params.period);
			const key = `${OKX_INST_ID}:${bar}`;
			// v10 asks for the same channel again after every `resetData`, so a second
			// ask is normal rather than a mistake, and the first subscription — whose
			// callback closed over the same chart — keeps serving it.
			// 每次 `resetData` 之后 v10 都会再要同一个频道，因此第二次索要是常态而非错误，而「第一个」
			// 订阅 —— 它的回调闭包指向同一张图 —— 继续为它服务。
			if (releases.has(key)) return;
			releases.set(
				key,
				sharedOkxStream().subscribe(OKX_INST_ID, bar, {
					onBar: (candle) => {
						bars = mergeLiveCandle(bars, candle);
						publish();
						params.callback({ ...candle });
					},
					onStatus: (next) => {
						status = next;
						publish();
					},
				}),
			);
		},
		unsubscribeBar(params) {
			const key = `${OKX_INST_ID}:${liveBarFor(params.period)}`;
			releases.get(key)?.();
			releases.delete(key);
		},
		dispose() {
			for (const release of releases.values()) release();
			releases.clear();
		},
	};
}

/**
 * One live window drawn by `AdaChartPro`.
 *
 * The chart keeps its whole toolbar, because the periods the buttons offer are the
 * ones the feed serves: changing one changes the channel rather than emptying the
 * chart. The strip is what makes the ticking visible — it names the channel, where
 * the window's history came from, where the socket stands, how many bars the window
 * holds, and the close of the last pushed candle.
 *
 * 一个由 `AdaChartPro` 绘制的实时窗口。
 *
 * 图表完整保留它的工具栏，因为按钮提供的周期正是数据源能提供的那些：改一个换的是频道，而不是把图表
 * 清空。状态条是让「它在跳」这件事看得见的东西 —— 它点明频道、窗口的历史来自哪里、socket 处于什么
 * 状态、窗口持有多少根蜡烛，以及最后一根被推送的蜡烛的收盘价。
 */
function LiveProTicks(props: AdaChartProProps) {
	const [state, setState] = useState<LiveProStripState>(EMPTY_STRIP);
	const [loader] = useState(() => createLiveLoader(setState));

	// The loader owns the subscriptions, so it is the thing that has to let go of
	// them when the story leaves the page.
	// 订阅归 loader 所有，因此离开页面时要放手的是它。
	useEffect(() => () => loader.dispose(), [loader]);

	return (
		<div style={{ display: "flex", flexDirection: "column" }}>
			<div style={STRIP_STYLE}>
				<span>
					{state.bar} · {state.source ?? "loading…"} · {state.status} ·{" "}
					{state.bars} bars
				</span>
				<span>
					{state.last
						? `${state.last.close.toFixed(1)} @ ${minuteStamp(state.last.timestamp)} UTC`
						: "-"}
				</span>
			</div>
			{/* The bar size and the toolbar's ladder travel as args rather than being
			    pinned here, so they are the props the "Show code" panel prints. The
			    loader is the one thing that cannot: it is built by this component's own
			    hook, and a snippet naming it would name a value the reader has to
			    write anyway. */}
			{/* 周期与工具栏的档位作为 args 传递、而不是在这里钉住，是为了让它们成为
			    “Show code” 面板印出来的属性。唯一做不到的是 loader：它由本组件自己的 hook
			    构造，片段里写上它，也只是让读者去写一个同样得自己准备的变量。 */}
			<AdaChartPro {...props} dataLoader={loader} />
		</div>
	);
}

const meta = {
	title: "Charts/AdaChartPro",
	component: AdaChartPro,
	tags: ["autodocs"],
	args: {
		autoSize: ADACHARTPRO_DEFAULTS.autoSize,
		theme: ADACHARTPRO_DEFAULTS.theme,
		locale: ADACHARTPRO_DEFAULTS.locale,
		timezone: ADACHARTPRO_DEFAULTS.timezone,
		drawingBarVisible: ADACHARTPRO_DEFAULTS.drawingBarVisible,
		mainIndicators: [...ADACHARTPRO_DEFAULTS.mainIndicators],
		subIndicators: [...ADACHARTPRO_DEFAULTS.subIndicators],
		height: 520,
		period: { type: "day", span: 1 },
		periods: ADACHARTPRO_DEFAULT_PERIODS,
	},
	argTypes: COMPONENT_ARG_TYPES,
	parameters: {
		docs: {
			// What a reader copies has to be the props that *produced* the canvas above
			// — `<AdaChartPro height={520} mainIndicators={[...]} … />` — rather than
			// `<AdaChartPro {...args} />`, which says nothing about what `args` holds,
			// and rather than what the generator produces on its own: it stringifies the
			// element `render` returns, whose type is the `memo` wrapper rather than the
			// component, so the snippet names `React.Memo`, which no consumer writes and
			// nobody can import. `AdaChart` states the same override for the same reason.
			//
			// Hence a `transform`: Storybook hands it the story's live args, and
			// {@link jsxSource} returns those written as JSX, minus every prop that is
			// merely {@link ADACHARTPRO_DEFAULTS}. Reading the args off the context
			// instead of hard-coding a string is what keeps the snippet true for every
			// story in this file, and after every edit to one.
			//
			// 读者要复制的是*产生*上面那张图的属性 —— `<AdaChartPro height={520} mainIndicators={[...]} … />` ——
			// 而不是 `<AdaChartPro {...args} />`（它丝毫没有说明 `args` 里是什么），也不是生成器自己产出的
			// 东西：它会序列化 `render` 返回的元素，而那个元素的类型是 `memo` 包装器而非组件本身，于是片段
			// 上写的是 `React.Memo` —— 一个使用方不会写、也没人能 import 的名字。`AdaChart` 出于同样的理由
			// 写了同一处覆盖。
			//
			// 因此改用 `transform`：Storybook 把 story 活的 args 交给它，{@link jsxSource} 把这些 args
			// 写成 JSX 返回，并略去一切只是 {@link ADACHARTPRO_DEFAULTS} 的属性。从 context 读而不是写死
			// 字符串，正是这个片段对本文件每个 story、以及每一次改动之后都仍然成立的原因。
			//
			// The two parameters are annotated because the docs `parameters` bag is typed
			// loosely enough that they would otherwise be implicit `any` — and the second
			// one asks for the single field this needs rather than the whole context.
			//
			// 两个参数写明类型，是因为 docs 的 `parameters` 包类型较松，不写就成了隐式 `any`；
			// 而第二个只索取此处要用的那一个字段，不要整个 context。
			source: {
				transform: (_code: string, context: { args: Partial<AdaChartProProps> }) =>
					jsxSource("AdaChartPro", context.args, ADACHARTPRO_DEFAULTS),
			},
		},
	},
	render: (args) => <AdaChartPro {...(args as AdaChartProProps)} />,
} satisfies Meta<typeof AdaChartPro>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * 默认配置，也是文档页第一个画布：主图是 `EMA` 与 `vol-main`（成交量叠加在蜡烛自己的面板上，
 * 用自己的一条轴），下方三个面板分别是 `MACD`、`RSI`、`KDJ`，各占一条轴；工具栏 + 实时行情。
 *
 * Default configuration, and the first canvas of the docs: `EMA` and `vol-main` on
 * the main pane (the volume overlay shares the candles' pane but keeps an axis of its
 * own), with `MACD`, `RSI` and `KDJ` below, one study per pane. Toolbar + live data.
 */
export const Default: Story = {
	args: {
		mainIndicators: ["EMA", VOLUME_OVERLAY_INDICATOR],
		subIndicators: ["MACD", "RSI", "KDJ"],
	},
};

/**
 * 深色主题的金融终端。The dark-theme trading terminal.
 */
export const DarkTheme: Story = { args: { theme: "dark" } };

/**
 * 中文界面，上海时区。Chinese UI in the Shanghai timezone.
 */
export const ChineseLocale: Story = {
	args: { locale: "zh-CN", timezone: "Asia/Shanghai" },
};

/**
 * 水印：绘制在 canvas 背后，且不吃鼠标事件。
 * A watermark behind the canvas that does not swallow pointer events.
 */
export const Watermark: Story = { args: { watermark: "ADA · CHARTS" } };

/**
 * 多指标：主图 MA/BOLL/EMA，副图 VOL/MACD/RSI。
 * A fuller indicator stack: MA/BOLL/EMA on the main pane, VOL/MACD/RSI below.
 */
export const WithIndicators: Story = {
	args: {
		mainIndicators: ["MA", "BOLL", "EMA"],
		subIndicators: ["VOL", "MACD", "RSI"],
	},
};

/**
 * 隐藏画线面板。Hide the drawing-tool palette.
 */
export const NoDrawingBar: Story = { args: { drawingBarVisible: false } };

/**
 * 一分钟实时行情。Live one-minute candles.
 */
export const MinuteBars: Story = {
	name: "Live 1-minute bars",
	args: { period: { type: "minute", span: 1 } },
};

/**
 * 四小时行情。Four-hour candles.
 */
export const FourHourBars: Story = {
	name: "Live 4-hour bars",
	args: { period: { type: "hour", span: 4 } },
};

/**
 * 实时 tick 更新：K 线随数据源的推送逐根变化，状态条显示频道、历史来源、socket 状态、
 * 窗口持有的蜡烛根数，以及最后一根被推送蜡烛的收盘价。
 *
 * 数据源就是 `AdaChart` 实时窗口那套代码（`loadLiveWindow` 取历史、共享 socket 收推送、
 * `mergeLiveCandle` 合并末根），按 v10 的 `DataLoader` 形状改写后交给 `AdaChartPro`；工具栏
 * 提供的周期正是推送源接受的那些，因此改周期换的是频道，图表继续更新。用 Storybook 的周期按钮或
 * 工具栏的周期按钮切换档位，观察蜡烛在右侧逐根长出来。
 *
 * Live candles, one push at a time: the strip names the channel, where the window's
 * history came from, where the socket stands, how many bars the window holds, and
 * the close of the last pushed candle.
 *
 * The feed is `AdaChart`'s live-window code (history through `loadLiveWindow`, the
 * tail through the shared socket, `mergeLiveCandle` for the last bar) written in the
 * shape v10 asks for and handed to `AdaChartPro`; the periods the toolbar offers are
 * the ones the push feed serves, so changing one changes the channel and the chart
 * keeps updating. Switch bar size with the toolbar and watch the newest candle grow
 * at the right edge.
 */
export const LiveTicks: Story = {
	name: "Live tick updates",
	// Where this story opens, and the ladder its toolbar offers — args, so that the
	// snippet beside the canvas is the configuration the canvas is running.
	// 本 story 开在哪个档位、工具栏提供哪些档位 —— 作为 args，画布旁边的片段因此就是这张画布
	// 正在跑的配置。
	args: {
		period: LIVE_START.period,
		periods: LIVE_PRO_PERIODS,
	},
	render: (args) => <LiveProTicks {...(args as AdaChartProProps)} />,
};

/**
 * 通过 `styles` 透传的自定义配色（面积蜡烛）。
 * A custom palette forwarded through `styles` (area candles).
 */
export const CustomStyles: Story = {
	args: {
		theme: "dark",
		styles: {
			candle: {
				type: "area",
				area: { lineColor: "#22d3ee", smooth: true },
			},
		},
	},
};

/**
 * 标的选择器。选择器只在传入 `symbols` 时出现，按钮上显示 `symbol.logo`（若标的带的话）
 * 与 `shortName`/`name`/`ticker` 中的第一个。两枚 logo 用内联 SVG data URI，以免 story 依赖网络。
 *
 * The instrument picker. It only appears when `symbols` is supplied, and its
 * button shows `symbol.logo` (when the instrument has one) beside the first of
 * `shortName`/`name`/`ticker`. Both logos are inline SVG data URIs so the story
 * does not depend on the network.
 */
export const SymbolPicker: Story = {
	args: {
		symbols: [
			{
				ticker: "BTC-USDT",
				shortName: "BTC/USDT",
				pricePrecision: 2,
				volumePrecision: 2,
				priceCurrency: "USDT",
				logo: "data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2016%2016'%3E%3Ccircle%20cx%3D'8'%20cy%3D'8'%20r%3D'8'%20fill%3D'%23f7931a'%2F%3E%3C%2Fsvg%3E",
			},
			{
				ticker: "ETH-USDT",
				shortName: "ETH/USDT",
				pricePrecision: 2,
				volumePrecision: 2,
				priceCurrency: "USDT",
				logo: "data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2016%2016'%3E%3Ccircle%20cx%3D'8'%20cy%3D'8'%20r%3D'8'%20fill%3D'%23627eea'%2F%3E%3C%2Fsvg%3E",
			},
		],
	},
};
