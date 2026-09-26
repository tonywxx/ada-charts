import type { Time, UTCTimestamp } from "lightweight-charts";
import type { ChartTheme } from "../../theme";
import type { TChartDataItem } from "../lightweight-charts/TChart";
import type { TChartProIndicator } from "./t-chart-pro-options";

/**
 * The indicator layer `@klinecharts/pro` gets for free from its engine:
 * `lightweight-charts` plots series and nothing derived, so every study the Pro
 * toolbar offers is computed here and handed to the chart as ordinary Series.
 *
 * 这一层指标是 `@klinecharts/pro` 由引擎白拿、而 `lightweight-charts` 没有的东西：
 * 后者只画 Series、不画衍生值，所以 Pro 工具栏提供的每个指标都在这里算出来，
 * 再作为普通 Series 交给图表。
 *
 * The catalogue and every formula in it follow `klinecharts` v10, which is the
 * engine behind `KChartPro` — same 27 studies, same `calcParams`, so switching
 * Wrappers does not change what an indicator means (ADR-0001: the engine's own
 * vocabulary stays visible, only the drawing surface differs).
 *
 * 指标目录与其中每个公式都对齐 `klinecharts` v10，也就是 `KChartPro` 背后的引擎 ——
 * 同样 27 个指标、同样的 `calcParams`，因此换一层 Wrapper 不会改变指标的含义
 * （ADR-0001：引擎自己的词汇仍然可见，不同的只是绘制表面）。
 *
 * Two engine facts do not survive the crossing and are noted where they matter:
 * `lightweight-charts` has no scatter series (SAR is drawn as a line), and
 * `TChartDataItem` has no turnover field (AVP reads price × size instead).
 *
 * 有两个引擎事实无法跨过来，各自在相关处注明：`lightweight-charts` 没有散点系列
 * （SAR 画成折线），`TChartDataItem` 没有成交额字段（AVP 改读 价 × 量）。
 */

/** One plotted line or bar-column produced by an indicator. 指标产出的一条折线或一柱系列。 */
export interface IndicatorTrack {
	/** Label printed on the axis and in the legend. 显示在坐标轴与图例上的名称。 */
	title: string;
	/** `0` is the main (price) pane; higher values are stacked panes below it. `0` 为主图面板，更大值为下方堆叠的副面板。 */
	paneIndex: number;
	/** Whether the track is a line or a histogram. 该轨迹是折线还是柱状。 */
	kind: "line" | "histogram";
	/** The plotted points; `null` inputs are dropped rather than drawn as zero. 绘制点；`null` 输入会被丢弃而不是画成 0。 */
	data: { time: Time; value: number }[];
	/** Line or bar colour. 线条或柱子颜色。 */
	color: string;
	/** Width applied to lines only. 仅对折线生效的宽度。 */
	lineWidth: 1 | 2;
	/** A histogram whose bars are individually coloured (volume, MACD). 每根柱子单独着色的柱状系列（成交量、MACD）。 */
	perBarColors?: { time: Time; value: number; color: string }[];
}

/**
 * A bar as a study reads it: the four prices, the size, and the turnover. Every
 * field is present, so the calculators below can be a straight transcription of
 * the engine's own arithmetic.
 *
 * 指标读取的一根 K 线：四个价格、成交量与成交额。每个字段都在，因此下面的计算过程
 * 可以逐字对应引擎自身的算法。
 */
interface IndicatorBar {
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	turnover: number;
}

/** How a histogram colours its bars. A line series has one colour and ignores this. 柱状系列如何给各柱着色。折线只有一个颜色，不看这一项。 */
type BarColouring =
	/** Sign of the value: up above zero, down below, unchanged at zero. 取值的符号：大于 0 涨色，小于 0 跌色，等于 0 平色。 */
	| "sign"
	/** Direction against the previous bar's value. 与上一根的取值比较得出的方向。 */
	| "direction"
	/** The bar's own candle: close above open, below, or level. 该根自己的蜡烛：收盘高于开盘、低于开盘或持平。 */
	| "candle";

/** One figure a study reports, before it becomes a {@link IndicatorTrack}. 指标报出的一条 figure，尚未变成 {@link IndicatorTrack}。 */
interface IndicatorFigure {
	title: string;
	kind: "line" | "histogram";
	/** One entry per bar; `null` where the window is not yet full. 每根一项；窗口未满处为 `null`。 */
	values: (number | null)[];
	/** Only meaningful for histograms. 仅对柱状系列有意义。 */
	barColouring?: BarColouring;
}

/** Price of a data item, following the same fallback order `TChart` uses. 数据项的价格，沿用与 `TChart` 相同的回退顺序。 */
function priceOf(item: TChartDataItem): number {
	return item.close ?? item.value ?? item.open ?? Number.NaN;
}

function timeOf(item: TChartDataItem): Time {
	return typeof item.time === "number"
		? (item.time as UTCTimestamp)
		: item.time;
}

/**
 * The bars a study can read, in dataset order; an item with no price at all is
 * dropped, because a study window cannot span a bar that has none.
 *
 * 指标能读取的 K 线，按数据集顺序；完全没有价格的项会被丢掉，因为指标窗口不能跨越
 * 一根没有价格的 K 线。
 */
function usableItems(data: readonly TChartDataItem[]): TChartDataItem[] {
	return data.filter(isUsable);
}

/** Whether a data item carries a price a study can read. 数据项是否带着指标读得出来的价格。 */
function isUsable(item: TChartDataItem): boolean {
	return Number.isFinite(priceOf(item));
}

/**
 * One bar per item, with the fields the studies read always present. `high` and
 * `low` fall back to the bar's own extremes, and the missing volume to zero:
 * `TChartDataItem` is a union of candle-, market- and single-value shapes while
 * every study here is written against candles.
 *
 * 每项一根 K 线，指标读取的字段一定存在。缺省的最高价与最低价回退到该根自身的极值，
 * 缺失的成交量回退为 0：`TChartDataItem` 是蜡烛、行情与单值三种形状的并集，而这里的
 * 每个指标都是按蜡烛写的。
 */
function toBar(item: TChartDataItem): IndicatorBar {
	const close = priceOf(item);
	const open = item.open ?? close;
	const volume = item.volume ?? 0;
	return {
		open,
		high: item.high ?? Math.max(open, close),
		low: item.low ?? Math.min(open, close),
		close,
		volume,
		// No turnover field reaches this layer, so price × size stands in for it.
		// AVP is a ratio of turnovers, and both sides of the proxy scale together,
		// so the average it reports is the volume-weighted average price either way.
		// 本层拿不到成交额字段，因此用 价 × 量 代理。AVP 是成交额之比，代理的分子分母
		// 同步缩放，所以它给出的仍是成交量加权均价。
		turnover: close * volume,
	};
}

const closesOf = (bars: readonly IndicatorBar[]): number[] =>
	bars.map((bar) => bar.close);

/** The highest high and lowest low over `[from, to]` — what the studies spell `HN` / `LN`. `[from, to]` 区间内的最高最高价与最低最低价，即指标里的 `HN` / `LN`。 */
function highLow(bars: readonly IndicatorBar[], from: number, to: number): [number, number] {
	let high = bars[from].high;
	let low = bars[from].low;
	for (let index = from + 1; index <= to; index += 1) {
		if (bars[index].high > high) high = bars[index].high;
		if (bars[index].low < low) low = bars[index].low;
	}
	return [high, low];
}

const line = (title: string, values: (number | null)[]): IndicatorFigure => ({
	title,
	kind: "line",
	values,
});

