import type {
	CandleType,
	DataLoader,
	DeepPartial,
	IndicatorTemplate,
	KLineData,
	Options,
	Period,
	PeriodType,
	Styles,
	SymbolInfo,
} from "klinecharts";
import { registerIndicator, registerOverlay } from "klinecharts";
import * as extensionOverlays from "@klinecharts/extension";
import { pricePrecisionOf } from "../../price-precision";
import { LIGHT_THEME } from "../../theme";
import { mergeStyles, themeStyles } from "./adachart-styles";
import { VOLUME_OVERLAY_INDICATOR } from "./adachart-window-config";
import type { AdaChartProps, AdaChartResolvedProps } from "./AdaChart";

/**
 * Indicator names bundled with `klinecharts` — and only those. The volume
 * overlay this library registers itself, {@link VOLUME_OVERLAY_INDICATOR}, is
 * deliberately absent: this list is the engine's own inventory, and a name the
 * engine has never heard of would make it an inventory of something else.
 *
 * `klinecharts` 内置的技术指标名称 —— 且仅限于内置。本库自行注册的成交量叠加
 * {@link VOLUME_OVERLAY_INDICATOR} 刻意不在其中：这份清单是引擎自己的目录，混进一个引擎从不知道
 * 的名字，它记的就不是引擎了。
 *
 * Source: `getSupportedIndicators()`.
 */
export const ADACHART_BUILT_IN_INDICATORS = [
	"AVP", "AO", "BIAS", "BOLL", "BRAR", "BBI", "CCI", "CR", "DMA", "DMI",
	"EMV", "EMA", "MTM", "MA", "MACD", "OBV", "PVT", "PSY", "ROC", "RSI",
	"SMA", "KDJ", "SAR", "TRIX", "VOL", "VR", "WR",
] as const;

/**
 * Overlay (drawing-tool) names bundled with `klinecharts`.
 * `klinecharts` 内置的画线工具名称。
 *
 * Source: `getSupportedOverlays()`.
 */
export const ADACHART_BUILT_IN_OVERLAYS = [
	"fibonacciLine", "horizontalRayLine", "horizontalSegment",
	"horizontalStraightLine", "parallelStraightLine", "priceChannelLine",
	"priceLine", "rayLine", "segment", "straightLine", "verticalRayLine",
	"verticalSegment", "verticalStraightLine", "simpleAnnotation",
	"simpleTag", "brush",
] as const;

/**
 * Extra overlay names contributed by `@klinecharts/extension` once
 * {@link ensureExtensionOverlays} has run.
 * {@link ensureExtensionOverlays} 执行后由 `@klinecharts/extension` 追加的画线工具名称。
 */
export const ADACHART_EXTENSION_OVERLAYS = Object.keys(
	extensionOverlays,
) as unknown as string[];

/** Every overlay name `AdaChart` can draw: built-in plus extension. 全部可用画线工具名称（内置 + 扩展）。 */
export const ADACHART_OVERLAY_NAMES = [
	...ADACHART_BUILT_IN_OVERLAYS,
	...ADACHART_EXTENSION_OVERLAYS,
];

/**
 * Registers every `@klinecharts/extension` overlay exactly once.
 *
 * `klinecharts`' registry is global, so a template only ever needs to be
 * registered a single time per page; a second `registerOverlay` for the same
 * name would be redundant.
 *
 * 只注册一次全部 `@klinecharts/extension` 画线工具。
 *
 * `klinecharts` 的注册表是全局的，因此每个模板整页只需注册一次；重复注册同名模板纯属多余。
 */
let extensionsRegistered = false;
export function ensureExtensionOverlays(): void {
	if (extensionsRegistered) return;
	for (const template of Object.values(extensionOverlays)) {
		registerOverlay(template);
	}
	extensionsRegistered = true;
}

/** What one bar of the volume overlay is computed from and drawn against. 成交量叠加的一根柱由什么算出、又画在何处。 */
interface VolumeOverlayDatum {
	/** The candle's own open and close: which way the bar is coloured, and nothing else. 所属蜡烛自己的开盘与收盘：只用来决定柱子往哪边着色。 */
	open: number;
	close: number;
	volume: number;
}

