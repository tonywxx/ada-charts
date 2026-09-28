import { describe, expect, it } from "vitest";
import {
	ADACHARTPRO_DEFAULTS,
	ADACHARTPRO_DEFAULT_PERIODS,
	areAdaChartProPropsEqual,
	mergeAdaChartProStyles,
	okxBarFor,
	periodLabel,
	quoteCurrencyOf,
	resolveAdaChartProProps,
} from "./adachart-pro-options";

/**
 * The pure half of `AdaChartPro`: the OKX bar mapping, the default merge and the
 * `memo` comparator. All three are decisions the component makes on every
 * change, so they are asserted without a browser.
 *
 * `AdaChartPro` 的纯函数部分：OKX bar 映射、默认值合并与 `memo` 比较器。三者都是组件
 * 每次变化都要做的判断，因此在这里不依赖浏览器地断言。
 */

describe("okxBarFor", () => {
	it("maps each v10 period type onto its OKX bar suffix", () => {
		expect(okxBarFor({ type: "second", span: 30 })).toBe("30s");
		expect(okxBarFor({ type: "minute", span: 1 })).toBe("1m");
		expect(okxBarFor({ type: "hour", span: 4 })).toBe("4H");
		expect(okxBarFor({ type: "day", span: 1 })).toBe("1D");
		expect(okxBarFor({ type: "week", span: 1 })).toBe("1W");
		expect(okxBarFor({ type: "month", span: 1 })).toBe("1M");
		expect(okxBarFor({ type: "year", span: 1 })).toBe("1Y");
	});

	it("never emits a bare suffix for a zero span", () => {
		// `0m` is not a bar OKX accepts; `1m` is what a caller meant.
		// `0m` 不是 OKX 接受的 bar；调用方想说的是 `1m`。
		expect(okxBarFor({ type: "minute", span: 0 })).toBe("1m");
	});
});

describe("periodLabel", () => {
	it("labels every default preset distinctly", () => {
		const labels = ADACHARTPRO_DEFAULT_PERIODS.map(periodLabel);
		expect(labels).toEqual(["1m", "15m", "1H", "4H", "1D", "1W"]);
		expect(new Set(labels).size).toBe(labels.length);
	});
});

describe("resolveAdaChartProProps", () => {
	it("fills every default", () => {
		const resolved = resolveAdaChartProProps({});
		expect(resolved.width).toBe(ADACHARTPRO_DEFAULTS.width);
		expect(resolved.height).toBe(ADACHARTPRO_DEFAULTS.height);
		expect(resolved.theme).toBe("light");
		expect(resolved.locale).toBe(ADACHARTPRO_DEFAULTS.locale);
		expect(resolved.timezone).toBe(ADACHARTPRO_DEFAULTS.timezone);
		expect(resolved.drawingBarVisible).toBe(true);
		expect(resolved.mainIndicators).toEqual(["MA"]);
		expect(resolved.subIndicators).toEqual(["VOL"]);
		expect(resolved.period).toEqual({ type: "day", span: 1 });
		expect(resolved.periods).toEqual(ADACHARTPRO_DEFAULT_PERIODS);
		expect(resolved.symbol).toEqual({
			ticker: ADACHARTPRO_DEFAULTS.ticker,
			pricePrecision: ADACHARTPRO_DEFAULTS.pricePrecision,
			volumePrecision: ADACHARTPRO_DEFAULTS.volumePrecision,
			priceCurrency: "USDT",
		});
	});

	it("lets caller values win, including falsy ones", () => {
		const resolved = resolveAdaChartProProps({
			width: 0,
			height: 300,
			theme: "dark",
			drawingBarVisible: false,
			mainIndicators: [],
			subIndicators: ["MACD"],
			period: { type: "hour", span: 2 },
			periods: [{ type: "minute", span: 5 }],
			watermark: "ADA",
		});
		expect(resolved.width).toBe(0);
		expect(resolved.height).toBe(300);
		expect(resolved.theme).toBe("dark");
		expect(resolved.drawingBarVisible).toBe(false);
		expect(resolved.mainIndicators).toEqual([]);
		expect(resolved.subIndicators).toEqual(["MACD"]);
		expect(resolved.period).toEqual({ type: "hour", span: 2 });
		expect(resolved.periods).toEqual([{ type: "minute", span: 5 }]);
		expect(resolved.watermark).toBe("ADA");
	});

	it("keeps a partial symbol's ticker while filling the precisions", () => {
		const resolved = resolveAdaChartProProps({ symbol: { ticker: "ETH-USDT" } });
		expect(resolved.symbol.ticker).toBe("ETH-USDT");
		expect(resolved.symbol.pricePrecision).toBe(ADACHARTPRO_DEFAULTS.pricePrecision);
		expect(resolved.symbol.volumePrecision).toBe(
			ADACHARTPRO_DEFAULTS.volumePrecision,
		);
	});

	it("keeps Pro-only symbol keys and derives the quote currency", () => {
		// `logo` and `priceCurrency` are read by the picker button and the price-axis
		// badge; resolving only v10's three keys would strip them here.
		// `logo` 与 `priceCurrency` 由选择器按钮和价格轴徽标读取；只解析 v10 的三个键会把它们
		// 在这里抹掉。
		const resolved = resolveAdaChartProProps({
			symbol: { ticker: "ETH-BTC", logo: "https://example.com/eth.svg" },
		});
		expect(resolved.symbol.logo).toBe("https://example.com/eth.svg");
		expect(resolved.symbol.priceCurrency).toBe("BTC");

		// An explicit `priceCurrency` outranks the ticker's own quote part.
		// 显式的 `priceCurrency` 压过代码自身的计价段。
		const explicit = resolveAdaChartProProps({
			symbol: { ticker: "BTC-USDT", priceCurrency: "usd" },
		});
		expect(explicit.symbol.priceCurrency).toBe("usd");
	});
});

