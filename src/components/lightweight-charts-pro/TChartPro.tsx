import {
	HistogramSeries,
	LineSeries,
	type IChartApi,
	type ISeriesApi,
	type SeriesType,
	type Time,
} from "lightweight-charts";
import type { SerializedDrawing } from "lightweight-charts-drawing";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OkxTChartDatafeed } from "./okx-datafeed";
import TChart, { type TChartDataItem, type TChartProps } from "../lightweight-charts/TChart";
import { DrawingController, type DrawingToolEntry, type MagnetBar } from "./t-chart-pro-drawing";
import { buildIndicatorTracks } from "./t-chart-pro-indicators";
import {
	areTChartProPropsEqual,
	chartThemeOf,
	formattersFor,
	isIntradayBarSize,
	resolveTChartProProps,
	tChartPropsForTheme,
	type TChartProCandle,
	type TChartProDatafeed,
	type TChartProMagnet,
	type TChartProSymbol,
} from "./t-chart-pro-options";
import { TChartProToolbar } from "./t-chart-pro-toolbar";

/**
 * Everything `TChartPro` accepts: every {@link TChartProps} — so nothing the
 * plain Wrapper can do is lost — plus the Pro layer the `@klinecharts/pro`
 * Wrapper exposes.
 *
 * `TChartPro` 接受的全部属性：既有 {@link TChartProps} 的每一项（因此普通 Wrapper 能做的
 * 一切都不会丢），再加 `@klinecharts/pro` 那层 Wrapper 提供的 Pro 能力。
 *
 * The pairs below are the same feature under the two engines' names, per ADR-0001:
 * `klinecharts` owns *Symbol* / *Period* / *Datafeed*, while `lightweight-charts`
 * owns none of them, so the domain words from `CONTEXT.md` are used instead.
 *
 * 下面成对的属性是同一个功能在两套引擎下的名字（见 ADR-0001）：`klinecharts` 自带
 * *Symbol* / *Period* / *Datafeed* 这些概念，`lightweight-charts` 一个都没有，因此改用
 * `CONTEXT.md` 里的领域词。
 *
 * | `KChartPro` | `TChartPro` |
 * | --- | --- |
 * | `symbol` | {@link TChartProProps.symbol} |
 * | `period` / `periods` | {@link TChartProProps.barSize} / {@link TChartProProps.barSizes} |
 * | `datafeed` | {@link TChartProProps.datafeed} |
 * | `theme` / `locale` / `timezone` | 同名 |
 * | `watermark` | `watermarkText` + `watermarkVisible` |
 * | `drawingBarVisible` | {@link TChartProProps.drawingBarVisible} |
 * | `mainIndicators` / `subIndicators` | 同名 |
 * | `styles` | `TChart` 的 `*Override` 系列 |
 * | `onChartReady` | {@link TChartProProps.onChartReady} |
 */
