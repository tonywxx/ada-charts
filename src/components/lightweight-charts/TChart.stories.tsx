import type { Meta, StoryObj } from "@storybook/react";
import { type CSSProperties, useEffect, useState } from "react";
import {
	describeCandleSet,
	loadOkxCandles,
	markersFor,
	type OkxBar,
	type OkxCandleSet,
} from "./__data__/okx-live";
import TChart, { type TChartProps } from "./TChart";
import { TCHART_DEFAULTS } from "./t-chart-options";

/**
 * Every story draws from **live** BTC-USDT candles: the loader below requests
 * the latest 300 bars from the OKX public market API each time a page is opened,
 * so what is on screen is the real, current market.
 *
 * `__data__/okx-live.ts` caches one request per bar size for the lifetime of the
 * page — the docs page embeds all stories at once, and without that it would ask
 * for the same series a dozen times. If the request fails (offline, blocked,
 * rate-limited) it falls back to the snapshot committed by `pnpm okx:sample` and
 * labels itself `snapshot`, so the substitution is never silent.
 *
 * 所有 story 都使用**实时**的 BTC-USDT K 线：下方 loader 在每次打开页面时向 OKX
 * 公共行情接口请求最新的 300 根 K 线，因此屏幕上看到的就是真实、当前的行情。
 *
 * `__data__/okx-live.ts` 会按周期缓存请求，整页只取一次 —— 文档页会同时嵌入所有
 * story，没有这层缓存就会向同一组数据发起十几次请求。若请求失败（离线、被拦截、
 * 限流），会回退到由 `pnpm okx:sample` 提交的快照并标注 `snapshot`，不会静默替换。
 */

/**
 * Controls that need more than the type-inferred widget.
 * 需要超出类型推断默认控件的选项。
 */
const CONTROLS = {
	chartType: {
		control: "select",
		options: ["candlestick", "line", "area", "bar", "histogram", "baseline"],
	},
	priceScaleMode: {
		control: "select",
		options: ["normal", "logarithmic", "percentage", "indexedTo100"],
	},
	priceScalePosition: {
		control: "inline-radio",
		options: ["left", "right", "none"],
	},
	crosshairMode: {
		control: "inline-radio",
		options: ["normal", "magnet", "hidden"],
	},
	priceFormatType: {
		control: "inline-radio",
		options: ["price", "volume", "percent"],
	},
	priceLineSource: {
		control: "inline-radio",
		options: ["lastBar", "lastVisibleBar"],
	},
	trackingModeExitMode: {
		control: "inline-radio",
		options: ["onTouchEnd", "onNextTap"],
	},
	watermarkHorzAlign: {
		control: "inline-radio",
		options: ["left", "center", "right"],
	},
	watermarkVertAlign: {
		control: "inline-radio",
		options: ["top", "center", "bottom"],
	},
	lineType: { control: { type: "number", min: 0, max: 2 } },
	lineStyle: { control: { type: "number", min: 0, max: 4 } },
	priceScaleTopMargin: {
		control: { type: "range", min: 0, max: 0.9, step: 0.05 },
	},
	priceScaleBottomMargin: {
		control: { type: "range", min: 0, max: 0.9, step: 0.05 },
	},
	volumeTopMargin: {
		control: { type: "range", min: 0.2, max: 0.95, step: 0.05 },
	},
} as const;

/**
 * Props whose value is data or a raw option bag, so no widget fits them.
 * 取值为数据或原始配置对象的属性，因此不适合任何控件。
 */
const NO_CONTROL = [
	"data",
	"markers",
	"handleScroll",
	"handleScale",
	"chartOptionsOverride",
	"timeScaleOptionsOverride",
	"priceScaleOptionsOverride",
	"overlayPriceScaleOptionsOverride",
	"crosshairOptionsOverride",
	"localizationOptionsOverride",
	"seriesOptionsOverride",
] as const;

/**
 * `argTypes` generated from the defaults table, so the Default column can never
 * drift from what the component actually merges at runtime.
 *
 * 由默认值表生成的 `argTypes`，使 Default 列不可能与组件运行时实际合并的值产生偏差。
 */
const COMPONENT_ARG_TYPES = {
	...Object.fromEntries(
		Object.entries(TCHART_DEFAULTS).map(([name, defaultValue]) => [
			name,
			{
				table: { defaultValue: { summary: JSON.stringify(defaultValue) } },
				...(name in CONTROLS
					? CONTROLS[name as keyof typeof CONTROLS]
					: {}),
			},
		]),
	),
	...Object.fromEntries(
		NO_CONTROL.map((name) => [name, { control: false as const }]),
	),
};

