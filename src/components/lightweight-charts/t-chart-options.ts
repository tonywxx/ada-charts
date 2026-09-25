import {
	AreaSeries,
	BarSeries,
	BaselineSeries,
	CandlestickSeries,
	ColorType,
	CrosshairMode,
	HistogramSeries,
	LastPriceAnimationMode,
	LineStyle,
	LineSeries,
	type LineWidth,
	LineType,
	PriceLineSource,
	PriceScaleMode,
	TrackingModeExitMode,
	type ChartOptions,
	type CreatePriceLineOptions,
	type DeepPartial,
	type HistogramData,
	type ISeriesApi,
	type IChartApi,
	type SeriesMarker,
	type SeriesType,
	type Time,
	type UTCTimestamp,
} from "lightweight-charts";
import { getDecimalLength } from "./number/getDecimalLength";
import { getDecimalMinMove } from "./number/getDecimalMinMove";
import { DOWN_COLOR, UP_COLOR } from "./trade-theme";
import type {
	TChartDataItem,
	TChartMarker,
	TChartProps,
	TChartType,
} from "./TChart";

/**
 * Single source of truth for every {@link TChartProps} default.
 *
 * The component merges props over this table instead of using parameter
 * destructuring defaults, so the story `argTypes`, the docs, and the runtime
 * behaviour can all be derived from one object.
 *
 * 所有 {@link TChartProps} 默认值的唯一来源。
 *
 * 组件把 props 合并到这张表上，而不是在参数解构里写默认值，
 * 因此故事的 `argTypes`、文档和运行时行为都可以由同一个对象派生。
 */
