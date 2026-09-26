import {
	createChart,
	createSeriesMarkers,
	createTextWatermark,
	HistogramSeries,
	LineSeries,
	type ChartOptions,
	type DeepPartial,
	type IChartApi,
	type IRange,
	type IPaneApi,
	type ISeriesApi,
	type ISeriesMarkersPluginApi,
	type ITextWatermarkPluginApi,
	type LogicalRange,
	type MouseEventParams,
	type SeriesType,
	type Time,
} from "lightweight-charts";
import { memo, useEffect, useMemo, useRef } from "react";
import { decideDataPatch } from "../../data-patch";
import { useEngineMount } from "../../engine-mount";
import {
	buildChartOptions,
	buildEmaSeriesOptions,
	buildMainSeriesOptions,
	buildPriceLineSpecs,
	buildVolumeSeriesOptions,
	calcEMA,
	createMainSeries,
	normalizeChartData,
	sameChartDataItem,
	toSeriesMarkers,
	toVolumeData,
	areTChartPropsEqual,
	resolveTChartProps,
	type TChartResolvedProps,
} from "./t-chart-options";

/**
 * Series kinds `TChart` can render.
 * `TChart` 支持渲染的系列类型。
	 */
export type TChartType =
	| "candlestick"
	| "line"
	| "area"
	| "bar"
	| "histogram"
	| "baseline";

/**
 * One chart data point.
 * 图表中的单个数据点。
 *
 * OHLC fields (`open`/`high`/`low`/`close`) drive candlestick and bar series and
 * the up/down colouring of the volume overlay; `value` drives line, area,
 * histogram and baseline. When both are present, `close` wins.
 *
 * OHLC 字段（`open`/`high`/`low`/`close`）用于蜡烛图、BAR 图以及成交量的涨跌着色；
 * `value` 用于折线、面积、柱状和基准线图表。两者同时存在时以 `close` 为准。
	 */
export interface TChartDataItem {
	/**
	 * X-axis position: a unix timestamp in seconds, or a `"yyyy-mm-dd"` business
	 * day string. Duplicate times overwrite the earlier item.
	 * X 轴位置：秒级 Unix 时间戳，或 `"yyyy-mm-dd"` 格式的交易日字符串。重复时间会覆盖前一条。
	 */
	time: number | string;
	/** Open price. 开盘价。 */
	open?: number;
	/** High price. 最高价。 */
	high?: number;
	/** Low price. 最低价。 */
	low?: number;
	/** Close price. 收盘价。 */
	close?: number;
	/** Scalar value used by single-value series. 单值系列使用的数值。 */
	value?: number;
	/** Volume, consumed only by the volume overlay. 成交量，仅供成交量副图使用。 */
	volume?: number;
}

/**
 * A flag marker pinned to the main series.
 * 固定在主系列上的标记（箭头 / 圆点 / 文字）。
	 */
export interface TChartMarker {
	/**
	 * Marker time; must match a time already present in `data`.
	 * 标记时间，必须与 `data` 中已存在的时间一致。
	 */
	time: number | string;
	/**
	 * Anchor: `inBar`/`aboveBar`/`belowBar` position the marker relative to the
	 * bar, `price` pins it at an exact price level.
	 * 锚点位置：`inBar`/`aboveBar`/`belowBar` 相对 K 线定位，`price` 按价格定位。
	 */
	position: "inBar" | "aboveBar" | "belowBar" | "price";
	/** Marker colour. 标记颜色。 */
	color: string;
	/** Shape, or `""` for a text-only label. 形状，空字符串表示纯文字标签。 */
	shape: "arrowUp" | "arrowDown" | "circle" | "square" | "";
	/** Optional label. 可选文案。 */
	text?: string;
	/** Price level, required when `position` is `"price"`. 当 `position` 为 `"price"` 时必填。 */
	price?: number;
	/** Size multiplier. 大小倍数。 */
	size?: number;
	/** Stable identifier surfaced to hit-test results. 用于命中测试的稳定标识。 */
	id?: string;
}

/**
 * Everything `TChart` accepts.
 * `TChart` 接受的全部属性。
 *
 * Each prop maps 1:1 onto a `lightweight-charts` v5 setting. The `*Override`
 * props carry the remaining function-valued and exotic options verbatim, so the
 * wrapper never becomes the reason a feature is unreachable.
 *
 * 每个属性都与 `lightweight-charts` v5 的配置一一对应。其余函数型与冷门配置由
 * `*Override` 属性原样透传，封装层不会成为某个功能无法使用的原因。
	 */
export interface TChartProps {
	// ------------------------------------------------------------------ data
	/**
	 * Data points. Order is free: they are de-duplicated by `time` and sorted
	 * ascending before rendering.
	 * 数据点，顺序不限：渲染前会按 `time` 去重并升序排序。
	 *
	 */
	data?: TChartDataItem[];
	/**
	 * Series kind to render.
	 * 渲染的系列类型。
	 *
	 */
	chartType?: TChartType;
	/**
	 * Flag markers drawn on the main series.
	 * 绘制在主系列上的标记。
	 */
	markers?: TChartMarker[];

	// ---------------------------------------------------------------- sizing
	/**
	 * Fixed chart width in pixels; ignored while `autoSize` is on.
	 * 图表固定宽度（像素）；`autoSize` 开启时忽略。
	 *
	 */
	width?: number;
	/**
	 * Chart height in pixels.
	 * 图表高度（像素）。
	 *
	 */
	height?: number;
	/**
	 * Track the container size instead of using `width`. Backed by the
	 * library's own auto-resize, so no external observer is required.
	 * 跟随容器尺寸自适应，而非使用固定的 `width`。由库内置的自适应能力实现，无需外部监听器。
	 *
	 */
	autoSize?: boolean;
	/**
	 * Compact mode: thinner lines, no EMA overlay, and no price-line titles.
	 * 精简模式：更细的线条、不显示 EMA、价格线不显示标题。
	 *
	 */
	isMiniChart?: boolean;

