import { describe, expect, it } from "vitest";
import { okxSnapshotCandles, parseOkxRows } from "./okx";

/** A row as OKX returns it: every field a string, newest first. */
const row = (timestamp: number, close: number): string[] => [
	String(timestamp),
	"10",
	"11",
	"9",
	String(close),
	"100",
	"1000",
];

describe("parseOkxRows", () => {
	it("flips OKX's newest-first answer into ascending order", () => {
		const bars = parseOkxRows([row(3000, 3), row(1000, 1), row(2000, 2)]);
		expect(bars.map((b) => b.timestamp)).toEqual([1000, 2000, 3000]);
	});

	it("turns every field into a number", () => {
		expect(parseOkxRows([row(1000, 42)])[0]).toEqual({
			timestamp: 1000,
			open: 10,
			high: 11,
			low: 9,
			close: 42,
			volume: 100,
			turnover: 1000,
		});
	});

	it("drops a row whose time or close is not a number", () => {
		// The third copy of this parser used to keep them, so a malformed row
		// reached `KChartPro` and nowhere else.
		// 第三份解析器之前会保留这种行，因此坏数据只进得了 `KChartPro`。
		const bars = parseOkxRows([
			row(1000, 1),
			["not-a-number", "1", "1", "1", "1", "1", "1"],
			["1000", "1", "1", "1", "", "1", "1"],
			row(2000, 2),
		]);
		expect(bars.map((b) => b.timestamp)).toEqual([1000, 2000]);
	});

	it("returns nothing rather than a half-readable series for garbage", () => {
		expect(parseOkxRows([])).toEqual([]);
	});
});

describe("okxSnapshotCandles", () => {
	it("scales the committed seconds back up to milliseconds", () => {
		const bars = okxSnapshotCandles("1D");
		expect(bars.length).toBeGreaterThan(0);
		expect(bars[0].timestamp % 1000).toBe(0);
	});

	it("stays ascending so the fallback matches the live contract", () => {
		const bars = okxSnapshotCandles("1D");
		const times = bars.map((b) => b.timestamp);
		expect(times).toEqual([...times].sort((a, b) => a - b));
	});

	it("yields an empty set for a bar size the snapshot never captured", () => {
		expect(okxSnapshotCandles("1S")).toEqual([]);
	});
});
