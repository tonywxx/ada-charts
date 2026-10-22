import type { Chart } from "klinecharts";
import { describe, expect, it, vi } from "vitest";
import {
	CANDLE_PANE,
	createChartLinkage,
	coversInstant,
	panePixel,
	rightEdgeTimestamp,
	visibleBarCount,
} from "./chart-link";

interface FakeConfig {
	/** Timestamps of the bars the window holds, oldest first. 窗口持有的蜡烛时间戳，由老到新。 */
	bars?: number[];
	range?: { from: number; to: number } | null;
	width?: number;
	/** The main-pane pixel for an instant, or `undefined` when it is off screen. 某时刻在主图上的像素；不在屏幕上时为 `undefined`。 */
	pixelFor?: (timestamp: number) => number | undefined;
	bar?: number;
}

/** A chart with only the reads and writes the linkage makes. 只带联动会用到的那几读几写的图表。 */
function fakeChart(config: FakeConfig) {
	const scrollToTimestamp = vi.fn();
	const setBarSpace = vi.fn();
	const executeAction = vi.fn();
	const chart = {
		getDataList: () => (config.bars ?? []).map((timestamp) => ({ timestamp })),
		getVisibleRange: () => config.range ?? null,
		getSize: () => ({ width: config.width ?? 100, height: 50 }),
		convertToPixel: ({ timestamp }: { timestamp: number }) => ({
			x: config.pixelFor ? config.pixelFor(timestamp) : 10,
		}),
		convertFromPixel: ([{ x }]: Array<{ x: number }>) => [{ timestamp: x }],
		getBarSpace: () => ({ bar: config.bar ?? 10 }),
		scrollToTimestamp,
		setBarSpace,
		executeAction,
	} as unknown as Chart;
	return { chart, scrollToTimestamp, setBarSpace, executeAction };
}

describe("panePixel", () => {
	it("returns the pixel when it is inside the pane", () => {
		const { chart } = fakeChart({ pixelFor: () => 42 });
		expect(panePixel(chart, 1)).toBe(42);
	});

	it("refuses a pixel off either edge, because both come back as numbers", () => {
		const left = fakeChart({ pixelFor: () => -1 }).chart;
		const right = fakeChart({ pixelFor: () => 101 }).chart;
		expect(panePixel(left, 1)).toBeUndefined();
		expect(panePixel(right, 1)).toBeUndefined();
	});

	it("refuses a pixel the engine could not place", () => {
		const { chart } = fakeChart({ pixelFor: () => undefined });
		expect(panePixel(chart, 1)).toBeUndefined();
	});
});

describe("coversInstant", () => {
	it("is false when the window holds no candle at all", () => {
		expect(coversInstant(fakeChart({}).chart, 1)).toBe(false);
	});

	it("is false before the oldest candle", () => {
		expect(coversInstant(fakeChart({ bars: [10, 20] }).chart, 9)).toBe(false);
	});

	it("is true at and after the oldest candle — the newest bar stands for everything after it", () => {
		const { chart } = fakeChart({ bars: [10, 20] });
		expect(coversInstant(chart, 10)).toBe(true);
		expect(coversInstant(chart, 500)).toBe(true);
	});
});

describe("visibleBarCount", () => {
	it("counts from `to` rather than `realTo`", () => {
		const { chart } = fakeChart({ range: { from: 3, to: 13 } });
		expect(visibleBarCount(chart)).toBe(10);
	});

	it("is undefined without a range or with nothing visible", () => {
		expect(visibleBarCount(fakeChart({}).chart)).toBeUndefined();
		expect(visibleBarCount(fakeChart({ range: { from: 5, to: 5 } }).chart)).toBeUndefined();
	});
});

describe("rightEdgeTimestamp", () => {
	it("is the instant of the last visible bar", () => {
		const { chart } = fakeChart({ bars: [10, 20, 30], range: { from: 0, to: 3 } });
		expect(rightEdgeTimestamp(chart)).toBe(30);
	});

	it("is undefined when there is no range or no bar to read", () => {
		expect(rightEdgeTimestamp(fakeChart({ bars: [10] }).chart)).toBeUndefined();
		expect(rightEdgeTimestamp(fakeChart({ range: { from: 0, to: 0 } }).chart)).toBeUndefined();
	});
});