export interface TChartProProps extends Omit<TChartProps, "onChartReady"> {
	/**
	 * Instrument to load. Defaults to OKX `BTC-USDT`.
	 * 要加载的标的；默认使用 OKX 的 `BTC-USDT`。
	 */
	symbol?: TChartProSymbol;
	/**
	 * Active bar size, e.g. `1D` — also the code the default feed requests.
	 * 当前 K 线周期，例如 `1D`；默认数据源也正是用这个字符串取数。
	 */
	barSize?: string;
	/** Bar sizes offered in the toolbar. 工具栏提供的 K 线周期。 */
	barSizes?: readonly string[];
	/**
	 * Data source. Defaults to an {@link OkxTChartDatafeed} streaming live OKX
	 * candles; supply your own to change the venue.
	 *
	 * 数据源。默认使用 {@link OkxTChartDatafeed} 推送实时 OKX 行情；传入自定义实现可更换数据源。
	 */
	datafeed?: TChartProDatafeed;
	/**
	 * Named theme driving both the toolbar and the chart palette.
	 * 同时决定工具栏与图表配色的命名主题。
	 */
	theme?: "light" | "dark";
	/**
	 * IANA timezone the axis and labels print dates in. `lightweight-charts` has
	 * no such option, so this layer supplies the formatters that make it real.
	 *
	 * 坐标轴与标签打印日期所用的 IANA 时区。`lightweight-charts` 没有这个选项，因此由
	 * 本层补上真正生效的那批格式化函数。
	 */
	timezone?: string;
	/** Show the drawing-tool strip. 是否显示画线工具栏。 */
	drawingBarVisible?: boolean;
	/**
	 * Tool types the palette offers; empty means every tool the library registers.
	 * 面板提供的工具类型；为空表示收录该库注册的全部工具。
	 */
	drawingTools?: readonly string[];
	/** Magnet strength while placing a drawing. 落笔时磁吸的强度。 */
	magnet?: TChartProMagnet;
	/** Keep the tool armed after each placement. 每次完成后仍保持该工具处于 arm 状态。 */
	keepToolArmed?: boolean;
	/** Create drawings already locked against editing. 新建的画线直接锁定、不可编辑。 */
	lockNewDrawings?: boolean;
	/**
	 * Drawings to place on the chart, e.g. a saved layout. Re-applied whenever the
	 * reference changes; output this layer just reported through
	 * {@link TChartProProps.onDrawingsChange} is recognised and skipped, so echoing
	 * it back into a store cannot loop.
	 *
	 * 放到图上的一组画线，例如已保存的布局。引用变化时即重新套用；本层刚刚经由
	 * {@link TChartProProps.onDrawingsChange} 上报的那一份会被识别并跳过，因此原样写回
	 * 存储不会形成循环。
	 */
	drawings?: readonly SerializedDrawing[];
	/**
	 * The whole drawing set after any change — placement, drag, undo, clear.
	 * Persist this and hand it back through {@link TChartProProps.drawings}.
	 *
	 * 任何变化（落笔、拖拽、撤销、清空）之后的完整画线集合；保存它并经由
	 * {@link TChartProProps.drawings} 传回。
	 */
	onDrawingsChange?: (drawings: SerializedDrawing[]) => void;
	/**
	 * Indicators overlaid on the main (price) pane, e.g. `["MA", "BOLL"]`. Any name
	 * from {@link TCHARTPRO_INDICATORS} is accepted, in either list.
	 * 叠加在主图（价格）面板上的指标，例如 `["MA", "BOLL"]`。{@link TCHARTPRO_INDICATORS}
	 * 里的任意名字都可以，放哪个列表都行。
	 */
	mainIndicators?: readonly string[];
	/**
	 * Indicators in their own panes, e.g. `["VOL", "MACD"]` — one pane each, added
	 * in list order below the price pane.
	 * 放置在独立副面板的指标，例如 `["VOL", "MACD"]`，每个各占一个面板，按列表顺序自上而下排。
	 */
	subIndicators?: readonly string[];
	/**
	 * Receives the {@link TChartProApi} once the chart, its main series and the
	 * drawing layer all exist.
	 * 图表、主系列与画线层都就绪后，回调 {@link TChartProApi}。
	 */
	onChartReady?: (pro: TChartProApi) => void;
}

/**
 * Imperative control over a `TChartPro`: the `set*`/`get*` pairs
 * `KLineChartPro` publishes, plus the drawing layer this one owns.
 *
 * 对 `TChartPro` 的命令式控制：一侧对齐 `KLineChartPro` 公布的 `set*`/`get*` 成对方法，
 * 另一侧补上本层自己那套画线。
 */
export interface TChartProApi {
	/** The underlying chart, or `null` before mount. 底层图表；挂载前为 `null`。 */
	chart(): IChartApi | null;
	/** The main series drawings and overlays attach to. 画线与叠加层所依附的主系列。 */
	mainSeries(): ISeriesApi<SeriesType> | null;
	/** The drawing layer, or `null` before mount. 画线层；挂载前为 `null`。 */
	drawings(): DrawingController | null;
	setSymbol(symbol: TChartProSymbol): void;
	getSymbol(): TChartProSymbol;
	setBarSize(barSize: string): void;
	getBarSize(): string;
	setTheme(theme: "light" | "dark"): void;
	getTheme(): "light" | "dark";
	setLocale(locale: string): void;
	getLocale(): string;
	setTimezone(timezone: string): void;
	getTimezone(): string;
	setMainIndicators(indicators: readonly string[]): void;
	setSubIndicators(indicators: readonly string[]): void;
	/** Arm a drawing tool, or pass `null` for the pointer. arm 某个画线工具；传 `null` 回到指针。 */
	setTool(tool: string | null): void;
	getTool(): string | null;
	exportDrawings(): SerializedDrawing[];
	importDrawings(drawings: readonly SerializedDrawing[]): void;
}

