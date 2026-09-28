import type { FormatDateType, Styles } from "klinecharts";
import { describe, expect, it } from "vitest";
import {
	ADACHARTPRO_DEFAULT_LINE_COLORS,
	ADACHARTPRO_DEFAULT_SETTINGS,
	ADACHARTPRO_FALLBACK_LINE_COLOR,
	ADACHARTPRO_SETTING_CANDLE_TYPES,
	dateFormatOptions,
	dateFormatterFor,
	indicatorTooltipStyles,
	lineColorAt,
	lineFigureCount,
	numericCalcParams,
	settingsFromStyles,
	settingsStyles,
	timezoneLabel,
} from "./adachart-pro-settings";

/**
 * The decisions behind the three settings dialogs, asserted without a browser:
 * what a `Styles` tree reads back as, what a settings model writes down, and the
 * two derived tables (timezone labels, date shapes).
 *
 * 三个设置对话框背后的判断，不依赖浏览器地断言：一棵 `Styles` 树读回来是什么、一个设置模型
 * 写下去是什么，以及两张推导表（时区标签、日期形状）。
 */

/** A `Styles` tree with only the paths the settings dialog touches. 只含设置对话框所涉路径的 `Styles` 树。 */
function stylesLike(overrides: {
	candleType?: Styles["candle"]["type"];
	last?: boolean;
	high?: boolean;
	low?: boolean;
	indicatorLastValue?: boolean;
	grid?: boolean;
}): Styles {
	return {
		candle: {
			type: overrides.candleType ?? "candle_solid",
			priceMark: {
				last: { show: overrides.last ?? true },
				high: { show: overrides.high ?? true },
				low: { show: overrides.low ?? true },
			},
		},
		indicator: { lastValueMark: { show: overrides.indicatorLastValue ?? false } },
		grid: { show: overrides.grid ?? true },
	} as unknown as Styles;
}

describe("settingsFromStyles", () => {
	it("reads every row off the live tree", () => {
		const settings = settingsFromStyles(
			stylesLike({
				candleType: "area",
				last: false,
				high: false,
				low: false,
				indicatorLastValue: true,
				grid: false,
			}),
		);
		expect(settings).toEqual({
			candleType: "area",
			showLastPrice: false,
			showHighPrice: false,
			showLowPrice: false,
			showIndicatorLastValue: true,
			showGrid: false,
		});
	});
});

describe("settingsStyles", () => {
	it("writes every row back, so untouched rows keep their seeded values", () => {
		// Writing the whole model rather than the changed row is what keeps the
		// dialog honest: rows nobody touched land at the values it was seeded with.
		// 写整个模型而非只写被改的那行，是让对话框诚实的关键：没人碰过的行落在它被播种时的取值上。
		expect(settingsStyles(ADACHARTPRO_DEFAULT_SETTINGS)).toEqual({
			candle: {
				type: "candle_solid",
				priceMark: {
					last: { show: true },
					high: { show: true },
					low: { show: true },
				},
			},
			indicator: { lastValueMark: { show: false } },
			grid: { show: true },
		});
	});

	it("round-trips through settingsFromStyles", () => {
		// Writing the whole model down and reading it back is the identity, which is
		// what makes "the untouched rows keep their seeded values" true.
		// 把整个模型写下再读回来是恒等变换，这正是「没被碰过的行保持播种值」成立的原因。
		const settings = {
			...ADACHARTPRO_DEFAULT_SETTINGS,
			candleType: "ohlc" as const,
			showGrid: false,
			showIndicatorLastValue: true,
		};
		expect(settingsFromStyles(settingsStyles(settings) as Styles)).toEqual(settings);
	});
});

describe("ADACHARTPRO_SETTING_CANDLE_TYPES", () => {
	it("offers every candle kind and no duplicates", () => {
		expect(new Set(ADACHARTPRO_SETTING_CANDLE_TYPES).size).toBe(
			ADACHARTPRO_SETTING_CANDLE_TYPES.length,
		);
		expect(ADACHARTPRO_SETTING_CANDLE_TYPES).toContain(
			ADACHARTPRO_DEFAULT_SETTINGS.candleType,
		);
	});
});

describe("timezoneLabel", () => {
	it("spells the offset out beside the zone name", () => {
		expect(timezoneLabel("Asia/Shanghai", "en-US")).toBe("Asia/Shanghai (GMT+8)");
	});

	it("keeps a bare name rather than throwing on an unknown zone", () => {
		expect(timezoneLabel("Not/AZone", "en-US")).toBe("Not/AZone");
	});
});

describe("dateFormatOptions", () => {
	it("gives a minute chart a time and a yearly chart a year", () => {
		// The whole point of the table: one template for every bar size would put a
		// year on a 60-tick minute axis and `HH:mm` on a yearly one.
		// 这张表的全部意义：对每种周期都用同一个模板，会让分钟图的 60 个刻度里出现年份、
		// 让年线图显示 `HH:mm`。
		expect(dateFormatOptions("minute", "xAxis")).toEqual({
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		});
		expect(dateFormatOptions("year", "xAxis")).toEqual({ year: "numeric" });
		expect(dateFormatOptions("month", "xAxis")).toEqual({
			year: "numeric",
			month: "2-digit",
		});
	});

	it("adds seconds on a second chart's axis only", () => {
		expect(dateFormatOptions("second", "xAxis")).toMatchObject({ second: "2-digit" });
		expect(dateFormatOptions("second", "crosshair")).not.toHaveProperty("second");
	});

	it("falls back to a plain date for day, week and anything v10 adds later", () => {
		expect(dateFormatOptions("day", "xAxis")).toEqual({
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		});
		expect(dateFormatOptions("week", "tooltip")).toEqual({
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		});
	});
});

