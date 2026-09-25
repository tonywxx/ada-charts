import type { KLineData } from "klinecharts";
import type {
	Datafeed,
	DatafeedSubscribeCallback,
	Period,
	SymbolInfo,
} from "@klinecharts/pro";
import snapshot from "../lightweight-charts/__data__/btc-usdt.json";

/** Every KLineChartPro default lives here so docs, args and runtime agree. KChartPro 的全部默认值集中于此，使文档、args 与运行时保持一致。 */
export const KCHARTPRO_DEFAULTS = {
	width: 900,
	height: 520,
	autoSize: true,
	theme: "light",
	locale: "en-US",
	timezone: "UTC",
	drawingBarVisible: true,
	ticker: "BTC-USDT",
	pricePrecision: 1,
	volumePrecision: 2,
	mainIndicators: ["MA"],
	subIndicators: ["VOL"],
} as const;

/**
 * Resolved KChartPro props: the public props with every default filled in.
 * 已解析的 KChartPro props：填充所有默认值后的对外属性。
 */
export interface KChartProResolvedProps {
	width?: number;
	height?: number;
	autoSize: boolean;
	theme: "light" | "dark";
	locale: string;
	timezone: string;
	watermark?: string;
	drawingBarVisible: boolean;
	symbol: SymbolInfo;
	period: Period;
	periods?: Period[];
	mainIndicators: string[];
	subIndicators: string[];
}

/**
 * Shallow `memo` comparator for `KChartPro`; object props compare by identity so
 * `datafeed`/`symbol` swaps are detected but stable references are cheap.
 *
 * `KChartPro` 的浅层 `memo` 比较器；对象属性按引用比较，因此 `datafeed`/`symbol` 的替换
 * 能被检出，而稳定引用的开销很低。
 */
export function areKChartProPropsEqual(
	previous: Record<string, unknown>,
	next: Record<string, unknown>,
): boolean {
	const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
	for (const key of keys) {
		if (previous[key] !== next[key]) return false;
	}
	return true;
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

const OKX_PATH = "https://www.okx.com/api/v5/market/candles";
const REQUEST_TIMEOUT_MS = 8_000;
/** Poll cadence for the `subscribe` path; OKX REST stands in for a socket. subscribe 的轮询节奏；用 OKX REST 代替 socket。 */
const POLL_MS = 5_000;

/** Convert the committed seconds-based snapshot into ms {@link KLineData}. 把提交的秒级快照转为毫秒 {@link KLineData}。 */
function snapshotBars(bar: string): KLineData[] {
	const key = bar === "1D" || bar === "4H" || bar === "1m" ? bar : "1D";
	const rows =
		(snapshot.bars as Record<string, Array<Record<string, number>>>)[key] ?? [];
	return rows.map((row) => ({
		timestamp: Math.trunc(row.time) * 1000,
		open: row.open,
		high: row.high,
		low: row.low,
		close: row.close,
		volume: row.volume,
	}));
}

/** The instrument list `searchSymbols` matches against. `searchSymbols` 匹配的标的清单。 */
const INSTRUMENTS: SymbolInfo[] = [
	{ ticker: "BTC-USDT", name: "Bitcoin / Tether", shortName: "BTC", exchange: "OKX", priceCurrency: "USDT", type: "spot" },
	{ ticker: "ETH-USDT", name: "Ethereum / Tether", shortName: "ETH", exchange: "OKX", priceCurrency: "USDT", type: "spot" },
	{ ticker: "SOL-USDT", name: "Solana / Tether", shortName: "SOL", exchange: "OKX", priceCurrency: "USDT", type: "spot" },
];

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

	constructor(instId: string = "BTC-USDT") {
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
		return fetchBarsFor(this.instId, okxBarFor(period));
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
			if (last) callback(last);
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
const barCache = new Map<string, Promise<KLineData[]>>();
function fetchBarsFor(instId: string, bar: string): Promise<KLineData[]> {
	const key = `${instId}:${bar}`;
	const cached = barCache.get(key);
	if (cached) return cached;
	const pending = fetchBar(instId, bar);
	barCache.set(key, pending);
	void pending.catch(() => barCache.delete(key));
	return pending;
}

async function fetchBar(instId: string, bar: string): Promise<KLineData[]> {
	const url = `${OKX_PATH}?instId=${instId}&bar=${bar}&limit=300`;
	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			headers: { Accept: "application/json" },
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const payload = (await response.json()) as { code: string; data?: string[][] };
		if (payload.code !== "0" || !payload.data?.length) {
			throw new Error(`OKX code ${payload.code}`);
		}
		return payload.data
			.map((row) => {
				const [time, open, high, low, close, volume, turnover] = row;
				return {
					timestamp: Number(time),
					open: Number(open),
					high: Number(high),
					low: Number(low),
					close: Number(close),
					volume: Number(volume),
					turnover: Number(turnover),
				} satisfies KLineData;
			})
			.sort((a, b) => a.timestamp - b.timestamp);
	} catch (error) {
		console.warn("[KChartPro] OKX unavailable, serving snapshot fallback.", error);
		return snapshotBars(bar);
	}
}

/**
 * Default period presets shown in the toolbar, spanning the sizes the stories
 * exercise (1m / 4H / D).
 * 工具栏默认展示的周期预设，覆盖 story 使用的粒度（1m / 4H / D）。
 */
export const KCHARTPRO_DEFAULT_PERIODS: Period[] = [
	{ multiplier: 1, timespan: "minute", text: "1m" },
	{ multiplier: 15, timespan: "minute", text: "15m" },
	{ multiplier: 1, timespan: "hour", text: "1H" },
	{ multiplier: 4, timespan: "hour", text: "4H" },
	{ multiplier: 1, timespan: "day", text: "1D" },
	{ multiplier: 1, timespan: "week", text: "1W" },
];
