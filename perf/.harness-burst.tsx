/**
 * The benchmark page: mounts any of the three Pro Wrappers into a fixed
 * container and exposes the measurements a Playwright driver asks for. It
 * renders nothing on its own — `scripts/bench-charts.mjs` decides the matrix and
 * reads the results.
 *
 * 基准页面：把三个 Pro Wrapper 中的任意一个挂进固定尺寸容器，并把 Playwright 驱动要读的
 * 测量值挂到 `window.__perf`。它自己不渲染任何东西 —— 矩阵由
 * `scripts/bench-charts.mjs` 决定、结果也由它读取。
 */

import type { KLineChartPro } from "@klinecharts/pro";
// Two klinecharts versions live on this page, so the registries have to be asked
// for by name — reading them from a bare `klinecharts` would silently mean
// whichever version the resolver happened to pick.
//
// `klinecharts-v9` is what `KChartPro` draws from, so it is the only honest
// source for that column's counts. Bare `klinecharts` is v10, which is what
// `AdaChartPro` draws from (via `AdaChart`), so it is asked separately. Keeping
// the two apart is what makes the three feature counts comparable instead of
// accidentally identical.
//
// 本页同时存在两个 klinecharts 版本，因此注册表必须按名索取 —— 从裸 `klinecharts` 读会
// 静默地取到解析器恰好选中的那一版。
//
// `klinecharts-v9` 是 `KChartPro` 取用的那一份，也就是它那一列数字唯一诚实的来源；裸
// `klinecharts` 是 v10，`AdaChartPro` 经由 `AdaChart` 取用的正是它，所以单独去问。把两者
// 分开，三组功能数量才是可比的，而不是碰巧相等。
import { getSupportedIndicators, getSupportedOverlays } from "klinecharts";
import {
	getSupportedIndicators as getSupportedIndicatorsV9,
	getSupportedOverlays as getSupportedOverlaysV9,
} from "klinecharts-v9";
import { getToolRegistry } from "lightweight-charts-drawing";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import AdaChartPro, {
	type AdaChartProApi,
} from "../src/components/adachart-pro/AdaChartPro";
import KChartPro from "../src/components/klinecharts-pro/KChartPro";
import TChartPro, {
	type TChartProApi,
	type TChartProDatafeed,
} from "../src/components/lightweight-charts-pro/TChartPro";
import { TCHARTPRO_INDICATORS } from "../src/components/lightweight-charts-pro/t-chart-pro-options";
import { continueCandles, makeCandles, type PerfCandle } from "./dataset";
import {
	adaChartProFeed,
	kChartFeed,
	PERF_PERIOD,
	PERF_PERIOD_V10,
	PERF_SYMBOL,
	PERF_SYMBOL_V10,
	tChartFeed,
} from "./feeds";

export type Engine = "t-chart-pro" | "k-chart-pro" | "ada-chart-pro";

export interface MountOptions {
	engine: Engine;
	bars: number;
	indicators: boolean;
	seed?: number;
}

export interface MountResult {
	engine: Engine;
	bars: number;
	indicators: boolean;
	/** ms from render call to `onChartReady`. 从 render 调用到 `onChartReady` 的毫秒数。 */
	engineReadyMs: number;
	/** ms from render call to the bars being on screen. 从 render 调用到 K 线出现在屏幕上的毫秒数。 */
	firstPaintMs: number;
	/** Retained JS heap after mount, minus the baseline, in MB. 挂载后相对基线的常驻 JS 堆，单位 MB。 */
	retainedHeapMB: number | null;
	/** Elements inside the chart container. 图表容器内的元素个数。 */
	domNodes: number;
	/** Canvas elements inside the chart container. 图表容器内的 canvas 个数。 */
	canvases: number;
	/**
	 * Which signal decided that the bars were on screen. Recorded so the report
	 * can say how each number was established instead of asking for trust.
	 *
	 * 判定「K 线已在屏幕上」所用的是哪个信号。记录下来，报告就能说明每个数字是怎么得出
	 * 的，而不是要求读者相信。
	 */
	readySignal: "series-data" | "loading-spinner" | "frame-fallback";
}