const histogram = (
	title: string,
	values: (number | null)[],
	barColouring: BarColouring,
): IndicatorFigure => ({ title, kind: "histogram", values, barColouring });

/**
 * Simple moving average; the leading `period - 1` slots are `null` because a
 * window that shallow has no value to report.
 *
 * 简单移动平均；前 `period - 1` 项为 `null`，因为窗口还不够填满。
 */
export function sma(values: readonly number[], period: number): (number | null)[] {
	const out: (number | null)[] = [];
	let sum = 0;
	for (let i = 0; i < values.length; i += 1) {
		sum += values[i];
		if (i >= period) sum -= values[i - period];
		out.push(i >= period - 1 ? sum / period : null);
	}
	return out;
}

/**
 * Exponential moving average over a series that starts at `firstIndex`, seeded
 * with the arithmetic mean of the first full window — the engine's own recursion,
 * which several studies apply to their own output rather than to prices (DEA on
 * DIF, TRIX's second and third passes).
 *
 * 起点为 `firstIndex` 的指数移动平均，用首个完整窗口的算术均值做种子 —— 即引擎自身的
 * 递推；有多个指标把它用在自己的输出上而不是价格上（DIF 上的 DEA、TRIX 的第二三层）。
 */
function emaFrom(
	values: readonly (number | null)[],
	period: number,
	firstIndex: number,
): (number | null)[] {
	const out: (number | null)[] = [];
	let previous: number | null = null;
	const seed = firstIndex + period - 1;
	for (let i = 0; i < values.length; i += 1) {
		if (i < seed) {
			out.push(null);
			continue;
		}
		if (i === seed) {
			let sum = 0;
			for (let j = firstIndex; j <= i; j += 1) sum += values[j] as number;
			previous = sum / period;
		} else {
			previous =
				(2 * (values[i] as number) + (period - 1) * (previous as number)) /
				(period + 1);
		}
		out.push(previous);
	}
	return out;
}

/**
 * Exponential moving average, seeded with the arithmetic mean of the leading
 * window so the first output point matches {@link sma}.
 *
 * 指数移动平均，用首个窗口的算术均值做种子，使第一个输出点与 {@link sma} 一致。
 */
export function ema(values: readonly number[], period: number): (number | null)[] {
	return emaFrom(values, period, 0);
}

/**
 * Simple average of a window over a series that only begins at `firstIndex`: the
 * studies that average their own output (MAMTM, MAROC, MAOBV, MAPSY…) all reduce
 * to this one shape.
 *
 * 对一个从 `firstIndex` 才开始的系列做窗口算术平均：所有对自己输出再做平均的指标
 * （MAMTM、MAROC、MAOBV、MAPSY……）都归结为这一种形状。
 */
function windowAverage(
	values: readonly (number | null)[],
	period: number,
	firstIndex: number,
): (number | null)[] {
	const out: (number | null)[] = [];
	const seed = firstIndex + period - 1;
	for (let i = 0; i < values.length; i += 1) {
		if (i < seed) {
			out.push(null);
			continue;
		}
		let sum = 0;
		for (let j = i - period + 1; j <= i; j += 1) sum += values[j] as number;
		out.push(sum / period);
	}
	return out;
}

/**
 * Bollinger Bands: the middle line is an {@link sma}, the outer two sit
 * `multiplier` standard deviations away from it.
 * 布林带：中轨为 {@link sma}，上下轨各偏离 `multiplier` 倍标准差。
 */
export function bollinger(
	values: readonly number[],
	period: number,
	multiplier: number,
): { middle: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] } {
	const middle = sma(values, period);
	const upper: (number | null)[] = [];
	const lower: (number | null)[] = [];
	for (let i = 0; i < values.length; i += 1) {
		const mean = middle[i];
		if (mean === null) {
			upper.push(null);
			lower.push(null);
			continue;
		}
		let variance = 0;
		for (let j = i - period + 1; j <= i; j += 1) {
			variance += (values[j] - mean) ** 2;
		}
		const deviation = Math.sqrt(variance / period);
		upper.push(mean + multiplier * deviation);
		lower.push(mean - multiplier * deviation);
	}
	return { middle, upper, lower };
}

/**
 * MACD as `klinecharts` spells it: the histogram is twice the distance between
 * the line and its signal, so the two layers match candle for candle.
 * MACD 采用 `klinecharts` 的口径：柱高为快慢线差值的两倍，两层逐根对齐。
 */
export function macd(
	values: readonly number[],
	fast: number,
	slow: number,
	signal: number,
): {
	dif: (number | null)[];
	dea: (number | null)[];
	hist: (number | null)[];
} {
	const fastLine = ema(values, fast);
	const slowLine = ema(values, slow);
	const dif = values.map((_, i) =>
		fastLine[i] === null || slowLine[i] === null
			? null
			: (fastLine[i] as number) - (slowLine[i] as number),
	);
	// DEA averages DIF from the bar DIF itself begins at, not from the start of
	// the dataset — seeding it earlier would drag the signal line to zero.
	// DEA 从 DIF 自身出现的那个位置开始平均，而不是数据集开头 —— 提前下种会把信号线
	// 拖向 0。
	const dea = emaFrom(dif, signal, slow - 1);
	const hist = dif.map((value, i) =>
		value === null || dea[i] === null
			? null
			: (value - (dea[i] as number)) * 2,
	);
	return { dif, dea, hist };
}

/**
 * Relative Strength Index with Wilder's smoothing.
 * 使用 Wilder 平滑的相对强弱指标。
 */
export function rsi(values: readonly number[], period: number): (number | null)[] {
	const out: (number | null)[] = [];
	let gain = 0;
	let loss = 0;
	for (let i = 0; i < values.length; i += 1) {
		if (i === 0) {
			out.push(null);
			continue;
		}
		const change = values[i] - values[i - 1];
		const up = Math.max(change, 0);
		const down = Math.max(-change, 0);
		if (i <= period) {
			gain += up;
			loss += down;
			if (i === period) {
				gain /= period;
				loss /= period;
				out.push(loss === 0 ? 100 : gain === 0 ? 0 : 100 - 100 / (1 + gain / loss));
			} else {
				out.push(null);
			}
			continue;
		}
		gain = (gain * (period - 1) + up) / period;
		loss = (loss * (period - 1) + down) / period;
		out.push(loss === 0 ? 100 : gain === 0 ? 0 : 100 - 100 / (1 + gain / loss));
	}
	return out;
}

// ---------------------------------------------------------------- the studies

/**
 * AVP — average price, i.e. the running turnover per unit of size. It reads
 * `turnover`, which this layer proxies as price × size (see {@link toBar}).
 *
 * AVP 均价，即累计成交额除以累计成交量。它读 `turnover`，本层用 价 × 量 代理
 * （见 {@link toBar}）。
 */
function averagePriceFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	let turnover = 0;
	let volume = 0;
	const values = bars.map((bar) => {
		turnover += bar.turnover;
		volume += bar.volume;
		return volume === 0 ? null : turnover / volume;
	});
	return [line("AVP", values)];
}

/** AO — the difference between a 5- and a 34-bar average of each bar's midpoint, coloured by whether it rose. AO —— 5 根与 34 根中价均线之差，按是否上行着色。 */
function awesomeOscillatorFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [5, 34]
	const [short, long] = [5, 34];
	const middles = bars.map((bar) => (bar.high + bar.low) / 2);
	const shortAverage = sma(middles, short);
	const longAverage = sma(middles, long);
	const values = middles.map((_, i) =>
		shortAverage[i] === null || longAverage[i] === null
			? null
			: (shortAverage[i] as number) - (longAverage[i] as number),
	);
	return [histogram("AO", values, "direction")];
}

