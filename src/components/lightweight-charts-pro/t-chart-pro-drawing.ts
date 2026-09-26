import {
	DrawingManager,
	getToolRegistry,
	type Anchor,
	type DrawingStyle,
	type IDrawing,
	type SerializedDrawing,
} from "lightweight-charts-drawing";
import type {
	IChartApi,
	ISeriesApi,
	Logical,
	SeriesType,
	Time,
} from "lightweight-charts";
import type { TChartProMagnet } from "./t-chart-pro-options";

/**
 * Placement on top of `lightweight-charts-drawing`.
 *
 * The package owns the drawings themselves — sixty-eight tool classes, their
 * canvas renderers, storage, selection, hit-testing and anchor dragging. What it
 * does not do is turn a toolbar click into a shape on the chart: `setActiveTool`
 * only records the name and emits an event, so arming a tool would change
 * nothing a user could see. That missing step is this file — collect anchors from
 * pointer input, preview the shape while it is being placed, and hand the
 * finished drawing to the manager.
 *
 * 建立在 `lightweight-charts-drawing` 之上的落笔流程。
 *
 * 该包负责画线本体 —— 68 个工具类、各自的 canvas 渲染、存储、选中、命中测试与锚点
 * 拖拽。它不负责的是「点一下工具栏就在图上画出形状」：`setActiveTool` 只记录名字并
 * 发一个事件，光 arm 工具用户看不到任何变化。缺的就是这一步，本文件补上 —— 从指针
 * 输入里收集锚点、落笔过程中预览、完成后交给 manager。
 */

/** One bar, used only to snap the pointer onto real prices. 仅用于把指针吸附到真实价格上的一根 K 线。 */
export interface MagnetBar {
	time: Time;
	logical: number;
	open: number;
	high: number;
	low: number;
	close: number;
}

/** A tool as the palette shows it. 工具面板展示的一项工具。 */
export interface DrawingToolEntry {
	type: string;
	name: string;
	category: string;
	requiredAnchors: number;
}

/** How far (px) the pointer may sit from a bar and still snap to it. 指针与 K 线相距多少像素内仍会吸附。 */
const MAGNET_RADIUS_PX = 12;
/** A pointer that moved more than this between down and up was panning, not clicking. 按下与抬起之间移动超过这个距离就算拖拽平移，不算点击。 */
const CLICK_SLOP_PX = 4;

let sequence = 0;
function newDrawingId(type: string): string {
	sequence += 1;
	return `${type}-${Date.now().toString(36)}-${sequence}`;
}

export interface DrawingControllerEvents {
	/** The drawing list changed. 画线列表变化。 */
	onChange: SerializedDrawing[];
	/** The armed tool changed; `null` is the pointer. arm 的工具变化；`null` 表示回到指针。 */
	onToolChange: string | null;
}

/**
 * Creates, previews, stores and removes the drawings on one chart.
 * 在单个图表上创建、预览、保存与删除画线。
 */
export class DrawingController {
	private readonly manager = new DrawingManager();
	private readonly registry = getToolRegistry();
	private readonly chart: IChartApi;
	private readonly series: ISeriesApi<SeriesType>;
	private readonly container: HTMLElement;
	private readonly listeners = new Set<() => void>();
	private readonly undoStack: string[] = [];
	private readonly events = new Map<keyof DrawingControllerEvents, Set<(arg: never) => void>>();

	private tool: string | null = null;
	private pending: Anchor[] = [];
	private preview: IDrawing | null = null;
	private magnet: TChartProMagnet = "off";
	private keepArmed = false;
	private lockNew = false;
	private bars: () => MagnetBar[] = () => [];
	private interaction: { handleScroll: unknown; handleScale: unknown } | null = null;
	private downAt: { x: number; y: number } | null = null;

