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
	return data.filter((item) => Number.isFinite(priceOf(item)));
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

/** Turn one study's figures into tracks all sitting on `paneIndex`. 把某个指标的各 figure 转成全部落在 `paneIndex` 上的轨迹。 */
function tracksOf(
	name: TChartProIndicator,
	paneIndex: number,
	bars: readonly IndicatorBar[],
	times: readonly Time[],
	theme: ChartTheme,
): IndicatorTrack[] {
	return STUDIES[name](bars).map((figure, index) => {
		const points = figure.values;
		if (figure.kind === "line") {
			return {
				title: figure.title,
				paneIndex,
				kind: "line" as const,
				color: paletteColor(theme, index),
				lineWidth: 1 as const,
				data: points
					.map((value, i) =>
						value === null ? null : { time: times[i], value },
					)
					.filter(
						(point): point is { time: Time; value: number } => point !== null,
					),
			};
		}
		const colored: { time: Time; value: number; color: string }[] = [];
		points.forEach((value, i) => {
			if (value === null) return;
			colored.push({
				time: times[i],
				value,
				color: barColor(theme, figure.barColouring, bars[i], points[i - 1] ?? null, value),
			});
		});
		return {
			title: figure.title,
			paneIndex,
			kind: "histogram" as const,
			color: theme.trendUp,
			lineWidth: 1 as const,
			data: [],
			perBarColors: colored,
		};
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