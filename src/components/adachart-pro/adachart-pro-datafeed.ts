import type {
	DataLoader,
	DataLoaderGetBarsParams,
	DataLoaderSubscribeBarParams,
	DataLoaderUnsubscribeBarParams,
	KLineData,
	SymbolInfo,
} from "klinecharts";
import {
	fetchOkxCandles,
	OKX_HISTORY_LIMIT,
	OKX_INST_ID,
	okxSnapshotCandles,
	type OkxCandle,
	type OkxPage,
} from "../../okx";
import { sharedOkxStream, type OkxStream } from "../../okx-stream";
import { okxBarFor } from "./adachart-pro-options";

/**
 * A {@link DataLoader} that can also name an instrument the caller only knows by
 * name — the seam TradingView spells *datafeed* plus a symbol string.
 *
 * The method is optional because v10 has no such word: a loader whose instruments
 * are already `SymbolInfo` objects keeps working untouched, and only one that
 * fronts several venues has anything to answer.
 *
 * It may answer asynchronously, and it should answer with the *named* instrument
 * in full — `pricePrecision` and, in particular, `volumePrecision`, which the
 * engine silently reads as zero decimals when it is missing (`ADR-0005`).
 *
 * 一个还能按名字给出标的的 {@link DataLoader} —— 也就是 TradingView 所称的 *datafeed* 加
 * 一个 symbol 字符串这一接缝。
 *
 * 该方法是可选的，因为 v10 没有这个词：标的本来就是 `SymbolInfo` 对象的 loader 原样可用，
 * 只有面对多个数据源的那一个才有东西要回答。
 *
 * 它可以异步作答，且应当把被点名的标的**完整**交出 —— `pricePrecision`，尤其是
 * `volumePrecision`，后者缺失时引擎会静默按零位小数读（见 `ADR-0005`）。
 */
export interface AdaChartProDataLoader extends DataLoader {
	resolveSymbol?(name: string): SymbolInfo | Promise<SymbolInfo>;
}

/**
 * One resolution per loader per name, held beside the loader rather than in any
 * component. A multi-window grid shares one loader across every window and
 * remounts a window whenever its bar size changes, so a component-held cache
 * would be thrown away exactly when it was about to pay off.
 *
 * A *rejected* resolution is dropped rather than kept, so a venue that was down
 * for a moment is asked again the next time the instrument is named; a
 * resolution that succeeded is kept for the page's life, because a loader that
 * fronts a venue has no reason to change an instrument's identity mid-session.
 *
 * `WeakMap` keyed by the loader, not by its name: two loaders fronting two venues
 * may well use the same ticker spelling for different instruments.
 *
 * 每个 loader、每个名字只解析一次，且这份缓存放在 loader 身边而非任何组件里。多窗口网格共用
 * 一个 loader、并在周期变化时重挂载窗口，因此放在组件里的缓存在最该发挥作用的那一刻恰好被丢掉。
 *
 * *被拒绝*的解析会被丢弃而非保留，使一时不可用的数据源在下次点名时再被问一次；解析成功的则
 * 留存到页面结束，因为一个面对数据源的 loader 没有理由在会话中途改掉某个标的的身份。
 *
 * 用 `WeakMap` 按 loader 作键，而不是按名字：两个面对不同数据源的 loader 完全可能用同一个
 * 代码拼写指向不同的标的。
 */
const symbolResolutions = new WeakMap<
	AdaChartProDataLoader,
	Map<string, Promise<SymbolInfo>>
>();

/**
 * Resolves a symbol name through `resolve`, sharing one request per loader per
 * name.
 *
 * The loader and its resolver are handed over separately on purpose: the loader
 * is what the cache is keyed by, so it must be the object itself — a wrapper
 * built for the call would be a new key every time and the cache would never
 * hit — while the resolver is the narrowed method, which the caller has already
 * checked exists.
 *
 * 经 `resolve` 解析标的名称，每个 loader、每个名字共用一次请求。
 *
 * loader 与它的解析方法分开交出是有意的：缓存的键是 loader 本身，因此必须是那个对象 ——
 * 为这次调用临时造一个包装器会每次都成为新的键，缓存永不命中 —— 而解析方法是调用方已经确认
 * 存在的、收窄过的那一个。
 */