export interface StreamResult {
	count: number;
	/** Total synchronous cost of the pushes themselves. 推送本身的同步耗时总和。 */
	dispatchMs: number;
	/** Wall time for the whole sequence, one update per frame. 整段序列的墙钟时间，每帧一次更新。 */
	windowMs: number;
	/** Main-thread long-task time inside the window. 窗口内主线程长任务耗时。 */
	longTaskMs: number;
	longTasks: number;
	/** ms per update, dispatch side. 每次更新的同步耗时。 */
	avgDispatchMs: number;
}

export interface InteractionResult {
	steps: number;
	kind: "pan" | "zoom";
	syncMs: number;
	avgSyncMs: number;
	windowMs: number;
	longTaskMs: number;
	longTasks: number;
	/**
	 * ms the canvas kept repainting after the last event, or `null` when the
	 * context is not readable. Dispatching a wheel event is cheap for both
	 * engines; what differs is how long they keep redrawing afterwards.
	 *
	 * 最后一次事件之后 canvas 继续重绘的毫秒数；上下文不可读时为 `null`。对两套引擎
	 * 来说派发滚轮事件都很便宜，真正的差别在于之后还要重绘多久。
	 */
	settleMs: number | null;
}

export interface HarnessApi {
	ready: boolean;
	features: () => Record<string, number>;
	/** Measured median frame interval, the budget an update has to fit in. 实测的帧间隔中位数，也就是一次更新必须塞进去的预算。 */
	frameMs: () => Promise<number>;
	mount: (options: MountOptions) => Promise<MountResult>;
	stream: (count: number) => Promise<StreamResult>;
	interact: (kind: "pan" | "zoom", steps: number) => Promise<InteractionResult>;
	unmount: () => void;
	heapMB: () => number | null;
}

const WIDTH = 900;
const HEIGHT = 520;
/** The fuller indicator stack both Wrappers' docs stories use. 两个 Wrapper 文档 story 都用的那套完整指标。 */
const INDICATOR_STACK = {
	main: ["MA", "BOLL", "EMA"],
	sub: ["VOL", "MACD", "RSI"],
};

// --------------------------------------------------------------- timing helpers

function nextFrame(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => resolve());
	});
}

/** Let the engine paint: a few frames is what both libraries need to settle. 让引擎画完：几帧足够两个库稳定下来。 */
async function settle(frames = 3): Promise<void> {
	for (let index = 0; index < frames; index += 1) await nextFrame();
}

async function waitUntil(
	predicate: () => boolean,
	timeoutMs = 15_000,
): Promise<boolean> {
	const deadline = performance.now() + timeoutMs;
	while (performance.now() < deadline) {
		if (predicate()) return true;
		await nextFrame();
	}
	return false;
}

function memoryOf(): { usedJSHeapSize: number } | null {
	const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } })
		.memory;
	return memory ?? null;
}

function heapMB(): number | null {
	const memory = memoryOf();
	return memory ? memory.usedJSHeapSize / 1_048_576 : null;
}

function collectGarbage(): void {
	(window as unknown as { gc?: () => void }).gc?.();
}

/**
 * Runs `work` with a long-task observer attached: the browser reports every task
 * over 50 ms, which is the number that actually predicts a janky chart.
 *
 * 在挂上长任务观察器的情况下运行 `work`：浏览器会报告每个超过 50ms 的任务，而这才是
 * 真正预示图表卡顿的那个数字。
 */
async function measure(work: () => Promise<void>): Promise<{
	windowMs: number;
	longTaskMs: number;
	longTasks: number;
}> {
	let longTaskMs = 0;
	let longTasks = 0;
	const observer = new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) {
			longTaskMs += entry.duration;
			longTasks += 1;
		}
	});
	try {
		observer.observe({ entryTypes: ["longtask"] });
	} catch {
		// A runtime without longtask entries simply reports zero.
		// 不支持 longtask 的运行时报告 0 即可。
	}
	const started = performance.now();
	await work();
	const windowMs = performance.now() - started;
	observer.disconnect();
	return { windowMs, longTaskMs, longTasks };
}

// ------------------------------------------------------------------- lifecycle

