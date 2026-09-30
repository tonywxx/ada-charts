import type {
	Chart,
	DataLoader,
	DeepPartial,
	Formatter,
	OverlayCreate,
	OverlayEvent,
	OverlayMode,
	Period,
	Styles,
	SymbolInfo,
} from "klinecharts";
import type { Dispatch, SetStateAction } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DARK_THEME, LIGHT_THEME } from "../../theme";
import { AdaChart, type AdaChartIndicator } from "../adachart/AdaChart";
import "./adachart-pro.css";
import {
	OkxDataLoader,
	observeBars,
	resolveAdaChartProSymbol,
	type AdaChartProDataLoader,
	type AdaChartProDataState,
} from "./adachart-pro-datafeed";
import {
	AdaChartProIndicatorParamsDialog,
	AdaChartProSettingsDialog,
	AdaChartProTimezoneDialog,
} from "./adachart-pro-dialogs";
import { AdaChartProDrawingBar } from "./adachart-pro-drawing-bar";
import {
	AdaChartProDrawingManager,
	type AdaChartProDrawingRow,
} from "./adachart-pro-drawing-manager";
import {
	ADACHARTPRO_DRAWING_GROUP_ID,
	drawingGroupsFor,
	drawingToolLabel,
} from "./adachart-pro-drawing-tools";
import { messageFor } from "./adachart-pro-messages";
import {
	areAdaChartProPropsEqual,
	mergeAdaChartProStyles,
	resolveAdaChartProProps,
	symbolInfoFrom,
	type AdaChartProSymbolOption,
} from "./adachart-pro-options";
import {
	ADACHARTPRO_DEFAULT_SETTINGS,
	dateFormatterFor,
	indicatorTooltipStyles,
	lineColorAt,
	lineFigureCount,
	numericCalcParams,
	settingsFromStyles,
	settingsStyles,
	type AdaChartProSettings,
} from "./adachart-pro-settings";
import { AdaChartProToolbar } from "./adachart-pro-toolbar";

/**
 * Everything `AdaChartPro` accepts. Each prop is either a `klinecharts` v10
 * native word (`symbol`, `period`, `dataLoader`) or a piece of the Pro chrome
 * the toolbar drives.
 *
 * `AdaChartPro` 接受的全部属性。每个属性要么是 `klinecharts` v10 的原生词汇
 * （`symbol`、`period`、`dataLoader`），要么是工具栏所驱动的 Pro 外围部件。
 */
export interface AdaChartProProps {
	/**
	 * Data source. Defaults to an {@link OkxDataLoader} streaming live OKX
	 * candles; supply your own to change the venue.
	 *
	 * Give it a {@link AdaChartProDataLoader.resolveSymbol} to name instruments by
	 * string, the way TradingView's datafeed does; leave it off and this layer
	 * reads a name as the ticker itself.
	 *
	 * 数据源。默认使用 {@link OkxDataLoader} 推送实时 OKX 行情；传入自定义实现可更换数据源。
	 *
	 * 给它一个 {@link AdaChartProDataLoader.resolveSymbol} 就能像 TradingView 的 datafeed 那样
	 * 用字符串点名标的；不给，本层就把名称本身当作 ticker 读。
	 */
	dataLoader?: AdaChartProDataLoader;
	/**
	 * Instrument to load, named either way: the string a datafeed takes
	 * (`"BINANCE:BTCUSDT"`), or an object carrying the fields. Defaults to OKX
	 * `BTC-USDT`.
	 *
	 * A string is handed to the loader's `resolveSymbol` when it has one, and is
	 * otherwise read as the ticker. Resolution is asynchronous, so the chart is
	 * not built until the instrument is settled — the last answer wins if the
	 * instrument changes while one is in flight.
	 *
	 * 要加载的标的，两种说法皆可：datafeed 所取的字符串（如 `"BINANCE:BTCUSDT"`），或一个
	 * 带字段的对象。默认使用 OKX 的 `BTC-USDT`。
	 *
	 * 字符串在 loader 有 `resolveSymbol` 时交给它，否则按 ticker 读。解析是异步的，因此标的
	 * 确定之前不会建图 —— 若在解析途中换了标的，最后给出答案的那个胜出。
	 */
	symbol?: string | Partial<SymbolInfo>;
	/** Active bar period in v10's shape, e.g. `{ type: "hour", span: 4 }`. 当前周期，采用 v10 形状。 */
	period?: Period;
	/** Period presets offered in the toolbar. 工具栏提供的周期预设。 */
	periods?: Period[];
	/** Fixed width in px; ignored while `autoSize` is on. 固定宽度（像素），`autoSize` 开启时忽略。 */
	width?: number;
	/** Chart height in px. 图表高度（像素）。 */
	height?: number;
	/** Fill the container width instead of a fixed `width`. 填满容器宽度而非固定 `width`。 */
	autoSize?: boolean;
	/** CSS theme driving the toolbar and the chart palette. 决定工具栏与图表配色的主题。 */
	theme?: "light" | "dark";
	/** UI locale (`en-US` / `zh-CN`). 界面语言。 */
	locale?: string;
	/** IANA timezone for axis and tooltip dates. 坐标轴与浮层日期使用的 IANA 时区。 */
	timezone?: string;
	/** Watermark text drawn behind the chart. 绘制在图表背后的水印文字。 */
	watermark?: string;
	/** Indicators stacked onto the main (price) pane, e.g. `["MA", "BOLL"]`. 叠加在主图（价格）面板上的指标。 */
	mainIndicators?: string[];
	/** Indicators in their own sub panes, e.g. `["VOL", "MACD"]`. 放置在独立副面板的指标。 */
	subIndicators?: string[];
	/**
	 * Umbrella switch for the whole drawing surface — the left-hand bar, that bar's
	 * toggle and the {@link AdaChartProDrawingManager} — and the value the settings
	 * dialog's last switch starts from. Off means this chart has no way to draw, and
	 * the drawing entries leave the chrome rather than appearing disabled: the switch
	 * decides what the chart *is*, so a control that can never be pressed is a
	 * question the reader cannot answer.
	 *
	 * It is an umbrella rather than a third switch beside {@link drawingBarVisible}
	 * and {@link drawingManager}: the three pieces of chrome answer to one
	 * decision, and a caller with no drawing should not have to state that three
	 * times. It narrows the other two and can never widen them — a manager still
	 * needs its own flag, and a bar still needs to be shown.
	 *
	 * Like `theme` and `locale`, it is steered rather than fixed: a chart that can
	 * be drawn on still offers the settings switch, so a reader can turn drawing off
	 * without the caller remounting anything, and a later `drawing` prop change wins
	 * the value back.
	 *
	 * It does **not** remove what has already been drawn. A drawing is data — the
	 * caller may have put it on the chart through the raw instance — and deleting
	 * it is the {@link AdaChartProDrawingManager}'s job, not a switch's. So the
	 * drawings stay, and turning drawing back on brings the panel back with them.
	 *
	 * 整块画线界面的总开关 —— 左侧画线栏、那条栏的开关与 {@link AdaChartProDrawingManager} ——
	 * 也就是设置对话框最后一行开关的初值。关闭意味着这张图表没有办法画线，且画线相关入口直接离开
	 * 外围而不是显示为禁用：该开关决定这张图表*是什么*，一个永远按不动的控件是读者回答不了的问题。
	 *
	 * 它是总开关，而不是 {@link drawingBarVisible} 与 {@link drawingManager} 旁边的第三个开关：
	 * 这三块外围回答的是同一个决定，而不做画线的调用方不该把同一件事说三遍。它只能收窄另外两个、
	 * 永远无法放宽 —— 管理器仍需它自己的开关，栏仍需被显示出来。
	 *
	 * 与 `theme`、`locale` 一样，它是被掌舵的而不是写死的：能画线的图表仍然会提供设置里那一行开关，
	 * 因此读者无需调用方重新挂载就能自己关掉画线，而之后的 `drawing` prop 变化会把取值收回。
	 *
	 * 它**不**移除已经画好的东西。一条画线是数据 —— 调用方可能经原始实例把它放上图表 —— 而删除它
	 * 是 {@link AdaChartProDrawingManager} 的职责，不是一个开关的。因此画线留在图上，重新打开画线时
	 * 面板会连同它们一起回来。
	 */
	drawing?: boolean;
	/** Show the left-hand drawing bar. 是否显示左侧画线栏。 */
	drawingBarVisible?: boolean;
	/** Overlay names the drawing bar offers. Defaults to every name `AdaChart` can draw. 画线栏提供的名称；默认是 `AdaChart` 能画的全部。 */
	drawingTools?: readonly string[];
	/**
	 * Feature flag for the {@link AdaChartProDrawingManager} — the panel that
	 * lists, names, locks, hides and deletes what has been drawn. Off by default;
	 * see the `Drawing manager` term in `CONTEXT.md`.
	 *
	 * {@link AdaChartProDrawingManager}（列出、命名、锁定、隐藏并删除已画对象的画线管理器）
	 * 的开关。默认关闭；见 `CONTEXT.md` 里的 `Drawing manager` 词条。
	 */
	drawingManager?: boolean;
	/** Instruments to pick from; the picker only appears when this is supplied. 可供选择的标的；提供时才显示选择器。 */
	symbols?: readonly AdaChartProSymbolOption[];
	/** Raw `klinecharts` style overrides forwarded to `AdaChart`. 透传给 `AdaChart` 的原始样式覆盖。 */
	styles?: DeepPartial<Styles>;
	/**
	 * Receives the imperative {@link AdaChartProApi} once the chart exists.
	 * 图表建立后回调命令式的 {@link AdaChartProApi}。
	 */
	onChartReady?: (api: AdaChartProApi) => void;
}

/**
 * The imperative surface: what the toolbar already does, offered to callers, in
 * the same v10 vocabulary.
 *
 * 命令式接口：工具栏已经在做的那些事，以同一套 v10 词汇对外开放。
 */
