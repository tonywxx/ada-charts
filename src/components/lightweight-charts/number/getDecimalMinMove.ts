/**
 * Returns the minimum move (precision unit) for a number.
 * Example: 1.12345 -> 0.00001, 123 -> 1, 1.23e-4 -> 0.000001.
 * @param num The input number (NaN/Infinity -> NaN).
 *
 * 返回一个数字的最小变动单位（精度步长）。
 * 例如：1.12345 -> 0.00001，123 -> 1，1.23e-4 -> 0.000001。
 * @param num 输入数字（NaN/Infinity 返回 NaN）。
 */
export function getDecimalMinMove(num: number): number {
  // Non-number or infinity cases.
  if (isNaN(num) || !isFinite(num)) return NaN;

  let decimalLength = 0;
  const numStr = num.toString();

  // Handle scientific notation (e.g. 1.23e-4 -> 0.000123, 1.23e4 -> 12300).
  if (numStr.includes("e") || numStr.includes("E")) {
    const [base, exponentStr] = numStr.split(/[eE]/);
    const exponent = parseInt(exponentStr, 10);
    const baseWithoutDot = base.replace(".", "");
    decimalLength = exponent >= 0 ? 0 : baseWithoutDot.length + Math.abs(exponent);
  } else {
    // Non-scientific notation: split integer and fractional parts.
    if (numStr.includes(".")) {
      decimalLength = numStr.split(".")[1].length;
    }
  }

  // minMove = 10^(-decimalLength).
  // Math.pow keeps precision for <= 20 decimal places (covers most cases).
  return Math.pow(10, -decimalLength);
}