/** BIAS — how far the close sits from its own moving average, in percent. BIAS —— 收盘价偏离自身均线的百分比。 */
function biasFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [6, 12, 24]
	const closes = closesOf(bars);
	return [6, 12, 24].map((period) => {
		const average = sma(closes, period);
		return line(
			`BIAS${period}`,
			closes.map((close, i) => {
				const mean = average[i];
				return mean === null ? null : ((close - mean) / mean) * 100;
			}),
		);
	});
}

/** BOLL — a moving average with two bands a standard deviation apart. BOLL —— 一条均线，上下各一条标准差带。 */
function bollingerFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [20, 2]
	const { middle, upper, lower } = bollinger(closesOf(bars), 20, 2);
	return [
		line("BOLLUP", upper),
		line("BOLL", middle),
		line("BOLLDN", lower),
	];
}

/** BRAR — BR compares the close to the day's range, AR the open to it. BRAR —— BR 比较昨收与当日区间，AR 比较开盘与当日区间。 */
function brarFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [26]
	const period = 26;
	let aboveClose = 0;
	let belowClose = 0;
	let aboveOpen = 0;
	let belowOpen = 0;
	const br: (number | null)[] = [];
	const ar: (number | null)[] = [];
	bars.forEach((bar, i) => {
		const previous = bars[i - 1] ?? bar;
		aboveOpen += bar.high - bar.open;
		belowOpen += bar.open - bar.low;
		aboveClose += bar.high - previous.close;
		belowClose += previous.close - bar.low;
		if (i < period - 1) {
			br.push(null);
			ar.push(null);
			return;
		}
		br.push(belowClose === 0 ? 0 : (aboveClose / belowClose) * 100);
		ar.push(belowOpen === 0 ? 0 : (aboveOpen / belowOpen) * 100);
		const ago = bars[i - (period - 1)];
		const agoPrevious = bars[i - period] ?? ago;
		aboveClose -= ago.high - agoPrevious.close;
		belowClose -= agoPrevious.close - ago.low;
		aboveOpen -= ago.high - ago.open;
		belowOpen -= ago.open - ago.low;
	});
	return [line("BR", br), line("AR", ar)];
}

/** BBI — the average of four moving averages, a slower consensus line. BBI —— 四条均线的均值，一条更迟钝的共识线。 */
function bullAndBearIndexFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [3, 6, 12, 24]
	const periods = [3, 6, 12, 24];
	const closes = closesOf(bars);
	const averages = periods.map((period) => sma(closes, period));
	const values = closes.map((_, i) => {
		let sum = 0;
		for (const average of averages) {
			const value = average[i];
			if (value === null) return null;
			sum += value;
		}
		return sum / periods.length;
	});
	return [line("BBI", values)];
}

/** CCI — how far the typical price sits from its own average, in mean deviations. CCI —— 典型价偏离自身均值的平均绝对偏差倍数。 */
function commodityChannelIndexFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [20]
	const period = 20;
	const typical = bars.map((bar) => (bar.high + bar.low + bar.close) / 3);
	const average = sma(typical, period);
	const values = typical.map((value, i) => {
		const mean = average[i];
		if (mean === null) return null;
		let deviation = 0;
		for (let j = i - period + 1; j <= i; j += 1) {
			deviation += Math.abs(typical[j] - mean);
		}
		const meanDeviation = deviation / period;
		return meanDeviation === 0 ? 0 : (value - mean) / meanDeviation / 0.015;
	});
	return [line("CCI", values)];
}

/** CR — the energy of a bar against the midpoint of the previous one, plus four lagged averages of it. CR —— 当日区间相对昨中价的力量，以及它四条带前置的均线。 */
function currentRatioFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [26, 10, 20, 40, 60]
	const window = 26;
	const periods = [10, 20, 40, 60];
	// Each average is read back from `Math.ceil(period / 2.5 + 1)` bars ago, which
	// is the engine's own lead and is kept as is.
	// 每条均线都向前回看 `Math.ceil(period / 2.5 + 1)` 根，这是引擎自身的提前量，原样保留。
	const leads = periods.map((period) => Math.ceil(period / 2.5 + 1));
	const sums = periods.map(() => 0);
	const averages = periods.map(() => [] as number[]);
	const values: (number | null)[] = [];
	const figures = periods.map(() => new Array<number | null>(bars.length).fill(null));

	bars.forEach((bar, i) => {
		const previous = bars[i - 1] ?? bar;
		const midpoint = (previous.high + previous.low) / 2;
		const above = Math.max(0, bar.high - midpoint);
		const below = Math.max(0, midpoint - bar.low);
		let value: number | null = null;
		if (i >= window - 1) {
			value = below === 0 ? 0 : (above / below) * 100;
			periods.forEach((period, index) => {
				sums[index] += value as number;
				if (i < window + period - 2) return;
				averages[index].push(sums[index] / period);
				const lead = leads[index];
				if (i >= window + period + lead - 3) {
					const lagged = averages[index][averages[index].length - 1 - lead];
					// The engine's own threshold lets one bar through where the list is
					// still one short, leaving that point unset; unset is `null` here.
					// 引擎自身的门槛会放过来一根此时列表还差一项的 K 线，那一项在那里是
					// 未赋值的；这里把「未赋值」记作 `null`。
					figures[index][i] = lagged === undefined ? null : lagged;
				}
				sums[index] -= values[i - (period - 1)] ?? 0;
			});
		}
		values.push(value);
	});

	return [
		line("CR", values),
		...periods.map((_, index) => line(`MA${index + 1}`, figures[index])),
	];
}

/** DMA — the spread between a short and a long moving average, plus that spread's own average. DMA —— 长短两条均线之差，以及这个差自身的均线。 */
function differentOfMovingAverageFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [10, 50, 10]
	const [short, long, signal] = [10, 50, 10];
	const closes = closesOf(bars);
	const shortAverage = sma(closes, short);
	const longAverage = sma(closes, long);
	const values = closes.map((_, i) =>
		shortAverage[i] === null || longAverage[i] === null
			? null
			: (shortAverage[i] as number) - (longAverage[i] as number),
	);
	return [line("DMA", values), line("AMA", windowAverage(values, signal, long - 1))];
}