export interface AdaChartProApi {
	/** The raw `klinecharts` instance, for everything not surfaced here. 原始 `klinecharts` 实例，用于此处未暴露的一切。 */
	chart(): Chart | null;
	/**
	 * Names the instrument, in either term the `symbol` prop takes. The chart is
	 * handed the *resolved* one, so a name that has to travel through the loader's
	 * `resolveSymbol` changes what is drawn only once that resolution lands.
	 *
	 * 点名标的，两种说法与 `symbol` 属性相同。图表拿到的是**已解析**的那个，因此需要经 loader
	 * 的 `resolveSymbol` 走一趟的名称，要等那次解析落地才改变画面。
	 */
	setSymbol(symbol: string | SymbolInfo): void;
	/** The instrument on screen, already resolved. 屏幕上的标的，已解析。 */
	getSymbol(): SymbolInfo;
	setPeriod(period: Period): void;
	getPeriod(): Period;
	setTheme(theme: "light" | "dark"): void;
	getTheme(): "light" | "dark";
	setLocale(locale: string): void;
	getLocale(): string;
	setTimezone(timezone: string): void;
	getTimezone(): string;
	setMainIndicators(indicators: string[]): void;
	setSubIndicators(indicators: string[]): void;
	setTool(tool: string | null): void;
	getTool(): string | null;
	/**
	 * Patches the chart's style tree.
	 *
	 * It is held as a layer and merged into the tree handed to `AdaChart`, rather
	 * than pushed straight at the instance: `AdaChart` pushes the tree it is given
	 * on every render, so an instance-level patch would be overwritten by the next
	 * one. Later patches accumulate over earlier ones.
	 *
	 * 给图表的样式树打补丁。
	 *
	 * 它作为一层被持有、合并进交给 `AdaChart` 的树，而不是直接推给实例：`AdaChart` 每次渲染都会
	 * 下发它拿到的树，因此实例级的补丁会被下一次渲染覆盖。后打的补丁累积在先前补丁之上。
	 */
	setStyles(styles: DeepPartial<Styles>): void;
	/** The live style tree, or `null` before the chart exists. 活的样式树；图表建立前为 `null`。 */
	getStyles(): Styles | null;
}

/**
 * The candle pane's id, which v10 does not export. `AdaChart` keeps the same
 * literal for its own pane, and a pane id is a name both sides must agree on,
 * so it is written here rather than imported from a frozen copy.
 *
 * 蜡烛面板的 id，v10 并未导出。`AdaChart` 也为自己的面板保留同一字面量，而面板 id 是两边都必须
 * 认同的名字，因此这里直接写出，而不是从冻结的副本里导入。
 */
const CANDLE_PANE_ID = "candle_pane";

/**
 * The draft the indicator parameter dialog opens with, read from the live
 * indicator when the legend's gear is clicked.
 *
 * 指标参数对话框打开时的草稿，在点击图例的齿轮时从活的指标读出。
 */
interface AdaChartProIndicatorParams {
	id: string;
	name: string;
	calcParams: number[];
	/** One entry per line figure: the instance's override, or the default palette. 每个线图形一项：实例的覆盖值或默认调色板。 */
	lineColors: string[];
}

/**
 * Reads an indicator's editable values off the instance.
 *
 * The colour of line `index` is whatever the instance carries; an indicator that
 * has never been overridden carries no `styles.lines` at all, which is why the
 * dialog falls back to `klinecharts`' own palette rather than showing an empty
 * box — an empty colour input reads as "no colour", not as "the default one".
 *
 * 从实例读取指标的待编辑取值。
 *
 * 第 `index` 条线的颜色就是实例携带的那个；从未被覆盖过的指标根本不带 `styles.lines`，
 * 正因如此对话框回退到 `klinecharts` 自己的调色板，而不是显示一个空框 —— 空的颜色输入会被
 * 读成「没有颜色」而不是「用的是默认色」。
 */
function indicatorParamsOf(chart: Chart, id: string): Omit<AdaChartProIndicatorParams, "id" | "name"> {
	const [indicator] = chart.getIndicators({ id });
	const figures = indicator?.figures ?? [];
	const overridden = (indicator?.styles?.lines ?? []).map((line) => line?.color);
	return {
		calcParams: numericCalcParams(indicator?.calcParams ?? []),
		lineColors: Array.from(
			{ length: lineFigureCount(figures) },
			(_, index) => lineColorAt(overridden, index),
		),
	};
}

/**
 * State a prop steers. When the prop's *identity* changes, the state takes
 * `next` — the resolved form of that prop, so a partial one still lands with its
 * defaults filled in. Between changes the state belongs to the UI: the toolbar
 * and the imperative API move it, and the next prop change claims it back.
 *
 * The comparison happens during render, which is the pattern React documents
 * for "a prop changed, adjust the state that follows it". An effect would render
 * the old value once and the new one after, so the chart would paint a stale
 * frame — and, because `resolveAdaChartProProps` hands back a fresh object every
 * render, an effect keyed on the resolved value re-fires on every parent render
 * and cascades a second render each time.
 *
 * 由 prop 掌舵的 state。prop 的*引用*一变，state 就取 `next` —— 那个 prop 的解析形态，
 * 因此只传了一半的 prop 也会带着默认值落地。两次变化之间 state 归界面所有：工具栏与命令式
 * API 都能改它，而下一个 prop 变化会把它收回。
 *
 * 比较发生在渲染期，这正是 React 为「prop 变了，据此调整跟随它的 state」记载的写法。用 effect
 * 会先渲染一次旧值、再渲染一次新值，图表便画出一帧过期画面；而且因为 `resolveAdaChartProProps`
 * 每次渲染都交回一个新对象，以解析值为依赖的 effect 会在父层每次渲染时重新触发，每次都多
 * 级联出一次渲染。
 */
function useSteered<T>(prop: unknown, next: T): [T, Dispatch<SetStateAction<T>>] {
	const [value, setValue] = useState(next);
	const [seen, setSeen] = useState<unknown>(prop);
	if (prop !== seen) {
		setSeen(prop);
		if (prop !== undefined) setValue(next);
	}
	return [value, setValue];
}

/**
 * Wraps `current` in the loader the chart is handed, so that one wrapper can
 * follow another: the returned object keeps one identity, while the loader it
 * stands in front of is read at call time and may be swapped by the caller.
 *
 * `current` is asked afresh on every call, which is the whole point — a `ref`
 * standing behind it is read then, never during render.
 *
 * 把 `current` 包成图表拿到的 loader，使一个包装器能跟随另一个：返回的对象保持同一引用，而它所
 * 代理的 loader 在调用时才读取，并且可以被调用方替换。
 *
 * 每次调用都重新问 `current`，这正是全部意义所在 —— 它背后的 `ref` 那一刻才被读取，绝不在渲染期。
 */
function observedLoaderFor(
	current: () => DataLoader,
	onState: (state: AdaChartProDataState) => void,
): DataLoader {
	return observeBars(
		{
			getBars: (params) => current().getBars(params),
			subscribeBar: (params) => current().subscribeBar?.(params),
			unsubscribeBar: (params) => current().unsubscribeBar?.(params),
		},
		onState,
	);
}

/**
 * The flagship Pro layer, built on {@link AdaChart} — i.e. on `klinecharts` v10
 * directly, with no second engine in the stack.
 *
 * `AdaChart` already owns the hard parts: one chart instance for the whole
 * lifetime, setters for style / locale / timezone, and rebuilds only when the
 * *set* of indicators or overlays really changes. So this layer adds only what
 * v10 does not ship: the toolbar, the watermark, and one place to hold the
 * values the toolbar moves.
 *
 * 旗舰 Pro 层，构建在 {@link AdaChart} 之上 —— 也就是直接构建在 `klinecharts` v10 上，
 * 技术栈里没有第二个引擎。
 *
 * `AdaChart` 已经承担了难的部分：图表实例终生只建一次、样式 / 语言 / 时区走 setter、
 * 只在指标或画线的*组合*真正变化时才重建。因此本层只补 v10 没有的东西：工具栏、水印，
 * 以及一个存放工具栏所改动取值的唯一位置。
 */
