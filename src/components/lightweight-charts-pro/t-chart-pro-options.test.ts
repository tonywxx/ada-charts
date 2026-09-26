import { describe, expect, it } from "vitest";
import {
	TCHARTPRO_DEFAULTS,
	TCHARTPRO_DEFAULT_BAR_SIZES,
	areTChartProPropsEqual,
	formattersFor,
	isIntradayBarSize,
	messageFor,
	resolveTChartProProps,
	tChartPropsForTheme,
} from "./t-chart-pro-options";
import type { TChartProProps } from "./TChartPro";

/**
 * The pure half of the Pro layer: what a bar size means, what a locale says, and
 * how props turn into a concrete config. None of it needs a DOM or a chart.
 *
 * Pro 层的纯逻辑部分：周期字符串的含义、某种语言的文案、props 如何变成一份确定配置。
 * 这些都不需要 DOM 或图表。
 */

describe("resolveTChartProProps", () => {
	it("fills every default", () => {
		const resolved = resolveTChartProProps({});
		expect(resolved.theme).toBe(TCHARTPRO_DEFAULTS.theme);
		expect(resolved.barSize).toBe(TCHARTPRO_DEFAULTS.barSize);
		expect(resolved.drawingBarVisible).toBe(true);
		expect(resolved.mainIndicators).toEqual(TCHARTPRO_DEFAULTS.mainIndicators);
		expect(resolved.symbol.ticker).toBe("BTC-USDT");
		expect(resolved.barSizes).toContain("4H");
	});

	it("treats an explicit undefined as absent", () => {
		const resolved = resolveTChartProProps({ theme: undefined, height: 300 });
		expect(resolved.theme).toBe(TCHARTPRO_DEFAULTS.theme);
		expect(resolved.height).toBe(300);
	});

	it("lets the caller override the instrument's precision", () => {
		const props: TChartProProps = { symbol: { ticker: "X", pricePrecision: 6 } };
		expect(resolveTChartProProps(props).symbol.pricePrecision).toBe(6);
	});

	it("hands out a copy of the defaults, not the table itself", () => {
		const resolved = resolveTChartProProps({});
		expect(resolved.mainIndicators).not.toBe(TCHARTPRO_DEFAULTS.mainIndicators);
		expect(resolved.barSizes).not.toBe(TCHARTPRO_DEFAULT_BAR_SIZES);
	});
});

describe("areTChartProPropsEqual", () => {
	it("reads an absent prop and an undefined one as the same thing", () => {
		expect(areTChartProPropsEqual({ theme: undefined }, {})).toBe(true);
	});

	it("spots a changed primitive and a swapped object", () => {
		const feed = { searchSymbols: async () => [] };
		expect(areTChartProPropsEqual({ theme: "light" }, { theme: "dark" })).toBe(false);
		expect(
			areTChartProPropsEqual({ datafeed: feed }, { datafeed: { ...feed } }),
		).toBe(false);
	});
});

describe("isIntradayBarSize", () => {
	it("calls anything shorter than a day intraday", () => {
		for (const size of ["1m", "15m", "1H", "4H", "90s"]) {
			expect(isIntradayBarSize(size)).toBe(true);
		}
	});

	it("calls a day and above calendar-sized", () => {
		for (const size of ["1D", "1W", "1M", "3D"]) {
			expect(isIntradayBarSize(size)).toBe(false);
		}
	});

	it("assumes intraday for something it cannot parse", () => {
		expect(isIntradayBarSize("weekly")).toBe(true);
	});
});

describe("messageFor", () => {
	it("answers in the requested locale", () => {
		expect(messageFor("zh-CN", "indicators")).toBe("指标");
	});

	it("falls back to English for an unlisted locale", () => {
		expect(messageFor("fr-FR", "indicators")).toBe("Indicators");
	});
});

describe("formattersFor", () => {
	const time = 1_700_000_000;

	it("prints the axis clock in the requested zone", () => {
		type TickMark = (time: number, type: never, locale: string) => string;
		const utc = formattersFor("en-US", "UTC").timeScale
			?.tickMarkFormatter as unknown as TickMark;
		const tokyo = formattersFor("en-US", "Asia/Tokyo").timeScale
			?.tickMarkFormatter as unknown as TickMark;
		if (typeof utc !== "function" || typeof tokyo !== "function") {
			throw new Error("expected a tick-mark formatter");
		}

		// Year marks are zone-independent; the time marks are not.
		// 年份刻度不随时区变化，时刻刻度会变。
		expect(utc(time, 0 as never, "en")).toBe(tokyo(time, 0 as never, "en"));
		expect(utc(time, 3 as never, "en")).not.toBe(tokyo(time, 3 as never, "en"));
	});

	it("survives a timezone the runtime does not know", () => {
		const format = formattersFor("en-US", "Mars/Olympus").localization
			?.timeFormatter as unknown as (time: number) => string;
		expect(() => format(time)).not.toThrow();
	});
});

describe("tChartPropsForTheme", () => {
	it("gives the two themes different surfaces and the same trend colours", () => {
		const light = tChartPropsForTheme("light");
		const dark = tChartPropsForTheme("dark");
		expect(light.backgroundColor).not.toBe(dark.backgroundColor);
		expect(light.upColor).toBe(dark.upColor);
	});
});