/**
 * The volume overlay: one bar figure and no line figures, at zero, coloured by
 * the candle it belongs to.
 *
 * Every property here is copied for a reason, and the reasons are the engine's
 * rather than this library's. `series: "volume"` declares what the study is, and
 * it is also what decides how the study's numbers are written: the engine hands
 * any volume series the instrument's `volumePrecision`, so this overlay's legend
 * reads in the same decimals `VOL`'s does. The precision is deliberately *not*
 * stated on the template, and stating it would change nothing — the engine's
 * constructor clears the lock `override` sets, so the instrument's precision
 * passes through regardless. What completes an instrument that names none is
 * `AdaChart`'s, at {@link resolveSymbolInfo}. `minValue: 0` is what anchors the bars
 * at the bottom of their axis instead of at the smallest volume on screen;
 * `calcParams: []` is honest — there is nothing to tune. The bar's colour is
 * resolved per candle from the chart's own indicator-bar style rather than baked
 * in, so the overlay follows the theme the way `VOL` does.
 *
 * The engine's own `VOL` cannot be reused here even in part: `getIndicatorClass`
 * is not exported, so a built-in template cannot be read, cloned, or trimmed.
 *
 * 成交量叠加：只有一个柱形图、没有线形图，自零起画，按所属蜡烛涨跌着色。
 *
 * 这里的每个属性都有理由，而理由是引擎的、不是本库的。`series: "volume"` 交代了这是哪一类研究，
 * 也正是它决定了这个研究的数字怎么书写：引擎会把标的的 `volumePrecision` 交给任何成交量序列，
 * 因此本叠加的图例与 `VOL` 的读法一致。精度刻意**不**写在模板上，而写了也不会改变什么 ——
 * 引擎的构造函数会清掉 `override` 设下的那把锁，标的的精度照样穿过来。标的没声明精度时由谁来补，
 * 是 `AdaChart` 的事，见 {@link resolveSymbolInfo}。`minValue: 0` 让柱子锚在其坐标轴的底端，
 * 而不是锚在屏幕上最小的成交量处；`calcParams: []` 是诚实的 —— 这里没有任何可调项。柱色逐根从图表
 * 自身的指标柱样式解析，而非写死，因此叠加与 `VOL` 一样跟随主题。
 *
 * 引擎自带的 `VOL` 在这里连一部分都无法复用：`getIndicatorClass` 并未导出，内置模板因此读不到、
 * 拷不出，也剪不掉。
 */
const volumeOverlay: IndicatorTemplate<VolumeOverlayDatum> = {
	name: VOLUME_OVERLAY_INDICATOR,
	series: "volume",
	minValue: 0,
	shouldFormatBigNumber: true,
	figures: [
		{
			key: "volume",
			title: "VOLUME: ",
			type: "bar",
			baseValue: 0,
			styles: ({ data, indicator, defaultStyles }) => {
				const bar = indicator.styles?.bars?.[0];
				const fallback = defaultStyles?.bars[0];
				const noChange = bar?.noChangeColor ?? fallback?.noChangeColor;
				const current = data.current;
				if (!current || current.close === current.open) return { color: noChange };
				return {
					color:
						current.close > current.open
							? bar?.upColor ?? fallback?.upColor
							: bar?.downColor ?? fallback?.downColor,
				};
			},
		},
	],
	calc: (dataList) =>
		dataList.map(({ open, close, volume }) => ({ open, close, volume: volume ?? 0 })),
};

/**
 * Registers {@link VOLUME_OVERLAY_INDICATOR} exactly once, on the same reasoning
 * as {@link ensureExtensionOverlays}: the engine's registry is global, so a
 * template only ever needs registering a single time per page, and a second
 * registration under the same name would silently replace the first.
 *
 * 只注册一次 {@link VOLUME_OVERLAY_INDICATOR}，理由与 {@link ensureExtensionOverlays} 相同：
 * 引擎的注册表是全局的，因此每个模板整页只需注册一次；重复注册同名模板会静默替换掉前一个。
 */
let volumeOverlayRegistered = false;
export function ensureVolumeOverlay(): void {
	if (volumeOverlayRegistered) return;
	registerIndicator(volumeOverlay);
	volumeOverlayRegistered = true;
}

/**
 * Locale keys `klinecharts` ships with.
 * `klinecharts` 自带的语言。
 */
export const ADACHART_LOCALES = ["en-US", "zh-CN"] as const;

/** Candle render kinds. 蜡烛图的渲染样式。 */
export const ADACHART_CANDLE_TYPES: readonly CandleType[] = [
	"candle_solid",
	"candle_stroke",
	"candle_up_stroke",
	"candle_down_stroke",
	"ohlc",
	"area",
];

/** Bar period types. K 线周期类型。 */
export const ADACHART_PERIOD_TYPES: readonly PeriodType[] = [
	"second",
	"minute",
	"hour",
	"day",
	"week",
	"month",
	"year",
];