interface LiveMount {
	engine: Engine;
	root: Root;
	container: HTMLDivElement;
	feed: { push: (candle: PerfCandle) => void; subscribed: () => boolean };
	tChartApi: TChartProApi | null;
	lastCandle: PerfCandle;
}

let live: LiveMount | null = null;

function unmount(): void {
	if (!live) return;
	try {
		live.root.unmount();
	} catch (error) {
		console.warn("[perf] unmount failed", error);
	}
	live.container.remove();
	live = null;
}

function chartCanvas(frame: HTMLElement): HTMLCanvasElement | null {
	return frame.querySelector("canvas");
}

/**
 * Resolves when `KLineChartPro` takes its own loading spinner off screen — the
 * only readiness evidence that engine publishes, since its data and chart
 * instances are private.
 *
 * A MutationObserver rather than a per-frame poll: with a local feed the spinner
 * exists for about one macrotask, and a poll that samples once per frame would
 * miss it, burn the timeout, and report a fake number.
 *
 * `KLineChartPro` 把自带的 loading 指示器收起时 resolve —— 这是该引擎发布的唯一就绪
 * 证据，因为它的数据和图表实例都是私有的。
 *
 * 用 MutationObserver 而不是逐帧轮询：面对本地数据源，指示器只存在大约一个宏任务，
 * 逐帧采样的轮询会错过它、白等满超时，然后报出一个假数字。
 */
function watchProLoading(
	container: HTMLElement,
	timeoutMs = 10_000,
): Promise<boolean> {
	return new Promise((resolve) => {
		const selector = ".klinecharts-pro-loading";
		let seen = false;
		let done = false;
		let observer: MutationObserver | null = null;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const stop = (found: boolean) => {
			if (done) return;
			done = true;
			observer?.disconnect();
			if (timer !== null) clearTimeout(timer);
			resolve(found);
		};
		const check = () => {
			if (container.querySelector(selector)) {
				seen = true;
			} else if (seen) {
				stop(true);
			}
		};
		observer = new MutationObserver(check);
		timer = setTimeout(() => stop(false), timeoutMs);
		observer.observe(container, { childList: true, subtree: true });
		check();
	});
}

/**
 * A cheap rolling hash of the pixels in the middle of the canvas. FNV-1a over
 * every fourth byte (one channel of each pixel) — enough to notice that a
 * repaint happened, cheap enough to run once per frame.
 *
 * canvas 中央像素的廉价滚动哈希。对每第四个字节（每个像素的一个通道）做 FNV-1a ——
 * 足以发现发生过重绘，又便宜到可以每帧跑一次。
 */
function canvasSignature(canvas: HTMLCanvasElement): number | null {
	const context = canvas.getContext("2d");
	if (!context) return null;
	const side = 200;
	const width = Math.min(side, canvas.width);
	const height = Math.min(side, canvas.height);
	if (width <= 0 || height <= 0) return null;
	const x = Math.floor((canvas.width - width) / 2);
	const y = Math.floor((canvas.height - height) / 2);
	const pixels = context.getImageData(x, y, width, height).data;
	let hash = 2_166_136_261;
	for (let index = 0; index < pixels.length; index += 4) {
		hash = (hash ^ pixels[index]) * 16_777_619;
	}
	return hash >>> 0;
}

/**
 * How long the canvas keeps changing once the input stops. Returns `null` for a
 * context that cannot be read back (a WebGL pane, say), so the report can tell
 * "did not settle" apart from "cannot tell".
 *
 * 输入停止后 canvas 还要变多久。对无法回读的上下文（比如 WebGL 面板）返回 `null`，
 * 使报告能区分「没有稳定下来」和「无法判断」。
 */
async function waitForStableCanvas(
	canvas: HTMLCanvasElement,
): Promise<number | null> {
	const first = canvasSignature(canvas);
	if (first === null) return null;
	const started = performance.now();
	let previous = first;
	let stableFrames = 0;
	while (performance.now() - started < 2_000) {
		await nextFrame();
		const current = canvasSignature(canvas);
		if (current === previous) {
			stableFrames += 1;
			if (stableFrames >= 2) return performance.now() - started;
		} else {
			stableFrames = 0;
		}
		previous = current;
	}
	return performance.now() - started;
}

