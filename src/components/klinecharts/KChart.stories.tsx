import type { Meta, StoryObj } from "@storybook/react";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import type { KLineData, OverlayCreate } from "klinecharts";
import KChart, { type KChartProps } from "./KChart";
import {
	KCHART_CANDLE_TYPES,
	KCHART_LOCALES,
	KCHART_OVERLAY_NAMES,
	KCHART_DEFAULTS,
	KCHART_PERIOD_TYPES,
} from "./k-chart-options";
import {
	describeKLineSet,
	loadOkxKLines,
	type OkxBar,
	type OkxKLineSet,
} from "./__data__/okx-kline";

/**
 * Every story draws from **live** BTC-USDT candles: the loader requests the
 * latest 300 bars from the OKX public market API each time a page is opened, so
 * what is on screen is the real, current market — the same data source `TChart`
 * uses, just shaped for `klinecharts` (millisecond timestamps).
 *
 * 所有 story 都使用**实时**的 BTC-USDT K 线：loader 每次打开页面时从 OKX 公共行情接口请求
 * 最新的 300 根 K 线，因此屏幕上就是真实、当前的行情 —— 与 `TChart` 同源，只是整形为
 * `klinecharts` 所需的形式（毫秒时间戳）。
 */

/** Select-style controls that the type inference alone cannot render. 类型推断无法自动渲染的下拉控件。 */
const CONTROLS = {
	candleType: { control: "select", options: [...KCHART_CANDLE_TYPES] },
	theme: { control: "inline-radio", options: ["light", "dark"] },
	locale: { control: "inline-radio", options: [...KCHART_LOCALES] },
	tooltipShowRule: {
		control: "inline-radio",
		options: ["always", "follow_cross", "none"],
	},
	candleTooltipShowType: {
		control: "inline-radio",
		options: ["standard", "rect"],
	},
	periodType: { control: "select", options: [...KCHART_PERIOD_TYPES] },
	yAxisPosition: { control: "inline-radio", options: ["left", "right"] },
	zoomAnchor: { control: "inline-radio", options: ["cursor", "last_bar"] },
} as const;

/** Props whose value is data or a raw config bag, so no widget fits them. 取值为数据或原始配置对象、不适合任何控件的属性。 */
const NO_CONTROL = [
	"data",
	"dataLoader",
	"symbol",
	"period",
	"styles",
	"formatter",
	"thousandsSeparator",
	"decimalFold",
	"hotkey",
	"layout",
	"indicators",
	"panes",
	"overlays",
	"onChartReady",
	"onZoom",
	"onScroll",
	"onVisibleRangeChange",
	"onCrosshairChange",
	"onCandleBarClick",
	"onCandleTooltipFeatureClick",
	"onIndicatorTooltipFeatureClick",
	"onCrosshairFeatureClick",
	"onPaneDrag",
] as const;

/**
 * `argTypes` generated from the defaults table so the Default column can never
 * drift from what the component merges at runtime.
 * 由默认值表生成的 `argTypes`，使 Default 列不会与组件运行时合并的值产生偏差。
 */
