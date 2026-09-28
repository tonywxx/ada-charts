import type { Meta, StoryObj } from "@storybook/react";
import type { CSSProperties } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	Chart,
	Coordinate,
	Crosshair,
	KLineData,
	OverlayCreate,
	Point,
} from "klinecharts";
import AdaChart, { type AdaChartProps } from "./AdaChart";
import {
	ADACHART_CANDLE_TYPES,
	ADACHART_LOCALES,
	ADACHART_OVERLAY_NAMES,
	ADACHART_DEFAULTS,
	ADACHART_PERIOD_TYPES,
} from "./adachart-options";
import {
	MAIN_INDICATORS,
	SUB_INDICATORS,
	VOLUME_OVERLAY_INDICATOR,
	addSubPane,
	DEFAULT_CONFIG,
	indicatorsFor,
	panesFor,
	removeSubPane,
	setSubPaneIndicator,
	toggleMainIndicator,
	type WindowConfig,
} from "./adachart-window-config";
import {
	LIVE_BARS,
	liveBarByKey,
	loadLiveWindow,
	mergeLiveCandle,
	type LiveSource,
} from "./__data__/okx-live";
import { jsxSource } from "../../jsx-source";
import { OKX_INST_ID } from "../../okx";
import {
	sharedOkxStream,
	type OkxStreamBar,
	type OkxStreamStatus,
} from "../../okx-stream";

/**
 * Every story draws from **live** BTC-USDT candles, and keeps drawing: the loader
 * requests the latest 300 bars from the OKX public market API when a page is
 * opened, and every `candle` push after that is folded into the newest bar, so what
 * is on screen is the real, current market — the same data source `TChart` uses,
 * just shaped for `klinecharts` (millisecond timestamps).
 *
 * 所有 story 都使用**实时**的 BTC-USDT K 线，并且持续更新：loader 在页面打开时从 OKX 公共行情
 * 接口请求最新的 300 根 K 线，此后每一次 `candle` 推送都并入最新一根，因此屏幕上就是真实、当前的
 * 行情 —— 与 `TChart` 同源，只是整形为 `klinecharts` 所需的形式（毫秒时间戳）。
 */

/** Select-style controls that the type inference alone cannot render. 类型推断无法自动渲染的下拉控件。 */
const CONTROLS = {
	candleType: { control: "select", options: [...ADACHART_CANDLE_TYPES] },
	theme: { control: "inline-radio", options: ["light", "dark"] },
	locale: { control: "inline-radio", options: [...ADACHART_LOCALES] },
	tooltipShowRule: {
		control: "inline-radio",
		options: ["always", "follow_cross", "none"],
	},
	candleTooltipShowType: {
		control: "inline-radio",
		options: ["standard", "rect"],
	},
	periodType: { control: "select", options: [...ADACHART_PERIOD_TYPES] },
	yAxisPosition: { control: "inline-radio", options: ["left", "right"] },
	zoomAnchor: { control: "inline-radio", options: ["cursor", "last_bar"] },
} as const;

/** Props whose value is data or a raw config bag, so no widget fits them. 取值为数据或原始配置对象、不适合任何控件的属性。 */
const NO_CONTROL = [
	"data",
	"dataLoader",
	"symbol",
	"period",
	"styles",
	"formatter",
	"thousandsSeparator",
	"decimalFold",
	"hotkey",
	"layout",
	"indicators",
	"panes",
	"overlays",
	"onChartReady",
	"onZoom",
	"onScroll",
	"onVisibleRangeChange",
	"onCrosshairChange",
	"onCandleBarClick",
	"onCandleTooltipFeatureClick",
	"onIndicatorTooltipFeatureClick",
	"onCrosshairFeatureClick",
	"onPaneDrag",
] as const;

/**
 * `argTypes` generated from the defaults table so the Default column can never
 * drift from what the component merges at runtime.
 * 由默认值表生成的 `argTypes`，使 Default 列不会与组件运行时合并的值产生偏差。
 */
const COMPONENT_ARG_TYPES = {
	...Object.fromEntries(
		Object.entries(ADACHART_DEFAULTS).map(([name, defaultValue]) => [
			name,
			{
				table: { defaultValue: { summary: JSON.stringify(defaultValue) } },
				...(name in CONTROLS ? CONTROLS[name as keyof typeof CONTROLS] : {}),
			},
		]),
	),
	...Object.fromEntries(
		NO_CONTROL.map((name) => [name, { control: false as const }]),
	),
};

/** Which bar size to draw, and which overlay names to place on the chart. 使用哪个周期，以及要放置哪些画线工具。 */
interface AdaChartStoryParameters {
	/**
	 * The bar size to draw, spelled the way the *push feed* spells it — the same
	 * string names the REST history request and the `candle` channel, which is what
	 * keeps the fetched tail and the pushed tail the same candles.
	 *
	 * 要绘制的周期，按**推送源**的拼法书写 —— 同一个字符串既命名 REST 历史请求，也命名
	 * `candle` 频道，正是它让取回的末根与推来的末根是同一批蜡烛。
	 */
	okxBar?: OkxStreamBar;
	overlayNames?: string[];
}

const STRIP_STYLE: CSSProperties = {
	font: "11px/1.4 ui-monospace, monospace",
	color: "#64748b",
	padding: "4px 8px",
	background: "#f8fafc",
	borderBottom: "1px solid #e2e8f0",
	display: "flex",
	justifyContent: "space-between",
	gap: 12,
};

/**
 * Place each named overlay on real bars, anchored to offsets from the newest
 * candle so the geometry survives a data refresh.
 * 把每个具名画线工具放置在真实 K 线上，锚点以「距最新一根的偏移」表达，使其几何在数据刷新后仍然成立。
 */
function overlaysFor(
	bars: KLineData[],
	names: string[] | undefined,
): OverlayCreate[] {
	if (!names?.length) return [];
	const at = (fromEnd: number): { timestamp: number; value: number } | null => {
		const bar = bars[bars.length - fromEnd];
		return bar ? { timestamp: bar.timestamp, value: bar.close } : null;
	};
	// Five anchors cover the 2-, 3- and 4-step tools; extra points are ignored.
	// 五个锚点可覆盖 2/3/4 步的工具；多余的点会被忽略。
	const anchors = [50, 38, 26, 14, 4].map(at).filter((p): p is NonNullable<typeof p> => p !== null);
	return names.map((name) => ({ name, points: anchors }) as OverlayCreate);
}

/**
 * The pane id `klinecharts` gives the price pane. `AdaChart` keeps its copy
 * private, so the grid spells it out: it is the pane the linked crosshair is
 * mirrored into, and the pane whose width decides whether a timestamp is on
 * screen at all.
 *
 * `klinecharts` 赋予价格面板的 id。`AdaChart` 那份是私有的，因此本网格自己写明：联动十字光标
 * 正是镜像进这个面板，而「某个时间戳是否在屏幕上」也由它的宽度决定。
 */
const CANDLE_PANE = "candle_pane";

