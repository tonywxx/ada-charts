import { describe, expect, it } from "vitest";
import { LIGHT_THEME } from "../../theme";
import type { TChartDataItem } from "../lightweight-charts/TChart";
import { TCHARTPRO_INDICATORS } from "./t-chart-pro-options";
import {
	bollinger,
	buildIndicatorTracks,
	createIndicatorLayer,
	ema,
	isKnownIndicator,
	macd,
	rsi,
	sma,
	type IndicatorLayer,
	type IndicatorPlan,
} from "./t-chart-pro-indicators";

/**
 * The studies the Pro toolbar offers are computed here rather than taken from an
 * engine, so their arithmetic is worth pinning down: a wrong MA is a wrong chart,
 * and nothing else in the stack would notice.
 *
 * Pro 工具栏提供的指标是在这里算出来的，而不是由引擎代劳，因此它们的算法值得钉住：
 * MA 算错就是图表画错，而栈里别处不会察觉。
 */

const series = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** A long enough rise that every window in the catalogue fills. 足够长的一段上涨，使目录里每个窗口都能填满。 */
const rising = Array.from({ length: 160 }, (_, index) => 100 + index);

/**
 * A series that bends instead of climbing in a line. A perfectly straight rise
 * leaves MACD's line exactly on its signal, so the bars would all be flat and
 * there would be no sign to colour by.
 *
 * 一段会拐弯而非笔直上涨的行情。完全笔直的上涨会让 MACD 的快线正好落在信号线上，
 * 柱子全为平，也就没有符号可着色。
 */
const wave = Array.from({ length: 120 }, (_, index) => 100 + Math.sin(index / 4) * 10);

const candles = (values: number[]): TChartDataItem[] =>
	values.map((value, index) => ({
		time: 1_700_000_000 + index * 86_400,
		open: value,
		high: value + 1,
		low: value - 1,
		close: value,
		volume: value * 10,
	}));

describe("sma", () => {
	it("leaves the window short of full empty", () => {
		expect(sma(series, 3).slice(0, 2)).toEqual([null, null]);
	});

	it("averages the trailing window", () => {
		expect(sma(series, 3)[2]).toBeCloseTo(2);
		expect(sma(series, 3)[9]).toBeCloseTo(9);
	});
});

describe("ema", () => {
	it("seeds with the mean of the first window", () => {
		const out = ema(series, 3);
		expect(out[1]).toBeNull();
		expect(out[2]).toBeCloseTo(2);
	});

	it("weights the newest value above the oldest", () => {
		const out = ema(series, 3);
		expect((out[9] as number) / 10).toBeGreaterThan((out[3] as number) / 4);
	});
});

describe("bollinger", () => {
	it("keeps the bands ordered around the mean", () => {
		const { middle, upper, lower } = bollinger(series, 5, 2);
		const at = 7;
		expect(upper[at]).toBeGreaterThan(middle[at] as number);
		expect(lower[at]).toBeLessThan(middle[at] as number);
		expect(middle[at]).toBeCloseTo(sma(series, 5)[at] as number);
	});

	it("closes the bands when the series is flat", () => {
		const flat = new Array(10).fill(5);
		const { upper, lower } = bollinger(flat, 5, 2);
		expect(upper[6]).toBeCloseTo(5);
		expect(lower[6]).toBeCloseTo(5);
	});
});

describe("macd", () => {
	it("reports a line, its signal, and twice their distance", () => {
		const { dif, dea, hist } = macd(series, 3, 5, 3);
		const last = dif.length - 1;
		expect(dif[last]).not.toBeNull();
		expect(dea[last]).not.toBeNull();
		expect(hist[last]).toBeCloseTo(
			((dif[last] as number) - (dea[last] as number)) * 2,
		);
	});
});