const COMPONENT_ARG_TYPES = {
	...Object.fromEntries(
		Object.entries(KCHART_DEFAULTS).map(([name, defaultValue]) => [
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

/** Which bar size to draw, and which overlay names to place on the chart. 使用哪个周期，以及要放置哪些画线工具。 */
interface KChartStoryParameters {
	okxBar?: OkxBar;
	overlayNames?: string[];
}

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

/**
 * Place each named overlay on real bars, anchored to offsets from the newest
 * candle so the geometry survives a data refresh.
 * 把每个具名画线工具放置在真实 K 线上，锚点以「距最新一根的偏移」表达，使其几何在数据刷新后仍然成立。
 */
function overlaysFor(
	bars: KLineData[],
	names: string[] | undefined,
): OverlayCreate[] {
	if (!names?.length) return [];
	const at = (fromEnd: number): { timestamp: number; value: number } | null => {
		const bar = bars[bars.length - fromEnd];
		return bar ? { timestamp: bar.timestamp, value: bar.close } : null;
	};
	// Five anchors cover the 2-, 3- and 4-step tools; extra points are ignored.
	// 五个锚点可覆盖 2/3/4 步的工具；多余的点会被忽略。
	const anchors = [50, 38, 26, 14, 4].map(at).filter((p): p is NonNullable<typeof p> => p !== null);
	return names.map((name) => ({ name, points: anchors }) as OverlayCreate);
}

/**
 * Fetches live candles and draws one story, labelled with the data provenance.
 * 拉取实时 K 线并绘制一个 story，同时标注数据来源。
 */
function LiveKChart({
	bar = "1D",
	overlayNames,
	...args
}: KChartProps & { bar: OkxBar; overlayNames?: string[] }) {
	const [set, setSet] = useState<OkxKLineSet | null>(null);

	useEffect(() => {
		let active = true;
		loadOkxKLines(bar).then((next) => {
			if (active) setSet(next);
		});
		return () => {
			active = false;
		};
	}, [bar]);

	if (!set) {
		return <div style={STRIP_STYLE}>loading live {bar} candles from OKX…</div>;
	}

	const last = set.bars.at(-1);
	const lastTime = last
		? new Date(last.timestamp).toISOString().slice(0, 16).replace("T", " ")
		: "-";

	return (
		<div style={{ display: "flex", flexDirection: "column" }}>
			<div style={STRIP_STYLE}>
				<span>{describeKLineSet(set)}</span>
				<span>
					last {last?.close.toFixed(1)} @ {lastTime} UTC
				</span>
			</div>
			<KChart
				{...args}
				data={set.bars}
				overlays={overlayNames ? overlaysFor(set.bars, overlayNames) : args.overlays}
			/>
		</div>
	);
}

const meta = {
	title: "Charts/KChart",
	component: KChart,
	tags: ["autodocs"],
	args: {
		...KCHART_DEFAULTS,
		height: 480,
		indicators: [
			{ name: "MA" },
			{ name: "BOLL" },
			{ name: "VOL", paneId: "vol_pane" },
		],
		panes: [{ id: "vol_pane", height: 100 }],
	},
	argTypes: COMPONENT_ARG_TYPES,
	parameters: { okxBar: "1D" satisfies OkxBar },
	render: (args, context) => {
		const parameters = context.parameters as KChartStoryParameters;
		return (
			<LiveKChart
				{...args}
				bar={parameters.okxBar ?? "1D"}
				overlayNames={parameters.overlayNames}
			/>
		);
	},
} satisfies Meta<typeof KChart>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * 默认配置：实心蜡烛，叠加 MA + BOLL 主图指标与 VOL 副图。
 * Default configuration: solid candles with MA + BOLL on the main pane and VOL below.
 */
export const Candlestick: Story = {};

/**
 * 空心蜡烛。Hollow (stroked) candles.
 */
export const CandleStroke: Story = { args: { candleType: "candle_stroke" } };

/**
 * OHLC 柱形。OHLC bars.
 */
export const Ohlc: Story = {
	name: "OHLC bars",
	args: { candleType: "ohlc", indicators: [{ name: "MA" }] },
};

/**
 * 面积线，价格填充渐变。Area line with a gradient price fill.
 */
export const Area: Story = {
	args: {
		candleType: "area",
		indicators: [],
		styles: { candle: { area: { smooth: true } } },
	},
};

/**
 * 常用技术指标：主图 MA，副图 MACD。A common stack of indicators: MA on the main pane, MACD below.
 */
export const WithIndicators: Story = {
	args: {
		indicators: [
			{ name: "MA" },
			{ name: "EMA" },
			{ name: "VOL", paneId: "vol_pane" },
			{ name: "MACD", paneId: "macd_pane" },
			{ name: "KDJ", paneId: "kdj_pane" },
		],
		panes: [
			{ id: "vol_pane", height: 80 },
			{ id: "macd_pane", height: 80 },
			{ id: "kdj_pane", height: 80 },
		],
	},
};

/**
 * 布林带 + RSI。Bollinger Bands with an RSI sub-pane.
 */
export const BollingerRsi: Story = {
	args: {
		indicators: [
			{ name: "BOLL" },
			{ name: "RSI", paneId: "rsi_pane" },
		],
		panes: [{ id: "rsi_pane", height: 100 }],
	},
};

/**
 * 内置画线工具（价格线 + 斐波那契线）。Built-in drawing tools (price line + fibonacci line).
 */
export const BuiltInOverlays: Story = {
	parameters: { overlayNames: ["priceLine", "fibonacciLine", "segment"] },
	args: { indicators: [] },
};

/**
 * 来自 `@klinecharts/extension` 的扩展画线工具，`KChart` 会自动注册。
 * Extension drawing tools from `@klinecharts/extension`, auto-registered by `KChart`.
 */
export const ExtensionOverlays: Story = {
	name: "Extension overlays (@klinecharts/extension)",
	parameters: { overlayNames: ["rect", "gannBox", "fibonacciSpiral", "abcd"] },
	args: { indicators: [] },
};

/**
 * 深色主题。Dark theme.
 */
export const DarkTheme: Story = {
	args: {
		theme: "dark",
		backgroundColor: "#131722",
		candleType: "candle_solid",
		indicators: [
			{ name: "MA" },
			{ name: "VOL", paneId: "vol_pane" },
		],
		panes: [{ id: "vol_pane", height: 100 }],
	},
};

/**
 * 中文界面。Chinese UI locale.
 */
export const ChineseLocale: Story = {
	args: { locale: "zh-CN" },
};

/**
 * 真实一分钟 K 线，本地时区。Live one-minute bars in a chosen timezone.
 */
export const MinuteBars: Story = {
	name: "Live 1-minute bars",
	parameters: { okxBar: "1m" },
	args: {
		periodType: "minute",
		periodSpan: 1,
		timezone: "Asia/Shanghai",
		indicators: [{ name: "VOL", paneId: "vol_pane" }],
		panes: [{ id: "vol_pane", height: 90 }],
	},
};

/**
 * 通过 `styles` 兜底项做的完全自定义配色 —— 任何未封装为 prop 的设置都能从这里到达。
 * Fully custom palette via the raw `styles` escape hatch — anything not surfaced as a prop is reachable here.
 */
export const CustomStyles: Story = {
	args: {
		theme: "dark",
		backgroundColor: "#0b1020",
		indicators: [{ name: "MA" }],
		styles: {
			candle: {
				bar: { upColor: "#22d3ee", downColor: "#f472b6", noChangeColor: "#94a3b8" },
			},
			grid: { horizontal: { color: "rgba(148, 163, 184, 0.12)" }, vertical: { show: false } },
			xAxis: { tickText: { color: "#cbd5e1", size: 11 } },
			yAxis: { tickText: { color: "#cbd5e1", size: 11 } },
		},
	},
};

/**
 * 左侧 y 轴、隐藏网格与标记，用于仪表盘式紧凑嵌入。
 * Left y-axis with grid and price marks off — the compact look for dashboards.
 */
export const Minimal: Story = {
	args: {
		yAxisPosition: "left",
		showGrid: false,
		showPriceMark: false,
		tooltipShowRule: "none",
		indicators: [],
	},
};

/**
 * 只读预览：禁用滚动与缩放。Read-only preview: scrolling and zooming disabled.
 */
export const ReadOnly: Story = {
	args: { scrollEnabled: false, zoomEnabled: false, indicators: [] },
};

/**
 * 全部内置画线工具的名称列表（供扩展或工具栏使用）。
 * The names of every overlay `KChart` can draw — built-in plus extension — for toolbars or programmatic use.
 */
export const KnownOverlayNames: Story = {
	name: "All known overlay names",
	render: () => (
		<div style={{ padding: 12, font: "12px/1.6 ui-monospace, monospace" }}>
			<p>
				<code>KCHART_OVERLAY_NAMES</code> ({KCHART_OVERLAY_NAMES.length}):
			</p>
			<pre style={{ whiteSpace: "pre-wrap" }}>
				{JSON.stringify(KCHART_OVERLAY_NAMES, null, 0)}
			</pre>
		</div>
	),
};