/** DMI — directional movement: two smoothed ranges, their index, and that index's own average. DMI —— 方向运动：两条平滑后的动向、动向指标，以及该指标自身的均线。 */
function directionalMovementIndexFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [14, 6]
	const [period, smoothing] = [14, 6];
	let trueSum = 0;
	let upSum = 0;
	let downSum = 0;
	let trueRange = 0;
	let upMovement = 0;
	let downMovement = 0;
	let indexSum = 0;
	let index = 0;
	const pdi: (number | null)[] = [];
	const mdi: (number | null)[] = [];
	const adx: (number | null)[] = [];
	const adxr: (number | null)[] = [];

	bars.forEach((bar, i) => {
		const previous = bars[i - 1] ?? bar;
		const trueValue = Math.max(
			bar.high - bar.low,
			Math.abs(bar.high - previous.close),
			Math.abs(previous.close - bar.low),
		);
		const highMove = bar.high - previous.high;
		const lowMove = previous.low - bar.low;
		const up = highMove > 0 && highMove > lowMove ? highMove : 0;
		const down = lowMove > 0 && lowMove > highMove ? lowMove : 0;
		trueSum += trueValue;
		upSum += up;
		downSum += down;

		let pdiValue: number | null = null;
		let mdiValue: number | null = null;
		let adxValue: number | null = null;
		let adxrValue: number | null = null;

		if (i >= period - 1) {
			if (i > period - 1) {
				trueRange = trueRange - trueRange / period + trueValue;
				upMovement = upMovement - upMovement / period + up;
				downMovement = downMovement - downMovement / period + down;
			} else {
				trueRange = trueSum;
				upMovement = upSum;
				downMovement = downSum;
			}
			pdiValue = 0;
			mdiValue = 0;
			if (trueRange !== 0) {
				pdiValue = (upMovement * 100) / trueRange;
				mdiValue = (downMovement * 100) / trueRange;
			}
			let movement = 0;
			if (mdiValue + pdiValue !== 0) {
				movement = (Math.abs(mdiValue - pdiValue) / (mdiValue + pdiValue)) * 100;
			}
			indexSum += movement;
			if (i >= period * 2 - 2) {
				index =
					i > period * 2 - 2
						? (index * (period - 1) + movement) / period
						: indexSum / period;
				adxValue = index;
				if (i >= period * 2 + smoothing - 3) {
					adxrValue = ((adx[i - (smoothing - 1)] ?? 0) + index) / 2;
				}
			}
		}

		pdi.push(pdiValue);
		mdi.push(mdiValue);
		adx.push(adxValue);
		adxr.push(adxrValue);
	});

	return [
		line("PDI", pdi),
		line("MDI", mdi),
		line("ADX", adx),
		line("ADXR", adxr),
	];
}

/** EMV — how far price moved for the volume it took, and that value's average. EMV —— 价格移动的距离相对于所耗成交量，以及该值的均线。 */
function easeOfMovementValueFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [14, 9]; only the first one is read here too,
	// because the engine averages EM over the same window it sums it over.
	// klinecharts 的默认 calcParams 是 [14, 9]；这里同样只读第一个，因为引擎对 EM 求和
	// 与求平均用的是同一个窗口。
	const period = 14;
	const values: (number | null)[] = bars.map((bar, i) => {
		if (i === 0) return null;
		const previous = bars[i - 1];
		if (bar.volume === 0 || bar.high - bar.low === 0) return 0;
		const moved =
			(bar.high + bar.low) / 2 - (previous.high + previous.low) / 2;
		const ratio = bar.volume / 100_000_000 / (bar.high - bar.low);
		return moved / ratio;
	});
	return [line("EMV", values), line("MAEMV", windowAverage(values, period, 1))];
}

/** EMA — three exponential moving averages of the close. EMA —— 收盘价的三条指数移动平均。 */
function exponentialMovingAverageFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [6, 12, 20]
	const closes = closesOf(bars);
	return [6, 12, 20].map((period) =>
		line(`EMA${period}`, ema(closes, period)),
	);
}

/** MTM — the change in close over `period` bars, and that change's average. MTM —— `period` 根之间收盘价的变化，以及该变化的均线。 */
function momentumFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [12, 6]
	const [period, signal] = [12, 6];
	const closes = closesOf(bars);
	const values = closes.map((close, i) =>
		i >= period ? close - closes[i - period] : null,
	);
	return [line("MTM", values), line("MAMTM", windowAverage(values, signal, period))];
}

/** MA — the moving averages the toolbar draws by default. MA —— 工具栏默认绘制的几条均线。 */
function movingAverageFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [5, 10, 30, 60]
	const closes = closesOf(bars);
	return [5, 10, 30, 60].map((period) =>
		line(`MA${period}`, sma(closes, period)),
	);
}

/** MACD — the fast/slow spread, its signal, and twice their distance. MACD —— 快慢线之差、它的信号线，以及二者距离的两倍。 */
function movingAverageConvergenceDivergenceFigures(
	bars: readonly IndicatorBar[],
): IndicatorFigure[] {
	// klinecharts default calcParams: [12, 26, 9]
	const { dif, dea, hist } = macd(closesOf(bars), 12, 26, 9);
	return [
		line("DIF", dif),
		line("DEA", dea),
		histogram("MACD", hist, "sign"),
	];
}

/** OBV — cumulative volume, signed by whether the close rose, plus its average. OBV —— 按收盘涨跌加/减的累计成交量，以及它的均线。 */
function onBalanceVolumeFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [30]
	const period = 30;
	let total = 0;
	const values = bars.map((bar, i) => {
		const previous = bars[i - 1] ?? bar;
		if (bar.close < previous.close) total -= bar.volume;
		else if (bar.close > previous.close) total += bar.volume;
		return total;
	});
	return [line("OBV", values), line("MAOBV", windowAverage(values, period, 0))];
}

/** PVT — cumulative volume weighted by the close's own rate of change. PVT —— 以涨跌幅加权的累计成交量。 */
function priceAndVolumeTrendFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	let total = 0;
	const values = bars.map((bar, i) => {
		const previous = bars[i - 1] ?? bar;
		// The engine reads a missing size as one; a zero-size bar lands on the same
		// number here, because this layer normalises the field to zero.
		// 引擎把缺失的成交量读作 1；本层把该字段归一为 0，因此零成交量的那根落在这里
		// 是同一个数。
		const volume = bar.volume || 1;
		if (previous.close !== 0) {
			total += ((bar.close - previous.close) / previous.close) * volume;
		}
		return total;
	});
	return [line("PVT", values)];
}

/** PSY — the share of the last `period` bars that closed up, plus its average. PSY —— 最近 `period` 根中收涨的比例，以及它的均线。 */
function psychologicalLineFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [12, 6]
	const [period, signal] = [12, 6];
	const rising: number[] = [];
	let upCount = 0;
	const values = bars.map((bar, i) => {
		const previous = bars[i - 1] ?? bar;
		const up = bar.close - previous.close > 0 ? 1 : 0;
		rising.push(up);
		upCount += up;
		if (i < period - 1) return null;
		const value = (upCount / period) * 100;
		upCount -= rising[i - (period - 1)];
		return value;
	});
	return [
		line("PSY", values),
		line("MAPSY", windowAverage(values, signal, period - 1)),
	];
}

/** ROC — the close's rate of change against `period` bars ago, plus its average. ROC —— 收盘价相对 `period` 根之前的变动率，以及它的均线。 */
function rateOfChangeFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [12, 6]
	const [period, signal] = [12, 6];
	const closes = closesOf(bars);
	const values = closes.map((close, i) => {
		if (i < period) return null;
		const ago = closes[i - period];
		return ago !== 0 ? ((close - ago) / ago) * 100 : 0;
	});
	return [line("ROC", values), line("MAROC", windowAverage(values, signal, period))];
}

/** RSI — three Wilder-smoothed relative strength indices. RSI —— 三条 Wilder 平滑的相对强弱指标。 */
function relativeStrengthIndexFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [6, 12, 24]
	const closes = closesOf(bars);
	return [6, 12, 24].map((period, index) =>
		line(`RSI${index + 1}`, rsi(closes, period)),
	);
}

/** SMA — a moving average that weights the newest close, per the engine's `m`. SMA —— 按引擎的 `m` 给最新收盘价加权的均线。 */
function simpleMovingAverageFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [12, 2]
	const [period, weight] = [12, 2];
	let sum = 0;
	let previous = 0;
	const values = closesOf(bars).map((close, i) => {
		sum += close;
		if (i < period - 1) return null;
		previous =
			i > period - 1
				? (close * weight + previous * (period - weight + 1)) / (period + 1)
				: sum / period;
		return previous;
	});
	return [line("SMA", values)];
}

