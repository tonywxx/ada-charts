import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	AdaChartProIndicatorParamsDialog,
	AdaChartProSettingsDialog,
	AdaChartProTimezoneDialog,
} from "./adachart-pro-dialogs";
import {
	ADACHARTPRO_DEFAULT_SETTINGS,
	ADACHARTPRO_SETTING_CANDLE_TYPES,
	ADACHARTPRO_TIMEZONES,
} from "./adachart-pro-settings";

/**
 * The three dialogs' rendered shape: their stated width, their field labels and
 * how many controls each row contributes.
 *
 * These are asserted as static markup rather than through a browser because the
 * facts in question are decisions, not runtime behaviour — 320px is what the
 * dialog is *told* to be, and one number input per `calcParams` entry is a rule
 * about how the draft is built. Everything that has to move — the confirm path,
 * the live settings change — is covered by `adachart-pro-settings.test.ts`.
 *
 * 三个对话框渲染出的形状：写明的宽度、各字段标签，以及每行贡献多少控件。
 *
 * 这些以静态标记断言而不是经浏览器，因为所问的事实是判断而非运行时行为 —— 320px 是对话框
 * *被告知*的宽度，而每个 `calcParams` 一项数字输入是关于草稿如何构建的规则。真正需要动起来的
 * 部分（确定路径、设置实时生效）由 `adachart-pro-settings.test.ts` 覆盖。
 */

const noop = () => undefined;

/** How many times `needle` occurs in `markup`. `needle` 在 `markup` 中出现的次数。 */
function count(markup: string, needle: string): number {
	return markup.split(needle).length - 1;
}

describe("AdaChartProSettingsDialog", () => {
	const markup = renderToStaticMarkup(
		createElement(AdaChartProSettingsDialog, {
			locale: "en-US",
			settings: ADACHARTPRO_DEFAULT_SETTINGS,
			reverseAxis: false,
			drawing: true,
			onChange: noop,
			onReverseAxisChange: noop,
			onDrawingChange: noop,
			onClose: noop,
		}),
	);

	it("is a modal of the width Pro states", () => {
		expect(markup).toContain('role="dialog"');
		expect(markup).toContain('aria-modal="true"');
		expect(markup).toContain("width:320px");
		// The backdrop is a real button, so a keyboard user can dismiss the modal.
		// 遮罩是真按钮，因此键盘用户也能关闭它。
		expect(markup).toContain('class="adachart-pro__modal-backdrop"');
		expect(markup).toContain("<button");
	});

	it("carries Pro's seven rows plus the drawing switch", () => {
		for (const label of [
			"Candle type",
			"Last price",
			"High price",
			"Low price",
			"Indicator last value",
			"Reverse axis",
			"Grid",
			// This library's own row, and the only one that removes chrome rather
			// than changing how the chart is painted.
			// 本库自己的一行，也是唯一一行移除外围、而非改变图表画法的设置。
			"Drawing",
		]) {
			expect(markup).toContain(label);
		}
		expect(count(markup, "adachart-pro__field-label")).toBe(8);
	});

	it("offers every candle kind and seven switches", () => {
		for (const type of ADACHARTPRO_SETTING_CANDLE_TYPES) {
			expect(markup).toContain(`value="${type}"`);
		}
		expect(count(markup, 'type="checkbox"')).toBe(7);
		// The one non-switch row is the candle select.
		// 唯一的非开关行是蜡烛样式下拉。
		expect(count(markup, "<select")).toBe(1);
	});

	it("mirrors the live values it was seeded with", () => {
		expect(markup).toContain('value="candle_solid"');
		// Every switch starts checked, because the defaults for these five are on.
		// 五个开关起手都是勾选的，因为这五行的默认值都是开启。
		expect(count(markup, "checked=")).toBe(5);
	});

	it("shows the drawing switch off for a chart that cannot be drawn on, and leaves room to turn it on", () => {
		// The row is not hidden along with the chrome it controls: a reader who has
		// just switched drawing off has to be able to switch it back on from the same
		// dialog, so the row outlives the bar, the toolbar toggle and the manager.
		//
		// 这一行不会连同它控制的那些外围一起消失：刚把画线关掉的读者必须能从同一个对话框再打开它，
		// 因此这一行比画线栏、工具栏开关与管理器活得更久。
		const off = renderToStaticMarkup(
			createElement(AdaChartProSettingsDialog, {
				locale: "en-US",
				settings: ADACHARTPRO_DEFAULT_SETTINGS,
				reverseAxis: false,
				drawing: false,
				onChange: noop,
				onReverseAxisChange: noop,
				onDrawingChange: noop,
				onClose: noop,
			}),
		);
		// The row immediately after its label is the checkbox, and it is the one
		// switch in this dialog that is off — every style row still mirrors the
		// defaults it was seeded with.
		//
		// 紧跟在标签之后的就是那个复选框，而它是本对话框里唯一未勾选的开关 —— 样式各行仍然镜像
		// 它们被播种时的默认值。
		const label = "Drawing</label>";
		const control = off.slice(off.indexOf(label) + label.length);
		const input = control.slice(0, control.indexOf(">") + 1);
		expect(input).toContain('type="checkbox"');
		expect(input).not.toContain("checked");
		expect(count(off, "checked=")).toBe(4);
	});
});

