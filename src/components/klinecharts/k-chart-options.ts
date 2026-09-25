import type {
	CandleType,
	DataLoader,
	DeepPartial,
	KLineData,
	Options,
	Period,
	PeriodType,
	Styles,
	SymbolInfo,
} from "klinecharts";
import { registerOverlay } from "klinecharts";
import * as extensionOverlays from "@klinecharts/extension";
import type { KChartProps, KChartResolvedProps } from "./KChart";

/**
 * Indicator names bundled with `klinecharts`.
 * `klinecharts` 内置的技术指标名称。
 *
 * Source: `getSupportedIndicators()`.
 */
export const KCHART_BUILT_IN_INDICATORS = [
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
export const KCHART_BUILT_IN_OVERLAYS = [
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
export const KCHART_EXTENSION_OVERLAYS = Object.keys(
	extensionOverlays,
) as unknown as string[];

/** Every overlay name `KChart` can draw: built-in plus extension. 全部可用画线工具名称（内置 + 扩展）。 */
export const KCHART_OVERLAY_NAMES = [
	...KCHART_BUILT_IN_OVERLAYS,
	...KCHART_EXTENSION_OVERLAYS,
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

/**
 * Locale keys `klinecharts` ships with.
 * `klinecharts` 自带的语言。
 */
export const KCHART_LOCALES = ["en-US", "zh-CN"] as const;

/** Candle render kinds. 蜡烛图的渲染样式。 */
export const KCHART_CANDLE_TYPES: readonly CandleType[] = [
	"candle_solid",
	"candle_stroke",
	"candle_up_stroke",
	"candle_down_stroke",
	"ohlc",
	"area",
];

/** Bar period types. K 线周期类型。 */
export const KCHART_PERIOD_TYPES: readonly PeriodType[] = [
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
 * Single source of truth for every {@link KChartProps} default.
 *
 * The component merges caller props over this table instead of relying on
 * parameter defaults, so the story `argTypes`, the docs, and runtime behaviour
 * all derive from one object.
 *
 * 所有 {@link KChartProps} 默认值的唯一来源。
 *
 * 组件把调用方 props 合并到这张表上，而非使用参数解构默认值，因此故事的 `argTypes`、
 * 文档与运行时行为都派生自同一个对象。
 */
export const KCHART_DEFAULTS = {
	width: 800,
	height: 400,
	autoSize: true,
	backgroundColor: "#ffffff",

	locale: "en-US",
	timezone: "UTC",
	theme: "light",

	candleType: "candle_solid",
	upColor: "#2DC08E",
	downColor: "#F6465D",
	noChangeColor: "#AAAAAA",
	showGrid: true,
	gridColor: "#D1D4DC",
	showCrosshair: true,
	crosshairColor: "#76808F",
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
} as const satisfies Partial<KChartProps>;

/**
 * Merges caller props over {@link KCHART_DEFAULTS}; keys explicitly set to
 * `undefined` still fall back to their default.
 *
 * 把调用方 props 合并到 {@link KCHART_DEFAULTS} 之上；显式传 `undefined` 的键仍回退到默认值。
 */
export function resolveKChartProps(props: KChartProps): KChartResolvedProps {
	const resolved = { ...KCHART_DEFAULTS } as Record<string, unknown>;
	for (const [key, value] of Object.entries(props)) {
		if (value !== undefined) resolved[key] = value;
	}
	return resolved as unknown as KChartResolvedProps;
}

/**
 * Shallow prop comparison used as the `memo` comparator for `KChart`.
 * 作为 `KChart` 的 `memo` 比较器的浅层属性比较。
 */
export function areKChartPropsEqual(
	previous: KChartProps,
	next: KChartProps,
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

// -------------------------------------------------------------------- style

/**
 * Recursively merges a set of partial style objects, left to right. Arrays are
 * replaced wholesale (a style array is a fixed-length palette, so element-wise
 * merging would never be meaningful).
 *
 * 从左到右递归合并多个部分样式对象。数组整体替换（样式数组是定长调色板，逐元素合并没有意义）。
 */
function mergeStyles(
	...sources: Array<DeepPartial<Styles> | undefined>
): DeepPartial<Styles> {
	const out: Record<string, unknown> = {};
	for (const source of sources) {
		if (!source) continue;
		for (const [key, value] of Object.entries(source)) {
			const existing = out[key];
			if (
				value &&
				typeof value === "object" &&
				!Array.isArray(value) &&
				existing &&
				typeof existing === "object" &&
				!Array.isArray(existing)
			) {
				out[key] = mergeStyles(
					existing as DeepPartial<Styles>,
					value as DeepPartial<Styles>,
				);
			} else {
				out[key] = value;
			}
		}
	}
	return out as DeepPartial<Styles>;
}

const LIGHT_STYLES: DeepPartial<Styles> = {
	grid: {
		show: true,
		horizontal: { show: true, color: "#D1D4DC", style: "solid", size: 1 },
		vertical: { show: true, color: "#D1D4DC", style: "solid", size: 1 },
	},
	candle: {
		bar: {
			upColor: "#2DC08E",
			downColor: "#F6465D",
			noChangeColor: "#AAAAAA",
			upBorderColor: "#2DC08E",
			downBorderColor: "#F6465D",
			noChangeBorderColor: "#AAAAAA",
			upWickColor: "#2DC08E",
			downWickColor: "#F6465D",
			noChangeWickColor: "#AAAAAA",
		},
		area: {
			lineColor: "#1677FF",
			backgroundColor: [
				{ offset: 0, color: "rgba(22, 119, 255, 0.01)" },
				{ offset: 1, color: "rgba(22, 119, 255, 0.2)" },
			],
			point: { color: "#1677FF", rippleColor: "#1677FF" },
		},
		priceMark: {
			show: true,
			high: { show: true, color: "#76808F" },
			low: { show: true, color: "#76808F" },
			last: {
				show: true,
				upColor: "#2DC08E",
				downColor: "#F6465D",
				noChangeColor: "#AAAAAA",
				line: { show: true, style: "dashed", size: 1, dashedValue: [2, 2] },
				text: { show: true, color: "#FFFFFF", size: 10 },
			},
		},
		tooltip: {
			showRule: "follow_cross",
			showType: "standard",
			title: { color: "#76808F", size: 12 },
			legend: { color: "#76808F", size: 12 },
		},
	},
	xAxis: {
		show: true,
		axisLine: { show: true, color: "#76808F", size: 1 },
		tickLine: { show: true, color: "#76808F", size: 1, length: 3 },
		tickText: { show: true, color: "#76808F", size: 12 },
	},
	yAxis: {
		show: true,
		axisLine: { show: true, color: "#76808F", size: 1 },
		tickLine: { show: true, color: "#76808F", size: 1, length: 3 },
		tickText: { show: true, color: "#76808F", size: 12 },
	},
	separator: { size: 1, color: "#76808F", activeBackgroundColor: "#D1D4DC" },
	crosshair: {
		show: true,
		horizontal: {
			show: true,
			line: { show: true, color: "#76808F", style: "dashed", size: 1, dashedValue: [4, 2] },
			text: { show: true, color: "#FFFFFF", size: 12 },
		},
		vertical: {
			show: true,
			line: { show: true, color: "#76808F", style: "dashed", size: 1, dashedValue: [4, 2] },
			text: { show: true, color: "#FFFFFF", size: 12 },
		},
	},
	indicator: {
		ohlc: { upColor: "#2DC08E", downColor: "#F6465D", noChangeColor: "#AAAAAA" },
		bars: [{ upColor: "rgba(45, 192, 142, 0.7)", downColor: "rgba(246, 70, 93, 0.7)", noChangeColor: "#AAAAAA" }],
		lines: [
			{ color: "#888888", size: 1 },
			{ color: "#FEC108", size: 1 },
			{ color: "#F52887", size: 1 },
			{ color: "#485FB1", size: 1 },
			{ color: "#664499", size: 1 },
		],
		circles: [{ upColor: "rgba(45, 192, 142, 0.7)", downColor: "rgba(246, 70, 93, 0.7)", noChangeColor: "#AAAAAA" }],
		lastValueMark: { show: false },
		tooltip: { showRule: "always", title: { showName: true, showParams: true }, legend: { color: "#76808F", size: 12 } },
	},
	overlay: {
		point: { color: "#1677FF", borderColor: "#1677FF", activeColor: "#1677FF", activeBorderColor: "#1677FF" },
		line: { color: "#1677FF", size: 1, style: "solid" },
		rect: { color: "rgba(22, 119, 255, 0.2)", borderColor: "#1677FF" },
		text: { color: "#FFFFFF", size: 12 },
	},
};

const DARK_STYLES: DeepPartial<Styles> = {
	grid: {
		horizontal: { color: "#2B2B43" },
		vertical: { color: "#2B2B43" },
	},
	candle: {
		bar: {
			upColor: "#2DC08E",
			downColor: "#F6465D",
			upBorderColor: "#2DC08E",
			downBorderColor: "#F6465D",
			upWickColor: "#2DC08E",
			downWickColor: "#F6465D",
		},
		area: {
			lineColor: "#1677FF",
			backgroundColor: [
				{ offset: 0, color: "rgba(22, 119, 255, 0.01)" },
				{ offset: 1, color: "rgba(22, 119, 255, 0.35)" },
			],
		},
		priceMark: {
			high: { color: "#B2B5BE" },
			low: { color: "#B2B5BE" },
			last: { text: { color: "#FFFFFF" } },
		},
		tooltip: { title: { color: "#B2B5BE" }, legend: { color: "#B2B5BE" } },
	},
	xAxis: {
		axisLine: { color: "#4C525E" },
		tickLine: { color: "#4C525E" },
		tickText: { color: "#B2B5BE" },
	},
	yAxis: {
		axisLine: { color: "#4C525E" },
		tickLine: { color: "#4C525E" },
		tickText: { color: "#B2B5BE" },
	},
	separator: { color: "#4C525E", activeBackgroundColor: "#2B2B43" },
	crosshair: {
		horizontal: { line: { color: "#B2B5BE" }, text: { color: "#FFFFFF" } },
		vertical: { line: { color: "#B2B5BE" }, text: { color: "#FFFFFF" } },
	},
	indicator: {
		ohlc: { upColor: "#2DC08E", downColor: "#F6465D" },
		tooltip: { legend: { color: "#B2B5BE" } },
	},
	overlay: {
		point: { color: "#1677FF", borderColor: "#1677FF", activeColor: "#1677FF", activeBorderColor: "#1677FF" },
		line: { color: "#1677FF" },
	},
};

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
export function buildStyles(props: KChartResolvedProps): DeepPartial<Styles> {
	const convenience = buildConvenienceStyles(props);
	const theme = props.theme === "dark" ? DARK_STYLES : LIGHT_STYLES;
	return mergeStyles(theme, convenience, props.styles);
}

/** Convenience-prop-derived partial styles (everything except theme + raw). 由便捷 props 推导的部分样式（主题与原始 styles 之外）。 */
function buildConvenienceStyles(
	props: KChartResolvedProps,
): DeepPartial<Styles> {
	const s: DeepPartial<Styles> = {};

	if (props.gridColor !== undefined || props.showGrid !== undefined) {
		const color = props.gridColor ?? LIGHT_STYLES.grid?.horizontal?.color;
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
	props: KChartResolvedProps,
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

/** Resolved `symbol` for `chart.setSymbol`. 供 `chart.setSymbol` 使用的已解析 symbol。 */
export function resolveSymbol(
	props: KChartResolvedProps,
): Partial<SymbolInfo> {
	return {
		ticker: props.symbol?.ticker ?? props.symbolTicker,
		pricePrecision: props.symbol?.pricePrecision,
		volumePrecision: props.symbol?.volumePrecision,
	};
}

/** Resolved `period` for `chart.setPeriod`. 供 `chart.setPeriod` 使用的已解析 period。 */
export function resolvePeriod(props: KChartResolvedProps): Period {
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
			return out;
		}),
	);
}
