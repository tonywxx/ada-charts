import { describe, expect, it } from "vitest";
import { decideDataPatch, type DataPatch } from "./data-patch";

interface Bar {
	time: number;
	close: number;
}

const same = (a: Bar, b: Bar) => a.time === b.time && a.close === b.close;
const bars = (...closes: number[]): Bar[] =>
	closes.map((close, i) => ({ time: 1000 + i * 60, close }));

const kindOf = (patch: DataPatch<Bar>) => patch.kind;

describe("decideDataPatch", () => {
	it("reports none for an equal dataset handed over as a new array", () => {
		// The whole point: a re-render that changes nothing must not reseed.
		// 关键所在：什么都没改的重渲染不能触发重灌。
		expect(decideDataPatch(bars(1, 2, 3), bars(1, 2, 3), same).kind).toBe("none");
	});

	it("classifies a new bar as an append", () => {
		const patch = decideDataPatch(bars(1, 2, 3), bars(1, 2, 3, 4), same);
		expect(patch.kind).toBe("append");
		if (patch.kind === "append") expect(patch.items).toEqual([{ time: 1180, close: 4 }]);
	});

	it("classifies several new bars as one append", () => {
		const patch = decideDataPatch(bars(1, 2), bars(1, 2, 3, 4), same);
		expect(patch.kind).toBe("append");
		if (patch.kind === "append") expect(patch.items).toHaveLength(2);
	});

	it("classifies a last-bar tick as an update", () => {
		const patch = decideDataPatch(bars(1, 2, 3), bars(1, 2, 9), same);
		expect(patch.kind).toBe("update");
		if (patch.kind === "update") expect(patch.item.close).toBe(9);
	});

	it("classifies a same-window refresh as a replace", () => {
		// Same length, same first timestamp: the heuristic this module replaced
		// called this an append and pushed one bar onto stale data.
		// 长度相同、首根时间戳也相同：被本模块取代的旧启发式把它当成追加，
		// 只往陈旧数据上推了一根。
		expect(kindOf(decideDataPatch(bars(1, 2, 3), bars(8, 7, 6), same))).toBe("replace");
	});

	it("classifies a changed bar in the middle as a replace", () => {
		expect(kindOf(decideDataPatch(bars(1, 2, 3), bars(1, 9, 3), same))).toBe("replace");
	});

	it("classifies a shortened dataset as a replace", () => {
		expect(kindOf(decideDataPatch(bars(1, 2, 3), bars(1, 2), same))).toBe("replace");
	});

	it("classifies a changed last bar that also grew as a replace", () => {
		// Ambiguous in a way a cheap push cannot express: safest to reseed.
		// 末项变化与新增同时发生，廉价推送表达不了：重灌最稳妥。
		expect(kindOf(decideDataPatch(bars(1, 2, 3), bars(1, 2, 9, 4), same))).toBe("replace");
	});

	it("treats first load and clearing as a replace", () => {
		expect(kindOf(decideDataPatch([], bars(1, 2), same))).toBe("replace");
		expect(kindOf(decideDataPatch(bars(1, 2), [], same))).toBe("replace");
	});

	it("treats empty to empty as none", () => {
		expect(kindOf(decideDataPatch([], [], same))).toBe("none");
	});

	it("returns a copy, so the caller cannot mutate the input by splicing", () => {
		const previous = bars(1, 2, 3);
		const next = bars(1, 2, 3, 4);
		const patch = decideDataPatch(previous, next, same);
		if (patch.kind === "append") {
			patch.items.push({ time: 9999, close: 0 });
			expect(next).toHaveLength(4);
		}
	});
});
