import type {
	DataLoader,
	DataLoaderGetBarsParams,
	DataLoaderSubscribeBarParams,
	DataLoaderUnsubscribeBarParams,
	KLineData,
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