/** KDJ — the stochastic oscillator, with the engine's 50 starting values. KDJ —— 随机指标，起始值沿用引擎的 50。 */
function stochFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [9, 3, 3]
	const [period, kWeight, dWeight] = [9, 3, 3];
	const k: (number | null)[] = [];
	const d: (number | null)[] = [];
	const j: (number | null)[] = [];
	bars.forEach((bar, i) => {
		if (i < period - 1) {
			k.push(null);
			d.push(null);
			j.push(null);
			return;
		}
		const [high, low] = highLow(bars, i - (period - 1), i);
		const span = high - low;
		const rsv = ((bar.close - low) / (span === 0 ? 1 : span)) * 100;
		const kValue = ((kWeight - 1) * (k[i - 1] ?? 50) + rsv) / kWeight;
		const dValue = ((dWeight - 1) * (d[i - 1] ?? 50) + kValue) / dWeight;
		k.push(kValue);
		d.push(dValue);
		j.push(3 * kValue - 2 * dValue);
	});
	return [line("K", k), line("D", d), line("J", j)];
}

/**
 * SAR — the stop-and-reverse trailing stop. `klinecharts` draws it as circles;
 * `lightweight-charts` has no scatter series, so it is drawn as a line.
 *
 * SAR —— 抛物线转向的跟踪止损。`klinecharts` 用圆点绘制；`lightweight-charts` 没有
 * 散点系列，因此这里画成折线。
 */
function stopAndReverseFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [2, 2, 20], read as percentages
	const start = 2 / 100;
	const step = 2 / 100;
	const max = 20 / 100;
	let acceleration = start;
	let extreme = -100;
	let increasing = false;
	let sar = 0;
	const values = bars.map((bar, i) => {
		const previous = sar;
		const neighbour = bars[Math.max(1, i) - 1];
		if (increasing) {
			if (extreme === -100 || extreme < bar.high) {
				extreme = bar.high;
				acceleration = Math.min(acceleration + step, max);
			}
			sar = previous + acceleration * (extreme - previous);
			const floor = Math.min(neighbour.low, bar.low);
			if (sar > bar.low) {
				sar = extreme;
				acceleration = start;
				extreme = -100;
				increasing = !increasing;
			} else if (sar > floor) {
				sar = floor;
			}
		} else {
			if (extreme === -100 || extreme > bar.low) {
				extreme = bar.low;
				acceleration = Math.min(acceleration + step, max);
			}
			sar = previous + acceleration * (extreme - previous);
			const ceiling = Math.max(neighbour.high, bar.high);
			if (sar < bar.high) {
				sar = extreme;
				acceleration = start;
				extreme = -100;
				increasing = !increasing;
			} else if (sar < ceiling) {
				sar = ceiling;
			}
		}
		return sar;
	});
	return [line("SAR", values)];
}

/** TRIX — the rate of change of a triple-smoothed close, plus its average. TRIX —— 三重平滑收盘价的变动率，以及它的均线。 */
function tripleExponentiallySmoothedAverageFigures(
	bars: readonly IndicatorBar[],
): IndicatorFigure[] {
	// klinecharts default calcParams: [12, 9]
	const [period, signal] = [12, 9];
	const first = ema(closesOf(bars), period);
	const second = emaFrom(first, period, period - 1);
	const third = emaFrom(second, period, period * 2 - 2);
	const start = period * 3 - 3;
	const values = third.map((smoothed, i) => {
		if (smoothed === null || i < start) return null;
		// The engine reports zero on the bar the triple average first exists, and
		// only then starts measuring against its own previous value.
		// 引擎在三重均值首次出现的那根报 0，从下一根才开始与自己的前值比较。
		if (i === start) return 0;
		const previous = third[i - 1] as number;
		return ((smoothed - previous) / previous) * 100;
	});
	return [line("TRIX", values), line("MATRIX", windowAverage(values, signal, start))];
}

/** VOL — the size of each bar, its moving averages, and the bar's own colour. VOL —— 每根的成交量、它的几条均线，以及该根自身的颜色。 */
function volumeFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [5, 10, 20]
	const volumes = bars.map((bar) => bar.volume);
	return [
		...[5, 10, 20].map((period) => line(`MA${period}`, sma(volumes, period))),
		histogram("VOLUME", volumes, "candle"),
	];
}

/** VR — volume in rising bars against volume in falling ones, plus its average. VR —— 上涨根的成交量对下跌根的成交量，以及它的均线。 */
function volumeRatioFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [26, 6]
	const [period, signal] = [26, 6];
	let rising = 0;
	let falling = 0;
	let level = 0;
	const values = bars.map((bar, i) => {
		const previous = bars[i - 1] ?? bar;
		if (bar.close > previous.close) rising += bar.volume;
		else if (bar.close < previous.close) falling += bar.volume;
		else level += bar.volume;
		if (i < period - 1) return null;
		const halfLevel = level / 2;
		const value =
			falling + halfLevel === 0
				? 0
				: ((rising + halfLevel) / (falling + halfLevel)) * 100;
		const ago = bars[i - (period - 1)];
		const agoPrevious = bars[i - period] ?? ago;
		if (ago.close > agoPrevious.close) rising -= ago.volume;
		else if (ago.close < agoPrevious.close) falling -= ago.volume;
		else level -= ago.volume;
		return value;
	});
	return [line("VR", values), line("MAVR", windowAverage(values, signal, period - 1))];
}

/** WR — where the close sits inside the last `period` bars' range, in percent. WR —— 收盘价在最近 `period` 根区间内的位置百分比。 */
function williamsRFigures(bars: readonly IndicatorBar[]): IndicatorFigure[] {
	// klinecharts default calcParams: [6, 10, 14]
	return [6, 10, 14].map((period, index) =>
		line(
			`WR${index + 1}`,
			bars.map((bar, i) => {
				if (i < period - 1) return null;
				const [high, low] = highLow(bars, i - (period - 1), i);
				const span = high - low;
				return span === 0 ? 0 : ((bar.close - high) / span) * 100;
			}),
		),
	);
}

/**
 * Every name in the catalogue, mapped to the study that computes it. Typing the
 * table as a record over {@link TChartProIndicator} is what keeps the two in
 * step: a name added to the catalogue without its arithmetic fails to compile.
 *
 * 目录里的每个名字，映射到算出它的那个指标。把表声明为 {@link TChartProIndicator}
 * 上的 record 正是二者保持一致的原因：名录里加了名字却没有对应算法，就编译不过。
 */
const STUDIES: Record<
	TChartProIndicator,
	(bars: readonly IndicatorBar[]) => IndicatorFigure[]
> = {
	AVP: averagePriceFigures,
	AO: awesomeOscillatorFigures,
	BIAS: biasFigures,
	BOLL: bollingerFigures,
	BRAR: brarFigures,
	BBI: bullAndBearIndexFigures,
	CCI: commodityChannelIndexFigures,
	CR: currentRatioFigures,
	DMA: differentOfMovingAverageFigures,
	DMI: directionalMovementIndexFigures,
	EMV: easeOfMovementValueFigures,
	EMA: exponentialMovingAverageFigures,
	MTM: momentumFigures,
	MA: movingAverageFigures,
	MACD: movingAverageConvergenceDivergenceFigures,
	OBV: onBalanceVolumeFigures,
	PVT: priceAndVolumeTrendFigures,
	PSY: psychologicalLineFigures,
	ROC: rateOfChangeFigures,
	RSI: relativeStrengthIndexFigures,
	SMA: simpleMovingAverageFigures,
	KDJ: stochFigures,
	SAR: stopAndReverseFigures,
	TRIX: tripleExponentiallySmoothedAverageFigures,
	VOL: volumeFigures,
	VR: volumeRatioFigures,
	WR: williamsRFigures,
};

