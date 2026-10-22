import type { Chart, Coordinate, Crosshair, Point } from "klinecharts";

/**
 * Linking several `AdaChart` instances that watch different bar sizes: which
 * instant a pointer is on, where that instant sits in each window, and the three
 * moves that carry one window's view to the rest.
 *
 * ADR-0004 settles *that* multiple periods are multiple instances, not *how*
 * instances line up. This module is that second answer, and it exists because
 * the rules were first written inside `AdaChart.stories.tsx`: everything here is
 * engine knowledge — `convertFromPixel`, `convertToPixel`, `getVisibleRange`,
 * `getDataList`, and the fact that a crosshair must be cleared with `undefined`
 * rather than `{}` — which belongs in the library rather than in one story's
 * wiring. The grid story is the first caller; the layout, the data assembly and
 * the period selectors stay on the application side.
 *
 * Two facts drive the design:
 *
 * - The **crosshair** is linked by *timestamp*, never by pixel. A 1-minute
 *   window and a 1-day window put the same moment hundreds of pixels apart, so
 *   the source's pixel becomes a timestamp in its own coordinates and that
 *   timestamp becomes a pixel again in each target's.
 * - **Scroll and zoom are linked only when asked**, and each aligns on the one
 *   thing two bar sizes share: scroll keeps the same *right-edge instant*,
 *   zoom the same *number of visible candles*.
 *
 * 联动多个看不同周期的 `AdaChart` 实例：指针落在哪一时刻、该时刻在每个窗口的哪里，以及把
 * 一个窗口的视野带给其余窗口的三种移动。
 *
 * ADR-0004 定下的是「多周期即多个实例」，而不是「实例之间怎么对齐」。本模块是后一个答案，
 * 它之所以存在，是因为这些规则最初写在 `AdaChart.stories.tsx` 里：这里的一切都是引擎知识 ——
 * `convertFromPixel`、`convertToPixel`、`getVisibleRange`、`getDataList`，以及「光标必须用
 * `undefined` 而不是 `{}` 清除」这件事 —— 应当属于库，而不是某个 story 的接线。网格 story 是
 * 第一个调用方；布局、数据装配与周期选择仍留在应用侧。
 *
 * 两件事决定了形状：
 *
 * - **十字光标**按*时间戳*联动，绝不按像素。1 分钟窗口与 1 天窗口会把同一时刻放在相隔数百
 *   像素处，因此先把源窗口的像素变成它自己坐标里的时间戳，再把这个时间戳变回每个目标窗口的像素。
 * - **滚动与缩放只在被要求时联动**，且各自对齐两个周期真正共有的东西：滚动对齐*右边缘的那一刻*，
 *   缩放对齐*可见蜡烛的根数*。
 */

/**
 * The pane id `klinecharts` gives the price pane. `AdaChart` keeps its copy
 * private, so callers of this module spell it out too: it is the pane the linked
 * crosshair is mirrored into, and the pane whose width decides whether a
 * timestamp is on screen at all.
 *
 * `klinecharts` 赋予价格面板的 id。`AdaChart` 那份是私有的，因此本模块的调用方也写明它：
 * 联动十字光标正是镜像进这个面板，而「某个时间戳是否在屏幕上」也由它的宽度决定。
 */
export const CANDLE_PANE = "candle_pane";

/**
 * The main-pane pixel for a timestamp, or `undefined` when this window cannot
 * place the moment on screen at all — off its visible range, or before the first
 * candle it holds. The pixel is checked here rather than by the caller because
 * "off the left edge" and "off the right edge" both come back as numbers.
 *
 * 某个时间戳在主图上的像素；当该窗口根本放不下这一时刻时（不在可见区间内，或早于它持有的
 * 第一根）为 `undefined`。检查放在这里而不是调用方，是因为「越过左边缘」与「越过右边缘」
 * 都会以数字的形式返回。
 */
export function panePixel(
	chart: Chart,
	timestamp: number,
): number | undefined {
	const { x } = chart.convertToPixel(
		{ timestamp },
		{ paneId: CANDLE_PANE },
	) as Partial<Coordinate>;
	if (typeof x !== "number") return undefined;
	const bounding = chart.getSize(CANDLE_PANE, "main");
	if (!bounding || x < 0 || x > bounding.width) return undefined;
	return x;
}

