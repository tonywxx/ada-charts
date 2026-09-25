import {
	dispose,
	init,
	type ActionCallback,
	type ActionType,
	type CandleType,
	type Chart,
	type DataLoader,
	type DeepPartial,
	type DecimalFold,
	type Formatter,
	type Hotkey,
	type IndicatorCreate,
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
import {
	KCHART_DEFAULTS,
	areKChartPropsEqual,
	buildInitOptions,
	buildStyles,
	createMemoryDataLoader,
	ensureExtensionOverlays,
	normalizeKLineData,
	resolveKChartProps,
	resolvePeriod,
	resolveSymbol,
	structuralKey,
} from "./k-chart-options";

/**
 * Flat colour / visibility knobs that `KChart` maps onto the nested
 * `klinecharts` {@link Styles} tree. They sit *below* the raw {@link KChartProps.styles}
 * prop in precedence, so anything expressible here is also reachable there.
 *
 * 把 `KChart` 上扁平的颜色 / 显隐开关映射到嵌套的 `klinecharts` {@link Styles} 树。
 * 它们的优先级 *低于* 原始的 {@link KChartProps.styles} 属性，因此这里能表达的一切都
 * 能在 `styles` 里表达。
 */
export interface KChartConvenienceStyleProps {
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
export interface KChartEventProps {
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

/** An indicator entry; `stack` overlays it onto a pane that already exists. 指标项；`stack` 将其叠加到已存在的面板上。 */
export type KChartIndicator = (IndicatorCreate | string) & { stack?: boolean };

/**
 * Everything `KChart` accepts. Each prop maps 1:1 onto a `klinecharts` v10
 * setting or instance method; the raw {@link KChartProps.styles},
 * {@link KChartProps.indicators}, {@link KChartProps.overlays} and
 * {@link KChartProps.onChartReady} props keep the whole library surface
 * reachable, so the wrapper never becomes the reason a feature is unavailable.
 *
 * `KChart` 接受的全部属性。每个属性都与 `klinecharts` v10 的某个配置或实例方法一一对应；
 * 原始的 {@link KChartProps.styles}、{@link KChartProps.indicators}、
 * {@link KChartProps.overlays} 与 {@link KChartProps.onChartReady} 让库的全部能力始终可达，
 * 封装层不会成为某个功能无法使用的原因。
 */
export interface KChartProps extends KChartConvenienceStyleProps, KChartEventProps {
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
	 * streaming). When present it wins over {@link KChartProps.data}.
	 *
	 * 进阶：提供自定义 {@link DataLoader}（历史翻页、WebSocket 流）。提供时优先于
	 * {@link KChartProps.data}。
	 */
	dataLoader?: DataLoader;
	/**
	 * Instrument identity: `ticker`, `pricePrecision`, `volumePrecision`.
	 * 标的信息：代码、价格精度、成交量精度。
	 */
	symbol?: Partial<SymbolInfo>;
	/**
	 * Bar period, e.g. `{ type: "minute", span: 5 }`. Also the seed for
	 * {@link KChartProps.symbolTicker} / `periodType` / `periodSpan` shortcuts.
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
	 * Colour preset merged *under* {@link KChartProps.styles}.
	 * 配色预设，优先级*低于* {@link KChartProps.styles}。
	 */
	theme?: "light" | "dark";
	/**
	 * The full `klinecharts` style tree — the primary styling lever. Deep-merged
	 * over the {@link KChartProps.theme} preset and the convenience props.
	 *
	 * 完整的 `klinecharts` 样式树 —— 主要的样式控制入口。在 {@link KChartProps.theme}
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
	indicators?: KChartIndicator[];
	/**
	 * Pane geometry (id, height, order, drag, state). Applied with
	 * `Chart.setPaneOptions`.
	 * 面板几何（id、高度、顺序、可拖拽、状态），通过 `Chart.setPaneOptions` 应用。
	 */
	panes?: Array<Partial<PaneOptions>>;
	/**
	 * Overlays (drawing tools) to instantiate. Names cover the built-in set and
	 * every `@klinecharts/extension` overlay (rect, gannBox, fibonacciSpiral, …),
	 * which `KChart` registers on mount.
	 *
	 * 要实例化的画线工具。名称涵盖内置集合与全部 `@klinecharts/extension` 工具
	 * （rect、gannBox、fibonacciSpiral 等），`KChart` 会在挂载时注册它们。
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

/** Keys of {@link KChartProps} that carry a default in {@link KCHART_DEFAULTS}. 在 {@link KCHART_DEFAULTS} 中带默认值的 {@link KChartProps} 键。 */
export type KChartResolvedProps = KChartProps & {
	[K in keyof typeof KCHART_DEFAULTS]-?: NonNullable<KChartProps[K]>;
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
} as const satisfies Record<keyof KChartEventProps, ActionType>;

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
function KChart(props: KChartProps) {
	const resolved = useMemo(() => resolveKChartProps(props), [props]);
	const data = useMemo(() => normalizeKLineData(resolved.data), [resolved.data]);

	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<Chart | null>(null);
	/** Latest dataset, read synchronously by the {@link DataLoader} on `init`. */
	const dataRef = useRef<KLineData[]>(data);
	/** The real-time push callback handed back by `subscribeBar`. */
	const pushRef = useRef<((bar: KLineData) => void) | null>(null);
	/** Ids of indicators/overlays the reconcile effects currently own. */
	const indicatorIdsRef = useRef<string[]>([]);
	const overlayIdsRef = useRef<string[]>([]);
	/** Guards the mount-seeded load from being re-seeded as a "change". */
	const firstDataRunRef = useRef(true);
	const prevDataSigRef = useRef<{ len: number; first: number | undefined }>({
		len: -1,
		first: undefined,
	});
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
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		ensureExtensionOverlays();

		const chart = init(container, buildInitOptions(latestRef.current.resolved));
		if (!chart) return;
		chartRef.current = chart;

		const external = latestRef.current.resolved.dataLoader;
		if (external) {
			chart.setDataLoader(external);
		} else {
			chart.setDataLoader(
				createMemoryDataLoader({
					getBars: () => dataRef.current,
					onSubscribe: (push) => {
						pushRef.current = push;
					},
					onUnsubscribe: () => {
						pushRef.current = null;
					},
				}),
			);
		}
		// symbol + period are what let the loader's init request fire at all.
		// symbol 与 period 是 loader 的 init 请求得以触发的前提。
		chart.setSymbol(resolveSymbol(latestRef.current.resolved));
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

		// `klinecharts` only listens to window resize; a ResizeObserver on the
		// wrapper also covers container-only growth (flex panes, Storybook).
		// `klinecharts` 只监听 window resize；给外层容器加 ResizeObserver 可覆盖仅容器
		// 尺寸变化的场景（flex 面板、Storybook）。
		const observer = new ResizeObserver(() => chart.resize());
		observer.observe(container);

		latestRef.current.props.onChartReady?.(chart);

		return () => {
			observer.disconnect();
			for (const [type, handler] of handlers) {
				chart.unsubscribeAction(type, handler);
			}
			indicatorIdsRef.current = [];
			overlayIdsRef.current = [];
			pushRef.current = null;
			firstDataRunRef.current = true;
			prevDataSigRef.current = { len: -1, first: undefined };
			dispose(container);
			chartRef.current = null;
		};
	}, []);

	// Non-structural options + behaviour, pushed after every render. Undefined
	// props fall through to the library's own defaults.
	// 非结构性选项与行为：每次渲染后下发。未定义的 prop 回退到库自身默认值。
	useEffect(() => {
		const chart = chartRef.current;
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
	}, [resolved]);

	// Symbol identity changes re-seed through the loader's init path.
	// 标的身份变化会经由 loader 的 init 路径重新灌入。
	const symbolKey = JSON.stringify(resolveSymbol(resolved));
	useEffect(() => {
		chartRef.current?.setSymbol(resolveSymbol(latestRef.current.resolved));
	}, [symbolKey]);

	const periodKey = JSON.stringify(resolvePeriod(resolved));
	useEffect(() => {
		chartRef.current?.setPeriod(resolvePeriod(latestRef.current.resolved));
	}, [periodKey]);

	// Data updates: a replaced series reseeds via the loader; an in-place last
	// bar (streaming) takes the cheaper `update` push.
	// 数据更新：整段替换时经 loader 重新灌入；仅末根变化（流式）走更轻量的 update 推送。
	useEffect(() => {
		const chart = chartRef.current;
		if (!chart || resolved.dataLoader) return;
		if (firstDataRunRef.current) {
			firstDataRunRef.current = false;
			prevDataSigRef.current = { len: data.length, first: data[0]?.timestamp };
			return;
		}
		const first = data[0]?.timestamp;
		const replaced =
			prevDataSigRef.current.len !== data.length ||
			prevDataSigRef.current.first !== first;
		prevDataSigRef.current = { len: data.length, first };
		if (replaced) {
			chart.resetData();
		} else if (pushRef.current && data.length > 0) {
			pushRef.current(data[data.length - 1]);
		}
	}, [data, resolved.dataLoader]);

	// Indicators: reconciled whenever their structural signature changes. The
	// list itself is read through `latestRef`, so the effect depends only on the
	// derived key and rebuilds just when the set actually changes.
	// 指标：结构签名变化时重建。列表本身经 `latestRef` 读取，因此 effect 只依赖派生键，
	// 仅在组合真正变化时重建。
	const indicatorKey = structuralKey(resolved.indicators);
	useEffect(() => {
		const chart = chartRef.current;
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
			const id = chart.createIndicator(create as IndicatorCreate, stack ?? false);
			if (id) created.push(id);
		}
		indicatorIdsRef.current = created;
	}, [indicatorKey]);

	// Panes: applied on top of whatever the indicators created.
	// 面板：叠加在指标所创建的面板之上。
	const paneKey = structuralKey(resolved.panes);
	useEffect(() => {
		const chart = chartRef.current;
		if (!chart) return;
		for (const pane of latestRef.current.resolved.panes) {
			chart.setPaneOptions(pane);
		}
	}, [paneKey]);

	// Overlays: drawn tools, reconciled by structural signature.
	// 画线工具：按结构签名协调。
	const overlayKey = structuralKey(resolved.overlays);
	useEffect(() => {
		const chart = chartRef.current;
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
	}, [overlayKey]);

	return (
		<div
			ref={containerRef}
			style={{
				width: resolved.autoSize ? "100%" : resolved.width,
				height: resolved.height,
				position: "relative",
				background: resolved.backgroundColor,
			}}
		/>
	);
}

export default memo(KChart, areKChartPropsEqual);