// ------------------------------------------------------------------ defaults

/**
 * Single source of truth for every {@link AdaChartProps} default.
 *
 * The component merges caller props over this table instead of relying on
 * parameter defaults, so the story `argTypes`, the docs, and runtime behaviour
 * all derive from one object.
 *
 * 所有 {@link AdaChartProps} 默认值的唯一来源。
 *
 * 组件把调用方 props 合并到这张表上，而非使用参数解构默认值，因此故事的 `argTypes`、
 * 文档与运行时行为都派生自同一个对象。
 */
export const ADACHART_DEFAULTS = {
	width: 800,
	height: 400,
	autoSize: true,
	backgroundColor: "#ffffff",

	locale: "en-US",
	timezone: "UTC",
	theme: "light",

	candleType: "candle_solid",
	upColor: LIGHT_THEME.trendUp,
	downColor: LIGHT_THEME.trendDown,
	noChangeColor: LIGHT_THEME.noChange,
	showGrid: true,
	gridColor: LIGHT_THEME.gridLine,
	showCrosshair: true,
	crosshairColor: LIGHT_THEME.crosshair,
	textColor: "#1E2329",
	fontSize: 12,
	fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif",
	showPriceMark: true,
	showLastPriceMark: true,
	showHighLowPriceMark: true,
	tooltipShowRule: "follow_cross",
	candleTooltipShowType: "standard",

	symbolTicker: "BTC-USDT",
	periodType: "day",
	periodSpan: 1,

	indicators: [{ name: "MA" }, { name: "VOL" }],
	overlays: [],
	panes: [],

	scrollEnabled: true,
	zoomEnabled: true,
	offsetRightDistance: 10,
	yAxisPosition: "right",
} as const satisfies Partial<AdaChartProps>;

/**
 * Merges caller props over {@link ADACHART_DEFAULTS}; keys explicitly set to
 * `undefined` still fall back to their default.
 *
 * 把调用方 props 合并到 {@link ADACHART_DEFAULTS} 之上；显式传 `undefined` 的键仍回退到默认值。
 */
export function resolveAdaChartProps(props: AdaChartProps): AdaChartResolvedProps {
	const resolved = { ...ADACHART_DEFAULTS } as Record<string, unknown>;
	for (const [key, value] of Object.entries(props)) {
		if (value !== undefined) resolved[key] = value;
	}
	return resolved as unknown as AdaChartResolvedProps;
}

/**
 * Shallow prop comparison used as the `memo` comparator for `AdaChart`.
 * 作为 `AdaChart` 的 `memo` 比较器的浅层属性比较。
 */
export function areAdaChartPropsEqual(
	previous: AdaChartProps,
	next: AdaChartProps,
): boolean {
	const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
	for (const key of keys) {
		const left = (previous as Record<string, unknown>)[key];
		const right = (next as Record<string, unknown>)[key];
		if (left !== right && !(left === undefined && right === undefined)) {
			return false;
		}
	}
	return true;
}

// --------------------------------------------------------------------- data

/**
 * Drops bars with a non-finite timestamp or price, de-duplicates by timestamp
 * (keeping the later bar), and returns them sorted ascending — the order
 * `klinecharts`' `DataLoader` expects.
 *
 * 丢弃时间戳或价格非有限值的 K 线，按时间戳去重（保留后到的一条），并升序排序 ——
 * 这正是 `klinecharts` 的 `DataLoader` 所要求的顺序。
 */
