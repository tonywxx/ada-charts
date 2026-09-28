/**
 * The drawing bar's structure and wording: which tools sit behind which group
 * glyph, and what each one is called in each locale.
 *
 * The grouping is copied from `@klinecharts/pro`'s drawing bar rather than
 * invented here, so the same tool is behind the same glyph in both Pro layers:
 * five groups — single lines, channels, shapes, Fibonacci, waves — each headed
 * by its first member's glyph, which is also what a click on that glyph arms.
 *
 * `@klinecharts/pro` leaves four of the tools `AdaChart` can draw out of those
 * groups (`brush`, `simpleAnnotation`, `simpleTag`, `measure`). They are not
 * dropped: they form a sixth "More" group, so removing the top toolbar's
 * drawing dropdown does not cost a tool. Everything about that group except its
 * membership is ours — it has no counterpart in the source.
 *
 * 画线栏的结构与文案：哪些工具藏在哪个组图标之后，以及它们在每种语言下叫什么。
 *
 * 分组照抄 `@klinecharts/pro` 的画线栏而非自己发明，因此同一个工具在两层 Pro 里位于同一个
 * 图标之后：五组 —— 单线、通道、图形、斐波那契、波浪 —— 每组以首个成员的图标领衔，点击该
 * 图标选中的也正是它。
 *
 * `@klinecharts/pro` 把 `AdaChart` 能画的工具里的四个（`brush`、`simpleAnnotation`、
 * `simpleTag`、`measure`）留在了这些组之外。它们没有被丢掉：它们构成第六个「更多」组，因此
 * 移除顶部工具栏的画线下拉不会损失任何工具。该组除成员外的一切都是本层自己的 —— 源里没有对应物。
 */

/**
 * The `groupId` every overlay drawn from the bar carries. `@klinecharts/pro` uses
 * this literal, and keeping it makes "clear all" (`removeOverlay({ groupId })`)
 * mean the same thing on both layers.
 *
 * 从画线栏画出的每一条 overlay 都带这个 `groupId`。`@klinecharts/pro` 用的是这同一字面量，
 * 沿用它可以让「清空全部」（`removeOverlay({ groupId })`）在两层上含义一致。
 */
export const ADACHARTPRO_DRAWING_GROUP_ID = "drawing_tools";

/** One tool in a group: the overlay name plus the label key it is named by. 组内一个工具：画线名称，以及给它命名的文案键。 */
export interface AdaChartProDrawingTool {
	/** The `klinecharts` overlay name, i.e. what `createOverlay({ name })` takes. `klinecharts` 的 overlay 名称，即 `createOverlay({ name })` 所取。 */
	name: string;
	/** Key into {@link ADACHARTPRO_DRAWING_MESSAGES}. {@link ADACHARTPRO_DRAWING_MESSAGES} 的键。 */
	labelKey: string;
}

/** A group of tools behind one glyph. 藏在一个图标之后的一组工具。 */
export interface AdaChartProDrawingGroup {
	/** Stable identity of the group, for keys and tests. 组的稳定标识，供 key 与测试使用。 */
	key: string;
	/**
	 * Tools in display order. The first one is the group's glyph; the glyph does
	 * not arm it — clicking the glyph opens the group's list, so every tool in
	 * the group is reached the same way. See `AdaChartProDrawingBar` for why that
	 * departs from the source.
	 *
	 * 按显示顺序排列的工具。第一个即该组的图标；图标并不选中它 —— 点击图标展开该组列表，组内
	 * 每个工具因此都走同一条路径。这一处为何偏离源文件，见 `AdaChartProDrawingBar`。
	 */
	tools: AdaChartProDrawingTool[];
}

const tool = (name: string, labelKey: string): AdaChartProDrawingTool => ({
	name,
	labelKey,
});

/**
 * The five groups copied from the source, in the source's order, plus the
 * "More" group for the tools the source leaves out of them.
 *
 * 从源文件抄来的五个组，顺序也照抄；另加一个「更多」组，收纳源文件未归组的那些工具。
 */