describe("quoteCurrencyOf", () => {
	it("reads the quote part of a BASE-QUOTE ticker", () => {
		expect(quoteCurrencyOf("BTC-USDT")).toBe("USDT");
		expect(quoteCurrencyOf("btc-usdt")).toBe("USDT");
	});

	it("returns nothing rather than a guess when there is no quote part", () => {
		expect(quoteCurrencyOf("AAPL")).toBeUndefined();
		expect(quoteCurrencyOf("")).toBeUndefined();
	});
});

describe("mergeAdaChartProStyles", () => {
	it("merges nested trees in layer order, later layers winning", () => {
		const merged = mergeAdaChartProStyles(
			{ grid: { show: true, horizontal: { color: "#111" } } },
			{ grid: { show: false } },
			undefined,
		);
		// The untouched sibling survives the later layer.
		// 未被碰过的兄弟键在后一层之下存活。
		expect(merged.grid).toEqual({ show: false, horizontal: { color: "#111" } });
	});

	it("replaces arrays wholesale rather than merging them element-wise", () => {
		const merged = mergeAdaChartProStyles(
			{ indicator: { tooltip: { features: [{ id: "visible" }, { id: "setting" }] } } },
			{ indicator: { tooltip: { features: [{ id: "close" }] } } },
		);
		expect(merged.indicator?.tooltip?.features).toEqual([{ id: "close" }]);
	});
});

describe("areAdaChartProPropsEqual", () => {
	it("compares by identity, so stable references stay equal", () => {
		const styles = { candle: { type: "area" as const } };
		const periods = ADACHARTPRO_DEFAULT_PERIODS;
		expect(
			areAdaChartProPropsEqual(
				{ theme: "dark", styles, periods, height: 520 },
				{ theme: "dark", styles, periods, height: 520 },
			),
		).toBe(true);
	});

	it("detects a swapped reference and a changed primitive alike", () => {
		expect(
			areAdaChartProPropsEqual({ styles: { grid: { show: true } } }, { styles: { grid: { show: true } } }),
		).toBe(false);
		expect(areAdaChartProPropsEqual({ theme: "light" }, { theme: "dark" })).toBe(false);
		expect(areAdaChartProPropsEqual({ watermark: undefined }, {})).toBe(true);
	});
});