	constructor(
		chart: IChartApi,
		series: ISeriesApi<SeriesType>,
		container: HTMLElement,
	) {
		this.chart = chart;
		this.series = series;
		this.container = container;
		this.manager.attach(chart, series, container);

		this.listen(container, "pointerdown", (event) => {
			const point = event as PointerEvent;
			this.downAt = { x: point.clientX, y: point.clientY };
		});
		this.listen(container, "pointermove", (event) => this.handleMove(event as PointerEvent));
		this.listen(container, "click", (event) => this.handleClick(event as MouseEvent));
		this.listen(window, "keydown", (event) => this.handleKey(event as KeyboardEvent));
	}

	// ------------------------------------------------------------------ tools

	/**
	 * Every tool the package registers, optionally narrowed to `allow` and
	 * ordered by category so the palette can group it without a second list.
	 *
	 * 该包注册的全部工具；可用 `allow` 收窄，并按分类排序，使面板无需再维护一份清单。
	 */
	tools(allow?: readonly string[]): DrawingToolEntry[] {
		const entries = this.registry
			.getAll()
			.filter((entry) => (allow?.length ? allow.includes(entry.type) : true))
			.map((entry) => ({
				type: entry.type,
				name: entry.name,
				category: entry.category,
				requiredAnchors: entry.requiredAnchors,
			}));
		return entries.sort(
			(a, b) =>
				a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
		);
	}

	/** The armed tool type, or `null`. 当前 arm 的工具类型，或 `null`。 */
	activeTool(): string | null {
		return this.tool;
	}

	/** Arm `type`, or pass `null` to hand the chart back to the pointer. arm 指定工具；传 `null` 把图表交还指针。 */
	setTool(type: string | null): void {
		this.cancelPreview();
		this.tool = type && this.registry.has(type) ? type : null;
		this.manager.setActiveTool(this.tool);
		this.applyPointerMode();
		this.emit("onToolChange", this.tool);
	}

	setMagnet(mode: TChartProMagnet): void {
		this.magnet = mode;
	}

	setKeepArmed(on: boolean): void {
		this.keepArmed = on;
	}

	/** Whether drawings created from now on start locked against editing. 此后新建的画线是否一开始就锁定、不可编辑。 */
	setLockNew(on: boolean): void {
		this.lockNew = on;
	}

	/** Where the bars come from; needed only by the magnet. bars 的来源；只有磁吸需要。 */
	setBarsProvider(provider: () => MagnetBar[]): void {
		this.bars = provider;
	}

	// --------------------------------------------------------------- drawings

	drawings(): SerializedDrawing[] {
		return this.manager.exportDrawings();
	}

	allDrawings(): IDrawing[] {
		return this.manager.getAllDrawings();
	}

	/**
	 * Replace the whole set, e.g. a saved layout.
	 * 整套替换，例如恢复已保存的布局。
	 */
	load(serialized: readonly SerializedDrawing[]): void {
		this.cancelPreview();
		this.manager.clearAll();
		this.undoStack.length = 0;
		this.manager.importDrawings([...serialized], (type, data) => {
			const drawing = this.registry.createDrawing(type, data.id, data.anchors, data.style, data.options);
			return drawing;
		});
		for (const drawing of this.manager.getAllDrawings()) {
			this.undoStack.push(drawing.id);
		}
		this.emit("onChange", this.drawings());
	}

	addDrawing(
		type: string,
		anchors: Anchor[],
		style?: Partial<DrawingStyle>,
	): string | null {
		const entry = this.registry.get(type);
		if (!entry) return null;
		const id = newDrawingId(type);
		const drawing = this.registry.createDrawing(
			type,
			id,
			anchors,
			style ?? entry.defaultStyle,
			{ locked: this.lockNew },
		);
		if (!drawing) return null;
		this.manager.addDrawing(drawing);
		this.undoStack.push(id);
		this.emit("onChange", this.drawings());
		return id;
	}

	removeDrawing(id: string): void {
		this.manager.removeDrawing(id);
		const at = this.undoStack.lastIndexOf(id);
		if (at >= 0) this.undoStack.splice(at, 1);
		this.emit("onChange", this.drawings());
	}

	removeSelected(): void {
		const selected = this.manager.getSelectedDrawing();
		if (selected) this.removeDrawing(selected.id);
	}

	selectDrawing(id: string): void {
		this.manager.selectDrawing(id);
	}

