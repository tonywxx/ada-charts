import {
	type ActionCallback,
	type ActionType,
	type AxisCreateRangeCallback,
	type CandleType,
	type Chart,
	type DataLoader,
	type DecimalFold,
	type DeepPartial,
	dispose,
	type Formatter,
	type Hotkey,
	type IndicatorCreate,
	init,
	type KLineData,
	type Layout,
	type OverlayCreate,
	type PaneOptions,
	type Period,
	type PeriodType,
	type Styles,
	type SymbolInfo,
	type ThousandsSeparator,
	type TooltipShowRule,
	type TooltipShowType,
	type ZoomAnchor,
	type ZoomAnchorType,
} from "klinecharts";
import { memo, useEffect, useMemo, useRef } from "react";
import { decideDataPatch } from "../../data-patch";
import { useEngineMount } from "../../engine-mount";
import {
	type ADACHART_DEFAULTS,
	areAdaChartPropsEqual,
	buildInitOptions,
	buildStyles,
	createMemoryDataLoader,
	ensureExtensionOverlays,
	ensureVolumeOverlay,
	normalizeKLineData,
	resolveAdaChartProps,
	resolvePeriod,
	resolveSymbolInfo,
	sameKLineData,
	structuralKey,
} from "./adachart-options";
import { createFrameBarQueue } from "./adachart-stream";
import { VOLUME_OVERLAY_INDICATOR } from "./adachart-window-config";

/**
 * Flat colour / visibility knobs that `AdaChart` maps onto the nested
 * `klinecharts` {@link Styles} tree. They sit *below* the raw {@link AdaChartProps.styles}
 * prop in precedence, so anything expressible here is also reachable there.
 *
 * 把 `AdaChart` 上扁平的颜色 / 显隐开关映射到嵌套的 `klinecharts` {@link Styles} 树。
 * 它们的优先级 *低于* 原始的 {@link AdaChartProps.styles} 属性，因此这里能表达的一切都
 * 能在 `styles` 里表达。
 */
export interface AdaChartConvenienceStyleProps {
	/**
	 * Candle render kind.
	 * 蜡烛渲染样式。
	 */
	candleType?: CandleType;
	/**
	 * Rising colour.
	 * 上涨颜色。
	 */
	upColor?: string;
	/**
	 * Falling colour.
	 * 下跌颜色。
	 */
	downColor?: string;
	/**
	 * No-change colour.
	 * 无变化颜色。
	 */
	noChangeColor?: string;
	/**
	 * Show the grid.
	 * 是否显示网格。
	 */
	showGrid?: boolean;
	/**
	 * Grid line colour.
	 * 网格线颜色。
	 */
	gridColor?: string;
	/**
	 * Show the crosshair.
	 * 是否显示十字光标。
	 */
	showCrosshair?: boolean;
	/**
	 * Crosshair colour.
	 * 十字光标颜色。
	 */
	crosshairColor?: string;
	/**
	 * Axis label colour.
	 * 坐标轴文字颜色。
	 */
	textColor?: string;
	/**
	 * Axis label font size.
	 * 坐标轴字号。
	 */
	fontSize?: number;
	/**
	 * Axis label font family.
	 * 坐标轴字体。
	 */
	fontFamily?: string;
	/**
	 * Show price marks (high/low/last).
	 * 是否显示价格标记（最高/最低/最新价）。
	 */
	showPriceMark?: boolean;
	/**
	 * Show the last-price mark.
	 * 是否显示最新价标记。
	 */
	showLastPriceMark?: boolean;
	/**
	 * Show high/low price marks.
	 * 是否显示最高/最低价标记。
	 */
	showHighLowPriceMark?: boolean;
	/**
	 * Tooltip visibility rule.
	 * 提示浮层显隐规则。
	 */
	tooltipShowRule?: TooltipShowRule;
	/**
	 * Candle tooltip presentation.
	 * 蜡烛提示浮层样式。
	 */
	candleTooltipShowType?: TooltipShowType;
}

/**
 * Chart-level event callbacks, each backed by `Chart.subscribeAction`.
 * 图表级事件回调，每个都由 `Chart.subscribeAction` 驱动。
 */