/**
 * The main-pane pixel for a timestamp, or `undefined` when this window cannot
 * place the moment on screen at all — off its visible range, or before the first
 * candle it holds. The pixel is checked here rather than by the caller because
 * "off the left edge" and "off the right edge" both come back as numbers.
 *
 * 某个时间戳在主图上的像素；当该窗口根本放不下这一时刻时（不在可见区间内，或早于它持有的
 * 第一根）为 `undefined`。检查放在这里而不是调用方，是因为「越过左边缘」与「越过右边缘」
 * 都会以数字的形式返回。
 */
function panePixel(chart: Chart, timestamp: number): number | undefined {
	const { x } = chart.convertToPixel({ timestamp }, { paneId: CANDLE_PANE }) as Partial<Coordinate>;
	if (typeof x !== "number") return undefined;
	const bounding = chart.getSize(CANDLE_PANE, "main");
	if (!bounding || x < 0 || x > bounding.width) return undefined;
	return x;
}

/**
 * Whether a window's series covers an instant; false when the moment precedes
 * its oldest candle.
 *
 * The check is one-sided because the two ends of a series are not symmetrical.
 * The newest bar stands for everything after it — a day bar drawn at midnight is
 * today, whatever the hour the pointer happens to be in — so a moment past the
 * right edge still has a bar to land on. Before the first bar there is nothing,
 * and the engine nevertheless answers such a moment with its nearest bar; a
 * window whose history stops short would therefore draw the crosshair on its
 * oldest candle and name an instant nobody pointed at. A moment out of reach is
 * better skipped than mislabelled — the same reason `panePixel` refuses a pixel
 * off the edge.
 *
 * 某个窗口的序列是否覆盖某一时刻；该时刻早于它最老的一根蜡烛时为否。
 *
 * 这个检查只朝一边，因为序列的两端并不对称。最新一根代表它之后的一切 —— 画在零点的日线就是
 * 「今天」，无论指针此刻在哪个钟点 —— 因此越过右边缘的时刻仍有一根可以落上去。而在第一根之前
 * 什么都没有，引擎却仍会就近答复；历史不够久远的窗口于是会把十字光标画在它最老的那根蜡烛上，
 * 指出的却是一个没人指着的时刻。够不着的时刻，跳过胜过标错 —— 与 `panePixel` 拒绝边缘之外的
 * 像素是同一个理由。
 */
function coversInstant(chart: Chart, timestamp: number): boolean {
	const [first] = chart.getDataList();
	return typeof first?.timestamp === "number" && timestamp >= first.timestamp;
}

/** How many candles a window is showing; what zoom is linked by. 窗口正在显示多少根蜡烛；zoom 联动以此对齐。 */
function visibleBarCount(chart: Chart): number | undefined {
	const range = chart.getVisibleRange();
	if (!range) return undefined;
	// `to` is clamped to the data length while `realTo` is not, so the count has
	// to come from `to`: `realTo` keeps counting into empty space to the right.
	// `to` 会被限制在数据长度内而 `realTo` 不会，因此根数只能取 `to`：`realTo` 会继续数向右侧
	// 的空白。
	const count = range.to - range.from;
	return count > 0 ? count : undefined;
}

/** Where one live series stands: what it has drawn, what it was drawn from, and what the socket is doing. 一条实时序列的处境：画着什么、依据什么画的，以及 socket 处于什么状态。 */
interface LiveSeriesState {
	/** The series as drawn: history, then every push folded in. 实际绘制的序列：历史，随后并入的每一次推送。 */
	bars: KLineData[];
	/**
	 * The history exactly as fetched, never touched by a push. Drawing tools are
	 * anchored to this rather than to `bars`, because `overlays` is reconciled by a
	 * structural signature: anchored to a moving series, every push would rebuild
	 * every tool.
	 *
	 * 抓取到的历史原样，不被推送改动。画线工具锚定于此而非 `bars`，因为 `overlays` 按结构签名
	 * 协调：锚在一条移动的序列上，每一次推送都会重建全部工具。
	 */
	history: KLineData[];
	/** `null` until the first history request settles, so a label never calls a series `snapshot` before it has an answer. 首次历史请求落地前为 `null`，以免在拿到答案之前就把它说成 `snapshot`。 */
	source: LiveSource | null;
	status: OkxStreamStatus;
}

/**
 * One live series: history fetched, then the venue's pushes folded in as they
 * arrive — and fetched again whenever the feed comes back from a drop, since the
 * candles that closed meanwhile were never pushed. The first story in the docs and
 * every window of the grid draw from this same hook.
 *
 * The bar size is the only dependency, and it is also the channel. Nothing but the
 * release below ever gives a channel back: the engine calls `unsubscribeBar` only
 * from `resetData`, and `dispose(chart)` tears the store down through `_clearData`,
 * which does not unsubscribe. So the component that calls this hook is the sole
 * owner, and its unmount is the only moment the shared socket hears that a channel
 * is no longer wanted.
 *
 * 一条实时序列：历史拉一次，随后数据源的推送到达时并入 —— 数据源从断线中回来时再拉一次，因为
 * 离开期间收盘的那几根从未推送过。文档页的第一个 story 与网格的每个窗口都取自同一个 hook。
 *
 * 周期是唯一的依赖，而周期就是频道。除了下面这次释放，没有任何东西会把频道交还：引擎只在
 * `resetData` 里调 `unsubscribeBar`，而 `dispose(chart)` 是经 `_clearData` 拆掉 store 的，
 * 并不退订。因此调用本 hook 的组件是这条订阅唯一的所有者，而它的卸载是共用 socket 唯一一次
 * 得知「这条频道已经没人要了」的时刻。
 */
function useLiveSeries(bar: OkxStreamBar): LiveSeriesState {
	const [state, setState] = useState<LiveSeriesState>({
		bars: [],
		history: [],
		source: null,
		status: "connecting",
	});

	useEffect(() => {
		let active = true;

		/**
		 * History, asked for more than once on purpose. A drop costs the pushes that
		 * happened while the socket was gone and nothing replays them, so the series
		 * would carry a hole until the bar size rolled over. The hub reports
		 * `reconnecting` — and then `open` — exactly so this can be answered; a first
		 * connect says `connecting`, which needs nothing extra.
		 *
		 * 历史会有意问不止一次。一次断线会丢掉 socket 不在时的那些推送，而它们没有任何重放，
		 * 序列上就会留一个洞，直到档位翻页。hub 之所以先报 `reconnecting`、再报 `open`，正是
		 * 为了让这里能应答；首次连接报的是 `connecting`，不需要额外动作。
		 */
		const loadHistory = () => {
			void loadLiveWindow(bar).then(({ bars, source }) => {
				if (active) setState((prev) => ({ ...prev, bars, history: bars, source }));
			});
		};

		loadHistory();
		/** Whether the feed is coming back from a drop, which is the only case that wants history again. 数据源是否正从一次断线中回来 —— 只有这种情况才需要重取历史。 */
		let recovering = false;

		const release = sharedOkxStream().subscribe(OKX_INST_ID, bar, {
			onBar: (candle) => {
				if (!active) return;
				setState((prev) => {
					const bars = mergeLiveCandle(prev.bars, candle);
					// The identity check is for the push that carries nothing: the venue
					// re-sends the current candle every second whether or not it has moved,
					// and an older timestamp is dropped rather than re-rendered.
					// 这个引用比较针对的是「什么也没带来」的推送：无论价格是否变动，数据源每秒都会重发
					// 当前这根；时间戳更早的直接丢弃，不做重渲染。
					return bars === prev.bars ? prev : { ...prev, bars };
				});
			},
			onStatus: (status) => {
				if (!active) return;
				if (status === "reconnecting") recovering = true;
				if (status === "open" && recovering) {
					recovering = false;
					loadHistory();
				}
				setState((prev) => ({ ...prev, status }));
			},
		});

		return () => {
			active = false;
			release();
		};
	}, [bar]);

	return state;
}