	// ---------------------------------------------------------------- layout
	/**
	 * Chart background colour.
	 * 图表背景色。
	 *
	 */
	backgroundColor?: string;
	/**
	 * Colour of every axis and legend label.
	 * 所有坐标轴与图例文字的颜色。
	 *
	 */
	textColor?: string;
	/**
	 * Base font size in pixels.
	 * 基础字号（像素）。
	 *
	 */
	fontSize?: number;
	/**
	 * CSS font family for every label.
	 * 所有标签使用的 CSS 字体。
	 *
	 */
	fontFamily?: string;
	/**
	 * Show the TradingView attribution logo.
	 * 是否显示 TradingView 品牌标识。
	 *
	 */
	attributionLogo?: boolean;
	/**
	 * Draw the hovered series above the others.
	 * 悬停时将该系列绘制到其他系列之上。
	 *
	 */
	hoveredSeriesOnTop?: boolean;
	/**
	 * Allow dragging pane separators to resize panes.
	 * 是否允许拖拽分隔条以调整分屏高度。
	 *
	 */
	panesEnableResize?: boolean;
	/**
	 * Pane separator colour.
	 * 分屏分隔条颜色。
	 *
	 */
	paneSeparatorColor?: string;
	/**
	 * Pane separator colour while hovered.
	 * 悬停状态下的分屏分隔条颜色。
	 */
	paneSeparatorHoverColor?: string;

	// ------------------------------------------------------------------ grid
	/** Show vertical grid lines. 是否显示纵向网格线。*/
	vertGridVisible?: boolean;
	/** Vertical grid line colour. 纵向网格线颜色。*/
	vertGridColor?: string;
	/**
	 * Vertical grid line dash style: `0` solid, `1` dotted, `2` dashed,
	 * `3` large dashed, `4` sparse dotted.
	 * 纵向网格线线型：0 实线、1 点线、2 虚线、3 长虚线、4 稀疏点线。
	 *
	 */
	vertGridStyle?: number;
	/** Show horizontal grid lines. 是否显示横向网格线。*/
	horzGridVisible?: boolean;
	/** Horizontal grid line colour. 横向网格线颜色。*/
	horzGridColor?: string;
	/** Horizontal grid line dash style, same codes as `vertGridStyle`. 横向网格线线型，取值同 `vertGridStyle`。*/
	horzGridStyle?: number;

	// ------------------------------------------------------------ time scale
	/**
	 * Show the time axis itself. Distinct from `timeVisible`,
	 * which only decides whether the axis prints clock time beside the date.
	 * 是否显示时间轴本身。与 `timeVisible` 不同：后者只控制轴上是否打印时分秒。
	 *
	 */
	timeScaleVisible?: boolean;
	/**
	 * Print hours and minutes on the time axis.
	 * 时间轴上是否显示时分。
	 *
	 */
	timeVisible?: boolean;
	/**
	 * Print seconds on the time axis; requires `timeVisible`.
	 * 时间轴上是否显示秒，需配合 `timeVisible`。
	 *
	 */
	timeSecondsVisible?: boolean;
	/** Show the time axis border. 是否显示时间轴边框。*/
	timeScaleBorderVisible?: boolean;
	/** Time axis border colour. 时间轴边框颜色。*/
	timeScaleBorderColor?: string;
	/**
	 * Empty bars reserved to the right of the last data point.
	 * 最后一个数据点右侧预留的空 K 线数量。
	 *
	 */
	timeScaleRightOffset?: number;
	/**
	 * Pixel width of a single bar, i.e. the zoom level. Left unset, the library
	 * picks a fitting value on the first render.
	 * 单根 K 线的像素宽度，即缩放级别。不设置时由库在首次渲染时自动选取。
	 */
	timeScaleBarSpacing?: number;
	/** Lower bound of `timeScaleBarSpacing` while zooming out. 缩小 `timeScaleBarSpacing` 时的下限。 */
	timeScaleMinBarSpacing?: number;
	/** Upper bound of `timeScaleBarSpacing` while zooming in. 放大 `timeScaleBarSpacing` 时的上限。 */
	timeScaleMaxBarSpacing?: number;
	/**
	 * Pin the left edge so the series cannot scroll past the first bar.
	 * 固定左边缘，series 不能向左滚出首根 K 线。
	 *
	 */
	timeScaleFixLeftEdge?: boolean;
	/**
	 * Pin the right edge so the newest bar stays put.
	 * 固定右边缘，最新 K 线位置不变。
	 *
	 */
	timeScaleFixRightEdge?: boolean;
	/**
	 * Keep the visible range unchanged when the chart is resized.
	 * 图表尺寸变化时保持可见区间不变。
	 *
	 */
	timeScaleLockVisibleRangeOnResize?: boolean;
	/**
	 * Keep the same bar under the cursor while scrolling.
	 * 滚动时让同一根 K 线保持在光标下。
	 *
	 */
	timeScaleRightBarStaysOnScroll?: boolean;
	/**
	 * Draw tick marks even when the axis labels are hidden.
	 * 即使隐藏轴标签也绘制刻度线。
	 *
	 */
	timeScaleTicksVisible?: boolean;
	/**
	 * Space bars evenly, ignoring gaps in wall-clock time.
	 * 按索引等距分布，忽略真实时间间隔。
	 *
	 */
	timeScaleUniformDistribution?: boolean;
	/**
	 * Minimum time axis height in pixels.
	 * 时间轴最小高度（像素）。
	 *
	 */
	timeScaleMinimumHeight?: number;
	/**
	 * Bold the first tick label of a day, month or year.
	 * 是否对日/月/年的首个刻度标签加粗。
	 *
	 */
	timeScaleAllowBoldLabels?: boolean;
	/**
	 * Scroll forward when a new bar is appended.
	 * 追加新 K 线时是否自动滚动到最新位置。
	 *
	 */
	timeScaleShiftVisibleRangeOnNewBar?: boolean;
	/**
	 * Truncate tick labels longer than this many characters.
	 * 超过该字符数的刻度标签会被截断。
	 */
	timeScaleTickMarkMaxCharacterLength?: number;
	/**
	 * Skip whitespace bars when hit-testing.
	 * 命中测试时跳过空白 K 线。
	 *
	 */
	timeScaleIgnoreWhitespaceIndices?: boolean;
	/**
	 * Merge neighbouring bars at extreme zoom-out to stay readable.
	 * 极限缩小时合并相邻 K 线以保持可读性。
	 *
	 */
	timeScaleEnableConflation?: boolean;
	// ----------------------------------------------------------- price scale
	/**
	 * Fit the price axis to the visible data.
	 * 价格轴是否根据可见数据自动缩放。
	 *
	 */
	autoScale?: boolean;
	/**
	 * Price axis mode: `normal`, `logarithmic`, `percentage`, or `indexedTo100`.
	 * 价格轴模式：普通、对数、百分比或以 100 为基准的指数。
	 *
	 */
	priceScaleMode?: "normal" | "logarithmic" | "percentage" | "indexedTo100";
	/**
	 * Which side carries the price axis; `"none"` hides both.
	 * 价格轴所在侧；`"none"` 表示两侧都隐藏。
	 *
	 */
	priceScalePosition?: "left" | "right" | "none";
	/**
	 * Axis that receives series without an explicit price scale id.
	 * 未指定 priceScaleId 的系列所挂载的价格轴。
	 *
	 */
	defaultPriceScaleId?: "left" | "right";
	/** Show the price axis border. 是否显示价格轴边框。*/
	priceScaleBorderVisible?: boolean;
	/** Price axis border colour. 价格轴边框颜色。*/
	priceScaleBorderColor?: string;
	/**
	 * Price axis label colour, defaulting to `textColor`.
	 * 价格轴标签颜色，默认沿用 `textColor`。
	 */
	priceScaleTextColor?: string;
	/**
	 * Flip the axis so prices increase downwards.
	 * 反转价格轴方向（价格向下递增）。
	 *
	 */
	priceScaleInvert?: boolean;
	/**
	 * Keep axis labels vertically aligned.
	 * 保持轴标签垂直对齐。
	 *
	 */
	priceScaleAlignLabels?: boolean;
	/**
	 * Only draw axis labels that fit entirely inside the chart.
	 * 仅完整绘制放得下的轴标签。
	 *
	 */
	priceScaleEntireTextOnly?: boolean;
	/**
	 * Draw tick marks on the axis border.
	 * 在轴边框上绘制刻度线。
	 *
	 */
	priceScaleTicksVisible?: boolean;
	/**
	 * Minimum price axis width in pixels.
	 * 价格轴最小宽度（像素）。
	 *
	 */
	priceScaleMinimumWidth?: number;
	/**
	 * Padding above the price area, as a fraction of the chart height.
	 * 价格区域顶部留白，按图表高度比例计算。
	 *
	 */
	priceScaleTopMargin?: number;
	/**
	 * Padding below the price area; leave room here for the volume overlay.
	 * 价格区域底部留白，需为成交量副图预留空间。
	 *
	 */
	priceScaleBottomMargin?: number;
	/**
	 * Keep an edge tick mark visible while auto-scaling.
	 * 自动缩放时保持边缘刻度可见。
	 *
	 */
	priceScaleEnsureEdgeTickMarks?: boolean;
	/**
	 * Desired price-label density for the available height.
	 * 期望的价格标签密度（越大标签越密）。
	 *
	 */
	priceScaleTickMarkDensity?: number;