export interface AdaChartEventProps {
	/** 缩放时触发。Fires while zooming. */
	onZoom?: ActionCallback;
	/** 平移滚动时触发。Fires while scrolling. */
	onScroll?: ActionCallback;
	/** 可见区间变化时触发。Fires when the visible range changes. */
	onVisibleRangeChange?: ActionCallback;
	/** 十字光标位置变化时触发。Fires when the crosshair moves. */
	onCrosshairChange?: ActionCallback;
	/** 点击蜡烛柱时触发。Fires on a candle-bar click. */
	onCandleBarClick?: ActionCallback;
	/** 点击蜡烛提示浮层图标时触发。Fires on a candle-tooltip feature click. */
	onCandleTooltipFeatureClick?: ActionCallback;
	/** 点击指标提示浮层图标时触发。Fires on an indicator-tooltip feature click. */
	onIndicatorTooltipFeatureClick?: ActionCallback;
	/** 点击十字光标图标时触发。Fires on a crosshair feature click. */
	onCrosshairFeatureClick?: ActionCallback;
	/** 拖拽分屏时触发。Fires while a pane is dragged. */
	onPaneDrag?: ActionCallback;
}

/**
 * `PaneIdConstants.CANDLE`: the id `klinecharts` gives the price pane, which it
 * builds in the chart constructor. v10 does not export the constant, so it is
 * spelled out here.
 *
 * It is needed because v10's `isStack` flag is *not* what shares a pane:
 * `createIndicator` does `indicator.paneId ??= createId("indicator_pane_")`, so
 * an indicator given no `paneId` always opens a pane of its own, and `isStack`
 * only decides whether that pane's existing indicators are cleared first. An
 * explicit `paneId` is the only way to land next to the candles.
 *
 * `PaneIdConstants.CANDLE`：`klinecharts` 赋予价格面板的 id，该面板在图表构造函数中就已建立。
 * v10 未导出该常量，故在此写明。
 *
 * 之所以需要它：v10 的 `isStack` **并不**负责共用面板 —— `createIndicator` 里写的是
 * `indicator.paneId ??= createId("indicator_pane_")`，因此没有 `paneId` 的指标必然自开一个面板，
 * `isStack` 只决定是否先清空该面板已有的指标。想落到蜡烛旁边，只能显式给出 `paneId`。
 */
const CANDLE_PANE_ID = "candle_pane";

/**
 * The y-axis `vol-main` is drawn against inside the candles' pane, and the share
 * of that pane its bars keep for themselves.
 *
 * A count cannot be drawn against a price, so the overlay needs an axis of its
 * own. With none named, v10 hands every stacked indicator the pane's *default*
 * axis — the candles' — and the engine takes an axis' range from the union of
 * everything drawn against it, so a volume series there would stretch the range
 * to cover both magnitudes and squeeze the candles flat. The axis carries no
 * widget: the pane already labels the price, and a second column of numbers for
 * a study nobody reads numerically is a column of numbers too many.
 *
 * The share is what keeps the two readable together. It is applied to the axis'
 * *range* rather than to its `gap`, because the engine reads a gap of 1 or more
 * as pixels and anything below 1 as a fraction of the data range, and a fraction
 * cannot exceed 1 — the largest band a gap could express would leave the bars in
 * the bottom half of the pane.
 *
 * `vol-main` 在蜡烛面板里对照的那条 y 轴，以及它的柱子从该面板中占为己有的比例。
 *
 * 计数无法用价格来画，因此叠加需要自己的一条轴。不指名时，v10 把每个叠加指标都交给面板的*默认*
 * 轴 —— 也就是蜡烛那条 —— 而引擎把一条轴的范围取作画在其上的一切的并集，于是那里的成交量序列会把
 * 范围撑到覆盖两种量级，把蜡烛压平。这条轴不带刻度组件：本条面板已经标注了价格，而一个没人当数字读
 * 的指标再配一列数字，就是多出来的一列。
 *
 * 这个比例是让两者能一起读的东西。它作用在轴的*范围*上，而不是 `gap` 上：引擎把 1 及以上的 gap
 * 读作像素、1 以下读作数据范围的比例，而比例无法超过 1 —— gap 能表达的最大 band，只会让柱子留在
 * 面板的下半部分。
 */
const VOLUME_OVERLAY_Y_AXIS_ID = "vol_main_axis";
const VOLUME_OVERLAY_PANE_SHARE = 0.2;