/** Whether a name is one this layer can plot. 该名称是否属于本层可绘制的指标。 */
export function isKnownIndicator(name: string): name is TChartProIndicator {
	return name in STUDIES;
}

/** The colour the palette assigns to the `index`-th line of a study. 调色板分配给某指标第 `index` 条线的颜色。 */
function paletteColor(theme: ChartTheme, index: number): string {
	return theme.indicatorLines[index % theme.indicatorLines.length];
}

/** The colour a histogram gives one bar, per the figure's {@link BarColouring}. 柱状图按 figure 的 {@link BarColouring} 给某根柱子的颜色。 */
function barColor(
	theme: ChartTheme,
	colouring: BarColouring | undefined,
	bar: IndicatorBar,
	previous: number | null,
	value: number,
): string {
	switch (colouring) {
		case "sign":
			return value > 0 ? theme.trendUp : value < 0 ? theme.trendDown : theme.noChange;
		case "candle":
			return bar.close > bar.open
				? theme.trendUp
				: bar.close < bar.open
					? theme.trendDown
					: theme.noChange;
		case "direction":
			// A study's first bar has nothing to compare against, and the engine reads
			// that as a rise; `null` is the same case here.
			// 指标的第一根没有可比的前值，引擎把它读作上涨；这里的 `null` 是同一种情形。
			return previous === null || value > previous ? theme.trendUp : theme.trendDown;
		default:
			return theme.trendUp;
	}
}

/** The points a track holds: a line keeps them in `data`, a histogram in `perBarColors`. 一条轨迹持有的点：折线在 `data`，柱状在 `perBarColors`。 */
function pointsOf(track: IndicatorTrack): IndicatorPoint[] {
	return (track.perBarColors ?? track.data) as IndicatorPoint[];
}

/** One plotted point: a line's value, or a histogram bar carrying its own colour. 一个绘制点：折线的取值，或带自身颜色的柱子。 */
export interface IndicatorPoint {
	time: Time;
	value: number;
	color?: string;
}

/** The point a figure reports at `index`, or the shape of it — one place, so every path plots the same objects. 某条 figure 在 `index` 处的点；只有这一处决定它的形状，因此每条路径画出的都是同样的对象。 */
function pointFor(
	figure: IndicatorFigure,
	value: number,
	index: number,
	time: Time,
	bars: readonly IndicatorBar[],
	theme: ChartTheme,
): IndicatorPoint {
	if (figure.kind === "line") return { time, value };
	return {
		time,
		value,
		color: barColor(
			theme,
			figure.barColouring,
			bars[index],
			figure.values[index - 1] ?? null,
			value,
		),
	};
}

/** A track carrying a figure's identity and no points yet. 一条带着 figure 身份、尚无点位的轨迹。 */
function emptyTrack(
	figure: IndicatorFigure,
	paneIndex: number,
	figureIndex: number,
	theme: ChartTheme,
): IndicatorTrack {
	const track: IndicatorTrack = {
		title: figure.title,
		paneIndex,
		kind: figure.kind,
		color: figure.kind === "line" ? paletteColor(theme, figureIndex) : theme.trendUp,
		lineWidth: 1,
		data: [],
	};
	if (figure.kind === "histogram") track.perBarColors = [];
	return track;
}

/**
 * Rewrite a track's points from a figure — the single place a figure becomes
 * plotted points. The one-shot build and the incremental layer both go through
 * here, so the two cannot drift into plotting different objects for the same
 * values.
 *
 * 用一条 figure 重写一条轨迹的点位 —— figure 变成绘制点只此一处。一次性构建与增量层都走
 * 这里，因此两者不会对同样的取值画出不同的对象。
 */
function fillTrack(
	track: IndicatorTrack,
	figure: IndicatorFigure,
	bars: readonly IndicatorBar[],
	times: readonly Time[],
	theme: ChartTheme,
): void {
	const points = pointsOf(track);
	points.length = 0;
	for (let i = 0; i < figure.values.length; i += 1) {
		const value = figure.values[i];
		if (value === null) continue;
		points.push(pointFor(figure, value, i, times[i], bars, theme));
	}
}

/** Turn one study's figures into tracks all sitting on `paneIndex`. 把某个指标的各 figure 转成全部落在 `paneIndex` 上的轨迹。 */
function tracksOf(
	name: TChartProIndicator,
	paneIndex: number,
	bars: readonly IndicatorBar[],
	times: readonly Time[],
	theme: ChartTheme,
): IndicatorTrack[] {
	return STUDIES[name](bars).map((figure, index) => {
		const track = emptyTrack(figure, paneIndex, index, theme);
		fillTrack(track, figure, bars, times, theme);
		return track;
	});
}

/**
 * Turn the requested indicator names into plotted tracks.
 * 把请求的指标名转换为可绘制的轨迹。
 *
 * Both lists take any name in the catalogue, exactly as `KChartPro` does — its
 * engine decides nothing about placement, so neither does this layer. What the
 * name lands in decides where it is drawn: `mainIndicators` go on the price pane,
 * each entry of `subIndicators` gets a pane of its own below it.
 *
 * 两个清单都接受目录里的任意名字，与 `KChartPro` 一致 —— 它的引擎不判断落点，本层同样
 * 不判断。落在哪个清单决定画在哪里：`mainIndicators` 画在价格主图，`subIndicators`
 * 的每一项在下方各占一个面板。
 */
export function buildIndicatorTracks(
	mainIndicators: readonly string[],
	subIndicators: readonly string[],
	data: TChartDataItem[],
	theme: ChartTheme,
): IndicatorTrack[] {
	const usable = usableItems(data);
	if (usable.length === 0) return [];
	const bars = usable.map(toBar);
	const times = usable.map(timeOf);
	const tracks: IndicatorTrack[] = [];

	for (const name of mainIndicators) {
		if (isKnownIndicator(name)) tracks.push(...tracksOf(name, 0, bars, times, theme));
	}

	let paneIndex = 1;
	for (const name of subIndicators) {
		if (!isKnownIndicator(name)) continue;
		tracks.push(...tracksOf(name, paneIndex, bars, times, theme));
		paneIndex += 1;
	}

	return tracks;
}

// --------------------------------------------------------------- the live path

/** What one series should be told after a single streamed candle. 一根实时 K 线之后应当告诉一条系列什么。 */
export interface IndicatorPush {
	/** The point to hand the series, or `null` when this track gained nothing. 要交给系列的点；该轨迹本根没有新增时为 `null`。 */
	point: IndicatorPoint | null;
	/**
	 * `true` when the track now holds this point and nothing else, so there is no
	 * earlier data for `update` to build on and the series needs `setData`.
	 * 该轨迹当前只有这一个点时为 `true`：没有更早的数据可供 `update` 依托，系列需要 `setData`。
	 */
	whole: boolean;
}

/** How the series catch up after one streamed candle. 一根实时 K 线之后，系列如何跟上。 */
export type IndicatorPlan =
	/** Hand every track over wholesale — the layer rebuilt. 整体交付 —— 指标层重建过。 */
	| { kind: "reset" }
	/** One push per track, in track order. 每条轨迹一项推送，按轨迹顺序。 */
	| { kind: "tail"; pushes: IndicatorPush[] };