describe("rsi", () => {
	it("stays inside its own range", () => {
		const out = rsi(series, 5).filter((v): v is number => v !== null);
		expect(out.length).toBeGreaterThan(0);
		for (const value of out) {
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThanOrEqual(100);
		}
	});

	it("reads an uninterrupted climb as overbought", () => {
		expect(rsi(series, 5)[9]).toBe(100);
	});

	it("reads a fall to zero as oversold", () => {
		expect(rsi([10, 9, 8, 7, 6, 5, 4, 3, 2, 1], 5)[9]).toBe(0);
	});
});

describe("buildIndicatorTracks", () => {
	it("plots MA as one line per period on the main pane", () => {
		const tracks = buildIndicatorTracks(["MA"], [], candles(series), LIGHT_THEME);
		expect(tracks.map((track) => track.title)).toEqual([
			"MA5",
			"MA10",
			"MA30",
			"MA60",
		]);
		for (const track of tracks) {
			expect(track.paneIndex).toBe(0);
			expect(track.kind).toBe("line");
		}
	});

	it("stacks one pane per sub indicator", () => {
		const tracks = buildIndicatorTracks(
			[],
			["VOL", "MACD"],
			candles(series),
			LIGHT_THEME,
		);
		const panes = new Set(tracks.map((track) => track.paneIndex));
		expect([...panes]).toEqual([1, 2]);
		expect(
			tracks.find((track) => track.title === "VOLUME")?.perBarColors,
		).toHaveLength(series.length);
	});

	it("plots a study wherever it is asked for", () => {
		// Placement is the caller's call, exactly as it is in `KChartPro`: both
		// lists take any name in the catalogue.
		// 落点由调用方决定，与 `KChartPro` 一致：两个清单都接受目录里的任意名字。
		const tracks = buildIndicatorTracks(["RSI"], ["MA"], candles(series), LIGHT_THEME);
		expect(tracks.filter((track) => track.paneIndex === 0)).toHaveLength(3);
		expect(tracks.filter((track) => track.paneIndex === 1)).toHaveLength(4);
	});

	it("draws the same study twice when both lists ask for it", () => {
		const tracks = buildIndicatorTracks(["MA"], ["MA"], candles(series), LIGHT_THEME);
		expect(tracks).toHaveLength(8);
	});

	it("skips a name it does not know", () => {
		expect(buildIndicatorTracks(["NOPE"], ["MAYBE"], candles(series), LIGHT_THEME)).toEqual(
			[],
		);
	});

	it("returns nothing without data", () => {
		expect(buildIndicatorTracks(["MA"], ["VOL"], [], LIGHT_THEME)).toEqual([]);
	});
});

describe("the catalogue", () => {
	it("plots every name it lists, with no non-finite point", () => {
		// The catalogue is a transcription of another engine's, so the thing worth
		// pinning is that each entry is actually wired up and produces numbers a
		// chart can plot.
		// 目录是从另一个引擎抄过来的，因此值得钉住的是每一项都真的接上了线，并且产出的
		// 都是图表画得出来的数。
		for (const name of TCHARTPRO_INDICATORS) {
			const tracks = buildIndicatorTracks([name], [], candles(rising), LIGHT_THEME);
			expect(tracks.length, name).toBeGreaterThan(0);
			for (const track of tracks) {
				const points = track.perBarColors ?? track.data;
				expect(points.length, `${name} ${track.title}`).toBeGreaterThan(0);
				for (const point of points) {
					expect(Number.isFinite(point.value), `${name} ${track.title}`).toBe(
						true,
					);
				}
			}
		}
	});

	it("knows its own names and nothing else", () => {
		expect(TCHARTPRO_INDICATORS).toHaveLength(27);
		expect(isKnownIndicator("WR")).toBe(true);
		expect(isKnownIndicator("MACD")).toBe(true);
		expect(isKnownIndicator("MAYBE")).toBe(false);
	});
});