/**
 * The range the overlay's bars are drawn in: the same range the engine derived
 * from the visible volumes, stretched so those bars occupy only
 * {@link VOLUME_OVERLAY_PANE_SHARE} of the pane and the space above them belongs
 * to the candles.
 *
 * `top: 0` and `bottom: 0` go with it — every axis is created from the pane's
 * layout template, whose gap of `{top: 0.2, bottom: 0.1}` would pad this
 * already-stretched range and float the bars off the bottom of the pane.
 *
 * 叠加的柱所在的那个范围：与引擎由可见成交量导出的范围相同，只是被拉长，使柱子只占面板的
 * {@link VOLUME_OVERLAY_PANE_SHARE}，上方空间留给蜡烛。
 *
 * 与之配套的是 `top: 0`、`bottom: 0` —— 每条轴都按面板的布局模板创建，而模板的 gap
 * `{top: 0.2, bottom: 0.1}` 会在这条已拉长的范围上再加内边距，把柱子抬离面板底部。
 */
const volumeOverlayAxisRange: AxisCreateRangeCallback = ({ defaultRange }) => {
	// `from` is the overlay's zero: `minValue: 0` makes the engine's own minimum
	// zero as well, so this states rather than changes it.
	// `from` 是叠加的零点：`minValue: 0` 已让引擎自己的下界为零，所以这一行是把它写出来，而非改动它。
	const from = 0;
	const to = defaultRange.to / VOLUME_OVERLAY_PANE_SHARE;
	const range = to - from;
	return {
		from,
		to,
		range,
		realFrom: from,
		realTo: to,
		realRange: range,
		displayFrom: from,
		displayTo: to,
		displayRange: range,
	};
};

/**
 * An indicator entry; `stack` shares the price pane instead of opening one.
 * See {@link CANDLE_PANE_ID} for why that takes an explicit `paneId` in v10.
 *
 * 指标项；`stack` 使其与价格面板共用，而不是另开一个。为什么在 v10 里需要显式 `paneId`，
 * 见 {@link CANDLE_PANE_ID}。
 */
export type AdaChartIndicator = (IndicatorCreate | string) & {
	stack?: boolean;
};

/**
 * Everything `AdaChart` accepts. Each prop maps 1:1 onto a `klinecharts` v10
 * setting or instance method; the raw {@link AdaChartProps.styles},
 * {@link AdaChartProps.indicators}, {@link AdaChartProps.overlays} and
 * {@link AdaChartProps.onChartReady} props keep the whole library surface
 * reachable, so the wrapper never becomes the reason a feature is unavailable.
 *
 * `AdaChart` 接受的全部属性。每个属性都与 `klinecharts` v10 的某个配置或实例方法一一对应；
 * 原始的 {@link AdaChartProps.styles}、{@link AdaChartProps.indicators}、
 * {@link AdaChartProps.overlays} 与 {@link AdaChartProps.onChartReady} 让库的全部能力始终可达，
 * 封装层不会成为某个功能无法使用的原因。
 */
