import type { DataLoaderGetBarsParams, KLineData, SymbolInfo } from "klinecharts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OKX_HISTORY_LIMIT } from "../../okx";
import { OkxStream } from "../../okx-stream";
import { OkxDataLoader, observeBars } from "./adachart-pro-datafeed";

/**
 * The paging half of the OKX feed: which of OKX's two keys each direction uses,
 * where the boundary bar is dropped, and when the engine is told there may be
 * more. All three are facts about the feed, so they are asserted against a
 * stubbed `fetch` rather than a browser.
 *
 * OKX 数据源的分页部分：两个方向各用 OKX 的哪一个键、边界那根在哪里被丢掉、以及何时告诉引擎
 * 可能还有更多。三者都是关于数据源的事实，因此对着被替换的 `fetch` 断言而不是浏览器。
 */

const SYMBOL: SymbolInfo = {
	ticker: "BTC-USDT",
	pricePrecision: 2,
	volumePrecision: 2,
};
const PERIOD = { type: "minute", span: 1 } as const;

/** One OKX row: `[ts, o, h, l, c, vol, turnover]`, every field a string. 一行 OKX 数据，字段皆为字符串。 */
function row(timestamp: number, close = 100): string[] {
	return [String(timestamp), "1", "1", "1", String(close), "1", "1"];
}

/** `count` ascending rows ending at `last`, one minute apart. 以 `last` 结尾、间隔一分钟的 `count` 行升序数据。 */
function rowsEndingAt(last: number, count: number): string[][] {
	return Array.from({ length: count }, (_, index) =>
		row(last - (count - 1 - index) * 60_000),
	);
}

/** A complete bar, for the loaders the `observeBars` tests hand in. 一根完整的 K 线，供 `observeBars` 测试里的 loader 使用。 */
function bar(timestamp: number): KLineData {
	return { timestamp, open: 1, high: 1, low: 1, close: 1 };
}

/**
 * Replaces `fetch` with one that always answers `data`, and returns it so a test
 * can read the URL it was asked for.
 *
 * 把 `fetch` 替换为永远以 `data` 作答的实现，并交回来，使测试能读到它被请求的 URL。
 */
function stubFetch(data: string[][]) {
	const mock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
		ok: true,
		status: 200,
		json: async () => ({ code: "0", msg: "", data }),
	}));
	vi.stubGlobal("fetch", mock);
	return mock;
}

/**
 * The one URL a stubbed `fetch` was asked for, asserting it was asked exactly
 * once — a page is one request, so a second one would mean the dedupe failed.
 *
 * 被替换的 `fetch` 所请求的唯一 URL，同时断言只请求了一次 —— 一页就是一次请求，多一次就意味着
 * 去重失效。
 */
function requestedUrl(mock: ReturnType<typeof stubFetch>): URL {
	expect(mock).toHaveBeenCalledTimes(1);
	return new URL(String(mock.mock.calls[0][0]));
}

/** A `getBars` request that records what the loader answered. 一个会记下 loader 回答内容的 `getBars` 请求。 */
function request(type: DataLoaderGetBarsParams["type"], timestamp: number | null) {
	const received: KLineData[] = [];
	const more: Array<unknown> = [];
	return {
		type,
		timestamp,
		symbol: SYMBOL,
		period: PERIOD,
		callback: (data: KLineData[], flags?: unknown) => {
			received.push(...data);
			more.push(flags);
		},
		received,
		more,
	};
}

/**
 * The smallest thing that behaves like a `WebSocket` where the hub touches one:
 * `readyState`, `send`, and the four event handlers.
 *
 * 在 hub 所触及之处表现得像 `WebSocket` 的最小实现：`readyState`、`send` 与四个事件处理器。
 */
