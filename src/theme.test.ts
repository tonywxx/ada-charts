import { describe, expect, it } from "vitest";
import { mergeStyles, themeStyles } from "./components/adachart/adachart-styles";
import { DARK_THEME, LIGHT_THEME, withAlpha } from "./theme";

type AdaStyles = ReturnType<typeof themeStyles>;
type BarColors = { upColor?: string; downColor?: string };

// `themeStyles` presets always use the object form of `candle.bar`; klinecharts
// v10.1 widened the type to a union that also admits a colour callback, so we
// narrow here rather than asserting on the bare union.
// `themeStyles` 预设永远使用 `candle.bar` 的对象形式；klinecharts v10.1 把该类型放宽成
// 一个也包含颜色回调的联合类型，因此在这里收窄，而不是对裸联合类型断言。
const barColors = (styles: AdaStyles) => (styles.candle?.bar ?? {}) as BarColors;

describe("withAlpha", () => {
	it("turns a 6-digit hex into rgba", () => {
		expect(withAlpha("#26a69a", 0.2)).toBe("rgba(38, 166, 154, 0.2)");
	});

	it("expands the 3-digit shorthand", () => {
		expect(withAlpha("#fff", 1)).toBe("rgba(255, 255, 255, 1)");
	});

	it("never concatenates onto a colour it cannot parse", () => {
		// The bug this replaces was `${upColor}33`, which produced `rgb()33` — an
		// invalid value the engines then rejected silently.
		// 它取代的缺陷是 `${upColor}33`，会拼出 `rgb()33` 这种引擎只能静默拒绝的值。
		expect(withAlpha("rgb(38, 166, 154)", 0.2)).toBe(
			"color-mix(in srgb, rgb(38, 166, 154) 20%, transparent)",
		);
		expect(withAlpha("rebeccapurple", 0.5)).toContain("color-mix");
	});

	it("clamps opacity into the representable range", () => {
		expect(withAlpha("#000000", -3)).toBe("rgba(0, 0, 0, 0)");
		expect(withAlpha("#000000", 9)).toBe("rgba(0, 0, 0, 1)");
	});
});

describe("Theme tokens", () => {
	it("drives klinecharts from the same tokens, in both directions", () => {
		const light = themeStyles("light");
		const dark = themeStyles("dark");
		expect(barColors(light).upColor).toBe(LIGHT_THEME.trendUp);
		expect(barColors(light).downColor).toBe(LIGHT_THEME.trendDown);
		expect(barColors(dark).upColor).toBe(DARK_THEME.trendUp);
	});

	it("shares the trend colours between modes but not the chrome", () => {
		expect(DARK_THEME.trendUp).toBe(LIGHT_THEME.trendUp);
		expect(DARK_THEME.gridLine).not.toBe(LIGHT_THEME.gridLine);
	});

	it("applies the caller's styles last, so one colour can still be overridden", () => {
		// Precedence was private before; this is the rule the docs describe.
		// 优先级在之前是私有的；这里就是文档所述的那条规则。
		const merged = mergeStyles(themeStyles("dark"), {
			candle: { bar: { upColor: "#000000" } },
		});
		expect(barColors(merged).upColor).toBe("#000000");
		expect(barColors(merged).downColor).toBe(DARK_THEME.trendDown);
	});

	it("replaces arrays wholesale rather than merging element-wise", () => {
		const merged = mergeStyles(
			{ candle: { area: { backgroundColor: [{ offset: 0, color: "a" }, { offset: 1, color: "b" }] } } },
			{ candle: { area: { backgroundColor: [{ offset: 0, color: "c" }] } } },
		);
		expect(merged.candle?.area?.backgroundColor).toHaveLength(1);
	});
});