describe("the studies transcribed from the engine", () => {
	it("reads BIAS as the close's distance from its own average", () => {
		// Six closes ending at 10 average 7.5, so the close sits 33⅓% above it.
		// 以 10 结尾的六个收盘价均值为 7.5，因此收盘价高出它 33⅓%。
		const tracks = buildIndicatorTracks(["BIAS"], [], candles(series), LIGHT_THEME);
		const last = tracks[0].data.at(-1);
		expect(tracks[0].title).toBe("BIAS6");
		expect(last?.value).toBeCloseTo(((10 - 7.5) / 7.5) * 100);
	});

	it("adds volume on up bars and subtracts it on down bars", () => {
		// An unbroken climb from 1 to 10 adds the sizes 20…100 and never subtracts.
		// 从 1 涨到 10 的过程中只累加 20…100，从不扣减。
		const tracks = buildIndicatorTracks([], ["OBV"], candles(series), LIGHT_THEME);
		expect(tracks[0].title).toBe("OBV");
		expect(tracks[0].data.at(-1)?.value).toBeCloseTo(540);
	});

	it("places WR inside a window's high-low range", () => {
		// The last six bars span 5…10, so their high is 11 and their low 4.
		// 最后六根覆盖 5…10，因此最高 11、最低 4。
		const tracks = buildIndicatorTracks([], ["WR"], candles(series), LIGHT_THEME);
		expect(tracks[0].title).toBe("WR1");
		expect(tracks[0].data.at(-1)?.value).toBeCloseTo((-1 / 7) * 100);
	});

	it("colours MACD bars by their own sign", () => {
		const tracks = buildIndicatorTracks([], ["MACD"], candles(wave), LIGHT_THEME);
		const bars = tracks.find((track) => track.title === "MACD")?.perBarColors ?? [];
		expect(bars.length).toBeGreaterThan(0);
		// A series that turns has bars on both sides of zero, so neither colour
		// branch can be vacuous here.
		// 会拐弯的行情在零轴两侧都有柱子，因此这里没有哪个颜色分支是空跑的。
		expect(bars.some((bar) => bar.value > 0)).toBe(true);
		expect(bars.some((bar) => bar.value < 0)).toBe(true);
		for (const bar of bars) {
			const expected =
				bar.value > 0
					? LIGHT_THEME.trendUp
					: bar.value < 0
						? LIGHT_THEME.trendDown
						: LIGHT_THEME.noChange;
			expect(bar.color).toBe(expected);
		}
	});

	it("colours volume by the bar's own candle", () => {
		// The fixture opens and closes on the same price, which is the engine's
		// "unchanged" case rather than a rise or a fall.
		// 夹具的开盘与收盘同价，属于引擎的「不变」情形，既非上涨也非下跌。
		const tracks = buildIndicatorTracks([], ["VOL"], candles(rising), LIGHT_THEME);
		const bars = tracks.find((track) => track.title === "VOLUME")?.perBarColors ?? [];
		expect(bars).toHaveLength(rising.length);
		for (const bar of bars) {
			expect(bar.color).toBe(LIGHT_THEME.noChange);
		}
	});
});

/**
 * The live layer has to print exactly what the one-shot build prints — either way
 * it is the same chart — but reach it one candle at a time. These tests stream the
 * two shapes a real feed produces (a newest candle that keeps being rewritten, and
 * the next one appended past it) over every study in the catalogue, then compare
 * the result against the one-shot path.
 *
 * 实时层打印出的必须与一次性构建完全相同 —— 两边本就是同一张图 —— 只是逐根抵达。下面的
 * 测试把数据源的两种真实形态（不断被改写的最新一根，以及在它之后追加的下一根）在目录里
 * 每个指标上流一遍，再与一次性路径比对。
 */
