import { describe, expect, it } from "vitest";
import {
	buildManagedRows,
	isManagedOverlay,
	selectManagedOverlays,
} from "./drawing-inventory";

/** A raw overlay as `chart.getOverlays()` returns it. */
function raw(overrides: {
	id: string;
	name: string;
	points?: unknown[];
	lock?: boolean;
	visible?: boolean;
}): {
	id: string;
	name: string;
	points: readonly unknown[];
	lock: boolean;
	visible: boolean;
} {
	return {
		id: overrides.id,
		name: overrides.name,
		points: overrides.points ?? [],
		lock: overrides.lock ?? false,
		visible: overrides.visible ?? true,
	};
}

describe("isManagedOverlay", () => {
	it("excludes an overlay that has no anchored point", () => {
		expect(isManagedOverlay(raw({ id: "o1", name: "segment", points: [] }))).toBe(
			false,
		);
	});

	it("includes an overlay once it has at least one point", () => {
		expect(
			isManagedOverlay(raw({ id: "o1", name: "segment", points: [{}] })),
		).toBe(true);
	});
});

describe("selectManagedOverlays", () => {
	it("drops unanchored overlays and maps lock to locked", () => {
		const result = selectManagedOverlays([
			raw({ id: "kept", name: "segment", points: [{ x: 1 }], lock: true }),
			raw({ id: "dropped", name: "ray", points: [] }),
		]);

		expect(result).toEqual([{ id: "kept", name: "segment", locked: true, visible: true }]);
	});
});

describe("buildManagedRows", () => {
	it("prefers the reader-given name over the tool label", () => {
		const rows = buildManagedRows(
			[{ id: "o1", name: "segment", locked: false, visible: true }],
			{ o1: "My line" },
			"en",
		);

		expect(rows[0]?.label).toBe("My line");
	});

	it("falls back to the localised tool label when no name was given", () => {
		const rows = buildManagedRows(
			[{ id: "o2", name: "segment", locked: false, visible: true }],
			{},
			"en",
		);

		// `segment` has a label in the tool table, so the fallback is localised,
		// not the raw engine name.
		expect(rows[0]?.label).not.toBe("segment");
	});

	it("leaves locked and visible untouched", () => {
		const rows = buildManagedRows(
			[{ id: "o3", name: "ray", locked: true, visible: false }],
			{},
			"en",
		);

		expect(rows[0]).toMatchObject({ locked: true, visible: false });
	});
});
