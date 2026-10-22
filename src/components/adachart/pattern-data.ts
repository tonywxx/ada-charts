import type { DataLoader } from "klinecharts";

/** Observe after engine callbacks, so scanning sees history and frame-coalesced pushes. */
export function observePatternData(loader: DataLoader, events: EventTarget, enabled: () => boolean): DataLoader {
	const notify = (type: string) => { if (enabled()) events.dispatchEvent(new Event(type)); };
	return {
		getBars(params) {
			if (params.type === "init") notify("reset");
			return loader.getBars({ ...params, callback(data, more) { params.callback(data, more); notify("data"); } });
		},
		subscribeBar(params) {
			return loader.subscribeBar?.({ ...params, callback(bar) { params.callback(bar); notify("data"); } });
		},
		unsubscribeBar: params => loader.unsubscribeBar?.(params),
	};
}
