import { describe, expect, it } from "vitest";
import {
	type DrawingSessionModel,
	EMPTY_DRAWING_SESSION,
	drawingSessionReducer,
} from "./drawing-session";

/** A raw overlay as `chart.getOverlays()` returns it. */
function raw(overrides: {
	id: string;
	name: string;
	points?: unknown[];
	lock?: boolean;
	visible?: boolean;
}) {
	return {
		id: overrides.id,
		name: overrides.name,
		points: overrides.points ?? [],
		lock: overrides.lock ?? false,
		visible: overrides.visible ?? true,
	};
}

const anchored = raw({ id: "o1", name: "segment", points: [{ x: 1 }] });

describe("drawingSessionReducer", () => {
	it("keeps only overlays that have an anchored point", () => {
		const next = drawingSessionReducer(EMPTY_DRAWING_SESSION, {
			type: "inventory",
			overlays: [anchored, raw({ id: "draft", name: "ray" })],
		});

		expect(next.overlays).toEqual([
			{ id: "o1", name: "segment", locked: false, visible: true },
		]);
	});

	it("records the overlay the canvas selected", () => {
		const next = drawingSessionReducer(EMPTY_DRAWING_SESSION, {
			type: "selected",
			id: "o1",
		});

		expect(next.selectedId).toBe("o1");
	});

	it("ignores a late deselect for an overlay that is not the current one", () => {
		const selected: DrawingSessionModel = {
			...EMPTY_DRAWING_SESSION,
			selectedId: "o2",
		};

		const next = drawingSessionReducer(selected, {
			type: "deselected",
			id: "o1",
		});

		// Identity, not just equality: a non-event must not re-render the panel.
		expect(next).toBe(selected);
	});

	it("clears the selection when the selected overlay is deselected", () => {
		const next = drawingSessionReducer(
			{ ...EMPTY_DRAWING_SESSION, selectedId: "o1" },
			{ type: "deselected", id: "o1" },
		);

		expect(next.selectedId).toBeNull();
	});

	it("keeps a reader-given name", () => {
		const next = drawingSessionReducer(EMPTY_DRAWING_SESSION, {
			type: "renamed",
			id: "o1",
			label: "My line",
		});

		expect(next.names).toEqual({ o1: "My line" });
	});

	it("replaces the whole name table", () => {
		const next = drawingSessionReducer(
			{ ...EMPTY_DRAWING_SESSION, names: { o1: "old" } },
			{ type: "namesReplaced", names: { o2: "new" } },
		);

		expect(next.names).toEqual({ o2: "new" });
	});

	it("forgets a removed overlay's name and selection together", () => {
		const next = drawingSessionReducer(
			{
				overlays: [
					{ id: "o1", name: "segment", locked: false, visible: true },
				],
				names: { o1: "gone", o2: "kept" },
				selectedId: "o1",
			},
			{ type: "forgotten", id: "o1" },
		);

		expect(next.names).toEqual({ o2: "kept" });
		expect(next.selectedId).toBeNull();
	});

	it("leaves another overlay's selection alone when one is forgotten", () => {
		const next = drawingSessionReducer(
			{ ...EMPTY_DRAWING_SESSION, selectedId: "o2" },
			{ type: "forgotten", id: "o1" },
		);

		expect(next.selectedId).toBe("o2");
	});
});