describe("dateFormatterFor", () => {
	// 2026-09-27T04:30:00Z
	const timestamp = Date.UTC(2026, 8, 27, 4, 30, 0);

	/**
	 * The parameter object v10 hands to a formatter. Supplied in full because the
	 * point of two of the tests below is that the formatter reads none of it.
	 *
	 * v10 交给格式化器的参数对象。完整提供，因为下面两个测试的重点正是格式化器不读其中任何一项。
	 */
	const engineParams = (type: FormatDateType, template = "{YYYY}-{MM}-{DD} {HH}:{mm}") => ({
		timestamp,
		type,
		template,
		dateTimeFormat: new Intl.DateTimeFormat("en-US", { timeZone: "UTC" }),
	});

	it("formats in the given timezone and locale", () => {
		const format = dateFormatterFor("minute", "en-US", "Asia/Shanghai");
		expect(format(engineParams("xAxis"))).toBe("12:30");
		expect(format(engineParams("crosshair"))).toContain("09/27/2026");
	});

	it("ignores the engine's own formatter and template", () => {
		// v10 hands both to every call; honouring them would reintroduce the
		// one-template-for-every-bar-size behaviour this formatter exists to replace.
		// v10 每次调用都会交来两者；采纳它们会把这个格式化器要取代的「一个模板管所有周期」
		// 重新引回来。
		const format = dateFormatterFor("year", "en-US", "UTC");
		expect(format(engineParams("xAxis", "{YYYY}-{MM}"))).toBe("2026");
	});

	it("reuses one Intl per surface across calls", () => {
		// A fresh `Intl` per call would be rebuilt on every axis repaint; the cache is
		// per (period, locale, timezone) and is the reason callers must memoize.
		// 每次调用都新建 `Intl` 会在每次坐标轴重绘时重建；缓存按（周期、语言、时区）划分，
		// 也正是调用方必须记忆化的原因。
		const format = dateFormatterFor("day", "zh-CN", "UTC");
		const first = format(engineParams("xAxis"));
		expect(format(engineParams("xAxis"))).toBe(first);
		expect(first).toContain("2026");
	});
});

describe("indicatorTooltipStyles", () => {
	it("declares the three legend icons on the indicator tooltip", () => {
		// Pro's four icons collapse to three: v10 draws every feature it is given,
		// so `visible` and `invisible` side by side would be two opposite glyphs.
		// Pro 的四个图标收敛为三个：v10 会把它拿到的每个 feature 都画出来，`visible` 与
		// `invisible` 并排就会是两个相反的字形。
		const patch = indicatorTooltipStyles("light");
		expect(patch.indicator?.tooltip?.features?.map((feature) => feature?.id)).toEqual([
			"visible",
			"setting",
			"close",
		]);
	});
});

describe("numericCalcParams", () => {
	it("keeps finite numbers and coerces the rest", () => {
		expect(numericCalcParams([5, 10, 30])).toEqual([5, 10, 30]);
		expect(numericCalcParams(["7"])).toEqual([7]);
		expect(numericCalcParams([Number.NaN])).toEqual([Number.NaN]);
		expect(numericCalcParams([])).toEqual([]);
	});
});

describe("lineFigureCount", () => {
	it("counts line figures and ignores every other kind", () => {
		expect(
			lineFigureCount([
				{ key: "ma1", type: "line" },
				{ key: "ma2", type: "circle" },
				{ key: "ma3", type: "line" },
				{ key: "vol", type: "bar" },
			]),
		).toBe(2);
		expect(lineFigureCount([])).toBe(0);
	});
});

describe("lineColorAt", () => {
	it("prefers the instance's own override", () => {
		expect(lineColorAt(["#123456"], 0)).toBe("#123456");
	});

	it("falls back to the palette for a slot the instance never set", () => {
		// A never-overridden indicator carries no `styles.lines` at all, and one that
		// was partly overridden carries a sparse array — both must show the colour
		// actually in use rather than an empty box.
		// 从未被覆盖过的指标根本不带 `styles.lines`，被部分覆盖的则带一个稀疏数组 ——
		// 两者都必须显示实际在用的颜色，而不是一个空框。
		expect(lineColorAt(undefined, 0)).toBe(ADACHARTPRO_DEFAULT_LINE_COLORS[0]);
		expect(lineColorAt([undefined, "#654321"], 1)).toBe("#654321");
	});

	it("uses the fallback past the end of the palette", () => {
		expect(lineColorAt(undefined, ADACHARTPRO_DEFAULT_LINE_COLORS.length)).toBe(
			ADACHARTPRO_FALLBACK_LINE_COLOR,
		);
	});
});