/**
 * The two facts a price axis needs from a number: how many decimals to show it
 * with, and the smallest move it can express. They are always configured
 * together, so they are always computed together — `minMove` is by definition
 * `10 ** -decimals`, and a caller cannot get the two from different places.
 *
 * 价格轴需要一个数字的两个事实：显示时保留几位小数，以及它能表达的最小变动单位。
 * 两者总是一起配置，所以也总是一起算 —— `minMove` 按定义就是 `10 ** -decimals`，
 * 调用方不可能拿到互相矛盾的一对。
 */

/**
 * Above this many decimals, `10 ** -decimals` is no longer representable, so
 * the value is rounded rather than exact.
 *
 * 超过这个小数位，`10 ** -decimals` 已无法精确表示，取值会被舍入。
 */
export const MAX_PRICE_DECIMALS = 20;

export interface PricePrecision {
	/** Decimals to display, already clamped to `0..MAX_PRICE_DECIMALS`. 显示用小数位，已夹紧。 */
	decimals: number;
	/** Smallest expressible move: `10 ** -decimals`. 最小变动单位。 */
	minMove: number;
}

/**
 * Counts the fractional digits, expanding scientific notation rather than
 * mis-reading it: `1.23e-7` is `0.000000123`, i.e. 9 decimals, which is the
 * digits after the point in the mantissa plus the magnitude of the exponent.
 */
function countDecimals(value: number): number {
	const text = Math.abs(value).toString();
	const exponentAt = text.search(/[eE]/);

	if (exponentAt === -1) {
		const dot = text.indexOf(".");
		return dot === -1 ? 0 : text.length - dot - 1;
	}

	const exponent = Number.parseInt(text.slice(exponentAt + 1), 10);
	if (!Number.isFinite(exponent) || exponent >= 0) return 0;

	const mantissa = text.slice(0, exponentAt);
	const dot = mantissa.indexOf(".");
	const mantissaDigits = dot === -1 ? 0 : mantissa.length - dot - 1;
	return mantissaDigits + Math.abs(exponent);
}

/**
 * Returns `null` for anything that has no decimal representation to count —
 * NaN and both infinities. A missing answer is a different thing from a
 * zero-decimal answer, and the two previous helpers disagreed on which to
 * report, so the disagreement is now impossible to express.
 *
 * 对没有可数小数位的东西（NaN 与两个无穷）返回 `null`。没有答案和答案是零位小数
 * 是两回事，之前的两个 helper 对此各说一套 —— 现在这种分歧已经无法表达。
 */
export function pricePrecisionOf(value: number): PricePrecision | null {
	if (!Number.isFinite(value)) return null;
	const decimals = Math.min(
		MAX_PRICE_DECIMALS,
		Math.max(0, countDecimals(value)),
	);
	return { decimals, minMove: 10 ** -decimals };
}