class FakeSocket {
	readyState = 0;
	onopen: (() => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: ((event: Event) => void) | null = null;

	send(): void {}

	close(): void {
		this.readyState = 3;
	}

	accept(): void {
		this.readyState = 1;
		this.onopen?.();
	}

	push(payload: unknown): void {
		this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
	}

	drop(): void {
		this.readyState = 3;
		this.onclose?.();
	}
}

/** A hub over recorded stand-ins, so a test can reach the socket it opened. 一个建立在被记录替身之上的 hub，使测试能拿到它开出的 socket。 */
function streamOver(sockets: FakeSocket[]): OkxStream {
	return new OkxStream(() => {
		const socket = new FakeSocket();
		sockets.push(socket);
		return socket as unknown as WebSocket;
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("OkxDataLoader.getBars", () => {
	it("answers init with the whole window, ascending and marked as having history", async () => {
		stubFetch(rowsEndingAt(1_700_000_000_000, 3));
		const loader = new OkxDataLoader();
		const params = request("init", null);
		await loader.getBars(params);

		expect(params.received.map((item) => item.timestamp)).toEqual([
			1_699_999_880_000, 1_699_999_940_000, 1_700_000_000_000,
		]);
		// Older bars exist behind the window, newer ones arrive through `subscribeBar`.
		// 窗口之下还有更早的 K 线，更晚的经 `subscribeBar` 到达。
		expect(params.more).toEqual([{ forward: true, backward: false }]);
	});

	it("pages *forward* with OKX's `after` key and drops the boundary bar", async () => {
		const boundary = 1_700_000_000_000;
		const mock = stubFetch(rowsEndingAt(boundary, 3));
		const loader = new OkxDataLoader();
		const params = request("forward", boundary);
		await loader.getBars(params);

		expect(requestedUrl(mock).searchParams.get("after")).toBe(String(boundary));
		expect(requestedUrl(mock).searchParams.has("before")).toBe(false);
		// The boundary bar is already on the chart; OKX documents the key as
		// exclusive and it is dropped again here so a disagreeing server cannot
		// duplicate it.
		// 边界那根已经在图上；OKX 说该键是排他的，这里再丢一次，使不认同的服务端也无法重复它。
		expect(params.received.map((item) => item.timestamp)).toEqual([
			1_699_999_880_000, 1_699_999_940_000,
		]);
		// A short page is the end of the history, so paging stops.
		// 不满的一页就是历史的尽头，翻页到此为止。
		expect(params.more).toEqual([{ forward: false, backward: false }]);
	});

	it("keeps asking forward only while a full page comes back", async () => {
		// A full page means the venue still has history behind it; the count is the
		// *raw* page's, before the boundary bar is dropped.
		// 满页意味着数据源之后还有历史；用的是*原始*页的长度，在丢掉边界那根之前。
		stubFetch(rowsEndingAt(1_700_000_000_000, OKX_HISTORY_LIMIT));
		const loader = new OkxDataLoader();
		const params = request("forward", 1_700_000_000_000);
		await loader.getBars(params);
		expect(params.more).toEqual([{ forward: true, backward: false }]);
	});

	it("pages *backward* with OKX's `before` key, keeping later bars", async () => {
		const boundary = 1_700_000_000_000;
		const mock = stubFetch(rowsEndingAt(boundary + 120_000, 3));
		const loader = new OkxDataLoader();
		const params = request("backward", boundary);
		await loader.getBars(params);

		expect(requestedUrl(mock).searchParams.get("before")).toBe(String(boundary));
		expect(params.received.map((item) => item.timestamp)).toEqual([
			1_700_000_060_000, 1_700_000_120_000,
		]);
	});

	it("answers an edge request with nothing when it names no bar", async () => {
		// There is no side of "no bar" to page from; asking the venue anyway would
		// return the newest window and put bars on the chart the reader did not ask for.
		// 「没有那根 K 线」就没有可翻的一侧；仍去问数据源会返回最新窗口，把读者没要的 K 线放上图。
		const mock = stubFetch(rowsEndingAt(1_700_000_000_000, 3));
		const loader = new OkxDataLoader();
		const params = request("forward", null);
		await loader.getBars(params);
		expect(params.received).toEqual([]);
		expect(mock).not.toHaveBeenCalled();
	});
});

/**
 * The hub itself is tested in `src/okx-stream.test.ts`. What this file asserts
 * about it is only the *wiring*: that a pushed candle reaches the chart's
 * callback, that the channel is released when the chart stops asking for it, and
 * that a reconnect is answered with a fresh window instead of a silent hole.
 *
 * hub 自身在 `src/okx-stream.test.ts` 中测试。本文件对它只断言*接线*：被推送的一根蜡烛能到达
 * 图表的回调、图表不再索要时频道被释放、以及一次重连会被一整窗数据回答而不是留下一个无声的空洞。
 */
describe("OkxDataLoader.subscribeBar", () => {
	it("hands the venue's candles to the chart, and releases the channel on unsubscribe", () => {
		const sockets: FakeSocket[] = [];
		const loader = new OkxDataLoader(streamOver(sockets));
		const pushed: KLineData[] = [];
		loader.subscribeBar({
			symbol: SYMBOL,
			period: PERIOD,
			callback: (item) => pushed.push(item),
		});
		sockets[0].accept();

		sockets[0].push({
			arg: { channel: "candle1m", instId: "BTC-USDT" },
			data: [["1700000000000", "1", "1", "1", "2", "1", "1", "1", "0"]],
		});
		expect(pushed.map((item) => item.close)).toEqual([2]);

		// The socket is shared between charts, so closing it is the sign that this
		// subscription really let go.
		// socket 由多个图表共用，因此它被关闭才是这份订阅确实放手的标志。
		loader.unsubscribeBar({ symbol: SYMBOL, period: PERIOD });
		expect(sockets[0].readyState).toBe(3);
	});

	it("refills the window after a reconnect, so candles closed offline are not lost", async () => {
		vi.useFakeTimers();
		try {
			const sockets: FakeSocket[] = [];
			const mock = stubFetch(rowsEndingAt(1_700_000_000_000, 3));
			const loader = new OkxDataLoader(streamOver(sockets));
			const pushed: KLineData[] = [];
			loader.subscribeBar({
				symbol: SYMBOL,
				period: PERIOD,
				callback: (item) => pushed.push(item),
			});
			sockets[0].accept();

			sockets[0].drop();
			await vi.advanceTimersByTimeAsync(500);
			sockets[1].accept();
			await vi.advanceTimersByTimeAsync(0);

			// Nothing was pushed by the socket itself: the whole window arrives over
			// REST, and the engine keeps only what it does not already have.
			// socket 本身没有推送任何东西：整窗数据经 REST 到达，而引擎只留下它还没有的那些。
			expect(mock).toHaveBeenCalledTimes(1);
			expect(pushed.map((item) => item.timestamp)).toEqual([
				1_699_999_880_000, 1_699_999_940_000, 1_700_000_000_000,
			]);

			loader.dispose();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("observeBars", () => {
	it("reports loading then ready around a whole-window request", async () => {
		const states: string[] = [];
		const wrapped = observeBars(
			{ getBars: async (params) => params.callback([bar(1_700_000_000_000)]) },
			(state) => states.push(state),
		);
		await wrapped.getBars(request("init", null));
		expect(states).toEqual(["loading", "ready"]);
	});

	it("reports empty when the venue answers with nothing", async () => {
		const states: string[] = [];
		const wrapped = observeBars(
			{ getBars: async (params) => params.callback([]) },
			(state) => states.push(state),
		);
		await wrapped.getBars(request("update", null));
		expect(states).toEqual(["loading", "empty"]);
	});

	it("does not blank the chart for a page", async () => {
		// A page extends what is already drawn; reporting `loading` for it would put a
		// spinner over a chart that is not waiting for anything.
		// 一页只是延伸已经画好的内容；为它上报 `loading` 会把加载动画盖在一张并非在等什么的图上。
		const states: string[] = [];
		const wrapped = observeBars(
			{ getBars: async (params) => params.callback([bar(1_700_000_000_000)]) },
			(state) => states.push(state),
		);
		await wrapped.getBars(request("forward", 1_700_000_000_000));
		expect(states).toEqual([]);
	});

	it("upgrades an empty chart to ready when a bar is pushed", async () => {
		const states: string[] = [];
		const wrapped = observeBars(
			{
				getBars: async (params) => params.callback([]),
				subscribeBar: (params) => params.callback(bar(1_700_000_000_000)),
			},
			(state) => states.push(state),
		);
		await wrapped.getBars(request("init", null));
		wrapped.subscribeBar?.({
			symbol: SYMBOL,
			period: PERIOD,
			callback: () => undefined,
		});
		expect(states).toEqual(["loading", "empty", "ready"]);
	});
});