/**
 * What the grid hands one window. Every callback is stable, so a candle arriving
 * in one window re-renders that window and no other — and so does a change to
 * that window's indicator panel, which is why the configuration is a prop here
 * rather than state inside: the window is keyed by its bar size and remounts
 * when its period changes, and a panel that emptied itself on every period change
 * would be a panel nobody could use.
 *
 * 网格交给一个窗口的东西。每个回调都是稳定的，因此某个窗口来了一根 K 线只重渲染它自己 ——
 * 该窗口指标面板的变化也一样，这也正是配置作为属性传进来、而不是窗口内部状态的原因：窗口以
 * 周期为 key，改周期时会被重挂，而一个每次改周期就自己清空的配置面板是没人能用的。
 */
interface LiveWindowProps {
	id: number;
	barKey: string;
	height: number;
	config: WindowConfig;
	onConfigChange: (id: number, config: WindowConfig) => void;
	onBarChange: (id: number, barKey: string) => void;
	onClose: (id: number) => void;
	onReady: (id: number, chart: Chart) => void;
	onCrosshair: (id: number, data: unknown) => void;
	onLeave: (id: number) => void;
	onScroll: (id: number) => void;
	onZoom: (id: number) => void;
}

/** `2026-09-27 14:03 UTC`, the resolution the bars themselves are drawn at. `2026-09-27 14:03 UTC`，与蜡烛本身的粒度一致。 */
function minuteStamp(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 16).replace("T", " ");
}

const WINDOW_STRIP_STYLE: CSSProperties = {
	...STRIP_STYLE,
	gap: 6,
	alignItems: "center",
};

const SELECT_STYLE: CSSProperties = {
	font: "inherit",
	padding: "1px 2px",
};

const CONFIG_STYLE: CSSProperties = {
	...STRIP_STYLE,
	flexDirection: "column",
	alignItems: "stretch",
	gap: 4,
	paddingBottom: 6,
};

const CONFIG_ROW_STYLE: CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: 4,
	flexWrap: "wrap",
};

const CONFIG_LABEL_STYLE: CSSProperties = {
	width: 56,
	color: "#94a3b8",
};

const CHIP_STYLE: CSSProperties = {
	font: "inherit",
	padding: "0 4px",
	border: "1px solid #cbd5e1",
	borderRadius: 3,
	background: "#ffffff",
	color: "#475569",
	cursor: "pointer",
};

const CHIP_ON_STYLE: CSSProperties = {
	...CHIP_STYLE,
	borderColor: "#2563eb",
	background: "#dbeafe",
	color: "#1d4ed8",
};

/** One indicator name as a toggle. 一个可切换的指标名。 */
function IndicatorChip({
	name,
	on,
	onToggle,
}: {
	name: string;
	on: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={on}
			onClick={onToggle}
			style={on ? CHIP_ON_STYLE : CHIP_STYLE}
		>
			{name}
		</button>
	);
}

/**
 * One window: a period picker, a status strip, an indicator panel, and an
 * `AdaChart` drawing the series that picker names.
 *
 * Memoized over a stable prop set, so the two things that change on their own —
 * a pushed candle and a mirrored crosshair — stay inside the window they belong
 * to. `data` therefore has to be the window's own state, not something the grid
 * recomputes for everybody.
 *
 * 一个窗口：周期选择器、状态条、指标面板，以及一张绘制该周期序列的 `AdaChart`。
 *
 * 记忆化在一组稳定的 props 之上，因此两件自行变化的事情 —— 推送来的蜡烛与被镜像的十字光标 ——
 * 都留在各自所属的窗口内。也正因如此，`data` 必须是窗口自身的状态，而不是网格替所有人重算的东西。
 */
const LiveWindow = memo(function LiveWindow({
	id,
	barKey,
	height,
	config,
	onConfigChange,
	onBarChange,
	onClose,
	onReady,
	onCrosshair,
	onLeave,
	onScroll,
	onZoom,
}: LiveWindowProps) {
	const entry = liveBarByKey(barKey);
	const { bars, source, status } = useLiveSeries(entry.bar);
	const [configOpen, setConfigOpen] = useState(false);
	const last = bars.at(-1);

	const handleReady = useCallback((chart: Chart) => onReady(id, chart), [id, onReady]);
	const handleCrosshair = useCallback(
		(data?: unknown) => onCrosshair(id, data),
		[id, onCrosshair],
	);
	const handleLeave = useCallback(() => onLeave(id), [id, onLeave]);
	const handleScroll = useCallback(() => onScroll(id), [id, onScroll]);
	const handleZoom = useCallback(() => onZoom(id), [id, onZoom]);

	// The window's configuration in the shape `AdaChart` takes, and the panes it
	// asks for. Both are derived from the config alone, which is why the memo's
	// dependency is the config and nothing else.
	// 窗口的配置在 `AdaChart` 所要的形状下，以及它索要的面板。两者都只由配置推出，因此记忆化的
	// 依赖就是配置本身，别无其它。
	const indicators = useMemo(() => indicatorsFor(config), [config]);
	const panes = useMemo(() => panesFor(config), [config]);

	const toggleMain = (name: string) => onConfigChange(id, toggleMainIndicator(config, name));

	const setPaneIndicator = (paneId: string, indicator: string) =>
		onConfigChange(id, setSubPaneIndicator(config, paneId, indicator));

	const removePane = (paneId: string) => onConfigChange(id, removeSubPane(config, paneId));

	const addPane = () => onConfigChange(id, addSubPane(config, nextPaneId()));

	return (
		<div
			style={{ display: "flex", flexDirection: "column", minWidth: 0 }}
			onMouseLeave={handleLeave}
		>
			<div style={WINDOW_STRIP_STYLE}>
				<select
					style={SELECT_STYLE}
					aria-label={`Bar size for window ${id}`}
					value={barKey}
					onChange={(event) => onBarChange(id, event.target.value)}
				>
					{LIVE_BARS.map((option) => (
						<option key={option.key} value={option.key}>
							{option.label}
						</option>
					))}
				</select>
				{/* A window says what it is showing and how it got it. `snapshot` is not
				 * a synonym for `stale`: the committed file is the same bars the venue
				 * served when it was captured, and its age is the point of naming it.
				 *
				 * 窗口说明自己画的是什么、怎么来的。`snapshot` 不等于 `stale`：仓库里那份就是抓取时
				 * 数据源给出的同一批蜡烛，点明它的意义正在于它的年纪。 */}
				<span>
					{source ? `${source} · ${status} · ${bars.length} bars` : "loading…"}
				</span>
				<span style={{ flex: 1, textAlign: "right" }}>
					{last ? `${last.close.toFixed(1)} @ ${minuteStamp(last.timestamp)}` : "-"}
				</span>
				<button
					type="button"
					style={SELECT_STYLE}
					aria-label={`Indicators for window ${id}`}
					aria-expanded={configOpen}
					onClick={() => setConfigOpen((open) => !open)}
				>
					{configOpen ? "close panel" : "indicators"}
				</button>
				<button
					type="button"
					style={SELECT_STYLE}
					aria-label={`Close window ${id}`}
					onClick={() => onClose(id)}
				>
					×
				</button>
			</div>
			{configOpen ? (
				<div style={CONFIG_STYLE}>
					<div style={CONFIG_ROW_STYLE}>
						<span style={CONFIG_LABEL_STYLE}>main</span>
						{MAIN_INDICATORS.map((name) => (
							<IndicatorChip
								key={name}
								name={name}
								on={config.main.includes(name)}
								onToggle={() => toggleMain(name)}
							/>
						))}
					</div>
					{config.panes.map((pane) => (
						<div key={pane.id} style={CONFIG_ROW_STYLE}>
							<span style={CONFIG_LABEL_STYLE}>{pane.id}</span>
							<select
								style={SELECT_STYLE}
								aria-label={`Indicator in ${pane.id}`}
								value={pane.indicator}
								onChange={(event) => setPaneIndicator(pane.id, event.target.value)}
							>
								{SUB_INDICATORS.map((name) => (
									<option key={name} value={name}>
										{name}
									</option>
								))}
							</select>
							<button
								type="button"
								style={SELECT_STYLE}
								aria-label={`Remove ${pane.id}`}
								onClick={() => removePane(pane.id)}
							>
								×
							</button>
						</div>
					))}
					<button type="button" style={SELECT_STYLE} onClick={addPane}>
						+ pane
					</button>
				</div>
			) : null}
			<AdaChart
				data={bars}
				period={entry.period}
				height={height}
				indicators={indicators}
				panes={panes}
				onChartReady={handleReady}
				onCrosshairChange={handleCrosshair}
				onScroll={handleScroll}
				onZoom={handleZoom}
			/>
		</div>
	);
});