describe("createIndicatorLayer", () => {
	/** Every study in the catalogue on the price pane, plus two of them again in panes of their own. 目录里每个指标都放在价格主图，另有两个各占一个副面板。 */
	const names = [...TCHARTPRO_INDICATORS];
	const subs = ["VOL", "MACD"];

	/**
	 * A dataset whose bars sit on a real time grid, so a stream can both rewrite
	 * the newest bar and append one after it. `from` is the index the first bar
	 * counts from, which keeps an appended slice on the same grid.
	 *
	 * 一帧落在真实时间网格上的数据集，因此数据流既能改写最新一根、也能在它之后追加。`from`
	 * 是首根的起始序号，使追加的切片与网格对齐。
	 */
	const barsFrom = (values: readonly number[], from: number): TChartDataItem[] =>
		values.map((value, index) => ({
			time: 1_700_000_000 + (from + index) * 86_400,
			open: value,
			high: value + 1,
			low: value - 1,
			close: value,
			volume: value * 10,
		}));

	/** Rewrite the newest bar in place, the way a feed's own candle keeps ticking. 就地改写最新一根 —— 数据源自己那根 K 线持续跳动的方式。 */
	const tick = (data: TChartDataItem[], close: number): TChartDataItem[] => {
		const last = data[data.length - 1];
		return [...data.slice(0, -1), { ...last, close, high: close + 1, low: close - 1 }];
	};

	/** A layer holding every study in the catalogue, already brought up to `data`. 持有目录里每个指标、且已跟到 `data` 的指标层。 */
	const layerOver = (data: readonly TChartDataItem[], extra: string[] = []): IndicatorLayer => {
		const layer = createIndicatorLayer(names, extra, LIGHT_THEME);
		layer.advance(data);
		return layer;
	};

	/** The pushes of a tail plan, proving the layer followed rather than rebuilt. 尾部计划的推送；顺带证明指标层是跟随而非重建。 */
	const pushesOf = (plan: IndicatorPlan) => {
		if (plan.kind !== "tail") throw new Error("the layer rebuilt instead of following");
		return plan.pushes;
	};

	it("prints what the one-shot build prints after a stream of rewrites and appends", () => {
		let data = barsFrom(wave.slice(0, 5), 0);
		const layer = layerOver(data, subs);
		const tracks = layer.tracks;
		const titles = tracks.map((track) => track.title);
		expect(titles.length).toBeGreaterThan(0);

		for (let i = 5; i < wave.length; i += 1) {
			// A feed's own candle ticks twice, both ways, before the next one opens.
			// 数据源自己那根 K 线在新的一根开出前上下跳动两次。
			data = tick(data, wave[i - 1] + 0.5);
			expect(pushesOf(layer.advance(data))).toHaveLength(titles.length);
			data = tick(data, wave[i - 1] - 0.5);
			layer.advance(data);
			// Then the next candle closes and is appended past it.
			// 随后下一根收盘，被追加到它之后。
			data = [...data, ...barsFrom(wave.slice(i, i + 1), i)];
			expect(pushesOf(layer.advance(data))).toHaveLength(titles.length);
		}

		// The series are keyed off these arrays, so they must not be swapped out
		// mid-stream — only their points may change.
		// 系列以这些数组为键，因此不能在流中途被换掉 —— 只能改其中的点。
		expect(layer.tracks).toBe(tracks);
		expect(layer.tracks.map((track) => track.title)).toEqual(titles);
		expect(layer.tracks).toEqual(buildIndicatorTracks(names, subs, data, LIGHT_THEME));
	});

	it("follows a batch that carries more than one new bar", () => {
		// A render that outlasts a frame swallows the candles arriving while it runs,
		// so React hands the layer a dataset that grew by two or three at once
		// instead of by one. Every one of those bars is a bar of its own and needs
		// its own point on every series.
		//
		// 超出单帧时长的渲染会吞掉它运行期间抵达的 K 线，于是 React 一次交给指标层的数据集
		// 多了两三根而非一根。其中每一根都是独立的一根，都要在每条系列上各得一个点。
		let data = barsFrom(wave.slice(0, 5), 0);
		const layer = layerOver(data, subs);
		let next = 5;

		for (let round = 0; round < 12; round += 1) {
			const batch = (round % 3) + 1;
			// The newest bar keeps ticking, then `batch` more candles close past it.
			// 最新一根持续跳动，随后又有 `batch` 根在它之后收盘。
			data = tick(data, wave[next - 1] + 0.5);
			// The rewritten bar is one bar, so one point per series.
			// 被改写的那一根就是一根，因此每条系列一个点。
			expect(pushesOf(layer.advance(data))).toHaveLength(layer.tracks.length);
			data = [...data, ...barsFrom(wave.slice(next, next + batch), next)];
			next += batch;

			const pushes = pushesOf(layer.advance(data));
			// Every appended bar is a bar of its own, one point per series each.
			// 追加的每一根都是独立的一根，每根在每条系列上一个点。
			expect(pushes).toHaveLength(layer.tracks.length * batch);
			expect(layer.tracks).toEqual(buildIndicatorTracks(names, subs, data, LIGHT_THEME));
		}
	});

	it("rebuilds when a different dataset arrives on the same time grid", () => {
		// Same length, same times, doubled prices: comparing lengths and bounds
		// alone would be fooled here, which is why the layer compares by identity.
		// 同样的长度、同样的时间、翻倍的价格：只比长度与边界会被骗过，所以指标层改用同一性比较。
		const values = wave.slice(0, 40);
		const layer = layerOver(barsFrom(values, 0));
		const replaced = barsFrom(values.map((value) => value * 2), 0);
		expect(layer.advance(replaced).kind).toBe("reset");
		expect(layer.tracks).toEqual(buildIndicatorTracks(names, [], replaced, LIGHT_THEME));
	});

	it("rebuilds when the dataset loses its newest bars", () => {
		const data = barsFrom(wave.slice(0, 40), 0);
		const layer = layerOver(data);
		const shorter = data.slice(0, 30);
		expect(layer.advance(shorter).kind).toBe("reset");
		expect(layer.tracks).toEqual(buildIndicatorTracks(names, [], shorter, LIGHT_THEME));
	});

	it("starts empty and rebuilds on the first candle", () => {
		// A chart whose feed starts empty mounts with no data at all, and its first
		// candle arrives as a whole dataset. There is nothing to follow from.
		// 数据源自空启动的图表挂载时没有任何数据，它的第一根 K 线是整份数据集抵达的，无从跟起。
		const layer = createIndicatorLayer(names, subs, LIGHT_THEME);
		expect(layer.tracks).toEqual([]);
		const data = barsFrom(wave.slice(0, 5), 0);
		expect(layer.advance(data).kind).toBe("reset");
		expect(layer.tracks).toEqual(buildIndicatorTracks(names, subs, data, LIGHT_THEME));
	});

	it("answers the same plan twice for the same dataset", () => {
		// React asks once while rendering and once from the effect; the second call
		// must not do the work again.
		// React 在渲染时问一次、在 effect 里再问一次；第二次不应重做一遍。
		const data = barsFrom(wave.slice(0, 20), 0);
		const layer = layerOver(data);
		const first = layer.advance(data);
		expect(layer.advance(data)).toBe(first);
	});

	it("flags a series whose only point is the newest one", () => {
		// A chart that starts on a single bar has one point per series and no
		// earlier data for `update` to build on, so the plan has to say so.
		// 从单根 K 线起步的图表每条系列只有一个点，没有更早的数据可供 `update` 依托，计划必须说明。
		const data = barsFrom([100], 0);
		const layer = layerOver(data);
		const pushes = pushesOf(layer.advance(tick(data, 101)));
		for (const [index, push] of pushes.entries()) {
			const track = layer.tracks[index];
			const points = track.perBarColors ?? track.data;
			expect(push.whole, track.title).toBe(push.point !== null && points.length === 1);
		}
		expect(pushes.some((push) => push.whole)).toBe(true);
		expect(layer.tracks).toEqual(buildIndicatorTracks(names, [], tick(data, 101), LIGHT_THEME));
	});
});
