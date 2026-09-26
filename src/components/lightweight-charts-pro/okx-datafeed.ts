import {
	fetchOkxCandles,
	okxSnapshotCandles,
	OKX_INST_ID,
	type OkxCandle,
} from "../../okx";
import type {
	TChartProCandle,
	TChartProDatafeed,
	TChartProFeedCallback,
	TChartProSymbol,
} from "./t-chart-pro-options";

/**
 * Poll cadence for the `subscribe` path; OKX REST stands in for a socket.
 * subscribe 的轮询节奏；用 OKX REST 代替 socket。
 */
const POLL_MS = 5_000;

/**
 * The default {@link TChartProDatafeed}: history over OKX REST, the newest bar
 * refreshed on an interval, so `TChartPro` tracks the live market out of the box
 * exactly like `KChartPro` does.
 *
 * 默认的 {@link TChartProDatafeed}：历史走 OKX REST，最新一根按间隔刷新，因此
 * `TChartPro` 开箱即用地跟随实时行情，与 `KChartPro` 一致。
 *
 * `lightweight-charts` wants unix *seconds* on the time axis while the shared OKX
 * module speaks milliseconds, so the scale happens at this boundary.
 *
 * `lightweight-charts` 的时间轴要秒级的 Unix 时间戳，而共用的 OKX 模块说的是毫秒，
 * 因此换算发生在这个边界上。
 */
export class OkxTChartDatafeed implements TChartProDatafeed {
	private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
	private readonly instIds = new Set<string>([OKX_INST_ID, "ETH-USDT", "SOL-USDT"]);

	constructor(instId: string = OKX_INST_ID) {
		// The instrument the feed was built around is the one `searchSymbols` must
		// be able to offer, even if it is not one of the bundled venues'.
		// 数据源是为哪个标的建的，`searchSymbols` 就必须能提供它 —— 即便它不在内置
		// 的那几个标的里。
		this.instIds.add(instId);
	}

	async searchSymbols(search?: string): Promise<TChartProSymbol[]> {
		const known = [...this.instIds];
		if (!search) return known.map(symbolOf);
		const query = search.toLowerCase();
		return known
			.filter((ticker) => ticker.toLowerCase().includes(query))
			.map(symbolOf);
	}

	async getHistory(
		symbol: TChartProSymbol,
		barSize: string,
	): Promise<TChartProCandle[]> {
		const candles = await fetchBarsFor(symbol.ticker, barSize);
		return candles.map(toCandle);
	}

	subscribe(
		symbol: TChartProSymbol,
		barSize: string,
		onNext: TChartProFeedCallback,
	): void {
		const key = `${symbol.ticker}:${barSize}`;
		if (this.timers.has(key)) return;
		const timer = setInterval(async () => {
			const bars = await fetchBarsFor(symbol.ticker, barSize);
			const last = bars[bars.length - 1];
			if (last) onNext(toCandle(last));
		}, POLL_MS);
		this.timers.set(key, timer);
	}

	unsubscribe(symbol: TChartProSymbol, barSize: string): void {
		// Keyed by the same `ticker:barSize` pair `subscribe` registered under: a
		// symbol the toolbar switched to would otherwise leave its poll running.
		// 与 `subscribe` 注册时用的是同一个 `ticker:barSize`：否则工具栏切换过去的标的
		// 会把它的轮询留在后台。
		const key = `${symbol.ticker}:${barSize}`;
		const timer = this.timers.get(key);
		if (timer) {
			clearInterval(timer);
			this.timers.delete(key);
		}
	}

	/** Stop every poll; called when the React component unmounts. React 组件卸载时调用，停掉所有轮询。 */
	dispose(): void {
		for (const timer of this.timers.values()) clearInterval(timer);
		this.timers.clear();
	}
}

/** In-flight dedupe so `getHistory` + `subscribe` share one request. 进行中去重，使 `getHistory` 与 `subscribe` 共用一次请求。 */
const barCache = new Map<string, Promise<OkxCandle[]>>();
function fetchBarsFor(instId: string, bar: string): Promise<OkxCandle[]> {
	const key = `${instId}:${bar}`;
	const cached = barCache.get(key);
	if (cached) return cached;
	const pending = fetchBar(instId, bar);
	barCache.set(key, pending);
	void pending.catch(() => barCache.delete(key));
	return pending;
}

async function fetchBar(instId: string, bar: string): Promise<OkxCandle[]> {
	try {
		return await fetchOkxCandles(instId, bar);
	} catch (error) {
		console.warn("[TChartPro] OKX unavailable, serving snapshot fallback.", error);
		return okxSnapshotCandles(bar);
	}
}

function toCandle(candle: OkxCandle): TChartProCandle {
	return {
		time: Math.round(candle.timestamp / 1000),
		open: candle.open,
		high: candle.high,
		low: candle.low,
		close: candle.close,
		volume: candle.volume,
	};
}

function symbolOf(ticker: string): TChartProSymbol {
	const [base, quote] = ticker.split("-");
	return {
		ticker,
		name: ticker,
		shortName: base,
		exchange: "OKX",
		priceCurrency: quote,
	};
}