// ------------------------------------------------------------------------ api

async function mount(options: MountOptions): Promise<MountResult> {
	unmount();
	// Two collect-and-drain passes: a single `gc()` leaves a large short-lived
	// population from the previous mount, which showed up as a *negative* heap
	// delta on the smaller engine. Two passes with a frame in between let the
	// incremental steps finish before the baseline is trusted.
	// 两轮「回收 + 排空」：只调一次 `gc()` 会留下上一次挂载的大量短命对象，在较轻的那个
	// 引擎上甚至量出过负的堆增量。两轮回收之间隔一帧，让增量回收也走完再取基线。
	collectGarbage();
	await settle(3);
	collectGarbage();
	await settle(1);
	const baselineHeap = heapMB();

	const container = document.createElement("div");
	Object.assign(container.style, {
		position: "fixed",
		left: "0",
		top: "0",
		width: `${WIDTH}px`,
		height: `${HEIGHT}px`,
		contain: "strict",
	} satisfies Partial<CSSStyleDeclaration>);
	document.body.appendChild(container);

	const root = createRoot(container);
	const candles = makeCandles(options.bars, options.seed ?? 42);
	const lastCandle = candles[candles.length - 1];

	let markEngineReady!: (value: number) => void;
	const engineReady = new Promise<number>((resolve) => {
		markEngineReady = resolve;
	});

	const indicators = options.indicators ? INDICATOR_STACK : { main: [], sub: [] };
	const started = performance.now();

	if (options.engine === "t-chart-pro") {
		const handle = tChartFeed(candles);
		let api: TChartProApi | null = null;
		root.render(
			createElement(TChartPro, {
				datafeed: handle.feed as TChartProDatafeed,
				barSize: "1D",
				autoSize: false,
				width: WIDTH,
				height: HEIGHT,
				drawingBarVisible: true,
				mainIndicators: indicators.main,
				subIndicators: indicators.sub,
				onChartReady: (instance: TChartProApi) => {
					api = instance;
					markEngineReady(performance.now() - started);
				},
			}),
		);
		live = {
			engine: options.engine,
			root,
			container,
			feed: handle,
			tChartApi: null,
			lastCandle,
		};
		const engineReadyMs = await engineReady;
		const withApi = live as LiveMount;
		withApi.tChartApi = api;
		// The bars are on screen exactly when the main series holds them all —
		// the only readiness signal `TChartPro` exposes. Then one frame: the data
		// application itself is synchronous, the paint it triggers is not, and
		// `KChartPro`'s number pays the same frame so the two stay comparable.
		// 主系列持有全部 K 线时，它们就在屏幕上了 —— 这是 `TChartPro` 给出的唯一就绪信号。
		// 之后再等一帧：数据写入是同步的，它触发的绘制不是；`KChartPro` 的数字也付同样
		// 一帧，两者才可比。
		await waitUntil(() => (api?.mainSeries()?.data()?.length ?? 0) >= options.bars);
		await nextFrame();
		const firstPaintMs = performance.now() - started;
		return finish(
			options,
			engineReadyMs,
			firstPaintMs,
			baselineHeap,
			container,
			"series-data",
		);
	}

	if (options.engine === "ada-chart-pro") {
		const handle = adaChartProFeed(candles);
		let api: AdaChartProApi | null = null;
		root.render(
			createElement(AdaChartPro, {
				dataLoader: handle.feed,
				symbol: PERF_SYMBOL_V10,
				period: PERF_PERIOD_V10,
				autoSize: false,
				width: WIDTH,
				height: HEIGHT,
				drawingBarVisible: true,
				mainIndicators: indicators.main,
				subIndicators: indicators.sub,
				onChartReady: (instance: AdaChartProApi) => {
					api = instance;
					markEngineReady(performance.now() - started);
				},
			}),
		);
		live = {
			engine: options.engine,
			root,
			container,
			feed: handle,
			tChartApi: null,
			lastCandle,
		};
		const engineReadyMs = await engineReady;
		// The same readiness test the `TChartPro` branch uses, reached through
		// v10's own accessor instead of an `ISeriesApi`: the bars are on screen
		// exactly when the chart's data list holds them all. `AdaChartPro` does not
		// publish the underlying instance until `onChartReady`, so `api` may still be
		// `null` on the first poll — hence the optional chain.
		// 与 `TChartPro` 分支同一个就绪判定，只是改用 v10 自己的访问器而非 `ISeriesApi`：
		// 图表的 data list 持有全部 K 线时，它们就在屏幕上了。`AdaChartPro` 要等到
		// `onChartReady` 才交出底层实例，因此首轮轮询时 `api` 可能仍是 `null` —— 故用可选链。
		await waitUntil(
			() => (api?.chart()?.getDataList().length ?? 0) >= options.bars,
		);
		await nextFrame();
		const firstPaintMs = performance.now() - started;
		return finish(
			options,
			engineReadyMs,
			firstPaintMs,
			baselineHeap,
			container,
			"series-data",
		);
	}

	const handle = kChartFeed(candles);
	// Observing starts before render: the spinner this engine shows while history
	// is in flight is the only data-true signal it publishes.
	// 观察在 render 之前就挂上：该引擎在拉取历史期间显示的指示器，是它发布的唯一与数据
	// 真实相关的信号。
	const loadingGone = watchProLoading(container);
	root.render(
		createElement(KChartPro, {
			datafeed: handle.feed,
			period: PERF_PERIOD,
			symbol: PERF_SYMBOL,
			autoSize: false,
			width: WIDTH,
			height: HEIGHT,
			drawingBarVisible: true,
			mainIndicators: indicators.main,
			subIndicators: indicators.sub,
			onChartReady: (_instance: KLineChartPro) => {
				markEngineReady(performance.now() - started);
			},
		}),
	);
	live = {
		engine: options.engine,
		root,
		container,
		feed: handle,
		tChartApi: null,
		lastCandle,
	};
	const engineReadyMs = await engineReady;
	await handle.historyDone;
	// `KLineChartPro` publishes no data accessor, so the spinner going away is the
	// closest thing to proof that the bars landed. The one frame afterwards is the
	// paint, matching what `TChartPro`'s branch pays.
	// `KLineChartPro` 不提供数据访问接口，因此指示器消失就是「K 线已经落地」最接近的
	// 证据。之后那一帧是绘制，与 `TChartPro` 分支付的代价一致。
	const sawLoading = await loadingGone;
	if (!sawLoading) await settle(2);
	await nextFrame();
	const firstPaintMs = performance.now() - started;
	return finish(
		options,
		engineReadyMs,
		firstPaintMs,
		baselineHeap,
		container,
		sawLoading ? "loading-spinner" : "frame-fallback",
	);
}

