import { describe, expect, it } from "vitest";
import {
	ADACHARTPRO_DRAWING_GROUPS,
	ADACHARTPRO_DRAWING_MESSAGES,
	drawingGroupsFor,
	drawingMessage,
} from "./adachart-pro-drawing-tools";

/**
 * The drawing bar's table: which tools exist, what they are called, and what a
 * caller's `drawingTools` filter does to the groups. All three are decisions the
 * component makes from data, so they are asserted without a browser.
 *
 * 画线栏的表：有哪些工具、它们叫什么，以及调用方的 `drawingTools` 过滤对分组做了什么。
 * 三者都是组件由数据做出的判断，因此在这里不依赖浏览器地断言。
 */

/** Every tool in every group, in display order. 所有组里的全部工具，按显示顺序。 */
const ALL_TOOLS = ADACHARTPRO_DRAWING_GROUPS.flatMap((group) => group.tools);

/**
 * How many overlay names `AdaChart` can draw: 16 built in plus the 18 from
 * `@klinecharts/extension`. Spelled out rather than imported because that
 * table lives in `adachart-options.ts`, which reaches `klinecharts` at import
 * time — and the unit project is deliberately DOM-free. The two must agree, so
 * a name added on either side fails here.
 *
 * `AdaChart` 能画的 overlay 名称总数：内置 16 个加上 `@klinecharts/extension` 的 18 个。
 * 这里写死而不 import，是因为那张表位于 `adachart-options.ts`，而它在 import 期就会触到
 * `klinecharts` —— unit 项目刻意不带 DOM。两者必须一致，因此任一侧增删名称都会在这里失败。
 */
const ADACHART_OVERLAY_NAME_COUNT = 34;

describe("ADACHARTPRO_DRAWING_GROUPS", () => {
	it("groups every overlay name `AdaChart` can draw, each exactly once", () => {
		// The bar is the only entry point for drawing tools, so a name missing
		// here is a tool the component cannot draw at all.
		// 画线栏是画线工具的唯一入口，因此这里缺失的名称就是组件根本画不出的工具。
		expect(ALL_TOOLS).toHaveLength(ADACHART_OVERLAY_NAME_COUNT);
		expect(new Set(ALL_TOOLS.map((item) => item.name)).size).toBe(
			ADACHART_OVERLAY_NAME_COUNT,
		);
	});

	it("leads every group with the tool its glyph arms", () => {
		// A group's glyph *is* its first member: clicking the glyph arms that
		// tool, so an empty group would be a glyph that does nothing.
		// 组的图标*就是*它的首个成员：点击图标即选中该工具，因此空组等于一个什么也不做的图标。
		for (const group of ADACHARTPRO_DRAWING_GROUPS) {
			expect(group.tools.length).toBeGreaterThan(0);
			expect(group.key).not.toBe("");
		}
	});

	it("names every tool and every bar control in both locales", () => {
		const keys = [
			...ALL_TOOLS.map((item) => item.labelKey),
			"weak_magnet",
			"strong_magnet",
			"normal",
			"expand",
			"lock",
			"unlock",
			"visible",
			"invisible",
			"remove",
		];
		for (const locale of ["en-US", "zh-CN"]) {
			for (const key of keys) {
				// `drawingMessage` falls back to the key itself, so a missing entry
				// would show up as a raw identifier rather than fail loudly.
				// `drawingMessage` 会回退到键本身，因此缺失条目会显示成原始标识符而非直接报错。
				expect(ADACHARTPRO_DRAWING_MESSAGES[locale][key]).toBeTruthy();
			}
		}
	});
});

describe("drawingMessage", () => {
	it("reads each locale's own wording", () => {
		expect(drawingMessage("en-US", "circle")).toBe("Circle");
		expect(drawingMessage("zh-CN", "circle")).toBe("圆");
	});

	it("falls back to en-US for an unknown locale and to the key for an unknown one", () => {
		expect(drawingMessage("fr-FR", "circle")).toBe("Circle");
		expect(drawingMessage("en-US", "no_such_tool")).toBe("no_such_tool");
	});
});

describe("drawingGroupsFor", () => {
	it("offers every group for an empty allow-list", () => {
		const groups = drawingGroupsFor([]);
		expect(groups).toHaveLength(ADACHARTPRO_DRAWING_GROUPS.length);
		expect(groups.flatMap((group) => group.tools)).toHaveLength(ALL_TOOLS.length);
	});

	it("keeps only the groups a filter reaches, in table order", () => {
		const groups = drawingGroupsFor(["horizontalStraightLine", "circle"]);
		expect(groups.map((group) => group.key)).toEqual(["singleLine", "polygon"]);
		expect(groups[0].tools.map((item) => item.name)).toEqual([
			"horizontalStraightLine",
		]);
	});

	it("leads a filtered group with whatever survived, not the original glyph", () => {
		// The group glyph is its first *remaining* member, which is what a click
		// on that glyph arms — so filtering can move the glyph.
		// 组图标是它*剩下*的首个成员，点击该图标选中的正是它 —— 因此过滤会移动图标。
		const [group] = drawingGroupsFor(["triangle"]);
		expect(group.key).toBe("polygon");
		expect(group.tools.map((item) => item.name)).toEqual(["triangle"]);
	});

	it("drops a group whose every member is filtered out", () => {
		// A group with no members would render as a glyph that arms nothing.
		// 成员被全部滤掉的组会渲染成一个什么都选不中的图标。
		const groups = drawingGroupsFor(["circle"]);
		expect(groups.map((group) => group.key)).toEqual(["polygon"]);
	});

	it("returns nothing when the filter matches nothing", () => {
		expect(drawingGroupsFor(["no_such_tool"])).toEqual([]);
	});

	it("hands back fresh arrays, so a caller cannot mutate the table", () => {
		const [group] = drawingGroupsFor([]);
		group.tools.pop();
		expect(ADACHARTPRO_DRAWING_GROUPS[0].tools).toHaveLength(
			group.tools.length + 1,
		);
	});
});