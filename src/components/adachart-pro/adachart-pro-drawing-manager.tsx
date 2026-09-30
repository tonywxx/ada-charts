import { useEffect, useRef, useState } from "react";
import { drawingMessage } from "./adachart-pro-drawing-tools";
import { messageFor } from "./adachart-pro-messages";
import { AdaChartProOverlayIcon } from "./adachart-pro-overlay-icons";

/**
 * `AdaChartPro`'s drawing manager: the panel that lists what has been drawn, and
 * gives each drawing a name, a lock, a visibility and a place in the stack.
 *
 * The drawing bar can make a shape but cannot say anything about one afterwards,
 * and the engine's only route to it is the canvas itself — clicking a line on the
 * chart. This panel is that inventory. TradingView calls its version an *object
 * tree*; `CONTEXT.md` settles on **Drawing manager**, which is what the thing is
 * responsible for.
 *
 * The shape follows the three dialogs rather than the bar: the Wrapper holds
 * every value and this panel reports upward, so it owns no chart state. What it
 * does own is which row is mid-rename and the text being typed, which is
 * presentation and belongs to nothing else — committing on Enter or on losing
 * focus, so a half-typed name is never written to the overlay.
 *
 * One direction of selection is missing, and it is v10's doing, not a gap left
 * here: `Chart` has `createOverlay` / `getOverlays` / `overrideOverlay` /
 * `removeOverlay` and no way to *select* one. A row therefore reports which
 * overlay is selected — `onSelected` on the canvas is the only thing that can
 * start it — but clicking a row cannot select the shape on the chart, so rows
 * are not clickable. A control that highlights its own row and moves nothing
 * else is the kind of click the drawing bar's comment already refuses to ship.
 *
 * `AdaChartPro` 的画线管理器：列出已画对象的画板，并给每条画线一个名称、锁定、可见性与层次位置。
 *
 * 画线栏能画出一个形状，但画完之后对它无话可说，而引擎唯一的入口就是画布本身 —— 在图上点那条线。
 * 本面板就是那份清单。TradingView 把它的版本叫做 *object tree*；`CONTEXT.md` 定下的词是
 * **Drawing manager**，因为它命名的正是这件事的职责。
 *
 * 形状跟随三个对话框而非画线栏：所有取值都由外层持有，本面板只向上汇报，因此不保存任何图表状态。
 * 它自己持有的只有「哪一行正在重命名」与正在输入的文本 —— 那是呈现状态，不属于任何别人；并且
 * 以回车或失焦提交，因此半截名字永远不会写到 overlay 上。
 *
 * 选中这件事只有一个方向，这是 v10 决定的而不是这里留的缺口：`Chart` 有 `createOverlay` /
 * `getOverlays` / `overrideOverlay` / `removeOverlay`，却没有*选中*某一条的办法。因此一行会汇报
 * 哪条 overlay 被选中 —— 只有画布上的 `onSelected` 能发起它 —— 但点击一行无法在图上选中那个形状，
 * 所以行本身不可点。一个只点亮自己那一行、别的什么都不动的控件，正是画线栏的注释已经拒绝出厂的点击。
 */

/** One drawing, as the panel shows it. 一条画线，即面板所显示的样子。 */
export interface AdaChartProDrawingRow {
	/** The overlay's id, which every action is addressed to. overlay 的 id，所有操作都指向它。 */
	id: string;
	/** The `klinecharts` overlay name, i.e. which tool drew it; drives the row's glyph. `klinecharts` 的 overlay 名称，即由哪个工具画出；决定该行的图标。 */
	name: string;
	/** What to show: the name the reader gave it, or the tool's own label. 要显示的文本：读者给的名字，或工具自身的文案。 */
	label: string;
	locked: boolean;
	visible: boolean;
}

export interface AdaChartProDrawingManagerProps {
	locale: string;
	rows: readonly AdaChartProDrawingRow[];
	/** The overlay selected on the canvas, or `null`. Rows highlight; they cannot start it. 画布上被选中的 overlay；行会高亮，但无法发起选中。 */
	selectedId: string | null;
	onRename: (id: string, label: string) => void;
	onToggleLock: (id: string) => void;
	onToggleVisible: (id: string) => void;
	onBringToFront: (id: string) => void;
	onDelete: (id: string) => void;
	onClose: () => void;
}

