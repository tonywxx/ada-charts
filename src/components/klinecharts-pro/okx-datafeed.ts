import type { KLineData } from "klinecharts";

/**
 * Poll cadence for the `subscribe` path; OKX REST stands in for a socket.
 * subscribe 的轮询节奏；用 OKX REST 代替 socket。
 */
const POLL_MS = 5_000;

import type {
	Datafeed,
	DatafeedSubscribeCallback,
	Period,
	SymbolInfo,
} from "@klinecharts/pro";
import {
	fetchOkxCandles,
	OKX_INST_ID,
	okxSnapshotCandles,
	type OkxCandle,
} from "../../okx";

/**
 * An OKX-backed {@link Datafeed}: history via REST, "real-time" via short-interval
 * polling of the same endpoint (no WebSocket credentials required), so the Pro
 * chart shows the live market just like `TChart` does.
 *
 * 一个基于 OKX 的 {@link Datafeed}：历史走 REST，"实时"通过对同一端点的短周期轮询实现
 * （无需 WebSocket 凭据），因此 Pro 图表展示的同样是实时行情，与 `TChart` 一致。
 */
export class OkxDatafeed implements Datafeed {
	private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
	private readonly instId: string;

	constructor(instId: string = OKX_INST_ID) {
		this.instId = instId;
	}

	async searchSymbols(search?: string): Promise<SymbolInfo[]> {
		if (!search) return INSTRUMENTS;
		const q = search.toLowerCase();
		return INSTRUMENTS.filter((s) =>
			[s.ticker, s.name, s.shortName].some((v) => v?.toLowerCase().includes(q)),
		);
	}

	async getHistoryKLineData(
		_symbol: SymbolInfo,
		period: Period,
	): Promise<KLineData[]> {
		const candles = await fetchBarsFor(this.instId, okxBarFor(period));
		return candles.map(toKLineData);
	}

	subscribe(
		_symbol: SymbolInfo,
		period: Period,
		callback: DatafeedSubscribeCallback,
	): void {
		const bar = okxBarFor(period);
		const key = `${this.instId}:${bar}`;
		if (this.timers.has(key)) return;
		const timer = setInterval(async () => {
			const bars = await fetchBarsFor(this.instId, bar);
			const last = bars[bars.length - 1];
			if (last) callback(toKLineData(last));
		}, POLL_MS);
		this.timers.set(key, timer);
	}

	unsubscribe(_symbol: SymbolInfo, period: Period): void {
		const key = `${this.instId}:${okxBarFor(period)}`;
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

/** In-flight dedupe so `getHistoryKLineData` + `subscribe` share one request. 进行中去重，使 `getHistoryKLineData` 与 `subscribe` 共用一次请求。 */
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

/**
 * klinecharts' `KLineData` carries an index signature the neutral Candle does not,
 * so the copy at the boundary is structural, not cosmetic.
 *
 * klinecharts 的 `KLineData` 带索引签名，而引擎无关的 Candle 没有；因此在边界处做一次
 * 浅拷贝是结构所需，不是装饰。
 */
function toKLineData(candle: OkxCandle): KLineData {
	return { ...candle };
}

async function fetchBar(instId: string, bar: string): Promise<OkxCandle[]> {
	try {
		return await fetchOkxCandles(instId, bar);
	} catch (error) {
		console.warn("[KChartPro] OKX unavailable, serving snapshot fallback.", error);
		return okxSnapshotCandles(bar);
	}
}
/**
 * Maps a KLineChartPro `Period` onto an OKX bar string (`1m`, `4H`, `1D`, …).
 * 把 KLineChartPro 的 `Period` 映射为 OKX 的 bar 字符串（`1m`、`4H`、`1D` 等）。
 */
export function okxBarFor(period: Period): string {
	const unit: Record<Period["timespan"], string> = {
		second: "s",
		minute: "m",
		hour: "H",
		day: "D",
		week: "W",
		month: "M",
		year: "Y",
	};
	const suffix = unit[period.timespan] ?? "m";
	return `${period.multiplier || 1}${suffix}`;
}

/**
 * The instrument list `searchSymbols` matches against.
 * `searchSymbols` 匹配的标的清单。
 */
const INSTRUMENTS: SymbolInfo[] = [
	{ ticker: "BTC-USDT", name: "Bitcoin / Tether", shortName: "BTC", exchange: "OKX", priceCurrency: "USDT", type: "spot" },
	{ ticker: "ETH-USDT", name: "Ethereum / Tether", shortName: "ETH", exchange: "OKX", priceCurrency: "USDT", type: "spot" },
	{ ticker: "SOL-USDT", name: "Solana / Tether", shortName: "SOL", exchange: "OKX", priceCurrency: "USDT", type: "spot" },
];