let windowSeq = 0;
const nextWindowId = (): number => (windowSeq += 1);

/**
 * A fresh pane id. Module-level rather than per-window because pane ids only
 * have to be unique within one chart, and a single counter is one thing to read
 * instead of six.
 *
 * The id is minted here rather than inside the reducer that takes it: what a
 * pane is called is a fact about the chart it will live in, and a module-level
 * counter could not be reached from a test at all.
 *
 * 新的面板 id。放在模块级而非每窗口一份：面板 id 只需在一张图内唯一，而一个计数器比六个数
 * 更容易读。
 *
 * id 在此铸造，而不是在取用它的 reducer 里：面板叫什么，是关于它将栖身的那张图的事实；而放在
 * 模块级的计数器，测试根本够不着。
 */
let paneSeq = 0;
const nextPaneId = (): string => {
	paneSeq += 1;
	return `pane_${paneSeq}`;
};

/** The ladder a page opens with: one window per order of magnitude, finest first. 页面打开时的阶梯：每个数量级一个窗口，由细到粗。 */
const INITIAL_BAR_KEYS = ["1m", "5m", "15m", "1H", "4H", "1Dutc"];

/**
 * A grid of live windows, each watching its own bar size, with the crosshair
 * linked across them by timestamp.
 *
 * What is shared and what is not is the whole design:
 *
 * - The **socket** is shared, and channels are refcounted, so eight windows
 *   watching eight bar sizes hold one connection rather than eight (`okx-stream.ts`).
 * - The **candle** is not: one window's push must not redraw the others, which is
 *   why each window owns its series, its `AdaChart` and its subscription, and
 *   every callback the grid passes down is stable.
 * - The **crosshair** is linked by *timestamp*, never by pixel. A 1-minute window
 *   and a 1-day window put the same moment hundreds of pixels apart, so the
 *   source's pixel becomes a timestamp in its own coordinates
 *   (`convertFromPixel`) and that timestamp becomes a pixel again in each
 *   target's (`convertToPixel`). The engine's `onCrosshairChange` action is
 *   dispatched with `notExecuteAction`, so a mirrored crosshair does not fire the
 *   target's own handler and there is no feedback loop.
 * - **Scroll and zoom are linked only when asked.** Each is its own switch, both on
 *   to start, and what they align on is chosen for what the two windows have in
 *   common: scroll keeps the same *right-edge instant*, which is what "the newest
 *   thing on screen" means in both; zoom keeps the same *number of visible
 *   candles*, because a bar width cannot mean the same thing at two bar sizes.
 *   With a switch off, that move stays in the window that made it.
 * - **An instant a window cannot reach is not chased.** A window that holds the
 *   moment keeps its view and, while scroll is linked, is moved to the moment when
 *   it is off screen; a window whose history stops short of the moment is not moved
 *   at all — the engine answers with its *oldest* candle and the crosshair would
 *   land there, naming an instant nobody pointed at. The check is one-sided on
 *   purpose: the newest candle stands for everything after it, so a moment past the
 *   right edge still has a bar to land on.
 *
 * 一片实时窗口网格，各看各的周期，十字光标按时间戳跨窗口联动。
 *
 * 什么共享、什么不共享就是全部设计：
 *
 * - **socket** 共享，频道按引用计数，因此八个窗口看八个周期只持有一条连接，而不是八条
 *   （`okx-stream.ts`）。
 * - **蜡烛**不共享：一个窗口的推送不得重绘其它窗口，因此每个窗口拥有自己的序列、自己的
 *   `AdaChart` 与自己的订阅，而网格下发的每个回调都是稳定的。
 * - **十字光标**按*时间戳*联动，绝不按像素。1 分钟窗口与 1 天窗口会把同一时刻放在相隔数百
 *   像素处，因此先把源窗口的像素在它自己的坐标系里变成时间戳（`convertFromPixel`），再把
 *   这个时间戳在每个目标窗口里变回像素（`convertToPixel`）。引擎的 `onCrosshairChange` 动作
 *   带 `notExecuteAction` 派发，因此被镜像的光标不会触发目标自己的处理器，不会形成回环。
 * - **滚动与缩放只在被要求时联动**，各自一个开关（默认都开），而对齐的口径取两者真正共有的东西：
 *   滚动对齐*右边缘的那一刻*，因为「屏幕上最新的东西」在两个窗口里是同一件事；缩放对齐*可见蜡烛的
 *   根数*，因为「一根多宽」在两个周期上不可能指同一件事。某个开关关闭时，那个动作就只留在发起它的
 *   窗口里。
 * - **够不着的时刻不去追**。窗口持有该时刻时，它保持自己的视野；滚动联动着而该时刻在屏幕之外时，
 *   就把窗口移到那一刻。历史够不到该时刻的窗口一动不动 —— 引擎会以它*最老*的一根作答，光标便落在
 *   那里，指出的却是一个没人指着的时刻。这个检查刻意只朝一边：最新一根代表它之后的一切，因此越过
 *   右边缘的时刻仍有一根可以落上去。
 */