	// -------------------------------------------------------------- crosshair
	/**
	 * Crosshair behaviour: `normal`, `magnet` (snaps onto bars), or `hidden`.
	 * 十字光标模式：普通、磁吸（吸附 K 线）或隐藏。
	 *
	 */
	crosshairMode?: "normal" | "magnet" | "hidden";
	/** Vertical crosshair colour. 纵向十字线颜色。*/
	crosshairVertColor?: string;
	/** Vertical crosshair width in pixels. 纵向十字线宽度（像素）。*/
	crosshairVertWidth?: number;
	/** Vertical crosshair dash style. 纵向十字线线型。*/
	crosshairVertStyle?: number;
	/** Show the vertical crosshair line. 是否显示纵向十字线。*/
	crosshairVertVisible?: boolean;
	/** Show the time label on the vertical line. 是否在纵线上显示时间标签。*/
	crosshairVertLabelVisible?: boolean;
	/** Background of the vertical line's time label. 纵线时间标签的背景色。*/
	crosshairVertLabelBackgroundColor?: string;
	/** Horizontal crosshair colour. 横向十字线颜色。*/
	crosshairHorzColor?: string;
	/** Horizontal crosshair width in pixels. 横向十字线宽度（像素）。*/
	crosshairHorzWidth?: number;
	/** Horizontal crosshair dash style. 横向十字线线型。*/
	crosshairHorzStyle?: number;
	/** Show the horizontal crosshair line. 是否显示横向十字线。*/
	crosshairHorzVisible?: boolean;
	/** Show the price label on the horizontal line. 是否在横线上显示价格标签。*/
	crosshairHorzLabelVisible?: boolean;
	/** Background of the horizontal line's price label. 横线价格标签的背景色。*/
	crosshairHorzLabelBackgroundColor?: string;
	/**
	 * Let the crosshair snap to bars belonging to hidden series too.
	 * 允许十字光标吸附到已隐藏系列所属的 K 线。
	 *
	 */
	crosshairSnapToHiddenSeries?: boolean;

	// ----------------------------------------------------------- interactions
	/**
	 * Enable mouse wheel / drag / touch scrolling, or configure each axis
	 * individually with an object.
	 * 是否启用滚轮 / 拖拽 / 触摸平移；传对象可逐项配置。
	 *
	 */
	handleScroll?:
		| boolean
		| {
				mouseWheel?: boolean;
				pressedMouseMove?: boolean;
				horzTouchDrag?: boolean;
				vertTouchDrag?: boolean;
		  };
	/**
	 * Enable wheel / pinch / axis-drag zooming, or configure each with an object.
	 * 是否启用滚轮 / 双指 / 拖拽坐标轴缩放；传对象可逐项配置。
	 *
	 */
	handleScale?:
		| boolean
		| {
				mouseWheel?: boolean;
				pinch?: boolean;
				axisPressedMouseMove?: boolean;
				axisDoubleClickReset?: boolean;
		  };
	/**
	 * Inertia scrolling for touch.
	 * 触摸滑动时的惯性滚动。
	 *
	 */
	kineticScrollTouch?: boolean;
	/**
	 * Inertia scrolling for the mouse.
	 * 鼠标拖拽时的惯性滚动。
	 *
	 */
	kineticScrollMouse?: boolean;
	/**
	 * Where the crosshair goes when the pointer leaves the chart in magnet mode.
	 * 磁吸模式下指针离开图表时十字光标的退出方式。
	 *
	 */
	trackingModeExitMode?: "onTouchEnd" | "onNextTap";

	// ----------------------------------------------------------- localisation
	/**
	 * BCP 47 locale used to format numbers and dates.
	 * 用于格式化数字与日期的 BCP 47 locale。
	 *
	 */
	locale?: string;
	/**
	 * `dayjs`-style pattern for date tick marks.
	 * 日期刻度使用的 `dayjs` 风格格式串。
	 *
	 */
	dateFormat?: string;