	/** Drop the most recently placed drawing. 丢掉最近放置的一条画线。 */
	undo(): void {
		const id = this.undoStack.pop();
		if (!id) return;
		this.manager.removeDrawing(id);
		this.emit("onChange", this.drawings());
	}

	clearAll(): void {
		this.cancelPreview();
		this.undoStack.length = 0;
		this.manager.clearAll();
		this.emit("onChange", this.drawings());
	}

	on<K extends keyof DrawingControllerEvents>(
		event: K,
		callback: (payload: DrawingControllerEvents[K]) => void,
	): () => void {
		const set = this.events.get(event) ?? new Set();
		set.add(callback as (arg: never) => void);
		this.events.set(event, set);
		return () => set.delete(callback as (arg: never) => void);
	}

	dispose(): void {
		this.cancelPreview();
		for (const off of this.listeners) off();
		this.listeners.clear();
		this.events.clear();
		this.manager.detach();
	}

	// ------------------------------------------------------------- placement

	private handleMove(event: PointerEvent): void {
		if (!this.tool) return;
		const anchor = this.anchorAt(event);
		if (!anchor) return;
		const entry = this.registry.get(this.tool);
		if (!entry || this.pending.length === 0 || this.pending.length >= entry.requiredAnchors) {
			return;
		}
		// A half-placed shape still needs a full anchor set to render, so the open
		// slots repeat the live pointer; the completed clicks keep their own spots.
		// 画了一半的形状仍需凑满锚点数才肯绘制，因此未填满的位置重复实时指针；
		// 已点定的各锚点保持自己的位置。
		const anchors = [...this.pending];
		while (anchors.length < entry.requiredAnchors) anchors.push(anchor);
		if (!this.preview) {
			const id = newDrawingId(this.tool);
			const created = this.registry.createDrawing(
				this.tool,
				id,
				anchors,
				entry.defaultStyle,
				{ locked: false },
			);
			if (!created) return;
			this.preview = created;
			this.manager.addDrawing(created);
		} else {
			this.preview.setAnchors(anchors);
		}
	}

	private handleClick(event: MouseEvent): void {
		if (!this.tool) return;
		// A drag that ends on the chart is a pan, not a place.
		// 在图上结束的拖拽是平移，不是落笔。
		if (this.downAt) {
			const moved = Math.hypot(event.clientX - this.downAt.x, event.clientY - this.downAt.y);
			if (moved > CLICK_SLOP_PX) return;
		}
		const anchor = this.anchorAt(event);
		if (!anchor) return;
		const entry = this.registry.get(this.tool);
		if (!entry) return;
		this.pending.push(anchor);
		if (this.pending.length < entry.requiredAnchors) return;

		const pending = this.pending;
		let drawing = this.preview;
		this.pending = [];
		this.preview = null;
		if (drawing) {
			drawing.setAnchors(pending);
			if (this.lockNew) drawing.updateOptions({ locked: true });
		} else {
			// Only {@link handleMove} opens a preview, so a placement made without a
			// pointer move — a touch tap, or a click that never travelled — has nothing
			// to finish. The shape is built here instead, or the anchors the user just
			// set would be dropped.
			// 只有 {@link handleMove} 会开启预览，因此没有指针移动的落笔 —— 触摸点击，或
			// 一步到位、从未移动过的点击 —— 手里是没有东西可完成的。这里补建这个形状，
			// 否则用户刚定的锚点就被丢掉了。
			drawing = this.registry.createDrawing(
				this.tool,
				newDrawingId(this.tool),
				pending,
				entry.defaultStyle,
				{ locked: this.lockNew },
			);
			if (drawing) this.manager.addDrawing(drawing);
		}
		if (drawing) {
			this.undoStack.push(drawing.id);
			this.emit("onChange", this.drawings());
		}
		if (!this.keepArmed) {
			this.setTool(null);
		} else {
			this.cancelPreview();
		}
	}

