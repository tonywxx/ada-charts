import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
	loadOkxCandles,
	type OkxCandleSet,
} from "../lightweight-charts/__data__/okx-live";
import type { Anchor } from "lightweight-charts-drawing";
import type { Time } from "lightweight-charts";
import type { TChartDataItem } from "../lightweight-charts/TChart";
import TChartPro, { type TChartProProps } from "./TChartPro";
import {
	TCHARTPRO_DEFAULTS,
	TCHARTPRO_DEFAULT_BAR_SIZES,
} from "./t-chart-pro-options";

/**
 * Every `TChartPro` story draws from **live** OKX data: unless a story passes
 * `data`, the bundled feed fetches history and keeps the newest candle moving,
 * exactly like a trading terminal. When OKX is unreachable the feed serves the
 * committed snapshot instead of failing, so the docs still render offline.
 *
 * 每条 `TChartPro` story 都用**实时** OKX 数据：只要 story 没传 `data`，内置数据源就会
 * 自行拉取历史并持续刷新最新一根，跟真实交易终端一样。OKX 不可达时改用提交进仓库的快照
 * 而不是报错，因此离线也能出文档。
 */

/** Controls whose type is too wide for the inferred widget. 类型过宽、推断出的控件不适用的选项。 */
const CONTROLS = {
	theme: { control: "inline-radio", options: ["light", "dark"] },
	locale: { control: "inline-radio", options: ["en-US", "zh-CN"] },
	barSize: { control: "select", options: [...TCHARTPRO_DEFAULT_BAR_SIZES] },
	magnet: { control: "inline-radio", options: ["off", "weak", "strong"] },
} as const;

/** Props carrying objects or callbacks, so no widget fits them. 携带对象或回调、不适合任何控件的属性。 */
const NO_CONTROL = [
	"symbol",
	"datafeed",
	"barSizes",
	"drawingTools",
	"drawings",
	"onDrawingsChange",
	"data",
	"markers",
	"onChartReady",
	"onClick",
	"onDoubleClick",
	"onCrosshairMove",
	"onVisibleRangeChange",
	"onVisibleLogicalRangeChange",
	"onSizeChange",
	"chartOptionsOverride",
	"timeScaleOptionsOverride",
	"priceScaleOptionsOverride",
	"overlayPriceScaleOptionsOverride",
	"crosshairOptionsOverride",
	"localizationOptionsOverride",
	"seriesOptionsOverride",
	"handleScroll",
	"handleScale",
] as const;

