/**
 * Deterministic synthetic candles for the Pro performance comparison.
 *
 * Both engines are fed the *same* series, generated from a seeded PRNG, so a
 * difference in the numbers is a difference between the engines — not between
 * two market days. Nothing here touches the network: a benchmark that depends on
 * OKX would measure the venue, not the chart.
 *
 * 用于 Pro 性能对比的确定性合成 K 线。
 *
 * 两套引擎吃的是**同一份**序列，由带种子的 PRNG 生成，因此数字上的差异就是引擎之间的
 * 差异，而不是两个行情日的差异。这里不碰网络：依赖 OKX 的基准测到的是交易所，不是图表。
 */

/** One synthetic bar. `time` is the bar's open time in unix seconds. 一根合成 K 线；`time` 为该 K 线开盘的秒级 Unix 时间戳。 */
export interface PerfCandle {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

const DAY_SECONDS = 86_400;
/** The last bar's open time: 2025-09-25 UTC. 最后一根 K 线的开盘时间：2025-09-25 UTC。 */
const LAST_OPEN = Math.floor(Date.UTC(2025, 8, 25) / 1000);
/** Price at the first bar. 首根 K 线的价格。 */
const FIRST_PRICE = 60_000;

/** mulberry32: small, seedable, and stable across runs. mulberry32：小巧、可设种子、跨轮次稳定。 */
function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * `count` daily bars ending at {@link LAST_OPEN}. A random walk in log space with
 * a bounded wick, so highs and lows are always consistent with the body.
 *
 * `count` 根日线，最后一根收在 {@link LAST_OPEN}。对数空间的随机游走，影线有界，
 * 因此最高/最低始终与实体自洽。
 */
export function makeCandles(count: number, seed = 42): PerfCandle[] {
	const rand = mulberry32(seed);
	const start = LAST_OPEN - (count - 1) * DAY_SECONDS;
	const bars: PerfCandle[] = [];
	let previousClose = FIRST_PRICE;
	for (let index = 0; index < count; index += 1) {
		const open = previousClose;
		const close = Math.max(100, open * (1 + (rand() - 0.5) * 0.02));
		const high = Math.max(open, close) * (1 + rand() * 0.006);
		const low = Math.min(open, close) * (1 - rand() * 0.006);
		previousClose = close;
		bars.push({
			time: start + index * DAY_SECONDS,
			open: round2(open),
			high: round2(high),
			low: round2(low),
			close: round2(close),
			volume: Math.round(100 + rand() * 900),
		});
	}
	return bars;
}

/**
 * Bars to push through the live path: a continuation of `last`, appended at the
 * next day and stepping the same random walk forward.
 *
 * 推入实时通道的那些 K 线：`last` 的延续，接在次日并让同一条随机游走继续向前。
 */
export function continueCandles(last: PerfCandle, count: number, seed = 7): PerfCandle[] {
	const rand = mulberry32(seed);
	const bars: PerfCandle[] = [];
	let previousClose = last.close;
	for (let index = 0; index < count; index += 1) {
		const open = previousClose;
		const close = Math.max(100, open * (1 + (rand() - 0.5) * 0.02));
		const high = Math.max(open, close) * (1 + rand() * 0.006);
		const low = Math.min(open, close) * (1 - rand() * 0.006);
		previousClose = close;
		bars.push({
			time: last.time + (index + 1) * DAY_SECONDS,
			open: round2(open),
			high: round2(high),
			low: round2(low),
			close: round2(close),
			volume: Math.round(100 + rand() * 900),
		});
	}
	return bars;
}