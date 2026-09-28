/**
 * Offline feeds for the benchmark: each engine's own `Datafeed` contract backed
 * by the synthetic series, with the live subscription callback exposed so the
 * harness can drive streaming updates itself instead of waiting on a timer.
 *
 * 基准用的离线数据源：各自引擎的 `Datafeed` 契约，背后是合成序列；实时订阅回调被暴露
 * 出来，使测试台能自己驱动流式更新，而不是等定时器。
 */

import type {
	Datafeed,
	DatafeedSubscribeCallback,
	Period,
	SymbolInfo,
} from "@klinecharts/pro";
import type {
	DataLoader,
	DataLoaderGetBarsParams,
	DataLoaderSubscribeBarParams,
	DataLoaderUnsubscribeBarParams,
	KLineData,
	Period as V10Period,
	SymbolInfo as V10SymbolInfo,
} from "klinecharts";
import type {
	TChartProCandle,
	TChartProDatafeed,
	TChartProFeedCallback,
	TChartProSymbol,
} from "../src/components/lightweight-charts-pro/t-chart-pro-options";
import type { PerfCandle } from "./dataset";

/** A feed plus the hooks a benchmark needs to drive it. 数据源，外加基准驱动它所需的挂钩。 */
export interface FeedHandle<F> {
	feed: F;
	/** Resolves once history has been handed to the engine. 历史数据交给引擎后 resolve。 */
	historyDone: Promise<void>;
	/** Push one bar down the live path. 把一根 K 线推入实时通道。 */
	push: (candle: PerfCandle) => void;
	/** Whether the engine has subscribed yet. 引擎是否已经订阅。 */
	subscribed: () => boolean;
}

export const PERF_SYMBOL: SymbolInfo = {
	ticker: "PERF-USDT",
	name: "Perf / Tether",
	shortName: "PERF",
	exchange: "PERF",
	priceCurrency: "USDT",
	type: "spot",
	pricePrecision: 2,
	volumePrecision: 0,
};

export const PERF_PERIOD: Period = { multiplier: 1, timespan: "day", text: "1D" };

/**
 * One macrotask of latency, applied to **both** feeds so neither engine gets a
 * cheaper history path.
 *
 * It is not padding — it is what makes `KLineChartPro` measurable. That engine
 * gates its own loading spinner on the history promise, but an in-memory feed
 * resolves inside the same microtask batch that sets the state, so the spinner
 * is never committed to the DOM and the harness has nothing to observe. One
 * `setTimeout(0)` costs a millisecond or two and lets the pending state paint.
 *
 * 一个宏任务延迟，**两个**数据源都加，避免任一引擎拿到更便宜的历史路径。
 *
 * 这不是凑数 —— 它是让 `KLineChartPro` 可测的前提。该引擎用历史 Promise 控制自带的
 * loading 指示器，但内存数据源会在设置状态的同一批微任务里 resolve，指示器根本没机会
 * 提交到 DOM，测试台也就无从观察。一个 `setTimeout(0)` 只花一两毫秒，却能让 pending
 * 状态真正画出来。
 */
function ioLatency(): Promise<void> {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
}

const tChartSymbol: TChartProSymbol = {
	ticker: PERF_SYMBOL.ticker,
	name: PERF_SYMBOL.name,
	shortName: PERF_SYMBOL.shortName,
	exchange: PERF_SYMBOL.exchange,
	priceCurrency: PERF_SYMBOL.priceCurrency,
	pricePrecision: 2,
	volumePrecision: 0,
};

function toTChartCandle(candle: PerfCandle): TChartProCandle {
	return {
		time: candle.time,
		open: candle.open,
		high: candle.high,
		low: candle.low,
		close: candle.close,
		volume: candle.volume,
	};
}

/** klinecharts speaks milliseconds where the generator speaks seconds. klinecharts 说毫秒，生成器说秒。 */
function toKLineData(candle: PerfCandle): KLineData {
	return {
		timestamp: candle.time * 1000,
		open: candle.open,
		high: candle.high,
		low: candle.low,
		close: candle.close,
		volume: candle.volume,
		turnover: candle.close * candle.volume,
	};
}

