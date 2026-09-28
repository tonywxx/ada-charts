import { parseOkxRows, type OkxCandle } from "./okx";

/**
 * OKX's push feed, in one place and free of any charting engine — the same
 * split `okx.ts` makes for REST, for the same reason: what the venue streams is
 * a fact about the *source*, and every Wrapper that wants live candles should
 * reach the same socket through the same rules.
 *
 * The hub is deliberately **not** a `DataLoader`. `klinecharts` and
 * `lightweight-charts` disagree about what a live series is (`DataLoader` versus
 * nothing at all), so anything shared between them has to stop below the engine
 * boundary. What is shared is: one socket per page, one subscription per
 * `instId:bar`, and reconnection on everybody's behalf.
 *
 * OKX 的推送源集中于此，且不含任何图表引擎 —— 与 `okx.ts` 对 REST 的切分相同，理由也相同：
 * 数据源推什么，是*数据源*的事实，凡是想要实时蜡烛的 Wrapper 都应经同一套规则到达同一个 socket。
 *
 * 本 hub 刻意**不是** `DataLoader`。`klinecharts` 与 `lightweight-charts` 对「实时序列是什么」
 * 的看法不同（前者有 `DataLoader`，后者根本没有），因此两者共享的东西必须停在引擎边界以下。
 * 被共享的是：每页一个 socket、每个 `instId:bar` 一份订阅、以及替所有人处理的重连。
 */

/**
 * The public **business** endpoint, which is where the `candle` channel lives.
 * `ws.okx.com:8443/ws/v5/public` serves tickers and trades, not candles.
 *
 * 公开的**业务**端点，`candle` 频道在这里。`ws.okx.com:8443/ws/v5/public` 提供的是行情与
 * 逐笔，不含蜡烛。
 */
export const OKX_STREAM_URL = "wss://ws.okx.com:8443/ws/v5/business";

/**
 * The bar sizes the push feed accepts, which is **not** the set REST accepts.
 * The endpoint answers `60018` for `candle5s`/`candle15s`/`candle30s` even though
 * `GET /market/candles` serves them happily, so offering the seconds here would
 * silently break the live path for a bar size that works offline.
 *
 * The four suffixes are not decoration: a bar with no `utc` aligns to UTC+8, so
 * `1D` opens at 16:00 UTC and `1Dutc` at 00:00 UTC. The two are different
 * candles, and a chart that labels one while showing the other is simply wrong.
 *
 * 推送源接受的周期档位，**不等于** REST 接受的那一组：端点对 `candle5s`/`candle15s`/`candle30s`
 * 回 `60018`，尽管 `GET /market/candles` 能正常提供它们。因此把秒级放进来，会让一个离线可用的
 * 档位在实时路径上悄悄失效。
 *
 * 四个后缀不是修饰：不带 `utc` 的档位按 UTC+8 对齐，因此 `1D` 起于 UTC 16:00，而 `1Dutc`
 * 起于 UTC 00:00。两者是不同的蜡烛，坐标轴标着其中一个却画着另一个，就是错的。
 */
export const OKX_STREAM_BARS = [
	"1s",
	"1m",
	"2m",
	"3m",
	"5m",
	"15m",
	"30m",
	"1H",
	"2H",
	"4H",
	"6H",
	"12H",
	"1D",
	"2D",
	"3D",
	"5D",
	"1W",
	"1M",
	"3M",
	"6Hutc",
	"12Hutc",
	"1Dutc",
	"2Dutc",
	"3Dutc",
	"1Wutc",
	"1Mutc",
	"3Mutc",
] as const;

/** One bar size the push feed accepts. 推送源接受的某一个周期档位。 */
export type OkxStreamBar = (typeof OKX_STREAM_BARS)[number];

/** The `candle` channel name prefix; a subscription is `<prefix><bar>`. `candle` 频道的名字前缀；一次订阅就是 `<前缀><档位>`。 */
const CHANNEL_PREFIX = "candle";

/**
 * Where a subscription stands, as a UI can show it.
 *
 * `reconnecting` is distinct from `connecting` on purpose: the first is a page
 * that has never had data, the second is a page that *had* data and lost it.
 * Only the second one needs its history fetched again, and a caller cannot tell
 * them apart from "not open".
 *
 * 一份订阅所处的状态，可供界面展示。
 *
 * `reconnecting` 与 `connecting` 刻意分开：前者是还没有过数据的页面，后者是**曾经**有过、
 * 后来丢掉的页面。只有后者需要重拉历史，而调用方无法从「没开着」中区分二者。
 */
export type OkxStreamStatus = "connecting" | "open" | "reconnecting" | "closed";

