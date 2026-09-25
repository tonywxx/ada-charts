import { describe, expect, it } from "vitest";
import { MAX_PRICE_DECIMALS, pricePrecisionOf } from "./price-precision";

/**
 * Both numbers come out of one call, so the cases below are the contract: the
 * count is what a human writing the decimal expansion would get, and `minMove`
 * is always `10 ** -decimals`.
 */
describe("pricePrecisionOf", () => {
	it("counts plain fractional digits", () => {
		expect(pricePrecisionOf(3.5)).toEqual({ decimals: 1, minMove: 0.1 });
		expect(pricePrecisionOf(0.000123)).toEqual({ decimals: 6, minMove: 1e-6 });
	});

	it("counts integers and zero as no decimals", () => {
		expect(pricePrecisionOf(123)).toEqual({ decimals: 0, minMove: 1 });
		expect(pricePrecisionOf(0)).toEqual({ decimals: 0, minMove: 1 });
	});

	it("ignores the sign", () => {
		expect(pricePrecisionOf(-0.000123)).toEqual({ decimals: 6, minMove: 1e-6 });
	});

	it("expands scientific notation instead of mis-reading it", () => {
		// 1.23e-7 is 0.000000123: the 2 mantissa digits plus 7 places.
		expect(pricePrecisionOf(1.23e-7)).toEqual({ decimals: 9, minMove: 1e-9 });
		// The case the deleted helpers got wrong in both copies: they counted the
		// whole mantissa, returning 7 for a 6-decimal number.
		// 被删掉的两个 helper 都算错的用例：它们把整个尾数当成了小数位，6 位算成 7 位。
		expect(pricePrecisionOf(1.23e-4)).toEqual({ decimals: 6, minMove: 1e-6 });
		expect(pricePrecisionOf(12.34e-5)).toEqual({ decimals: 7, minMove: 1e-7 });
	});

	it("treats a positive exponent as a whole number", () => {
		expect(pricePrecisionOf(1.5e3)?.decimals).toBe(0);
		expect(pricePrecisionOf(1e21)?.decimals).toBe(0);
	});

	it("clamps where `10 ** -decimals` stops being representable", () => {
		const out = pricePrecisionOf(1e-30);
		expect(out?.decimals).toBe(MAX_PRICE_DECIMALS);
		expect(out?.minMove).toBe(10 ** -MAX_PRICE_DECIMALS);
	});

	it("returns null rather than a sentinel for a value with no decimals", () => {
		expect(pricePrecisionOf(Number.NaN)).toBeNull();
		expect(pricePrecisionOf(Number.POSITIVE_INFINITY)).toBeNull();
		expect(pricePrecisionOf(Number.NEGATIVE_INFINITY)).toBeNull();
	});
});
