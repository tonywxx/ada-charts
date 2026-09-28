import type { KLineData } from "klinecharts";

// ponytail: distinct bars still recalc full history until klinecharts adds incremental indicator updates.
export function createFrameBarQueue() {
	const pending = new Map<number, KLineData>();
	const pushed = new Set<number>();
	let pushCurrent: ((bar: KLineData) => void) | null = null;
	let frame: number | null = null;
	const flush = () => {
		const bars = [...pending.values()].sort((a, b) => a.timestamp - b.timestamp);
		pending.clear();
		const push = pushCurrent;
		if (!push) return;
		for (const bar of bars) push(bar);
	};
	const clear = () => {
		if (frame !== null) cancelAnimationFrame(frame);
		frame = null;
		pending.clear();
		pushed.clear();
		pushCurrent = null;
	};
	return {
		setPush(push: ((bar: KLineData) => void) | null) {
			clear();
			pushCurrent = push;
		},
		push(bar: KLineData) {
			const push = pushCurrent;
			if (!push) return;
			if (frame === null) {
				frame = requestAnimationFrame(() => {
					frame = null;
					pushed.clear();
					flush();
				});
			}
			if (pushed.has(bar.timestamp)) {
				pending.set(bar.timestamp, bar);
				return;
			}
			flush();
			pushed.add(bar.timestamp);
			push(bar);
		},
		clear,
	};
}