export function AdaChartProDrawingManager(props: AdaChartProDrawingManagerProps) {
	const { locale, rows } = props;
	/** Which row is being renamed, and the draft it is being renamed with. 正在重命名的那一行，以及重命名所用的草稿。 */
	const [editingId, setEditingId] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	const inputRef = useRef<HTMLInputElement | null>(null);

	// Focus the draft when a row enters rename, so typing goes where the reader
	// is looking without a second click. Done through a ref rather than
	// `autoFocus`, which would steal focus on mount instead of on open.
	// 某行进入重命名时聚焦草稿，使读者无需再点一次就能打字。用 ref 而不是 `autoFocus`：后者会在
	// 挂载时抢走焦点，而不是在展开时。
	useEffect(() => {
		if (editingId !== null) inputRef.current?.focus();
	}, [editingId]);

	const startRename = (row: AdaChartProDrawingRow) => {
		setEditingId(row.id);
		setDraft(row.label);
	};

	/**
	 * Committing is one call upward and nothing else — including when the draft
	 * has not changed, because an empty or untouched name still has to close the
	 * input. A blank draft is refused: a nameless row would be indistinguishable
	 * from the tool's own label, which is what it would fall back to anyway, so
	 * writing it would only lose the reader's earlier name for nothing.
	 *
	 * 提交就是一次向上调用，此外什么都不做 —— 草稿没变时也一样，因为空名字或没动过的名字同样要把
	 * 输入框收起来。空白草稿被拒绝：无名的行与它本就会回退到的工具文案无从区分，写下去只会白白丢掉
	 * 读者先前取的名字。
	 */
	const commit = () => {
		const id = editingId;
		setEditingId(null);
		const label = draft.trim();
		if (id === null || !label) return;
		props.onRename(id, label);
	};

	return (
		<div className="adachart-pro__manager">
			<div className="adachart-pro__manager-header">
				<span className="adachart-pro__manager-title">
					{messageFor(locale, "drawings")}
				</span>
				<button
					type="button"
					className="adachart-pro__manager-close"
					aria-label={messageFor(locale, "close")}
					onClick={props.onClose}
				>
					×
				</button>
			</div>
			{rows.length === 0 ? (
				<span className="adachart-pro__manager-empty">
					{messageFor(locale, "noDrawings")}
				</span>
			) : (
				<ul className="adachart-pro__manager-list">
					{rows.map((row) => (
						<li
							key={row.id}
							className={
								row.id === props.selectedId
									? "adachart-pro__manager-row adachart-pro__manager-row--selected"
									: "adachart-pro__manager-row"
							}
						>
							{row.id === editingId ? (
								<input
									ref={inputRef}
									className="adachart-pro__manager-input"
									value={draft}
									aria-label={messageFor(locale, "rename")}
									onChange={(event) => setDraft(event.target.value)}
									onBlur={commit}
									onKeyDown={(event) => {
										if (event.key === "Enter") commit();
										// Escape restores the row's earlier name by never
										// committing the draft at all.
										// Escape 靠「从不提交草稿」把该行先前的名字还回来。
										else if (event.key === "Escape") setEditingId(null);
									}}
								/>
							) : (
								<span className="adachart-pro__manager-label" title={row.label}>
									<AdaChartProOverlayIcon name={row.name} />
									<span className="adachart-pro__manager-text">{row.label}</span>
								</span>
							)}
							{/* The four actions, in the order the responsibility reads: name it,
							 * lock it, hide it, move it — and then the one that removes it, set
							 * apart by the gap the delete class carries.
							 *
							 * 四个操作，按职责的顺序排列：命名、锁定、隐藏、移动 —— 随后是移除它的那个，
							 * 由删除类名带来的间距与前面隔开。 */}
							<button
								type="button"
								className="adachart-pro__manager-action"
								title={messageFor(locale, "rename")}
								aria-label={messageFor(locale, "rename")}
								onClick={() => startRename(row)}
							>
								<AdaChartProOverlayIcon name="rename" />
							</button>
							<button
								type="button"
								className="adachart-pro__manager-action"
								title={drawingMessage(locale, row.locked ? "unlock" : "lock")}
								aria-label={drawingMessage(locale, row.locked ? "unlock" : "lock")}
								aria-pressed={row.locked}
								onClick={() => props.onToggleLock(row.id)}
							>
								<AdaChartProOverlayIcon name={row.locked ? "lock" : "unlock"} />
							</button>
							<button
								type="button"
								className="adachart-pro__manager-action"
								title={drawingMessage(locale, row.visible ? "invisible" : "visible")}
								aria-label={drawingMessage(
									locale,
									row.visible ? "invisible" : "visible",
								)}
								aria-pressed={!row.visible}
								onClick={() => props.onToggleVisible(row.id)}
							>
								<AdaChartProOverlayIcon
									name={row.visible ? "visible" : "invisible"}
								/>
							</button>
							<button
								type="button"
								className="adachart-pro__manager-action"
								title={messageFor(locale, "bringToFront")}
								aria-label={messageFor(locale, "bringToFront")}
								onClick={() => props.onBringToFront(row.id)}
							>
								<AdaChartProOverlayIcon name="front" />
							</button>
							<button
								type="button"
								className="adachart-pro__manager-action adachart-pro__manager-action--delete"
								title={messageFor(locale, "delete")}
								aria-label={messageFor(locale, "delete")}
								onClick={() => props.onDelete(row.id)}
							>
								<AdaChartProOverlayIcon name="remove" />
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}