export const ADACHARTPRO_DRAWING_GROUPS: readonly AdaChartProDrawingGroup[] = [
	{
		key: "singleLine",
		tools: [
			tool("horizontalStraightLine", "horizontal_straight_line"),
			tool("horizontalRayLine", "horizontal_ray_line"),
			tool("horizontalSegment", "horizontal_segment"),
			tool("verticalStraightLine", "vertical_straight_line"),
			tool("verticalRayLine", "vertical_ray_line"),
			tool("verticalSegment", "vertical_segment"),
			tool("straightLine", "straight_line"),
			tool("rayLine", "ray_line"),
			tool("segment", "segment"),
			tool("arrow", "arrow"),
			tool("priceLine", "price_line"),
		],
	},
	{
		key: "moreLine",
		tools: [
			tool("priceChannelLine", "price_channel_line"),
			tool("parallelStraightLine", "parallel_straight_line"),
		],
	},
	{
		key: "polygon",
		tools: [
			tool("circle", "circle"),
			tool("rect", "rect"),
			tool("parallelogram", "parallelogram"),
			tool("triangle", "triangle"),
		],
	},
	{
		key: "fibonacci",
		tools: [
			tool("fibonacciLine", "fibonacci_line"),
			tool("fibonacciSegment", "fibonacci_segment"),
			tool("fibonacciCircle", "fibonacci_circle"),
			tool("fibonacciSpiral", "fibonacci_spiral"),
			tool("fibonacciSpeedResistanceFan", "fibonacci_speed_resistance_fan"),
			tool("fibonacciExtension", "fibonacci_extension"),
			tool("gannBox", "gann_box"),
		],
	},
	{
		key: "wave",
		tools: [
			tool("xabcd", "xabcd"),
			tool("abcd", "abcd"),
			tool("threeWaves", "three_waves"),
			tool("fiveWaves", "five_waves"),
			tool("eightWaves", "eight_waves"),
			tool("anyWaves", "any_waves"),
		],
	},
	{
		key: "more",
		tools: [
			tool("brush", "brush"),
			tool("simpleAnnotation", "simple_annotation"),
			tool("simpleTag", "simple_tag"),
			tool("measure", "measure"),
		],
	},
];

/**
 * Drawing-bar strings, per locale. The thirty grouped tools keep the wording
 * `@klinecharts/pro` uses, so the two Pro layers read alike; the four tools the
 * source leaves ungrouped, and the controls the source labels by glyph alone,
 * are named here.
 *
 * 画线栏文案，按语言分。归组的三十个工具沿用 `@klinecharts/pro` 的措辞，使两层 Pro 读起来
 * 一致；源文件未归组的四个工具、以及源文件只用图标表示的那些控件，在此命名。
 */
export const ADACHARTPRO_DRAWING_MESSAGES: Record<
	string,
	Record<string, string>