export const TCHART_DEFAULTS = {
	backgroundColor: "#ffffff",
	textColor: "#677489",
	fontSize: 12,
	fontFamily: "Arial, sans-serif",
	width: 800,
	height: 400,
	autoSize: true,
	isMiniChart: false,
	attributionLogo: false,
	hoveredSeriesOnTop: false,
	panesEnableResize: true,

	vertGridVisible: true,
	vertGridColor: "rgba(197, 203, 206, 0.5)",
	vertGridStyle: 0,
	horzGridVisible: true,
	horzGridColor: "rgba(197, 203, 206, 0.5)",
	horzGridStyle: 0,

	timeScaleVisible: true,
	timeVisible: false,
	timeSecondsVisible: false,
	timeScaleBorderVisible: true,
	timeScaleBorderColor: "#2B2B43",
	timeScaleRightOffset: 6,
	timeScaleFixLeftEdge: true,
	timeScaleFixRightEdge: false,
	timeScaleLockVisibleRangeOnResize: false,
	timeScaleRightBarStaysOnScroll: false,
	timeScaleTicksVisible: false,
	timeScaleUniformDistribution: false,
	timeScaleMinimumHeight: 0,
	timeScaleAllowBoldLabels: true,
	timeScaleShiftVisibleRangeOnNewBar: false,
	timeScaleIgnoreWhitespaceIndices: false,
	timeScaleEnableConflation: false,

	autoScale: true,
	priceScaleMode: "normal",
	priceScalePosition: "right",
	defaultPriceScaleId: "right",
	priceScaleBorderVisible: true,
	priceScaleBorderColor: "#2B2B43",
	priceScaleInvert: false,
	priceScaleAlignLabels: true,
	priceScaleEntireTextOnly: false,
	priceScaleTicksVisible: false,
	priceScaleMinimumWidth: 0,
	priceScaleTopMargin: 0.2,
	priceScaleBottomMargin: 0.1,
	priceScaleEnsureEdgeTickMarks: false,
	priceScaleTickMarkDensity: 4,

	crosshairMode: "normal",
	crosshairVertColor: "#758696",
	crosshairVertWidth: 1,
	crosshairVertStyle: 3,
	crosshairVertVisible: true,
	crosshairVertLabelVisible: true,
	crosshairVertLabelBackgroundColor: "#4C525E",
	crosshairHorzColor: "#758696",
	crosshairHorzWidth: 1,
	crosshairHorzStyle: 3,
	crosshairHorzVisible: true,
	crosshairHorzLabelVisible: true,
	crosshairHorzLabelBackgroundColor: "#4C525E",
	crosshairSnapToHiddenSeries: false,

	handleScroll: true,
	handleScale: true,
	kineticScrollTouch: true,
	kineticScrollMouse: false,
	trackingModeExitMode: "onTouchEnd",

	locale: "en",
	dateFormat: "yyyy-MM-dd",

	chartType: "candlestick",
	title: "",
	seriesVisible: true,
	lastValueVisible: true,
	priceLineVisible: true,
	priceLineWidth: 1,
	priceLineStyle: 3,
	priceLineSource: "lastBar",
	baseLineVisible: false,
	baseLineColor: "#000000",
	baseLineWidth: 1,
	baseLineStyle: 0,
	priceFormatType: "price",

	upColor: "#26a69a",
	downColor: "#ef5350",
	borderVisible: false,
	borderUpColor: "#4A4A4A",
	borderDownColor: "#4A4A4A",
	wickUpColor: "#26a69a",
	wickDownColor: "#ef5350",
	wickVisible: true,

	lineColor: "#2962FF",
	lineWidth: 2,
	lineStyle: 0,
	lineType: 0,
	lineVisible: true,
	pointMarkersVisible: false,
	crosshairMarkerVisible: true,
	crosshairMarkerRadius: 4,

	topColor: "rgba(41, 98, 255, 0.28)",
	bottomColor: "rgba(41, 98, 255, 0.05)",
	relativeGradient: false,
	invertFilledArea: false,

	openVisible: true,
	thinBars: false,
	histogramBase: 0,
	lastPriceAnimationMode: LastPriceAnimationMode.OnDataUpdate,

	watermarkVisible: false,
	watermarkText: "",
	watermarkColor: "rgba(0, 0, 0, 0.1)",
	watermarkFontSize: 48,
	watermarkHorzAlign: "center",
	watermarkVertAlign: "center",
	watermarkFontStyle: "bold",

	showHighPriceLine: false,
	highPriceLineColor: "#2962FF",
	highPriceLineStyle: 0,
	showLowPriceLine: false,
	lowPriceLineColor: "#758696",
	lowPriceLineStyle: 0,
	showAvgPriceLine: false,
	avgPriceLineColor: "#EAB308",
	avgPriceLineStyle: 0,
	priceLineAxisLabelVisible: true,

	showVolume: false,
	showVolumeLabel: false,
	volumeUpColor: UP_COLOR,
	volumeDownColor: DOWN_COLOR,
	volumePriceScaleId: "volume",
	volumeTopMargin: 0.8,

	showEma: true,
	emaPeriod1: 10,
	emaPeriod2: 20,
	emaColor1: "#FF8C00",
	emaColor2: "#8A2BE2",
	emaLineWidth: 1,
	emaLastValueVisible: false,
} as const;

/** Keys of {@link TChartProps} that carry a default in {@link TCHART_DEFAULTS}. */
export type TChartResolvedProps = TChartProps &
	// `Required` is applied through the mapped type below so each default keeps
	// its literal-free widening while staying assignable to the prop's own type.
	// `Required` 通过下面的映射类型施加，使默认值仍与对应 prop 的类型兼容。
	{ [K in keyof typeof TCHART_DEFAULTS]-?: NonNullable<TChartProps[K]> };

/**
 * Merges caller props over {@link TCHART_DEFAULTS}, ignoring keys the caller
 * passed as `undefined` so an explicit `undefined` still means "use default".
 *
 * 把调用方 props 合并到 {@link TCHART_DEFAULTS} 之上；值为 `undefined` 的键
 * 视为未传，仍然使用默认值。
 */
export function resolveTChartProps(props: TChartProps): TChartResolvedProps {
	const resolved = { ...TCHART_DEFAULTS } as Record<string, unknown>;
	for (const [key, value] of Object.entries(props)) {
		if (value !== undefined) resolved[key] = value;
	}
	return resolved as unknown as TChartResolvedProps;
}

