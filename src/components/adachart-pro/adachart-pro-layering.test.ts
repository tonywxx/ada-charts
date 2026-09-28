import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The watermark layering contract.
 *
 * The watermark is a DOM layer *under* `.adachart-pro__chart`, which only works
 * while nothing between them is opaque. Two facts have to hold together, and
 * each one looks reasonable on its own:
 *
 *   1. the chart surface is painted on `.adachart-pro__body`, one level *up*
 *      from the chart layer, and
 *   2. `AdaChart` is handed `transparent`, so it does not paint an opaque
 *      background *inside* the chart layer.
 *
 * Break either one and the watermark silently disappears — there is no error,
 * the chart still works, and the only symptom is a decoration nobody was looking
 * at. That is exactly how it regressed once already, so both halves are asserted
 * here rather than left to a one-off check.
 *
 * 水印层序契约。
 *
 * 水印是 `.adachart-pro__chart` *之下* 的一层 DOM，这只有在两者之间没有任何不透明物时
 * 才成立。有两条必须同时成立的事实，而它们各自单看都很合理：
 *
 *   1. 图表表面色涂在 `.adachart-pro__body` 上 —— 位于图表层的*上一级*；
 *   2. 交给 `AdaChart` 的是 `transparent`，因此它不会在图表层*内部*涂上不透明背景。
 *
 * 破坏任何一条，水印都会静默消失 —— 不报错、图表照常工作，唯一症状是一个没人盯着的装饰。
 * 它上一次就是这样回归的，所以这两半都在此断言，而不是交给一次性的检查。
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const CSS = fs.readFileSync(path.join(here, "adachart-pro.css"), "utf8");

/** Escapes a selector so it can be embedded in a `RegExp`. 转义选择器，使其可嵌入 `RegExp`。 */
function escapeSelector(selector: string): string {
	return selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The declaration block of `selector`'s rule. Throws rather than returning an
 * empty string: a selector that no longer exists is a failure of this contract,
 * not a reason to assert against nothing.
 *
 * 取 `selector` 规则的声明块。找不到时抛错而不是返回空串：选择器消失本身就是这份契约的
 * 失败，不能当作「什么都没断言」的理由。
 */
function rule(selector: string): string {
	const match = CSS.match(
		new RegExp(`${escapeSelector(selector)}\\s*\\{([^}]*)\\}`),
	);
	if (!match) throw new Error(`adachart-pro.css has no rule for ${selector}`);
	return match[1];
}

const SURFACE_THEMES = [
	'.adachart-pro[data-theme="light"]',
	'.adachart-pro[data-theme="dark"]',
];

describe("the chart surface is painted one layer above the chart", () => {
	it.each(SURFACE_THEMES)("defines an opaque --adacp-surface in %s", (theme) => {
		const block = rule(theme);
		const declared = block.match(/--adacp-surface:\s*([^;]+);/);
		expect(declared).not.toBeNull();
		const value = declared?.[1].trim() ?? "";
		// A transparent or missing surface would let the page background show
		// through the chart, which is a different bug than the one guarded here —
		// so the value is asserted to actually be a colour.
		expect(value).not.toBe("transparent");
		expect(value).toMatch(/^(#|rgb|hsl)/);
	});

	it("paints it on .adachart-pro__body", () => {
		expect(rule(".adachart-pro__body")).toMatch(
			/background:\s*var\(--adacp-surface\)/,
		);
	});

	it("leaves .adachart-pro__chart with no background of its own", () => {
		// The regression: moving the surface back onto the chart layer puts an
		// opaque fill between the watermark and the canvas.
		// 回归形态：把表面色挪回图表层，就会在水印与 canvas 之间插入一层不透明填充。
		expect(rule(".adachart-pro__chart")).not.toMatch(/background/);
	});

	it("keeps the watermark under the chart layer and out of the pointer path", () => {
		const watermark = rule(".adachart-pro__watermark");
		expect(watermark).toMatch(/position:\s*absolute/);
		expect(watermark).toMatch(/inset:\s*0/);
		expect(watermark).toMatch(/z-index:\s*0/);
		expect(watermark).toMatch(/pointer-events:\s*none/);
		// The pair is what orders them: 0 below, 1 above.
		expect(rule(".adachart-pro__chart")).toMatch(/z-index:\s*1/);
	});
});

describe("AdaChartPro hands AdaChart a transparent background", () => {
	let markup = "";

	beforeAll(async () => {
		// `klinecharts` reads `window.navigator.userAgent` while its module loads
		// (`isAppleOS`, for the hotkey alias), and this project's `unit` environment
		// is node. Stubbing that one global is what lets the real component render
		// here; if a future version needs more, this test fails loudly rather than
		// silently asserting against nothing.
		//
		// `klinecharts` 在模块加载期会读 `window.navigator.userAgent`（`isAppleOS`，用于快捷键
		// 别名），而本项目的 `unit` 环境是 node。把这一个全局补上，真实组件就能在此渲染；
		// 若未来版本需要更多，这个测试会响亮地失败，而不是静默地什么也没断言。
		(globalThis as { window?: unknown }).window = {
			navigator: { userAgent: "node" },
		};
		const { default: AdaChartPro } = await import("./AdaChartPro");
		markup = renderToStaticMarkup(
			createElement(AdaChartPro, { watermark: "ADA" }),
		);
	});

	it("renders the watermark before the chart layer inside the body", () => {
		const body = markup.indexOf("adachart-pro__body");
		const watermark = markup.indexOf("adachart-pro__watermark");
		const chart = markup.indexOf("adachart-pro__chart");
		expect(body).toBeGreaterThan(-1);
		expect(watermark).toBeGreaterThan(body);
		expect(chart).toBeGreaterThan(watermark);
	});

	it("gives the chart's host element nothing opaque to paint", () => {
		const chartLayer = markup.slice(markup.indexOf("adachart-pro__chart"));
		const hostStyle = chartLayer.match(/style="([^"]*)"/)?.[1] ?? "";
		expect(hostStyle).toMatch(/background:\s*transparent/);
		// Nothing at or below the chart layer may paint a background: everything
		// there is above the watermark.
		// 图表层及其内部都不得涂背景：那里的任何东西都在水印之上。
		expect(chartLayer).not.toMatch(/background:\s*(#|rgb|hsl)/);
	});
});