/**
 * What one subscriber is handed.
 *
 * `closed` says whether the candle is final *according to the source*: index 8 of
 * the pushed row is the venue's own statement, and `CONTEXT.md` records that the
 * chart must never infer it from a clock. Callers may ignore it — `klinecharts`
 * decides update-versus-append from the timestamp alone — but a caller that
 * wants to state "this candle is final" has the fact available.
 *
 * 交给某一个订阅者的东西。
 *
 * `closed` 说明这根蜡烛是否**按数据源的说法**已收盘：推送行的第 8 个字段就是数据源自己的
 * 声明，而 `CONTEXT.md` 记明图表不得凭时钟推断它。调用方可以忽略它 —— `klinecharts` 只凭
 * 时间戳决定「更新」还是「追加」—— 但若调用方想说「这根已定稿」，这个事实是拿得到的。
 */
export interface OkxStreamHandlers {
	onBar: (candle: OkxCandle, closed: boolean) => void;
	onStatus?: (status: OkxStreamStatus) => void;
}

/**
 * OKX asks for a text `ping` when a channel has been quiet, and drops the
 * connection without one. The candle channel is chatty, so this is insurance
 * rather than the normal path — but the promise is a connection that survives a
 * quiet market, and a quiet market is exactly when a page is left open.
 *
 * 频道安静太久时 OKX 要求发一条纯文本 `ping`，不发就断开。蜡烛频道很吵，因此这条是保险而非
 * 主路径 —— 但这里承诺的是「安静行情下连接仍活着」，而页面开着不动，往往正是行情安静的时候。
 */
const PING_MS = 20_000;

/**
 * Reconnect backoff: fast enough that a blip is invisible, capped so a page left
 * open on a laptop that lost its network does not hammer the venue.
 *
 * 重连退避：足够快，使一次抖动看不出来；有上限，使一台断网后仍开着的页面不会猛敲数据源。
 */
const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 30_000;

/**
 * `WebSocket.OPEN`, spelled out: the constant lives on the constructor, and the
 * hub is unit-tested against a stand-in that is not a `WebSocket` at all.
 *
 * `WebSocket.OPEN`，写成字面量：该常量挂在构造函数上，而本 hub 的单元测试对着一个根本不是
 * `WebSocket` 的替身运行。
 */
const SOCKET_OPEN = 1;

/** One channel's key: a subscription is per instrument *and* bar size. 一个频道的键：订阅按标的**与**周期区分。 */
function channelKey(instId: string, bar: string): string {
	return `${instId}:${bar}`;
}

/**
 * One socket for every subscriber, refcounted per channel.
 *
 * The reason it is a hub rather than one socket per chart is the multi-period
 * view: eight windows watching eight bar sizes would otherwise open eight
 * connections to the same endpoint, and a venue that rate-limits connections
 * would take the whole page down rather than one window.
 *
 * 一个 socket 服务所有订阅者，按频道引用计数。
 *
 * 之所以是 hub 而不是每图一个 socket，原因就是多周期视图：八个窗口看八个周期，否则会向同一端点
 * 开八条连接，而一个限制连接数的数据源会让整页下线，而不是只让一个窗口下线。
 */
export class OkxStream {
	private readonly socketFactory: (url: string) => WebSocket;
	/**
	 * Every subscriber, by channel. A `Map` of `Set` rather than a list of
	 * subscribers each holding a channel: the reconnect path has to walk the
	 * channels to re-subscribe them, and that walk should not be over an
	 * accumulation of everything ever subscribed.
	 *
	 * 全部订阅者，按频道分组。用 `Map` 套 `Set`，而不是让每个订阅者各自带一个频道：重连路径必须
	 * 遍历频道以重新订阅，而那次遍历不应发生在「曾经订阅过的一切」的堆积之上。
	 */
	private readonly subscribers = new Map<string, Set<OkxStreamHandlers>>();
	private socket: WebSocket | null = null;
	private statusValue: OkxStreamStatus = "closed";
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	/** Failed attempts since the last successful open; drives the backoff. 自上次成功打开以来的失败次数，决定退避时长。 */
	private attempts = 0;
	/** Whether a socket has ever been opened, which is what tells a reconnect from a first connect. 是否曾成功打开过，正是它把重连与首次连接区分开。 */
	private everOpened = false;

	constructor(socketFactory: (url: string) => WebSocket = (url) => new WebSocket(url)) {
		this.socketFactory = socketFactory;
	}

	/** Where the connection stands right now. 连接此刻的状态。 */
	status(): OkxStreamStatus {
		return this.statusValue;
	}