> = {
	"en-US": {
		horizontal_straight_line: "Horizontal Line",
		horizontal_ray_line: "Horizontal Ray",
		horizontal_segment: "Horizontal Segment",
		vertical_straight_line: "Vertical Line",
		vertical_ray_line: "Vertical Ray",
		vertical_segment: "Vertical Segment",
		straight_line: "Trend Line",
		ray_line: "Ray",
		segment: "Segment",
		arrow: "Arrow",
		price_line: "Price Line",
		price_channel_line: "Price Channel Line",
		parallel_straight_line: "Parallel Line",
		circle: "Circle",
		rect: "Rect",
		parallelogram: "Parallelogram",
		triangle: "Triangle",
		fibonacci_line: "Fibonacci Line",
		fibonacci_segment: "Fibonacci Segment",
		fibonacci_circle: "Fibonacci Circle",
		fibonacci_spiral: "Fibonacci Spiral",
		fibonacci_speed_resistance_fan: "Fibonacci Sector",
		fibonacci_extension: "Fibonacci Extension",
		gann_box: "Gann Box",
		xabcd: "XABCD Pattern",
		abcd: "ABCD Pattern",
		three_waves: "Three Waves",
		five_waves: "Five Waves",
		eight_waves: "Eight Waves",
		any_waves: "Any Waves",
		brush: "Brush",
		simple_annotation: "Annotation",
		simple_tag: "Tag",
		measure: "Measure",
		weak_magnet: "Weak Magnet",
		strong_magnet: "Strong Magnet",
		normal: "Cursor",
		expand: "More tools",
		lock: "Lock",
		unlock: "Unlock",
		visible: "Show",
		invisible: "Hide",
		remove: "Clear All",
	},
	"zh-CN": {
		horizontal_straight_line: "水平直线",
		horizontal_ray_line: "水平射线",
		horizontal_segment: "水平线段",
		vertical_straight_line: "垂直直线",
		vertical_ray_line: "垂直射线",
		vertical_segment: "垂直线段",
		straight_line: "直线",
		ray_line: "射线",
		segment: "线段",
		arrow: "箭头",
		price_line: "价格线",
		price_channel_line: "价格通道线",
		parallel_straight_line: "平行直线",
		circle: "圆",
		rect: "矩形",
		parallelogram: "平行四边形",
		triangle: "三角形",
		fibonacci_line: "斐波那契回调直线",
		fibonacci_segment: "斐波那契回调线段",
		fibonacci_circle: "斐波那契圆环",
		fibonacci_spiral: "斐波那契螺旋",
		fibonacci_speed_resistance_fan: "斐波那契速度阻力扇",
		fibonacci_extension: "斐波那契趋势扩展",
		gann_box: "江恩箱",
		xabcd: "XABCD形态",
		abcd: "ABCD形态",
		three_waves: "三浪",
		five_waves: "五浪",
		eight_waves: "八浪",
		any_waves: "任意浪",
		brush: "画笔",
		simple_annotation: "标注",
		simple_tag: "标签",
		measure: "测量",
		weak_magnet: "弱磁模式",
		strong_magnet: "强磁模式",
		normal: "光标",
		expand: "更多工具",
		lock: "锁定",
		unlock: "解锁",
		visible: "显示",
		invisible: "隐藏",
		remove: "清空全部",
	},
};

/**
 * A drawing-bar string. An unknown locale falls back to `en-US`, and an unknown
 * key to the key itself, so a missing entry shows up instead of rendering nothing.
 *
 * 画线栏的一条文案。未知语言回退到 `en-US`，未知键回退到键本身 —— 缺条目会显形，而不是渲染成空。
 */
export function drawingMessage(locale: string, key: string): string {
	return (
		ADACHARTPRO_DRAWING_MESSAGES[locale]?.[key] ??
		ADACHARTPRO_DRAWING_MESSAGES["en-US"][key] ??
		key
	);
}

/**
 * The groups to show, filtered by the names the caller allows. An empty
 * `allowed` means "everything" — the same rule the `drawingTools` prop has had
 * all along — and a group whose every tool is filtered out is dropped rather
 * than left as an empty glyph.
 *
 * 要显示的组，按调用方允许的名称过滤。`allowed` 为空表示「全部」—— 与 `drawingTools`
 * 属性一贯的规则相同；成员全被过滤掉的组会被整组丢弃，而不是留一个空图标。
 */
export function drawingGroupsFor(
	allowed: readonly string[],
): AdaChartProDrawingGroup[] {
	if (allowed.length === 0) return ADACHARTPRO_DRAWING_GROUPS.map(cloneGroup);
	const names = new Set(allowed);
	return ADACHARTPRO_DRAWING_GROUPS.map((group) => ({
		key: group.key,
		tools: group.tools.filter((item) => names.has(item.name)),
	})).filter((group) => group.tools.length > 0);
}

function cloneGroup(group: AdaChartProDrawingGroup): AdaChartProDrawingGroup {
	return { key: group.key, tools: [...group.tools] };
}