function AdaChartPro(props: AdaChartProProps) {
	const resolved = useMemo(() => resolveAdaChartProProps(props), [props]);

	// The nine values a caller can also steer through props. Each is seeded from
	// the resolved props and then handed to `useSteered`, which is what makes a
	// later prop change win the value back from the toolbar or the settings dialog.
	// 调用方也能通过 props 掌舵的九个取值。各自从解析后的 props 播种，随后交给 `useSteered` ——
	// 正是它让之后的 prop 变化把取值从工具栏或设置对话框手里收回。
	const [theme, setTheme] = useSteered(props.theme, resolved.theme);
	const [locale, setLocale] = useSteered(props.locale, resolved.locale);
	const [timezone, setTimezone] = useSteered(props.timezone, resolved.timezone);
	// The instrument as it was *asked for*, not as it resolved: a name has to
	// stay a name until a loader answers it, and the answer arrives through the
	// effect below. `resolved.symbolRequest` rather than `props.symbol` because an
	// absent symbol still needs the default instrument to stand in for it.
	//
	// 标的*被要求*时的样子，而不是解析后的样子：名称必须一直是名称，直到某个 loader 回答它，
	// 而那个回答经下面的 effect 到达。用 `resolved.symbolRequest` 而非 `props.symbol`，是因为
	// 标的缺省时仍需一个默认标的来代表它。
	const [symbolRequest, setSymbolRequest] = useSteered(
		props.symbol,
		resolved.symbolRequest,
	);
	const [period, setPeriod] = useSteered(props.period, resolved.period);
	const [mainIndicators, setMainIndicators] = useSteered(
		props.mainIndicators,
		resolved.mainIndicators,
	);
	const [subIndicators, setSubIndicators] = useSteered(
		props.subIndicators,
		resolved.subIndicators,
	);
	const [drawingBarVisible, setDrawingBarVisible] = useSteered(
		props.drawingBarVisible,
		resolved.drawingBarVisible,
	);
	/**
	 * The umbrella flag — the one the bar, that bar's toggle and the manager all
	 * answer to. A caller sets where a chart starts, and the settings dialog's last
	 * switch is where a reader answers for themselves; the prop wins the value back
	 * on a change, exactly as it does for the values above.
	 *
	 * The two switches below it only ever narrow this one: a manager still needs
	 * its own flag, and a bar still needs to be shown.
	 *
	 * 总开关 —— 画线栏、那条栏的开关与管理器共同回答的那一个。调用方决定图表从哪里开始，设置对话框
	 * 最后一行开关则是读者自己作答的地方；prop 变化时把取值收回，与上面那些值完全一样。
	 *
	 * 它下面那两个开关只会收窄它：管理器仍需自己的开关，栏仍需被显示出来。
	 */
	const [drawingEnabled, setDrawingEnabled] = useSteered(
		props.drawing,
		resolved.drawing,
	);

	const [tool, setTool] = useState<string | null>(null);
	/**
	 * A tool is a selection made on the drawing bar, and the bar exists only while
	 * drawing does — so the flag flipping retires the selection, during render.
	 *
	 * It has to be retired rather than merely ignored. `tool` is what the arming
	 * effect keys on, so a selection left standing behind a hidden bar would draw a
	 * shape at the next click; and a reader cannot have picked anything while the
	 * bar was away, so there is no intent to restore. Both directions clear it,
	 * which is why this is a `seen` compare rather than a one-way reset.
	 *
	 * 工具是在画线栏上做出的选择，而那条栏只在画线存在时存在 —— 因此开关翻转就在渲染期退掉这个选择。
	 *
	 * 必须真的退掉而不是听之任之。`tool` 正是选中效果（arming effect）的依赖，因此一个留在隐藏的栏
	 * 背后的选择会在下一次点击时画出一个形状；而栏不在时读者不可能选过任何东西，没有任何意图需要恢复。
	 * 两个方向都清掉它，这正是这里用 `seen` 比较而不是单向重置的原因。
	 */
	const [seenDrawing, setSeenDrawing] = useState(drawingEnabled);
	if (seenDrawing !== drawingEnabled) {
		setSeenDrawing(drawingEnabled);
		setTool(null);
	}
	/**
	 * The drawing layer's own settings, moved by the drawing bar. `mode` is the
	 * snapping behaviour of the next overlay; `locked` and `visible` describe the
	 * overlays already on the chart.
	 *
	 * 画线层自身的设置，由画线栏改动。`mode` 是下一条 overlay 的吸附行为；`locked` 与
	 * `visible` 描述已经在图表上的那些 overlay。
	 */
	const [overlayMode, setOverlayMode] = useState<OverlayMode>("weak_magnet");
	const [overlayLocked, setOverlayLocked] = useState(false);
	const [overlayVisible, setOverlayVisible] = useState(true);
	/**
	 * The drawing manager's inventory: what is on the chart, as the chart holds
	 * it, plus the names the reader has given those drawings, plus which one the
	 * canvas has selected.
	 *
	 * The rows are read back off the instance rather than assembled from what we
	 * created, because that is the only list that is complete: a caller may draw
	 * through `api.chart()` directly, and `removeOverlay` answers to a filter
	 * rather than to an id, so "what exists now" is a question only the chart can
	 * answer. See {@link refreshManagedOverlays}.
	 *
	 * Names are held here rather than written onto the overlays: `extendData` is
	 * the only field a name could live in, and it belongs to whoever created the
	 * overlay — a managed name that clobbers a caller's own data is a worse trade
	 * than a name that lives and dies with this component.
	 *
	 * 画线管理器的清单：图表上有什么（以图表自己的说法），加上读者给这些画线取的名字，以及画布选中的
	 * 是哪一条。
	 *
	 * 各行是从实例读回来的，而不是由我们创建时留下的记录拼出的，因为只有前者是完整的清单：调用方可能
	 * 直接用 `api.chart()` 画线，而 `removeOverlay` 只认过滤条件而不认某个 id，因此「现在有什么」只有
	 * 图表能回答。见 {@link refreshManagedOverlays}。
	 *
	 * 名字存在这里而不是写到 overlay 上：唯一能安放名字的字段是 `extendData`，而它属于创建那条 overlay
	 * 的人 —— 一个会把调用方自己的数据冲掉的托管名称，比一个与本组件同生共死的名称要糟得多。
	 */
	const [managedOverlays, setManagedOverlays] = useState<
		Array<Omit<AdaChartProDrawingRow, "label">>
	>([]);
	const [overlayNames, setOverlayNames] = useState<Record<string, string>>({});
	/** The overlay the canvas has selected. Only the canvas can start a selection — v10 has no API for it. 画布已选中的 overlay。只有画布能发起选中 —— v10 没有对应 API。 */
	const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
	/** Whether the manager's panel is open. Its availability is the feature flag; this is only the panel. 管理器面板是否打开。它是否可用取决于功能开关，这里只是面板。 */
	const [drawingManagerOpen, setDrawingManagerOpen] = useState(false);
	/**
	 * The captured chart image the toolbar's dialog is showing, or `null` when no
	 * dialog is open. Held here rather than in the toolbar because producing it
	 * needs the chart instance, which only this layer has.
	 *
	 * 工具栏对话框正在展示的截取图片；无对话框时为 `null`。由本层而非工具栏持有，因为产出它
	 * 需要图表实例，而只有本层有。
	 */
	const [screenshot, setScreenshot] = useState<string | null>(null);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [ready, setReady] = useState(false);
	/**
	 * What the chart is doing with its data, so the loading and empty overlays can
	 * be shown. The engine has no callback for this — "still waiting" is a question
	 * about the UI, not about the data — so it is reported by the wrapped loader.
	 *
	 * 图表数据的当前状态，供加载中与空状态遮罩显示。引擎没有对应回调 ——「还在等吗」是关于界面
	 * 而非数据的问题 —— 因此由被包装的 loader 上报。
	 */
	const [dataState, setDataState] = useState<AdaChartProDataState>("loading");
	/** Which of the three settings dialogs is open. 三个设置对话框中哪一个打开着。 */
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [timezoneOpen, setTimezoneOpen] = useState(false);
	const [indicatorParams, setIndicatorParams] =
		useState<AdaChartProIndicatorParams | null>(null);
	/**
	 * The appearance dialog's model and its patch. The model is what the form shows
	 * — seeded from the live styles each time it opens, so it shows what is really
	 * on screen — and the patch is that same model as a `Styles` tree.
	 *
	 * 外观对话框的模型与其补丁。模型是表单显示的东西 —— 每次打开时由活的样式播种，因此展示的是
	 * 屏幕上真实的取值 —— 而补丁就是同一个模型写成 `Styles` 树。
	 */
	const [settings, setSettings] = useState<AdaChartProSettings>(
		ADACHARTPRO_DEFAULT_SETTINGS,
	);
	const [settingsPatch, setSettingsPatch] = useState<DeepPartial<Styles> | null>(
		null,
	);
	/**
	 * Style patches applied through {@link AdaChartProApi.setStyles}. They are a
	 * layer rather than an instance-side push, because `AdaChart` republishes the
	 * tree it is handed on every render and would wipe an instance-side one.
	 *
	 * 经 {@link AdaChartProApi.setStyles} 应用的样式补丁。它们是一层而非实例侧的推送，因为
	 * `AdaChart` 每次渲染都会重新下发它拿到的树，会把实例侧的那个抹掉。
	 */
	const [apiStyles, setApiStyles] = useState<DeepPartial<Styles> | null>(null);
	/**
	 * Whether the price axis runs high-to-low. v10 has no style for this, so unlike
	 * every other row of the appearance dialog it is an axis override rather than a
	 * patch, and it is held as its own piece of state.
	 *
	 * 价格轴是否由高到低。v10 没有对应的样式，因此与外观对话框的其它行不同，它是坐标轴覆盖而非
	 * 补丁，也就单独持有一份状态。
	 */
	const [reverseAxis, setReverseAxis] = useState(false);

	/** The raw instance, for the drawing API and for {@link AdaChartProApi.chart}. 原始实例，供画线 API 与 {@link AdaChartProApi.chart} 使用。 */
	const chartRef = useRef<Chart | null>(null);
	/**
	 * The wrapper's own root: what fullscreen is requested on, so the whole
	 * terminal is maximised rather than the chart alone, and what the surface
	 * colour is read from when capturing. `@klinecharts/pro` requests fullscreen
	 * on its widget root for the same reason.
	 *
	 * 外层自己的根元素：全屏请求作用于它，因此被最大化的是整个终端而不是只有图表；截图时
	 * 表面色也从它读取。`@klinecharts/pro` 出于同样的原因把全屏请求作用在它的 widget 根元素上。
	 */
	const rootRef = useRef<HTMLDivElement | null>(null);
	/**
	 * One OKX loader per instance, so the poll timers have an owner to stop. It is
	 * built once by the state initialiser rather than lazily in a ref during
	 * render, so the reference is stable and legal to read while rendering.
	 *
	 * 每个实例一个 OKX loader，使轮询计时器有明确的停止方。它由 state 初始化函数构建一次，
	 * 而不是在渲染期惰性写进 ref —— 因此引用稳定，且在渲染期读取是合法的。
	 */
	const [defaultLoader] = useState(() => new OkxDataLoader());

	// `resolved.dataLoader ?? defaultLoader` is two stable references, so the choice
	// needs no memo of its own — and it has to be made here rather than below,
	// because the wrapped loader is built from it.
	// `resolved.dataLoader ?? defaultLoader` 是两个稳定引用，因此这个选择不需要自己的
	// memo —— 它必须在这里而不是更下方做，因为被包装的 loader 由它构建。
	// Annotated rather than inferred: the two branches would otherwise unite into
	// `AdaChartProDataLoader | OkxDataLoader`, and `OkxDataLoader` does not declare
	// the optional `resolveSymbol` this layer reads below.
	// 写明注解而非推断：否则两个分支会合并成 `AdaChartProDataLoader | OkxDataLoader`，
	// 而 `OkxDataLoader` 没有声明本层下方要读的可选 `resolveSymbol`。
	const dataLoader: AdaChartProDataLoader = resolved.dataLoader ?? defaultLoader;

	/**
	 * The loader the chart is actually handed while the current one is always the
	 * one being called.
	 *
	 * `AdaChart` installs a loader on mount and never again, so the object passed
	 * down has to keep one identity for the chart's life; but the *delegate* it
	 * stands in front of changes whenever the caller swaps `dataLoader`. Reading it
	 * through a ref at call time is what lets one wrapper follow the other.
	 *
	 * `useRef(dataLoader)` seeds the delegate with *this* render's loader, so the
	 * `getBars` that `AdaChart` fires from its own mount effect — which runs before
	 * any effect of ours — already reaches the right one. The effect below then
	 * takes over for every later swap, and it is declared before the chart is
	 * handed down, so a replaced loader is in place before the chart can ask for
	 * anything with it.
	 *
	 * 图表实际拿到的 loader，同时保证当前生效的那个始终是被调用的那个。
	 *
	 * `AdaChart` 只在挂载时装一次 loader、此后再不更换，因此下发下去的对象必须在图表一生中保持
	 * 同一引用；但它所代理的*实体*会随调用方替换 `dataLoader` 而变。在调用时经 ref 读取实体，
	 * 正是一个包装器能跟随另一个的原因。
	 *
	 * `useRef(dataLoader)` 用*本次*渲染的 loader 播种该实体，因此 `AdaChart` 从它自己的挂载
	 * effect（先于本组件的任何 effect 运行）里发出的那次 `getBars` 已经到达正确的那个。此后的每次
	 * 替换由下面的 effect 接手；它声明在下发图表之前，所以被换掉的 loader 会先就位，图表才可能拿它
	 * 去要东西。
	 */
	const loaderRef = useRef<DataLoader>(dataLoader);
	useEffect(() => {
		loaderRef.current = dataLoader;
	}, [dataLoader]);
	// `observeBars` only stores the getter; the chart calls it when it wants bars,
	// which is never during render. The rule cannot see that through
	// `observedLoaderFor`, so it reads this as a render-time read and is silenced.
	// `observeBars` 只是把这个取值函数存下来；图表索要数据时才会调用它，绝不在渲染期。规则
	// 看不穿 `observedLoaderFor`，会把它读成渲染期取值，因此在这里抑制。
	// oxlint-disable-next-line react/refs
	const [observedLoader] = useState<DataLoader>(() =>
		observedLoaderFor(() => loaderRef.current, setDataState),
	);

	/**
	 * The instrument the chart is handed, or `null` while a name is still being
	 * resolved.
	 *
	 * `null` is not "no instrument", it is "not yet", and it is what keeps the
	 * chart from being built on a guess: `AdaChart` asks its loader for a window
	 * the moment it exists, so a chart raised on an unresolved name would fetch
	 * bars for a ticker the venue may never have heard of, and that answer would
	 * have to be thrown away a moment later. The spinner already standing in for
	 * "waiting for data" covers this stall too.
	 *
	 * It is only ever `null` for the *first* instrument. A later one leaves the
	 * current instrument on screen until its own resolution lands, so swapping
	 * instruments never tears the chart — and everything drawn on it — down.
	 *
	 * 图表拿到的标的；某个名称还在解析中时为 `null`。
	 *
	 * `null` 不是「没有标的」，而是「还没有」，正是它让图表不会建在一个猜测上：`AdaChart`
	 * 一存在就向 loader 索要一个窗口，因此建在一个尚未解析的名称上的图表，会为一个数据源可能
	 * 从未听说过的 ticker 取 K 线，而那份答案片刻之后就得丢掉。已经在代表「等数据」的加载动画
	 * 同样覆盖这段等待。
	 *
	 * 它只会在*第一个*标的上为 `null`。之后的标的会让当前标的留在屏幕上，直到它自己的解析落地，
	 * 因此换标的永远不会把图表 —— 连同画在上面的一切 —— 拆掉。
	 */
	const [symbol, setSymbol] = useState<SymbolInfo | null>(() =>
		typeof resolved.symbolRequest === "string" &&
		resolved.dataLoader?.resolveSymbol
			? null
			: resolved.symbol,
	);

	/**
	 * Turns the requested instrument into the one the chart is handed.
	 *
	 * An object needs no loader: every field the caller left out is filled from
	 * the defaults, which is what the layer has always done for a partial symbol.
	 * A name needs one only when the loader offers `resolveSymbol`; without it the
	 * name *is* the ticker, which is the only reading v10 itself makes of a name.
	 *
	 * `live` is the whole of the race protection. A name that changes while an
	 * answer is in flight retires the older run, so the last instrument asked for
	 * is the one that lands — the alternative is an earlier venue answering after
	 * a later one and quietly undoing the reader's choice.
	 *
	 * 把被要求的标的变成交给图表的那个。
	 *
	 * 对象不需要 loader：调用方没写的每个字段都由默认值补齐，这也正是本层对局部标的一贯做法。
	 * 名称只在 loader 提供 `resolveSymbol` 时才需要它；没有它，名称*就是* ticker，这也是 v10
	 * 自己对名称的唯一读法。
	 *
	 * `live` 就是竞态保护的全部。答案在路上时改变名称会作废较早的那次运行，因此最后被要求的标的
	 * 才是落地的那个 —— 否则先前的数据源可能在后来的那次之后作答，把读者的选择悄悄撤销。
	 */
	useEffect(() => {
		const resolve = dataLoader.resolveSymbol;
		if (typeof symbolRequest !== "string" || resolve === undefined) {
			// The no-venue branch is a derivation, and the rule reads it as a
			// needless render. It cannot be moved into render: the state it writes
			// is also what a *later* name keeps on screen while its venue answers,
			// so the object case has to record itself here for that name to look
			// back on. The other branch is the external system this effect is
			// really for.
			// 无数据源的那个分支是一次推导，规则把它读成多余的渲染。它挪不进渲染期：它写入的
			// 状态同时也是*后来的*名称在数据源作答期间留在屏幕上的东西，因此对象这一支必须在
			// 这里记下自己，那个名称才回顾得到。另一支才是本 effect 真正为之而设的外部系统。
			// oxlint-disable-next-line react/set-state-in-effect
			setSymbol(symbolInfoFrom(symbolRequest));
			return;
		}
		let live = true;
		void resolveAdaChartProSymbol(dataLoader, resolve, symbolRequest).then(
			(next) => {
				if (live) setSymbol(next);
			},
			(error) => {
				if (!live) return;
				// Failing soft, like a history page does: a name the venue cannot
				// place is still a name, and refusing to draw anything would be a
				// worse answer than drawing it under that name.
				// 像历史翻页那样软失败：数据源认不出的名称仍然是个名称，什么都不画比按这个名字画
				// 更糟。
				console.warn(
					"[AdaChartPro] resolveSymbol failed; reading the name as the ticker.",
					error,
				);
				setSymbol(symbolInfoFrom(symbolRequest));
			},
		);
		return () => {
			live = false;
		};
	}, [symbolRequest, dataLoader]);

	/**
	 * What the chrome shows: the instrument on screen, or the local reading of the
	 * one still being resolved. The toolbar should name what the reader asked for
	 * rather than go blank while a venue is answering.
	 *
	 * 外围显示的东西：屏幕上的标的，或那个仍在解析中的标的的本地读法。工具栏应当说出读者要的是
	 * 什么，而不是在数据源作答时变成一片空白。
	 */
	const displaySymbol = symbol ?? resolved.symbol;

	/**
	 * The values as they stand this render, read by the imperative API — which
	 * must keep one identity for the chart's whole life.
	 *
	 * 本次渲染下的取值，供命令式 API 读取 —— 后者必须在图表的整个生命周期里保持同一个引用。
	 */
	const stateRef = useRef({
		props,
		resolved,
		theme,
		locale,
		timezone,
		symbol: displaySymbol,
		period,
		tool,
	});
	useEffect(() => {
		stateRef.current = {
			props,
			resolved,
			theme,
			locale,
			timezone,
			symbol: displaySymbol,
			period,
			tool,
		};
	});

	/**
	 * The same "as of this render" idea for the drawing layer's two creation-time
	 * settings, kept apart from {@link stateRef} because the arming effect below
	 * must read them *without* listing them as dependencies: a magnet flipped
	 * while an overlay is half drawn has to land on that overlay through
	 * `overrideOverlay`, not by tearing the overlay down and building a new one,
	 * which would strand the half-drawn one outside every pane map.
	 *
	 * 画线层那两项「创建时」设置的同一套「本渲染取值」思路。它与 {@link stateRef} 分开，是因为
	 * 下面的选中工具 effect 必须读到它们、但不能把它们列为依赖：在一条 overlay 画到一半时切换
	 * 磁吸，必须通过 `overrideOverlay` 落在那条 overlay 上，而不是把它拆掉重建 —— 重建会让这条
	 * 半成品遗留在所有 pane 映射之外。
	 */
	const drawingRef = useRef({ mode: overlayMode, lock: overlayLocked });
	useEffect(() => {
		drawingRef.current.mode = overlayMode;
		drawingRef.current.lock = overlayLocked;
	}, [overlayMode, overlayLocked]);

	/**
	 * The manager's feature flag, held where the overlay bridge can read it without
	 * naming it as a dependency. The bridge is built into the overlay at creation
	 * time, and that creation is an *effect keyed on the armed tool* — re-running it
	 * would take away the overlay being drawn. A flag that arrived as a dependency
	 * would therefore cost the reader the line they were halfway through.
	 *
	 * 画线管理器的功能开关，放在 overlay 事件桥能读到、却不必把它列为依赖的地方。事件桥是在创建
	 * overlay 时写进去的，而那次创建是一个*以已选工具为依赖的 effect* —— 重跑它会把正在画的那条
	 * overlay 收走。因此若让这个开关作为依赖传进来，代价就是读者画到一半的那条线。
	 *
	 * The umbrella narrows it: a panel that accounts for what has been drawn cannot
	 * outlive the surface that draws, so `drawing: false` means no panel whichever
	 * way {@link AdaChartProProps.drawingManager} is set.
	 *
	 * 总开关收窄它：一块清点已画对象的面板不可能活得比绘制它的界面更久，因此 `drawing: false` 意味着
	 * 没有面板，无论 {@link AdaChartProProps.drawingManager} 怎么设。
	 */
	const drawingManagerEnabled = drawingEnabled && resolved.drawingManager;
	const managerEnabledRef = useRef(drawingManagerEnabled);
	useEffect(() => {
		managerEnabledRef.current = drawingManagerEnabled;
	}, [drawingManagerEnabled]);

	/**
	 * Re-reads the chart's overlays into the manager's rows.
	 *
	 * Everything that changes a drawing calls this rather than editing the rows it
	 * already has. The chart is the one place that knows what exists — an overlay
	 * may be removed by a filter that names several, or by the caller through the
	 * raw instance — so a list maintained beside it would be a second answer to a
	 * question that already has one.
	 *
	 * The bridge below keeps the rows live between calls; the refresh the toolbar's
	 * toggle performs is what puts drawings into the list that predate the bridge,
	 * since a drawing made while the flag was off carries no callbacks.
	 *
	 * A drawing with no points yet is left out: an armed tool creates its overlay
	 * immediately, so a row would appear the moment a tool is clicked and vanish
	 * again if the reader changes their mind — see the arming effect, which removes
	 * exactly that empty draft.
	 *
	 * 把图表上的 overlay 重新读成管理器的各行。
	 *
	 * 凡是会改变画线的操作都调它，而不是去改手上已有的那些行。图表是唯一知道「存在什么」的地方 ——
	 * 一条 overlay 可能被一个点名多条图形的过滤条件移除，也可能被调用方经原始实例移除 —— 因此旁边
	 * 再维护一份清单，等于对同一个已有答案的问题给出第二个答案。
	 *
	 * 下面的事件桥负责在两次调用之间让各行保持新鲜；工具栏开关所做的那次刷新，负责把事件桥之前就
	 * 存在的画线放进清单，因为开关关闭时画出的线不带任何回调。
	 *
	 * 还没有落锚点的画线不在其列：选中工具会立刻创建它的 overlay，因此若把空画线也列出来，一点工具
	 * 就会出现一行、读者改主意又消失 —— 见选中工具的那个 effect，它移除的正是这条空草稿。
	 */
	const refreshManagedOverlays = useCallback(() => {
		if (!managerEnabledRef.current) return;
		const chart = chartRef.current;
		if (!chart) return;
		setManagedOverlays(
			chart
				.getOverlays()
				.filter((overlay) => overlay.points.length > 0)
				.map((overlay) => ({
					id: overlay.id,
					name: overlay.name,
					locked: overlay.lock,
					visible: overlay.visible,
				})),
		);
	}, []);

	// The default feed is ours to stop; a caller-supplied one is the caller's.
	// 默认数据源由我们停止；调用方提供的那个由调用方负责。
	useEffect(() => () => defaultLoader.dispose(), [defaultLoader]);

	/**
	 * Main-pane indicators are created first and stacked onto the candle pane
	 * (`stack: true`); sub-pane indicators follow, each opening its own pane.
	 *
	 * 主图指标先创建并叠加到蜡烛面板上（`stack: true`）；副图指标随后创建，各自开启新面板。
	 */
	const indicators = useMemo<AdaChartIndicator[]>(
		() => [
			...mainIndicators.map((name) => ({ name, stack: true })),
			...subIndicators.map((name) => ({ name, stack: false })),
		],
		[mainIndicators, subIndicators],
	);

	/**
	 * The drawing bar's groups, filtered by the caller's `drawingTools` — an empty
	 * list means "everything", so the default offers every group `AdaChart` can
	 * draw. The filter is applied to groups rather than to a flat name list
	 * because a group whose every member is filtered out has no glyph to show and
	 * must disappear with them.
	 *
	 * 画线栏的分组，按调用方的 `drawingTools` 过滤 —— 空列表表示「全部」，因此默认提供
	 * `AdaChart` 能画的每一组。过滤作用于分组而非扁平名单：成员全被滤掉的组没有图标可显示，
	 * 必须随之消失。
	 */
	const drawingGroups = useMemo(
		() => drawingGroupsFor(resolved.drawingTools),
		[resolved.drawingTools],
	);

	/**
	 * The style tree handed to `AdaChart`, built as one object from three layers in
	 * a stated order: the Pro defaults (the three legend icons), the caller's
	 * `styles` prop, whatever `AdaChartProApi.setStyles` has patched in, and finally
	 * the appearance dialog's changes.
	 *
	 * One tree rather than a `setStyles` call, because `AdaChart` republishes the
	 * tree it is given on every render: an instance-side push would be overwritten
	 * by the next render and the change would silently disappear.
	 *
	 * 交给 `AdaChart` 的样式树，由三层按写明的次序合成一个对象：Pro 的默认值（三个图例图标）、
	 * 调用方的 `styles` 属性、`AdaChartProApi.setStyles` 打进来的补丁，最后是外观对话框的改动。
	 *
	 * 之所以是一棵树而不是一次 `setStyles` 调用，是因为 `AdaChart` 每次渲染都会重新下发它拿到的
	 * 树：实例侧的推送会被下一次渲染覆盖，改动会无声消失。
	 */
	const styles = useMemo(
		() =>
			mergeAdaChartProStyles(
				indicatorTooltipStyles(theme),
				resolved.styles,
				apiStyles ?? undefined,
				settingsPatch ?? undefined,
			),
		[theme, resolved.styles, apiStyles, settingsPatch],
	);

	/**
	 * The date formatter for the current bar size. v10 would use one template for
	 * every period; the whole point of this one is to pick the shape from the
	 * period, so the axis says `14:30` on a minute chart and `2026` on a yearly one.
	 *
	 * Memoized because the formatter owns an `Intl` cache: rebuilding it on every
	 * render would rebuild that cache too.
	 *
	 * 当前周期的日期格式化器。v10 对每种周期都用一个模板；而这里的全部意义就是从周期决定形状，
	 * 使坐标轴在分钟图上说 `14:30`、在年线图上说 `2026`。
	 *
	 * 之所以记忆化，是因为该格式化器持有一份 `Intl` 缓存：每次渲染重建它也会重建那份缓存。
	 */
	const formatter = useMemo<Partial<Formatter>>(
		() => ({ formatDate: dateFormatterFor(period.type, locale, timezone) }),
		[period.type, locale, timezone],
	);

	/**
	 * The quote currency shown on the price axis, upper-cased as `@klinecharts/pro`
	 * shows it. Absent when the symbol names none — see
	 * {@link resolveAdaChartProProps}, which derives one from a `BASE-QUOTE` ticker.
	 *
	 * 价格轴上显示的计价币，按 `@klinecharts/pro` 的写法转为大写。标的没有点明时为空 ——
	 * 见 {@link resolveAdaChartProProps}，它会从 `BASE-QUOTE` 形式的代码里推导一个。
	 */
	const priceUnit =
		typeof displaySymbol.priceCurrency === "string"
			? displaySymbol.priceCurrency.toUpperCase()
			: "";

	/**
	 * One identity for the chart's lifetime: a new object per render would break
	 * `AdaChart`'s `memo` and re-run its prop effects for nothing.
	 *
	 * 图表整个生命周期内只此一个引用：每次渲染都新建对象会破坏 `AdaChart` 的 `memo`，
	 * 并让它的各属性 effect 白白重跑。
	 */
	const api = useMemo<AdaChartProApi>(
		() => ({
			chart: () => chartRef.current,
			setSymbol: setSymbolRequest,
			getSymbol: () => stateRef.current.symbol,
			setPeriod,
			getPeriod: () => stateRef.current.period,
			setTheme,
			getTheme: () => stateRef.current.theme,
			setLocale,
			getLocale: () => stateRef.current.locale,
			setTimezone,
			getTimezone: () => stateRef.current.timezone,
			setMainIndicators,
			setSubIndicators,
			setTool,
			getTool: () => stateRef.current.tool,
			setStyles: (patch) =>
				setApiStyles((current) => mergeAdaChartProStyles(current ?? {}, patch)),
			getStyles: () => chartRef.current?.getStyles() ?? null,
		}),
		// Every setter here keeps one identity for the component's life, so listing
		// them does not make the API object any less permanent — it only says out
		// loud which values it captures. The seven that come from `useSteered` have
		// to be named: they are `useState` setters returned through a function, and
		// nothing but this array tells a reader (or a linter) that they are stable.
		//
		// 这里的每个 setter 在组件一生中都保持同一引用，因此把它们列出来并不会让 API 对象变得
		// 短命 —— 只是把「它捕获了哪些值」写明。来自 `useSteered` 的那七个必须点名：它们是被一个
		// 函数转手返回的 `useState` setter，除了这个数组，再没有别处能告诉读者（或 linter）
		// 它们是稳定的。
		[
			setSymbolRequest,
			setPeriod,
			setTheme,
			setLocale,
			setTimezone,
			setMainIndicators,
			setSubIndicators,
		],
	);

	const handleChartReady = useCallback(
		(chart: Chart) => {
			chartRef.current = chart;
			setReady(true);
			stateRef.current.props.onChartReady?.(api);
		},
		[api],
	);

	/**
	 * Arming a tool means asking the engine to start drawing it: v10's
	 * `createOverlay({ name })` puts the overlay into its interactive drawing
	 * state machine, and `onDrawEnd` is the signal that the last anchor landed.
	 *
	 * The overlay is tagged with `ADACHARTPRO_DRAWING_GROUP_ID`, which is what
	 * makes "clear all" mean "everything the bar drew" rather than "everything on
	 * the chart" — `@klinecharts/pro` leaves this tag off and so cannot tell the
	 * two apart.
	 *
	 * `mode` and `locked` are handed over at creation so the bar's state reaches
	 * the *next* overlay as well as the existing ones: `overrideOverlay` only
	 * walks overlays that already exist, so without them the magnet and the lock
	 * would silently forget about the drawing in progress. `visible` is
	 * deliberately left out — the engine refuses to draw an overlay whose
	 * `visible` is `false`, and that includes the one being drawn, so passing it
	 * would make the tool look broken rather than hidden.
	 *
	 * 选中工具即请引擎开始绘制：v10 的 `createOverlay({ name })` 会把该画线推进它自己的
	 * 交互状态机，`onDrawEnd` 则是最后一枚锚点落下的信号。
	 *
	 * 画线带着 `ADACHARTPRO_DRAWING_GROUP_ID` 这个标记，正是它让「清空全部」意指「画线栏画的
	 * 全部」而非「图表上的全部」—— `@klinecharts/pro` 没有打这个标记，因此区分不了两者。
	 *
	 * `mode` 与 `locked` 在创建时就交给引擎，使画线栏的状态同样作用于*下一条* overlay 而不只是
	 * 已有的那些：`overrideOverlay` 只遍历已经存在的 overlay，不这样做的话磁吸与锁定会悄悄
	 * 忘掉正在画的那一条。`visible` 刻意不传 —— 引擎会拒绝绘制 `visible` 为 `false` 的
	 * overlay，正在画的那条也不例外，传了只会让工具看起来是坏的，而不是被隐藏。
	 */
	useEffect(() => {
		// `ready` is the chart's existence signal: the instance arrives through
		// `onChartReady`, so arming a tool before that has nothing to draw on.
		// `ready` 是图表是否存在的信号：实例通过 `onChartReady` 到达，因此在那之前选中工具
		// 没有任何东西可画。
		const chart = ready ? chartRef.current : null;
		if (!chart || !tool) return;
		const create: OverlayCreate = {
			name: tool,
			groupId: ADACHARTPRO_DRAWING_GROUP_ID,
			mode: drawingRef.current.mode,
			lock: drawingRef.current.lock,
			onDrawEnd: () => {
				setTool(null);
				refreshManagedOverlays();
			},
			// The manager's bridge. Overlay events do **not** arrive through
			// `subscribeAction` — v10's action list cannot see an overlay — so the
			// only way back into React state is on the overlay itself, and it has to
			// be attached as the overlay is created.
			//
			// Attached only while the flag is on, read through the ref rather than
			// listed as a dependency: this effect creates an overlay, so re-running it
			// for a flag change would take the half-drawn one away. A drawing made
			// while the flag is off carries no bridge, which is what the refresh on
			// opening the panel exists to cover.
			//
			// 管理器的桥。overlay 的事件**不**经 `subscribeAction` 传来 —— v10 的动作清单看不见
			// overlay —— 因此回到 React 状态只有写在 overlay 上这一条路，而且必须在创建它的那一刻
			// 一起写入。
			//
			// 只在开关打开时挂上，且经 ref 读取而不是列为依赖：本 effect 会创建 overlay，因此为开关
			// 变化重跑它会把正在画的那条收走。开关关闭时画出的线不带桥，这正是「打开面板时刷新一次」
			// 要覆盖的情形。
			...(managerEnabledRef.current
				? {
						onRemoved: refreshManagedOverlays,
						onSelected: ({ overlay }: OverlayEvent<unknown>) =>
							setSelectedOverlayId(overlay.id),
						// Guarded by id so a stale `onDeselected` from an overlay that
						// was already replaced cannot clear a newer selection.
						// 按 id 校验，使一条已被替换的 overlay 迟到的 `onDeselected` 无法清掉
						// 更新的那次选中。
						onDeselected: ({ overlay }: OverlayEvent<unknown>) =>
							setSelectedOverlayId((current) =>
								current === overlay.id ? null : current,
							),
					}
				: {}),
		};
		const created = chart.createOverlay(create);
		const id = typeof created === "string" ? created : null;
		return () => {
			if (!id) return;
			// Switching or clearing the tool before a single anchor was placed
			// would otherwise strand an empty overlay on the chart.
			// 若在一个锚点都没落下前就换工具或清空工具，这里要收掉那条空画线，否则它会滞留在图表上。
			const [draft] = chart.getOverlays({ id });
			if (draft && draft.points.length === 0) chart.removeOverlay({ id });
		};
	}, [tool, ready, refreshManagedOverlays]);

	/**
	 * The bar's three toggles are layer state: each lands on every overlay the
	 * chart holds, the one being drawn included, which is why a magnet flipped
	 * mid-drawing reaches the drawing itself. Unfiltered on purpose, matching
	 * `@klinecharts/pro`.
	 *
	 * 画线栏的三个开关是层状态：每个都作用于图表持有的每一条 overlay，正在画的那条也在内 ——
	 * 因此在绘制途中切换磁吸会作用到那条正在画的线。刻意不加过滤条件，与 `@klinecharts/pro`
	 * 一致。
	 */
	useEffect(() => {
		const chart = ready ? chartRef.current : null;
		if (!chart) return;
		chart.overrideOverlay({
			mode: overlayMode,
			lock: overlayLocked,
			visible: overlayVisible,
		});
		// The manager's rows carry each overlay's lock and visibility, and this
		// writes both on every overlay at once — so the rows are stale from here
		// unless they are read again.
		// 管理器的各行带着每条 overlay 的锁定与可见性，而这里一次改掉所有 overlay 的这两项 ——
		// 因此除非重读一次，各行从此就是过期的。
		refreshManagedOverlays();
	}, [
		overlayMode,
		overlayLocked,
		overlayVisible,
		ready,
		refreshManagedOverlays,
	]);

	/**
	 * Clearing drops everything the bar drew and disarms the tool with it: the
	 * engine removes a half-drawn overlay without firing `onDrawEnd`, so without
	 * this the bar would keep a tool highlighted that has nothing left to draw.
	 *
	 * 清空会丢掉画线栏画的一切，并同时取消已选工具：引擎移除半画的 overlay 时不会触发
	 * `onDrawEnd`，不这样做的话画线栏会继续高亮一个已经没有东西可画的工具。
	 */
	const handleRemoveAll = useCallback(() => {
		chartRef.current?.removeOverlay({ groupId: ADACHARTPRO_DRAWING_GROUP_ID });
		setTool(null);
		refreshManagedOverlays();
	}, [refreshManagedOverlays]);

	/**
	 * The manager's rows: the inventory plus the names the reader has given, with
	 * the tool's own label standing in until a drawing is named. One object per
	 * row rather than a lookup at render, so the panel can be handed its props and
	 * nothing else.
	 *
	 * 管理器的各行：清单加上读者给的名字；被命名之前，由工具自己的文案代为显示。每行一个对象而非
	 * 渲染时再去查表，使面板拿到的就是它的全部 props。
	 */
	const managerRows = useMemo<readonly AdaChartProDrawingRow[]>(
		() =>
			managedOverlays.map((overlay) => ({
				...overlay,
				label:
					overlayNames[overlay.id] ??
					drawingToolLabel(locale, overlay.name),
			})),
		[managedOverlays, overlayNames, locale],
	);

	/**
	 * The panel's five actions are all "the chart said this, believe it": each
	 * calls the instance and then re-reads it, so a lock that the engine refused
	 * cannot be shown as taken. Rename is the only one that writes somewhere other
	 * than the chart — the name lives in this layer, see the state's comment — and
	 * it is the only one that needs to be read back through the rows rather than
	 * through the chart.
	 *
	 * 面板的五个操作全都是「图表说了算，信它」：每个都先调用实例再重读，因此被引擎拒绝的锁定不会
	 * 被显示为已锁上。重命名是唯一写到图表以外之处的 —— 名字存在本层，见状态的注释 —— 也是唯一
	 * 需要靠各行读回来、而不是靠图表读回来的。
	 */
	const handleManagerRename = useCallback(
		(id: string, label: string) => {
			setOverlayNames((current) => ({ ...current, [id]: label }));
		},
		[],
	);

	const handleManagerToggleLock = useCallback(
		(id: string) => {
			const chart = chartRef.current;
			if (!chart) return;
			const [overlay] = chart.getOverlays({ id });
			if (!overlay) return;
			chart.overrideOverlay({ id, lock: !overlay.lock });
			refreshManagedOverlays();
		},
		[refreshManagedOverlays],
	);

	const handleManagerToggleVisible = useCallback(
		(id: string) => {
			const chart = chartRef.current;
			if (!chart) return;
			const [overlay] = chart.getOverlays({ id });
			if (!overlay) return;
			chart.overrideOverlay({ id, visible: !overlay.visible });
			refreshManagedOverlays();
		},
		[refreshManagedOverlays],
	);

	/**
	 * One rung up the overlay's stack rather than a computed value: raising a line
	 * above a tall one could need a long jump, and the engine does not say which
	 * `zLevel`s are taken — a guaranteed step is more use than a guessed one.
	 *
	 * 在 overlay 的栈上抬一级，而不是取一个算出来的值：要把一条线抬到很高的那条之上可能得跳很远，
	 * 而引擎不会说明哪些 `zLevel` 已被占用 —— 一个保证生效的步进，比一个猜出来的数值有用。
	 */
	const handleManagerBringToFront = useCallback(
		(id: string) => {
			const chart = chartRef.current;
			if (!chart) return;
			const [overlay] = chart.getOverlays({ id });
			if (!overlay) return;
			chart.overrideOverlay({ id, zLevel: overlay.zLevel + 1 });
			refreshManagedOverlays();
		},
		[refreshManagedOverlays],
	);

	/**
	 * `removeOverlay` answers to a filter rather than to an id, so removing is
	 * scoped by the id — the same escape `@klinecharts/pro` uses to keep "clear
	 * all" from meaning "clear everything". The id-filter still goes through the
	 * chart, because that is where "does it exist" is answered.
	 *
	 * `removeOverlay` 只认过滤条件而不认某个 id，因此删除以 id 限定范围 —— 与 `@klinecharts/pro`
	 * 让「清空全部」不至于变成「清空一切」所用的同一种脱身法。id 过滤仍经图表走，因为「它是否存在」
	 * 只有那里有答案。
	 */
	const handleManagerDelete = useCallback(
		(id: string) => {
			chartRef.current?.removeOverlay({ id });
			setOverlayNames((current) => {
				if (!(id in current)) return current;
				const next = { ...current };
				delete next[id];
				return next;
			});
			setSelectedOverlayId((current) => (current === id ? null : current));
			refreshManagedOverlays();
		},
		[refreshManagedOverlays],
	);

	/**
	 * Opening the panel first reads the chart: a drawing made while the flag was
	 * off carries no bridge, so nothing has kept its row fresh — see the state's
	 * comment. Closing reads it too rather than being special-cased: the read is
	 * idempotent, and a branch that skipped it would be a second thing to keep
	 * true.
	 *
	 * 打开面板先读一次图表：开关关闭时画出的线不带桥，因此没有东西在保持它的行新鲜 —— 见状态的
	 * 注释。关闭时同样读一次，而不是为它单开一条分支：这次读取是幂等的，而一条跳过它的分支就是
	 * 又多了一件要保证为真的事。
	 */
	const handleToggleDrawingManager = useCallback(() => {
		setDrawingManagerOpen((current) => !current);
		refreshManagedOverlays();
	}, [refreshManagedOverlays]);

	/**
	 * The toolbar's drawing-bar toggle. The bar is chrome, so showing it does not
	 * change any chart option — but it does change how much width the chart has,
	 * which the engine learns about by measuring again. That re-measure is the
	 * `ResizeObserver` {@link AdaChart} keeps on the chart's host: hiding the bar
	 * widens that host, and the observer already turns that into a `resize()`. A
	 * second call from here would measure the same box twice.
	 *
	 * 工具栏的画线栏开关。画线栏是外围，显示它不改变任何图表选项 —— 但它改变了图表可用的宽度，
	 * 而引擎通过重新测量得知这一点。那次重新测量由 {@link AdaChart} 在图表宿主上保持的
	 * `ResizeObserver` 承担：隐藏画线栏会撑宽那个宿主，观察器已经把它变成一次 `resize()`。
	 * 这里再调一次只会对同一个盒子测量两遍。
	 */
	const handleToggleDrawingBar = useCallback(() => {
		setDrawingBarVisible((current) => !current);
	}, [setDrawingBarVisible]);

	/**
	 * The reverse-coordinate switch, applied to every y-axis.
	 *
	 * `@klinecharts/pro` expressed this as the style `yAxis.reverse`, and a v9 style
	 * was global — so reversing every axis is the faithful port, not a shortcut.
	 * v10 has no such style, hence the override.
	 *
	 * 反转坐标开关，作用于每一条 y 轴。
	 *
	 * `@klinecharts/pro` 把它表达为样式 `yAxis.reverse`，而 v9 的样式是全局的 —— 因此反转每一条轴
	 * 是忠实的移植而非偷懒。v10 没有这个样式，故改用覆盖。
	 */
	useEffect(() => {
		const chart = ready ? chartRef.current : null;
		if (!chart) return;
		chart.overrideYAxis({ reverse: reverseAxis });
	}, [reverseAxis, ready]);

	/**
	 * The price unit badge, placed in the price pane's y-axis widget exactly where
	 * `@klinecharts/pro` puts it.
	 *
	 * The engine's own DOM is the only host that lines up with the axis: the badge
	 * has to sit above the axis column, and only the axis's own container knows
	 * which column that is. The effect owns the element and removes it on cleanup,
	 * so a symbol without a quote currency leaves nothing behind.
	 *
	 * 价格单位徽标，放在价格面板 y 轴部件里 —— 正是 `@klinecharts/pro` 放它的位置。
	 *
	 * 引擎自己的 DOM 是唯一能与坐标轴对齐的宿主：徽标必须坐在坐标轴那一列之上，而只有坐标轴自己的
	 * 容器知道那一列在哪。该 effect 拥有这个元素并在清理时移除它，因此没有计价币的标的不会留下残留。
	 */
	useEffect(() => {
		const chart = ready ? chartRef.current : null;
		if (!chart || !priceUnit) return;
		const host = chart.getDom(CANDLE_PANE_ID, "yAxis");
		if (!host) return;
		const badge = document.createElement("div");
		badge.className = "adachart-pro__price-unit";
		badge.textContent = priceUnit;
		host.appendChild(badge);
		return () => badge.remove();
	}, [priceUnit, ready]);

	/**
	 * Opens the appearance dialog on what is actually on screen: the engine is the
	 * only place that knows, because a caller may have set the same rows through
	 * `styles` without this component ever seeing them.
	 *
	 * 在屏幕上真实的取值上打开外观对话框：只有引擎知道答案，因为调用方可能已经通过 `styles`
	 * 设过同样的几行，而本组件从未见过。
	 */
	const handleSettingsOpen = useCallback(() => {
		const chart = chartRef.current;
		if (chart) setSettings(settingsFromStyles(chart.getStyles()));
		setSettingsOpen(true);
	}, []);

	/**
	 * Appearance changes land live, as they do in `@klinecharts/pro` — the dialog
	 * exists to be looked at while the chart moves. The whole model is written as
	 * one patch rather than the one changed row, which is what keeps the untouched
	 * rows at the values the dialog was seeded with.
	 *
	 * 外观改动实时生效，与 `@klinecharts/pro` 一致 —— 这个对话框存在的意义就是一边看图表一边改。
	 * 整个模型作为一个补丁写入而非只写被改的那行，这正是让没被碰过的行保持播种值的原因。
	 */
	const handleSettingsChange = useCallback((next: AdaChartProSettings) => {
		setSettings(next);
		setSettingsPatch(settingsStyles(next));
	}, []);

	/**
	 * The three legend icons on an indicator's tooltip.
	 *
	 * This is where the Pro layer's deviation from `@klinecharts/pro` is widest, so
	 * it is spelled out:
	 *
	 * - *visible* toggles the indicator on the instance with `overrideIndicator`.
	 *   It deliberately does **not** touch the toolbar's checkboxes. Those mean
	 *   "indicators to create", and changing one rebuilds every indicator from
	 *   scratch — which would throw away exactly the per-indicator settings this
	 *   icon and the gear are for. Hiding is a property of the instance, not of the
	 *   list that built it.
	 * - *setting* opens the parameter dialog.
	 * - *close* removes the indicator from whichever list holds it, letting the
	 *   rebuild take it off the chart. It has to go through the list, because that
	 *   list is the source of truth for what exists: removing only the instance
	 *   would leave the checkbox ticked and the indicator would return on the next
	 *   rebuild.
	 *
	 * 指标浮层上的三个图例图标。
	 *
	 * 这是 Pro 层与本 `@klinecharts/pro` 偏离最大之处，因此写明：
	 *
	 * - *可见* 用 `overrideIndicator` 在实例上开关该指标。它刻意**不**动工具栏的复选框。那些
	 *   复选框的含义是「要创建哪些指标」，改动其一会让全部指标从头重建 —— 那恰好会丢掉这个图标
	 *   与齿轮存在的意义，也就是逐指标的设置。隐藏是实例的属性，不是构建它的那份清单的属性。
	 * - *设置* 打开参数对话框。
	 * - *关闭* 从持有它的那份清单里移除，由重建把它带下图表。它必须走清单，因为清单才是「存在
	 *   什么」的唯一事实来源：只移除实例会留下勾选状态，下一次重建它就会回来。
	 */
	const handleIndicatorFeatureClick = useCallback((data?: unknown) => {
		const chart = chartRef.current;
		if (!chart) return;
		const payload = data as
			| { feature?: { id?: string }; indicator?: { id?: string; name?: string } }
			| undefined;
		const id = payload?.indicator?.id;
		const name = payload?.indicator?.name;
		const featureId = payload?.feature?.id;
		if (!id || !name || !featureId) return;

		if (featureId === "visible") {
			const [current] = chart.getIndicators({ id });
			if (!current) return;
			chart.overrideIndicator({ id, name, visible: !current.visible });
			return;
		}

		if (featureId === "setting") {
			setIndicatorParams({ id, name, ...indicatorParamsOf(chart, id) });
			return;
		}

		if (featureId === "close") {
			// Only the list that holds the name loses it: the same indicator can be
			// ticked in both panes, and closing one of them must not close the other.
			// 只有持有该名字的那份清单会失去它：同一个指标可以在主副图上都被勾选，关掉其中一个
			// 不应把另一个也关掉。
			const drop = (list: string[]) =>
				list.includes(name) ? list.filter((item) => item !== name) : list;
			setMainIndicators(drop);
			setSubIndicators(drop);
		}
	}, [setMainIndicators, setSubIndicators]);

	/**
	 * The parameter dialog's confirm: both the calculations and the line colours
	 * land as one `overrideIndicator`, because they are one edit as far as the
	 * reader is concerned.
	 *
	 * `styles` is omitted rather than sent empty when the indicator draws no lines
	 * (e.g. `VOL`), so an indicator that has no line figures does not gain an empty
	 * `lines` array.
	 *
	 * 参数对话框的确定：算参与线颜色作为一次 `overrideIndicator` 落地，因为在读图的人看来它们
	 * 就是一次编辑。
	 *
	 * 指标不画线时（例如 `VOL`）省去 `styles` 而不是送一个空对象，使没有线图形的指标不会凭空
	 * 得到一个空 `lines` 数组。
	 */
	const handleIndicatorParamsConfirm = useCallback(
		(calcParams: number[], lineColors: string[]) => {
			const chart = chartRef.current;
			const draft = indicatorParams;
			setIndicatorParams(null);
			if (!chart || !draft) return;
			chart.overrideIndicator({
				id: draft.id,
				name: draft.name,
				calcParams,
				...(lineColors.length > 0
					? { styles: { lines: lineColors.map((color) => ({ color })) } }
					: {}),
			});
		},
		[indicatorParams],
	);

	/**
	 * Fullscreen follows the document, not our own clicks: the browser can leave
	 * fullscreen without us — Esc, another element asking for it, a system
	 * gesture — so `document.fullscreenElement` is the only honest answer to
	 * "are we fullscreen", re-read on every change.
	 *
	 * 全屏状态跟随文档而非我们自己的点击：浏览器可以不经我们之手退出全屏 —— Esc、别的元素
	 * 请求全屏、系统手势 —— 因此「是否处于全屏」唯一诚实的答案是 `document.fullscreenElement`，
	 * 每次变化都重新读。
	 */
	useEffect(() => {
		const onFullscreenChange = () =>
			setIsFullscreen(document.fullscreenElement === rootRef.current);
		document.addEventListener("fullscreenchange", onFullscreenChange);
		return () =>
			document.removeEventListener("fullscreenchange", onFullscreenChange);
	}, []);

	const handleFullscreenToggle = useCallback(() => {
		const root = rootRef.current;
		if (!root) return;
		// The root rather than the chart, so the toolbar and the drawing bar come
		// along: they are part of the thing being maximised.
		// 作用在根元素而不是图表上，工具栏与画线栏因此一同进来：它们也是被最大化的那个东西的一部分。
		if (document.fullscreenElement) void document.exitFullscreen();
		else void root.requestFullscreen();
	}, []);

	/**
	 * Captures the chart with its overlays, as `@klinecharts/pro` does. The canvas
	 * is transparent, so a capture needs the same surface colour the CSS paints
	 * behind it — read from the one place that defines it rather than spelling the
	 * hex out a second time.
	 *
	 * 连同画线一起截取图表，与 `@klinecharts/pro` 一致。画布是透明的，因此截图需要与 CSS 涂在
	 * 它背后的同一个表面色 —— 从唯一的定义处读取，而不是把十六进制再写一遍。
	 */
	const handleScreenshot = useCallback(() => {
		const chart = chartRef.current;
		const root = rootRef.current;
		if (!chart || !root) return;
		const surface = getComputedStyle(root)
			.getPropertyValue("--adacp-surface")
			.trim();
		setScreenshot(chart.getConvertPictureUrl(true, "jpeg", surface || "#ffffff"));
	}, []);

	const closeScreenshot = useCallback(() => setScreenshot(null), []);

	const tokens = theme === "dark" ? DARK_THEME : LIGHT_THEME;

	return (
		<div
			ref={rootRef}
			className="adachart-pro"
			data-theme={theme}
			data-adachart-pro-ready={ready ? "true" : undefined}
			style={{
				width: resolved.autoSize ? "100%" : resolved.width,
				fontFamily: tokens.fontFamily,
				fontSize: tokens.fontSize,
			}}
		>
			<AdaChartProToolbar
				theme={theme}
				locale={locale}
				periods={resolved.periods}
				period={period}
				mainIndicators={mainIndicators}
				subIndicators={subIndicators}
				symbols={resolved.symbols}
				symbol={displaySymbol}
				drawing={drawingEnabled}
				drawingBarVisible={drawingBarVisible}
				drawingManager={drawingManagerEnabled}
				drawingManagerOpen={drawingManagerOpen}
				timezone={timezone}
				isFullscreen={isFullscreen}
				screenshot={screenshot}
				onScreenshot={handleScreenshot}
				onScreenshotClose={closeScreenshot}
				onFullscreenToggle={handleFullscreenToggle}
				onToggleDrawingBar={handleToggleDrawingBar}
				onToggleDrawingManager={handleToggleDrawingManager}
				onSettingsOpen={handleSettingsOpen}
				onTimezoneOpen={() => setTimezoneOpen(true)}
				onThemeChange={() => setTheme(theme === "dark" ? "light" : "dark")}
				onPeriodChange={setPeriod}
				onIndicatorsChange={(main, sub) => {
					setMainIndicators(main);
					setSubIndicators(sub);
				}}
				onSymbolChange={setSymbolRequest}
			/>
			<div className="adachart-pro__main">
				{drawingEnabled && drawingBarVisible ? (
					<AdaChartProDrawingBar
						locale={locale}
						groups={drawingGroups}
						activeTool={tool}
						mode={overlayMode}
						locked={overlayLocked}
						visible={overlayVisible}
						onToolChange={setTool}
						onModeChange={setOverlayMode}
						onLockChange={setOverlayLocked}
						onVisibleChange={setOverlayVisible}
						onRemoveAll={handleRemoveAll}
					/>
				) : null}
				<div className="adachart-pro__body">
					{resolved.watermark ? (
						<div className="adachart-pro__watermark">{resolved.watermark}</div>
					) : null}
					<div className="adachart-pro__chart">
						{/* No chart until the instrument is settled. `AdaChart` asks its
						 * loader for a window the moment it exists, so a chart raised on a
						 * name that is still resolving would request bars for an instrument
						 * the venue may not know — see `symbol`. The spinner below stands
						 * in for the wait.
						 *
						 * 标的定下来之前不建图。`AdaChart` 一存在就向 loader 索要一个窗口，
						 * 因此建在一个仍在解析的名称上的图表会为一个数据源可能不认识的标的
						 * 取 K 线 —— 见 `symbol`。下面的加载动画代表这段等待。 */}
						{symbol ? (
							<AdaChart
								// The wrapper, not the raw loader: `AdaChart` installs a loader once
								// on mount and never again, so the object it is handed has to keep
								// one identity for the chart's life — see `observedLoader`.
								//
								// 传包装器而非原始 loader：`AdaChart` 只在挂载时装一次 loader、
								// 此后再不更换，因此交给它的对象必须在图表一生中保持同一引用 ——
								// 见 `observedLoader`。
								dataLoader={observedLoader}
								symbol={symbol}
								period={period}
								width={resolved.width}
								height={resolved.height}
								autoSize={resolved.autoSize}
								// `transparent`, not the surface colour: anything `AdaChart`
								// paints is inside `.adachart-pro__chart` and would sit above
								// the watermark. The surface is `--adacp-surface` on
								// `.adachart-pro__body` instead — see `adachart-pro.css`.
								//
								// 传 `transparent` 而非表面色：`AdaChart` 涂的任何东西都在
								// `.adachart-pro__chart` 之内，会压在水印之上。表面色改由
								// `.adachart-pro__body` 上的 `--adacp-surface` 负责 —— 见
								// `adachart-pro.css`。
								backgroundColor="transparent"
								theme={theme}
								locale={locale}
								timezone={timezone}
								indicators={indicators}
								// The merged tree, not the caller's prop: the legend icons, the
								// imperative `setStyles` patches and the appearance dialog all
								// have to reach `AdaChart` through this one tree, because that is
								// the tree it republishes on every render.
								//
								// 传合并后的树而非调用方的属性：图例图标、命令式 `setStyles` 补丁与
								// 外观对话框都必须经这一棵树到达 `AdaChart`，因为那正是它每次渲染都
								// 重新下发的树。
								styles={styles}
								// Per-period date shape, which v10 would otherwise write with one
								// template for every bar size.
								// 各周期的日期形状；v10 否则会对每种周期都用同一个模板。
								formatter={formatter}
								onIndicatorTooltipFeatureClick={handleIndicatorFeatureClick}
								onChartReady={handleChartReady}
							/>
						) : null}
					</div>
					{/* Both overlays are absolute siblings of the chart, so they can be
					 * dismissed by state alone without touching the canvas. Loading covers
					 * the chart while a whole-window request is in flight; empty stays until
					 * bars exist, and is what makes "the venue returned nothing" visible
					 * instead of an inexplicably blank grid.
					 *
					 * 两个遮罩都是图表的绝对定位兄弟，因此仅靠状态即可收起，无需触碰 canvas。
					 * 加载中在整窗请求进行时盖住图表；空状态留到有 K 线为止，正是它让「数据源什么
					 * 都没返回」可见，而不是一个莫名空白的网格。 */}
					{dataState === "loading" ? (
						<div
							className="adachart-pro__loading"
							role="status"
							aria-label={messageFor(locale, "loading")}
						>
							<i className="adachart-pro__loading-circle" />
							<i className="adachart-pro__loading-circle" />
							<i className="adachart-pro__loading-circle" />
						</div>
					) : null}
					{dataState === "empty" ? (
						<div
							className="adachart-pro__empty"
							role="status"
							aria-label={messageFor(locale, "empty")}
						>
							<svg
								className="adachart-pro__empty-icon"
								viewBox="0 0 1024 1024"
								aria-hidden="true"
								focusable="false"
							>
								<path d="M855.6 427.2H168.5c-12.7 0-24.4 6.9-30.6 18L4.4 684.7C1.5 689.9 0 695.8 0 701.8v287.1c0 19.4 15.7 35.1 35.1 35.1H989c19.4 0 35.1-15.7 35.1-35.1V701.8c0-6-1.5-11.8-4.4-17.1L886.2 445.2c-6.2-11.1-17.9-18-30.6-18zM673.4 695.6c-16.5 0-30.8 11.5-34.3 27.7-12.7 58.5-64.8 102.3-127.2 102.3s-114.5-43.8-127.2-102.3c-3.5-16.1-17.8-27.7-34.3-27.7H119c-26.4 0-43.3-28-31.1-51.4l81.7-155.8c6.1-11.6 18-18.8 31.1-18.8h622.4c13 0 25 7.2 31.1 18.8l81.7 155.8c12.2 23.4-4.7 51.4-31.1 51.4H673.4zM819.9 209.5c-1-1.8-2.1-3.7-3.2-5.5-9.8-16.6-31.1-22.2-47.8-12.6L648.5 261c-17 9.8-22.7 31.6-12.6 48.4 0.9 1.4 1.7 2.9 2.5 4.4 9.5 17 31.2 22.8 48 13L807 257.3c16.7-9.7 22.4-31 12.9-47.8zM375.4 261.1L255 191.6c-16.7-9.6-38-4-47.8 12.6-1.1 1.8-2.1 3.6-3.2 5.5-9.5 16.8-3.8 38.1 12.9 47.8L337.3 327c16.9 9.7 38.6 4 48-13.1 0.8-1.5 1.7-2.9 2.5-4.4 10.2-16.8 4.5-38.6-12.4-48.4zM512 239.3h2.5c19.5 0.3 35.5-15.5 35.5-35.1v-139c0-19.3-15.6-34.9-34.8-35.1h-6.4C489.6 30.3 474 46 474 65.2v139c0 19.5 15.9 35.4 35.5 35.1h2.5z" />
							</svg>
						</div>
					) : null}
					{/* The manager is docked inside the body rather than mounted beside the
					 * chart, because a row is read against the drawing it names. It is
					 * gated by the flag as well as by its own open state, so turning the
					 * capability off takes the panel with it however the state is left.
					 *
					 * 管理器停靠在 body 内，而不是挂在图表旁边，因为读一行时比对的正是它所命名的
					 * 那条画线。它同时受功能开关与自身的打开状态约束，因此无论状态留在哪，关掉这项能力
					 * 都会连面板一起收起。 */}
					{drawingManagerEnabled && drawingManagerOpen ? (
						<AdaChartProDrawingManager
							locale={locale}
							rows={managerRows}
							selectedId={selectedOverlayId}
							onRename={handleManagerRename}
							onToggleLock={handleManagerToggleLock}
							onToggleVisible={handleManagerToggleVisible}
							onBringToFront={handleManagerBringToFront}
							onDelete={handleManagerDelete}
							onClose={handleToggleDrawingManager}
						/>
					) : null}
				</div>
			</div>

			{/* The three dialogs are siblings of the body, not of the toolbar: each needs
			 * a draft or a value read from the chart instance, and both live here. Like
			 * the screenshot dialog they are `position: fixed`, so they cover the chart
			 * rather than only the element they are mounted in.
			 *
			 * 三个对话框是 body 的兄弟而非工具栏的：每一个都需要草稿、或需要从图表实例读一个值，
			 * 而两者都在这里。与截屏对话框一样是 `position: fixed`，因此盖住图表而不只是它们
			 * 挂载的那个元素。 */}
			{settingsOpen ? (
				<AdaChartProSettingsDialog
					locale={locale}
					settings={settings}
					reverseAxis={reverseAxis}
					drawing={drawingEnabled}
					onChange={handleSettingsChange}
					onReverseAxisChange={setReverseAxis}
					onDrawingChange={setDrawingEnabled}
					onClose={() => setSettingsOpen(false)}
				/>
			) : null}
			{timezoneOpen ? (
				<AdaChartProTimezoneDialog
					locale={locale}
					timezone={timezone}
					onConfirm={(next) => {
						setTimezone(next);
						setTimezoneOpen(false);
					}}
					onClose={() => setTimezoneOpen(false)}
				/>
			) : null}
			{indicatorParams ? (
				// Keyed by the indicator's id so reopening on a different one restarts
				// the draft states instead of showing the previous indicator's numbers.
				// 以指标 id 作键，使换一个指标重新打开时草稿状态重新建立，而不是继续显示上一个
				// 指标的数值。
				<AdaChartProIndicatorParamsDialog
					key={indicatorParams.id}
					locale={locale}
					name={indicatorParams.name}
					calcParams={indicatorParams.calcParams}
					lineColors={indicatorParams.lineColors}
					onConfirm={handleIndicatorParamsConfirm}
					onClose={() => setIndicatorParams(null)}
				/>
			) : null}
		</div>
	);
}

const AdaChartProMemo = memo(AdaChartPro, areAdaChartProPropsEqual);

/**
 * The memoized Wrapper, under both export forms so a consumer can pick either
 * import style.
 *
 * 记忆化后的 Wrapper，两种导出形式都给，调用方两种 import 写法都能用。
 */
export { AdaChartProMemo as AdaChartPro };
export default AdaChartProMemo;
