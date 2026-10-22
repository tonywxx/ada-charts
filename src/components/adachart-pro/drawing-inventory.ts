import { drawingToolLabel } from "./adachart-pro-drawing-tools";

/**
 * The drawing manager's inventory, split out of `AdaChartPro` so the two rules
 * that decide the list — "what counts as a managed drawing" and "what each row
 * is labelled" — sit in one place with a test surface of their own, instead of
 * inline in the 1730-line Wrapper beside the chart-instance read-back.
 *
 * 画线管理器的库存：从 `AdaChartPro` 中拆出，使决定清单的两条规则 —— 「什么算一条受管画线」
 * 与「每行显示什么文案」—— 集中到一处、拥有自己的测试面，而不是和图表实例的读回一起内联在
 * 1730 行的 Wrapper 里。
 */

/** A drawing as the inventory holds it, before a label is attached. 一条画线在被贴上标签之前、库存所持有的样子。 */
export interface ManagedOverlay {
	/** The overlay's id, which every action is addressed to. overlay 的 id，所有操作都指向它。 */
	id: string;
	/** The `klinecharts` overlay name, i.e. which tool drew it; drives the row's glyph. `klinecharts` 的 overlay 名称，即由哪个工具画出；决定该行的图标。 */
	name: string;
	locked: boolean;
	visible: boolean;
}

/** A drawing as the panel shows it. 一条画线，即面板所显示的样子。 */
export interface AdaChartProDrawingRow extends ManagedOverlay {
	/** What to show: the name the reader gave it, or the tool's own label. 要显示的文本：读者给的名字，或工具自身的文案。 */
	label: string;
}

/** The minimal shape `chart.getOverlays()` returns that the inventory reads. 库存所读取的 `chart.getOverlays()` 返回的最小形状。 */
export interface RawOverlay {
	id: string;
	name: string;
	points: readonly unknown[];
	lock: boolean;
	visible: boolean;
}

/**
 * An overlay with no anchored point is not a drawing yet: selecting a tool
 * creates its overlay immediately, so an empty one would pop a row that
 * vanishes when the reader changes their mind. Excluding it is the rule that
 * keeps the list honest.
 *
 * 还没有落锚点的 overlay 不算一条画线：选中工具会立刻创建它的 overlay，因此空的那条若被列出，
 * 一点工具就会出现一行、读者改主意又消失。排除它，是让清单保持诚实的规则。
 */
export function isManagedOverlay(overlay: RawOverlay): boolean {
	return overlay.points.length > 0;
}

/**
 * Read the chart's overlays down to the ones the manager lists. The chart
 * read-back (`chart.getOverlays()`) stays in the Wrapper — this only decides
 * which of those count, and maps them to the inventory shape.
 *
 * 把图表的 overlays 读到「管理器会列出」的集合。图表的读回（`chart.getOverlays()`）留在 Wrapper ——
 * 这里只决定其中哪些算数，并把它们映射成库存形态。
 */
export function selectManagedOverlays(
	overlays: readonly RawOverlay[],
): ManagedOverlay[] {
	return overlays
		.filter(isManagedOverlay)
		.map((overlay) => ({
			id: overlay.id,
			name: overlay.name,
			locked: overlay.lock,
			visible: overlay.visible,
		}));
}

/**
 * Attach a label to each inventory overlay: the name the reader gave it wins,
 * and only when none was given does the tool's own label stand in — localised.
 *
 * 给每条库存 overlay 贴上文本：读者取的名字优先；没有时才退回到工具自身的文案，并按 locale 本地化。
 */
export function buildManagedRows(
	overlays: readonly ManagedOverlay[],
	names: Record<string, string>,
	locale: string,
): readonly AdaChartProDrawingRow[] {
	return overlays.map((overlay) => ({
		...overlay,
		label: names[overlay.id] ?? drawingToolLabel(locale, overlay.name),
	}));
}
