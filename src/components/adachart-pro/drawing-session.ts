import type { Chart, OverlayCreate, OverlayEvent, OverlayMode } from "klinecharts";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { ADACHARTPRO_DRAWING_GROUP_ID } from "./adachart-pro-drawing-tools";
import {
	type AdaChartProDrawingRow,
	type ManagedOverlay,
	type RawOverlay,
	buildManagedRows,
	selectManagedOverlays,
} from "./drawing-inventory";

/**
 * A drawing session: what the bar has drawn, the names the reader gave those
 * drawings, and which one the canvas has selected — the whole of the drawing
 * layer that is not presentation.
 *
 * It is split out of `AdaChartPro` because that Wrapper had four unrelated
 * decisions braided into one body: how the chart is built, what the chrome
 * shows, what the settings dialogs edit, and what the drawing layer holds. This
 * file is the fourth one. The pure part — {@link drawingSessionReducer} — is the
 * model; {@link useDrawingSession} is the seam onto the engine, where the
 * instance is read and written.
 *
 * 一次绘制会话：画线栏画出了什么、读者给这些画线取的名字、以及画布选中了哪一条 —— 即画线层中
 * 一切不属于呈现的东西。
 *
 * 它从 `AdaChartPro` 中拆出，因为那个 Wrapper 曾把四类互不相关的决策编进一个函数体：图表如何构建、
 * 外围显示什么、设置对话框编辑什么、画线层持有什么。本文件是第四类。纯的部分 ——
 * {@link drawingSessionReducer} —— 是模型；{@link useDrawingSession} 是通往引擎的接缝，实例在那里
 * 被读写。
 */

/** The drawing layer's state: inventory, reader names, and the canvas selection. 画线层的状态：清单、读者取的名字，以及画布选中项。 */
export interface DrawingSessionModel {
	/** The overlays the manager lists, as last read from the chart. 管理器列出的 overlay，即最后一次从图表读回的样子。 */
	overlays: readonly ManagedOverlay[];
	/** Reader-given names, keyed by overlay id. 读者取的名字，按 overlay id 索引。 */
	names: Record<string, string>;
	/** The overlay the canvas has selected, or `null`. 画布已选中的 overlay；未选中时为 `null`。 */
	selectedId: string | null;
}

export const EMPTY_DRAWING_SESSION: DrawingSessionModel = {
	overlays: [],
	names: {},
	selectedId: null,
};

/**
 * Everything that can change the session. Named rather than folded into setters
 * so the model has a test surface that does not need React — the repository's
 * unit project runs in `node`, with no renderer.
 *
 * 一切能改变会话的事件。用事件命名而不是摊成 setter，使模型拥有一个不需要 React 的测试面 ——
 * 本仓库的 unit 工程跑在 `node` 里，没有渲染器。
 */
export type DrawingSessionEvent =
	/** The chart's overlays, freshly read. 刚读回的图表 overlay 清单。 */
	| { type: "inventory"; overlays: readonly RawOverlay[] }
	| { type: "selected"; id: string }
	| { type: "deselected"; id: string }
	| { type: "renamed"; id: string; label: string }
	/** The whole name table replaced, as {@link AdaChartProApi.setNativeSettings} does. 整张名字表被替换，正如 `setNativeSettings` 所做。 */
	| { type: "namesReplaced"; names: Record<string, string> }
	/** The overlay no longer exists: its name and any selection of it go with it. overlay 已不存在：它的名字与对它的选中一并消失。 */
	| { type: "forgotten"; id: string };

export function drawingSessionReducer(
	state: DrawingSessionModel,
	event: DrawingSessionEvent,
): DrawingSessionModel {
	switch (event.type) {
		case "inventory":
			return { ...state, overlays: selectManagedOverlays(event.overlays) };
		case "selected":
			return { ...state, selectedId: event.id };
		// Guarded by id so a stale `onDeselected` from an overlay that was already
		// replaced cannot clear a newer selection.
		// 按 id 校验，使一条已被替换的 overlay 迟到的 `onDeselected` 无法清掉更新的那次选中。
		case "deselected":
			return state.selectedId === event.id
				? { ...state, selectedId: null }
				: state;
		case "renamed":
			return { ...state, names: { ...state.names, [event.id]: event.label } };
		case "namesReplaced":
			return { ...state, names: { ...event.names } };
		case "forgotten": {
			const names = { ...state.names };
			delete names[event.id];
			return {
				...state,
				names,
				selectedId: state.selectedId === event.id ? null : state.selectedId,
			};
		}
	}
}

