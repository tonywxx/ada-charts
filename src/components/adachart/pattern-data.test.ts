import type { DataLoader, DataLoaderSubscribeBarParams } from "klinecharts";
import { describe, expect, it, vi } from "vitest";
import { observePatternData } from "./pattern-data";
import { patternFixture } from "./pattern-fixtures";
import { parseOkxRows } from "../../okx";

describe("pattern data notifications", () => {
	it("notifies after engine callbacks and preserves unsubscribe and source errors", async () => {
		const order: string[] = [];
		const events = new EventTarget();
		events.addEventListener("reset", () => order.push("reset"));
		events.addEventListener("data", () => order.push("scan"));
		let push: DataLoaderSubscribeBarParams["callback"] | undefined;
		const source: DataLoader = {
			getBars: params => { params.callback(patternFixture(), false); },
			subscribeBar: params => { push = params.callback; },
			unsubscribeBar: () => { order.push("unsubscribe"); },
		};
		const loader = observePatternData(source, events, () => true);
		const identity = { symbol: { ticker: "TEST", pricePrecision: 2, volumePrecision: 0 }, period: { type: "day" as const, span: 1 } };
		await loader.getBars({ ...identity, type: "init", timestamp: null, callback: (_, more) => { expect(more).toBe(false); order.push("history"); } });
		loader.subscribeBar?.({ ...identity, callback: () => order.push("push") });
		push?.(patternFixture().at(-1)!);
		loader.unsubscribeBar?.(identity);
		expect(order).toEqual(["reset", "history", "scan", "push", "scan", "unsubscribe"]);
		const failure = new Error("source failure");
		const broken = observePatternData({ getBars: async () => { throw failure; } }, events, () => true);
		await expect(broken.getBars({ ...identity, type: "init", timestamp: null, callback: () => {} })).rejects.toBe(failure);
	});
	it("propagates candle finality even when the OHLC is unchanged", async () => {
		vi.stubGlobal("window", { navigator: { userAgent: "node" } });
		const { sameKLineData } = await import("./adachart-options");
		vi.unstubAllGlobals();
		const bar = patternFixture().at(-1)!;
		expect(sameKLineData({ ...bar, closed: false }, { ...bar, closed: true })).toBe(false);
		const row = ["1000", "10", "12", "9", "11", "20", "200", "200", "0"];
		expect(parseOkxRows([row])[0].closed).toBe(false);
		expect(parseOkxRows([[...row.slice(0, 8), "1"]])[0].closed).toBe(true);
		expect(parseOkxRows([row.slice(0, 8)])[0].closed).toBeUndefined();
	});
	it("keeps disabled features silent", () => {
		const events = new EventTarget();
		let notifications = 0;
		events.addEventListener("data", () => notifications++);
		events.addEventListener("reset", () => notifications++);
		observePatternData({ getBars: params => params.callback([]) }, events, () => false).getBars({ type: "init", timestamp: null, symbol: { ticker: "TEST", pricePrecision: 2, volumePrecision: 0 }, period: { type: "day", span: 1 }, callback: () => {} });
		expect(notifications).toBe(0);
	});
});