/**
 * Shallow prop comparison used as the `memo` comparator for `TChart`.
 *
 * Object-valued props (`data`, `markers`, the option bags) compare by identity,
 * which is what lets the component depend on the whole resolved-props object
 * instead of a ~90-entry dependency list per effect.
 *
 * 作为 `TChart` 的 `memo` 比较器的浅层属性比较。
 *
 * 对象型 prop（`data`、`markers`、各类配置包）按引用比较；正因如此，组件可以整体依赖
 * 解析后的 props 对象，而无需为每个 effect 写出近百项的依赖列表。
 */
export function areTChartPropsEqual(
	previous: TChartProps,
	next: TChartProps,
): boolean {
	const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
	for (const key of keys) {
		const left = (previous as Record<string, unknown>)[key];
		const right = (next as Record<string, unknown>)[key];
		// An absent prop and one explicitly set to `undefined` both fall back to
		// the same default, so they must not count as a change.
		// 未传与显式传 `undefined` 都会回退到同一个默认值，因此不能算作变化。
		if (left !== right && !(left === undefined && right === undefined)) {
			return false;
		}
	}
	return true;
}

/**
 * A `{ time, value }` pair, structurally compatible with the library's
 * `LineData`, used for the EMA overlays.
 *
 * 结构与库的 `LineData` 兼容的 `{ time, value }` 对，供 EMA 叠加线使用。
 */
export interface LineDataPoint {
	time: Time;
	value: number;
}

/**
 * Numeric timestamps become UTCTimestamps; `"yyyy-mm-dd"` strings are already
 * valid business-day times and pass straight through.
 *
 * 数字时间戳转为 UTCTimestamp；`"yyyy-mm-dd"` 字符串本身就是合法的交易日时间，
 * 直接透传。
 */
function toChartTime(time: number | string): Time {
	return typeof time === "number" ? (time as UTCTimestamp) : time;
}

/** A time is usable when it is a finite number or a non-empty business-day string. */
function isUsableTime(time: TChartDataItem["time"]): boolean {
	return typeof time === "number"
		? Number.isFinite(time)
		: typeof time === "string" && time.length > 0;
}

/**
 * Drops points with a non-finite time or no finite price, de-duplicates by
 * time, and returns the result sorted ascending — the order
 * `lightweight-charts` requires.
 *
 * 丢弃时间非有限值或没有有效价格的数据点，按时间去重，并升序排序 ——
 * 这是 `lightweight-charts` 要求的顺序。
 */
export function normalizeChartData(
	data: TChartDataItem[] | undefined,
): TChartDataItem[] {
	if (!data?.length) return [];

	const byTime = new Map<TChartDataItem["time"], TChartDataItem>();
	for (const item of data) {
		if (!isUsableTime(item.time)) continue;
		if (!Number.isFinite(item.close ?? item.value ?? item.open ?? NaN)) continue;
		byTime.set(item.time, item);
	}

	return [...byTime.values()].sort((a, b) =>
		typeof a.time === "number" && typeof b.time === "number"
			? a.time - b.time
			: String(a.time).localeCompare(String(b.time)),
	);
}

/**
 * Price extremes and mean over the dataset, driving the high/low/average
 * reference lines. Returns non-finite values for empty input so callers can
 * skip the corresponding line.
 *
 * 数据集的价格极值与均值，用于最高/最低/均价参考线。空数据返回非有限值，
 * 调用方可据此跳过对应线条。
 */
export function calcStats(data: TChartDataItem[]): {
	maxPrice: number;
	minPrice: number;
	avgPrice: number;
} {
	let maxPrice = Number.NaN;
	let minPrice = Number.NaN;
	let total = 0;
	let count = 0;

	for (const item of data) {
		const high = item.high ?? item.value ?? item.close ?? NaN;
		const low = item.low ?? item.value ?? item.close ?? NaN;
		const price = item.close ?? item.value ?? item.open ?? NaN;
		if (!Number.isFinite(price)) continue;

		if (Number.isFinite(high)) maxPrice = Number.isFinite(maxPrice) ? Math.max(maxPrice, high) : high;
		if (Number.isFinite(low)) minPrice = Number.isFinite(minPrice) ? Math.min(minPrice, low) : low;
		total += price;
		count += 1;
	}

	return { maxPrice, minPrice, avgPrice: count > 0 ? total / count : Number.NaN };
}