function LiveGrid() {
	const [windows, setWindows] = useState<Array<{ id: number; barKey: string }>>(() =>
		INITIAL_BAR_KEYS.map((barKey) => ({ id: nextWindowId(), barKey })),
	);
	const [linkScroll, setLinkScroll] = useState(true);
	const [linkZoom, setLinkZoom] = useState(true);
	/**
	 * Where a window departs from {@link DEFAULT_CONFIG}, by window id. Absence
	 * *is* the default, so a window nobody has configured reads the same object on
	 * every render and its memo holds.
	 *
	 * 某窗口偏离 {@link DEFAULT_CONFIG} 的地方，按窗口 id 索引。缺席*就是*默认，因此没人配置过的
	 * 窗口每次渲染读到的是同一个对象，它的记忆化得以保持。
	 */
	const [configs, setConfigs] = useState<Record<number, WindowConfig>>({});
	/** Every mounted window's chart, by id. A ref, not state: registering a chart must not re-render the grid. 每个已挂载窗口的图表，按 id 索引。用 ref 而非 state：登记一张图不应让网格重渲染。 */
	const charts = useRef(new Map<number, Chart>());
	/** Set while the grid is the one moving charts, so the events those moves fire come back to a handler that knows not to pass them on. 网格自己驱动图表期间置位，使这些动作引起的事件回到处理器时，处理器知道不要再传出去。 */
	const applying = useRef(false);

	/**
	 * Run one move against somebody else's chart with the linkage muted.
	 *
	 * Every programmatic move still fires the engine's own actions: `scrollToTimestamp`
	 * goes through `scroll`, which fires `onScroll`; `setBarSpace` re-runs the
	 * visible range. Without the mute, a scroll the grid performed on window B
	 * would read as the reader having scrolled window B, and would be passed on to
	 * A and C — which would pass it back.
	 *
	 * 在联动静音的情况下，对别人的图表执行一次移动。
	 *
	 * 每一次程序化移动仍然会触发引擎自己的动作：`scrollToTimestamp` 经由 `scroll`，会触发
	 * `onScroll`；`setBarSpace` 会重算可见区间。若没有这层静音，网格对窗口 B 做的一次滚动会被
	 * 读成「读者滚动了窗口 B」，继而传给 A 和 C —— 而它们又会传回来。
	 */
	const muted = useCallback((move: () => void) => {
		applying.current = true;
		try {
			move();
		} finally {
			applying.current = false;
		}
	}, []);

	/** Drive every window but the one that moved. 驱动除发起者以外的每个窗口。 */
	const mutedOnOthers = useCallback(
		(sourceId: number, move: (chart: Chart) => void) => {
			muted(() => {
				for (const [id, chart] of charts.current) {
					if (id !== sourceId) move(chart);
				}
			});
		},
		[muted],
	);

	const handleConfigChange = useCallback((id: number, config: WindowConfig) => {
		setConfigs((prev) => ({ ...prev, [id]: config }));
	}, []);

	const handleBarChange = useCallback((id: number, barKey: string) => {
		// The key changes with the bar size, so this window is about to be
		// remounted and its chart disposed. Dropping the entry here — before the
		// render that mounts the replacement — keeps a disposed chart out of the
		// crosshair loop even if the replacement fails to initialise.
		//
		// key 随周期一起变化，因此这个窗口即将重挂、它的图表即将被销毁。在这里就删掉条目 —— 早于
		// 挂载替代者的那次渲染 —— 这样即使替代者初始化失败，十字光标的循环里也不会留下已销毁的图表。
		charts.current.delete(id);
		setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, barKey } : w)));
	}, []);

	const handleClose = useCallback((id: number) => {
		charts.current.delete(id);
		// The configuration goes with the window: ids are handed out once and
		// reused by nobody, so a kept entry could only ever be a leak.
		// 配置随窗口一起消失：id 只发放一次、不会被谁重用，因此留下的条目只会是泄漏。
		setConfigs((prev) => {
			const rest = { ...prev };
			delete rest[id];
			return rest;
		});
		setWindows((prev) => prev.filter((w) => w.id !== id));
	}, []);

	// Windows are unbounded: the ladder opens with six and the button adds a
	// seventh, an eighth, however many the reader wants. A new one takes the bar
	// size the ladder has not used yet, so adding windows walks the list rather
	// than piling up copies of the same period.
	// 窗口不设上限：阶梯初开六个，按钮再加第七个、第八个，读者想要多少都行。新窗口取阶梯尚未用过的
	// 周期，因此不断添加是沿着清单往后走，而不是把同一个周期堆成好几份。
	const handleAdd = useCallback(() => {
		setWindows((prev) => [
			...prev,
			{
				id: nextWindowId(),
				barKey: LIVE_BARS[prev.length % LIVE_BARS.length].key,
			},
		]);
	}, []);

	const handleReady = useCallback((id: number, chart: Chart) => {
		charts.current.set(id, chart);
	}, []);

	/**
	 * Carry a window's scroll to the others as the same right-edge instant.
	 *
	 * The right edge is the only thing two bar sizes can agree on about position:
	 * "how far back am I" is a different question at each period, while "how recent
	 * is what I am showing" is the same question everywhere. It is also the edge
	 * live windows start on, so a linked scroll out of history and back is the same
	 * move in both directions.
	 *
	 * 把某个窗口的滚动以同一个右边缘时刻带给其它窗口。
	 *
	 * 右边缘是两个周期在「位置」上唯一能达成一致的东西：「我往回走了多远」在每个周期上都是不同的
	 * 问题，而「我显示的东西有多新」到哪里都是同一个问题。它也是实时窗口起始所在的边，因此联动滚动
	 * 进历史再回来，两个方向上是同一个动作。
	 */
	const handleScroll = useCallback(
		(sourceId: number) => {
			if (!linkScroll || applying.current) return;
			const source = charts.current.get(sourceId);
			if (!source) return;
			const range = source.getVisibleRange();
			const list = source.getDataList();
			const edge = range ? list[Math.min(range.to, list.length) - 1] : undefined;
			const timestamp = edge?.timestamp;
			if (typeof timestamp !== "number") return;
			mutedOnOthers(sourceId, (chart) => chart.scrollToTimestamp(timestamp));
		},
		[linkScroll, mutedOnOthers],
	);

	/**
	 * Carry a window's zoom to the others as the same number of visible candles.
	 *
	 * Bar count is the only thing that transfers: a bar width cannot, because the
	 * same pixels are a minute in one window and a day in another. The width of a
	 * pane is the same in every window, so a window's own count and bar space are
	 * enough to solve for the space that shows the wanted count — no need to ask
	 * the engine how wide the panes are.
	 *
	 * 把某个窗口的缩放以相同的可见蜡烛根数带给其它窗口。
	 *
	 * 能传递的只有根数：一根的宽度不能，因为同样的像素在一个窗口里是一分钟、在另一个窗口里是一天。
	 * 每个窗口的面板宽度相同，因此用窗口自己的根数与栏宽就足以解出「显示想要的根数」所需的栏宽 ——
	 * 不必去问引擎面板有多宽。
	 */
	const handleZoom = useCallback(
		(sourceId: number) => {
			if (!linkZoom || applying.current) return;
			const source = charts.current.get(sourceId);
			if (!source) return;
			const count = visibleBarCount(source);
			if (count === undefined) return;
			mutedOnOthers(sourceId, (chart) => {
				const own = visibleBarCount(chart);
				if (own === undefined) return;
				// `setBarSpace` refuses a space outside the configured limits, so a
				// count one of these panes cannot reach is declined rather than
				// clamped — the window keeps a width the reader chose.
				// `setBarSpace` 会拒绝超出配置上下限的栏宽，因此某个面板达不到的根数是被拒绝而不是被
				// 钳制 —— 该窗口保留读者选定的宽度。
				chart.setBarSpace((own * chart.getBarSpace().bar) / count);
			});
		},
		[linkZoom, mutedOnOthers],
	);

	/**
	 * The pointer has left a window, so every mirrored crosshair goes with it.
	 *
	 * Hiding a crosshair has no action of its own, so this asks for the same thing
	 * the engine does to itself when the pointer leaves a chart: `undefined`. That
	 * is not the same as an empty object — the facade fills a *given* crosshair's
	 * `paneId` with the candle pane, and a crosshair that names a pane is drawn,
	 * landing on the last bar because it carries no `x`. `undefined` is the one
	 * shape the facade passes through untouched, and an unnamed crosshair is what
	 * nothing looks like.
	 *
	 * It has to be asked for at all because the engine hides *its* crosshair
	 * silently: the action it fires on leave carries no `paneId`, so no handler is
	 * called, and a mirror, once set, would otherwise sit in the other windows
	 * forever — pointing at a moment nobody is pointing at any more.
	 *
	 * 指针已离开某个窗口，随之离开的还有每一处被镜像的十字光标。
	 *
	 * 隐藏光标没有专属动作，因此这里要的是引擎在指针离开图表时对自己做的同一件事：`undefined`。
	 * 它与空对象并不等价 —— 门面会把*传进来的*光标的 `paneId` 补成蜡烛面板，而一个指明了面板的
	 * 光标是会被画出来的，又因为它没有 `x`，便落在最后一根上。`undefined` 是门面唯一原样放过的
	 * 形状，而不指明面板的光标，看上去就是什么都没有。
	 *
	 * 之所以必须显式要求它，是因为引擎隐藏*自己*的光标时是不出声的：它在离开时触发的动作不带
	 * `paneId`，因此没有任何处理器会被调用，而一旦设上，镜像就会永远留在其它窗口里 —— 指着某个
	 * 已经没人指着的时刻。
	 */
	const handleLeave = useCallback(() => {
		for (const chart of charts.current.values()) {
			chart.executeAction("onCrosshairChange", undefined as unknown as Crosshair);
		}
	}, []);

	const handleCrosshair = useCallback(
		(sourceId: number, data: unknown) => {
			const source = charts.current.get(sourceId);
			const x = (data as Partial<Coordinate> | undefined)?.x;
			if (!source || typeof x !== "number") return;

			// The one hop that makes this work: the source's own pixel becomes a
			// timestamp, and only then may it be carried to anyone else.
			// 让这件事成立的那一跳：源窗口自己的像素先变成时间戳，此后才可以带给别人。
			const [point] = source.convertFromPixel([{ x }], {}) as Array<Partial<Point>>;
			const timestamp = point?.timestamp;
			if (typeof timestamp !== "number") return;

			for (const [id, chart] of charts.current) {
				if (id === sourceId) continue;
				// A window that does not hold the moment is not moved to look for it:
				// the engine would answer with its oldest candle and draw the crosshair
				// there, naming an instant the pointer is not on.
				// 不持有这一时刻的窗口不会为找它而移动：引擎会以它最老的蜡烛作答并把光标画在那里，
				// 指出的时刻却不是指针所在之处。
				if (!coversInstant(chart, timestamp)) continue;
				let pixel = panePixel(chart, timestamp);
				if (pixel === undefined && linkScroll) {
					// The moment is off this window's screen, and scroll is linked, so
					// the window is moved to where the moment is rather than left behind.
					// It is on screen afterwards by construction: the series covers the
					// moment, so scrolling can always bring it into view.
					//
					// 这一时刻不在该窗口的屏幕上，而滚动是联动的，因此把窗口移到这一时刻所在之处，
					// 而不是把它落在后面。事后它必然在屏幕上：序列覆盖了这一时刻，滚动总能把它带进
					// 视野。
					muted(() => chart.scrollToTimestamp(timestamp));
					pixel = panePixel(chart, timestamp);
				}
				if (pixel === undefined) continue;
				chart.executeAction("onCrosshairChange", { x: pixel, paneId: CANDLE_PANE });
			}
		},
		[linkScroll, muted],
	);

	return (
		<div style={{ display: "flex", flexDirection: "column" }}>
			<div style={STRIP_STYLE}>
				<span>
					{windows.length} windows · {OKX_INST_ID} · crosshair linked by timestamp ·
					scroll {linkScroll ? "linked" : "free"} · zoom {linkZoom ? "linked" : "free"}
				</span>
				<label style={{ display: "flex", alignItems: "center", gap: 4 }}>
					<input
						type="checkbox"
						checked={linkScroll}
						onChange={(event) => setLinkScroll(event.target.checked)}
					/>
					link scroll
				</label>
				<label style={{ display: "flex", alignItems: "center", gap: 4 }}>
					<input
						type="checkbox"
						checked={linkZoom}
						onChange={(event) => setLinkZoom(event.target.checked)}
					/>
					link zoom
				</label>
				<button type="button" style={SELECT_STYLE} onClick={handleAdd}>
					+ window
				</button>
			</div>
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fill, minmax(min(420px, 100%), 1fr))",
					gap: 8,
					padding: 8,
				}}
			>
				{windows.map((w) => (
					<LiveWindow
						key={`${w.id}:${w.barKey}`}
						id={w.id}
						barKey={w.barKey}
						height={260}
						config={configs[w.id] ?? DEFAULT_CONFIG}
						onConfigChange={handleConfigChange}
						onBarChange={handleBarChange}
						onClose={handleClose}
						onReady={handleReady}
						onCrosshair={handleCrosshair}
						onLeave={handleLeave}
						onScroll={handleScroll}
						onZoom={handleZoom}
					/>
				))}
			</div>
		</div>
	);
}

