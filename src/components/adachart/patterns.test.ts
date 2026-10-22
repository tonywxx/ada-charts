import { describe, expect, it } from "vitest";
import { detectPatterns, detectPatternsAsync, PATTERN_CATALOG, PATTERN_FAMILIES, patternStatistics, nextPatternTimestamp, type PatternSignal } from "./patterns";
import { patternFixture } from "./pattern-fixtures";

describe("twenty causal price patterns", () => {
	it("has twenty distinct bilingual definitions", () => {
		expect(PATTERN_CATALOG).toHaveLength(20);
		expect(new Set(PATTERN_CATALOG.map(p => p.id)).size).toBe(20);
	});
	it.each(PATTERN_CATALOG)("recognizes $id only when the breakout closes", pattern => {
		const data = patternFixture(pattern.family, pattern.direction);
		const matching = detectPatterns(data).filter(s => s.pattern.id === pattern.id);
		expect(matching.length, pattern.id).toBeGreaterThan(0);
		const signal = matching.at(-1)!;
		expect(signal.confirmationIndex).toBe(data.length - 1);
		expect(signal.support).toBeLessThan(signal.resistance);
		expect(detectPatterns(data.slice(0, -1)).filter(s => s.pattern.id === pattern.id)).toHaveLength(0);
		expect(detectPatterns(data.map((bar, i) => i === data.length - 1 ? { ...bar, closed: false } : bar)).filter(s => s.pattern.id === pattern.id)).toHaveLength(0);
	});
	it.each(PATTERN_FAMILIES)("rejects %s without its preceding trend", family => {
		const data = patternFixture(family);
		// Preserve the shape while removing the impulse or reversal context.
		const first = data[16].close;
		const noTrend = data.map((bar, i) => i < 16 ? { ...bar, open: first, high: first + 0.05, low: first - 0.05, close: first } : bar);
		expect(detectPatterns(noTrend).filter(s => s.pattern.family === family)).toHaveLength(0);
	});
	it("does not change past signals when future candles arrive", () => {
		const data = patternFixture("triple");
		const before = detectPatterns(data);
		const future = Array.from({ length: 25 }, (_, i) => ({ ...data.at(-1)!, timestamp: data.at(-1)!.timestamp + (i + 1) * 86_400_000, close: 115 + i, open: 115 + i, high: 116 + i, low: 114 + i }));
		expect(detectPatterns([...data, ...future]).filter(s => s.confirmedAt <= data.at(-1)!.timestamp)).toEqual(before);
	});
	it("does not guess finality or bridge invalid observations", () => {
		const data = patternFixture();
		expect(detectPatterns(data.map(bar => ({ ...bar, closed: undefined })))).toEqual([]);
		expect(detectPatterns(data.map(bar => ({ ...bar, high: Number.NaN })))).toEqual([]);
		expect(detectPatterns(data.map(bar => ({ ...bar, close: 100, open: 100, high: 100, low: 100 })))).toEqual([]);
		expect(detectPatterns(data.map((bar, i) => i === 20 ? { ...bar, closed: false } : bar)).filter(s => s.pattern.family === "double")).toEqual([]);
		expect(detectPatterns([])).toEqual([]);
	});
});

describe("historical outcomes", () => {
	const base = patternFixture();
	const signal = detectPatterns(base).find(s => s.pattern.family === "double")!;
	const data = Array.from({ length: 420 }, (_, i) => ({ ...base[0], timestamp: base[0].timestamp + i * 1000, close: i % 12 === 7 ? 101 : i % 12 === 8 ? 99 : 100, high: 102, low: 98, open: 100 }));
	const signals: PatternSignal[] = Array.from({ length: 32 }, (_, i) => ({ ...signal, id: `sample-${i}`, startIndex: i * 12, confirmationIndex: i * 12 + 4, confirmedAt: data[i * 12 + 4].timestamp, price: 100 }));
	const selected: PatternSignal = { ...signal, startIndex: 400, confirmationIndex: 410, confirmedAt: data[410].timestamp };
	it("uses only resolved, non-overlapping, same-pattern samples", () => {
		const duplicate = { ...signals[0], id: "overlapping", confirmationIndex: 5 };
		const other = { ...signals[1], id: "other", pattern: PATTERN_CATALOG.find(p => p.family === "triple")! };
		const pending = { ...signals[0], id: "future", startIndex: 408, confirmationIndex: 409 };
		const result = patternStatistics(data, [...signals, duplicate, other, pending, selected], selected);
		expect(result.samples).toBe(32);
		expect(result.frequencies).toEqual({ rise: 1, fall: 0, unchanged: 0 });
	});
	it("suppresses percentages below thirty samples and keeps unchanged outcomes", () => {
		expect(patternStatistics(data, signals.slice(0, 29), selected).frequencies).toBeNull();
		const flat = data.map(bar => ({ ...bar, close: 100 }));
		expect(patternStatistics(flat, signals, selected).frequencies).toEqual({ rise: 0, fall: 0, unchanged: 1 });
	});
	it("excludes unclosed outcomes and never reads beyond the selected signal", () => {
		const open = data.map((bar, i) => i === 7 ? { ...bar, closed: false } : bar);
		expect(patternStatistics(open, signals, selected).samples).toBe(31);
		const earlier = { ...selected, confirmationIndex: 100 };
		const result = patternStatistics(data, signals, earlier);
		expect(result.samples).toBe(8);
		expect(patternStatistics(data.map((bar, i) => i > 100 ? { ...bar, close: 999 } : bar), signals, earlier)).toEqual(result);
	});
});


describe("source period continuity", () => {
	it("does not draw a pattern over missing candles", () => {
		const data = patternFixture();
		const gapped = data.map((bar, i) => i >= 22 ? { ...bar, timestamp: bar.timestamp + 86_400_000 } : bar);
		expect(detectPatterns(gapped, undefined, { type: "day", span: 1 }).filter(s => s.pattern.family === "double")).toHaveLength(0);
		expect(detectPatterns(data, undefined, { type: "day", span: 1 }).some(s => s.pattern.family === "double")).toBe(true);
	});
	it("resolves calendar months without treating them as thirty days", () => {
		expect(nextPatternTimestamp(Date.UTC(2024, 1, 1), { type: "month", span: 1 })).toBe(Date.UTC(2024, 2, 1));
		expect(nextPatternTimestamp(Date.UTC(2024, 0, 1, 16), { type: "day", span: 1 })).toBe(Date.UTC(2024, 0, 2, 16));
	});
});


it("chunked scanning agrees with synchronous recognition and cancels obsolete work", async () => {
	const data = patternFixture("diamond");
	expect(await detectPatternsAsync(data)).toEqual(detectPatterns(data));
	expect(await detectPatternsAsync(data, undefined, undefined, () => true)).toBeNull();
});