	// ---------------------------------------------------------- main series
	/**
	 * Series title shown next to the price axis and in the legend.
	 * 显示在价格轴旁及图例中的系列标题。
	 *
	 */
	title?: string;
	/**
	 * Draw the main series.
	 * 是否绘制主系列。
	 *
	 */
	seriesVisible?: boolean;
	/**
	 * Print the series' last value on the price axis.
	 * 是否在价格轴上显示系列的最新值。
	 *
	 */
	lastValueVisible?: boolean;
	/**
	 * Draw the horizontal line marking the last price.
	 * 是否绘制标记最新价的水平线。
	 *
	 */
	priceLineVisible?: boolean;
	/** Colour of the last-price line. 最新价线条颜色。*/
	priceLineColor?: string;
	/** Last-price line width in pixels. 最新价线宽度（像素）。*/
	priceLineWidth?: number;
	/** Last-price line dash style. 最新价线线型。*/
	priceLineStyle?: number;
	/**
	 * Which bar the last-price line follows: the newest bar overall, or the
	 * newest one inside the visible range.
	 * 最新价线跟随的基准：全部数据的最后一根，或可见区间的最后一根。
	 *
	 */
	priceLineSource?: "lastBar" | "lastVisibleBar";
	/**
	 * Draw the zero baseline.
	 * 是否绘制零基准线。
	 *
	 */
	baseLineVisible?: boolean;
	/** Zero baseline colour. 零基准线颜色。*/
	baseLineColor?: string;
	/** Zero baseline width in pixels. 零基准线宽度（像素）。*/
	baseLineWidth?: number;
	/** Zero baseline dash style. 零基准线线型。*/
	baseLineStyle?: number;

	// ----------------------------------------------------------- price format
	/**
	 * Number formatting on the price axis.
	 * 价格轴的数值格式化方式。
	 *
	 */
	priceFormatType?: "price" | "volume" | "percent";
	/**
	 * Decimal places. Inferred from the first data point when unset.
	 * 小数位数；未设置时由首个数据点推断。
	 */
	pricePrecision?: number;
	/**
	 * Smallest representable price step. Inferred alongside `pricePrecision`.
	 * 最小价格变动单位；与 `pricePrecision` 一样可自动推断。
	 */
	priceMinMove?: number;

	// ---------------------------------------------------- candlestick / bar
	/** Colour of rising candles. 上涨 K 线颜色。*/
	upColor?: string;
	/** Colour of falling candles. 下跌 K 线颜色。*/
	downColor?: string;
	/** Draw candle bodies' borders. 是否绘制 K 线实体边框。*/
	borderVisible?: boolean;
	/** Border colour of a rising candle. 上涨 K 线边框颜色。*/
	borderUpColor?: string;
	/** Border colour of a falling candle. 下跌 K 线边框颜色。*/
	borderDownColor?: string;
	/** Shared border colour, overriding the up/down pair. 统一边框颜色，优先级高于涨跌双色。 */
	borderColor?: string;
	/** Draw wicks at all. 是否绘制上下影线。*/
	wickVisible?: boolean;
	/** Wick colour of a rising candle. 上涨 K 线影线颜色。*/
	wickUpColor?: string;
	/** Wick colour of a falling candle. 下跌 K 线影线颜色。*/
	wickDownColor?: string;
	/** Shared wick colour, overriding the up/down pair. 统一影线颜色，优先级高于涨跌双色。 */
	wickColor?: string;
	/** Draw the bar series' open ticks. 是否绘制 BAR 图的开盘价刻度。*/
	openVisible?: boolean;
	/** Render bar series bodies as thin lines. BAR 图实体绘制为细线。*/
	thinBars?: boolean;

	// ----------------------------------------------- line / area / baseline
	/**
	 * Primary line colour, and the bar colour of the histogram series.
	 * 主折线颜色，同时用作柱状系列的颜色。
	 *
	 */
	lineColor?: string;
	/** Line width in pixels; forced to `1` in mini mode. 折线宽度（像素），精简模式下强制为 1。*/
	lineWidth?: number;
	/** Line dash style. 折线线型。*/
	lineStyle?: number;
	/**
	 * Interpolation: `0` simple, `1` with steps, `2` curved.
	 * 插值方式：0 折线、1 阶梯线、2 曲线。
	 *
	 */
	lineType?: number;
	/** Draw the line itself, leaving only the fill or markers. 是否绘制线条本身。*/
	lineVisible?: boolean;
	/**
	 * Draw a marker on every data point.
	 * 是否在每个数据点上绘制圆点。
	 *
	 */
	pointMarkersVisible?: boolean;
	/** Radius of the point markers in pixels. 数据点圆点半径（像素）。 */
	pointMarkersRadius?: number;
	/** Top of the area gradient. 面积渐变顶部颜色。*/
	topColor?: string;
	/** Bottom of the area gradient. 面积渐变底部颜色。*/
	bottomColor?: string;
	/**
	 * Anchor the area gradient to the data range instead of the viewport.
	 * 让面积渐变锚定到数据区间而非可视区。
	 *
	 */
	relativeGradient?: boolean;
	/**
	 * Mirror the area fill across the price-line axis.
	 * 上下翻转面积填充。
	 *
	 */
	invertFilledArea?: boolean;
	/**
	 * Price the baseline series draws its split at. Defaults to the dataset mean.
	 * baseline 系列基准线所在价格，缺省取数据均值。
	 */
	baselinePrice?: number;
	/** Histogram value treated as zero. 柱状系列视为零的基准值。*/
	histogramBase?: number;
	/**
	 * Animate the price line while new data streams in.
	 * 新数据流入时是否动画最新价线。
	 */
	lastPriceAnimationMode?: number;
	/** Show the crosshair marker on the line. 是否在十字光标处显示系列标记点。*/
	crosshairMarkerVisible?: boolean;
	/** Crosshair marker radius in pixels. 光标标记点半径（像素）。*/
	crosshairMarkerRadius?: number;
	/** Crosshair marker border colour. 光标标记点边框颜色。 */
	crosshairMarkerBorderColor?: string;
	/** Crosshair marker border width in pixels. 光标标记点边框宽度（像素）。 */
	crosshairMarkerBorderWidth?: number;
	/** Crosshair marker fill colour. 光标标记点填充颜色。 */
	crosshairMarkerBackgroundColor?: string;
	// ---------------------------------------------------------------- volume
	/**
	 * Add the volume histogram as an overlay at the bottom of the chart.
	 * 在图表底部叠加成交量柱状图。
	 *
	 */
	showVolume?: boolean;
	/**
	 * Print the last volume value on its own price axis.
	 * 是否在成交量价格轴上显示最新成交量数值。
	 *
	 */
	showVolumeLabel?: boolean;
	/**
	 * Colour of the volume bar when the candle rose.
	 * 上涨 K 线对应的成交量柱颜色。
	 *
	 */
	volumeUpColor?: string;
	/**
	 * Colour of the volume bar when the candle fell.
	 * 下跌 K 线对应的成交量柱颜色。
	 *
	 */
	volumeDownColor?: string;
	/**
	 * Price scale the volume series is attached to. Keep it distinct from the
	 * main series so the two never fight over the axis range.
	 * 成交量系列所挂载的价格轴。应与主系列分开，避免两者互相抢占轴范围。
	 *
	 */
	volumePriceScaleId?: string;
	/**
	 * Where the volume overlay starts, as a fraction of the chart height.
	 * 成交量副图起始位置，按图表高度比例计算。
	 *
	 */
	volumeTopMargin?: number;
	/**
	 * Label prefixed to the volume values.
	 * 成交量数值前显示的标签。
	 */
	volumeTitle?: string;