/**
 * The story renderer behind the docs' first canvas: it takes the live series and
 * hands it to `<AdaChart>`.
 *
 * It has to be a component — rather than a hook called inside the story's `render`
 * — because Storybook draws a page by calling that `render` **twice**: once for the
 * canvas, and once more through `originalStoryFn` solely to produce the "Show code"
 * snippet. A hook called in `render` therefore runs twice, which is two history
 * requests and two subscriptions for one chart; a `render` that merely *returns* an
 * element is only described by that second call, never executed, so the hook runs
 * once.
 *
 * 文档页第一个画布背后的 story 渲染器：它拿到那条实时序列，交给 `<AdaChart>`。
 *
 * 它必须是一个组件 —— 而不是写在 story 的 `render` 里直接调用 hook —— 因为 Storybook 画一页时
 * 会把那个 `render` 调**两次**：一次给画布，另一次经 `originalStoryFn`、只为生成 “Show code”
 * 片段。因此写在 `render` 里的 hook 会跑两遍，对一张图而言就是两次历史请求、两份订阅；而一个只
 * *返回*元素的 `render`，第二次调用只是描述它、并不执行，hook 因此只跑一次。
 */
function AdaChartStory({
	bar = "1Dutc",
	overlayNames,
	...args
}: AdaChartProps & { bar: OkxStreamBar; overlayNames?: string[] }) {
	const series = useLiveSeries(bar);
	const last = series.bars.at(-1);

	return (
		<div style={{ display: "flex", flexDirection: "column" }}>
			<div style={STRIP_STYLE}>
				<span>
					{OKX_INST_ID} {bar} · {series.source ?? "loading…"} · {series.status} ·{" "}
					{series.bars.length} bars
				</span>
				<span>
					{last
						? `last ${last.close.toFixed(1)} @ ${minuteStamp(last.timestamp)} UTC`
						: "-"}
				</span>
			</div>
			<AdaChart
				{...args}
				data={series.bars}
				overlays={
					overlayNames && series.history.length > 0
						? overlaysFor(series.history, overlayNames)
						: args.overlays
				}
			/>
		</div>
	);
}

