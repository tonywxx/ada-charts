import { afterEach, describe, expect, it, vi } from "vitest";
import {
	OKX_STREAM_BARS,
	OKX_STREAM_URL,
	OkxStream,
	type OkxStreamStatus,
} from "./okx-stream";

/**
 * The hub's own rules: one socket however many subscribers, what a pushed frame
 * becomes, and what happens when the socket dies. All three are facts about the
 * feed's protocol, so they are asserted against a stand-in socket rather than a
 * browser and a live venue.
 *
 * hub 自身的规则：无论多少订阅者都只有一条 socket、一帧推送会变成什么、以及 socket 断掉时会怎样。
 * 三者都是关于数据源协议的事实，因此对着替身 socket 断言，而不是对着浏览器与活的交易所。
 */

/**
 * The smallest thing that behaves like a `WebSocket` at the four points the hub
 * touches: `readyState`, `send`, the event handlers, and `close`. It records
 * what was sent so a test can read the subscription frames.
 *
 * 在 hub 所触及的四个点上表现得像 `WebSocket` 的最小实现：`readyState`、`send`、各事件处理器
 * 与 `close`。它会记下发送过什么，使测试能读到订阅帧。
 */
class FakeSocket {
	readyState = 0;
	onopen: (() => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	readonly sent: string[] = [];
	readonly url: string;

	constructor(url: string) {
		this.url = url;
	}

	send(data: string): void {
		this.sent.push(data);
	}

	close(): void {
		this.readyState = 3;
		this.onclose?.();
	}

	/** The server accepting the connection. 服务端接受连接。 */
	accept(): void {
		this.readyState = 1;
		this.onopen?.();
	}

	/** The socket dying without us asking. socket 未经我们要求而死掉。 */
	drop(): void {
		this.readyState = 3;
		this.onclose?.();
	}

	emit(payload: unknown): void {
		this.onmessage?.({
			data: typeof payload === "string" ? payload : JSON.stringify(payload),
		} as MessageEvent);
	}

	/** Frames received, parsed, for readable assertions. 收到的帧，已解析，便于阅读断言。 */
	frames(): Array<{ op?: string; args?: Array<{ channel: string; instId: string }> }> {
		return this.sent.map((raw) => JSON.parse(raw));
	}

	/** The `candle` channels this socket was asked for. 这条 socket 被要求过的 `candle` 频道。 */
	channels(): string[] {
		return this.frames()
			.flatMap((frame) => frame.args ?? [])
			.map((arg) => `${arg.channel}@${arg.instId}`);
	}
}

/** A hub wired to recorded stand-ins, plus the sockets it has opened so far. 一个接到被记录的替身之上的 hub，以及它迄今开过的 socket。 */
function hub() {
	const sockets: FakeSocket[] = [];
	const stream = new OkxStream((url) => {
		const socket = new FakeSocket(url);
		sockets.push(socket);
		return socket as unknown as WebSocket;
	});
	return { stream, sockets, last: () => sockets[sockets.length - 1] };
}

const INST_ID = "BTC-USDT";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("OkxStream subscriptions", () => {
	it("shares one socket between subscribers and names the channel it wants", () => {
		const { stream, sockets, last } = hub();
		const statuses: OkxStreamStatus[] = [];
		const releaseA = stream.subscribe(INST_ID, "1m", {
			onBar: () => undefined,
			onStatus: (status) => statuses.push(status),
		});
		stream.subscribe(INST_ID, "1m", { onBar: () => undefined });

		expect(sockets).toHaveLength(1);
		// The business endpoint, not the public one: `candle` channels live there,
		// and `public` would answer with an error event nobody asked about.
		// 业务端点，而非公开端点：`candle` 频道在那边，而 `public` 会回一个没人问起的错误事件。
		expect(last().url).toBe(OKX_STREAM_URL);
		// The newcomer is told where things stand before any data arrives, so a
		// status row does not have to guess.
		// 新订阅者会在任何数据到达之前被告知当前状态，因此状态行无需猜测。
		expect(statuses).toEqual(["connecting"]);

		last().accept();
		expect(statuses).toEqual(["connecting", "open"]);
		expect(last().channels()).toEqual(["candle1m@BTC-USDT"]);

		releaseA();
		// Still one subscriber, so the socket stays up.
		// 还剩一个订阅者，因此 socket 继续开着。
		expect(last().readyState).toBe(1);
	});
});

describe("OkxStream frames", () => {
	it("turns a pushed row into a candle with the venue's own closed flag", () => {
		const { stream, last } = hub();
		const received: Array<{ close: number; closed: boolean }> = [];
		stream.subscribe(INST_ID, "5m", {
			onBar: (candle, closed) => received.push({ close: candle.close, closed }),
		});
		last().accept();

		// `[ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]` — index 8 is the
		// venue's statement, not our inference.
		// `[时间戳, 开, 高, 低, 收, 量, 币量, 计价额, 是否收盘]` —— 第 8 个字段是数据源自己的
		// 声明，不是我们的推断。
		last().emit({
			arg: { channel: "candle5m", instId: INST_ID },
			data: [["1700000000000", "1", "2", "0.5", "1.5", "10", "20", "30", "0"]],
		});
		last().emit({
			arg: { channel: "candle5m", instId: INST_ID },
			data: [["1700000000000", "1", "2", "0.5", "1.6", "10", "20", "30", "1"]],
		});

		expect(received).toEqual([
			{ close: 1.5, closed: false },
			{ close: 1.6, closed: true },
		]);
	});

	it("ignores a channel nobody asked for, a bare `pong`, and debris", () => {
		const { stream, last } = hub();
		const received: number[] = [];
		stream.subscribe(INST_ID, "1m", { onBar: (candle) => received.push(candle.close) });
		last().accept();

		last().emit("pong");
		last().emit("not json at all");
		last().emit({ arg: { channel: "candle1H", instId: INST_ID }, data: [["1", "1", "1", "1", "9", "1", "1"]] });
		last().emit({ arg: { channel: "candle1m" }, data: [["1", "1", "1", "1", "9", "1", "1"]] });

		expect(received).toEqual([]);
	});

	it("drops a row the REST parser would drop", () => {
		// One parser for both transports: a row with no usable close must not reach
		// the chart just because it arrived over the socket.
		// 两种传输共用一个解析器：没有可用收盘价的行，不能因为是从 socket 来的就跑到图上。
		const { stream, last } = hub();
		const received: number[] = [];
		stream.subscribe(INST_ID, "1m", { onBar: (candle) => received.push(candle.close) });
		last().accept();

		last().emit({
			arg: { channel: "candle1m", instId: INST_ID },
			data: [["1700000000000", "1", "1", "1", "", "1", "1", "1", "0"]],
		});

		expect(received).toEqual([]);
	});

	it("reports a rejected subscription instead of failing silently", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const { stream, last } = hub();
		stream.subscribe(INST_ID, "5s", { onBar: () => undefined });
		last().accept();

		last().emit({ event: "error", code: "60018", msg: "Wrong channel" });

		expect(warn).toHaveBeenCalledWith("[OKX stream] 60018 Wrong channel");
	});
});