/**
 * The indicator layer in its live form. A chart that streams candles draws the
 * same tracks `buildIndicatorTracks` prints, but reaches them one candle at a
 * time: it keeps the mapped dataset, the tracks and each study's newest value,
 * and a new candle writes one point per series instead of rebuilding every point
 * of every study.
 *
 * 实时形态的指标层。推送 K 线的图表画出的轨迹与 {@link buildIndicatorTracks} 打印的完全
 * 相同，只是逐根抵达：它持有映射后的数据集、轨迹与各指标的最新取值，来一根新 K 线时只为
 * 每条系列写一个点，而不是把每个指标的每个点重造一遍。
 *
 * What that removes is the part that was really O(N) per candle. Measured at
 * 30 000 bars with six indicators, a full build costs ~48 ms, of which only
 * ~13 ms is the studies' arithmetic: the other ~30 ms is turning 660k values into
 * 660k point objects, and the engine was then handed all of them again.
 *
 * 它去掉的正是真正构成「每根 O(N)」的那一部分。在 30000 根、六个指标的实测中，整算一次
 * 约 48 ms，其中只有约 13 ms 是指标本身的算术：另外约 30 ms 是把 66 万个取值变成 66 万个
 * 点对象，而这 66 万个点随后又被整体交回引擎一遍。
 *
 * The 27 studies still run over the whole dataset for the newest bar, because
 * every one of them is a causal filter — the value at the newest bar is a
 * function of the bars before it — and the recursive ones (`EMA`, `RSI`, `DMI`,
 * `SAR`) carry state that cannot be recovered from their own output arrays.
 *
 * 27 个指标仍会为最新一根在整份数据上跑一遍：它们都是因果滤波器 —— 最新一根的取值是此前
 * 各根的函数 —— 而其中的递推型（`EMA`、`RSI`、`DMI`、`SAR`）带着无法从自身输出还原的状态。
 */
export interface IndicatorLayer {
	/** The tracks, written through in place by every `advance`. 轨迹；每次 `advance` 就地写入。 */
	readonly tracks: IndicatorTrack[];
	/**
	 * Follow `data` from wherever the layer already got to. Idempotent for a given
	 * dataset: asked twice about the same reference, it answers the same plan.
	 *
	 * 从指标层当前所处的位置跟到 `data`。对同一份数据集是幂等的：同一个引用问两次，回答的
	 * 是同一份计划。
	 */
	advance(data: readonly TChartDataItem[]): IndicatorPlan;
}

/** One track of one study, plus where it sits in the layer. 某个指标的一条轨迹，以及它在层里的位置。 */
interface IndicatorSlot {
	name: TChartProIndicator;
	/** Which figure of the study this track draws. 这条轨迹画的是该指标的第几条 figure。 */
	figureIndex: number;
	track: IndicatorTrack;
	/**
	 * How many points the newest usable bar put into this track — `0` or `1`. The
	 * newest bar's point is always a track's last element, so replacing a bar is a
	 * `pop` and appending one is a `push`.
	 * 最新一根可用 K 线为该轨迹放入的点数，`0` 或 `1`。最新一根的点永远是轨迹的最后一个
	 * 元素，因此覆盖一根是 `pop`，追加一根是 `push`。
	 */
	tail: 0 | 1;
}

/** No bars at all — enough to read a study's figure titles and kinds off it. 一根 K 线都没有 —— 足以读出某条指标的 figure 名称与类型。 */
const NO_BARS: readonly IndicatorBar[] = [];

/**
 * Build an empty live layer; every dataset arrives through `advance`.
 * 建立一个空的实时指标层；每一份数据集都经由 `advance` 抵达。
 *
 * The indicator set and the theme are fixed for the layer's lifetime: changing
 * either one builds a new layer, which is why the tracks it hands out keep their
 * identity while candles stream in, and why a chart only has to rebuild its
 * series when the set itself changes.
 *
 * 指标集合与主题在指标层的一生中是固定的：改动其一即建立新的一层。因此随着 K 线流入，
 * 它交出的轨迹保持同一性；图表也只在集合本身变化时才需要重建系列。
 */
