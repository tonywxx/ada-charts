import type {
	DataLoader,
	DeepPartial,
	Period,
	PeriodType,
	Styles,
	SymbolInfo,
} from "klinecharts";
import { pricePrecisionOf } from "../../price-precision";
import type { AdaChartProProps } from "./AdaChartPro";

/**
 * The default instrument and its minimum moves, in the same terms
 * `KChartPro` states them: the tick is the fact, the decimal count follows from
 * it (`CONTEXT.md`).
 *
 * 默认标的及其最小变动单位，与 `KChartPro` 的表述一致：tick 才是事实，小数位数由它推得
 * （见 `CONTEXT.md`）。
 */
const DEFAULT_TICKER = "BTC-USDT";
const DEFAULT_PRICE_MIN_MOVE = 0.1;
const DEFAULT_VOLUME_MIN_MOVE = 0.01;

/**
 * Every `AdaChartPro` default lives here, so the stories, the docs and runtime
 * behaviour all read from one table. The values mirror `KCHARTPRO_DEFAULTS` on
 * purpose: the two Pro layers offer the same out-of-the-box terminal, and a
 * difference in defaults would look like a difference in behaviour.
 *
 * `AdaChartPro` 的全部默认值集中于此，使 story、文档与运行时行为读同一张表。取值刻意与
 * `KCHARTPRO_DEFAULTS` 一致：两层 Pro 提供的是同一个开箱即用终端，默认值不同会被误读成
 * 行为不同。
 */
