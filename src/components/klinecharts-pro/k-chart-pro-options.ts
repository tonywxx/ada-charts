import type {
	Period,
	SymbolInfo,
} from "@klinecharts/pro";
import { pricePrecisionOf } from "../../price-precision";

/**
 * The default instrument and its minimum moves. Precision is stated as the
 * instrument's tick and the decimals are derived from it, per `CONTEXT.md`:
 * the tick is the fact, the decimal count is a consequence of it.
 *
 * 默认标的及其最小变动单位。精度以标的的 tick 表述，小数位由它推得 —— 依
 * `CONTEXT.md`：tick 才是事实，小数位数只是它的结果。
 */
const DEFAULT_TICKER = "BTC-USDT";
const DEFAULT_PRICE_MIN_MOVE = 0.1;
const DEFAULT_VOLUME_MIN_MOVE = 0.01;

/** Every KLineChartPro default lives here so docs, args and runtime agree. KChartPro 的全部默认值集中于此，使文档、args 与运行时保持一致。 */
export const KCHARTPRO_DEFAULTS = {
	width: 900,
	height: 520,
	autoSize: true,
	theme: "light",
	locale: "en-US",
	timezone: "UTC",
	drawingBarVisible: true,
	ticker: DEFAULT_TICKER,
	pricePrecision: pricePrecisionOf(DEFAULT_PRICE_MIN_MOVE)?.decimals ?? 0,
	volumePrecision: pricePrecisionOf(DEFAULT_VOLUME_MIN_MOVE)?.decimals ?? 0,
	mainIndicators: ["MA"],
	subIndicators: ["VOL"],
} as const;

/**
 * Resolved KChartPro props: the public props with every default filled in.
 * 已解析的 KChartPro props：填充所有默认值后的对外属性。
 */
export interface KChartProResolvedProps {
	width?: number;
	height?: number;
	autoSize: boolean;
	theme: "light" | "dark";
	locale: string;
	timezone: string;
	watermark?: string;
	drawingBarVisible: boolean;
	symbol: SymbolInfo;
	period: Period;
	periods?: Period[];
	mainIndicators: string[];
	subIndicators: string[];
}

/**
 * Shallow `memo` comparator for `KChartPro`; object props compare by identity so
 * `datafeed`/`symbol` swaps are detected but stable references are cheap.
 *
 * `KChartPro` 的浅层 `memo` 比较器；对象属性按引用比较，因此 `datafeed`/`symbol` 的替换
 * 能被检出，而稳定引用的开销很低。
 */
export function areKChartProPropsEqual(
	previous: Record<string, unknown>,
	next: Record<string, unknown>,
): boolean {
	const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
	for (const key of keys) {
		if (previous[key] !== next[key]) return false;
	}
	return true;
}

/**
 * Default period presets shown in the toolbar, spanning the sizes the stories
 * exercise (1m / 4H / D).
 * 工具栏默认展示的周期预设，覆盖 story 使用的粒度（1m / 4H / D）。
 */
export const KCHARTPRO_DEFAULT_PERIODS: Period[] = [
	{ multiplier: 1, timespan: "minute", text: "1m" },
	{ multiplier: 15, timespan: "minute", text: "15m" },
	{ multiplier: 1, timespan: "hour", text: "1H" },
	{ multiplier: 4, timespan: "hour", text: "4H" },
	{ multiplier: 1, timespan: "day", text: "1D" },
	{ multiplier: 1, timespan: "week", text: "1W" },
];