	// ------------------------------------------------------------------- ema
	/**
	 * Overlay two EMA lines. Candlestick only, and hidden in mini mode.
	 * 叠加两条 EMA 线。仅蜡烛图生效，精简模式下不显示。
	 *
	 */
	showEma?: boolean;
	/** Period of the first EMA line. 第一条 EMA 的周期。*/
	emaPeriod1?: number;
	/** Period of the second EMA line. 第二条 EMA 的周期。*/
	emaPeriod2?: number;
	/** Colour of the first EMA line. 第一条 EMA 颜色。*/
	emaColor1?: string;
	/** Colour of the second EMA line. 第二条 EMA 颜色。*/
	emaColor2?: string;
	/** Width of both EMA lines in pixels. 两条 EMA 线宽度（像素）。*/
	emaLineWidth?: number;
	/**
	 * Print the EMA values on the price axis.
	 * 是否在价格轴上显示 EMA 数值。
	 *
	 */
	emaLastValueVisible?: boolean;

	// ------------------------------------------------------- reference lines
	/** Draw a line at the highest price in view. 是否绘制可见最高价参考线。*/
	showHighPriceLine?: boolean;
	/** Highest-price line colour. 最高价线颜色。*/
	highPriceLineColor?: string;
	/** Highest-price line dash style. 最高价线线型。*/
	highPriceLineStyle?: number;
	/** Draw a line at the lowest price in view. 是否绘制可见最低价参考线。*/
	showLowPriceLine?: boolean;
	/** Lowest-price line colour. 最低价线颜色。*/
	lowPriceLineColor?: string;
	/** Lowest-price line dash style. 最低价线线型。*/
	lowPriceLineStyle?: number;
	/** Draw a line at the mean price. 是否绘制均价参考线。*/
	showAvgPriceLine?: boolean;
	/** Mean-price line colour. 均价线颜色。*/
	avgPriceLineColor?: string;
	/** Mean-price line dash style. 均价线线型。*/
	avgPriceLineStyle?: number;
	/**
	 * Print each reference line's value on the price axis.
	 * 是否在价格轴上显示各参考线的数值标签。
	 *
	 */
	priceLineAxisLabelVisible?: boolean;

	// --------------------------------------------------------------- overlay
	/**
	 * Draw the watermark. `lightweight-charts` v5 dropped the built-in
	 * `watermark` chart option, so this is backed by the text-watermark pane
	 * primitive.
	 * 是否绘制水印。`lightweight-charts` v5 移除了内置的 `watermark` 图表选项，
	 * 此处改由文本水印 pane primitive 实现。
	 *
	 */
	watermarkVisible?: boolean;
	/**
	 * Watermark text. Every `\n` starts a new line.
	 * 水印文本，其中的 `\n` 会换行。
	 *
	 */
	watermarkText?: string;
	/** Watermark colour. 水印颜色。*/
	watermarkColor?: string;
	/** Watermark font size in pixels. 水印字号（像素）。*/
	watermarkFontSize?: number;
	/** Horizontal alignment inside the pane. 水印在面板内的水平对齐方式。*/
	watermarkHorzAlign?: "left" | "center" | "right";
	/** Vertical alignment inside the pane. 水印在面板内的垂直对齐方式。*/
	watermarkVertAlign?: "top" | "center" | "bottom";
	/** CSS font style, e.g. `"bold italic"`. CSS 字体样式，例如 `"bold italic"`。*/
	watermarkFontStyle?: string;

	// ---------------------------------------------------------------- events
	/**
	 * Single click inside the chart.
	 * 图表内单击。
	 */
	onClick?: (param: MouseEventParams) => void;
	/**
	 * Double click inside the chart.
	 * 图表内双击。
	 */
	onDoubleClick?: (param: MouseEventParams) => void;
	/**
	 * Crosshair movement; receives the hovered series and their data.
	 * 十字光标移动，回调参数包含悬停到的系列及其数据。
	 */
	onCrosshairMove?: (param: MouseEventParams) => void;
	/**
	 * The visible time range changed, by user interaction or programmatically.
	 * 可见时间范围变化（用户操作或代码调用）。
	 */
	onVisibleRangeChange?: (range: IRange<Time> | null) => void;
	/**
	 * The visible logical (bar-index) range changed.
	 * 可见逻辑区间（按 K 线索引）变化。
	 */
	onVisibleLogicalRangeChange?: (range: LogicalRange | null) => void;
	/**
	 * The chart was resized.
	 * 图表尺寸变化。
	 */
	onSizeChange?: () => void;
	/**
	 * Receives the created chart together with its main series, for imperative
	 * control. Called again whenever `chartType` rebuilds the series, so the
	 * handle never points at a removed one.
	 *
	 * 回调创建出的图表及其主系列，用于命令式控制。`chartType` 重建系列时会再次调用，
	 * 因此交出去的引用不会指向已被移除的那个。
	 */
	onChartReady?: (chart: IChartApi, mainSeries: ISeriesApi<SeriesType>) => void;