describe("AdaChartProTimezoneDialog", () => {
	it("offers the curated list and drafts the active zone", () => {
		const markup = renderToStaticMarkup(
			createElement(AdaChartProTimezoneDialog, {
				locale: "en-US",
				timezone: "Asia/Shanghai",
				onConfirm: noop,
				onClose: noop,
			}),
		);
		expect(markup).toContain("width:320px");
		expect(count(markup, "<option")).toBe(ADACHARTPRO_TIMEZONES.length);
		expect(markup).toContain('value="Asia/Shanghai" selected=""');
	});

	it("offers a zone the list does not carry rather than replacing it", () => {
		// A caller's own `timezone` prop must survive the dialog being opened.
		// 调用方自己传的 `timezone` 必须在对话框打开后存活下来。
		const markup = renderToStaticMarkup(
			createElement(AdaChartProTimezoneDialog, {
				locale: "en-US",
				timezone: "Europe/Kyiv",
				onConfirm: noop,
				onClose: noop,
			}),
		);
		expect(count(markup, "<option")).toBe(ADACHARTPRO_TIMEZONES.length + 1);
		expect(markup).toContain('value="Europe/Kyiv" selected=""');
	});
});

describe("AdaChartProIndicatorParamsDialog", () => {
	it("names itself after the indicator and sizes rows by its figures", () => {
		const markup = renderToStaticMarkup(
			createElement(AdaChartProIndicatorParamsDialog, {
				locale: "en-US",
				name: "MA",
				calcParams: [5, 10, 30],
				lineColors: ["#FF9600", "#935EBD", "#1677FF"],
				onConfirm: noop,
				onClose: noop,
			}),
		);
		expect(markup).toContain("width:360px");
		expect(markup).toContain("MA");
		expect(count(markup, 'type="number"')).toBe(3);
		expect(count(markup, 'type="color"')).toBe(3);
		// One label per parameter and one per line, both numbered from 1.
		// 每个参数一个标签、每条线一个标签，都从 1 开始编号。
		expect(markup).toContain("Parameter 1");
		expect(markup).toContain("Parameter 3");
		expect(markup).toContain("Line colour 1");
		expect(markup).toContain('value="#FF9600"');
	});

	it("draws no line rows for an indicator that draws no lines", () => {
		// `VOL` is a bar figure; an indicator with no lines must not gain a colour
		// row, and therefore must not gain an empty `styles.lines` on confirm.
		// `VOL` 是柱状图形；没有线的指标不该多出一个颜色行，因此确定时也不该得到空的
		// `styles.lines`。
		const markup = renderToStaticMarkup(
			createElement(AdaChartProIndicatorParamsDialog, {
				locale: "en-US",
				name: "VOL",
				calcParams: [5, 10],
				lineColors: [],
				onConfirm: noop,
				onClose: noop,
			}),
		);
		expect(count(markup, 'type="color"')).toBe(0);
		expect(count(markup, 'type="number"')).toBe(2);
	});
});