/** Props this layer consumes itself rather than forwarding to `TChart`. 由本层自行消化、不转发给 `TChart` 的属性。 */
const PRO_ONLY_KEYS = new Set([
	"symbol",
	"barSize",
	"barSizes",
	"datafeed",
	"theme",
	"drawingBarVisible",
	"drawingTools",
	"magnet",
	"keepToolArmed",
	"lockNewDrawings",
	"drawings",
	"onDrawingsChange",
	"mainIndicators",
	"subIndicators",
	"onChartReady",
]);

/**
 * A declarative React Wrapper around `lightweight-charts` v5 plus
 * `lightweight-charts-drawing`, carrying the same Pro features as
 * `KChartPro` does on `@klinecharts/pro`: a toolbar (symbol search, bar sizes,
 * indicator picker, drawing palette, theme toggle), a
 * {@link TChartProDatafeed}-driven live pipeline, and a watermark — all pre-wired.
 *
 * 对 `lightweight-charts` v5 加 `lightweight-charts-drawing` 的声明式 React 封装，带着
 * `KChartPro` 在 `@klinecharts/pro` 上的同款 Pro 能力：工具栏（标的搜索、K 线周期、
 * 指标选择、画线面板、主题切换）、由 {@link TChartProDatafeed} 驱动的实时数据管线，
 * 以及水印，全部预先接线。
 *
 * It composes rather than reimplements: `TChart` still owns the chart, its series,
 * markers, reference lines and watermark, while this layer adds what the engine
 * does not ship — indicators, the drawing tools, and the toolbar. Every `TChart`
 * prop therefore stays available here, and live OKX candles arrive by default, so
 * the chart tracks the real market out of the box.
 *
 * 它是组合而非重写的：图表、系列、标记、参考线、水印仍归 `TChart` 管，本层只补引擎没有
 * 的东西 —— 指标、画线工具与工具栏。所以 `TChart` 的每个 prop 在这里同样可用；且默认就
 * 用实时 OKX 行情，开箱即用地跟随真实市场。
 */