	// ------------------------------------------------------ escape hatches
	/**
	 * Raw chart options merged last, so any setting not surfaced as a prop —
	 * `layout.colorSpace`, `timeScale.tickMarkFormatter`, … — stays reachable.
	 * 最后合并的原始图表配置，使未封装为 prop 的设置（如 `layout.colorSpace`、
	 * `timeScale.tickMarkFormatter`）依然可用。
	 */
	chartOptionsOverride?: DeepPartial<ChartOptions>;
	/**
	 * Raw time-scale options merged over the time axis built from props.
	 * 叠加到由 props 构建的时间轴配置之上的原始配置。
	 */
	timeScaleOptionsOverride?: DeepPartial<ChartOptions["timeScale"]>;
	/**
	 * Raw price-scale options merged over both visible price axes.
	 * 叠加到两条可见价格轴之上的原始配置。
	 */
	priceScaleOptionsOverride?: DeepPartial<ChartOptions["rightPriceScale"]>;
	/**
	 * Raw options for overlay price scales such as the volume axis.
	 * 覆盖型价格轴（如成交量轴）的原始配置。
	 */
	overlayPriceScaleOptionsOverride?: DeepPartial<ChartOptions["overlayPriceScales"]>;
	/**
	 * Raw crosshair options merged over the ones built from props.
	 * 叠加到由 props 构建的十字光标配置之上的原始配置。
	 */
	crosshairOptionsOverride?: DeepPartial<ChartOptions["crosshair"]>;
	/**
	 * Raw localisation options merged over `locale` and `dateFormat`.
	 * 叠加到 `locale` 与 `dateFormat` 之上的原始本地化配置。
	 */
	localizationOptionsOverride?: DeepPartial<ChartOptions["localization"]>;
	/**
	 * Raw main-series options merged last, overriding the derived ones.
	 * 最后合并的原始主系列配置，优先级高于推导出的值。
	 */
	seriesOptionsOverride?: Record<string, unknown>;
}

/**
 * A declarative React wrapper over TradingView's `lightweight-charts` v5.
 *
 * Renders candlestick, line, area, bar, histogram and baseline charts, with an
 * optional volume overlay, EMA overlay, reference lines, watermark and markers.
 *
 * 对 TradingView `lightweight-charts` v5 的声明式 React 封装。
 *
 * 支持蜡烛图、折线图、面积图、BAR 图、柱状图与基准线图，并可选叠加成交量副图、
 * EMA 均线、参考线、水印与标记。
 *
 * Style changes are pushed through `applyOptions`, and only a change of
 * `chartType` or of the overlay switches rebuilds the series objects, so a
 * recolour never re-creates the chart.
 *
 * 样式变更通过 `applyOptions` 增量下发，只有 `chartType` 或叠加层开关变化才会重建
 * 系列对象，因此改色不会重建整个图表。
	 */