const meta = {
	title: "Charts/AdaChart",
	component: AdaChart,
	tags: ["autodocs"],
	args: {
		...ADACHART_DEFAULTS,
		height: 480,
		indicators: [
			{ name: "MA" },
			{ name: "BOLL" },
			{ name: "VOL", paneId: "vol_pane" },
		],
		panes: [{ id: "vol_pane", height: 100 }],
	},
	argTypes: COMPONENT_ARG_TYPES,
	parameters: {
		okxBar: "1Dutc" satisfies OkxStreamBar,
		docs: {
			// What a reader copies has to be the props that *produced* the canvas above
			// — `<AdaChart height={480} indicators={[...]} … />` — rather than
			// `<AdaChart {...args} />`, which says nothing about what `args` holds, and
			// rather than what the generator produces on its own, which is the story's
			// renderer (`AdaChartStory`, plus its own `bar` prop) rather than the chart.
			//
			// Hence a `transform`: Storybook hands it the story's live args, and
			// {@link jsxSource} returns those written as JSX, minus every prop that is
			// merely {@link ADACHART_DEFAULTS}. Reading the args off the context instead
			// of hard-coding a string is what keeps the snippet true for every story in
			// this file, and after every edit to one.
			//
			// 读者要复制的是*产生*上面那张图的属性 —— `<AdaChart height={480} indicators={[...]} … />` ——
			// 而不是 `<AdaChart {...args} />`（它丝毫没有说明 `args` 里是什么），也不是生成器自己产出的
			// 东西（那是 story 的渲染器 `AdaChartStory` 和它自带的 `bar` 属性，而不是这张图）。
			//
			// 因此改用 `transform`：Storybook 把 story 活的 args 交给它，{@link jsxSource} 把这些 args
			// 写成 JSX 返回，并略去一切只是 {@link ADACHART_DEFAULTS} 的属性。从 context 读而不是写死
			// 字符串，正是这个片段对本文件每个 story、以及每一次改动之后都仍然成立的原因。
			//
			// The two parameters are annotated because the docs `parameters` bag is typed
			// loosely enough that they would otherwise be implicit `any` — and the second
			// one asks for the single field this needs rather than the whole context.
			//
			// 两个参数写明类型，是因为 docs 的 `parameters` 包类型较松，不写就成了隐式 `any`；
			// 而第二个只索取此处要用的那一个字段，不要整个 context。
			source: {
				transform: (_code: string, context: { args: Partial<AdaChartProps> }) =>
					jsxSource("AdaChart", context.args, ADACHART_DEFAULTS),
			},
		},
	},
	// Returning an element, and nothing else: this function runs twice per page (see
	// `AdaChartStory`), and neither run may execute a hook.
	// 只返回元素，仅此而已：这个函数每页会跑两次（见 `AdaChartStory`），两次都不应执行任何 hook。
	render: (args, context) => {
		const parameters = context.parameters as AdaChartStoryParameters;
		return (
			<AdaChartStory
				{...args}
				bar={parameters.okxBar ?? "1Dutc"}
				overlayNames={parameters.overlayNames}
			/>
		);
	},
} satisfies Meta<typeof AdaChart>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * 默认配置，也是文档页第一个画布：实心蜡烛，主图是 `EMA` 与 `vol-main`（成交量叠加在蜡烛自己的
 * 面板上，用自己的一条轴），下方三个面板分别是 `MACD`、`RSI`、`KDJ`，各占一条轴。实时行情随
 * 数据源的推送逐次更新。
 *
 * Default configuration, and the first canvas of the docs: solid candles, `EMA` and
 * `vol-main` on the main pane (the volume overlay shares the candles' pane but keeps
 * an axis of its own), with `MACD`, `RSI` and `KDJ` below, one study per pane.
 * Ticking live as the feed pushes.
 */
export const Candlestick: Story = {
	args: {
		indicators: [
			{ name: "EMA", stack: true },
			{ name: VOLUME_OVERLAY_INDICATOR, stack: true },
			{ name: "MACD", paneId: "macd_pane" },
			{ name: "RSI", paneId: "rsi_pane" },
			{ name: "KDJ", paneId: "kdj_pane" },
		],
		panes: [
			{ id: "macd_pane", height: 80 },
			{ id: "rsi_pane", height: 80 },
			{ id: "kdj_pane", height: 80 },
		],
	},
};

/**
 * 空心蜡烛。Hollow (stroked) candles.
 */
export const CandleStroke: Story = { args: { candleType: "candle_stroke" } };

/**
 * OHLC 柱形。OHLC bars.
 */
export const Ohlc: Story = {
	name: "OHLC bars",
	args: { candleType: "ohlc", indicators: [{ name: "MA" }] },
};

/**
 * 面积线，价格填充渐变。Area line with a gradient price fill.
 */
export const Area: Story = {
	args: {
		candleType: "area",
		indicators: [],
		styles: { candle: { area: { smooth: true } } },
	},
};

/**
 * 常用技术指标：主图 MA，副图 MACD。A common stack of indicators: MA on the main pane, MACD below.
 */
export const WithIndicators: Story = {
	args: {
		indicators: [
			{ name: "MA" },
			{ name: "EMA" },
			{ name: "VOL", paneId: "vol_pane" },
			{ name: "MACD", paneId: "macd_pane" },
			{ name: "KDJ", paneId: "kdj_pane" },
		],
		panes: [
			{ id: "vol_pane", height: 80 },
			{ id: "macd_pane", height: 80 },
			{ id: "kdj_pane", height: 80 },
		],
	},
};