export interface AdaChartProps
	extends AdaChartConvenienceStyleProps,
		AdaChartEventProps {
	// ------------------------------------------------------------------ data
	/**
	 * Candles to render. `timestamp` is epoch **milliseconds**, matching what
	 * `klinecharts` consumes natively. Order is free — normalised, de-duplicated
	 * by timestamp and sorted ascending before display.
	 *
	 * 要渲染的 K 线。`timestamp` 为**毫秒**级 Unix 时间戳，与 `klinecharts` 的原生格式一致。
	 * 顺序不限：展示前会归一化、按时间戳去重并升序排序。
	 */
	data?: KLineData[];
	/**
	 * Advanced: supply your own {@link DataLoader} (history paging, WebSocket
	 * streaming). When present it wins over {@link AdaChartProps.data}.
	 *
	 * 进阶：提供自定义 {@link DataLoader}（历史翻页、WebSocket 流）。提供时优先于
	 * {@link AdaChartProps.data}。
	 */
	dataLoader?: DataLoader;
	/**
	 * Instrument identity: `ticker`, `pricePrecision`, `volumePrecision`.
	 * 标的信息：代码、价格精度、成交量精度。
	 */
	symbol?: Partial<SymbolInfo>;
	/**
	 * Bar period, e.g. `{ type: "minute", span: 5 }`. Also the seed for
	 * {@link AdaChartProps.symbolTicker} / `periodType` / `periodSpan` shortcuts.
	 * K 线周期，如 `{ type: "minute", span: 5 }`。
	 */
	period?: Partial<Period>;
	/** Ticker shortcut feeding `symbol.ticker`. 用于 `symbol.ticker` 的简写。 */
	symbolTicker?: string;
	/** Period-type shortcut feeding `period.type`. 用于 `period.type` 的简写。 */
	periodType?: PeriodType;
	/** Period-span shortcut feeding `period.span`. 用于 `period.span` 的简写。 */
	periodSpan?: number;

	// ---------------------------------------------------------------- sizing
	/** 固定宽度（像素）；`autoSize` 开启时忽略。Fixed width in px; ignored while `autoSize` is on. */
	width?: number;
	/** 图表高度（像素）。Chart height in px. */
	height?: number;
	/**
	 * Track the container width with a `ResizeObserver`. `klinecharts` fills its
	 * host element, so sizing is done on the wrapper, not via chart options.
	 *
	 * 通过 `ResizeObserver` 跟随容器宽度。`klinecharts` 会撑满宿主元素，因此尺寸控制作用于
	 * 外层容器，而非图表选项。
	 */
	autoSize?: boolean;
	/**
	 * The `klinecharts` canvas is transparent, so this paints through as the
	 * chart background via the wrapper's CSS `background`.
	 *
	 * `klinecharts` 画布是透明的，因此此项通过外层容器的 CSS `background` 呈现为图表背景。
	 */
	backgroundColor?: string;

	// --------------------------------------------------------------- options
	/**
	 * Locale key; `klinecharts` ships `en-US` and `zh-CN`.
	 * 语言键；`klinecharts` 自带 `en-US` 与 `zh-CN`。
	 */
	locale?: string;
	/**
	 * IANA timezone for axis and tooltip dates, e.g. `"UTC"`, `"Asia/Shanghai"`.
	 * 坐标轴与浮层日期使用的 IANA 时区，例如 `"UTC"`、`"Asia/Shanghai"`。
	 */
	timezone?: string;
	/**
	 * Colour preset merged *under* {@link AdaChartProps.styles}.
	 * 配色预设，优先级*低于* {@link AdaChartProps.styles}。
	 */
	theme?: "light" | "dark";
	/**
	 * The full `klinecharts` style tree — the primary styling lever. Deep-merged
	 * over the {@link AdaChartProps.theme} preset and the convenience props.
	 *
	 * 完整的 `klinecharts` 样式树 —— 主要的样式控制入口。在 {@link AdaChartProps.theme}
	 * 预设与便捷 props 之上做深合并。
	 */
	styles?: DeepPartial<Styles>;
	/** Custom date/number/extend-text formatters. 自定义日期 / 数字 / 扩展文本格式化器。 */
	formatter?: Partial<Formatter>;
	/** Thousands separator config. 千分位分隔配置。 */
	thousandsSeparator?: Partial<ThousandsSeparator>;
	/** Decimal-fold config (e.g. show tiny decimals as `0`+`n` zeros). 小数折叠配置。 */
	decimalFold?: Partial<DecimalFold>;
	/** Where zooming is anchored. 缩放的锚点位置。 */
	zoomAnchor?: ZoomAnchorType | Partial<ZoomAnchor>;
	/** Keyboard shortcut config. 键盘快捷键配置。 */
	hotkey?: Partial<Hotkey>;
	/** Layout config: bar-space limits, default pane, y-axis geometry. 布局配置：栏宽上下限、默认面板、y 轴几何。 */
	layout?: DeepPartial<Layout>;

	// ------------------------------------------------------ indicators & panes
	/**
	 * Indicators to create, in order. A string is the indicator name; an object
	 * may carry `paneId`, `calcParams`, `yAxisId`, etc. Extension overlays are
	 * auto-registered, but custom *indicators* must still be registered via
	 * `registerIndicator` before being named here.
	 *
	 * 按顺序创建的指标。字符串即指标名；对象可携带 `paneId`、`calcParams`、`yAxisId` 等。
	 * 扩展画线工具会自动注册，但自定义*指标*仍需先通过 `registerIndicator` 注册再在此引用。
	 */
	indicators?: AdaChartIndicator[];
	/**
	 * Pane geometry (id, height, order, drag, state). Applied with
	 * `Chart.setPaneOptions`.
	 * 面板几何（id、高度、顺序、可拖拽、状态），通过 `Chart.setPaneOptions` 应用。
	 */
	panes?: Array<Partial<PaneOptions>>;
	/**
	 * Overlays (drawing tools) to instantiate. Names cover the built-in set and
	 * every `@klinecharts/extension` overlay (rect, gannBox, fibonacciSpiral, …),
	 * which `AdaChart` registers on mount.
	 *
	 * 要实例化的画线工具。名称涵盖内置集合与全部 `@klinecharts/extension` 工具
	 * （rect、gannBox、fibonacciSpiral 等），`AdaChart` 会在挂载时注册它们。
	 */
	overlays?: Array<OverlayCreate | string>;

	// ---------------------------------------------------------------- behavior
	/** 是否允许横向 / 纵向滚动。Enable scrolling. */
	scrollEnabled?: boolean;
	/** 是否允许缩放。Enable zooming. */
	zoomEnabled?: boolean;
	/** 最新 K 线右侧留白（像素）。Empty space (px) to the right of the newest bar. */
	offsetRightDistance?: number;
	/** 单根 K 线的像素宽度（缩放级别）。Pixel width of one bar (the zoom level). */
	barSpace?: number;
	/** 左侧最大可偏移距离（像素）。Maximum left offset distance in px. */
	maxOffsetLeftDistance?: number;
	/** 右侧最大可偏移距离（像素）。Maximum right offset distance in px. */
	maxOffsetRightDistance?: number;
	/** 左侧最少可见 K 线数。Minimum visible bars on the left. */
	leftMinVisibleBarCount?: number;
	/** 右侧最少可见 K 线数。Minimum visible bars on the right. */
	rightMinVisibleBarCount?: number;
	/** y 轴所在侧。Which side the y-axis sits on. */
	yAxisPosition?: "left" | "right";

	// ----------------------------------------------------------------- escape
	/**
	 * Receives the raw `klinecharts` {@link Chart} once it exists, for anything
	 * not surfaced as a prop (`convertToPixel`, `scrollToTimestamp`,
	 * `getConvertPictureUrl`, `createYAxis`, `executeAction`, …).
	 *
	 * 图表实例创建后回调原始的 `klinecharts` {@link Chart}，用于未被封装为 prop 的一切
	 *（`convertToPixel`、`scrollToTimestamp`、`getConvertPictureUrl`、`createYAxis`、
	 * `executeAction` 等）。
	 */
	onChartReady?: (chart: Chart) => void;
}