/**
 * Exponential moving average of close (falling back to `value`).
 *
 * Empty while there is fewer than `period` points; the first output point
 * seeds the series with the arithmetic mean of the leading window.
 *
 * 收盘价（缺省用 `value`）的指数移动平均。
 *
 * 数据量不足 `period` 时返回空数组；首个输出点以前 `period` 根的算术平均作为种子值。
 */
export function calcEMA(
	data: TChartDataItem[],
	period: number,
): LineDataPoint[] {
	if (!Number.isFinite(period) || period < 1 || data.length < period) return [];

	const prices = data.map((d) => d.close ?? d.value ?? d.open ?? 0);
	const seed = prices.slice(0, period).reduce((sum, price) => sum + price, 0);
	const k = 2 / (period + 1);

	let ema = seed / period;
	const out: LineDataPoint[] = [
		{ time: toChartTime(data[period - 1].time), value: ema },
	];
	for (let i = period; i < prices.length; i += 1) {
		ema = (prices[i] - ema) * k + ema;
		out.push({ time: toChartTime(data[i].time), value: ema });
	}
	return out;
}

/**
 * One volume bar for the overlay series, coloured by the bar's own direction.
 * 成交量副图的一根柱子，按该根 K 线的涨跌着色。
 */
export function toVolumeData(
	item: TChartDataItem,
	props: TChartResolvedProps,
): HistogramData & { color: string } {
	const close = item.close ?? item.value ?? 0;
	const open = item.open ?? item.value ?? close;
	return {
		time: toChartTime(item.time),
		value: item.volume ?? 0,
		color: close >= open ? props.volumeUpColor : props.volumeDownColor,
	};
}

/**
 * Maps the public marker shape onto the library's discriminated union, which
 * only accepts `price` when `position` is `"price"`.
 *
 * 把对外的标记结构映射为库的判别联合类型 —— 仅当 `position` 为 `"price"`
 * 时才允许 `price` 字段。
 */
export function toSeriesMarkers(
	markers: TChartMarker[] | undefined,
): SeriesMarker<Time>[] {
	if (!markers?.length) return [];
	return markers.map((marker) => ({
		time: toChartTime(marker.time),
		position: marker.position,
		shape: marker.shape,
		color: marker.color,
		text: marker.text,
		size: marker.size,
		id: marker.id,
		...(marker.position === "price" ? { price: marker.price } : {}),
	})) as unknown as SeriesMarker<Time>[];
}

/**
 * String price-scale mode to the library enum, falling back to `Normal`.
 * 字符串形式的价格轴模式转为库枚举，未知值回退为 `Normal`。
 */
export function toPriceScaleMode(
	mode: TChartProps["priceScaleMode"],
): PriceScaleMode {
	const modes: Record<string, PriceScaleMode> = {
		normal: PriceScaleMode.Normal,
		logarithmic: PriceScaleMode.Logarithmic,
		percentage: PriceScaleMode.Percentage,
		indexedTo100: PriceScaleMode.IndexedTo100,
	};
	return modes[mode ?? "normal"] ?? PriceScaleMode.Normal;
}

/**
 * String crosshair mode to the library enum, falling back to `Normal`.
 * 字符串形式的十字光标模式转为库枚举，未知值回退为 `Normal`。
 */
export function toCrosshairMode(
	mode: TChartProps["crosshairMode"],
): CrosshairMode {
	const modes: Record<string, CrosshairMode> = {
		normal: CrosshairMode.Normal,
		magnet: CrosshairMode.Magnet,
		hidden: CrosshairMode.Hidden,
	};
	return modes[mode ?? "normal"] ?? CrosshairMode.Normal;
}

/** The resolved numeric format used by the price axis and the price labels. */
export interface TChartPriceFormat {
	type: "price" | "volume" | "percent";
	precision: number;
	minMove: number;
}