/**
 * 布林带 + RSI。Bollinger Bands with an RSI sub-pane.
 */
export const BollingerRsi: Story = {
	args: {
		indicators: [
			{ name: "BOLL" },
			{ name: "RSI", paneId: "rsi_pane" },
		],
		panes: [{ id: "rsi_pane", height: 100 }],
	},
};

/**
 * 内置画线工具（价格线 + 斐波那契线）。Built-in drawing tools (price line + fibonacci line).
 */
export const BuiltInOverlays: Story = {
	parameters: { overlayNames: ["priceLine", "fibonacciLine", "segment"] },
	args: { indicators: [] },
};

/**
 * 来自 `@klinecharts/extension` 的扩展画线工具，`AdaChart` 会自动注册。
 * Extension drawing tools from `@klinecharts/extension`, auto-registered by `AdaChart`.
 */
export const ExtensionOverlays: Story = {
	name: "Extension overlays (@klinecharts/extension)",
	parameters: { overlayNames: ["rect", "gannBox", "fibonacciSpiral", "abcd"] },
	args: { indicators: [] },
};

/**
 * 深色主题。Dark theme.
 */
export const DarkTheme: Story = {
	args: {
		theme: "dark",
		backgroundColor: "#131722",
		candleType: "candle_solid",
		indicators: [
			{ name: "MA" },
			{ name: "VOL", paneId: "vol_pane" },
		],
		panes: [{ id: "vol_pane", height: 100 }],
	},
};

/**
 * 中文界面。Chinese UI locale.
 */
export const ChineseLocale: Story = {
	args: { locale: "zh-CN" },
};

/**
 * 真实一分钟 K 线，本地时区。Live one-minute bars in a chosen timezone.
 */
export const MinuteBars: Story = {
	name: "Live 1-minute bars",
	parameters: { okxBar: "1m" },
	args: {
		periodType: "minute",
		periodSpan: 1,
		timezone: "Asia/Shanghai",
		indicators: [{ name: "VOL", paneId: "vol_pane" }],
		panes: [{ id: "vol_pane", height: 90 }],
	},
};

/**
 * 通过 `styles` 兜底项做的完全自定义配色 —— 任何未封装为 prop 的设置都能从这里到达。
 * Fully custom palette via the raw `styles` escape hatch — anything not surfaced as a prop is reachable here.
 */
export const CustomStyles: Story = {
	args: {
		theme: "dark",
		backgroundColor: "#0b1020",
		indicators: [{ name: "MA" }],
		styles: {
			candle: {
				bar: { upColor: "#22d3ee", downColor: "#f472b6", noChangeColor: "#94a3b8" },
			},
			grid: { horizontal: { color: "rgba(148, 163, 184, 0.12)" }, vertical: { show: false } },
			xAxis: { tickText: { color: "#cbd5e1", size: 11 } },
			yAxis: { tickText: { color: "#cbd5e1", size: 11 } },
		},
	},
};

/**
 * 左侧 y 轴、隐藏网格与标记，用于仪表盘式紧凑嵌入。
 * Left y-axis with grid and price marks off — the compact look for dashboards.
 */
export const Minimal: Story = {
	args: {
		yAxisPosition: "left",
		showGrid: false,
		showPriceMark: false,
		tooltipShowRule: "none",
		indicators: [],
	},
};

/**
 * 只读预览：禁用滚动与缩放。Read-only preview: scrolling and zooming disabled.
 */
export const ReadOnly: Story = {
	args: { scrollEnabled: false, zoomEnabled: false, indicators: [] },
};

/**
 * 全部内置画线工具的名称列表（供扩展或工具栏使用）。
 * The names of every overlay `AdaChart` can draw — built-in plus extension — for toolbars or programmatic use.
 */
export const KnownOverlayNames: Story = {
	name: "All known overlay names",
	// Not a chart: this story shows the list itself, so the args-derived snippet the
	// meta installs would describe a chart nobody is looking at. The value on display
	// is the export, and that is what the snippet says.
	// 这不是一张图：本 story 展示的是那份清单本身，因此 meta 装的、由 args 派生的片段会描述一张
	// 没人看着的图。屏幕上是那个导出，片段便写它。
	parameters: { docs: { source: { type: "code", code: "ADACHART_OVERLAY_NAMES" } } },
	render: () => (
		<div style={{ padding: 12, font: "12px/1.6 ui-monospace, monospace" }}>
			<p>
				<code>ADACHART_OVERLAY_NAMES</code> ({ADACHART_OVERLAY_NAMES.length}):
			</p>
			<pre style={{ whiteSpace: "pre-wrap" }}>
				{JSON.stringify(ADACHART_OVERLAY_NAMES, null, 0)}
			</pre>
		</div>
	),
};

/**
 * 多周期实时网格：每个窗口一张 `AdaChart`，各自独立的周期选择器、各自的实时订阅，
 * 十字光标按时间戳跨窗口联动。
 *
 * 各窗口共享一条 WebSocket，频道按引用计数；蜡烛互不干扰（每个窗口只重渲染自己）。顶部的两个开关
 * 分别决定滚动与缩放是否联动：滚动对齐右边缘的那一刻，缩放对齐可见蜡烛的根数。开关关闭时，看不到
 * 所指标 K 线的窗口保持原样；开关打开时，该窗口会滚动过去把这一时刻移入视野 —— 除非它的历史根本
 * 不够久远，那种情况下它仍然不动，因为无处安放。用 `+ window` 添加、`×` 关闭，窗口数不设上限。
 *
 * 每个窗口的 `indicators` 面板里可以勾选主图指标（MA/EMA/BOLL/SAR 等，叠加在蜡烛所在的价格面板上）、
 * 添加副图 pane 并为每个 pane 选一个指标（VOL/MACD/KDJ/RSI 等，各自用独立坐标轴）。配置按窗口各自
 * 保存，改周期时窗口会重挂，但配置跟着窗口 id 走，不会丢。
 *
 * A grid of live windows: one `AdaChart` each, each with its own period picker and
 * its own subscription, with the crosshair linked across them by timestamp.
 *
 * The windows share one WebSocket, refcounted per channel; a candle in one window
 * never redraws another. Two switches at the top decide whether scroll and zoom are
 * linked: scroll aligns on the right-edge instant, zoom on the number of visible
 * candles. With a switch off, a window that cannot see the pointed-at bar is left
 * alone; with scroll on, that window is scrolled to bring the moment into view —
 * unless its history does not reach back that far, in which case it still stays put,
 * because there is nowhere to put the moment. `+ window` adds, `×` closes, and
 * there is no cap on how many.
 *
 * Each window's `indicators` panel picks the main-pane studies (MA/EMA/BOLL/SAR and
 * the like, stacked on the candles' own pane) and adds sub panes, one indicator each
 * (VOL/MACD/KDJ/RSI and the like, each on an axis of its own). The configuration is
 * per window and follows the window's id, so changing a window's period — which
 * remounts it — does not lose it.
 */
export const MultiPeriodGrid: Story = {
	name: "Multi-period live grid",
	render: () => <LiveGrid />,
};