function TChart(props: TChartProps) {
	const resolved = useMemo(() => resolveTChartProps(props), [props]);
	const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
	const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
	const ema1Ref = useRef<ISeriesApi<"Line"> | null>(null);
	const ema2Ref = useRef<ISeriesApi<"Line"> | null>(null);
	const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
	const watermarkRef = useRef<ITextWatermarkPluginApi<Time> | null>(null);
	const fitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const data = useMemo(() => normalizeChartData(resolved.data), [resolved.data]);
	/** Latest normalised data, read by the structural effect when it rebuilds series. */
	const dataRef = useRef<TChartDataItem[]>(data);
	/** The dataset the data effect last applied, to recognise a single append. */
	const prevDataRef = useRef<TChartDataItem[]>([]);
	/**
	 * Latest props and resolved options, read by the effects that must run once
	 * rather than whenever a value changes.
	 *
	 * 最新的 props 与已解析配置，供那些只需执行一次、而不该随取值变化反复执行的
	 * effect 读取。
	 */
	const latestRef = useRef({ props, resolved });

	useEffect(() => {
		dataRef.current = data;
	});

	useEffect(() => {
		latestRef.current = { props, resolved };
	});

	// Create the chart exactly once; every later change goes through applyOptions.
	// 图表只创建一次，后续所有变更都走 applyOptions。
	const subscriptionRef = useRef<(() => void) | null>(null);
	const { setContainer, engine } = useEngineMount<IChartApi>({
		create: (container) => {
			const chart = createChart(
				container,
				buildChartOptions(latestRef.current.resolved),
			);

			const timeScale = chart.timeScale();
			// Every handler dispatches through the ref, so a subscription made once at
			// mount always sees the callback the caller passed most recently.
			// 所有处理函数都经由该 ref 分发，因此挂载时建立的订阅始终能拿到调用方
			// 最新传入的回调。
			const emitRange = () =>
				latestRef.current.props.onVisibleRangeChange?.(
					timeScale.getVisibleRange(),
				);
			const emitLogical = (range: LogicalRange | null) =>
				latestRef.current.props.onVisibleLogicalRangeChange?.(range);
			const emitSize = () => latestRef.current.props.onSizeChange?.();
			const handleClick = (param: MouseEventParams) =>
				latestRef.current.props.onClick?.(param);
			const handleDblClick = (param: MouseEventParams) =>
				latestRef.current.props.onDoubleClick?.(param);
			const handleCrosshair = (param: MouseEventParams) =>
				latestRef.current.props.onCrosshairMove?.(param);

			chart.subscribeClick(handleClick);
			chart.subscribeDblClick(handleDblClick);
			chart.subscribeCrosshairMove(handleCrosshair);
			timeScale.subscribeVisibleTimeRangeChange(emitRange);
			timeScale.subscribeVisibleLogicalRangeChange(emitLogical);
			timeScale.subscribeSizeChange(emitSize);

			subscriptionRef.current = () => {
				chart.unsubscribeClick(handleClick);
				chart.unsubscribeDblClick(handleDblClick);
				chart.unsubscribeCrosshairMove(handleCrosshair);
				timeScale.unsubscribeVisibleTimeRangeChange(emitRange);
				timeScale.unsubscribeVisibleLogicalRangeChange(emitLogical);
				timeScale.unsubscribeSizeChange(emitSize);
				if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
			};
			return chart;
		},
		// No `resize`: lightweight-charts sizes the canvas itself through `autoSize`,
		// and a second opinion here would contend with it.
		// 不传 `resize`：canvas 尺寸由 lightweight-charts 的 `autoSize` 自己负责，
		// 这里再多嘴只会跟它抢。
		destroy: (chart) => {
			subscriptionRef.current?.();
			subscriptionRef.current = null;
			markersRef.current = null;
			watermarkRef.current = null;
			seriesRef.current = null;
			volumeRef.current = null;
			ema1Ref.current = null;
			ema2Ref.current = null;
			chart.remove();
		},
	});

	// Chart-level options.
	// 图表级选项。
	useEffect(() => {
		engine()?.applyOptions(buildChartOptions(resolved));
	}, [resolved, engine]);

	// Series objects: rebuilt only when the kind of series or the set of
	// overlays actually changes.
	// 系列对象：仅在系列类型或叠加层组合真正变化时重建。
	useEffect(() => {
		const chart = engine();
		if (!chart) return;

		const { resolved: options } = latestRef.current;
		const data = dataRef.current;
		const series = createMainSeries(chart, options, data);
		seriesRef.current = series;
		if (data.length > 0) {
			series.setData(data as never);
		}

		let volume: ISeriesApi<"Histogram"> | null = null;
		if (resolved.showVolume) {
			volume = chart.addSeries(
				HistogramSeries,
				buildVolumeSeriesOptions(options) as never,
			);
			volumeRef.current = volume;
			chart.priceScale(options.volumePriceScaleId).applyOptions({
				scaleMargins: {
					top: options.volumeTopMargin,
					bottom: 0,
				},
			});
			if (data.length > 0)
				volume.setData(
					data.map((item) => toVolumeData(item, options)),
				);
		}

		const showEma = shouldShowEma(options);
		let ema1: ISeriesApi<"Line"> | null = null;
		let ema2: ISeriesApi<"Line"> | null = null;
		if (showEma) {
			ema1 = chart.addSeries(
				LineSeries,
				buildEmaSeriesOptions(options, options.emaPeriod1, options.emaColor1) as never,
			);
			ema2 = chart.addSeries(
				LineSeries,
				buildEmaSeriesOptions(options, options.emaPeriod2, options.emaColor2) as never,
			);
			ema1Ref.current = ema1;
			ema2Ref.current = ema2;
			ema1.setData(calcEMA(data, options.emaPeriod1) as never);
			ema2.setData(calcEMA(data, options.emaPeriod2) as never);
		}

		// The handle carries the series as well as the chart, because a caller
		// attaching to the chart has to attach to whichever main series is live now.
		// 交出的句柄连系列一起交出：挂在图表上的调用方，实际要挂在当时活着的那个主系列上。
		latestRef.current.props.onChartReady?.(chart, series);

		return () => {
			// The handles are dropped first, ahead of the liveness test below, because
			// the effects that watch them take "the ref no longer names my object" as
			// their own liveness criterion. On unmount this cleanup returns early, and
			// leaving the handles behind made that criterion quietly untrue — so the
			// cleanups declared after this one went on reaching into a removed series.
			// Either way the handles name objects that are already gone.
			// 先丢句柄、再判活：盯着它们的 effect 是以「ref 不再是我的那个对象」作为自己的存活
			// 判据。卸载时本 cleanup 会提前返回，把句柄留着会静默地让那条判据失效 —— 于是声明在
			// 本 effect 之后的 cleanup 继续往已移除的 series 里伸手。无论如何，这些句柄指向的
			// 对象都已不存在。
			seriesRef.current = null;
			volumeRef.current = null;
			ema1Ref.current = null;
			ema2Ref.current = null;
			markersRef.current = null;

			// This effect is declared after the mount, so on unmount the chart is
			// already gone and its series with it. Removing them again is the
			// `Value is undefined` failure the story suite was hitting.
			// 本 effect 声明在挂载之后，因此卸载时图表连同系列早已被拆除；
			// 再去 remove 就是 story 套件里那批 `Value is undefined`。
			if (engine() !== chart) return;
			if (ema1) chart.removeSeries(ema1);
			if (ema2) chart.removeSeries(ema2);
			if (volume) chart.removeSeries(volume);
			chart.removeSeries(series);
		};
	}, [
		resolved.chartType,
		resolved.showVolume,
		resolved.showEma,
		resolved.isMiniChart,
		resolved.volumePriceScaleId,
		resolved.volumeTopMargin,
		resolved.emaPeriod1,
		resolved.emaPeriod2,
		engine,
	]);
	// Style and option changes are pushed through applyOptions after every
	// render. The library diffs them internally, so this is a no-op when nothing
	// changed — and it removes the whole class of "forgot a prop in the deps
	// array" bugs that a ~60-entry dependency list invites.
	// 样式与选项变更在每次渲染后通过 applyOptions 下发。库内部会做差异比较，
	// 无变化时即为空操作 —— 这也消除了六十多项依赖数组必然出现的
	// “漏写某个 prop 到 deps” 一类缺陷。
	useEffect(() => {
		const chart = engine();
		if (!chart) return;
		chart.applyOptions(buildChartOptions(resolved));

		const series = seriesRef.current;
		if (series) {
			series.applyOptions(
				buildMainSeriesOptions(resolved, dataRef.current) as never,
			);
		}
		volumeRef.current?.applyOptions(buildVolumeSeriesOptions(resolved) as never);
		ema1Ref.current?.applyOptions(
			buildEmaSeriesOptions(resolved, resolved.emaPeriod1, resolved.emaColor1) as never,
		);
		ema2Ref.current?.applyOptions(
			buildEmaSeriesOptions(resolved, resolved.emaPeriod2, resolved.emaColor2) as never,
		);
		if (resolved.showVolume) {
			chart.priceScale(resolved.volumePriceScaleId).applyOptions({
				scaleMargins: { top: resolved.volumeTopMargin, bottom: 0 },
			});
		}
	});

	// Data. Appended points take the incremental `update` path; anything else
	// (including a chart rebuild) reseeds with `setData`.
	// 数据更新。仅追加新点时走增量的 `update` 路径，其余情况（含系列重建）用
	// `setData` 重新灌入。
	useEffect(() => {
		const series = seriesRef.current;
		const previous = prevDataRef.current;
		prevDataRef.current = data;
		if (!series) return;

		const { resolved } = latestRef.current;
		const patch = decideDataPatch(previous, data, sameChartDataItem);

		// Equal content in a new array is not a change: this is what keeps a style
		// tweak from replaying the whole series.
		// 内容相等、只是数组换了，不算变化：正是这一点让改样式不会重播整个系列。
		if (patch.kind === "none") return;

		if (data.length === 0) {
			series.setData([] as never);
			volumeRef.current?.setData([]);
			ema1Ref.current?.setData([]);
			ema2Ref.current?.setData([]);
			return;
		}

		if (patch.kind === "append" || patch.kind === "update") {
			const touched = patch.kind === "append" ? patch.items : [patch.item];
			for (const item of touched) {
				series.update(item as never);
				volumeRef.current?.update(toVolumeData(item, resolved));
			}
			// The EMA is recursive, so the newest `touched.length` points move with
			// it. Recompute once over the whole set, then push just that tail.
			// EMA 是递推的：末尾同样数量的点会一起变化。整体重算一次，只推尾段。
			const pushEmaTail = (
				ema: typeof ema1Ref.current,
				period: number,
			) => {
				if (!ema) return;
				for (const point of calcEMA(data, period).slice(-touched.length)) {
					ema.update(point as never);
				}
			};
			pushEmaTail(ema1Ref.current, resolved.emaPeriod1);
			pushEmaTail(ema2Ref.current, resolved.emaPeriod2);
		} else {
			series.setData(data as never);
			volumeRef.current?.setData(data.map((item) => toVolumeData(item, resolved)));
			ema1Ref.current?.setData(calcEMA(data, resolved.emaPeriod1) as never);
			ema2Ref.current?.setData(calcEMA(data, resolved.emaPeriod2) as never);
		}

		// Coalesce the viewport adjustment: data can arrive many times per second
		// while streaming, and each refit would fight the user's own panning.
		// 合并视口调整：流式行情下数据可能每秒到达多次，每次都重新适配会与用户
		// 自己的拖拽互相冲突。
		if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
		fitTimerRef.current = setTimeout(() => {
			fitTimerRef.current = null;
			const chart = engine();
			if (chart) fitToRange(chart, data.length, resolved.timeScaleRightOffset);
		}, 200);
	}, [data, engine]);

	// Reference lines, rebuilt whenever the dataset or their styling changes.
	// 参考线：数据集或其样式变化时重建。
	useEffect(() => {
		const series = seriesRef.current;
		if (!series) return;
		const created = buildPriceLineSpecs(
			latestRef.current.resolved,
			dataRef.current,
		).map((spec) => series.createPriceLine(spec));
		return () => {
			// Price lines belong to this series, so the series is the criterion: once
			// the ref no longer names it, the series — and the lines with it — are
			// already gone. Reaching in regardless is not harmless: a removed series
			// still accepts `removePriceLine` and invalidates the destroyed chart
			// widget, which schedules a paint against disposed canvases and surfaces
			// as an unhandled `Object is disposed` long after the test ended.
			// 参考线属于这个系列，所以判据是系列本身：ref 不再指向它，就说明系列连同参考线都已
			// 拆除。硬伸手并不无害：已被移除的 series 仍会接受 `removePriceLine`，并让已销毁的
			// chart widget 失效、排出一次打在已释放 canvas 上的绘制，表现为测试早已结束后才
			// 冒出来的未捕获 `Object is disposed`。
			if (seriesRef.current !== series) return;
			for (const line of created) {
				try {
					series.removePriceLine(line);
				} catch {
					// The series was rebuilt alongside them, so the lines are gone already.
					// 系列已与其一并重建，参考线自然随之消失。
				}
			}
		};
	}, [
		resolved.data,
		resolved.chartType,
		resolved.isMiniChart,
		resolved.showHighPriceLine,
		resolved.highPriceLineColor,
		resolved.highPriceLineStyle,
		resolved.showLowPriceLine,
		resolved.lowPriceLineColor,
		resolved.lowPriceLineStyle,
		resolved.showAvgPriceLine,
		resolved.avgPriceLineColor,
		resolved.avgPriceLineStyle,
		resolved.priceLineAxisLabelVisible,
	]);

	// Markers hang off the main series, so they are rebuilt together with it.
	// 标记依附于主系列，因此随系列一并重建。
	useEffect(() => {
		const series = seriesRef.current;
		if (!series) return;
		const mapped = toSeriesMarkers(resolved.markers);
		if (mapped.length === 0) return;
		const plugin = createSeriesMarkers(series, mapped);
		markersRef.current = plugin;
		return () => {
			// The markers plugin belongs to this series: once the series is gone the
			// plugin went with it, and detaching it again would reach into a removed
			// series. The series, not the chart, is what this plugin is attached to.
			// 标记插件挂在series上：series 被拆除时插件随之消失，再 detach 就是往已移除的
			// series 里伸手。这里的存活判据是 series，不是 chart。
			if (seriesRef.current !== series) return;
			plugin.detach();
			markersRef.current = null;
		};
	}, [resolved.markers, resolved.chartType]);

	// `lightweight-charts` v5 dropped the built-in `watermark` chart option, so
	// the watermark is attached as a pane primitive.
	// `lightweight-charts` v5 移除了内置的 `watermark` 图表选项，
	// 因此水印改为以 pane primitive 的形式挂载。
	useEffect(() => {
		const chart = engine();
		if (!chart) return;
		const text = resolved.watermarkText.trim();
		if (!resolved.watermarkVisible || text === "") return;

		const pane = chart.panes()[0];
		if (!pane) return;
		const plugin = createTextWatermark(pane as IPaneApi<Time>, {
			visible: true,
			horzAlign: resolved.watermarkHorzAlign,
			vertAlign: resolved.watermarkVertAlign,
			lines: text.split("\n").map((line) => ({
				text: line,
				color: resolved.watermarkColor,
				fontSize: resolved.watermarkFontSize,
				fontFamily: resolved.fontFamily,
				fontStyle: resolved.watermarkFontStyle,
			})),
		});
		watermarkRef.current = plugin;
		return () => {
			if (engine() !== chart) return;
			plugin.detach();
			watermarkRef.current = null;
		};
	}, [
		resolved.watermarkVisible,
		resolved.watermarkText,
		resolved.watermarkColor,
		resolved.watermarkFontSize,
		resolved.watermarkHorzAlign,
		resolved.watermarkVertAlign,
		resolved.watermarkFontStyle,
		resolved.fontFamily,
		engine,
	]);

	return (
		<div
			ref={setContainer}
			style={{
				width: resolved.autoSize ? "100%" : resolved.width,
				height: resolved.height,
				position: "relative",
			}}
		/>
	);
}

/**
 * EMA is a candlestick-only overlay and is dropped in mini mode.
 * EMA 仅用于蜡烛图，且在精简模式下不显示。
	 */
function shouldShowEma(props: TChartResolvedProps): boolean {
	return (
		props.showEma && !props.isMiniChart && props.chartType === "candlestick"
	);
}

/**
 * Fits every bar plus `rightOffset` empty bars into the viewport.
 * 将全部 K 线加上 `rightOffset` 根空线一起适配到可视区。
	 */
function fitToRange(
	chart: IChartApi,
	dataLength: number,
	rightOffset: number,
): void {
	const timeScale = chart.timeScale();
	if (dataLength <= 0) {
		timeScale.fitContent();
		return;
	}
	timeScale.setVisibleLogicalRange({
		from: 0,
		to: dataLength - 1 + Math.max(rightOffset, 0),
	});
}

const TChartMemo = memo(TChart, areTChartPropsEqual);

/**
 * The memoized Wrapper, under both export forms: `TChart` entry files
 * default-export it so a consumer can pick either import style.
 *
 * 记忆化后的 Wrapper，两种导出形式都给：入口文件同时 default 导出，
 * 调用方两种 import 写法都能用。
 */
export { TChartMemo as TChart };
export default TChartMemo;
