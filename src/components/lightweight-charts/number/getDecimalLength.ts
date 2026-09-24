/**
 * Returns the number of decimal places of a number.
 * Handles floating-point precision and scientific notation.
 * @param num The number to inspect (integer -> 0, NaN/Infinity -> -1).
 */
export function getDecimalLength(num: number): number {
  // Non-number or infinity cases.
  if (Number.isNaN(num) || !Number.isFinite(num)) return -1;

  // Convert to string, handling scientific notation (e.g. 1.23e-4 -> 0.000123).
  const numStr = num.toString();
  if (numStr.includes("e") || numStr.includes("E")) {
    const [base, exponentStr] = numStr.split(/[eE]/);
    const exponent = parseInt(exponentStr, 10);

    // Positive exponent -> integer (no decimals), negative -> pad with zeros.
    if (exponent >= 0) {
      return 0;
    } else {
      const baseWithoutDot = base.replace(".", "");
      return baseWithoutDot.length + Math.abs(exponent);
    }
  }

  // Non-scientific notation: split integer and fractional parts.
  if (!numStr.includes(".")) {
    return 0;
  }

  const [, decimalPart] = numStr.split(".");
  return decimalPart.length;
}
