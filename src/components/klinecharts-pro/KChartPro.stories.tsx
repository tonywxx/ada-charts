import type { Meta, StoryObj } from "@storybook/react";
import KChartPro, { type KChartProProps } from "./KChartPro";
import { KCHARTPRO_DEFAULTS, KCHARTPRO_DEFAULT_PERIODS } from "./k-chart-pro-options";
import { KCHART_BUILT_IN_INDICATORS } from "../klinecharts/k-chart-options";

/**
 * `KChartPro` draws entirely from **live** OKX data: unlike `KChart`, the Pro
 * layer pulls its own candles through the {@link OkxDatafeed}, so a story only
 * configures the chart — the market data arrives on its own, exactly like a real
 * trading terminal. When the network is unavailable the feed falls back to the
 * committed snapshot instead of failing.
 *
 * `KChartPro` 完全使用**实时** OKX 数据：与 `KChart` 不同，Pro 层通过 {@link OkxDatafeed}
 * 自行拉取 K 线，因此 story 只需配置图表 —— 行情会像真实交易终端那样自行到达。网络不可用时，
 * 数据源回退到提交进仓库的快照而非报错。
 */

const CONTROLS = {
	theme: { control: "inline-radio", options: ["light", "dark"] },
	locale: { control: "inline-radio", options: ["en-US", "zh-CN"] },
	mainIndicators: { control: "check", options: [...KCHART_BUILT_IN_INDICATORS] },
	subIndicators: { control: "check", options: [...KCHART_BUILT_IN_INDICATORS] },
} as const;

/** Props that carry objects or callbacks, so no widget fits them. 携带对象或回调、不适合任何控件的属性。 */
const NO_CONTROL = [
	"symbol",
	"period",
	"periods",
	"datafeed",
	"styles",
	"onChartReady",
] as const;

const COMPONENT_ARG_TYPES = {
	...Object.fromEntries(
		Object.entries(KCHARTPRO_DEFAULTS).map(([name, defaultValue]) => [
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

const meta = {
	title: "Charts/KChartPro",
	component: KChartPro,
	tags: ["autodocs"],
	args: {
		autoSize: KCHARTPRO_DEFAULTS.autoSize,
		theme: KCHARTPRO_DEFAULTS.theme,
		locale: KCHARTPRO_DEFAULTS.locale,
		timezone: KCHARTPRO_DEFAULTS.timezone,
		drawingBarVisible: KCHARTPRO_DEFAULTS.drawingBarVisible,
		mainIndicators: [...KCHARTPRO_DEFAULTS.mainIndicators],
		subIndicators: [...KCHARTPRO_DEFAULTS.subIndicators],
		height: 520,
		period: { multiplier: 1, timespan: "day", text: "1D" },
		periods: KCHARTPRO_DEFAULT_PERIODS,
	},
	argTypes: COMPONENT_ARG_TYPES,
	render: (args) => <KChartPro {...(args as KChartProProps)} />,
} satisfies Meta<typeof KChartPro>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * 开箱即用的专业图表：工具栏 + 主图 MA + 副图 VOL + 实时行情。
 * The out-of-the-box terminal: toolbar + MA on the main pane, VOL below, live data.
 */
export const Default: Story = {};

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
 * 隐藏画线工具栏。Hide the drawing-tool toolbar.
 */
export const NoDrawingBar: Story = { args: { drawingBarVisible: false } };

/**
 * 水印。A background watermark.
 */
export const Watermark: Story = { args: { watermark: "ADA · CHARTS" } };

/**
 * 一分钟实时行情。Live one-minute candles.
 */
export const MinuteBars: Story = {
	name: "Live 1-minute bars",
	args: { period: { multiplier: 1, timespan: "minute", text: "1m" } },
};

/**
 * 四小时行情。Four-hour candles.
 */
export const FourHourBars: Story = {
	name: "Live 4-hour bars",
	args: { period: { multiplier: 4, timespan: "hour", text: "4H" } },
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