function TChartPro(props: TChartProProps) {
	const resolved = useMemo(() => resolveTChartProProps(props), [props]);
	const controllerRef = useRef<DrawingController | null>(null);
	const defaultFeedRef = useRef<OkxTChartDatafeed | null>(null);
	const seriesRef = useRef<ISeriesApi<"Line" | "Histogram">[]>([]);
	/** What this layer last reported upward, to spot a store echoing its own write. 本层最近向上报的那份，用来识别存储把自己写回的情形。 */
	const lastEmittedRef = useRef("");
	/** The chart and main series from the most recent `onChartReady`. 最近一次 `onChartReady` 交出的图表与主系列。 */
	const [engine, setEngine] = useState<{
		chart: IChartApi;
		series: ISeriesApi<SeriesType>;
	} | null>(null);

	const [symbol, setSymbol] = useState<TChartProSymbol>(resolved.symbol);
	const [barSize, setBarSize] = useState(resolved.barSize);
	const [theme, setTheme] = useState(resolved.theme);
	const [locale, setLocale] = useState(resolved.locale);
	const [timezone, setTimezone] = useState(resolved.timezone);
	const [mainIndicators, setMainIndicators] = useState<string[]>([...resolved.mainIndicators]);
	const [subIndicators, setSubIndicators] = useState<string[]>([...resolved.subIndicators]);
	const [tool, setTool] = useState<string | null>(null);
	const [magnet, setMagnet] = useState<TChartProMagnet>(resolved.magnet);
	const [keepToolArmed, setKeepToolArmed] = useState(resolved.keepToolArmed);
	const [lockNewDrawings, setLockNewDrawings] = useState(resolved.lockNewDrawings);
	const [drawingCount, setDrawingCount] = useState(0);
	const [tools, setTools] = useState<DrawingToolEntry[]>([]);
	const [feedData, setFeedData] = useState<TChartDataItem[]>([]);

	/**
	 * The values as they stand this render, read by the imperative API and by the
	 * effects that must not re-subscribe whenever a callback identity changes.
	 *
	 * 本次渲染下的取值：命令式 API，以及那些不该随回调引用变化就重新订阅的 effect，都从这里读。
	 */
	const stateRef = useRef({ props, resolved, symbol, barSize, theme, locale, timezone, tool });
	useEffect(() => {
		stateRef.current = { props, resolved, symbol, barSize, theme, locale, timezone, tool };
	});

	// A supplied prop steers the matching state; the toolbar and the API then move
	// the same value from underneath it.
	// 显式传入的 prop 驱动对应的 state；工具栏与命令式 API 随后改动的正是这些 state。
	useEffect(() => {
		if (props.symbol !== undefined) setSymbol(props.symbol);
	}, [props.symbol]);
	useEffect(() => {
		if (props.barSize !== undefined) setBarSize(props.barSize);
	}, [props.barSize]);
	useEffect(() => {
		if (props.theme !== undefined) setTheme(props.theme);
	}, [props.theme]);
	useEffect(() => {
		if (props.locale !== undefined) setLocale(props.locale);
	}, [props.locale]);
	useEffect(() => {
		if (props.timezone !== undefined) setTimezone(props.timezone);
	}, [props.timezone]);
	useEffect(() => {
		if (props.mainIndicators !== undefined) setMainIndicators([...props.mainIndicators]);
	}, [props.mainIndicators]);
	useEffect(() => {
		if (props.subIndicators !== undefined) setSubIndicators([...props.subIndicators]);
	}, [props.subIndicators]);
	useEffect(() => {
		if (props.magnet !== undefined) setMagnet(props.magnet);
	}, [props.magnet]);
	useEffect(() => {
		if (props.keepToolArmed !== undefined) setKeepToolArmed(props.keepToolArmed);
	}, [props.keepToolArmed]);
	useEffect(() => {
		if (props.lockNewDrawings !== undefined) setLockNewDrawings(props.lockNewDrawings);
	}, [props.lockNewDrawings]);

	/** The feed in use: the caller's, or the one shared by this instance. 当前使用的数据源：调用方的，或本实例自建的默认那个。 */
	const datafeed = useMemo(
		() =>
			props.datafeed ??
			(defaultFeedRef.current ??= new OkxTChartDatafeed(
				stateRef.current.symbol.ticker,
			)),
		[props.datafeed],
	);

	/**
	 * VOL and EMA are indicators here, while `TChart` also ships its own volume
	 * overlay and EMA pair. Rather than let both draw, the two classic `TChart`
	 * props are read as requests for the indicator of the same name.
	 *
	 * 在本层 VOL 与 EMA 属于指标，而 `TChart` 也自带成交量叠加与一对 EMA。与其两边都画，
	 * 不如把那两个传统 `TChart` prop 读成「请求同名指标」。
	 */
	const mainList = useMemo(() => {
		const list = [...mainIndicators];
		if (resolved.showEma && !list.includes("EMA")) list.push("EMA");
		return list;
	}, [mainIndicators, resolved.showEma]);
	const subList = useMemo(() => {
		const list = [...subIndicators];
		if (resolved.showVolume && !list.includes("VOL")) list.push("VOL");
		return list;
	}, [subIndicators, resolved.showVolume]);

	// ---------------------------------------------------------------- live data

	const symbolKey = symbol.ticker;
	useEffect(() => {
		if (stateRef.current.props.data?.length) return;
		const current = stateRef.current;
		let cancelled = false;
		void datafeed.getHistory(symbol, current.barSize).then((candles) => {
			if (cancelled) return;
			setFeedData(candles.map(toDataItem));
		});
		datafeed.subscribe(symbol, current.barSize, (candle) => {
			setFeedData((previous) => mergeCandle(previous, candle));
		});
		return () => {
			cancelled = true;
			datafeed.unsubscribe(symbol, current.barSize);
		};
	}, [datafeed, symbol, symbolKey]);

	/** The dataset the chart and every indicator plot. 图表与所有指标实际绘制的那份数据。 */
	const data = props.data?.length ? props.data : feedData;

	// ---------------------------------------------------------------- indicators

	const tracks = useMemo(
		() => buildIndicatorTracks(mainList, subList, data, chartThemeOf(theme)),
		[mainList, subList, data, theme],
	);
	/** Only the composition of the set rebuilds series; a new candle does not. 只有指标组合的变化才重建系列；来一根新 K 线不会。 */
	const tracksKey = tracks
		.map((track) => `${track.title}@${track.paneIndex}${track.kind}`)
		.join("|");

	useEffect(() => {
		if (!engine) return;
		const handles = tracks.map((track) =>
			engine.chart.addSeries(
				track.kind === "line" ? LineSeries : HistogramSeries,
				{
					title: track.title,
					color: track.color,
					lineWidth: track.lineWidth,
					priceLineVisible: false,
					lastValueVisible: false,
				} as never,
				track.paneIndex,
			) as ISeriesApi<"Line" | "Histogram">,
		);
		seriesRef.current = handles;
		return () => {
			seriesRef.current = [];
			try {
				for (const handle of handles) engine.chart.removeSeries(handle);
			} catch {
				// Unmount tears the chart down together with its series, so the set
				// this cleanup was written against may already be gone.
				// 卸载时图表与其系列一并被拆掉，本 cleanup 想撤的那批可能早已不在。
			}
		};
		// `tracksKey`, not `tracks`: the series set only changes with the set itself.
		// 依赖 `tracksKey` 而非 `tracks`：系列集合只随指标组合变化。
	}, [engine, tracksKey]);

	useEffect(() => {
		tracks.forEach((track, index) => {
			seriesRef.current[index]?.setData((track.perBarColors ?? track.data) as never);
		});
	}, [engine, tracks]);

	// ----------------------------------------------------------------- drawing

	useEffect(() => {
		if (!engine) return;
		const controller = new DrawingController(
			engine.chart,
			engine.series,
			engine.chart.chartElement(),
		);
		controllerRef.current = controller;
		controller.setMagnet(stateRef.current.props.magnet ?? resolved.magnet);
		controller.setBarsProvider(() => barsOf(data));
		setTools(controller.tools(stateRef.current.props.drawingTools));
		const offChange = controller.on("onChange", (list) => {
			lastEmittedRef.current = JSON.stringify(list);
			setDrawingCount(list.length);
			stateRef.current.props.onDrawingsChange?.(list);
		});
		const offTool = controller.on("onToolChange", setTool);
		const preset = stateRef.current.props.drawings;
		if (preset?.length) {
			lastEmittedRef.current = JSON.stringify(preset);
			controller.load(preset);
			setDrawingCount(preset.length);
		}
		return () => {
			offChange();
			offTool();
			controller.dispose();
			controllerRef.current = null;
		};
		// One controller per (chart, main series) pair: a `chartType` switch removes
		// the series the primitives were attached to.
		// 每对 (图表, 主系列) 一个 controller：切换 `chartType` 会带走 primitive 所依附的
		// 那个系列。
	}, [engine]);

	const drawingsProp = props.drawings;
	useEffect(() => {
		const controller = controllerRef.current;
		if (!controller || !drawingsProp) return;
		const serialized = JSON.stringify(drawingsProp);
		if (serialized === lastEmittedRef.current) return;
		lastEmittedRef.current = serialized;
		controller.load(drawingsProp);
		setDrawingCount(drawingsProp.length);
	}, [drawingsProp, engine]);

	useEffect(() => {
		controllerRef.current?.setMagnet(magnet);
	}, [magnet, engine]);
	useEffect(() => {
		controllerRef.current?.setKeepArmed(keepToolArmed);
	}, [keepToolArmed, engine]);
	useEffect(() => {
		controllerRef.current?.setLockNew(lockNewDrawings);
	}, [lockNewDrawings, engine]);
	useEffect(() => {
		if (tool !== controllerRef.current?.activeTool()) {
			controllerRef.current?.setTool(tool);
		}
	}, [tool, engine]);
	useEffect(() => {
		controllerRef.current?.setBarsProvider(() => barsOf(data));
	}, [data, engine]);

	// Unmount only: the default feed owns poll timers.
	// 仅卸载时：默认数据源手上有轮询定时器。
	useEffect(
		() => () => {
			defaultFeedRef.current?.dispose();
			defaultFeedRef.current = null;
		},
		[],
	);

	// --------------------------------------------------------------------- api

	const engineRef = useRef<{
		chart: IChartApi | null;
		series: ISeriesApi<SeriesType> | null;
	}>({ chart: null, series: null });
	useEffect(() => {
		engineRef.current = {
			chart: engine?.chart ?? null,
			series: engine?.series ?? null,
		};
	}, [engine]);

	const apiRef = useRef<TChartProApi | null>(null);
	apiRef.current ??= {
		chart: () => engineRef.current.chart,
		mainSeries: () => engineRef.current.series,
		drawings: () => controllerRef.current,
		setSymbol: (next) => setSymbol(next),
		getSymbol: () => stateRef.current.symbol,
		setBarSize: (next) => setBarSize(next),
		getBarSize: () => stateRef.current.barSize,
		setTheme: (next) => setTheme(next),
		getTheme: () => stateRef.current.theme,
		setLocale: (next) => setLocale(next),
		getLocale: () => stateRef.current.locale,
		setTimezone: (next) => setTimezone(next),
		getTimezone: () => stateRef.current.timezone,
		setMainIndicators: (next) => setMainIndicators([...next]),
		setSubIndicators: (next) => setSubIndicators([...next]),
		setTool: (next) => setTool(next),
		getTool: () => stateRef.current.tool,
		exportDrawings: () => controllerRef.current?.drawings() ?? [],
		importDrawings: (next) => controllerRef.current?.load(next),
	};

	const announcedRef = useRef(false);
	useEffect(() => {
		if (!engine || !controllerRef.current || announcedRef.current) return;
		announcedRef.current = true;
		stateRef.current.props.onChartReady?.(apiRef.current!);
	}, [engine]);

	const searchSymbols = useCallback(
		(search: string) => datafeed.searchSymbols(search),
		[datafeed],
	);

	// -------------------------------------------------------------- forwarding

	const formatters = useMemo(() => formattersFor(locale, timezone), [locale, timezone]);

	const chartProps = useMemo<TChartProps>(() => {
		const forwarded: Record<string, unknown> = Object.fromEntries(
			Object.entries(props).filter(([key]) => !PRO_ONLY_KEYS.has(key)),
		);
		return {
			...tChartPropsForTheme(theme),
			...forwarded,
			data,
			title: props.title ?? symbol.ticker,
			// The Pro layer plots volume and EMA itself, so `TChart` must not.
			// 成交量与 EMA 由 Pro 层自己绘制，`TChart` 那两份要关掉。
			showVolume: false,
			showEma: false,
			timeVisible: (props.timeVisible as boolean | undefined) ?? isIntradayBarSize(barSize),
			pricePrecision: (props.pricePrecision as number | undefined) ?? symbol.pricePrecision,
			locale,
			...formatters,
			localizationOptionsOverride: {
				...formatters.localization,
				...props.localizationOptionsOverride,
			},
			timeScaleOptionsOverride: {
				...formatters.timeScale,
				...props.timeScaleOptionsOverride,
			},
			onChartReady: (chart: IChartApi, series: ISeriesApi<SeriesType>) =>
				setEngine({ chart, series }),
		} as TChartProps;
	}, [props, theme, barSize, symbol, locale, timezone, data]);

	return (
		<div
			style={{
				width: resolved.autoSize ? "100%" : resolved.width,
				position: "relative",
				fontFamily: chartThemeOf(theme).fontFamily,
			}}
		>
			<TChartProToolbar
				theme={theme}
				locale={locale}
				symbol={symbol}
				barSize={barSize}
				barSizes={resolved.barSizes}
				mainIndicators={mainIndicators}
				subIndicators={subIndicators}
				tools={tools}
				activeTool={tool}
				magnet={magnet}
				keepToolArmed={keepToolArmed}
				lockNewDrawings={lockNewDrawings}
				drawingBarVisible={resolved.drawingBarVisible}
				drawingCount={drawingCount}
				searchSymbols={searchSymbols}
				onSelectSymbol={setSymbol}
				onBarSize={setBarSize}
				onIndicators={(main, sub) => {
					setMainIndicators(main);
					setSubIndicators(sub);
				}}
				onTool={setTool}
				onMagnet={setMagnet}
				onKeepToolArmed={setKeepToolArmed}
				onLockNewDrawings={setLockNewDrawings}
				onUndo={() => controllerRef.current?.undo()}
				onDeleteSelected={() => controllerRef.current?.removeSelected()}
				onClearDrawings={() => controllerRef.current?.clearAll()}
				onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
			/>
			<TChart {...chartProps} />
		</div>
	);
}