export const ADACHARTPRO_DEFAULTS = {
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
 * The bar sizes the toolbar offers by default — the same six `KChartPro` shows,
 * written in `klinecharts` v10's own `Period` shape (`{ type, span }`) rather
 * than Pro's `{ multiplier, timespan, text }`.
 *
 * 工具栏默认提供的周期档位 —— 与 `KChartPro` 的六档相同，但用 `klinecharts` v10 自己的
 * `Period` 形状（`{ type, span }`）书写，而不是 Pro 的 `{ multiplier, timespan, text }`。
 */
export const ADACHARTPRO_DEFAULT_PERIODS: Period[] = [
	{ type: "minute", span: 1 },
	{ type: "minute", span: 15 },
	{ type: "hour", span: 1 },
	{ type: "hour", span: 4 },
	{ type: "day", span: 1 },
	{ type: "week", span: 1 },
];

/** Every period type's OKX bar suffix. 各周期类型对应的 OKX bar 后缀。 */
const OKX_BAR_SUFFIX: Record<PeriodType, string> = {
	second: "s",
	minute: "m",
	hour: "H",
	day: "D",
	week: "W",
	month: "M",
	year: "Y",
};

/** Every period type's toolbar label suffix. 各周期类型在工具栏上的标签后缀。 */
const PERIOD_LABEL_SUFFIX: Record<PeriodType, string> = {
	second: "s",
	minute: "m",
	hour: "H",
	day: "D",
	week: "W",
	month: "M",
	year: "Y",
};

/**
 * Maps a v10 `Period` onto an OKX bar string (`1m`, `4H`, `1D`, …).
 *
 * This is a second copy of the rule in `klinecharts-pro/okx-datafeed.ts` on
 * purpose: that one is written against Pro's `Period`, which has a `timespan`
 * where v10 has a `type`, and importing it would tie this layer to the frozen
 * Pro package's types.
 *
 * 把 v10 的 `Period` 映射为 OKX 的 bar 字符串（`1m`、`4H`、`1D` 等）。
 *
 * 这里刻意重新写一份、而不是复用 `klinecharts-pro/okx-datafeed.ts` 里那份：那份按 Pro 的
 * `Period` 书写，它有 `timespan` 而 v10 是 `type`，直接 import 会把本层绑到已冻结的 Pro
 * 包类型上。
 */
export function okxBarFor(period: Period): string {
	return `${period.span || 1}${OKX_BAR_SUFFIX[period.type] ?? "m"}`;
}

/**
 * A period's toolbar label. v10's `Period` carries no text of its own — Pro
 * baked one into the object, v10 did not — so the label is derived here.
 *
 * 周期在工具栏上的标签。v10 的 `Period` 自身不带文案（Pro 把文案塞进了对象里，v10 没有），
 * 因此在这里推导。
 */
export function periodLabel(period: Period): string {
	return `${period.span}${PERIOD_LABEL_SUFFIX[period.type] ?? ""}`;
}

/** Resolved `AdaChartPro` props: the public props with every default filled in. 已解析的 `AdaChartPro` 属性：填充所有默认值后的对外属性。 */
export interface AdaChartProResolvedProps {
	width?: number;
	height?: number;
	autoSize: boolean;
	theme: "light" | "dark";
	locale: string;
	timezone: string;
	watermark?: string;
	drawingBarVisible: boolean;
	drawingTools: readonly string[];
	symbols?: readonly SymbolInfo[];
	symbol: SymbolInfo;
	period: Period;
	periods: Period[];
	mainIndicators: string[];
	subIndicators: string[];
	dataLoader?: DataLoader;
	styles?: DeepPartial<Styles>;
}

/**
 * Merges caller props over {@link ADACHARTPRO_DEFAULTS}.
 * 把调用方 props 合并到 {@link ADACHARTPRO_DEFAULTS} 之上。
 */
export function resolveAdaChartProProps(
	props: AdaChartProProps,
): AdaChartProResolvedProps {
	const ticker = props.symbol?.ticker ?? ADACHARTPRO_DEFAULTS.ticker;
	return {
		width: props.width ?? ADACHARTPRO_DEFAULTS.width,
		height: props.height ?? ADACHARTPRO_DEFAULTS.height,
		autoSize: props.autoSize ?? ADACHARTPRO_DEFAULTS.autoSize,
		theme: props.theme ?? ADACHARTPRO_DEFAULTS.theme,
		locale: props.locale ?? ADACHARTPRO_DEFAULTS.locale,
		timezone: props.timezone ?? ADACHARTPRO_DEFAULTS.timezone,
		watermark: props.watermark,
		drawingBarVisible:
			props.drawingBarVisible ?? ADACHARTPRO_DEFAULTS.drawingBarVisible,
		drawingTools: props.drawingTools ?? [],
		symbols: props.symbols,
		mainIndicators: props.mainIndicators ?? [...ADACHARTPRO_DEFAULTS.mainIndicators],
		subIndicators: props.subIndicators ?? [...ADACHARTPRO_DEFAULTS.subIndicators],
		dataLoader: props.dataLoader,
		styles: props.styles,
		period: props.period ?? { type: "day", span: 1 },
		periods: props.periods ?? ADACHARTPRO_DEFAULT_PERIODS,
		// Every key the caller put on the symbol is kept, not just the three v10
		// needs: `priceCurrency` and `logo` are Pro's own extras and are read by the
		// price-axis badge and the picker button. Returning only the three would
		// silently strip them from the one place that hands the symbol on.
		//
		// 调用方放在标的上的每一个键都保留，而不只是 v10 需要的三个：`priceCurrency` 与 `logo`
		// 是 Pro 自己的附加字段，由价格轴徽标与选择器按钮读取。只回传那三个，会把它们从这个
		// 唯一的传递点上悄悄抹掉。
		symbol: {
			...props.symbol,
			ticker,
			pricePrecision:
				props.symbol?.pricePrecision ?? ADACHARTPRO_DEFAULTS.pricePrecision,
			volumePrecision:
				props.symbol?.volumePrecision ?? ADACHARTPRO_DEFAULTS.volumePrecision,
			priceCurrency: props.symbol?.priceCurrency ?? quoteCurrencyOf(ticker),
		},
	};
}

/**
 * The quote currency a `BASE-QUOTE` ticker names, e.g. `USDT` for `BTC-USDT`.
 *
 * The price-axis badge has to say *something* out of the box, and a caller who
 * configured nothing has still named the quote in the ticker itself. A ticker
 * with no quote part — a plain symbol list entry like `AAPL` — yields `undefined`
 * rather than a guess, and the badge stays hidden.
 *
 * `BASE-QUOTE` 形式的代码所点名的计价币，例如 `BTC-USDT` 的 `USDT`。
 *
 * 价格轴徽标开箱即用就得说点什么，而什么都没配置的调用方其实已经在代码里点明了计价币。
 * 没有计价段的代码 —— 例如 `AAPL` 这样单纯的符号 —— 得到 `undefined` 而不是一个猜测，
 * 徽标随之隐藏。
 */
export function quoteCurrencyOf(ticker: string): string | undefined {
	const quote = ticker.split("-")[1];
	return quote ? quote.toUpperCase() : undefined;
}

/**
 * Deep-merges partial `Styles` trees, later layers winning.
 *
 * `AdaChart` pushes the style tree it is given on every render, so the Pro layer
 * has to hand over *one* tree rather than call `setStyles` afterwards: a later
 * render would otherwise overwrite a late `setStyles` with the tree it was built
 * from. Merging is what puts the three layers in a stated order — the Pro
 * defaults (the legend icons), the caller's `styles` prop, and finally whatever
 * the settings dialog has changed.
 *
 * Arrays are replaced wholesale rather than merged element-wise: a caller who
 * passes their own `features` wants their list, not theirs patched over ours.
 *
 * 深合并部分 `Styles` 树，靠后的层胜出。
 *
 * `AdaChart` 每次渲染都会把拿到的样式树下发，因此 Pro 层必须交出*一棵*树，而不是事后调
 * `setStyles` —— 否则下一次渲染会用它据以构建的那棵树覆盖掉这次迟到的 `setStyles`。合并正是
 * 把三层按写明的次序排好：Pro 的默认值（图例图标）、调用方的 `styles` 属性，最后是设置对话框
 * 改过的部分。
 *
 * 数组整体替换而非逐项合并：调用方传入自己的 `features` 时要的是他那份清单，而不是在我们的
 * 基础上打补丁。
 */
export function mergeAdaChartProStyles(
	...layers: Array<DeepPartial<Styles> | undefined>
): DeepPartial<Styles> {
	const target: Record<string, unknown> = {};
	for (const layer of layers) {
		if (!isPlainObject(layer)) continue;
		for (const [key, value] of Object.entries(layer)) {
			if (value === undefined) continue;
			const current = target[key];
			target[key] =
				isPlainObject(value) && isPlainObject(current)
					? mergeAdaChartProStyles(
							current as DeepPartial<Styles>,
							value as DeepPartial<Styles>,
						)
					: value;
		}
	}
	return target as DeepPartial<Styles>;
}

/** A JSON-shaped object; arrays and `null` are values, not containers. 形如 JSON 的对象；数组与 `null` 是值而非容器。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Shallow `memo` comparator for `AdaChartPro`; objects and arrays compare by
 * identity, so a swapped `dataLoader`/`symbol` is seen while stable references
 * stay cheap.
 *
 * `AdaChartPro` 的浅层 `memo` 比较器；对象与数组按引用比较，因此换掉
 * `dataLoader`/`symbol` 能被检出，而稳定引用的开销很低。
 */
export function areAdaChartProPropsEqual(
	previous: Record<string, unknown>,
	next: Record<string, unknown>,
): boolean {
	const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
	for (const key of keys) {
		if (previous[key] !== next[key]) return false;
	}
	return true;
}