/** A `TChartProDatafeed` over `candles`, whose history resolves on the next microtask. 基于 `candles` 的 `TChartProDatafeed`，历史在下一个微任务 resolve。 */
export function tChartFeed(candles: PerfCandle[]): FeedHandle<TChartProDatafeed> {
	const items = candles.map(toTChartCandle);
	let onNext: TChartProFeedCallback | null = null;
	let markHistory!: () => void;
	const historyDone = new Promise<void>((resolve) => {
		markHistory = resolve;
	});

	return {
		feed: {
			async searchSymbols() {
				return [tChartSymbol];
			},
			async getHistory() {
				await ioLatency();
				markHistory();
				return items;
			},
			subscribe(_symbol, _barSize, callback) {
				onNext = callback;
			},
			unsubscribe() {
				onNext = null;
			},
		},
		historyDone,
		push: (candle) => onNext?.(toTChartCandle(candle)),
		subscribed: () => onNext !== null,
	};
}

/** A `@klinecharts/pro` `Datafeed` over `candles`. 基于 `candles` 的 `@klinecharts/pro` `Datafeed`。 */
export function kChartFeed(candles: PerfCandle[]): FeedHandle<Datafeed> {
	const items = candles.map(toKLineData);
	let onNext: DatafeedSubscribeCallback | null = null;
	let markHistory!: () => void;
	const historyDone = new Promise<void>((resolve) => {
		markHistory = resolve;
	});

	return {
		feed: {
			async searchSymbols() {
				return [PERF_SYMBOL];
			},
			async getHistoryKLineData() {
				await ioLatency();
				markHistory();
				return items;
			},
			subscribe(_symbol, _period, callback) {
				onNext = callback;
			},
			unsubscribe() {
				onNext = null;
			},
		},
		historyDone,
		push: (candle) => onNext?.(toKLineData(candle)),
		subscribed: () => onNext !== null,
	};
}

/** v10's own `SymbolInfo` / `Period` shapes — the pair `AdaChartPro` is handed. v10 自己的 `SymbolInfo` / `Period` 形状，也就是交给 `AdaChartPro` 的那一对。 */
export const PERF_SYMBOL_V10: V10SymbolInfo = {
	ticker: PERF_SYMBOL.ticker,
	pricePrecision: 2,
	volumePrecision: 0,
};

export const PERF_PERIOD_V10: V10Period = { type: "day", span: 1 };

/**
 * A `klinecharts` v10 {@link DataLoader} over `candles` — the v10 counterpart of
 * {@link kChartFeed}, so `AdaChartPro` is measured on the same series through the
 * same one-macrotask history path as the other two.
 *
 * 基于 `candles` 的 `klinecharts` v10 {@link DataLoader} —— {@link kChartFeed} 的 v10 对应物，
 * 使 `AdaChartPro` 与另外两者吃同一条序列、走同一个宏任务历史路径。
 */
export function adaChartProFeed(candles: PerfCandle[]): FeedHandle<DataLoader> {
	const items = candles.map(toKLineData);
	let onNext: ((data: KLineData) => void) | null = null;
	let markHistory!: () => void;
	const historyDone = new Promise<void>((resolve) => {
		markHistory = resolve;
	});

	return {
		feed: {
			// `forward` / `backward` are history paging; this feed answers the whole
			// snapshot at once, so only `init` and `update` carry data.
			// `forward` / `backward` 是历史翻页；本数据源一次给出完整快照，因此只有 `init`
			// 与 `update` 带数据。
			async getBars(params: DataLoaderGetBarsParams) {
				if (params.type !== "init" && params.type !== "update") {
					params.callback([], false);
					return;
				}
				await ioLatency();
				markHistory();
				params.callback(items, false);
			},
			subscribeBar(params: DataLoaderSubscribeBarParams) {
				onNext = params.callback;
			},
			unsubscribeBar(_params: DataLoaderUnsubscribeBarParams) {
				onNext = null;
			},
		},
		historyDone,
		push: (candle) => onNext?.(toKLineData(candle)),
		subscribed: () => onNext !== null,
	};
}