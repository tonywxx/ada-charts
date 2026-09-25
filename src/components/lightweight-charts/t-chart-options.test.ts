import { describe, expect, it } from "vitest";
import { calcEMA } from "./t-chart-options";

/**
 * `calcEMA` seeds with the arithmetic mean of the leading window, then walks the
 * usual exponential formula. These cases pin the seed rule, the short-data guard
 * and the close/value/open price fallback — the three things a caller cannot see
 * from the signature.
 */
describe("calcEMA", () => {
	const candles = [1, 2, 3, 4, 5].map((close, i) => ({
		time: 1_700_000_000 + i * 60,
		close,
	}));

	it("seeds with the mean of the leading window, then recurs", () => {
		const out = calcEMA(candles, 3);
		// seed = mean(1,2,3) = 2; k = 2/(3+1) = 0.5 -> (4-2)*0.5+2 = 3 -> (5-3)*0.5+3 = 4
		expect(out.map((p) => p.value)).toEqual([2, 3, 4]);
	});

	it("starts at the period-th item, not the first", () => {
		const out = calcEMA(candles, 3);
		expect(out[0].time).toBe(1_700_000_000 + 2 * 60);
		expect(out).toHaveLength(candles.length - 2);
	});

	it("returns nothing when there are fewer items than the period", () => {
		expect(calcEMA(candles.slice(0, 2), 3)).toEqual([]);
	});

	it("returns nothing for a period that cannot be a window", () => {
		expect(calcEMA(candles, 0)).toEqual([]);
		expect(calcEMA(candles, Number.NaN)).toEqual([]);
		expect(calcEMA(candles, Number.POSITIVE_INFINITY)).toEqual([]);
	});

	it("falls back to value then open when close is absent", () => {
		const scalars = [10, 20, 30, 40].map((value, i) => ({
			time: 1_700_000_000 + i * 60,
			value,
		}));
		// seed = mean(10,20,30) = 20; k = 0.5 -> (40-20)*0.5+20 = 30
		expect(calcEMA(scalars, 3).map((p) => p.value)).toEqual([20, 30]);

		const opens = [100, 200].map((open, i) => ({
			time: 1_700_000_000 + i * 60,
			open,
		}));
		expect(calcEMA(opens, 2).map((p) => p.value)).toEqual([150]);
	});

	it("passes business-day string times through unchanged", () => {
		const days = ["2026-01-01", "2026-01-02", "2026-01-03"].map((time, i) => ({
			time,
			close: i + 1,
		}));
		// seed = mean(1,2) = 1.5; k = 2/3 -> (3-1.5)*2/3+1.5 = 2.5
		expect(calcEMA(days, 2)).toEqual([
			{ time: "2026-01-02", value: 1.5 },
			{ time: "2026-01-03", value: 2.5 },
		]);
	});
});