export function createIndicatorLayer(
	mainIndicators: readonly string[],
	subIndicators: readonly string[],
	theme: ChartTheme,
): IndicatorLayer {
	const slots: IndicatorSlot[] = [];
	const addStudy = (name: TChartProIndicator, paneIndex: number): void => {
		// A study's shape — how many figures, their titles, kinds and colours — does
		// not depend on the bars, so an empty dataset is enough to lay the tracks out.
		// 一条指标的形状（几条 figure、各自名称、类型与颜色）与 K 线无关，因此空数据集就够
		// 铺好轨迹了。
		STUDIES[name](NO_BARS).forEach((figure, figureIndex) => {
			slots.push({
				name,
				figureIndex,
				track: emptyTrack(figure, paneIndex, figureIndex, theme),
				tail: 0,
			});
		});
	};

	for (const name of mainIndicators) {
		if (isKnownIndicator(name)) addStudy(name, 0);
	}
	let paneIndex = 1;
	for (const name of subIndicators) {
		if (!isKnownIndicator(name)) continue;
		addStudy(name, paneIndex);
		paneIndex += 1;
	}

	const tracks: IndicatorTrack[] = [];
	let held: readonly TChartDataItem[] | null = null;
	/** The dataset as the studies read it. 指标眼中的数据集。 */
	let bars: IndicatorBar[] = [];
	let times: Time[] = [];
	/**
	 * How many usable items sit in the held dataset's prefix (everything but its
	 * own last item), and whether that last item itself was usable. Together they
	 * say what the prefix maps to, without re-mapping it.
	 * 已持有数据集中，前缀（除自身末项以外的全部）里可用项的个数，以及其末项本身是否可用。
	 * 两者合起来说明了前缀映射成了什么，无需重新映射。
	 */
	let prefixUsable = 0;
	let tailUsable = false;
	let plan: IndicatorPlan = { kind: "reset" };

	/**
	 * Study results for one pass over `bars`, computed once per name even when
	 * both lists ask for the same indicator. `buildIndicatorTracks` runs such a
	 * study twice in that case and so draws it twice; the arithmetic is the same
	 * both times, so sharing it changes the picture not at all.
	 *
	 * 一趟 `bars` 之上的指标结果，同一个名字只算一次 —— 即使两个清单都点了它。
	 * `buildIndicatorTracks` 在这种情况下会把同一条指标算两遍，于是画两遍；两遍的算术完全
	 * 相同，因此共用它不会改变画面。
	 */
	const studies = new Map<TChartProIndicator, IndicatorFigure[]>();
	const studyFor = (
		name: TChartProIndicator,
		over: readonly IndicatorBar[],
	): IndicatorFigure[] => {
		let figures = studies.get(name);
		if (!figures) {
			figures = STUDIES[name](over);
			studies.set(name, figures);
		}
		return figures;
	};
	/** Every pass reads the whole dataset for its own newest bar, so it starts on an empty map. 每一趟都为自己的最新一根读整份数据，因此从空表开始。 */
	const pass = <T>(work: () => T): T => {
		studies.clear();
		return work();
	};

	/** Rebuild from scratch — a new dataset, or one this layer cannot follow. 从零重建 —— 新数据集，或本层跟不下去的一份。 */
	const rebuild = (next: readonly TChartDataItem[]): void => {
		const usable = usableItems(next);
		bars = usable.map(toBar);
		times = usable.map(timeOf);
		tracks.length = 0;
		for (const slot of slots) slot.tail = 0;
		plan = { kind: "reset" };
		tailUsable = tailUsableOf(next);
		if (bars.length === 0) {
			// No bar to plot is no series at all, which is what the one-shot path
			// answers an empty dataset with too.
			// 没有可绘制的 K 线就没有系列 —— 一次性路径对空数据集也是这么回答的。
			prefixUsable = 0;
			return;
		}
		for (const slot of slots) tracks.push(slot.track);
		const newest = bars.length - 1;
		pass(() => {
			for (const slot of slots) {
				const figure = studyFor(slot.name, bars)[slot.figureIndex];
				fillTrack(slot.track, figure, bars, times, theme);
				slot.tail = figure.values[newest] === null ? 0 : 1;
			}
		});
		prefixUsable = bars.length - (tailUsable ? 1 : 0);
	};

	/**
	 * Write the newest bar's points, appending them to `pushes`. Every study runs
	 * over the whole dataset, because the newest bar is the one value none of them
	 * can be resumed to.
	 *
	 * 写出最新一根的点，并追加到 `pushes`。每个指标都在整份数据集上跑一遍，因为最新一根
	 * 正是它们都无法「续算」到的那一个取值。
	 */
	const writeBar = (pushes: IndicatorPush[]): void => {
		const newest = bars.length - 1;
		const time = times[newest];
		pass(() => {
			for (const slot of slots) {
				const figure = studyFor(slot.name, bars)[slot.figureIndex];
				const value = figure.values[newest];
				const point =
					value === null
						? null
						: pointFor(figure, value, newest, time, bars, theme);
				const points = pointsOf(slot.track);
				if (point) points.push(point);
				slot.tail = point === null ? 0 : 1;
				pushes.push({ point, whole: point !== null && points.length === 1 });
			}
		});
	};

	/**
	 * Follow `next` from `previous` if — and only if — the change is provably
	 * confined to the dataset's own tail. `mergeCandle` rebuilds only the dataset's
	 * last item and carries every element before it over by reference, so comparing
	 * the prefix by identity proves the prefix needs no new work: the studies are
	 * causal, so their values over an unchanged prefix are unchanged too. Anything
	 * else — another instrument, a bar sorted into the middle — is a different
	 * dataset and gets the full pass.
	 *
	 * 当且仅当变化确实只落在数据集自身的尾部时，才从 `previous` 跟到 `next`。
	 * `mergeCandle` 只重建数据集的末项，它之前的数组元素都是按引用带过来的，因此用「同一性」
	 * 比较前缀即可证明前缀无需重算：指标是因果的，取值在未变的前缀上也未变。其余情况 ——
	 * 换了标的、有 K 线被排序插进中间 —— 都是另一份数据集，整算。
	 *
	 * The tail may be longer than one item, and that is the ordinary case rather than
	 * an exotic one: a candle that arrives while the previous one is still being
	 * rendered joins it in the same React batch, so the dataset the layer is asked
	 * about can have grown by two or three. Each of those items is a bar of its own,
	 * and each one is written in turn so the series receives its points in time
	 * order — `update` can rewrite the newest bar or append past it, one call at a
	 * time.
	 *
	 * 尾部可以不止一项，而且这是常态而非特例：若一根 K 线抵达时上一根还在渲染，两者会并入
	 * 同一批 React 更新，于是交给指标层的数据集可能一次多了两三根。其中每一项都是独立的一
	 * 根 K 线，因此逐个写出，使系列按时间顺序收到各自的点 —— `update` 只能改写最新一根或
	 * 在它之后追加，一次一根。
	 */
	const follow = (
		previous: readonly TChartDataItem[],
		next: readonly TChartDataItem[],
	): boolean => {
		const grown = next.length - previous.length;
		if (grown < 0) return false;
		// An empty dataset has no prefix and no last item, so there is nothing for
		// the reasoning below to hold onto. This is the ordinary first candle of a
		// chart whose feed started empty, and it rebuilds like any other new dataset.
		// 空数据集既没有前缀也没有末项，下面的推断无从依托。这正是数据源自空启动时图表的
		// 第一根 K 线，与别的全新数据集一样走重建。
		if (previous.length === 0) return false;
		const lastIndex = previous.length - 1;
		for (let i = 0; i < lastIndex; i += 1) {
			if (next[i] !== previous[i]) return false;
		}
		// The bars `previous`'s prefix already maps to, less the one its own last item
		// contributed when that item carried a price.
		// `previous` 的前缀已经映射到的那些 K 线，若其末项带着价格则再减去它贡献的那一根。
		const prefixBars = bars.length - (tailUsable ? 1 : 0);
		if (prefixBars !== prefixUsable) return false;
		// Whether that last item is still the dataset's own. When it is, its bar needs
		// nothing at all — the tail is only what was appended past it. When it is not,
		// it was rewritten in place and its bar is written again in its place.
		// 该末项是否仍是数据集自己的那一项。是则它的 K 线完全无需改动 —— 尾部只剩追加在它
		// 之后的部分；否则它被就地改写，它的 K 线也随之重写。
		const lastItem = previous[lastIndex];
		const retains = next[lastIndex] === lastItem;
		const dropLast = tailUsable && !retains;
		// Where the series currently ends — read before the bar is dropped, because
		// dropping a bar from the corpus does not take its point off the series. A
		// rewritten bar therefore arrives at that same time and `update` overwrites
		// it, while an appended one must be strictly later than it.
		// 系列当前结束在哪里 —— 在丢掉那根 K 线之前读取，因为把 K 线从语料里去掉并不会把它
		// 的点从系列上拿掉。因此被改写的那一根时间与此相同、由 `update` 覆盖，而追加的那些
		// 必须严格晚于它。
		const endsOn = bars.length > 0 ? Number(times[bars.length - 1]) : null;
		if (dropLast) {
			bars.pop();
			times.pop();
			for (const slot of slots) {
				if (slot.tail === 1) pointsOf(slot.track).pop();
				slot.tail = 0;
			}
		}
		const tail: TChartDataItem[] = [];
		for (let i = retains ? lastIndex + 1 : lastIndex; i < next.length; i += 1) {
			if (isUsable(next[i])) tail.push(next[i]);
		}
		if (tail.length === 0) return false;
		const first = Number(tail[0].time);
		if (endsOn !== null && (dropLast ? first !== endsOn : !(first > endsOn))) return false;
		for (let i = 1; i < tail.length; i += 1) {
			if (!(Number(tail[i].time) > Number(tail[i - 1].time))) return false;
		}

		const pushes: IndicatorPush[] = [];
		for (const item of tail) {
			bars.push(toBar(item));
			times.push(timeOf(item));
			writeBar(pushes);
		}
		// The prefix of `next` is everything but its own last item, and `bars` is now
		// exactly that prefix plus the tail it maps to.
		// `next` 的前缀是除其自身末项以外的全部，而 `bars` 现在正是那个前缀加上它映射出的尾部。
		tailUsable = tailUsableOf(next);
		prefixUsable = bars.length - (tailUsable ? 1 : 0);
		plan = { kind: "tail", pushes };
		return true;
	};

	const advance = (next: readonly TChartDataItem[]): IndicatorPlan => {
		if (next === held) return plan;
		const previous = held;
		held = next;
		if (previous === null || !follow(previous, next)) rebuild(next);
		return plan;
	};

	return { tracks, advance };
}

/** Whether the dataset's own last item carries a usable price. 数据集自身的末项是否带着可用价格。 */
function tailUsableOf(data: readonly TChartDataItem[]): boolean {
	const last = data[data.length - 1];
	return last !== undefined && isUsable(last);
}