export function resolveAdaChartProSymbol(
	loader: AdaChartProDataLoader,
	resolve: (name: string) => SymbolInfo | Promise<SymbolInfo>,
	name: string,
): Promise<SymbolInfo> {
	let byName = symbolResolutions.get(loader);
	if (!byName) {
		byName = new Map();
		symbolResolutions.set(loader, byName);
	}
	const cached = byName.get(name);
	if (cached) return cached;
	// Deferred to a microtask so a resolver that is synchronous on one path and
	// asynchronous on another still lands the same way every time.
	// 延迟到一个微任务，使一个在某些路径上同步、另一些路径上异步的解析方法每次都落在同一处。
	const pending = Promise.resolve().then(() => resolve(name));
	byName.set(name, pending);
	void pending.catch(() => byName.delete(name));
	return pending;
}

/**
 * An OKX-backed `klinecharts` v10 {@link DataLoader}: history over REST, live
 * tail over the venue's own push feed (see {@link OkxStream}).
 *
 * The instrument comes from the request itself — v10 hands `symbol` and
 * `period` to every call — rather than from a constructor argument, so one
 * loader follows a `setSymbol` without being rebuilt.
 *
 * 一个基于 OKX 的 `klinecharts` v10 {@link DataLoader}：历史走 REST，实时末根走数据源自己的
 * 推送（见 {@link OkxStream}）。
 *
 * 标的来自请求本身 —— v10 会把 `symbol` 与 `period` 交给每次调用 —— 而不是构造参数，
 * 因此一次 `setSymbol` 之后同一个 loader 继续跟随，无需重建。
 */
export class OkxDataLoader implements DataLoader {
	/**
	 * One release per channel this loader holds. A loader is the only owner of
	 * what it subscribed, so unmounting one chart must not disturb another
	 * chart's feed — the socket itself is shared, the subscriptions are not.
	 *
	 * 本 loader 持有的每条频道各一个释放函数。loader 是它所订阅内容的唯一所有者，因此卸载一个
	 * 图表不应打扰另一个图表的数据源 —— socket 是共用的，订阅不是。
	 */
	private readonly releases = new Map<string, () => void>();

	private readonly stream: OkxStream;

	constructor(stream: OkxStream = sharedOkxStream()) {
		this.stream = stream;
	}

	async getBars(params: DataLoaderGetBarsParams): Promise<void> {
		const instId = instIdOf(params);
		const bar = okxBarFor(params.period);

		// `init` and `update` ask for the current window and are answered with the
		// whole snapshot. `forward` and `backward` are the two history directions
		// the engine asks for when the reader reaches an edge, and each is a page
		// on one side of the bar it names.
		//
		// `init` 与 `update` 要的是当前窗口，用整份快照回答。`forward` 与 `backward` 是读者
		// 触到边缘时引擎索要的两个历史方向，各是以它给出的那根 K 线为界的一页。
		if (params.type === "init" || params.type === "update") {
			const bars = await fetchBarsFor(instId, bar);
			// The `more` flags are what tell the engine whether to keep asking: older
			// bars exist behind the window, newer ones arrive through `subscribeBar`.
			// `more` 标志决定引擎是否继续索要：窗口之下还有更早的 K 线，更晚的经
			// `subscribeBar` 到达。
			params.callback(bars.map(toKLineData), { forward: true, backward: false });
			return;
		}

		const timestamp = params.timestamp;
		if (timestamp === null || timestamp === undefined) {
			params.callback([], false);
			return;
		}
		const page: OkxPage =
			params.type === "forward" ? { after: timestamp } : { before: timestamp };
		const bars = await fetchPageFor(instId, bar, page);
		// The boundary bar is the one already on the chart; OKX documents both keys
		// as exclusive, and dropping it here means a server that disagrees cannot
		// put a duplicate on the chart.
		//
		// 边界那根正是图表上已有的那根；OKX 文档说两个键都是排他的，这里再丢一次，使服务端
		// 即便不认同也无法让重复的一根出现在图表上。
		const fresh = bars.filter((candle) =>
			params.type === "forward"
				? candle.timestamp < timestamp
				: candle.timestamp > timestamp,
		);
		// A full page means the venue still has history behind it, so the engine is
		// told to keep asking; a short page is the end of it and stops the paging.
		// The count is the *raw* page's, before the boundary bar is dropped, because
		// the venue's own idea of "full" is what answers the question.
		//
		// 满页意味着数据源之后还有历史，于是告诉引擎继续索要；不满的一页就是尽头，翻页到此为止。
		// 用的是*原始*页的长度（在丢掉边界那根之前），因为回答这个问题的是数据源自己对「满」的定义。
		const more =
			params.type === "forward"
				? { forward: bars.length >= OKX_HISTORY_LIMIT, backward: false }
				: { forward: true, backward: false };
		params.callback(fresh.map(toKLineData), more);
	}