/**
 * Works out the numeric format for the price axis.
 *
 * When neither `pricePrecision` nor `priceMinMove` is given, both are inferred
 * from the first data point, so a 2-decimal instrument and a 6-decimal crypto
 * pair both print correctly with no configuration.
 *
 * 推算价格轴的数值格式。
 *
 * 当 `pricePrecision` 与 `priceMinMove` 都未指定时，两者均由首个数据点推断，
 * 因此两位小数的标的和六位小数的交易对无需配置即可正确显示。
 */
export function resolvePriceFormat(
	props: TChartResolvedProps,
	data: TChartDataItem[],
): TChartPriceFormat {
	if (props.priceFormatType === "volume") {
		return { type: "volume", precision: 0, minMove: 1 };
	}

	const { pricePrecision, priceMinMove } = props;
	if (pricePrecision !== undefined || priceMinMove !== undefined) {
		const precision = Math.max(
			0,
			Math.min(20, pricePrecision ?? Math.max(0, getDecimalLength(priceMinMove ?? 0))),
		);
		return {
			type: props.priceFormatType,
			precision,
			minMove: priceMinMove ?? 1 / 10 ** precision,
		};
	}

	const sample = data[0]?.close ?? data[0]?.value ?? data[0]?.open ?? NaN;
	const inferred = getDecimalLength(sample);
	const precision = inferred >= 0 ? Math.min(inferred, 20) : 2;
	const minMove = getDecimalMinMove(sample);

	return {
		type: props.priceFormatType,
		precision,
		minMove:
			Number.isFinite(minMove) && minMove > 0
				? minMove
				: 1 / 10 ** precision,
	};
}

/**
 * Builds the chart-level option object from resolved props.
 *
 * The same builder feeds both `createChart` at mount and every later
 * `chart.applyOptions`, which is what lets a style change update in place
 * instead of tearing the chart down.
 *
 * 由已解析的 props 构建图表级配置对象。
 *
 * 挂载时的 `createChart` 与后续每次 `chart.applyOptions` 共用这个构建器，
 * 这正是样式变更可以原地更新、无需重建图表的原因。
 */
