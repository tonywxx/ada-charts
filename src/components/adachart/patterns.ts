import type { KLineData, Period } from "klinecharts";

export const PATTERN_VERSION = 1;
export const PATTERN_HORIZON = 3;
export const PATTERN_MIN_SAMPLES = 30;
// shortcut: scan loaded history only; add a history service when broader statistics are required.
export const PATTERN_SCAN_LIMIT = 5000;

export const PATTERN_FAMILIES = [
	["double", "Double bottom", "Double top", "W 型底", "M 型顶"],
	["triple", "Triple bottom", "Triple top", "三重底", "三重顶"],
	["shoulders", "Inverse head and shoulders", "Head and shoulders", "头肩底", "头肩顶"],
	["rounding", "Rounding bottom", "Rounding top", "圆弧底", "圆弧顶"],
	["megaphone", "Megaphone bottom", "Megaphone top", "喇叭底", "喇叭顶"],
	["flag", "Bullish flag", "Bearish flag", "看涨旗形", "看跌旗形"],
	["symmetric", "Bullish symmetrical triangle", "Bearish symmetrical triangle", "看涨对称三角形", "看跌对称三角形"],
	["diamond", "Bullish continuation diamond", "Bearish continuation diamond", "看涨持续菱形", "看跌持续菱形"],
	["wedge", "Bullish continuation wedge", "Bearish continuation wedge", "看涨持续楔形", "看跌持续楔形"],
	["triangle", "Bullish continuation triangle", "Bearish continuation triangle", "看涨持续三角形", "看跌持续三角形"],
] as const;
export type PatternFamily = typeof PATTERN_FAMILIES[number][0];
export const PATTERN_CATALOG = PATTERN_FAMILIES.flatMap(([family, up, down, zhUp, zhDown]) =>
	([1, -1] as const).map(direction => ({ id: `${family}-${direction === 1 ? "bullish" : "bearish"}`, family, direction, name: direction === 1 ? up : down, zhName: direction === 1 ? zhUp : zhDown })),
);
export type PatternDefinition = typeof PATTERN_CATALOG[number];
export interface PatternPivot { index: number; value: number; kind: "high" | "low" }
export interface PatternPoint { timestamp: number; value: number }
export interface PatternSignal {
	id: string;
	pattern: PatternDefinition;
	startIndex: number;
	confirmationIndex: number;
	confirmedAt: number;
	price: number;
	points: PatternPoint[];
	boundaries: PatternPoint[][];
	support: number;
	resistance: number;
}

function fit(points: readonly PatternPivot[]) {
	const x = points.reduce((sum, p) => sum + p.index, 0) / points.length;
	const y = points.reduce((sum, p) => sum + p.value, 0) / points.length;
	const variance = points.reduce((sum, p) => sum + (p.index - x) ** 2, 0);
	const slope = variance ? points.reduce((sum, p) => sum + (p.index - x) * (p.value - y), 0) / variance : 0;
	return { at: (index: number) => y + slope * (index - x), slope };
}