/**
 * The Storybook parameters these stories add on top of the built-in ones: which
 * bar size to draw, and whether to overlay the buy/sell flags.
 * 这些故事在内置参数之上追加的参数：使用哪个 K 线周期，以及是否叠加买卖标记。
 */
interface OkxStoryParameters {
	okxBar?: OkxBar;
	okxMarkers?: boolean;
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
 * Fetches live candles and draws one story, labelled with where the data came
 * from.
 *
 * The request is made here with plain React state rather than through a Storybook
 * loader: `useParameter` is only legal inside the story function's own render
 * scope, and putting ~900 candles into `parameters` makes Storybook serialise
 * them for the addon panels.
 *
 * 负责拉取实时 K 线并绘制一个 story，同时标注数据来源。
 *
 * 请求放在这里用普通 React state 完成，而不是走 Storybook 的 loader：
 * `useParameter` 只在 story 函数自身的渲染作用域内合法，而把约 900 条 K 线塞进
 * `parameters` 会让 Storybook 为插件面板序列化它们。
 */
function LiveTChart({
	bar = "1D",
	withMarkers = false,
	...args
}: TChartProps & { bar: OkxBar; withMarkers: boolean }) {
	const [set, setSet] = useState<OkxCandleSet | null>(null);

	useEffect(() => {
		let active = true;
		loadOkxCandles(bar).then((next) => {
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
	const lastPrice = last?.close ?? last?.value ?? 0;
	const lastTime =
		last && typeof last.time === "number"
			? new Date(last.time * 1000).toISOString().slice(0, 16).replace("T", " ")
			: String(last?.time ?? "-");

	return (
		<div style={{ display: "flex", flexDirection: "column" }}>
			<div style={STRIP_STYLE}>
				<span>{describeCandleSet(set)}</span>
				<span>
					last {lastPrice.toFixed(1)} @ {lastTime} UTC
				</span>
			</div>
			<TChart
				{...args}
				data={set.bars}
				markers={withMarkers ? markersFor(set.bars) : undefined}
			/>
		</div>
	);
}

const meta = {
	title: "Charts/TChart",
	component: TChart,
	tags: ["autodocs"],
	// Seeding the component-level args from the defaults table serves two ends:
	// every story starts from the documented baseline, and the ArgsTable's
	// Default column reads the same values the runtime actually merges.
	// 用默认值表为组件级 args 打底可同时满足两点：每个 story 都从文档化的基线开始，
	// 且 ArgsTable 的 Default 列读到的就是运行时真正合并使用的那些值。
	args: {
		...TCHART_DEFAULTS,
		height: 480,
		showVolume: true,
		showEma: true,
		showHighPriceLine: true,
		showLowPriceLine: true,
		showAvgPriceLine: true,
		crosshairMode: "magnet",
	},
	argTypes: COMPONENT_ARG_TYPES,
	parameters: { okxBar: "1D" satisfies OkxBar },
	render: (args, context) => {
		const parameters = context.parameters as OkxStoryParameters;
		return (
			<LiveTChart
				{...args}
				bar={parameters.okxBar ?? "1D"}
				withMarkers={parameters.okxMarkers === true}
			/>
		);
	},
} satisfies Meta<typeof TChart>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default configuration: candlesticks with volume, EMA and the three
 * reference lines.
 *
 * 默认配置：蜡烛图，叠加成交量、EMA 与三条参考线。
 */
export const Candlestick: Story = {};

/** Close-price line built from the same dataset. 使用同一数据集绘制的收盘价折线图。 */
export const Line: Story = { args: { chartType: "line" } };

/** Filled gradient beneath the close line. 收盘价折线下的渐变填充面积图。 */
export const Area: Story = { args: { chartType: "area" } };

/** OHLC bars without bodies. 无实体的 OHLC 柱形图。 */
export const Bar: Story = { args: { chartType: "bar", showEma: false } };

/** Close prices as columns rising from zero. 以零为基线的收盘价柱状图。 */
export const Histogram: Story = {
	args: { chartType: "histogram", showEma: false, showVolume: false },
};

/**
 * Fill split above and below a base price, which defaults to the dataset mean.
 *
 * 以基准价上下分色填充，基准价默认取数据均值。
 */
export const Baseline: Story = {
	args: { chartType: "baseline", showEma: false, showVolume: false },
};

/** Volume in its own price scale along the bottom. 在底部独立价格轴上叠加成交量。 */
export const WithVolume: Story = {
	args: { showEma: false, showVolume: true, showVolumeLabel: true },
};

/** Two exponential moving averages over the candles. 蜡烛图上的两条指数移动平均线。 */
export const WithEma: Story = {
	args: {
		showVolume: false,
		showEma: true,
		emaPeriod1: 5,
		emaPeriod2: 34,
		emaLineWidth: 2,
	},
};

/** High, low and mean reference lines with axis labels. 带轴标签的最高/最低/均价参考线。 */
export const ReferenceLines: Story = {
	args: {
		showEma: false,
		showVolume: false,
		highPriceLineStyle: 2,
		lowPriceLineStyle: 2,
		avgPriceLineStyle: 1,
	},
};

/**
 * A text watermark, backed by the pane primitive that replaces the `watermark`
 * chart option v5 removed.
 *
 * 文本水印，由 v5 中被移除的 `watermark` 图表选项的替代品 pane primitive 实现。
 */
export const Watermark: Story = {
	args: {
		watermarkVisible: true,
		watermarkText: "ADA\nCHARTS",
		watermarkColor: "rgba(41, 98, 255, 0.12)",
		watermarkFontSize: 64,
		showEma: false,
		showVolume: false,
	},
};

/** Flag markers pinned to individual bars. 固定在单根 K 线上的标记。 */
export const Markers: Story = {
	parameters: { okxMarkers: true },
	args: { showEma: false, showVolume: false },
};

/**
 * Inverted palette on a dark background with a percentage axis.
 *
 * 深色背景上的反色配色，配合百分比价格轴。
 */
export const DarkTheme: Story = {
	name: "Dark theme + percentage axis",
	parameters: { okxBar: "4H" },
	args: {
		backgroundColor: "#131722",
		textColor: "#b2b5be",
		priceScaleBorderColor: "#2a2e39",
		timeScaleBorderColor: "#2a2e39",
		vertGridColor: "rgba(42, 46, 57, 0.6)",
		horzGridColor: "rgba(42, 46, 57, 0.6)",
		priceScaleMode: "percentage",
		upColor: "#22d3ee",
		downColor: "#f472b6",
		emaColor1: "#fbbf24",
		emaColor2: "#a78bfa",
	},
};

/**
 * Both price axes hidden and grid lines off — the look used inside dashboards.
 *
 * 隐藏两侧价格轴并关闭网格线：仪表盘内常用的样式。
 */
export const Minimal: Story = {
	args: {
		priceScalePosition: "none",
		vertGridVisible: false,
		horzGridVisible: false,
		showEma: false,
		showVolume: false,
	},
};

/**
 * A compact sparkline: forced 1px lines with no overlays or labels.
 *
 * 紧凑的迷你走势图：强制 1px 线条，不显示叠加层与标签。
 */
export const MiniChart: Story = {
	args: {
		isMiniChart: true,
		height: 80,
		timeScaleVisible: false,
		priceScalePosition: "none",
		vertGridVisible: false,
		horzGridVisible: false,
		lastValueVisible: false,
		priceLineVisible: false,
	},
};

/**
 * Real one-minute candles: the `0.1` tick size is inferred from the data itself,
 * and the axis prints clock times instead of dates.
 *
 * 真实的一分钟 K 线：`0.1` 的最小变动价位由数据本身推断，坐标轴显示时刻而非日期。
 */
export const MinuteBars: Story = {
	name: "Live 1-minute bars",
	parameters: { okxBar: "1m" },
	args: {
		timeVisible: true,
		showEma: false,
		showVolume: true,
		volumeTopMargin: 0.75,
	},
};

/**
 * Logarithmic axis on the left, inverted, with inertia scrolling off.
 *
 * 对数价格轴置于左侧、方向反转，并关闭惯性滚动。
 */
export const LogarithmicLeftAxis: Story = {
	name: "Logarithmic left axis",
	args: {
		priceScaleMode: "logarithmic",
		priceScalePosition: "left",
		priceScaleInvert: true,
		kineticScrollTouch: false,
	},
};

/**
 * Scrolling and zooming disabled, for read-only embedded previews.
 *
 * 关闭平移与缩放，用于只读的内嵌预览。
 */
export const ReadOnly: Story = {
	args: {
		handleScroll: false,
		handleScale: false,
		timeScaleFixLeftEdge: true,
		timeScaleFixRightEdge: true,
	},
};

/**
 * Real four-hour candles pinned at both edges, so the newest bar stays put while
 * the range is adjusted.
 *
 * 真实的四小时 K 线，两端固定，因此在调整区间时最新一根保持不动。
 */
export const FourHourBars: Story = {
	name: "Live 4-hour bars",
	parameters: { okxBar: "4H" },
	args: {
		timeVisible: true,
		timeScaleFixRightEdge: true,
		timeScaleShiftVisibleRangeOnNewBar: true,
		showEma: false,
	},
};