	/**
	 * Watch one instrument at one bar size. The returned function releases this
	 * subscriber and nothing else; the socket closes when the last one has gone.
	 *
	 * The handler object is the subscription's identity, so the same object may
	 * not be subscribed twice — which is why the React side always hands over a
	 * fresh closure.
	 *
	 * 以某一个周期观察某一个标的。返回的函数只释放这一个订阅者，不涉及他人；最后一个订阅者离开时
	 * socket 才关闭。
	 *
	 * 处理对象就是这份订阅的身份，因此同一个对象不能订阅两次 —— 这也是 React 侧总是交出一个新
	 * 闭包的原因。
	 */
	subscribe(instId: string, bar: string, handlers: OkxStreamHandlers): () => void {
		const key = channelKey(instId, bar);
		let set = this.subscribers.get(key);
		if (!set) {
			set = new Set();
			this.subscribers.set(key, set);
		}
		const isNewChannel = set.size === 0;
		set.add(handlers);

		if (this.statusValue === "closed") {
			// This subscriber is what starts the hub, so it hears "connecting" from the
			// connect itself rather than the "closed" that described the moment before
			// it arrived — a subscriber told "closed" would look for the wrong thing.
			// 正是这个订阅者启动了 hub，因此它听到的是连接本身的「连接中」，而不是它到达之前那一刻的
			// 「已停止」—— 收到「已停止」的订阅者会去找错误的东西。
			this.connect();
		} else {
			// Where things stand, *before* any push arrives, so a status row is honest
			// on its first render instead of claiming "live" until the first candle
			// shows up.
			// 在任何推送到达**之前**说明当前状态，使状态行第一次渲染就是诚实的，而不是一直宣称
			// 「实时」直到第一根蜡烛出现。
			handlers.onStatus?.(this.statusValue);
			if (this.statusValue === "open" && isNewChannel) {
				this.sendSubscribe([key]);
			}
		}

		return () => this.release(key, handlers);
	}

	/**
	 * Drops every subscriber and closes the socket. Used by tests and by anything
	 * that genuinely wants the feed gone; a component unmounting is not one of
	 * those, because it only owns its own subscription.
	 *
	 * 丢掉全部订阅者并关闭 socket。供测试以及确实要让数据源停下来的调用方使用；组件卸载不属于后者，
	 * 因为它只拥有自己那一份订阅。
	 */
	dispose(): void {
		this.subscribers.clear();
		this.stop();
	}

	/** Release one subscriber, and the channel and socket with it if they are the last. 释放一个订阅者；若它是最后一个，频道与 socket 一并释放。 */
	private release(key: string, handlers: OkxStreamHandlers): void {
		const set = this.subscribers.get(key);
		if (!set) return;
		set.delete(handlers);
		if (set.size > 0) return;

		this.subscribers.delete(key);
		if (this.subscribers.size > 0) return;
		this.stop();
	}

	/** Stop the timers, close the socket, and report the feed as gone. 停掉计时器、关闭 socket，并上报数据源已停止。 */
	private stop(): void {
		this.clearRetry();
		if (this.pingTimer !== null) {
			clearInterval(this.pingTimer);
			this.pingTimer = null;
		}
		const socket = this.socket;
		this.socket = null;
		if (socket) {
			// Detaching first: a socket told to close still fires `close`, and that
			// handler would otherwise schedule a reconnect for a feed nobody wants.
			// 先摘掉处理器：被要求关闭的 socket 仍会触发 `close`，否则那个处理器会为一个已无人需要的
			// 数据源安排重连。
			socket.onopen = null;
			socket.onmessage = null;
			socket.onclose = null;
			socket.onerror = null;
			socket.close();
		}
		// A hub with no subscribers is a hub that has never run as far as the next
		// subscriber is concerned: its first connect is a first connect, not a
		// recovery, and saying "reconnecting" would send it after history it has
		// never had.
		// 对下一位订阅者而言，一个没有订阅者的 hub 等于从未运行过：它的首次连接就是首次连接、不是
		// 恢复，说成「重连中」会让它去追一段从未有过的历史。
		this.everOpened = false;
		this.setStatus("closed");
	}

	private connect(): void {
		this.setStatus(this.everOpened ? "reconnecting" : "connecting");
		let socket: WebSocket;
		try {
			socket = this.socketFactory(OKX_STREAM_URL);
		} catch (error) {
			console.warn("[OKX stream] could not open the socket.", error);
			this.scheduleRetry();
			return;
		}
		this.socket = socket;

		socket.onopen = () => {
			this.attempts = 0;
			this.everOpened = true;
			this.setStatus("open");
			// Every channel, not just the new one: after a reconnect the socket has no
			// subscriptions of its own, and the map is the only record of what was asked
			// for before.
			// 所有频道，而不只是新的那个：重连后 socket 自身没有任何订阅，而这张表是「此前要过什么」
			// 的唯一记录。
			this.sendSubscribe([...this.subscribers.keys()]);
			this.pingTimer = setInterval(() => {
				if (this.socket?.readyState === SOCKET_OPEN) this.socket.send("ping");
			}, PING_MS);
		};

		socket.onmessage = (event: MessageEvent) => this.handleMessage(event.data);

		socket.onerror = (event: Event) => {
			// An error is never the end on its own — `close` follows — but a silent
			// failure is indistinguishable from a working feed that has nothing to say.
			// 错误本身从不代表结束 —— 随后会有 `close` —— 但一次无声的失败，与一个「没什么可说」的
			// 正常数据源无法区分。
			console.warn("[OKX stream] socket error.", event);
		};

		socket.onclose = () => {
			this.socket = null;
			if (this.pingTimer !== null) {
				clearInterval(this.pingTimer);
				this.pingTimer = null;
			}
			if (this.subscribers.size === 0) {
				this.setStatus("closed");
				return;
			}
			this.setStatus("reconnecting");
			this.scheduleRetry();
		};
	}