/** Bullish geometry; bearish shapes are reflected before this boundary. */
export function matchPatternGeometry(family: PatternFamily, pivots: readonly PatternPivot[], prior: number) {
	const lows = pivots.filter(p => p.kind === "low");
	const highs = pivots.filter(p => p.kind === "high");
	if (!lows.length || !highs.length || pivots.length < 3) return null;
	const start = pivots[0].index, end = pivots.at(-1)!.index;
	const min = Math.min(...pivots.map(p => p.value)), max = Math.max(...pivots.map(p => p.value));
	const range = max - min, duration = end - start;
	if (!(range > 0) || duration < 8 || duration > 180) return null;
	if (pivots.some((p, i) => i > 0 && (p.index <= pivots[i - 1].index || p.kind === pivots[i - 1].kind))) return null;
	const close = (a: number, b: number) => Math.abs(a - b) <= range * 0.15;
	const downtrend = prior > pivots[0].value + range * 0.35;
	const uptrend = prior < pivots[0].value - range * 0.6;
	let upper = fit(highs), lower = fit(lows), matches = false;
	if (family === "double" || family === "triple" || family === "shoulders") {
		const required = family === "double" ? 3 : 5;
		if (pivots.length !== required || pivots[0].kind !== "low" || !downtrend) return null;
		const depth = Math.min(...highs.map(p => p.value)) - Math.max(...lows.map(p => p.value));
		if (depth < range * 0.4 || highs.some(p => !close(p.value, highs[0].value))) return null;
		matches = family === "shoulders"
			? close(lows[0].value, lows[2].value) && lows[1].value < Math.min(lows[0].value, lows[2].value) - range * 0.2
			: lows.every(p => close(p.value, lows[0].value));
	} else if (family === "megaphone") {
		if (pivots.length !== 6 || !downtrend || lows.length !== 3 || highs.length !== 3) return null;
		matches = highs.every((p, i) => i === 0 || p.value > highs[i - 1].value + range * 0.08)
			&& lows.every((p, i) => i === 0 || p.value < lows[i - 1].value - range * 0.08);
	} else if (family === "diamond") {
		if (pivots.length !== 10 || !uptrend || lows.length !== 5 || highs.length !== 5) return null;
		const widths = highs.map((p, i) => p.value - lows[i].value);
		matches = widths[2] > widths[0] * 1.5 && widths[2] > widths[4] * 1.5
			&& highs[1].value > highs[0].value && highs[2].value > highs[1].value
			&& lows[1].value < lows[0].value && lows[2].value < lows[1].value
			&& highs[3].value < highs[2].value && highs[4].value < highs[3].value
			&& lows[3].value > lows[2].value && lows[4].value > lows[3].value;
		upper = fit(highs.slice(2)); lower = fit(lows.slice(2));
	} else if (family !== "rounding") {
		if (pivots.length !== 6 || !uptrend || lows.length !== 3 || highs.length !== 3) return null;
		const u = upper.slope * duration / range, l = lower.slope * duration / range;
		const widthStart = upper.at(start) - lower.at(start), widthEnd = upper.at(end) - lower.at(end);
		if (widthStart <= 0 || widthEnd <= range * 0.1) return null;
		const residual = Math.max(...highs.map(p => Math.abs(p.value - upper.at(p.index))), ...lows.map(p => Math.abs(p.value - lower.at(p.index))));
		if (residual > range * 0.12) return null;
		switch (family) {
			case "flag": matches = u < -0.12 && l < -0.12 && Math.abs(u - l) < 0.18 && widthEnd / widthStart > 0.75 && widthEnd / widthStart < 1.25; break;
			case "symmetric": matches = u < -0.12 && l > 0.12 && widthEnd < widthStart * 0.8; break;
			case "wedge": matches = u < -0.2 && l < -0.04 && l > u + 0.12 && widthEnd < widthStart * 0.8; break;
			case "triangle": matches = Math.abs(u) < 0.08 && l > 0.2 && widthEnd < widthStart * 0.8; break;
		}
	}
	if (!matches) return null;
	return { upper: upper.at, lower: lower.at, range, start, end };
}

function validBar(bar: KLineData, previous?: KLineData) {
	return [bar.timestamp, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)
		&& bar.timestamp > 0 && (!previous || bar.timestamp > previous.timestamp)
		&& bar.low > 0 && bar.low <= Math.min(bar.open, bar.close) && bar.high >= Math.max(bar.open, bar.close);
}

/** Calendar periods keep their source timestamp alignment, including UTC offsets. */
export function nextPatternTimestamp(timestamp: number, period: Period) {
	const units = { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 };
	if (period.type === "month" || period.type === "year") {
		const date = new Date(timestamp);
		if (period.type === "month") date.setUTCMonth(date.getUTCMonth() + period.span);
		else date.setUTCFullYear(date.getUTCFullYear() + period.span);
		return date.getTime();
	}
	return timestamp + units[period.type] * period.span;
}

/** No closure guess: callers supply `closed: true` (or an explicit predicate). */
export function isPatternCandleClosed(bar: KLineData) { return bar.closed === true; }