export interface UseDrawingSessionOptions {
	/**
	 * Read the live instance. A getter rather than the instance itself because
	 * the chart arrives through `onChartReady`, after the first render.
	 *
	 * 读取活的实例。用取值函数而非实例本身，因为图表经 `onChartReady` 到达，晚于首次渲染。
	 */
	chart: () => Chart | null;
	/** Whether the instance exists yet. 实例是否已存在。 */
	ready: boolean;
	/** The armed tool, or `null`. 已选中的工具；未选中时为 `null`。 */
	tool: string | null;
	/** Snapping behaviour handed to the next overlay. 交给下一条 overlay 的吸附行为。 */
	mode: OverlayMode;
	/** Whether the next overlay starts locked. 下一条 overlay 是否以锁定状态开始。 */
	lock: boolean;
	/** Whether the manager is on; a bridge is attached only while it is. 管理器是否开启；仅开启时挂事件桥。 */
	managerEnabled: boolean;
	locale: string;
	/** Disarm the tool — called when a drawing completes or the layer is cleared. 取消已选工具 —— 画完或清空画线层时调用。 */
	onToolChange: (tool: string | null) => void;
}

export interface DrawingSession {
	/** The manager's rows: inventory plus labels. 管理器的各行：清单加上标签。 */
	rows: readonly AdaChartProDrawingRow[];
	names: Record<string, string>;
	selectedId: string | null;
	/** Re-read the chart's overlays into the model. 把图表的 overlay 重读进模型。 */
	refresh: () => void;
	/** Replace the whole name table. 替换整张名字表。 */
	replaceNames: (names: Record<string, string>) => void;
	rename: (id: string, label: string) => void;
	toggleLock: (id: string) => void;
	toggleVisible: (id: string) => void;
	bringToFront: (id: string) => void;
	remove: (id: string) => void;
	removeAll: () => void;
}

/**
 * The session's seam onto the engine.
 *
 * The three values below are read through refs rather than listed as
 * dependencies of the arming effect, and that is the whole reason this hook is
 * shaped the way it is: the effect creates an overlay, so re-running it for a
 * flag change would take away the line being drawn. `overrideOverlay` is where
 * mode and lock land on an overlay already in progress; the refs only feed the
 * *next* creation.
 *
 * 会话通往引擎的接缝。
 *
 * 下面三个值经 ref 读取，而不是列为选中工具 effect 的依赖 —— 这也正是本 hook 形状的全部原因：
 * 该 effect 会创建 overlay，因此为某个开关的变化重跑它，会把正在画的那条线收走。模式与锁定对已在
 * 绘制中的 overlay 由 `overrideOverlay` 落地；ref 只喂给*下一次*创建。
 */