export function buildChartOptions(
	props: TChartResolvedProps,
): DeepPartial<ChartOptions> {
	const position = props.priceScalePosition;
	const mode = toPriceScaleMode(props.priceScaleMode);
	const scaleMargins = {
		top: props.priceScaleTopMargin,
		bottom: props.priceScaleBottomMargin,
	};
	const priceScaleShared = {
		borderVisible: props.priceScaleBorderVisible,
		borderColor: props.priceScaleBorderColor,
		textColor: props.priceScaleTextColor ?? props.textColor,
		invertScale: props.priceScaleInvert,
		alignLabels: props.priceScaleAlignLabels,
		entireTextOnly: props.priceScaleEntireTextOnly,
		ticksVisible: props.priceScaleTicksVisible,
		minimumWidth: props.priceScaleMinimumWidth,
		ensureEdgeTickMarksVisible: props.priceScaleEnsureEdgeTickMarks,
		tickMarkDensity: props.priceScaleTickMarkDensity,
	};

	const options: DeepPartial<ChartOptions> = {
		width: props.width,
		height: props.height,
		autoSize: props.autoSize,
		hoveredSeriesOnTop: props.hoveredSeriesOnTop,
		defaultVisiblePriceScaleId: props.defaultPriceScaleId,
		layout: {
			attributionLogo: props.attributionLogo,
			background: { type: ColorType.Solid, color: props.backgroundColor },
			textColor: props.textColor,
			fontSize: props.fontSize,
			fontFamily: props.fontFamily,
			panes: {
				enableResize: props.panesEnableResize,
				separatorColor: props.paneSeparatorColor,
				...(props.paneSeparatorHoverColor !== undefined
					? { separatorHoverColor: props.paneSeparatorHoverColor }
					: {}),
			},
		},
		grid: {
			vertLines: {
				visible: props.vertGridVisible,
				color: props.vertGridColor,
				style: props.vertGridStyle as LineStyle,
			},
			horzLines: {
				visible: props.horzGridVisible,
				color: props.horzGridColor,
				style: props.horzGridStyle as LineStyle,
			},
		},
		timeScale: {
			visible: props.timeScaleVisible,
			timeVisible: props.timeVisible,
			secondsVisible: props.timeSecondsVisible,
			borderVisible: props.timeScaleBorderVisible,
			borderColor: props.timeScaleBorderColor,
			rightOffset: props.timeScaleRightOffset,
			fixLeftEdge: props.timeScaleFixLeftEdge,
			fixRightEdge: props.timeScaleFixRightEdge,
			lockVisibleTimeRangeOnResize: props.timeScaleLockVisibleRangeOnResize,
			rightBarStaysOnScroll: props.timeScaleRightBarStaysOnScroll,
			ticksVisible: props.timeScaleTicksVisible,
			uniformDistribution: props.timeScaleUniformDistribution,
			minimumHeight: props.timeScaleMinimumHeight,
			allowBoldLabels: props.timeScaleAllowBoldLabels,
			shiftVisibleRangeOnNewBar: props.timeScaleShiftVisibleRangeOnNewBar,
			ignoreWhitespaceIndices: props.timeScaleIgnoreWhitespaceIndices,
			enableConflation: props.timeScaleEnableConflation,
			barSpacing: props.timeScaleBarSpacing,
			minBarSpacing: props.timeScaleMinBarSpacing,
			maxBarSpacing: props.timeScaleMaxBarSpacing,
			tickMarkMaxCharacterLength: props.timeScaleTickMarkMaxCharacterLength,
			...props.timeScaleOptionsOverride,
		},
		rightPriceScale: {
			...priceScaleShared,
			visible: position === "right",
			mode,
			autoScale: props.autoScale,
			scaleMargins,
			...props.priceScaleOptionsOverride,
		},
		leftPriceScale: {
			...priceScaleShared,
			visible: position === "left",
			mode,
			autoScale: props.autoScale,
			scaleMargins,
			...props.priceScaleOptionsOverride,
		},
		overlayPriceScales: {
			mode,
			...props.overlayPriceScaleOptionsOverride,
		},
		crosshair: {
			mode: toCrosshairMode(props.crosshairMode),
			doNotSnapToHiddenSeriesIndices: !props.crosshairSnapToHiddenSeries,
			vertLine: {
				visible: props.crosshairVertVisible,
				color: props.crosshairVertColor,
				width: props.crosshairVertWidth as LineWidth,
				style: props.crosshairVertStyle as LineStyle,
				labelVisible: props.crosshairVertLabelVisible,
				labelBackgroundColor: props.crosshairVertLabelBackgroundColor,
			},
			horzLine: {
				visible: props.crosshairHorzVisible,
				color: props.crosshairHorzColor,
				width: props.crosshairHorzWidth as LineWidth,
				style: props.crosshairHorzStyle as LineStyle,
				labelVisible: props.crosshairHorzLabelVisible,
				labelBackgroundColor: props.crosshairHorzLabelBackgroundColor,
			},
			...props.crosshairOptionsOverride,
		},
		handleScroll: props.handleScroll ?? TCHART_DEFAULTS.handleScroll,
		handleScale: props.handleScale ?? TCHART_DEFAULTS.handleScale,
		kineticScroll: {
			touch: props.kineticScrollTouch,
			mouse: props.kineticScrollMouse,
		},
		trackingMode: {
			exitMode:
				props.trackingModeExitMode === "onNextTap"
					? TrackingModeExitMode.OnNextTap
					: TrackingModeExitMode.OnTouchEnd,
		},
		localization: {
			locale: props.locale,
			dateFormat: props.dateFormat,
			...props.localizationOptionsOverride,
		},
		...props.chartOptionsOverride,
	};

	return options;
}

/**
 * Options every series kind accepts (title, price line, price format…).
 * 所有系列类型都接受的选项（标题、价格线、价格格式等）。
 */