/** Keys of {@link AdaChartProps} that carry a default in {@link ADACHART_DEFAULTS}. 在 {@link ADACHART_DEFAULTS} 中带默认值的 {@link AdaChartProps} 键。 */
export type AdaChartResolvedProps = AdaChartProps & {
	[K in keyof typeof ADACHART_DEFAULTS]-?: NonNullable<AdaChartProps[K]>;
};

/** Map each event prop onto the matching `klinecharts` `ActionType`. 把每个事件 prop 映射到对应的 `klinecharts` `ActionType`。 */
const ACTIONS = {
	onZoom: "onZoom",
	onScroll: "onScroll",
	onVisibleRangeChange: "onVisibleRangeChange",
	onCrosshairChange: "onCrosshairChange",
	onCandleBarClick: "onCandleBarClick",
	onCandleTooltipFeatureClick: "onCandleTooltipFeatureClick",
	onIndicatorTooltipFeatureClick: "onIndicatorTooltipFeatureClick",
	onCrosshairFeatureClick: "onCrosshairFeatureClick",
	onPaneDrag: "onPaneDrag",
} as const satisfies Record<keyof AdaChartEventProps, ActionType>;

const ACTION_KEYS = Object.keys(ACTIONS) as Array<keyof typeof ACTIONS>;

/**
 * A declarative React wrapper over `klinecharts` v10.
 *
 * Renders candlesticks, line/area/OHLC bars, technical indicators and drawing
 * overlays against a {@link DataLoader}, with a light/dark style preset, a
 * convenience colour layer and the raw {@link Styles} tree, plus panes,
 * locale/timezone and every chart action. `@klinecharts/extension` overlays are
 * registered automatically.
 *
 * 对 `klinecharts` v10 的声明式 React 封装。
 *
 * 基于 {@link DataLoader} 渲染蜡烛、折线 / 面积 / OHLC 柱、技术指标与画线工具，提供明暗
 * 配色预设、便捷配色层与原始 {@link Styles} 树，并支持分面板、语言 / 时区与全部图表事件。
 * `@klinecharts/extension` 的画线工具会自动注册。
 *
 * Style, locale, timezone and behaviour changes are pushed through the
 * instance's setters, so a recolour never tears the chart down; only a change to
 * the *set* of indicators, overlays or panes rebuilds those objects.
 *
 * 样式、语言、时区与行为变更都通过实例 setter 增量下发，因此改色不会重建图表；只有指标、
 * 画线或面板的*组合*变化才会重建这些对象。
 */