/**
 * Whether a window's series covers an instant; false when the moment precedes
 * its oldest candle.
 *
 * The check is one-sided because the two ends of a series are not symmetrical.
 * The newest bar stands for everything after it — a day bar drawn at midnight is
 * today, whatever the hour the pointer happens to be in — so a moment past the
 * right edge still has a bar to land on. Before the first bar there is nothing,
 * and the engine nevertheless answers such a moment with its nearest bar; a
 * window whose history stops short would therefore draw the crosshair on its
 * oldest candle and name an instant nobody pointed at.
 *
 * 某个窗口的序列是否覆盖某一时刻；该时刻早于它最老的一根蜡烛时为否。
 *
 * 这个检查只朝一边，因为序列的两端并不对称。最新一根代表它之后的一切 —— 画在零点的日线就是
 * 「今天」，无论指针此刻在哪个钟点 —— 因此越过右边缘的时刻仍有一根可以落上去。而在第一根之前
 * 什么都没有，引擎却仍会就近答复；历史不够久远的窗口于是会把十字光标画在它最老的那根蜡烛上，
 * 指出的却是一个没人指着的时刻。
 */
export function coversInstant(chart: Chart, timestamp: number): boolean {
	const [first] = chart.getDataList();
	return typeof first?.timestamp === "number" && timestamp >= first.timestamp;
}

/** How many candles a window is showing; what zoom is linked by. 窗口正在显示多少根蜡烛；zoom 联动以此对齐。 */
export function visibleBarCount(chart: Chart): number | undefined {
	const range = chart.getVisibleRange();
	if (!range) return undefined;
	// `to` is clamped to the data length while `realTo` is not, so the count has
	// to come from `to`: `realTo` keeps counting into empty space to the right.
	// `to` 会被限制在数据长度内而 `realTo` 不会，因此根数只能取 `to`：`realTo` 会继续数向右侧
	// 的空白。
	const count = range.to - range.from;
	return count > 0 ? count : undefined;
}

/**
 * The instant at a window's right edge — what scroll is linked by.
 *
 * The right edge is the only thing two bar sizes can agree on about position:
 * "how far back am I" is a different question at each period, while "how recent
 * is what I am showing" is the same question everywhere.
 *
 * 窗口右边缘的那一时刻 —— 滚动联动以此对齐。
 *
 * 右边缘是两个周期在「位置」上唯一能达成一致的东西：「我往回走了多远」在每个周期上都是不同的
 * 问题，而「我显示的东西有多新」到哪里都是同一个问题。
 */
export function rightEdgeTimestamp(chart: Chart): number | undefined {
	const range = chart.getVisibleRange();
	const list = chart.getDataList();
	const edge = range ? list[Math.min(range.to, list.length) - 1] : undefined;
	const timestamp = edge?.timestamp;
	return typeof timestamp === "number" ? timestamp : undefined;
}

export interface ChartLinkage {
	/** Register a mounted window. 登记一个已挂载的窗口。 */
	register(id: number, chart: Chart): void;
	/** Forget a window that was closed, remounted or disposed. 忘掉一个已关闭、重挂或销毁的窗口。 */
	unregister(id: number): void;
	/** The window's chart, if it is registered. 该窗口的图表，若已登记。 */
	get(id: number): Chart | undefined;
	/** Mirror a window's scroll to the others as the same right-edge instant, when linked. 滚动联动时，把该窗口的滚动以同一右边缘时刻带给其它窗口。 */
	mirrorScroll(sourceId: number, linked: boolean): void;
	/** Mirror a window's zoom to the others as the same visible-bar count, when linked. 缩放联动时，把该窗口的缩放以同一可见根数带给其它窗口。 */
	mirrorZoom(sourceId: number, linked: boolean): void;
	/** Mirror a pointer's x-pixel to every window that holds the instant. 把指针的 x 像素镜像进每个持有该时刻的窗口。 */
	mirrorCrosshair(sourceId: number, data: unknown, scrollLinked: boolean): void;
	/** Clear every mirrored crosshair, as the engine does when a pointer leaves. 清除每一处被镜像的光标，与引擎在指针离开时对自己所做的一致。 */
	clearCrosshairs(): void;
}

/**
 * Create the registry and the moves over it.
 *
 * The `applying` flag is why this is an object rather than a handful of
 * functions: every programmatic move still fires the engine's own actions —
 * `scrollToTimestamp` goes through `scroll`, which fires `onScroll`;
 * `setBarSpace` re-runs the visible range — so without a mute a scroll performed
 * on window B would read as the reader having scrolled B, and would be passed on
 * to A and C, which would pass it back. One flag around the whole loop is
 * enough because the moves never nest.
 *
 * The two switches are taken as arguments rather than held here: they are UI
 * state, and "off means no-op" is the only part of them this module decides.
 *
 * 创建登记表及其上的各个移动。
 *
 * `applying` 标志正是它必须是一个对象、而不是几个散函数的原因：每一次程序化移动仍然会触发
 * 引擎自己的动作 —— `scrollToTimestamp` 经由 `scroll`，会触发 `onScroll`；`setBarSpace`
 * 会重算可见区间 —— 若没有这层静音，对窗口 B 做的一次滚动会被读成「读者滚动了 B」，继而传给
 * A 和 C，而它们又会传回来。整轮循环共用这一个标志就够了，因为这些移动不会嵌套。
 *
 * 两个开关作为参数传入而不是由本模块持有：它们是界面状态，本模块只决定「关掉即空操作」。
 */
