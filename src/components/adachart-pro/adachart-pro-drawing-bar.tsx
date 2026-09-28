import type { OverlayMode } from "klinecharts";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	type AdaChartProDrawingGroup,
	drawingMessage,
} from "./adachart-pro-drawing-tools";
import { AdaChartProOverlayIcon } from "./adachart-pro-overlay-icons";

/**
 * `AdaChartPro`'s drawing bar: the vertical strip on the left of the chart.
 *
 * It is the only way to arm a drawing tool — the top toolbar's drawing dropdown
 * was removed when this arrived, so a tool has one home rather than two. The
 * shape is `@klinecharts/pro`'s: a glyph per group, each opening its sub-list to
 * the right; then the overlay mode, the lock and visibility toggles, and a
 * "clear all" that drops every overlay the bar made.
 *
 * Clicking a group's glyph opens that group's list, and so does its chevron —
 * the chevron is the same gesture with a bigger, always-legible target. The
 * source instead armed the group's first tool from the glyph and reached the
 * list only through the chevron, which left the glyph looking inert: arming a
 * tool draws nothing until you drag on the chart, so a click that only arms
 * reads as a click that did nothing. Arming now happens where the choice is
 * made, in the list.
 *
 * Like the toolbar, it holds no chart state. Every control reports upward and
 * `AdaChartPro` owns the values, so the same strip drives a chart created from
 * props or from the imperative API. The one thing it does own is which
 * sub-list is open, which is presentation and belongs to nothing else.
 *
 * `AdaChartPro` 的画线栏：图表左侧的竖向条。
 *
 * 它是选中画线工具的唯一入口 —— 它到来时顶部工具栏的画线下拉被移除了，工具因此只有一个家
 * 而不是两个。形状来自 `@klinecharts/pro`：五个组图标，各自向右展开子列表；随后是 overlay
 * 模式、锁定与显示开关，以及清空画线栏所画全部 overlay 的按钮。
 *
 * 点击组图标会展开该组列表，其箭头同样如此 —— 箭头是同一动作的另一个更大、始终可辨的点击
 * 目标。源实现里图标是直接选中该组第一个工具、只能靠箭头够到列表，这让图标显得毫无反应：
 * 选中一个工具在你在图上拖动之前不会画出任何东西，因此「只选中」的点击读起来就是什么也没发生。
 * 选中现在发生在做选择的地方，也就是列表里。
 *
 * 与工具栏一样，它不保存图表状态。每个控件都向上汇报、数值由 `AdaChartPro` 持有，因此无论
 * 图表由 props 还是命令式 API 驱动，同一条画线栏都适用。它自己唯一持有的是「哪个子列表展开
 * 着」—— 那是呈现状态，不属于任何别人。
 */

/** Which sub-list is open. Group keys and the pseudo-key `"mode"` share one slot, so only one is ever open. 当前展开的子列表。组键与伪键 `"mode"` 共用一个槽位，因此同时只开一个。 */
type OpenList = string | null;

/**
 * The pseudo-key for the mode sub-list, which is not a drawing group. Frame it
 * as `"mode"` — no overlay is named that, so it cannot collide with a group key.
 *
 * 模式子列表的伪键，它不是一个画线组。取 `"mode"`：没有 overlay 叫这个名字，因此不会与组键冲突。
 */
const MODE_LIST = "mode";

export interface AdaChartProDrawingBarProps {
	locale: string;
	/** The groups to offer, already filtered by the caller's `drawingTools`. 要提供的组，已由调用方的 `drawingTools` 过滤。 */
	groups: readonly AdaChartProDrawingGroup[];
	/** The armed tool, or `null` when nothing is armed. 已选中的工具；未选中时为 `null`。 */
	activeTool: string | null;
	/** Snapping behaviour for the next overlay. 下一条 overlay 的吸附行为。 */
	mode: OverlayMode;
	locked: boolean;
	visible: boolean;
	onToolChange: (tool: string | null) => void;
	onModeChange: (mode: OverlayMode) => void;
	onLockChange: (locked: boolean) => void;
	onVisibleChange: (visible: boolean) => void;
	onRemoveAll: () => void;
}

/**
 * The bar is DOM, not canvas, so its colours come from the same `data-theme`
 * table in `adachart-pro.css` that the toolbar reads.
 *
 * 画线栏是 DOM 而非 canvas，因此它的配色来自工具栏同样读取的、`adachart-pro.css` 里那张
 * `data-theme` 表。
 */