function buildSeriesCommonOptions(
	props: TChartResolvedProps,
	data: TChartDataItem[],
): Record<string, unknown> {
	return {
		title: props.title,
		visible: props.seriesVisible,
		lastValueVisible: props.lastValueVisible,
		priceLineVisible: props.priceLineVisible,
		...(props.priceLineColor !== undefined
			? { priceLineColor: props.priceLineColor }
			: {}),
		priceLineWidth: props.priceLineWidth as LineWidth,
		priceLineStyle: props.priceLineStyle as LineStyle,
		priceLineSource:
			props.priceLineSource === "lastVisibleBar"
				? PriceLineSource.LastVisible
				: PriceLineSource.LastBar,
		baseLineVisible: props.baseLineVisible,
		baseLineColor: props.baseLineColor,
		baseLineWidth: props.baseLineWidth as LineWidth,
		baseLineStyle: props.baseLineStyle as LineStyle,
		priceFormat: resolvePriceFormat(props, data),
	};
}

/**
 * Style options that only exist on some series kinds.
 * 仅部分系列类型才有的样式选项。
 */
function buildSeriesStyleOptions(
	props: TChartResolvedProps,
	data: TChartDataItem[],
): Record<string, unknown> {
	const lineStyle = props.lineStyle as LineStyle;
	const lineWidth = (props.isMiniChart ? 1 : props.lineWidth) as LineWidth;
	const lineType = props.lineType as LineType;

	const sharedLine = {
		lineStyle,
		lineWidth,
		lineType,
		lineVisible: props.lineVisible,
		lastPriceAnimation: props.lastPriceAnimationMode,
		pointMarkersVisible: props.pointMarkersVisible,
		...(props.pointMarkersRadius !== undefined
			? { pointMarkersRadius: props.pointMarkersRadius }
			: {}),
		crosshairMarkerVisible: props.crosshairMarkerVisible,
		crosshairMarkerRadius: props.crosshairMarkerRadius,
		...(props.crosshairMarkerBorderColor !== undefined
			? { crosshairMarkerBorderColor: props.crosshairMarkerBorderColor }
			: {}),
		...(props.crosshairMarkerBackgroundColor !== undefined
			? { crosshairMarkerBackgroundColor: props.crosshairMarkerBackgroundColor }
			: {}),
		...(props.crosshairMarkerBorderWidth !== undefined
			? { crosshairMarkerBorderWidth: props.crosshairMarkerBorderWidth }
			: {}),
	};

	switch (props.chartType) {
		case "line":
			return { ...sharedLine, color: props.lineColor };
		case "area":
			return {
				...sharedLine,
				lineColor: props.lineColor,
				topColor: props.topColor,
				bottomColor: props.bottomColor,
				relativeGradient: props.relativeGradient,
				invertFilledArea: props.invertFilledArea,
			};
		case "bar":
			return {
				upColor: props.upColor,
				downColor: props.downColor,
				openVisible: props.openVisible,
				thinBars: props.thinBars,
			};
		case "histogram":
			return { color: props.lineColor, base: props.histogramBase };
		case "baseline":
			return {
				...sharedLine,
				topLineColor: props.upColor,
				bottomLineColor: props.downColor,
				topFillColor1: `${props.upColor}33`,
				topFillColor2: `${props.upColor}11`,
				bottomFillColor1: `${props.downColor}33`,
				bottomFillColor2: `${props.downColor}11`,
				relativeGradient: props.relativeGradient,
				// An explicit `baselinePrice` wins; otherwise the line sits on the
				// dataset mean so the two halves stay balanced.
				// 显式传入 `baselinePrice` 优先；否则基准线取数据均值，使上下两半保持均衡。
				baseValue: {
					type: "price" as const,
					price: props.baselinePrice ?? calcStats(data).avgPrice,
				},
			};
		default:
			return {
				upColor: props.upColor,
				downColor: props.downColor,
				wickVisible: props.wickVisible,
				...(props.wickColor !== undefined ? { wickColor: props.wickColor } : {}),
				wickUpColor: props.wickUpColor,
				wickDownColor: props.wickDownColor,
				borderVisible: props.borderVisible,
				...(props.borderColor !== undefined ? { borderColor: props.borderColor } : {}),
				borderUpColor: props.borderUpColor,
				borderDownColor: props.borderDownColor,
			};
	}
}

/**
 * Final main-series options: shared options, then type-specific style, then the
 * caller's `seriesOptionsOverride` escape hatch.
 *
 * 主系列的最终选项：公共选项 → 类型专属样式 → 调用方的 `seriesOptionsOverride`。
 */