/**
 * A feed candle in {@link TChartDataItem} shape.
 *
 * `value` is set alongside `close` because `TChartProps.chartType` is inherited
 * here, and its single-value kinds — line, area, baseline, histogram — read
 * `value` and nothing else: handed a candle that only has OHLC, the engine
 * asserts `item data value must be a number`. The bundled story loader for
 * `TChart` already fills both fields for the same reason.
 *
 * 把数据源的 K 线换成 {@link TChartDataItem} 的形状。
 *
 * `value` 与 `close` 一起给出：本层继承了 `TChartProps.chartType`，而它的单值类型 ——
 * line、area、baseline、histogram —— 只读 `value`。若交给它们一根只有 OHLC 的蜡烛，
 * 引擎会断言 `item data value must be a number`。`TChart` 自带的 story 数据加载器出于
 * 同样的原因也是两个字段都填。
 */
function toDataItem(candle: TChartProCandle): TChartDataItem {
	return {
		time: candle.time,
		open: candle.open,
		high: candle.high,
		low: candle.low,
		close: candle.close,
		value: candle.close,
		volume: candle.volume,
	};
}

/**
 * Merge one streamed candle into the dataset: same time overwrites, a newer time
 * appends, anything else is sorted back into place.
 *
 * 把一根实时 K 线并入数据集：时间相同即覆盖，时间更新即追加，其余情况排序归位。
 */