export function normalizeKLineData(
	data: KLineData[] | undefined,
): KLineData[] {
	if (!data?.length) return [];
	const byTimestamp = new Map<number, KLineData>();
	for (const bar of data) {
		const ts = bar.timestamp;
		if (typeof ts !== "number" || !Number.isFinite(ts)) continue;
		if (!Number.isFinite(bar.close)) continue;
		byTimestamp.set(ts, bar);
	}
	return [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Field-by-field equality for two Candles, used to tell a real data change from
 * a re-render. `timestamp` plus the drawn values: a refreshed bar that changes
 * only `turnover` still has to count as changed, because the axis may show it.
 *
 * 两根 K 线的逐字段相等判断，用来区分真实的数据变化与一次重渲染。除 `timestamp`
 * 外还要比绘制值：只有 `turnover` 变化的刷新同样算变化，因为坐标轴可能显示它。
 */
export function sameKLineData(a: KLineData, b: KLineData): boolean {
	return (
		a.timestamp === b.timestamp &&
		a.open === b.open &&
		a.high === b.high &&
		a.low === b.low &&
		a.close === b.close &&
		a.volume === b.volume &&
		a.turnover === b.turnover
	);
}


/**
 * Builds the deep {@link Styles} object from the flat convenience props and the
 * raw `styles` escape hatch.
 *
 * Precedence, lowest to highest: theme preset → convenience props → caller's
 * `styles`. So a story can pick `theme="dark"` and still override one colour.
 *
 * 由扁平便捷 props 与原始 `styles` 兜底项共同构建深层 {@link Styles} 对象。
 *
 * 优先级从低到高：主题预设 → 便捷 props → 调用方的 `styles`。因此 story 可以在
 * `theme="dark"` 的基础上单独覆盖某个颜色。
 */
export function buildStyles(props: AdaChartResolvedProps): DeepPartial<Styles> {
	const convenience = buildConvenienceStyles(props);
	return mergeStyles(themeStyles(props.theme), convenience, props.styles);
}

/** Convenience-prop-derived partial styles (everything except theme + raw). 由便捷 props 推导的部分样式（主题与原始 styles 之外）。 */
function buildConvenienceStyles(
	props: AdaChartResolvedProps,
): DeepPartial<Styles> {
	const s: DeepPartial<Styles> = {};

	if (props.gridColor !== undefined || props.showGrid !== undefined) {
		const color = props.gridColor ?? LIGHT_THEME.gridLine;
		s.grid = {
			show: props.showGrid,
			horizontal: { show: props.showGrid, color },
			vertical: { show: props.showGrid, color },
		};
	}

	if (props.candleType || props.upColor || props.downColor || props.noChangeColor) {
		s.candle = {
			type: props.candleType,
			bar: {
				upColor: props.upColor,
				downColor: props.downColor,
				noChangeColor: props.noChangeColor,
			},
		};
	}

	if (
		props.showPriceMark !== undefined ||
		props.showLastPriceMark !== undefined ||
		props.showHighLowPriceMark !== undefined
	) {
		s.candle = {
			...s.candle,
			priceMark: {
				show: props.showPriceMark,
				last: { show: props.showLastPriceMark },
				high: { show: props.showHighLowPriceMark },
				low: { show: props.showHighLowPriceMark },
			},
		};
	}

	const text = props.textColor;
	const size = props.fontSize;
	const family = props.fontFamily;
	if (text || size || family) {
		const tickText = { color: text, size, family };
		s.xAxis = { tickText };
		s.yAxis = { tickText };
	}

	if (props.tooltipShowRule || props.candleTooltipShowType) {
		s.candle = {
			...s.candle,
			tooltip: {
				...s.candle?.tooltip,
				showRule: props.tooltipShowRule,
				showType: props.candleTooltipShowType,
			},
		};
	}

	if (props.showCrosshair === false || props.crosshairColor) {
		s.crosshair = {
			show: props.showCrosshair,
			horizontal: { line: { color: props.crosshairColor } },
			vertical: { line: { color: props.crosshairColor } },
		};
	}

	return s;
}

/**
 * Assembles the {@link Options} passed to `klinecharts`' `init`. Undefined
 * pieces are omitted so the library keeps its own defaults.
 *
 * 组装传给 `klinecharts` 的 `init` 的 {@link Options}。未定义的部分会被省略，
 * 从而保留库自身的默认值。
 */
export function buildInitOptions(
	props: AdaChartResolvedProps,
): Options {
	const options: Options = {};
	if (props.locale) options.locale = props.locale;
	if (props.timezone) options.timezone = props.timezone;
	options.styles = buildStyles(props);
	if (props.formatter) options.formatter = props.formatter;
	if (props.thousandsSeparator) options.thousandsSeparator = props.thousandsSeparator;
	if (props.decimalFold) options.decimalFold = props.decimalFold;
	if (props.zoomAnchor) options.zoomAnchor = props.zoomAnchor;
	if (props.hotkey) options.hotkey = props.hotkey;
	// `yAxisPosition` is a convenience for the init-only `layout.yAxis.position`;
	// an explicit `layout` prop wins.
	// `yAxisPosition` 是对仅初始化期生效的 `layout.yAxis.position` 的简写；显式 `layout` 优先。
	if (props.layout) {
		options.layout = props.layout;
	} else if (props.yAxisPosition) {
		options.layout = { yAxis: { position: props.yAxisPosition } };
	}
	return options;
}

/**
 * The default instrument's volume tick, stated in the same terms the Pro layers
 * state it: the tick is the fact and the decimal count follows from it
 * (`CONTEXT.md`).
 *
 * 默认标的的成交量最小变动单位，表述与两层 Pro 一致：tick 才是事实，小数位数由它推得
 * （见 `CONTEXT.md`）。
 */
const DEFAULT_VOLUME_MIN_MOVE = 0.01;

/** Decimal count of {@link DEFAULT_VOLUME_MIN_MOVE}. {@link DEFAULT_VOLUME_MIN_MOVE} 对应的小数位数。 */
const DEFAULT_VOLUME_PRECISION =
	pricePrecisionOf(DEFAULT_VOLUME_MIN_MOVE)?.decimals ?? 0;

/**
 * Resolved `symbol` for `chart.setSymbol`.
 *
 * The volume precision is completed here rather than left undefined, and that is
 * not cosmetic. The engine gives every volume series the instrument's
 * `volumePrecision` — its legend and the candle tooltip's `Volume` both read in
 * those decimals — and an instrument that names none resolves to the engine's
 * own fallback of **zero decimals**, which turns any fractional volume into `0`.
 * Naming the default instrument's volume tick is what makes the engine's number
 * the right one. The price precision is left as the caller gave it: the engine's
 * fallback of two decimals is already usable, and a caller who wants another
 * passes `symbol.pricePrecision`.
 *
 * 供 `chart.setSymbol` 使用的已解析 symbol。
 *
 * 成交量精度在这里补上，而不是留着不管，这不是表面功夫。引擎会把标的的 `volumePrecision`
 * 交给每个成交量序列 —— 它的图例与蜡烛 tooltip 里的 `Volume` 都按这个位数书写 —— 而标的没有声明
 * 精度时就会落到引擎自己的兜底值：**零位小数**，任何不足 1 的成交量都会写成 `0`。补上默认标的的
 * 成交量最小变动单位，正是为了让引擎算出的那个数字是对的。价格精度则照调用方所给：引擎自己的兜底值
 * 两位小数已经可用，需要别的精度就传 `symbol.pricePrecision`。
 */
export function resolveSymbolInfo(
	props: AdaChartResolvedProps,
): Partial<SymbolInfo> {
	return {
		ticker: props.symbol?.ticker ?? props.symbolTicker,
		pricePrecision: props.symbol?.pricePrecision,
		volumePrecision:
			props.symbol?.volumePrecision ?? DEFAULT_VOLUME_PRECISION,
	};
}

/** Resolved `period` for `chart.setPeriod`. 供 `chart.setPeriod` 使用的已解析 period。 */
export function resolvePeriod(props: AdaChartResolvedProps): Period {
	return {
		type: props.period?.type ?? (props.periodType as PeriodType),
		span: props.period?.span ?? props.periodSpan,
	};
}

/**
 * A {@link DataLoader} that replays an in-memory bar set, with hooks the
 * component uses to (a) read the latest dataset on `init` and (b) capture the
 * real-time push callback from `subscribeBar`.
 *
 * 一个把内存中的 K 线重放的 {@link DataLoader}，并提供两个钩子：（a）在 `init` 时读取
 * 最新数据集；（b）在 `subscribeBar` 中捕获实时推送回调。
 */
export function createMemoryDataLoader(hooks: {
	getBars: () => KLineData[];
	onSubscribe: (push: (bar: KLineData) => void) => void;
	onUnsubscribe: () => void;
}): DataLoader {
	return {
		getBars(params) {
			if (params.type === "init") {
				params.callback(hooks.getBars(), false);
			} else {
				params.callback([], false);
			}
		},
		subscribeBar(params) {
			hooks.onSubscribe(params.callback);
		},
		unsubscribeBar() {
			hooks.onUnsubscribe();
		},
	};
}

/**
 * A stable structural key for an indicator/overlay list, so the reconcile
 * effect only tears down and rebuilds when the set actually changes.
 *
 * 指标/画线列表的稳定结构键，使协调 effect 仅在组合真正变化时才拆除并重建。
 */
export function structuralKey(
	items: ReadonlyArray<unknown> | undefined,
): string {
	return JSON.stringify(
		(items ?? []).map((item) => {
			if (typeof item === "string") return item;
			const record = item as Record<string, unknown>;
			const out: Record<string, unknown> = {};
			if ("name" in record) out.name = record.name;
			if ("paneId" in record) out.paneId = record.paneId;
			if ("id" in record) out.id = record.id;
			if ("calcParams" in record) out.calcParams = record.calcParams;
			if ("height" in record) out.height = record.height;
			if ("order" in record) out.order = record.order;
			if ("stack" in record) out.stack = record.stack;
			return out;
		}),
	);
}
