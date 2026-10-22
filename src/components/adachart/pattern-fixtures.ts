import type { KLineData } from "klinecharts";
import type { PatternFamily } from "./patterns";

const SHAPES: Record<Exclude<PatternFamily, "rounding">, { values: number[]; prior: number; target: number }> = {
	double: { values: [100, 110, 100], prior: 125, target: 115 },
	triple: { values: [100, 110, 101, 110, 100], prior: 125, target: 115 },
	shoulders: { values: [103, 112, 98, 112, 103], prior: 130, target: 118 },
	megaphone: { values: [108, 103, 112, 99, 116, 95], prior: 140, target: 135 },
	flag: { values: [112, 106, 111, 105, 110, 104], prior: 80, target: 118 },
	symmetric: { values: [116, 100, 113, 103, 110, 106], prior: 75, target: 122 },
	diamond: { values: [112, 108, 114, 106, 117, 103, 114, 106, 112, 108], prior: 80, target: 125 },
	wedge: { values: [118, 104, 114, 103, 110, 102], prior: 75, target: 123 },
	triangle: { values: [116, 100, 116, 104, 116, 108], prior: 75, target: 123 },
};

/** Deterministic synthetic data, never a market observation or measured success rate. */
export function patternFixture(family: PatternFamily = "double", direction: 1 | -1 = 1): KLineData[] {
	let values: number[];
	if (family === "rounding") {
		values = Array.from({ length: 16 }, (_, i) => 130 - 20 * i / 16);
		values.push(...Array.from({ length: 24 }, (_, i) => 100 + 10 * (2 * i / 23 - 1) ** 2), 115);
	} else {
		const shape = SHAPES[family];
		const anchors = [{ index: 0, value: shape.prior }, ...shape.values.map((value, i) => ({ index: 16 + i * 6, value }))];
		if (family === "megaphone") anchors.splice(1, 0, { index: 12, value: 98 });
		const last = anchors.at(-1)!;
		const lastIsLow = shape.values.at(-1)! < shape.values.at(-2)!;
		anchors.push({ index: last.index + 3, value: last.value + (lastIsLow ? 0.6 : -0.6) }, { index: last.index + 4, value: shape.target });
		values = Array.from({ length: anchors.at(-1)!.index + 1 }, (_, index) => {
			const right = anchors.findIndex(p => p.index >= index);
			if (right === 0) return anchors[0].value;
			const a = anchors[right - 1], b = anchors[right];
			return a.value + (b.value - a.value) * (index - a.index) / (b.index - a.index);
		});
	}
	return values.map((value, i) => {
		const close = direction === 1 ? value : 240 - value;
		return { timestamp: Date.UTC(2026, 0, 1) + i * 86_400_000, open: close - direction * 0.25, high: close + 0.4, low: close - 0.4, close, closed: true, volume: 100 };
	});
}