export function createChartLinkage(): ChartLinkage {
	const charts = new Map<number, Chart>();
	let applying = false;

	const muted = (move: () => void) => {
		applying = true;
		try {
			move();
		} finally {
			applying = false;
		}
	};

	return {
		register(id, chart) {
			charts.set(id, chart);
		},
		unregister(id) {
			charts.delete(id);
		},
		get(id) {
			return charts.get(id);
		},
		mirrorScroll(sourceId, linked) {
			if (!linked || applying) return;
			const source = charts.get(sourceId);
			if (!source) return;
			const timestamp = rightEdgeTimestamp(source);
			if (timestamp === undefined) return;
			muted(() => {
				for (const [id, chart] of charts) {
					if (id !== sourceId) chart.scrollToTimestamp(timestamp);
				}
			});
		},
		mirrorZoom(sourceId, linked) {
			if (!linked || applying) return;
			const source = charts.get(sourceId);
			if (!source) return;
			const count = visibleBarCount(source);
			if (count === undefined) return;
			muted(() => {
				for (const [id, chart] of charts) {
					if (id === sourceId) continue;
					const own = visibleBarCount(chart);
					if (own === undefined) continue;
					// `setBarSpace` refuses a space outside the configured limits, so a
					// count one of these panes cannot reach is declined rather than
					// clamped — the window keeps a width the reader chose.
					// `setBarSpace` 会拒绝超出配置上下限的栏宽，因此某个面板达不到的根数是被拒绝而不是被
					// 钳制 —— 该窗口保留读者选定的宽度。
					chart.setBarSpace((own * chart.getBarSpace().bar) / count);
				}
			});
		},
		mirrorCrosshair(sourceId, data, scrollLinked) {
			const source = charts.get(sourceId);
			const x = (data as Partial<Coordinate> | undefined)?.x;
			if (!source || typeof x !== "number") return;

			// The one hop that makes this work: the source's own pixel becomes a
			// timestamp, and only then may it be carried to anyone else.
			// 让这件事成立的那一跳：源窗口自己的像素先变成时间戳，此后才可以带给别人。
			const [point] = source.convertFromPixel([{ x }], {}) as Array<
				Partial<Point>
			>;
			const timestamp = point?.timestamp;
			if (typeof timestamp !== "number") return;

			for (const [id, chart] of charts) {
				if (id === sourceId) continue;
				// A window that does not hold the moment is not moved to look for it:
				// the engine would answer with its oldest candle and draw the crosshair
				// there, naming an instant the pointer is not on.
				// 不持有这一时刻的窗口不会为找它而移动：引擎会以它最老的蜡烛作答并把光标画在那里，
				// 指出的时刻却不是指针所在之处。
				if (!coversInstant(chart, timestamp)) continue;
				let pixel = panePixel(chart, timestamp);
				if (pixel === undefined && scrollLinked) {
					// The moment is off this window's screen, and scroll is linked, so
					// the window moves to where the moment is. It is on screen afterwards
					// by construction: the series covers the moment.
					//
					// 这一时刻不在该窗口的屏幕上，而滚动是联动的，因此把窗口移到这一时刻所在之处。
					// 事后它必然在屏幕上：序列覆盖了这一时刻。
					muted(() => chart.scrollToTimestamp(timestamp));
					pixel = panePixel(chart, timestamp);
				}
				if (pixel === undefined) continue;
				chart.executeAction("onCrosshairChange", {
					x: pixel,
					paneId: CANDLE_PANE,
				});
			}
		},
		clearCrosshairs() {
			// Hiding a crosshair has no action of its own, so this asks for the same
			// thing the engine does to itself when the pointer leaves a chart:
			// `undefined`. That is not the same as an empty object — the facade fills
			// a *given* crosshair's `paneId` with the candle pane, and a crosshair that
			// names a pane is drawn, landing on the last bar because it carries no
			// `x`. `undefined` is the one shape the facade passes through untouched.
			//
			// 隐藏光标没有专属动作，因此这里要的是引擎在指针离开图表时对自己做的同一件事：
			// `undefined`。它与空对象并不等价 —— 门面会把*传进来的*光标的 `paneId` 补成蜡烛面板，
			// 而一个指明了面板的光标是会被画出来的，又因为它没有 `x`，便落在最后一根上。`undefined`
			// 是门面唯一原样放过的形状。
			for (const chart of charts.values()) {
				chart.executeAction(
					"onCrosshairChange",
					undefined as unknown as Crosshair,
				);
			}
		},
	};
}