const COMPONENT_ARG_TYPES = {
	...Object.fromEntries(
		Object.entries(TCHARTPRO_DEFAULTS).map(([name, defaultValue]) => [
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
	title: "Charts/TChartPro",
	component: TChartPro,
	tags: ["autodocs"],
	args: {
		autoSize: TCHARTPRO_DEFAULTS.autoSize,
		theme: TCHARTPRO_DEFAULTS.theme,
		locale: TCHARTPRO_DEFAULTS.locale,
		timezone: TCHARTPRO_DEFAULTS.timezone,
		barSize: TCHARTPRO_DEFAULTS.barSize,
		drawingBarVisible: TCHARTPRO_DEFAULTS.drawingBarVisible,
		magnet: TCHARTPRO_DEFAULTS.magnet,
		keepToolArmed: TCHARTPRO_DEFAULTS.keepToolArmed,
		lockNewDrawings: TCHARTPRO_DEFAULTS.lockNewDrawings,
		mainIndicators: [...TCHARTPRO_DEFAULTS.mainIndicators],
		subIndicators: [...TCHARTPRO_DEFAULTS.subIndicators],
		height: 520,
		watermarkVisible: true,
		watermarkText: "ada-charts",
	},
	argTypes: COMPONENT_ARG_TYPES,
	render: (args) => <TChartPro {...(args as TChartProProps)} />,
} satisfies Meta<typeof TChartPro>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The out-of-the-box terminal: live candles, toolbar, MA over the price pane and
 * volume below it.
 *
 * 开箱即用的终端形态：实时行情、工具栏、主图 MA、下方成交量。
 */
export const Default: Story = {};

/**
 * The same chart in the dark treatment — the Theme drives toolbar and canvas
 * together.
 * 同一图表的深色处理 —— Theme 同时驱动工具栏与 canvas。
 */
export const Dark: Story = {
	args: { theme: "dark" },
};

/**
 * Chinese toolbar labels, with the axis printing dates in Asia/Shanghai.
 * 中文工具栏文案，坐标轴按 Asia/Shanghai 打印日期。
 */
export const ChineseAsiaShanghai: Story = {
	name: "Chinese, Asia/Shanghai",
	args: { locale: "zh-CN", timezone: "Asia/Shanghai" },
};

/**
 * Several indicators at once — the counterpart of `KChartPro`'s
 * "With indicators", down to the same list: EMA, MA and BOLL over the candles,
 * volume, MACD and RSI in their own panes. Any of the 27 names the toolbar
 * offers can be dropped into either list; this is simply a legible sample.
 *
 * 同时开多个指标 —— 对应 `KChartPro` 的 “With indicators”，连清单都一样：主图 EMA、MA
 * 与 BOLL，副面板成交量、MACD 与 RSI。工具栏提供的 27 个名字里任意一个都可以放进任一
 * 列表，这里只是一个看得清的样例。
 */
export const AllIndicators: Story = {
	args: {
		mainIndicators: ["EMA", "MA", "BOLL"],
		subIndicators: ["VOL", "MACD", "RSI"],
		height: 640,
	},
};

/**
 * Intraday candles: the bar size is also the code the OKX feed is asked for, and
 * the axis switches to clock times on its own.
 *
 * 日内 K 线：周期同时也是向 OKX 数据源取数的代码，坐标轴会自动切换为时刻。
 */
export const OneMinuteBars: Story = {
	name: "Live 1-minute bars",
	args: { barSize: "1m" },
};

/**
 * Four-hour candles — the matching story to `KChartPro`'s "Live 4-hour bars".
 * 四小时 K 线 —— 与 `KChartPro` 的 “Live 4-hour bars” 对应的一条。
 */
export const FourHourBars: Story = {
	name: "Live 4-hour bars",
	args: { barSize: "4H" },
};

/**
 * A background watermark, the counterpart of `KChartPro`'s `watermark` prop —
 * which here is `TChart`'s `watermarkText` under `watermarkVisible`.
 *
 * 背景水印，对应 `KChartPro` 的 `watermark` —— 在这一层就是 `TChart` 的
 * `watermarkText` 加 `watermarkVisible`。
 */
export const Watermark: Story = {
	args: { watermarkText: "ADA · CHARTS", watermarkVisible: true },
};

/**
 * A custom palette through the declarative props — where `KChartPro` forwards a
 * `styles` bag, this layer fans the same intent out over `TChart`'s own keys.
 *
 * 用声明式 props 表达的定制配色 —— `KChartPro` 转发的是一个 `styles` 包，本层则把
 * 同样的意图扇出到 `TChart` 自己的键上。
 */
export const CustomPalette: Story = {
	args: {
		theme: "dark",
		chartType: "area",
		lineColor: "#22d3ee",
		topColor: "#22d3ee",
		bottomColor: "#0b1220",
		backgroundColor: "#0b1220",
	},
};

/**
 * The Pro layer without its drawing strip: the palette and the tools stay
 * available through {@link TChartProApi}, so a host can build its own.
 *
 * 收起画线条的 Pro 层：面板与工具仍可经由 {@link TChartProApi} 使用，宿主可以自建工具栏。
 */
export const WithoutDrawingBar: Story = {
	args: { drawingBarVisible: false },
};

/**
 * A restricted palette: only the two Fibonacci tools this chart needs.
 * 受限的画线面板：这张图只需要下面两个斐波那契工具。
 */
export const TwoFibonacciTools: Story = {
	args: {
		drawingTools: ["fib-retracement", "fib-extension"],
		magnet: "strong",
		keepToolArmed: true,
	},
};

/**
 * Drawings restored from a saved layout, on the same candles they were drawn
 * over — the anchors are the visible high and low of the loaded range.
 *
 * 从已保存布局恢复的画线，落在当初绘制它们的同一段 K 线上 —— 锚点即该区间内的可见
 * 最高价与最低价。
 */
export const PresetDrawings: Story = {
	render: (args) => <Restored {...(args as TChartProProps)} />,
};

/**
 * Placing a trend line with the pointer: arm the tool in the palette, click the
 * chart twice, and `onDrawingsChange` reports the finished drawing.
 *
 * 用指针画一条趋势线：在面板里 arm 工具、在图上点两下，`onDrawingsChange` 就会把完成的
 * 画线报出来。
 */
export const PlaceTrendLine: Story = {
	render: (args) => <Restored {...(args as TChartProProps)} showCount />,
	play: async ({ canvasElement, step }) => {
		const screen = within(canvasElement);
		await step("wait for the candles", async () => {
			await waitFor(() => expect(screen.queryByText("loading…")).toBeNull(), {
				timeout: 15_000,
			});
		});
		await step("arm the trend line", async () => {
			await userEvent.click(screen.getByRole("button", { name: /^Draw/ }));
			await userEvent.click(await screen.findByRole("button", { name: /Trend Line/ }));
		});
		await step("click two anchors", async () => {
			const host = canvasElement.querySelector<HTMLElement>(
				".tv-lightweight-charts",
			);
			if (!host) throw new Error("chart element not found");
			const box = host.getBoundingClientRect();
			for (const [x, y] of [
				[0.3, 0.35],
				[0.7, 0.6],
			]) {
				host.dispatchEvent(
					new MouseEvent("click", {
						bubbles: true,
						clientX: box.left + box.width * x,
						clientY: box.top + box.height * y,
					}),
				);
			}
			await waitFor(() =>
				expect(screen.getByTestId("drawing-count").textContent).toBe("1"),
			);
		});
	},
};

/**
 * Loads a candle set once, then hands it to `TChartPro` together with drawings
 * anchored to that very range — so what the docs show is a layout a real chart
 * could have saved.
 *
 * 先加载一段 K 线，再连同以该区间为锚点的画线一起交给 `TChartPro` —— 因此文档展示的
 * 正是真实图表可能保存下来的布局。
 */
function Restored(props: TChartProProps & { showCount?: boolean }) {
	const [candles, setCandles] = useState<OkxCandleSet | null>(null);
	const [count, setCount] = useState(0);
	useEffect(() => {
		void loadOkxCandles("1D").then(setCandles);
	}, []);
	if (!candles) {
		return <p>loading…</p>;
	}
	const bars = candles.bars;
	const lowOf = (bar: TChartDataItem) => bar.low ?? bar.close ?? 0;
	const highOf = (bar: TChartDataItem) => bar.high ?? bar.close ?? 0;
	const trough = bars.reduce((best, bar, i) => (lowOf(bar) < lowOf(bars[best]) ? i : best), 0);
	const crest = bars.reduce((best, bar, i) => (highOf(bar) > highOf(bars[best]) ? i : best), 0);
	const anchor = (bar: TChartDataItem, price: number): Anchor => ({
		time: bar.time as Time,
		price,
	});
	return (
		<div>
			{props.showCount && (
				<p>
					Drawings: <span data-testid="drawing-count">{count}</span>
				</p>
			)}
			<TChartPro
				{...props}
				data={bars}
				drawings={
					props.showCount
						? undefined
						: [
								{
									id: "tl-1",
									type: "trend-line",
									anchors: [
										anchor(bars[trough], lowOf(bars[trough])),
										anchor(bars[crest], highOf(bars[crest])),
									],
									style: { lineColor: "#1677ff", lineWidth: 2 },
									options: { visible: true, locked: false },
								},
								{
									id: "fr-1",
									type: "fib-retracement",
									anchors: [
										anchor(bars[trough], lowOf(bars[trough])),
										anchor(bars[crest], highOf(bars[crest])),
									],
									style: { lineColor: "#f52887", lineWidth: 1 },
									options: { visible: true, locked: false },
								},
							]
				}
				onDrawingsChange={(drawings) => setCount(drawings.length)}
			/>
		</div>
	);
}