	/**
	 * The live tail comes from the venue's push feed, and a reconnect comes with a
	 * hole in it: while the socket was down, every candle that closed was never
	 * pushed. So the first push after a recovery is prefixed by a fresh window —
	 * the chart takes only what it does not already have, because the engine drops
	 * a bar whose timestamp is older than its newest, and nothing on screen is
	 * cleared to make room for it.
	 *
	 * 实时末根来自数据源的推送，而一次重连会带来一个空洞：socket 断着的那段时间里，每一根收盘的
	 * 蜡烛都不曾被推送。因此恢复之后的第一根推送之前，先补一整窗 —— 图表只取它还没有的那些，
	 * 因为引擎会丢弃时间戳早于其最新一根的 K 线，而屏幕上没有任何东西被清掉来腾位置。
	 */
	subscribeBar(params: DataLoaderSubscribeBarParams): void {
		const instId = instIdOf(params);
		const bar = okxBarFor(params.period);
		const key = `${instId}:${bar}`;
		// v10 asks for the same channel again after every `resetData`, so a second
		// ask is normal rather than a mistake, and the first subscription — whose
		// callback closed over the same chart — keeps serving it.
		// 每次 `resetData` 之后 v10 都会再要同一个频道，因此第二次索要是常态而非错误，而「第一个」
		// 订阅 —— 它的回调闭包指向同一张图 —— 继续为它服务。
		if (this.releases.has(key)) return;

		let recovering = false;
		const release = this.stream.subscribe(instId, bar, {
			onBar: (candle) => params.callback(toKLineData(candle)),
			onStatus: (status) => {
				if (status === "reconnecting") {
					recovering = true;
					return;
				}
				if (status !== "open" || !recovering) return;
				recovering = false;
				void this.refill(instId, bar, params);
			},
		});
		this.releases.set(key, release);
	}

	unsubscribeBar(params: DataLoaderUnsubscribeBarParams): void {
		const key = `${instIdOf(params)}:${okxBarFor(params.period)}`;
		this.releases.get(key)?.();
		this.releases.delete(key);
	}

	/** Stop every subscription this loader holds; called when the React component unmounts. 停掉本 loader 持有的全部订阅；React 组件卸载时调用。 */
	dispose(): void {
		for (const release of this.releases.values()) release();
		this.releases.clear();
	}

	/** Re-offer the current window after a reconnect. It fails soft, like a page: a chart already drawing must not be blanked because a *second* look at the venue failed. 重连之后重新提供当前窗口。它与翻页一样软失败：图表已经在画了，不能因为*第二次*看数据源失败而被清空。 */
	private async refill(
		instId: string,
		bar: string,
		params: DataLoaderSubscribeBarParams,
	): Promise<void> {
		const bars = await fetchBarsFor(instId, bar);
		for (const candle of bars) params.callback(toKLineData(candle));
	}
}

/** The instrument the request is about, falling back to the default pair. 该请求所指的标的，缺失时回退到默认交易对。 */
function instIdOf(params: { symbol?: { ticker?: string } }): string {
	return params.symbol?.ticker || OKX_INST_ID;
}

/**
 * In-flight dedupe so concurrent callers share one request — and only *while*
 * it is in flight. The entry is dropped the moment the request settles: a cache
 * that outlived the request would hand a later window the same array as an
 * earlier one, and after a reconnect that means the bars the outage hid.
 *
 * 进行中去重，使并发调用共用一次请求 —— 且只在请求进行中。请求一落地就删除条目：比请求活得更久
 * 的缓存会把同一份数组交给后来的窗口，而在一次重连之后，那意味着断线期间被遮住的那几根。
 */
const barCache = new Map<string, Promise<OkxCandle[]>>();
function fetchBarsFor(instId: string, bar: string): Promise<OkxCandle[]> {
	const key = `${instId}:${bar}`;
	const cached = barCache.get(key);
	if (cached) return cached;
	const pending = fetchBar(instId, bar);
	barCache.set(key, pending);
	void pending.then(
		() => barCache.delete(key),
		() => barCache.delete(key),
	);
	return pending;
}

async function fetchBar(instId: string, bar: string): Promise<OkxCandle[]> {
	try {
		return await fetchOkxCandles(instId, bar);
	} catch (error) {
		console.warn("[AdaChartPro] OKX unavailable, serving snapshot fallback.", error);
		return okxSnapshotCandles(bar);
	}
}

/**
 * One page of history, keyed by direction as well as instrument: a page asks
 * for bars on one side of one bar, so two pages of the same instrument are two
 * different requests and must not share an entry.
 *
 * 一页历史，键除了标的还带方向：一页要的是某一根 K 线某一侧的 K 线，因此同一标的的两页是两个
 * 不同的请求，不该共用条目。
 */