export function buildMainSeriesOptions(
	props: TChartResolvedProps,
	data: TChartDataItem[],
): Record<string, unknown> {
	return {
		...buildSeriesCommonOptions(props, data),
		...buildSeriesStyleOptions(props, data),
		...props.seriesOptionsOverride,
	};
}

/**
 * Options for the volume overlay series.
 * 成交量副图系列的选项。
 */
export function buildVolumeSeriesOptions(
	props: TChartResolvedProps,
): Record<string, unknown> {
	return {
		color: props.volumeUpColor,
		base: 0,
		priceFormat: { type: "volume", precision: 0, minMove: 1 },
		lastValueVisible: props.showVolumeLabel,
		priceLineVisible: false,
		title: props.volumeTitle ?? "",
		priceScaleId: props.volumePriceScaleId,
		visible: props.showVolume,
	};
}

/**
 * Options for one EMA overlay line.
 * 单条 EMA 叠加线的选项。
 */
export function buildEmaSeriesOptions(
	props: TChartResolvedProps,
	period: number,
	color: string,
): Record<string, unknown> {
	return {
		color,
		lineWidth: props.emaLineWidth as LineWidth,
		priceLineVisible: false,
		lastValueVisible: props.emaLastValueVisible,
		title: `E${period}`,
	};
}

/** The `addSeries` definition matching a chart type; unknown input falls back to candlestick. */
function seriesDefinition(type: TChartType) {
	switch (type) {
		case "line":
			return LineSeries;
		case "area":
			return AreaSeries;
		case "bar":
			return BarSeries;
		case "histogram":
			return HistogramSeries;
		case "baseline":
			return BaselineSeries;
		case "candlestick":
		default:
			return CandlestickSeries;
	}
}

/**
 * Creates the main series for `props.chartType`.
 * 按 `props.chartType` 创建主系列。
 */
export function createMainSeries(
	chart: IChartApi,
	props: TChartResolvedProps,
	data: TChartDataItem[],
): ISeriesApi<SeriesType> {
	return chart.addSeries(
		seriesDefinition(props.chartType),
		// Options are assembled from a runtime `chartType`, so the record cannot
		// be statically pinned to one `SeriesPartialOptionsMap` member.
		// 选项由运行期的 chartType 组装，无法静态收窄到某一个系列选项成员。
		buildMainSeriesOptions(props, data) as never,
	);
}

/**
 * High / low / average reference lines derived from the dataset.
 *
 * Only finite statistics produce a line, so empty or single-point data does not
 * create degenerate marks.
 *
 * 由数据集推导的最高 / 最低 / 均价参考线。
 *
 * 仅当统计值为有限数时才生成，避免空数据或单点数据产生退化线条。
 */
export function buildPriceLineSpecs(
	props: TChartResolvedProps,
	data: TChartDataItem[],
): CreatePriceLineOptions[] {
	const { maxPrice, minPrice, avgPrice } = calcStats(data);

	const specs: Array<{
		show: boolean;
		price: number;
		color: string;
		style: number;
		title: string;
	}> = [
		{
			show: props.showHighPriceLine,
			price: maxPrice,
			color: props.highPriceLineColor,
			style: props.highPriceLineStyle,
			title: props.isMiniChart ? "" : "H",
		},
		{
			show: props.showLowPriceLine,
			price: minPrice,
			color: props.lowPriceLineColor,
			style: props.lowPriceLineStyle,
			title: props.isMiniChart ? "" : "L",
		},
		{
			show: props.showAvgPriceLine,
			price: avgPrice,
			color: props.avgPriceLineColor,
			style: props.avgPriceLineStyle,
			title: props.isMiniChart ? "" : "A",
		},
	];

	return specs
		.filter((spec) => spec.show && Number.isFinite(spec.price))
		.map((spec) => ({
			price: spec.price,
			color: spec.color,
			lineWidth: 1 as LineWidth,
			lineStyle: spec.style as LineStyle,
			axisLabelVisible: props.priceLineAxisLabelVisible,
			title: spec.title,
		}));
}