	private handleKey(event: KeyboardEvent): void {
		if (event.key === "Escape") {
			if (this.tool) this.setTool(null);
			return;
		}
		if (event.key === "Delete" || event.key === "Backspace") {
			const target = event.target as HTMLElement | null;
			// Keystrokes meant for a search box must not destroy a drawing.
			// 发给搜索框的按键不能顺手删掉画线。
			if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
			if (this.manager.getSelectedDrawing()) {
				this.removeSelected();
				event.preventDefault();
			}
		}
	}

	private anchorAt(event: MouseEvent): Anchor | null {
		const rect = this.container.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		const time = this.chart.timeScale().coordinateToTime(x);
		const price = this.series.coordinateToPrice(y);
		if (time === null || price === null) return null;
		return this.magnet === "off" ? { time, price } : this.snap({ x, y, time, price });
	}

	/**
	 * Snap onto the nearest bar. `weak` pins the time axis only, `strong` also
	 * pulls the price onto that bar's open, high, low or close.
	 *
	 * 吸附到最近的 K 线。`weak` 只钉住时间轴，`strong` 还会把价格拉到该根的
	 * 开、高、低、收之一。
	 */
	private snap(anchor: Anchor & { x: number; y: number }): Anchor {
		const bars = this.bars();
		if (bars.length === 0) return { time: anchor.time, price: anchor.price };
		const scale = this.chart.timeScale();
		const logical = scale.coordinateToLogical(anchor.x);
		if (logical === null) return { time: anchor.time, price: anchor.price };
		let nearest = bars[0];
		let nearestDistance = Number.POSITIVE_INFINITY;
		for (const bar of bars) {
			const distance = Math.abs(bar.logical - logical);
			if (distance < nearestDistance) {
				nearestDistance = distance;
				nearest = bar;
			}
		}
		const snappedX = scale.logicalToCoordinate(nearest.logical as Logical);
		if (snappedX === null || Math.abs(snappedX - anchor.x) > MAGNET_RADIUS_PX) {
			return { time: anchor.time, price: anchor.price };
		}
		if (this.magnet === "weak") return { time: nearest.time, price: anchor.price };
		const candidates = [nearest.open, nearest.high, nearest.low, nearest.close];
		let best = anchor.price;
		let bestDistance = Number.POSITIVE_INFINITY;
		for (const candidate of candidates) {
			const pixel = this.series.priceToCoordinate(candidate);
			if (pixel === null) continue;
			const distance = Math.abs(pixel - anchor.y);
			if (distance < bestDistance) {
				bestDistance = distance;
				best = candidate;
			}
		}
		return {
			time: nearest.time,
			price: bestDistance > MAGNET_RADIUS_PX ? anchor.price : best,
		};
	}

	private cancelPreview(): void {
		if (this.preview) {
			this.manager.removeDrawing(this.preview.id);
			this.preview = null;
		}
		this.pending = [];
	}

	/**
	 * While a tool is armed the pointer belongs to the drawing, so chart panning
	 * and zooming are put aside and restored verbatim afterwards.
	 *
	 * 工具 arm 期间指针归画线所有，因此把图表的平移与缩放暂时收起，结束后原样恢复。
	 */
	private applyPointerMode(): void {
		if (this.tool) {
			if (this.interaction) return;
			const options = this.chart.options();
			this.interaction = {
				handleScroll: options.handleScroll,
				handleScale: options.handleScale,
			};
			this.chart.applyOptions({ handleScroll: false, handleScale: false });
			this.container.style.cursor = "crosshair";
			return;
		}
		if (this.interaction) {
			this.chart.applyOptions({
				handleScroll: this.interaction.handleScroll as never,
				handleScale: this.interaction.handleScale as never,
			});
			this.interaction = null;
		}
		this.container.style.cursor = "";
	}

	private emit<K extends keyof DrawingControllerEvents>(
		event: K,
		value: DrawingControllerEvents[K],
	): void {
		for (const callback of this.events.get(event) ?? []) {
			(callback as (arg: DrawingControllerEvents[K]) => void)(value);
		}
	}

	private listen(
		target: EventTarget,
		type: string,
		handler: (event: Event) => void,
	): void {
		target.addEventListener(type, handler);
		this.listeners.add(() => target.removeEventListener(type, handler));
	}
}