async function finish(
	options: MountOptions,
	engineReadyMs: number,
	firstPaintMs: number,
	baselineHeap: number | null,
	container: HTMLDivElement,
	readySignal: MountResult["readySignal"],
): Promise<MountResult> {
	// Settle, then a real collection, then one more frame: the retained number is
	// what survives GC, not what happened to be allocated at read time.
	// 先稳定、再真正回收、然后再走一帧：常驻量指的是回收后仍存活的部分，而不是读取那一刻
	// 恰好分配出来的部分。
	collectGarbage();
	await settle(2);
	collectGarbage();
	const afterHeap = heapMB();
	return {
		engine: options.engine,
		bars: options.bars,
		indicators: options.indicators,
		engineReadyMs,
		firstPaintMs,
		retainedHeapMB:
			baselineHeap !== null && afterHeap !== null
				? Math.round((afterHeap - baselineHeap) * 100) / 100
				: null,
		domNodes: container.querySelectorAll("*").length,
		canvases: container.querySelectorAll("canvas").length,
		readySignal,
	};
}

/** Drive the live path: one update per frame, so every update gets its own render pass. 驱动实时通道：每帧一次更新，使每次更新都有自己的渲染轮次。 */
async function stream(count: number): Promise<StreamResult> {
	if (!live) throw new Error("stream() needs a mounted chart");
	const current = live;
	const updates = Array.from({ length: count }, (_, index) => {
		const close = current.lastCandle.close + (index + 1) * 0.000001;
		return { ...current.lastCandle, close, high: Math.max(current.lastCandle.high, close), low: Math.min(current.lastCandle.low, close) };
	});
	let dispatchMs = 0;
	const totals = await measure(async () => {
		for (const candle of updates) {
			const begin = performance.now();
			current.feed.push(candle);
			dispatchMs += performance.now() - begin;
		}
		await nextFrame();
	});
	return {
		count,
		dispatchMs: round3(dispatchMs),
		windowMs: round3(totals.windowMs),
		longTaskMs: round3(totals.longTaskMs),
		longTasks: totals.longTasks,
		avgDispatchMs: round3(dispatchMs / count),
	};
}

