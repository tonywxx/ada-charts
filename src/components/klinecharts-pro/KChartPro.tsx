import "@klinecharts/pro/dist/klinecharts-pro.css";
import { KLineChartPro, type Datafeed, type Period, type SymbolInfo } from "@klinecharts/pro";
import type { DeepPartial, Styles } from "klinecharts";
import { memo, useEffect, useMemo, useRef } from "react";
import { dispose as disposeV9Chart } from "klinecharts-v9";
import { useEngineMount } from "../../engine-mount";
import { mergeStyles, themeStyles } from "../klinecharts/k-line-styles";
import {
	KCHARTPRO_DEFAULTS,
	KCHARTPRO_DEFAULT_PERIODS,
	areKChartProPropsEqual,
} from "./k-chart-pro-options";
import { OkxDatafeed } from "./okx-datafeed";

/**
 * Everything `KChartPro` accepts. Each prop maps 1:1 onto a field of the
 * `@klinecharts/pro` `ChartProOptions` object or a method of `KLineChartPro`.
 *
 * `KChartPro` 接受的全部属性。每个属性都与 `@klinecharts/pro` 的 `ChartProOptions`
 * 某个字段或 `KLineChartPro` 某个方法一一对应。
 */
export interface KChartProProps {
	/**
	 * Instrument to load. Defaults to OKX `BTC-USDT` when omitted.
	 * 要加载的标的；省略时默认使用 OKX 的 `BTC-USDT`。
	 */
	symbol?: SymbolInfo;
	/**
	 * Active bar period. 当前 K 线周期。
	 */
	period?: Period;
	/**
	 * Period presets offered in the toolbar. 工具栏提供的周期预设。
	 */
	periods?: Period[];
	/**
	 * Data source. Defaults to an {@link OkxDatafeed} that streams live OKX
	 * candles; supply your own to change the venue.
	 *
	 * 数据源。默认使用 {@link OkxDatafeed}，推送实时 OKX 行情；传入自定义实现可更换数据源。
	 */
	datafeed?: Datafeed;
	/**
	 * CSS theme driving the toolbar and chart palette.
	 * 决定工具栏与图表配色的 CSS 主题。
	 */
	theme?: "light" | "dark";
	/** UI locale (`en-US` / `zh-CN`). 界面语言。 */
	locale?: string;
	/** IANA timezone for date rendering. 日期渲染使用的 IANA 时区。 */
	timezone?: string;
	/**
	 * Watermark text drawn behind the chart.
	 * 绘制在图表下方的水印文字。
	 */
	watermark?: string;
	/**
	 * Show the drawing-tool toolbar. 是否显示画线工具栏。
	 */
	drawingBarVisible?: boolean;
	/**
	 * Indicators overlaid on the main (price) pane, e.g. `["MA", "BOLL"]`.
	 * 叠加在主图（价格）面板上的指标，例如 `["MA", "BOLL"]`。
	 */
	mainIndicators?: string[];
	/**
	 * Indicators in their own sub panes, e.g. `["VOL", "MACD"]`.
	 * 放置在独立副面板的指标，例如 `["VOL", "MACD"]`。
	 */
	subIndicators?: string[];
	/**
	 * Raw `klinecharts` style overrides forwarded to the underlying chart.
	 * 透传给底层图表的原始 `klinecharts` 样式覆盖。
	 */
	styles?: DeepPartial<Styles>;
	/**
	 * Fixed width in px; ignored while `autoSize` is on. 固定宽度（像素），`autoSize` 开启时忽略。
	 */
	width?: number;
	/** Chart height in px. 图表高度（像素）。 */
	height?: number;
	/** Fill the container width instead of a fixed `width`. 填满容器宽度而非固定 `width`。 */
	autoSize?: boolean;
	/**
	 * Receives the constructed {@link KLineChartPro} for imperative control
	 * (`setSymbol`, `setPeriod`, `setTheme`, …).
	 * 回调构造出的 {@link KLineChartPro}，用于命令式控制（`setSymbol`、`setPeriod`、`setTheme` 等）。
	 */
	onChartReady?: (chart: KLineChartPro) => void;
}

/** Resolved props with defaults applied. 已应用默认值的解析属性。 */
export type KChartProResolvedProps = Required<
	Pick<
		KChartProProps,
		| "autoSize"
		| "theme"
		| "locale"
		| "timezone"
		| "drawingBarVisible"
		| "mainIndicators"
		| "subIndicators"
	>