function mergeCandle(previous: TChartDataItem[], candle: TChartProCandle): TChartDataItem[] {
	const item = toDataItem(candle);
	if (previous.length === 0) return [item];
	const last = previous[previous.length - 1];
	if (item.time === last.time) return [...previous.slice(0, -1), item];
	if (typeof item.time === "number" && typeof last.time === "number") {
		if (item.time > last.time) return [...previous, item];
		return [...previous, item].sort((a, b) => Number(a.time) - Number(b.time));
	}
	return [...previous, item];
}

/**
 * The bars behind a dataset, in the shape the magnet needs. A series' first bar
 * sits at logical index `0`, so position and logical index are the same number.
 *
 * 数据集背后的 K 线，整理成磁吸要的形状。一个 series 的首根 K 线逻辑索引就是 `0`，
 * 因此「位置」与「逻辑索引」在这里是同一个数。
 */
function barsOf(data: TChartDataItem[]): MagnetBar[] {
	return data.map((item, index) => ({
		time: item.time as Time,
		logical: index,
		open: item.open ?? item.value ?? 0,
		high: item.high ?? item.value ?? 0,
		low: item.low ?? item.value ?? 0,
		close: item.close ?? item.value ?? 0,
	}));
}

const TChartProMemo = memo(TChartPro, areTChartProPropsEqual);

/**
 * The memoized Wrapper, under both export forms: `TChartPro` entry files
 * default-export it so a consumer can pick either import style.
 *
 * 记忆化后的 Wrapper，两种导出形式都给：入口文件同时 default 导出，调用方两种 import
 * 写法都能用。
 */
export { TChartProMemo as TChartPro };
export default TChartProMemo;