const pageCache = new Map<string, Promise<OkxCandle[]>>();
function fetchPageFor(
	instId: string,
	bar: string,
	page: OkxPage,
): Promise<OkxCandle[]> {
	const key = `${instId}:${bar}:${page.after ?? ""}:${page.before ?? ""}`;
	const cached = pageCache.get(key);
	if (cached) return cached;
	const pending = fetchPage(instId, bar, page);
	pageCache.set(key, pending);
	void pending.then(
		() => pageCache.delete(key),
		() => pageCache.delete(key),
	);
	return pending;
}

/**
 * A page, with **no** snapshot fallback — deliberately unlike {@link fetchBar}.
 *
 * The snapshot is one window around "now"; a page asks for bars on one side of
 * an arbitrary bar. Answering a failed page with the snapshot would put bars on
 * the chart that the reader did not ask for and that they already have, so a
 * failed page answers "nothing more" instead. `@klinecharts/pro` calls the same
 * choice `loadMore` failing softly.
 *
 * 一页历史，**不**做快照兜底 —— 这一点与 {@link fetchBar} 刻意不同。
 *
 * 快照是「当下」附近的一个窗口，而一页要的是某一根 K 线某一侧的 K 线。用快照回答失败的一页，
 * 会把读者没要、而且已经有了的 K 线放到图上，因此失败的一页回答「没有了」。`@klinecharts/pro`
 * 对同样的选择称之为 `loadMore` 的软失败。
 */
async function fetchPage(
	instId: string,
	bar: string,
	page: OkxPage,
): Promise<OkxCandle[]> {
	try {
		return await fetchOkxCandles(instId, bar, page);
	} catch (error) {
		console.warn("[AdaChartPro] OKX history page unavailable.", error);
		return [];
	}
}

/**
 * What the chart is doing with its data, as a UI can show it.
 *
 * 图表数据的当前状态，供界面展示。
 */
export type AdaChartProDataState = "loading" | "ready" | "empty";

/**
 * Wraps a {@link DataLoader} so the loading and empty states can be reported —
 * something the engine has no callback for, because "is the drawer still
 * waiting" is a question about the UI, not about the data.
 *
 * Only `init` and `update` (the two whole-window requests) report `loading`;
 * a page is a quiet extension of what is already drawn and must not black out
 * the chart. The answer to those two decides `ready` versus `empty`, and a
 * pushed bar is proof that data exists, so the push path upgrades an empty chart
 * to `ready` on its own.
 *
 * 包装一个 {@link DataLoader}，以便上报加载中与空状态 —— 引擎没有对应回调，因为「还在等吗」
 * 是关于界面而非关于数据的问题。
 *
 * 只有 `init` 与 `update`（两个整窗请求）会上报 `loading`；翻页是已有内容的安静延伸，
 * 不该让图表变黑。两者的答案决定 `ready` 还是 `empty`，而一根被推送的 K 线就是数据存在的证据，
 * 因此轮询路径会自行把空图升级为 `ready`。
 */
export function observeBars(
	inner: DataLoader,
	report: (state: AdaChartProDataState) => void,
): DataLoader {
	return {
		async getBars(params: DataLoaderGetBarsParams): Promise<void> {
			if (params.type !== "init" && params.type !== "update") {
				await inner.getBars(params);
				return;
			}
			report("loading");
			let received = 0;
			await inner.getBars({
				...params,
				callback: (data, more) => {
					received = data.length;
					params.callback(data, more);
				},
			});
			report(received > 0 ? "ready" : "empty");
		},
		subscribeBar: inner.subscribeBar
			? (params: DataLoaderSubscribeBarParams) =>
					inner.subscribeBar?.({
						...params,
						callback: (bar) => {
							report("ready");
							params.callback(bar);
						},
					})
			: undefined,
		unsubscribeBar: inner.unsubscribeBar
			? (params: DataLoaderUnsubscribeBarParams) =>
					inner.unsubscribeBar?.(params)
			: undefined,
	};
}

/**
 * `klinecharts`' `KLineData` carries an index signature the neutral Candle does
 * not, so the copy at the boundary is structural, not cosmetic.
 *
 * klinecharts 的 `KLineData` 带索引签名，而引擎无关的 Candle 没有；因此在边界处做一次
 * 浅拷贝是结构所需，不是装饰。
 */
function toKLineData(candle: OkxCandle): KLineData {
	return { ...candle };
}