> &
	Pick<KChartProProps, "width" | "height" | "period" | "periods" | "datafeed" | "watermark" | "styles"> & {
		symbol: SymbolInfo;
	};

/**
 * Merge caller props over {@link KCHARTPRO_DEFAULTS} into the concrete config the
 * `KLineChartPro` constructor wants.
 * 把调用方 props 合并到 {@link KCHARTPRO_DEFAULTS} 之上，生成 `KLineChartPro` 构造函数所需的完整配置。
 */
function resolveKChartProProps(props: KChartProProps): KChartProResolvedProps {
	return {
		width: props.width ?? KCHARTPRO_DEFAULTS.width,
		height: props.height ?? KCHARTPRO_DEFAULTS.height,
		autoSize: props.autoSize ?? KCHARTPRO_DEFAULTS.autoSize,
		theme: props.theme ?? KCHARTPRO_DEFAULTS.theme,
		locale: props.locale ?? KCHARTPRO_DEFAULTS.locale,
		timezone: props.timezone ?? KCHARTPRO_DEFAULTS.timezone,
		watermark: props.watermark,
		drawingBarVisible: props.drawingBarVisible ?? KCHARTPRO_DEFAULTS.drawingBarVisible,
		mainIndicators: props.mainIndicators ?? [...KCHARTPRO_DEFAULTS.mainIndicators],
		subIndicators: props.subIndicators ?? [...KCHARTPRO_DEFAULTS.subIndicators],
		styles: props.styles,
		period: props.period,
		periods: props.periods,
		datafeed: props.datafeed,
		symbol: props.symbol ?? {
			ticker: KCHARTPRO_DEFAULTS.ticker,
			pricePrecision: KCHARTPRO_DEFAULTS.pricePrecision,
			volumePrecision: KCHARTPRO_DEFAULTS.volumePrecision,
		},
	};
}

/**
 * A declarative React wrapper over `@klinecharts/pro` — the "financial chart
 * built out of the box" layer on top of `klinecharts`. It ships a toolbar
 * (period switcher, indicator picker, drawing tools, theme toggle), a
 * {@link Datafeed}-driven data pipeline, and a watermark, all pre-wired.
 *
 * 对 `@klinecharts/pro` 的声明式 React 封装 —— `klinecharts` 之上"开箱即用的金融图表"层。
 * 它自带工具栏（周期切换、指标选择、画线工具、主题切换）、由 {@link Datafeed} 驱动的数据管线，
 * 以及水印，全部预先接线。
 *
 * Like `TChart` and `KChart`, it defaults to live OKX candles: the bundled
 * {@link OkxDatafeed} fetches history over REST and refreshes the newest bar on
 * an interval, so the chart tracks the real market out of the box.
 *
 * 与 `TChart`、`KChart` 一样，默认使用实时 OKX 行情：内置的 {@link OkxDatafeed} 通过 REST 拉取
 * 历史并按周期刷新最新一根，因此开箱即用地跟随真实市场。
 */