describe("ChartLinkage", () => {
	it("registers and forgets windows by id", () => {
		const linkage = createChartLinkage();
		const { chart } = fakeChart({});
		linkage.register(1, chart);
		expect(linkage.get(1)).toBe(chart);
		linkage.unregister(1);
		expect(linkage.get(1)).toBeUndefined();
	});

	it("mirrors scroll to every other window as the right-edge instant", () => {
		const linkage = createChartLinkage();
		const source = fakeChart({ bars: [10, 20, 30], range: { from: 0, to: 3 } });
		const a = fakeChart({});
		const b = fakeChart({});
		linkage.register(1, source.chart);
		linkage.register(2, a.chart);
		linkage.register(3, b.chart);

		linkage.mirrorScroll(1, true);

		expect(source.scrollToTimestamp).not.toHaveBeenCalled();
		expect(a.scrollToTimestamp).toHaveBeenCalledWith(30);
		expect(b.scrollToTimestamp).toHaveBeenCalledWith(30);
	});

	it("does nothing for scroll when the switch is off", () => {
		const linkage = createChartLinkage();
		const source = fakeChart({ bars: [10], range: { from: 0, to: 1 } });
		const other = fakeChart({});
		linkage.register(1, source.chart);
		linkage.register(2, other.chart);

		linkage.mirrorScroll(1, false);

		expect(other.scrollToTimestamp).not.toHaveBeenCalled();
	});

	it("keeps a programmatic move from being read as the reader's and passed on", () => {
		const linkage = createChartLinkage();
		const source = fakeChart({ bars: [10, 20], range: { from: 0, to: 2 } });
		const middle = fakeChart({});
		const last = fakeChart({});
		// The engine fires `onScroll` from `scrollToTimestamp`, so a target that
		// re-enters must be ignored rather than start a second round.
		// `scrollToTimestamp` 会触发 `onScroll`，因此重入的目标必须被忽略，而不是开始第二轮。
		middle.scrollToTimestamp.mockImplementation(() => {
			linkage.mirrorScroll(9, true);
		});
		linkage.register(1, source.chart);
		linkage.register(2, middle.chart);
		linkage.register(3, last.chart);

		linkage.mirrorScroll(1, true);

		expect(middle.scrollToTimestamp).toHaveBeenCalledTimes(1);
		expect(last.scrollToTimestamp).toHaveBeenCalledTimes(1);
	});

	it("mirrors zoom as the same number of visible candles", () => {
		const linkage = createChartLinkage();
		const source = fakeChart({
			range: { from: 0, to: 10 },
			bar: 10,
		});
		const other = fakeChart({ range: { from: 0, to: 20 }, bar: 10 });
		linkage.register(1, source.chart);
		linkage.register(2, other.chart);

		linkage.mirrorZoom(1, true);

		// 20 visible candles at bar 10 over the source's 10 → bar 20.
		// 目标可见 20 根、栏宽 10，源可见 10 根 → 栏宽 20。
		expect(other.setBarSpace).toHaveBeenCalledWith(20);
		expect(source.setBarSpace).not.toHaveBeenCalled();
	});

	it("mirrors a crosshair by converting the source pixel to an instant first", () => {
		const linkage = createChartLinkage();
		const source = fakeChart({});
		const other = fakeChart({ bars: [0], pixelFor: (timestamp) => timestamp / 10 });
		linkage.register(1, source.chart);
		linkage.register(2, other.chart);

		linkage.mirrorCrosshair(1, { x: 500 }, true);

		expect(other.executeAction).toHaveBeenCalledWith("onCrosshairChange", {
			x: 50,
			paneId: CANDLE_PANE,
		});
	});

	it("skips a window whose history stops short of the instant", () => {
		const linkage = createChartLinkage();
		const source = fakeChart({});
		const other = fakeChart({ bars: [600] });
		linkage.register(1, source.chart);
		linkage.register(2, other.chart);

		linkage.mirrorCrosshair(1, { x: 500 }, true);

		expect(other.scrollToTimestamp).not.toHaveBeenCalled();
		expect(other.executeAction).not.toHaveBeenCalled();
	});

	it("scrolls an off-screen window to the instant only while scroll is linked", () => {
		const linkage = createChartLinkage();
		const source = fakeChart({});
		let scrolled = false;
		const target = fakeChart({
			bars: [0],
			pixelFor: () => (scrolled ? 40 : undefined),
		});
		target.scrollToTimestamp.mockImplementation(() => {
			scrolled = true;
		});
		linkage.register(1, source.chart);
		linkage.register(2, target.chart);

		linkage.mirrorCrosshair(1, { x: 500 }, true);

		expect(target.scrollToTimestamp).toHaveBeenCalledWith(500);
		expect(target.executeAction).toHaveBeenCalledWith("onCrosshairChange", {
			x: 40,
			paneId: CANDLE_PANE,
		});
	});

	it("clears every crosshair with `undefined`, the one shape the facade passes through", () => {
		const linkage = createChartLinkage();
		const a = fakeChart({});
		const b = fakeChart({});
		linkage.register(1, a.chart);
		linkage.register(2, b.chart);

		linkage.clearCrosshairs();

		expect(a.executeAction).toHaveBeenCalledWith("onCrosshairChange", undefined);
		expect(b.executeAction).toHaveBeenCalledWith("onCrosshairChange", undefined);
	});
});
