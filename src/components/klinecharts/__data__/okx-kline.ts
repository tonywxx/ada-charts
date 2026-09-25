import type { KLineData } from "klinecharts";
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
 * page was opened, `snapshot` means the request failed and the committed
 * fallback is on screen instead.
 *
 * 蜡烛数据来源：`live` 表示打开本页时从 OKX 实时拉取，`snapshot` 表示请求失败，
 * 屏幕上显示的是提交进仓库的兜底快照。
 */
export type OkxSource = "live" | "snapshot";

/**
 * A candle series plus the provenance needed to label it honestly.
 * 一组 K 线及其来源信息，用于在界面上如实标注。
 */
export interface OkxKLineSet {
	instId: string;
	bar: OkxBar;
	/** Bars in `klinecharts` shape: ascending by `timestamp` in milliseconds. */
	bars: KLineData[];
	source: OkxSource;
	/** Epoch ms of the successful fetch, or of the snapshot for fallback data. */
	timestamp: number;
}

const BARS: Record<OkxBar, string> = { "1D": "1D", "4H": "4H", "1m": "1m" };

/**
 * The neutral Candle and `KLineData` carry the same fields, but `KLineData` has
 * an index signature the neutral type does not, so the copy is structural.
 *
 * 中立 Candle 与 `KLineData` 字段一致，但 `KLineData` 带索引签名而中立类型没有，
 * 所以这次浅拷贝是结构所需。
 */
function toKLineData(candle: OkxCandle): KLineData {
	return { ...candle };
}

/**
 * One bar size, live from OKX, in `klinecharts`' shape. Unlike
 * lightweight-charts, `klinecharts` wants millisecond `timestamp`s, so OKX's
 * native unit passes straight through.
 *
 * 一个周期的实时 OKX 数据，转成 `klinecharts` 形状。与 lightweight-charts 不同，
 * `klinecharts` 要毫秒级 `timestamp`，所以 OKX 的原生单位直接沿用。
 */
async function fetchCandles(bar: OkxBar): Promise<KLineData[]> {
	return (await fetchOkxCandles(OKX_INST_ID, BARS[bar])).map(toKLineData);
}

/**
 * A snapshot row uses seconds (it was normalised for `lightweight-charts`), so
 * the fallback path converts back to the milliseconds `klinecharts` expects.
 *
 * 快照行使用秒（曾为 `lightweight-charts` 归一化），因此兜底路径要转换回 `klinecharts`
 * 所要求的毫秒。
 */
function fromSnapshot(bar: OkxBar): OkxKLineSet {
	return {
		instId: OKX_INST_ID,
		bar,
		bars: okxSnapshotCandles(bar).map(toKLineData),
		source: "snapshot",
		timestamp: okxSnapshotTimestamp(),
	};
}

/**
 * In-flight and completed requests, keyed by bar size. The docs page embeds
 * every story at once, so without this one page open would ask OKX for the same
 * series a dozen times.
 *
 * 按周期缓存进行中与已完成的请求。文档页会同时嵌入所有 story，没有这层缓存的话打开一次
 * 页面就会向 OKX 重复请求同一组数据十几次。
 */
const cache = new Map<OkxBar, Promise<OkxKLineSet>>();

/**
 * Load one bar size, live from OKX, falling back to the committed snapshot.
 * 加载一个周期的数据：优先从 OKX 实时获取，失败时回退到仓库内的快照。
 */
export function loadOkxKLines(bar: OkxBar): Promise<OkxKLineSet> {
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
			console.warn(
				"[KChart stories] OKX live data unavailable; using the committed snapshot.",
				error,
			);
			return fromSnapshot(bar);
		});

	cache.set(bar, pending);
	return pending;
}

/**
 * Fetch just the most recent bar, for the story demos' live tail tick.
 * 仅拉取最新一根 K 线，供 story 演示的实时末根更新使用。
 */
export async function loadOkxLatestBar(bar: OkxBar): Promise<KLineData | null> {
	try {
		const bars = await fetchCandles(bar);
		return bars[bars.length - 1] ?? null;
	} catch {
		return null;
	}
}

/**
 * One-line provenance label, e.g. `BTC-USDT 1D · live · 300 bars · 04:03:21 UTC`.
 * 单行来源说明，例如 `BTC-USDT 1D · live · 300 bars · 04:03:21 UTC`。
 */
export function describeKLineSet(set: OkxKLineSet): string {
	const time = new Date(set.timestamp).toISOString().slice(11, 19);
	return `${set.instId} ${set.bar} · ${set.source} · ${set.bars.length} bars · ${time} UTC`;
}