export function useDrawingSession(
	options: UseDrawingSessionOptions,
): DrawingSession {
	const { ready, tool, mode, lock, managerEnabled, locale, chart, onToolChange } =
		options;
	const [model, dispatch] = useReducer(
		drawingSessionReducer,
		EMPTY_DRAWING_SESSION,
	);

	const chartGetterRef = useRef(chart);
	const managerEnabledRef = useRef(managerEnabled);
	const creationRef = useRef({ mode, lock });
	const onToolChangeRef = useRef(onToolChange);

	useEffect(() => {
		chartGetterRef.current = chart;
	}, [chart]);
	useEffect(() => {
		managerEnabledRef.current = managerEnabled;
	}, [managerEnabled]);
	useEffect(() => {
		creationRef.current.mode = mode;
		creationRef.current.lock = lock;
	}, [mode, lock]);
	useEffect(() => {
		onToolChangeRef.current = onToolChange;
	}, [onToolChange]);

	/**
	 * Everything that changes a drawing calls this rather than editing the rows
	 * it already has. The chart is the one place that knows what exists — an
	 * overlay may be removed by a filter that names several, or by the caller
	 * through the raw instance — so a list maintained beside it would be a
	 * second answer to a question that already has one.
	 *
	 * A refresh while the manager is off is a no-op: a drawing made then carries
	 * no bridge, so nothing asked for the rows. Opening the panel refreshes.
	 *
	 * 凡是会改变画线的操作都调它，而不是去改手上已有的那些行。图表是唯一知道「存在什么」的地方 ——
	 * 一条 overlay 可能被一个点名多条图形的过滤条件移除，也可能被调用方经原始实例移除 —— 因此旁边
	 * 再维护一份清单，等于对同一个已有答案的问题给出第二个答案。
	 *
	 * 管理器关闭时的刷新是空操作：那时画出的线不带事件桥，没有东西在要这些行。打开面板时会刷新。
	 */
	const refresh = useCallback(() => {
		if (!managerEnabledRef.current) return;
		const instance = chartGetterRef.current();
		if (!instance) return;
		dispatch({ type: "inventory", overlays: instance.getOverlays() });
	}, []);

	/**
	 * Arming a tool means asking the engine to start drawing it: v10's
	 * `createOverlay({ name })` puts the overlay into its interactive drawing
	 * state machine, and `onDrawEnd` is the signal that the last anchor landed.
	 *
	 * The overlay is tagged with `ADACHARTPRO_DRAWING_GROUP_ID`, which is what
	 * makes "clear all" mean "everything the bar drew" rather than "everything on
	 * the chart".
	 *
	 * `mode` and `lock` are handed over at creation so the bar's state reaches the
	 * *next* overlay as well as the existing ones. `visible` is deliberately left
	 * out — the engine refuses to draw an overlay whose `visible` is `false`, and
	 * that includes the one being drawn.
	 *
	 * The manager's bridge is attached only while the flag is on. Overlay events
	 * do **not** arrive through `subscribeAction` — v10's action list cannot see an
	 * overlay — so the only way back into React state is on the overlay itself,
	 * and it has to be attached as the overlay is created.
	 *
	 * 选中工具即请引擎开始绘制：v10 的 `createOverlay({ name })` 会把该画线推进它自己的交互状态机，
	 * `onDrawEnd` 则是最后一枚锚点落下的信号。
	 *
	 * 画线带着 `ADACHARTPRO_DRAWING_GROUP_ID` 这个标记，正是它让「清空全部」意指「画线栏画的全部」
	 * 而非「图表上的全部」。
	 *
	 * `mode` 与 `lock` 在创建时就交给引擎，使画线栏的状态同样作用于*下一条* overlay 而不只是已有的
	 * 那些。`visible` 刻意不传 —— 引擎会拒绝绘制 `visible` 为 `false` 的 overlay，正在画的那条也不例外。
	 *
	 * 管理器的事件桥只在开关打开时挂上。overlay 的事件**不**经 `subscribeAction` 传来 —— v10 的动作
	 * 清单看不见 overlay —— 因此回到 React 状态只有写在 overlay 上这一条路，而且必须在创建它的那一刻
	 * 一起写入。
	 */
	useEffect(() => {
		const instance = ready ? chartGetterRef.current() : null;
		if (!instance || !tool) return;
		const create: OverlayCreate = {
			name: tool,
			groupId: ADACHARTPRO_DRAWING_GROUP_ID,
			mode: creationRef.current.mode,
			lock: creationRef.current.lock,
			onDrawEnd: () => {
				onToolChangeRef.current(null);
				refresh();
			},
			...(managerEnabledRef.current
				? {
						onRemoved: refresh,
						onSelected: ({ overlay }: OverlayEvent<unknown>) =>
							dispatch({ type: "selected", id: overlay.id }),
						onDeselected: ({ overlay }: OverlayEvent<unknown>) =>
							dispatch({ type: "deselected", id: overlay.id }),
					}
				: {}),
		};
		const created = instance.createOverlay(create);
		const id = typeof created === "string" ? created : null;
		return () => {
			if (!id) return;
			// Switching or clearing the tool before a single anchor was placed would
			// otherwise strand an empty overlay on the chart.
			// 若在一个锚点都没落下前就换工具或清空工具，这里要收掉那条空画线，否则它会滞留在图表上。
			const [draft] = instance.getOverlays({ id });
			if (draft && draft.points.length === 0) instance.removeOverlay({ id });
		};
	}, [tool, ready, refresh]);

	/**
	 * The panel's five actions are all "the chart said this, believe it": each
	 * calls the instance and then re-reads it, so a lock that the engine refused
	 * cannot be shown as taken.
	 *
	 * 面板的五个操作全都是「图表说了算，信它」：每个都先调用实例再重读，因此被引擎拒绝的锁定不会
	 * 被显示为已锁上。
	 */
	const toggleLock = useCallback(
		(id: string) => {
			const instance = chartGetterRef.current();
			if (!instance) return;
			const [overlay] = instance.getOverlays({ id });
			if (!overlay) return;
			instance.overrideOverlay({ id, lock: !overlay.lock });
			refresh();
		},
		[refresh],
	);

	const toggleVisible = useCallback(
		(id: string) => {
			const instance = chartGetterRef.current();
			if (!instance) return;
			const [overlay] = instance.getOverlays({ id });
			if (!overlay) return;
			instance.overrideOverlay({ id, visible: !overlay.visible });
			refresh();
		},
		[refresh],
	);

	/**
	 * One rung up the overlay's stack rather than a computed value: raising a
	 * line above a tall one could need a long jump, and the engine does not say
	 * which `zLevel`s are taken — a guaranteed step is more use than a guessed
	 * one.
	 *
	 * 在 overlay 的栈上抬一级，而不是取一个算出来的值：要把一条线抬到很高的那条之上可能得跳很远，
	 * 而引擎不会说明哪些 `zLevel` 已被占用 —— 一个保证生效的步进，比一个猜出来的数值有用。
	 */
	const bringToFront = useCallback(
		(id: string) => {
			const instance = chartGetterRef.current();
			if (!instance) return;
			const [overlay] = instance.getOverlays({ id });
			if (!overlay) return;
			instance.overrideOverlay({ id, zLevel: overlay.zLevel + 1 });
			refresh();
		},
		[refresh],
	);

	/**
	 * `removeOverlay` answers to a filter rather than to an id, so removing is
	 * scoped by the id. The "forgotten" event clears the name and any selection
	 * of it in the same step, so a deleted drawing cannot leave either behind.
	 *
	 * `removeOverlay` 只认过滤条件而不认某个 id，因此删除以 id 限定范围。「遗忘」事件在同一步里
	 * 清掉它的名字与对它的选中，使被删的画线不会留下任何一样。
	 */
	const remove = useCallback(
		(id: string) => {
			chartGetterRef.current()?.removeOverlay({ id });
			dispatch({ type: "forgotten", id });
			refresh();
		},
		[refresh],
	);

	/**
	 * Clearing drops everything the bar drew and disarms the tool with it: the
	 * engine removes a half-drawn overlay without firing `onDrawEnd`, so without
	 * this the bar would keep a tool highlighted that has nothing left to draw.
	 *
	 * 清空会丢掉画线栏画的一切，并同时取消已选工具：引擎移除半画的 overlay 时不会触发 `onDrawEnd`，
	 * 不这样做的话画线栏会继续高亮一个已经没有东西可画的工具。
	 */
	const removeAll = useCallback(() => {
		chartGetterRef.current()?.removeOverlay({
			groupId: ADACHARTPRO_DRAWING_GROUP_ID,
		});
		onToolChangeRef.current(null);
		refresh();
	}, [refresh]);

	const rename = useCallback((id: string, label: string) => {
		dispatch({ type: "renamed", id, label });
	}, []);
	const replaceNames = useCallback((names: Record<string, string>) => {
		dispatch({ type: "namesReplaced", names });
	}, []);

	/**
	 * The manager's rows: the inventory plus the names the reader has given, with
	 * the tool's own label standing in until a drawing is named. One object per
	 * row rather than a lookup at render, so the panel can be handed its props
	 * and nothing else.
	 *
	 * 管理器的各行：清单加上读者给的名字；被命名之前，由工具自己的文案代为显示。每行一个对象而非
	 * 渲染时再去查表，使面板拿到的就是它的全部 props。
	 */
	const rows = useMemo<readonly AdaChartProDrawingRow[]>(
		() => buildManagedRows(model.overlays, model.names, locale),
		[model.overlays, model.names, locale],
	);

	return {
		rows,
		names: model.names,
		selectedId: model.selectedId,
		refresh,
		replaceNames,
		rename,
		toggleLock,
		toggleVisible,
		bringToFront,
		remove,
		removeAll,
	};
}
