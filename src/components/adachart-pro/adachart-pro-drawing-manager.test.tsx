import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	AdaChartProDrawingManager,
	type AdaChartProDrawingManagerProps,
	type AdaChartProDrawingRow,
} from "./adachart-pro-drawing-manager";

/**
 * The manager panel's rendered shape: how many rows it prints, what each row can
 * be told to do, and which of those affordances follow the overlay's own state.
 *
 * These are asserted as static markup rather than through a browser because the
 * facts in question are decisions, not runtime behaviour — five actions per row
 * is a rule about the panel's responsibility, and rows not being clickable is
 * `Chart` having no call that selects an overlay, not something a click test
 * could discover.
 *
 * 管理器面板渲染出的形状：印出多少行、每一行能被要求做什么、以及哪些可供性与 overlay 自身的
 * 状态一致。
 *
 * 这些以静态标记断言而不是经浏览器，因为所问的事实是判断而非运行时行为 —— 每行五个操作是关于
 * 面板职责的规则，而行不可点是因为 `Chart` 没有选中 overlay 的调用，不是点击测试能发现的。
 */

const noop = () => undefined;

/** A row that names nothing but is otherwise well formed. 一个什么都没命名、但其余字段完好的行。 */
function row(overrides: Partial<AdaChartProDrawingRow> = {}): AdaChartProDrawingRow {
	return {
		id: "o1",
		name: "segment",
		label: "Support",
		locked: false,
		visible: true,
		...overrides,
	};
}

function render(overrides: Partial<AdaChartProDrawingManagerProps> = {}): string {
	return renderToStaticMarkup(
		createElement(AdaChartProDrawingManager, {
			locale: "en-US",
			rows: [],
			selectedId: null,
			onRename: noop,
			onToggleLock: noop,
			onToggleVisible: noop,
			onBringToFront: noop,
			onDelete: noop,
			onClose: noop,
			...overrides,
		}),
	);
}

/** How many times `needle` occurs in `markup`. `needle` 在 `markup` 中出现的次数。 */
function count(markup: string, needle: string): number {
	return markup.split(needle).length - 1;
}

describe("AdaChartProDrawingManager", () => {
	it("is the panel that names what has been drawn, and can be dismissed", () => {
		const markup = render();
		expect(markup).toContain('class="adachart-pro__manager"');
		expect(markup).toContain("Drawings");
		expect(markup).toContain('aria-label="Close"');
	});

	it("says so when nothing has been drawn, rather than printing an empty list", () => {
		// An empty `<ul>` is a box the reader can see the edges of; the sentence is
		// what tells them the panel is working.
		// 空的 `<ul>` 是一个读者看得见边角的盒子；真正告诉他们面板在正常工作的是那句话。
		const markup = render({ rows: [] });
		expect(markup).toContain("Nothing drawn yet");
		expect(markup).not.toContain("<ul");
	});

	it("lists one row per drawing, under the name the reader gave it", () => {
		const markup = render({
			rows: [row(), row({ id: "o2", label: "Resistance" })],
		});
		expect(count(markup, "<li ")).toBe(2);
		expect(count(markup, "adachart-pro__manager-label")).toBe(2);
		expect(markup).toContain("Support");
		expect(markup).toContain("Resistance");
	});

	it("offers the same five actions on every row", () => {
		// Rename, lock, hide, raise, delete — the order the responsibility reads in.
		// 重命名、锁定、隐藏、置顶、删除 —— 职责读下来的顺序。
		const markup = render({ rows: [row(), row({ id: "o2" })] });
		expect(count(markup, 'class="adachart-pro__manager-action"')).toBe(8);
		expect(count(markup, "adachart-pro__manager-action--delete")).toBe(2);
		// The header's close button is the only other one: a row cannot be clicked,
		// because a click that highlighted its own row and moved nothing else is the
		// control the drawing bar refuses to ship.
		// 表头的关闭按钮是唯一的另一个：行不可点，因为一次只点亮自己那一行、别的什么都不动的点击，
		// 正是画线栏拒绝出厂的控件。
		expect(count(markup, "<button")).toBe(1 + 5 * 2);
	});

	it("highlights the row the canvas selected, and nothing when nothing is selected", () => {
		expect(render({ rows: [row()], selectedId: "o1" })).toContain(
			"adachart-pro__manager-row--selected",
		);
		expect(render({ rows: [row()], selectedId: "o2" })).not.toContain(
			"adachart-pro__manager-row--selected",
		);
	});

	it("mirrors each row's lock and visibility, and says what the click will do", () => {
		const markup = render({
			rows: [row({ locked: true, visible: false })],
		});
		// The buttons are the *other* state, so the label is the state they would
		// move the drawing to rather than the one it is in: a hidden drawing is
		// offered "Show", a locked one "Unlock".
		// 按钮代表的是*另一个*状态，因此文案是点击会把画线带到的状态，而不是它当前所处的状态：
		// 被隐藏的画线给出的按钮是「Show」，被锁定的给出的是「Unlock」。
		expect(markup).toContain('aria-label="Unlock"');
		expect(markup).toContain('aria-label="Show"');
		// Pressed follows the drawing, though: a hidden drawing's "hide" toggle is
		// the one that reads as engaged.
		// 按下态跟随画线本身：被隐藏的画线，读作已启用的正是它的「隐藏」开关。
		expect(count(markup, 'aria-pressed="true"')).toBe(2);
	});

	it("takes the row's glyph from the tool that drew it, not from the reader's name", () => {
		const iconsOf = (name: string) =>
			count(render({ rows: [row({ name })] }), 'class="adachart-pro__icon"');
		// Five action glyphs on either row; the sixth is the label's, and only a name
		// the engine's vocabulary knows gets one. An unknown name degrades to no
		// glyph rather than to a wrong one.
		// 两种行都各有五个操作图标；第六个属于标签，而只有引擎词汇认识的名字才配得上一个。未知的
		// 名字会退化成没有图标，而不是退化成错的图标。
		expect(iconsOf("segment")).toBe(6);
		expect(iconsOf("not-a-tool")).toBe(5);
	});

	it("speaks the reader's language", () => {
		const markup = render({ locale: "zh-CN" });
		expect(markup).toContain("画线对象");
		expect(markup).toContain("还没有画任何东西");
	});
});