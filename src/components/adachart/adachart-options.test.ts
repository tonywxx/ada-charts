import { afterEach, describe, expect, it, vi } from "vitest";
import { createFrameBarQueue } from "./adachart-stream";

describe("createFrameBarQueue", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("keeps the latest update per timestamp and flushes it before later bars", () => {
		let nextFrameId = 0;
		const frames = new Map<number, FrameRequestCallback>();
		const cancel = vi.fn((id: number) => frames.delete(id));
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			const id = ++nextFrameId;
			frames.set(id, callback);
			return id;
		});
		vi.stubGlobal("cancelAnimationFrame", cancel);

		const pushed: Array<{ timestamp: number; close: number }> = [];
		const queue = createFrameBarQueue();
		queue.setPush((bar) => {
			pushed.push({ timestamp: bar.timestamp, close: bar.close });
		});
		const candle = (timestamp: number, close: number) => ({
			timestamp,
			open: close,
			high: close,
			low: close,
			close,
		});

		queue.push(candle(60, 1));
		for (let close = 2; close <= 120; close += 1) queue.push(candle(60, close));
		expect(pushed).toEqual([{ timestamp: 60, close: 1 }]);

		for (const [id, callback] of frames) {
			frames.delete(id);
			callback(16);
		}
		expect(pushed).toEqual([
			{ timestamp: 60, close: 1 },
			{ timestamp: 60, close: 120 },
		]);

		queue.push(candle(120, 1));
		queue.push(candle(120, 2));
		queue.push(candle(180, 1));
		expect(pushed.slice(2)).toEqual([
			{ timestamp: 120, close: 1 },
			{ timestamp: 120, close: 2 },
			{ timestamp: 180, close: 1 },
		]);

		queue.clear();
		expect(cancel).toHaveBeenCalled();
		expect(frames.size).toBe(0);
	});
});