function* scanPatterns(data: readonly KLineData[], isClosed = isPatternCandleClosed, period?: Period): Generator<void, PatternSignal[]> {
	const signals: PatternSignal[] = [], pivots: PatternPivot[] = [];
	const lastEnd = new Map<string, number>();
	const scanStart = Math.max(0, data.length - PATTERN_SCAN_LIMIT);
	let segmentStart = scanStart;
	for (let i = scanStart; i < data.length; i++) {
		if ((i - scanStart) % 256 === 0) yield;
		if (!validBar(data[i], i > scanStart ? data[i - 1] : undefined) || !isClosed(data[i])) {
			pivots.length = 0; segmentStart = i + 1; continue;
		}
		if (period && i > segmentStart && nextPatternTimestamp(data[i - 1].timestamp, period) !== data[i].timestamp) {
			pivots.length = 0; segmentStart = i;
		}
		// Radius two makes a pivot observable two closed candles after its timestamp.
		const p = i - 2;
		if (p >= segmentStart + 2) {
			const neighbors = [data[p - 2], data[p - 1], data[p + 1], data[p + 2]];
			const high = neighbors.every(bar => data[p].high > bar.high);
			const low = neighbors.every(bar => data[p].low < bar.low);
			if (high !== low) {
				const next: PatternPivot = { index: p, kind: high ? "high" : "low", value: high ? data[p].high : data[p].low };
				const last = pivots.at(-1);
				if (last?.kind === next.kind) {
					if (next.kind === "high" ? next.value > last.value : next.value < last.value) pivots[pivots.length - 1] = next;
				} else pivots.push(next);
				if (pivots.length > 12) pivots.shift();
			}
		}
		for (const pattern of PATTERN_CATALOG) {
			const sign = pattern.direction;
			const add = (points: PatternPivot[], upper: (i: number) => number, lower: (i: number) => number, range: number) => {
				const start = points[0].index, end = points.at(-1)!.index;
				if (start <= (lastEnd.get(pattern.id) ?? -1) || i - end > 20 || i <= segmentStart) return;
				const boundary = upper(i), previousBoundary = upper(i - 1);
				if (!(data[i].close * sign > boundary + range * 0.02 && data[i - 1].close * sign <= previousBoundary + range * 0.02)) return;
				const support = Math.min(...points.map(p => p.value * sign)), resistance = Math.max(...points.map(p => p.value * sign));
				const at = (index: number, value: number) => ({ timestamp: data[index].timestamp, value: value * sign });
				signals.push({ id: `${pattern.id}:${data[start].timestamp}:${data[i].timestamp}`, pattern, startIndex: start, confirmationIndex: i, confirmedAt: data[i].timestamp, price: data[i].close,
					points: points.map(p => at(p.index, p.value)), boundaries: [[at(start, upper(start)), at(i, boundary)], [at(start, lower(start)), at(i, lower(i))]], support, resistance });
				lastEnd.set(pattern.id, i);
			};
			if (pattern.family === "rounding") {
				for (const span of [24, 40, 64]) {
					const start = i - span;
					if (start - 12 < segmentStart) continue;
					const values = data.slice(start, i).map(bar => bar.close * sign);
					const rim = (values[0] + values.at(-1)!) / 2, bottom = Math.min(...values), depth = rim - bottom;
					if (depth <= 0 || data[start - 12].close * sign < rim + depth * 0.35 || Math.abs(values[0] - values.at(-1)!) > depth * 0.15) continue;
					const error = values.reduce((sum, value, index) => sum + (value - (bottom + depth * (2 * index / (span - 1) - 1) ** 2)) ** 2, 0) / span;
					if (error > depth ** 2 * 0.015) continue;
					const points = values.flatMap((value, j) => j % 3 === 0 || j === span - 1 ? [{ index: start + j, value, kind: "low" as const }] : []);
					add(points, () => rim, () => bottom, depth);
				}
				continue;
			}
			const count = pattern.family === "double" ? 3 : pattern.family === "triple" || pattern.family === "shoulders" ? 5 : pattern.family === "diamond" ? 10 : 6;
			if (pivots.length < count) continue;
			const points = pivots.slice(-count).map(p => ({ ...p, value: p.value * sign, kind: sign === 1 ? p.kind : p.kind === "high" ? "low" as const : "high" as const }));
			const priorIndex = points[0].index - 12;
			if (priorIndex < segmentStart) continue;
			const geometry = matchPatternGeometry(pattern.family, points, data[priorIndex].close * sign);
			if (geometry) add(points, geometry.upper, geometry.lower, geometry.range);
		}
	}
	return signals;
}

export function detectPatterns(data: readonly KLineData[], isClosed = isPatternCandleClosed, period?: Period): PatternSignal[] {
	const scan = scanPatterns(data, isClosed, period);
	let result = scan.next();
	while (!result.done) result = scan.next();
	return result.value;
}

/** Yield between bounded chunks; obsolete history/symbol scans can be cancelled. */
export async function detectPatternsAsync(data: readonly KLineData[], isClosed = isPatternCandleClosed, period?: Period, cancelled = () => false): Promise<PatternSignal[] | null> {
	const scan = scanPatterns(data, isClosed, period);
	while (!cancelled()) {
		const result = scan.next();
		if (result.done) return result.value;
		await new Promise<void>(resolve => setTimeout(resolve, 0));
	}
	return null;
}

export function patternStatistics(data: readonly KLineData[], signals: readonly PatternSignal[], selected: PatternSignal, isClosed = isPatternCandleClosed, period?: Period) {
	let rise = 0, fall = 0, unchanged = 0, lastOutcome = -1;
	let from: number | null = null, to: number | null = null;
	for (const signal of [...signals].sort((a, b) => a.confirmationIndex - b.confirmationIndex)) {
		const end = signal.confirmationIndex + PATTERN_HORIZON;
		if (signal.pattern.id !== selected.pattern.id || signal.startIndex <= lastOutcome || end >= selected.confirmationIndex) continue;
		const bars = data.slice(signal.confirmationIndex, end + 1);
		if (bars.length !== PATTERN_HORIZON + 1 || !bars.every((bar, i) => validBar(bar, i ? bars[i - 1] : undefined) && isClosed(bar) && (!period || i === 0 || nextPatternTimestamp(bars[i - 1].timestamp, period) === bar.timestamp))) continue;
		const change = data[end].close - signal.price;
		if (change > 0) rise++; else if (change < 0) fall++; else unchanged++;
		lastOutcome = end;
		from ??= data[signal.startIndex].timestamp;
		to = data[end].timestamp;
	}
	const samples = rise + fall + unchanged;
	return { samples, from, to, frequencies: samples < PATTERN_MIN_SAMPLES ? null : { rise: rise / samples, fall: fall / samples, unchanged: unchanged / samples } };
}