	private scheduleRetry(): void {
		if (this.retryTimer !== null) return;
		const delay = Math.min(RETRY_BASE_MS * 2 ** this.attempts, RETRY_MAX_MS);
		this.attempts += 1;
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			if (this.subscribers.size > 0) this.connect();
		}, delay);
	}

	private clearRetry(): void {
		if (this.retryTimer !== null) {
			clearTimeout(this.retryTimer);
			this.retryTimer = null;
		}
		this.attempts = 0;
	}

	private sendSubscribe(keys: string[]): void {
		const args = keys.map((key) => {
			const [instId, bar] = splitChannelKey(key);
			return { channel: `${CHANNEL_PREFIX}${bar}`, instId };
		});
		if (args.length > 0) this.send({ op: "subscribe", args });
	}

	private send(payload: unknown): void {
		const socket = this.socket;
		if (socket?.readyState !== SOCKET_OPEN) return;
		socket.send(JSON.stringify(payload));
	}

	private setStatus(next: OkxStreamStatus): void {
		if (this.statusValue === next) return;
		this.statusValue = next;
		for (const set of this.subscribers.values()) {
			for (const handlers of set) handlers.onStatus?.(next);
		}
	}

	/**
	 * One pushed frame. Two shapes arrive on this socket: JSON for data and
	 * events, and the bare text `pong` answering our `ping`. Anything unparseable
	 * is dropped rather than thrown, because a socket that dies on an unexpected
	 * frame is worse than one that ignores it.
	 *
	 * 一帧推送。这条 socket 上有两种形状：数据与事件是 JSON，回答我们 `ping` 的是纯文本 `pong`。
	 * 无法解析的一律丢弃而非抛出，因为一条遇到意外帧就死掉的 socket，比一条忽略它的更糟。
	 */
	private handleMessage(data: unknown): void {
		if (typeof data !== "string" || data === "pong") return;
		let payload: OkxStreamMessage;
		try {
			payload = JSON.parse(data) as OkxStreamMessage;
		} catch {
			return;
		}

		if (payload.event === "error") {
			console.warn(
				`[OKX stream] ${payload.code ?? ""} ${payload.msg ?? ""}`.trim(),
			);
			return;
		}

		const channel = payload.arg?.channel;
		const instId = payload.arg?.instId;
		if (typeof channel !== "string" || typeof instId !== "string") return;
		if (!channel.startsWith(CHANNEL_PREFIX)) return;
		const bar = channel.slice(CHANNEL_PREFIX.length);
		const handlers = this.subscribers.get(channelKey(instId, bar));
		if (!handlers || !payload.data) return;

		for (const row of payload.data) {
			// One row through the same parser REST goes through: the row layout is the
			// feed's fact, and a second reader of it is how the three copies in this
			// repo drifted apart in the first place.
			// 每一行都过 REST 所过的那同一个解析器：行格式是数据源的事实，而正是另写一个读取者，
			// 才让本仓库此前那三份副本各自漂移。
			const [candle] = parseOkxRows([row]);
			if (!candle) continue;
			for (const subscriber of handlers) {
				subscriber.onBar(candle, row[8] === "1");
			}
		}
	}
}

/** The parts of a channel key, back again. 把频道键拆回两部分。 */
function splitChannelKey(key: string): [string, string] {
	const at = key.indexOf(":");
	return [key.slice(0, at), key.slice(at + 1)];
}

/** The three fields of a pushed or event frame this module reads. 本模块会读取的推送 / 事件帧的三个字段。 */
interface OkxStreamMessage {
	event?: string;
	arg?: { channel?: string; instId?: string };
	data?: string[][];
	code?: string;
	msg?: string;
}

let shared: OkxStream | null = null;

/**
 * The process-wide socket. One per page, so that eight windows watching eight bar
 * sizes share one connection instead of opening eight.
 *
 * 进程级的 socket。每页一个，使八个窗口看八个周期时共用一条连接，而不是开八条。
 */
export function sharedOkxStream(): OkxStream {
	shared ??= new OkxStream();
	return shared;
}
