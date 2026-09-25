import type { TChartDataItem, TChartMarker } from "../TChart";
import {
	fetchOkxCandles,
	okxSnapshotCandles,
	okxSnapshotTimestamp,
	OKX_INST_ID,
	type OkxCandle,
} from "../../../okx";

/** Bar sizes the stories request from OKX. */
export type OkxBar = "1D" | "4H" | "1m";

/**
 * Where a candle set came from: `live` means it was fetched from OKX when this
 * page was opened, `snapshot` means the network request failed and the
 * committed fallback is on screen instead.
 *
 * 蜡烛数据来源：`live` 表示打开本页时从 OKX 实时拉取，`snapshot` 表示请求失败，
 * 屏幕上显示的是提交进仓库的兜底快照。
 */
export type OkxSource = "live" | "snapshot";

/**
 * A candle series plus the provenance needed to label it honestly.
 * 一组 K 线及其来源信息，用于在界面上如实标注。
 */
export interface OkxCandleSet {
	instId: string;
	bar: OkxBar;
	bars: TChartDataItem[];
	source: OkxSource;
	/** Epoch ms of the successful fetch, or of the snapshot for fallback data. */
	timestamp: number;
}

const BARS: Record<OkxBar, string> = {
	"1D": "1D",
	"4H": "4H",
	"1m": "1m",
};

/**
 * One bar size, live from OKX, mapped onto what `TChart` consumes.
 * lightweight-charts takes whole-second `time`s where OKX answers in
 * milliseconds, so the scaling lives here rather than inside the feed.
 *
 * 一个周期的实时 OKX 数据，映射到 `TChart` 消费的形状。lightweight-charts 用整秒
 * `time`，而 OKX 以毫秒应答，所以换算放在这里、不放进数据源模块。
 */
async function fetchCandles(bar: OkxBar): Promise<TChartDataItem[]> {
	return (await fetchOkxCandles(OKX_INST_ID, BARS[bar])).map(toChartDataItem);
}

function fromSnapshot(bar: OkxBar): OkxCandleSet {
	return {
		instId: OKX_INST_ID,
		bar,
		bars: okxSnapshotCandles(bar).map(toChartDataItem),
		source: "snapshot",
		timestamp: okxSnapshotTimestamp(),
	};
}

/** The neutral millisecond Candle onto lightweight-charts' second-based item. 把毫秒级的中立 Candle 映射为 lightweight-charts 的秒级数据项。 */
function toChartDataItem(candle: OkxCandle): TChartDataItem {
	return {
		time: Math.trunc(candle.timestamp / 1000),
		open: candle.open,
		high: candle.high,
		low: candle.low,
		close: candle.close,
		value: candle.close,
		volume: candle.volume,
	};
}

/**
 * In-flight and completed requests, keyed by bar size.
 *
 * The docs page embeds every story, so without this a single page open would
 * ask OKX for the same series a dozen times.
 *
 * 按 K 线周期缓存进行中与已完成的请求。
 *
 * 文档页会同时嵌入所有 story，没有这层缓存的话打开一次页面就会向 OKX 重复请求
 * 同一组数据十几次。
 */
const cache = new Map<OkxBar, Promise<OkxCandleSet>>();

/**
 * Load one bar size, live from OKX, falling back to the committed snapshot.
 * 加载一个周期的数据：优先从 OKX 实时获取，失败时回退到仓库内的快照。
 */
export function loadOkxCandles(bar: OkxBar): Promise<OkxCandleSet> {
	const cached = cache.get(bar);
	if (cached) return cached;

	const pending = fetchCandles(bar)
		.then((bars) => ({
			instId: OKX_INST_ID,
			bar,
			bars,
			source: "live" as const,
			timestamp: Date.now(),
		}))
		.catch((error: unknown) => {
			// A failed request must not take the docs page down with it, but the
			// substitution has to stay visible and audible.
			// 请求失败不能拖垮文档页，但这个替代行为必须看得见、也听得见。
			console.warn(
				`[TChart stories] OKX live data unavailable for ${bar}; using the committed snapshot.`,
				error,
			);
			return fromSnapshot(bar);
		});

	cache.set(bar, pending);
	return pending;
}

/**
 * Buy / sell / event flags anchored to bars that exist in `candles`.
 *
 * Positions are expressed as offsets from the newest bar because live data keeps
 * moving: hard-coded indices would eventually point at bars that are no longer
 * in the window.
 *
 * 买卖与事件标记，锚定在 `candles` 中真实存在的 K 线上。
 *
 * 位置以「距最新一根的偏移量」表达，因为实时数据会不断前移：写死下标迟早会指向
 * 已经不在窗口内的 K 线。
 */
export function markersFor(candles: TChartDataItem[]): TChartMarker[] {
	const at = (fromEnd: number) => candles[candles.length - fromEnd]?.time;
	const buy = at(60);
	const sell = at(30);
	const event = at(8);

	const markers: TChartMarker[] = [];
	if (buy !== undefined) {
		markers.push({ time: buy, position: "belowBar", shape: "arrowUp", color: "#16a34a", text: "B" });
	}
	if (sell !== undefined) {
		markers.push({ time: sell, position: "aboveBar", shape: "arrowDown", color: "#dc2626", text: "S" });
	}
	if (event !== undefined) {
		markers.push({ time: event, position: "inBar", shape: "circle", color: "#2563eb", text: "E" });
	}
	return markers;
}

/**
 * One-line provenance label, e.g. `BTC-USDT 1D · live · 300 bars · 04:03:21 UTC`.
 * 单行来源说明，例如 `BTC-USDT 1D · live · 300 bars · 04:03:21 UTC`。
 */
export function describeCandleSet(set: OkxCandleSet): string {
	const time = new Date(set.timestamp).toISOString().slice(11, 19);
	return `${set.instId} ${set.bar} · ${set.source} · ${set.bars.length} bars · ${time} UTC`;
}