describe("OkxStream lifecycle", () => {
	it("closes the socket once the last subscriber has gone", () => {
		const { stream, last } = hub();
		const release = stream.subscribe(INST_ID, "1m", { onBar: () => undefined });
		last().accept();

		release();

		expect(last().readyState).toBe(3);
		expect(stream.status()).toBe("closed");
	});

	it("treats a later first connection as a first connection, not a recovery", () => {
		// Nothing on screen has gone stale when a hub with no subscribers starts
		// again, so calling it a reconnect would send the caller after history it
		// never had.
		// 一个没有订阅者的 hub 重新开始时，屏幕上没有任何东西变陈旧，因此说成重连会让调用方去追一段
		// 从未有过的历史。
		const { stream } = hub();
		stream.subscribe(INST_ID, "1m", { onBar: () => undefined })();
		const statuses: OkxStreamStatus[] = [];
		stream.subscribe(INST_ID, "1m", {
			onBar: () => undefined,
			onStatus: (status) => statuses.push(status),
		});
		expect(statuses).toEqual(["connecting"]);
	});

	it("reconnects, re-subscribes every channel, and says so", async () => {
		vi.useFakeTimers();
		const { stream, sockets } = hub();
		const statuses: OkxStreamStatus[] = [];
		stream.subscribe(INST_ID, "1m", {
			onBar: () => undefined,
			onStatus: (status) => statuses.push(status),
		});
		stream.subscribe(INST_ID, "4H", {
			onBar: () => undefined,
			onStatus: (status) => statuses.push(status),
		});
		sockets[0].accept();

		sockets[0].drop();
		expect(stream.status()).toBe("reconnecting");
		expect(sockets).toHaveLength(1);

		await vi.advanceTimersByTimeAsync(500);
		expect(sockets).toHaveLength(2);
		sockets[1].accept();

		// Both channels, not just the one that happened to be newest: the new socket
		// has no subscriptions of its own.
		// 两条频道都要，而不只是碰巧最新的那条：新 socket 自身没有任何订阅。
		expect(sockets[1].channels()).toEqual(["candle1m@BTC-USDT", "candle4H@BTC-USDT"]);
		expect(stream.status()).toBe("open");
		expect(statuses).toEqual([
			// Two subscribers, each told where things stand, then each told again on
			// every change.
			// 两个订阅者，各自被告知当前状态，随后每次变化又各被告知一次。
			"connecting",
			"connecting",
			"open",
			"open",
			"reconnecting",
			"reconnecting",
			"open",
			"open",
		]);
	});

	it("backs off further on each failed attempt", async () => {
		vi.useFakeTimers();
		const { stream, sockets } = hub();
		stream.subscribe(INST_ID, "1m", { onBar: () => undefined });
		sockets[0].accept();
		sockets[0].drop();

		// 500 ms, then 1 s, then 2 s: a blip is invisible and a laptop that lost its
		// network is not a flood.
		// 500 毫秒、1 秒、2 秒：一次抖动看不出来，而断了网的笔记本不会变成洪水。
		await vi.advanceTimersByTimeAsync(500);
		expect(sockets).toHaveLength(2);
		sockets[1].drop();
		await vi.advanceTimersByTimeAsync(999);
		expect(sockets).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(1);
		expect(sockets).toHaveLength(3);
	});

	it("stops knocking while nobody is listening", async () => {
		vi.useFakeTimers();
		const { stream, sockets } = hub();
		const release = stream.subscribe(INST_ID, "1m", { onBar: () => undefined });
		sockets[0].accept();
		sockets[0].drop();
		release();

		await vi.advanceTimersByTimeAsync(60_000);
		expect(sockets).toHaveLength(1);
		expect(stream.status()).toBe("closed");
	});
});

describe("OKX_STREAM_BARS", () => {
	it("leaves out the seconds REST serves and the feed refuses", () => {
		// The endpoint answers 60018 for `candle5s`, so carrying seconds here would
		// offer a bar size that works offline and silently breaks live.
		// 端面对 `candle5s` 回 60018，因此把秒级放进来等于提供一个离线可用、实时静默失效的档位。
		expect(OKX_STREAM_BARS).not.toContain("5s");
		expect(OKX_STREAM_BARS).toContain("4H");
		// The `utc` pair is what decides where a day starts, so both must exist.
		// `utc` 成对存在，才谈得上一天从哪里开始。
		expect(OKX_STREAM_BARS).toContain("1D");
		expect(OKX_STREAM_BARS).toContain("1Dutc");
	});
});
