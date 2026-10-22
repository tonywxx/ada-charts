import { describe, expect, it } from "vitest";
import { structuralKey } from "./structural-key";

/**
 * The contract ADR-0003 calls a performance contract, pinned at the three call
 * sites that use it: an indicator list, a pane list and an overlay list.
 *
 * ADR-0003 所称的性能契约 —— 在用到它的三个调用点（指标、面板、画线清单）上钉住。
 */
describe("structuralKey", () => {
	it("treats a missing list and an empty list as the same set", () => {
		expect(structuralKey(undefined)).toBe("[]");
		expect(structuralKey([])).toBe("[]");
	});

	it("keeps string entries as they are, in order", () => {
		expect(structuralKey(["MA", "VOL"])).toBe('["MA","VOL"]');
		expect(structuralKey(["VOL", "MA"])).not.toBe(
			structuralKey(["MA", "VOL"]),
		);
	});

	it("rebuilds an indicator when a structural field changes", () => {
		const base = { name: "MA", calcParams: [5, 10] };
		const key = structuralKey([base]);

		expect(structuralKey([{ ...base, calcParams: [5, 20] }])).not.toBe(key);
		expect(structuralKey([{ ...base, stack: true }])).not.toBe(key);
		expect(structuralKey([{ ...base, paneId: "candle_pane" }])).not.toBe(
			key,
		);
		expect(structuralKey([{ ...base, name: "EMA" }])).not.toBe(key);
		expect(structuralKey([{ ...base, id: "one" }])).not.toBe(key);
	});

	it("leaves indicator appearance to the engine", () => {
		const base = { name: "MA", calcParams: [5, 10] };
		const key = structuralKey([base]);

		expect(
			structuralKey([{ ...base, visible: false, styles: { line: {} } }]),
		).toBe(key);
	});

	it("rebuilds a pane when its height or order changes", () => {
		const base = { id: "pane_1", height: 100, order: 1 };
		const key = structuralKey([base]);

		expect(structuralKey([{ ...base, height: 120 }])).not.toBe(key);
		expect(structuralKey([{ ...base, order: 2 }])).not.toBe(key);
		expect(structuralKey([{ ...base, visible: false }])).toBe(key);
	});

	it("rebuilds an overlay when its anchors change", () => {
		const base = {
			name: "segment",
			points: [
				{ timestamp: 100, value: 10 },
				{ timestamp: 200, value: 20 },
			],
		};
		const key = structuralKey([base]);

		expect(
			structuralKey([
				{
					...base,
					points: [
						{ timestamp: 100, value: 10 },
						{ timestamp: 300, value: 20 },
					],
				},
			]),
		).not.toBe(key);
	});

	it("leaves overlay interaction state to the engine", () => {
		const base = {
			name: "segment",
			points: [
				{ timestamp: 100, value: 10 },
				{ timestamp: 200, value: 20 },
			],
		};
		const key = structuralKey([base]);

		expect(
			structuralKey([
				{
					...base,
					lock: true,
					visible: false,
					mode: "strong_magnet",
					styles: { line: {} },
				},
			]),
		).toBe(key);
	});

	it("ignores the order fields were written in, unknown fields, and object identity", () => {
		const first = { name: "MA", height: 100, visible: true };
		const second = { visible: true, height: 100, name: "MA" };

		expect(structuralKey([first])).toBe(structuralKey([second]));
		expect(structuralKey([{ name: "MA", somethingElse: 1 }])).toBe(
			structuralKey([{ name: "MA" }]),
		);
	});
});