function AdaChart(props: AdaChartProps) {
	const resolved = useMemo(() => resolveAdaChartProps(props), [props]);
	const data = useMemo(
		() => normalizeKLineData(resolved.data),
		[resolved.data],
	);

	/** Latest dataset, read synchronously by the {@link DataLoader} on `init`. */
	const dataRef = useRef<KLineData[]>(data);
	const pushQueue = useMemo(() => createFrameBarQueue(), []);
	// ponytail: distinct bars still recalc full history until klinecharts supports incremental indicators.
	/** Ids of indicators/overlays the reconcile effects currently own. */
	const indicatorIdsRef = useRef<string[]>([]);
	const overlayIdsRef = useRef<string[]>([]);
	/** Guards the mount-seeded load from being re-seeded as a "change". */
	const firstDataRunRef = useRef(true);
	/** The dataset the previous commit applied, so a change is decided, not guessed. */
	const prevDataRef = useRef<KLineData[]>([]);
	/** Latest props + resolved options, read by run-once effects and handlers. */
	const latestRef = useRef({ props, resolved });

	// Keep the render-scoped values mirrored into refs. These two effects run on
	// every commit — and, being declared before the mount effect, they also run
	// *before* it on the first commit, so the mount effect always reads fresh
	// values without itself depending on anything volatile.
	// 把渲染期的最新值镜像进这些 ref。两个 effect 每次提交都运行，且因声明在 mount effect
	// 之前，首次提交时也先于它执行，于是 mount effect 总能读到最新值，而自身无需依赖任何易变项。
	useEffect(() => {
		dataRef.current = resolved.dataLoader ? dataRef.current : data;
	});
	useEffect(() => {
		latestRef.current = { props, resolved };
	});

	// Create the chart exactly once; every later change goes through setters.
	// 图表只创建一次，后续所有变更都走 setter。
	const unsubscribeActionsRef = useRef<(() => void) | null>(null);
	const { setContainer, engine } = useEngineMount<Chart>({
		create: (container) => {
			ensureExtensionOverlays();
			ensureVolumeOverlay();

			const chart = init(
				container,
				buildInitOptions(latestRef.current.resolved),
			);
			if (!chart) return null;

			const external = latestRef.current.resolved.dataLoader;
			const memory = createMemoryDataLoader({
				getBars: () => dataRef.current,
				onSubscribe: pushQueue.setPush,
				onUnsubscribe: pushQueue.clear,
			});
			chart.setDataLoader(
				external
					? {
							getBars: (params) => external.getBars(params),
							subscribeBar: (params) => {
								pushQueue.setPush(params.callback);
								return external.subscribeBar?.({
									...params,
									callback: pushQueue.push,
								});
							},
							unsubscribeBar: (params) => {
								pushQueue.clear();
								return external.unsubscribeBar?.(params);
							},
						}
					: memory,
			);
			// symbol + period are what let the loader's init request fire at all.
			// symbol 与 period 是 loader 的 init 请求得以触发的前提。
			chart.setSymbol(resolveSymbolInfo(latestRef.current.resolved));
			chart.setPeriod(resolvePeriod(latestRef.current.resolved));

			// Every action handler dispatches through the ref, so subscriptions made
			// once at mount always see the latest callback.
			// 所有事件处理函数都经由该 ref 分发，因此挂载时建立的订阅始终拿到最新回调。
			const handlers = ACTION_KEYS.map((key) => {
				const type = ACTIONS[key];
				const handler: ActionCallback = (param) =>
					latestRef.current.props[key]?.(param);
				chart.subscribeAction(type, handler);
				return [type, handler] as const;
			});
			unsubscribeActionsRef.current = () => {
				for (const [type, handler] of handlers) {
					chart.unsubscribeAction(type, handler);
				}
			};

			latestRef.current.props.onChartReady?.(chart);
			return chart;
		},
		// `klinecharts` only listens to window resize; the observer on the wrapper is
		// what covers container-only growth (flex panes, Storybook panels).
		// `klinecharts` 只监听 window resize；覆盖仅容器尺寸变化（flex 面板、Storybook
		// 分栏）靠这层 ResizeObserver。
		resize: (chart) => chart.resize(),
		destroy: (chart) => {
			unsubscribeActionsRef.current?.();
			unsubscribeActionsRef.current = null;
			indicatorIdsRef.current = [];
			overlayIdsRef.current = [];
			pushQueue.clear();
			firstDataRunRef.current = true;
			prevDataRef.current = [];
			dispose(chart);
		},
	});

	// Non-structural options + behaviour, pushed after every render. Undefined
	// props fall through to the library's own defaults.
	// 非结构性选项与行为：每次渲染后下发。未定义的 prop 回退到库自身默认值。
	useEffect(() => {
		const chart = engine();
		if (!chart) return;
		chart.setStyles(buildStyles(resolved));
		if (resolved.locale) chart.setLocale(resolved.locale);
		if (resolved.timezone) chart.setTimezone(resolved.timezone);
		if (resolved.formatter) chart.setFormatter(resolved.formatter);
		if (resolved.thousandsSeparator) {
			chart.setThousandsSeparator(resolved.thousandsSeparator);
		}
		if (resolved.decimalFold) chart.setDecimalFold(resolved.decimalFold);
		if (resolved.zoomAnchor) chart.setZoomAnchor(resolved.zoomAnchor);
		if (resolved.hotkey) chart.setHotkey(resolved.hotkey);
		chart.setScrollEnabled(resolved.scrollEnabled);
		chart.setZoomEnabled(resolved.zoomEnabled);
		chart.setOffsetRightDistance(resolved.offsetRightDistance);
		if (resolved.barSpace !== undefined) chart.setBarSpace(resolved.barSpace);
		if (resolved.maxOffsetLeftDistance !== undefined) {
			chart.setMaxOffsetLeftDistance(resolved.maxOffsetLeftDistance);
		}
		if (resolved.maxOffsetRightDistance !== undefined) {
			chart.setMaxOffsetRightDistance(resolved.maxOffsetRightDistance);
		}
		if (resolved.leftMinVisibleBarCount !== undefined) {
			chart.setLeftMinVisibleBarCount(resolved.leftMinVisibleBarCount);
		}
		if (resolved.rightMinVisibleBarCount !== undefined) {
			chart.setRightMinVisibleBarCount(resolved.rightMinVisibleBarCount);
		}
	}, [resolved, engine]);

	// Symbol identity changes re-seed through the loader's init path.
	// 标的身份变化会经由 loader 的 init 路径重新灌入。
	const symbolKey = JSON.stringify(resolveSymbolInfo(resolved));
	useEffect(() => {
		engine()?.setSymbol(resolveSymbolInfo(latestRef.current.resolved));
	}, [symbolKey, engine]);

	const periodKey = JSON.stringify(resolvePeriod(resolved));
	useEffect(() => {
		engine()?.setPeriod(resolvePeriod(latestRef.current.resolved));
	}, [periodKey, engine]);

	// Data updates: a real change to the set reseeds through the loader; a changed
	// or newly arrived tail is pushed bar by bar.
	// 数据更新：数据集真的变了才经 loader 重灌；仅末段变化或新增则逐根推送。
	useEffect(() => {
		const chart = engine();
		if (!chart || resolved.dataLoader) return;
		const previous = prevDataRef.current;

		// The mount effect already seeded the loader's `init` with this dataset,
		// so the first run only records it rather than reseeding a second time.
		// mount effect 已用当前数据集灌过 loader 的 `init`，因此首次只记录、不重复灌入。
		if (firstDataRunRef.current) {
			firstDataRunRef.current = false;
			prevDataRef.current = data;
			return;
		}

		const patch = decideDataPatch(previous, data, sameKLineData);
		prevDataRef.current = data;
		if (patch.kind === "none") return;

		// `resetData` re-runs `getBars({type:"init"})`, which reads the latest set
		// through `dataRef`, so clearing to an empty array goes the same way.
		// `resetData` 会重跑 `getBars({type:"init"})`，而后者经 `dataRef` 读最新数据集，
		// 所以清空也走同一条路。
		if (patch.kind === "replace" || data.length === 0) {
			chart.resetData();
			return;
		}

		const touched = patch.kind === "append" ? patch.items : [patch.item];
		for (const bar of touched) pushQueue.push(bar);
	}, [data, resolved.dataLoader, engine, pushQueue]);

	// Indicators: reconciled whenever their structural signature changes. The
	// list itself is read through `latestRef`, so the effect depends only on the
	// derived key and rebuilds just when the set actually changes.
	// 指标：结构签名变化时重建。列表本身经 `latestRef` 读取，因此 effect 只依赖派生键，
	// 仅在组合真正变化时重建。
	const indicatorKey = structuralKey(resolved.indicators);
	useEffect(() => {
		const chart = engine();
		if (!chart) return;
		for (const id of indicatorIdsRef.current) {
			chart.removeIndicator({ id });
		}
		const created: string[] = [];
		for (const entry of latestRef.current.resolved.indicators) {
			if (typeof entry === "string") {
				const id = chart.createIndicator(entry, false);
				if (id) created.push(id);
				continue;
			}
			const { stack, ...create } = entry;
			// A stacked entry asks for the price pane by id — v10 will not share a
			// pane otherwise, and `isStack` only keeps the pane's existing
			// indicators. An explicit `paneId` on the entry still wins.
			// 叠加项按 id 指定价格面板 —— 否则 v10 不会共用面板，而 `isStack` 只保留该面板
			// 已有的指标。条目上显式给出的 `paneId` 依然优先。
			const stacked = stack ?? false;
			// The volume overlay is the one stacked study that must *not* share the
			// candles' axis; see {@link VOLUME_OVERLAY_Y_AXIS_ID}.
			// 成交量叠加是唯一一个不得与蜡烛共用坐标轴的叠加指标；见
			// {@link VOLUME_OVERLAY_Y_AXIS_ID}。
			const overlay = stacked && create.name === VOLUME_OVERLAY_INDICATOR;
			const id = chart.createIndicator(
				(stacked
					? {
							paneId: CANDLE_PANE_ID,
							...(overlay ? { yAxisId: VOLUME_OVERLAY_Y_AXIS_ID } : {}),
							...create,
						}
					: create) as IndicatorCreate,
				stacked,
			);
			if (id) created.push(id);
			// The band is applied after the indicator, never with it:
			// `overrideYAxis` returns early when the axis it names is not there yet,
			// and that axis is created along with the indicator above.
			// band 在指标之后装、绝不随它一起：`overrideYAxis` 在所指的轴尚不存在时会提前返回，
			// 而那条轴正是随上面的指标一同建立的。
			if (id && overlay) {
				chart.overrideYAxis({
					id: VOLUME_OVERLAY_Y_AXIS_ID,
					paneId: CANDLE_PANE_ID,
					needWidget: false,
					gap: { top: 0, bottom: 0 },
					createRange: volumeOverlayAxisRange,
				});
			}
		}
		indicatorIdsRef.current = created;
	}, [indicatorKey, engine]);

	// Panes: applied on top of whatever the indicators created.
	// 面板：叠加在指标所创建的面板之上。
	const paneKey = structuralKey(resolved.panes);
	useEffect(() => {
		const chart = engine();
		if (!chart) return;
		for (const pane of latestRef.current.resolved.panes) {
			chart.setPaneOptions(pane);
		}
	}, [paneKey, engine]);

	// Overlays: drawn tools, reconciled by structural signature.
	// 画线工具：按结构签名协调。
	const overlayKey = structuralKey(resolved.overlays);
	useEffect(() => {
		const chart = engine();
		if (!chart) return;
		for (const id of overlayIdsRef.current) {
			chart.removeOverlay({ id });
		}
		const created: string[] = [];
		for (const entry of latestRef.current.resolved.overlays) {
			const id = chart.createOverlay(entry);
			if (typeof id === "string") created.push(id);
			else if (Array.isArray(id)) {
				for (const one of id) if (one) created.push(one);
			}
		}
		overlayIdsRef.current = created;
	}, [overlayKey, engine]);

	return (
		<div
			ref={setContainer}
			style={{
				width: resolved.autoSize ? "100%" : resolved.width,
				height: resolved.height,
				position: "relative",
				background: resolved.backgroundColor,
			}}
		/>
	);
}

const AdaChartMemo = memo(AdaChart, areAdaChartPropsEqual);

/**
 * The memoized Wrapper, under both export forms: `AdaChart` entry files
 * default-export it so a consumer can pick either import style.
 *
 * 记忆化后的 Wrapper，两种导出形式都给：入口文件同时 default 导出，
 * 调用方两种 import 写法都能用。
 */
export { AdaChartMemo as AdaChart };
export default AdaChartMemo;