function KChartPro(props: KChartProProps) {
	const resolved = useMemo(() => resolveKChartProProps(props), [props]);
	/** One shared OKX feed unless the caller supplies their own. 除非调用方自带，否则共用一个 OKX 数据源。 */
	const defaultFeedRef = useRef<OkxDatafeed | null>(null);
	const latestRef = useRef({ props, resolved });

	// Mirror the render-scoped values into the ref; declared before the mount
	// effect so the first commit already sees fresh values without the mount
	// effect depending on anything volatile.
	// 把渲染期最新值镜像进 ref；声明在 mount effect 之前，使首次提交即可读到最新值，
	// 而 mount effect 无需依赖任何易变项。
	useEffect(() => {
		latestRef.current = { props, resolved };
	});

	// Build the Pro chart exactly once.
	// Pro 图表只创建一次。
	// Only needed because `KLineChartPro` publishes no teardown: the v9 host it
	// stamps inside our container has to be found again at destroy time.
	// 只是因为 `KLineChartPro` 不提供拆除接口才需要它：销毁时要找回它盖在我们容器里的
	// v9 宿主元素。
	const hostRef = useRef<HTMLDivElement | null>(null);
	const { setContainer, engine } = useEngineMount<KLineChartPro>({
		create: (container) => {
			hostRef.current = container;
			const options = latestRef.current.resolved;
			let feed: OkxDatafeed | undefined;
			if (!options.datafeed) {
				feed = defaultFeedRef.current ?? (defaultFeedRef.current = new OkxDatafeed(options.symbol.ticker));
			}

			const datafeed: Datafeed = options.datafeed ?? feed!;
			const period: Period = options.period ?? { multiplier: 1, timespan: "day", text: "1D" };

			const chart = new KLineChartPro({
				container,
				symbol: options.symbol,
				period,
				periods: options.periods ?? KCHARTPRO_DEFAULT_PERIODS,
				datafeed,
				theme: options.theme,
				locale: options.locale,
				timezone: options.timezone,
				drawingBarVisible: options.drawingBarVisible,
				mainIndicators: options.mainIndicators,
				subIndicators: options.subIndicators,
				// The same Theme tokens `KChart` fans out, so a rising candle is the same
				// green in both klinecharts-based Wrappers. Caller `styles` still win.
				// 与 `KChart` 扇出的是同一批 Theme token，因此两个基于 klinecharts 的 Wrapper
				// 里上涨蜡烛是同一个绿色。调用方传入的 `styles` 仍然优先。
				styles: mergeStyles(themeStyles(options.theme), options.styles),
				...(options.watermark ? { watermark: options.watermark } : {}),
			});
			latestRef.current.props.onChartReady?.(chart);
			return chart;
		},
		// `KLineChartPro` exposes no `resize`, and its own v9 chart listens to window
		// resize; a container-only resize is therefore not reachable from here. The
		// gap is stated rather than papered over with a private-field poke.
		// `KLineChartPro` 不提供 `resize`，其内部 v9 图表只监听 window resize，因此
		// 仅容器尺寸变化这条路在这里无从触达。这里直说缺口，而不去戳私有字段。
		destroy: () => {
			defaultFeedRef.current?.dispose();
			defaultFeedRef.current = null;
			// `KLineChartPro` owns its inner chart and publishes no teardown of its own
			// (`_chartApi` is private). The v9 instance registers itself by stamping
			// `k-line-chart-id` on its host element, and v9's `dispose` reads exactly
			// that attribute — so the hosted chart can be taken down properly instead
			// of being left running against DOM we are about to drop.
			// `KLineChartPro` 独占其内部图表，且不提供拆除接口（`_chartApi` 是私有的）。
			// v9 实例会在宿主元素上盖 `k-line-chart-id` 完成自注册，而 v9 的 `dispose`
			// 正是读这个属性 —— 于是可以真正拆掉它，而不是留着一个对着将被丢弃的 DOM
			// 继续运行的图表。
			const v9Host = hostRef.current?.querySelector("[k-line-chart-id]");
			if (v9Host instanceof HTMLElement) disposeV9Chart(v9Host);
			hostRef.current = null;
		},
	});

	// Mirror reactive style/locale/timezone/theme changes through the setters.
	// 通过 setter 镜像响应式的样式 / 语言 / 时区 / 主题变化。
	useEffect(() => {
		const chart = engine();
		if (!chart) return;
		chart.setTheme(resolved.theme);
		chart.setLocale(resolved.locale);
		if (resolved.timezone) chart.setTimezone(resolved.timezone);
		chart.setStyles(mergeStyles(themeStyles(resolved.theme), resolved.styles));
	}, [resolved.theme, resolved.locale, resolved.timezone, resolved.styles, engine]);

	// Symbol / period swaps reload the feed; only fire when they actually change.
	// 标的 / 周期切换会重载数据源；仅在真正变化时触发。
	const symbolKey = JSON.stringify(resolved.symbol);
	useEffect(() => {
		engine()?.setSymbol(latestRef.current.resolved.symbol);
	}, [symbolKey, engine]);

	const periodKey = JSON.stringify(resolved.period ?? null);
	useEffect(() => {
		const period = latestRef.current.resolved.period;
		if (period) engine()?.setPeriod(period);
	}, [periodKey, engine]);

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

const KChartProMemo = memo(KChartPro, areKChartProPropsEqual);

/**
 * The memoized Wrapper, under both export forms: `KChartPro` entry files
 * default-export it so a consumer can pick either import style.
 *
 * 记忆化后的 Wrapper，两种导出形式都给：入口文件同时 default 导出，
 * 调用方两种 import 写法都能用。
 */
export { KChartProMemo as KChartPro };
export default KChartProMemo;
