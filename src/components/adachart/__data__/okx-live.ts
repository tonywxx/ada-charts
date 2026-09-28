import type { KLineData, Period } from "klinecharts";
import {
	fetchOkxCandles,
	OKX_INST_ID,
	okxSnapshotCandles,
	type OkxCandle,
} from "../../../okx";
import type { OkxStreamBar } from "../../../okx-stream";

/**
 * The bar sizes a live window may be set to, in the order a picker shows them.
 *
 * The list is short on purpose. Seconds are absent because OKX's push feed
 * answers `60018` for `candle5s`/`candle15s`/`candle30s` although REST serves
 * them (see `okx-stream.ts`); the day, week and month entries are the `utc`
 * spellings alone, because a bar with no `utc` aligns to UTC+8 and would put a
 * candle labelled `1D` on a UTC axis. `CONTEXT.md` records both decisions.
 *
 * 实时窗口可选的周期档位，按选择器展示的顺序排列。
 *
 * 这份清单刻意短小。秒级不在其中，因为 OKX 推送源对 `candle5s`/`candle15s`/`candle30s`
 * 回 `60018`，尽管 REST 能提供它们（见 `okx-stream.ts`）；日 / 周 / 月只取带 `utc` 的拼法，
 * 因为不带 `utc` 的档位按 UTC+8 对齐，会把一根标着 `1D` 的蜡烛放到 UTC 坐标轴上。
 * 两个决定都记在 `CONTEXT.md`。
 */
export interface LiveBar {
	/** Stable identity, for pickers and React keys. 供选择器与 React key 使用的稳定标识。 */
	key: string;
	/** The venue's own bar string, which is also what names the channel. 数据源自己的档位字符串，频道名由它构成。 */
	bar: OkxStreamBar;
	/** What a picker shows. 选择器上展示的文案。 */
	label: string;
	/**
	 * The period the bars are bucketed by, as `klinecharts` wants it. The `utc`
	 * bars are the ordinary `day`/`week` periods: alignment is a property of the
	 * data, and the chart's timezone is what makes the axis labels agree with it.
	 *
	 * 分桶所用的周期，按 `klinecharts` 的要求书写。带 `utc` 的档位就是普通的 `day`/`week`：
	 * 对齐是数据自身的属性，而图表时区才是让坐标轴标签与之一致的东西。
	 */
	period: Period;
}

const minute = (span: number): Period => ({ type: "minute", span });
const hour = (span: number): Period => ({ type: "hour", span });

export const LIVE_BARS: readonly LiveBar[] = [
	{ key: "1m", bar: "1m", label: "1m", period: minute(1) },
	{ key: "3m", bar: "3m", label: "3m", period: minute(3) },
	{ key: "5m", bar: "5m", label: "5m", period: minute(5) },
	{ key: "15m", bar: "15m", label: "15m", period: minute(15) },
	{ key: "30m", bar: "30m", label: "30m", period: minute(30) },
	{ key: "1H", bar: "1H", label: "1H", period: hour(1) },
	{ key: "2H", bar: "2H", label: "2H", period: hour(2) },
	{ key: "4H", bar: "4H", label: "4H", period: hour(4) },
	{ key: "6H", bar: "6H", label: "6H", period: hour(6) },
	{ key: "12H", bar: "12H", label: "12H", period: hour(12) },
	{ key: "1Dutc", bar: "1Dutc", label: "1D (UTC)", period: { type: "day", span: 1 } },
	{ key: "1Wutc", bar: "1Wutc", label: "1W (UTC)", period: { type: "week", span: 1 } },
];

/** The entry a picker names, or the finest one if the key is unknown. 选择器给出的那一项；键未知时回退到最细的档位。 */
export function liveBarByKey(key: string): LiveBar {
	return LIVE_BARS.find((entry) => entry.key === key) ?? LIVE_BARS[0];
}

/** Where a window's history came from — the same two words the other stories use. 窗口历史的来源 —— 与其他 story 用同一组词。 */
export type LiveSource = "live" | "snapshot";

export interface LiveWindow {
	bars: KLineData[];
	source: LiveSource;
}

/**
 * History for one bar size, live from OKX, falling back to the committed
 * snapshot.
 *
 * Deliberately **not** cached, unlike `loadOkxKLines` in the neighbouring
 * module. That cache answers a question about a page that is opened once; a
 * live window is unmounted and remounted every time its picker changes, and the
 * whole point of the remount is to pick up the candles that closed while it was
 * away — a cached window would hand back the set from before the change.
 *
 * 一个周期的历史数据，优先从 OKX 实时获取，失败时回退到仓库内的快照。
 *
 * 刻意**不**做缓存，与相邻模块的 `loadOkxKLines` 不同。那份缓存回答的是「页面打开一次」的问题；
 * 而实时窗口每次切换档位都会卸载重挂，重挂的全部意义正是取回离开期间收盘的那几根 —— 缓存会
 * 把切换之前的那一份原样递回来。
 */
export async function loadLiveWindow(bar: OkxStreamBar): Promise<LiveWindow> {
	try {
		const candles = await fetchOkxCandles(OKX_INST_ID, bar);
		return { bars: candles.map(toKLineData), source: "live" };
	} catch (error) {
		console.warn(
			"[AdaChart stories] OKX live data unavailable; using the committed snapshot.",
			error,
		);
		return { bars: okxSnapshotCandles(bar).map(toKLineData), source: "snapshot" };
	}
}

/**
 * Fold one pushed candle into a window.
 *
 * The venue decides update-versus-append, and it does so by timestamp: a push
 * for the newest bar replaces it, a push for a later bar extends the window,
 * and a push for anything older is a candle the window already has. Returning
 * the same array for that last case is what lets the caller skip a render — the
 * engine pushes the current candle once a second whether or not it has moved.
 *
 * 把一根推送来的蜡烛并进窗口。
 *
 * 「更新还是追加」由数据源按时间戳决定：最新一根的推送替换它，更晚一根的推送延长窗口，而更早的
 * 推送则是窗口已有的一根。最后一种情况返回同一个数组，正是它让调用方得以跳过渲染 —— 无论价格
 * 是否变动，引擎每秒都会推一次当前这根。
 */
export function mergeLiveCandle(
	bars: readonly KLineData[],
	candle: OkxCandle,
): KLineData[] {
	const bar = toKLineData(candle);
	const last = bars.at(-1);
	if (!last || bar.timestamp > last.timestamp) return [...bars, bar];
	if (bar.timestamp === last.timestamp) return [...bars.slice(0, -1), bar];
	return bars as KLineData[];
}

/**
 * `klinecharts`' `KLineData` carries an index signature the neutral Candle does
 * not, so the copy at the boundary is structural, not cosmetic.
 *
 * klinecharts 的 `KLineData` 带索引签名，而引擎无关的 Candle 没有；因此在边界处做一次
 * 浅拷贝是结构所需，不是装饰。
 */
function toKLineData(candle: OkxCandle): KLineData {
	return { ...candle };
}