/**
 * Synthetic wheel input over the chart canvas: `pan` scrolls the time axis,
 * `zoom` scales it. Both engines take untrusted wheel events, so the same script
 * drives either one.
 *
 * 图表 canvas 上的合成滚轮输入：`pan` 平移时间轴，`zoom` 缩放时间轴。两套引擎都接受
 * 非受信的滚轮事件，因此同一段脚本可以驱动任意一个。
 */
async function interact(
	kind: "pan" | "zoom",
	steps: number,
): Promise<InteractionResult> {
	if (!live) throw new Error("interact() needs a mounted chart");
	const canvas = chartCanvas(live.container);
	if (!canvas) throw new Error("no canvas in the chart container");
	const box = live.container.getBoundingClientRect();
	const clientX = box.left + box.width / 2;
	const clientY = box.top + box.height / 2;

	let syncMs = 0;
	let settleMs: number | null = null;
	const totals = await measure(async () => {
		for (let step = 0; step < steps; step += 1) {
			const event = new WheelEvent("wheel", {
				bubbles: true,
				cancelable: true,
				clientX,
				clientY,
				deltaX: kind === "pan" ? -240 : 0,
				deltaY: kind === "zoom" ? -120 : 0,
				ctrlKey: kind === "zoom",
			});
			const begin = performance.now();
			canvas.dispatchEvent(event);
			syncMs += performance.now() - begin;
			await nextFrame();
		}
		settleMs = await waitForStableCanvas(canvas);
	});
	return {
		steps,
		kind,
		syncMs: round3(syncMs),
		avgSyncMs: round3(syncMs / steps),
		windowMs: round3(totals.windowMs),
		longTaskMs: round3(totals.longTaskMs),
		longTasks: totals.longTasks,
		settleMs: settleMs === null ? null : round3(settleMs),
	};
}

/** Median interval between empty frames: the vsync the engine has to fit into. 空帧之间的间隔中位数：引擎必须塞进去的那个刷新周期。 */
async function measureFrameMs(samples = 45): Promise<number> {
	const stamps: number[] = [];
	for (let index = 0; index < samples; index += 1) {
		await nextFrame();
		stamps.push(performance.now());
	}
	const intervals = stamps.slice(1).map((value, index) => value - stamps[index]);
	intervals.sort((left, right) => left - right);
	return round3(intervals[Math.floor(intervals.length / 2)]);
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

const api: HarnessApi = {
	ready: true,
	// Counts read from the libraries' own registries rather than a hand-kept list,
	// so the report cannot drift from what the code actually offers. Each engine is
	// asked in its own vocabulary, and the two klinecharts columns read two
	// different versions — see the import note above.
	// 数量取自各库自己的注册表，而不是手维护的清单，因此报告不会和代码实际提供的东西脱节。
	// 每个引擎按自己的词汇去问，两个 klinecharts 列读的是两个不同版本 —— 见上方的 import 说明。
	features: () => ({
		tChartProIndicators: TCHARTPRO_INDICATORS.length,
		tChartProDrawingTools: getToolRegistry().getAll().length,
		kChartProIndicators: getSupportedIndicatorsV9().length,
		kChartProOverlays: getSupportedOverlaysV9().length,
		adaChartProIndicators: getSupportedIndicators().length,
		adaChartProOverlays: getSupportedOverlays().length,
	}),
	frameMs: measureFrameMs,
	mount,
	stream,
	interact,
	unmount,
	heapMB,
};

declare global {
	interface Window {
		__perf: HarnessApi;
	}
}

window.__perf = api;