export function AdaChartProDrawingBar(props: AdaChartProDrawingBarProps) {
	const { locale, groups } = props;
	const [open, setOpen] = useState<OpenList>(null);
	const rootRef = useRef<HTMLDivElement | null>(null);

	/**
	 * The magnet the mode glyph stands for. `@klinecharts/pro` keeps this apart
	 * from the active mode: clicking the glyph toggles normal ↔ *this* magnet,
	 * and picking from the sub-list moves both. It is mirrored here because the
	 * glyph's whole meaning — which magnet comes back when you leave `normal` —
	 * is lost if the two are collapsed into one value.
	 *
	 * 模式图标所代表的磁吸档位。`@klinecharts/pro` 把它与当前模式分开保存：点击图标在
	 * normal 与*这一档*之间切换，而从子列表里选择会同时改动两者。这里照搬这个区分，因为
	 * 一旦把两者合成一个值，图标的全部含义 —— 离开 normal 时回到哪一档 —— 就丢了。
	 */
	const [magnet, setMagnet] = useState<OverlayMode>("weak_magnet");

	// Dismiss the open sub-list on an outside click, so it cannot be stranded
	// over the chart. Same rule as the toolbar's dropdowns.
	// 点击外部即收起已展开的子列表，避免它滞留在图表之上。与工具栏下拉同一规则。
	useEffect(() => {
		if (!open) return;
		const dismiss = (event: MouseEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
		};
		document.addEventListener("mousedown", dismiss);
		return () => document.removeEventListener("mousedown", dismiss);
	}, [open]);

	const toggle = (key: string) =>
		setOpen((current) => (current === key ? null : key));

	const groupsWithIcon = useMemo(
		() => groups.map((group) => ({ ...group, icon: group.tools[0].name })),
		[groups],
	);

	return (
		<div ref={rootRef} className="adachart-pro__drawing-bar">
			{groupsWithIcon.map((group) => {
				const armed = group.tools.some((item) => item.name === props.activeTool);
				return (
					<div key={group.key} className="adachart-pro__drawing-item">
						<button
							type="button"
							title={drawingMessage(locale, group.tools[0].labelKey)}
							className={
								armed
									? "adachart-pro__icon-button adachart-pro__icon-button--selected"
									: "adachart-pro__icon-button"
							}
							onClick={() => toggle(group.key)}
						>
							<AdaChartProOverlayIcon name={group.icon} />
						</button>
						<button
							type="button"
							title={drawingMessage(locale, "expand")}
							className={
								open === group.key
									? "adachart-pro__icon-arrow adachart-pro__icon-arrow--open"
									: "adachart-pro__icon-arrow"
							}
							onClick={() => toggle(group.key)}
						>
							<AdaChartProOverlayIcon name="chevron" />
						</button>
						{open === group.key && (
							<ul className="adachart-pro__drawing-list">
								{group.tools.map((item) => (
									<li key={item.name}>
										<button
											type="button"
											title={drawingMessage(locale, item.labelKey)}
											className={
												item.name === props.activeTool
													? "adachart-pro__drawing-entry adachart-pro__drawing-entry--selected"
													: "adachart-pro__drawing-entry"
											}
											onClick={() => {
												props.onToolChange(item.name);
												setOpen(null);
											}}
										>
											<AdaChartProOverlayIcon name={item.name} />
											<span className="adachart-pro__drawing-text">
												{drawingMessage(locale, item.labelKey)}
											</span>
										</button>
									</li>
								))}
							</ul>
						)}
					</div>
				);
			})}

			<span className="adachart-pro__split-line" />

			<div className="adachart-pro__drawing-item">
				<button
					type="button"
					title={drawingMessage(locale, props.mode === "normal" ? magnet : "normal")}
					className={
						props.mode === "normal"
							? "adachart-pro__icon-button"
							: "adachart-pro__icon-button adachart-pro__icon-button--selected"
					}
					onClick={() =>
						props.onModeChange(props.mode === "normal" ? magnet : "normal")
					}
				>
					<AdaChartProOverlayIcon name={magnet} />
				</button>
				<button
					type="button"
					title={drawingMessage(locale, magnet)}
					className={
						open === MODE_LIST
							? "adachart-pro__icon-arrow adachart-pro__icon-arrow--open"
							: "adachart-pro__icon-arrow"
					}
					onClick={() => toggle(MODE_LIST)}
				>
					<AdaChartProOverlayIcon name="chevron" />
				</button>
				{open === MODE_LIST && (
					<ul className="adachart-pro__drawing-list">
						{(["weak_magnet", "strong_magnet"] as const).map((name) => (
							<li key={name}>
								<button
									type="button"
									title={drawingMessage(locale, name)}
									className={
										props.mode === name
											? "adachart-pro__drawing-entry adachart-pro__drawing-entry--selected"
											: "adachart-pro__drawing-entry"
									}
									onClick={() => {
										setMagnet(name);
										props.onModeChange(name);
										setOpen(null);
									}}
								>
									<AdaChartProOverlayIcon name={name} />
									<span className="adachart-pro__drawing-text">
										{drawingMessage(locale, name)}
									</span>
								</button>
							</li>
						))}
					</ul>
				)}
			</div>

			<div className="adachart-pro__drawing-item">
				<button
					type="button"
					title={drawingMessage(locale, props.locked ? "unlock" : "lock")}
					className={
						props.locked
							? "adachart-pro__icon-button adachart-pro__icon-button--selected"
							: "adachart-pro__icon-button"
					}
					onClick={() => props.onLockChange(!props.locked)}
				>
					<AdaChartProOverlayIcon name={props.locked ? "lock" : "unlock"} />
				</button>
			</div>

			<div className="adachart-pro__drawing-item">
				<button
					type="button"
					title={drawingMessage(locale, props.visible ? "invisible" : "visible")}
					className="adachart-pro__icon-button"
					onClick={() => props.onVisibleChange(!props.visible)}
				>
					<AdaChartProOverlayIcon name={props.visible ? "visible" : "invisible"} />
				</button>
			</div>

			<span className="adachart-pro__split-line" />

			<div className="adachart-pro__drawing-item">
				<button
					type="button"
					title={drawingMessage(locale, "remove")}
					className="adachart-pro__icon-button"
					onClick={props.onRemoveAll}
				>
					<AdaChartProOverlayIcon name="remove" />
				</button>
			</div>
		</div>
	);
}