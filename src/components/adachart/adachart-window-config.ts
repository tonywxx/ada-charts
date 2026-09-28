import type { AdaChartIndicator } from "./AdaChart";

/**
 * The volume overlay this library adds on top of the engine's own list: one bar
 * per candle, on the candles' own pane, and nothing else. It exists because the
 * engine's `VOL` carries three moving averages, and a reader who wants the bars
 * alone cannot have them from a study whose whole shape is the averages.
 *
 * `VOL` is left exactly as it is, pane and all: these are two studies, not two
 * settings of one.
 *
 * 本库在引擎自带清单之外追加的成交量叠加指标：一根蜡烛一根柱，画在蜡烛自己的面板上，仅此而已。
 * 它之所以存在，是因为引擎的 `VOL` 带着三条均线，而只想要柱子的读者无法从一个以均线为全部形状的
 * 指标里拿到它们。
 *
 * `VOL` 一字不动，面板也一样：这是两个指标，而不是一个指标的两档设置。
 */
export const VOLUME_OVERLAY_INDICATOR = "vol-main";

/**
 * The studies read against the price axis, and so drawn on the candles' own
 * pane: all but one of them are drawn in the instrument's own units. The
 * exception is `vol-main`, which is drawn in the candles' pane but reads against
 * an axis of its own — a count cannot be drawn against a price. It is listed
 * here because it is a main-pane study; how it gets that axis is `AdaChart`'s
 * business.
 *
 * 与价格轴对照阅读、因此属于价格面板的指标：除一个之外都以标的自身的单位绘制。例外是 `vol-main`
 * —— 它画在蜡烛面板里，却对照着自己的一条轴：计数无法用价格来画。把它列在这里，因为它是主图指标；
 * 那条轴从何而来是 `AdaChart` 的事。
 */
export const MAIN_INDICATORS = ["MA", "EMA", "SMA", "BOLL", "BBI", "SAR", "AVP", VOLUME_OVERLAY_INDICATOR] as const;

/**
 * The studies that need an axis of their own, because they are not priced: a
 * volume, a ratio, an oscillator. One per pane — that is the engine's own
 * convention, and two of them sharing a pane would share an axis with no unit.
 *
 * 需要独立坐标轴的指标：它们不是价格 —— 成交量、比率、摆动量。一个面板一个，这既是引擎自身的
 * 惯例，也因为两个共用面板就等于共用一条没有单位的坐标轴。
 *
 * Every name the engine ships is in one of these two lists, split by which axis
 * it is read against. `MAIN_INDICATORS` also holds one name the engine has never
 * heard of — `vol-main`, this library's own addition — so the two together are
 * the engine's list plus that one.
 * 引擎提供的每一个名称都在这两份清单之一，按所对照的坐标轴划分。`MAIN_INDICATORS` 另含一个引擎
 * 从不知道的名字 —— 本库自加的 `vol-main` —— 因此两者合起来是引擎那份清单再加上它。
 */
export const SUB_INDICATORS = [
	"VOL", "MACD", "KDJ", "RSI", "BIAS", "CCI", "DMI", "WR", "OBV", "PSY",
	"ROC", "MTM", "TRIX", "DMA", "VR", "CR", "EMV", "BRAR", "AO", "PVT",
] as const;

/** How tall a sub pane is drawn. One number for every pane: the point of the panel is the indicator in it, not its height. 副面板的高度。所有面板共用一个数字：本面板的要点是里面放什么指标，而不是它多高。 */
export const SUB_PANE_HEIGHT = 80;

/**
 * One pane below the candles. The id is the pane's name inside one chart, and
 * the same string the panel's own controls are labelled with, so what a reader
 * picked stays identifiable after the config has been through a render.
 *
 * 蜡烛下方的一个面板。id 是该面板在一张图内的名字，也是面板自身控件的标注，因此读者选过的东西
 * 在配置经过一轮渲染之后仍然可辨。
 */
export interface WindowPane {
	id: string;
	indicator: string;
}

/**
 * What one window draws: the studies over the candles, and the panes below, one
 * study each.
 *
 * A value, not a live object: every change below returns a new config and leaves
 * the one it was given alone. That is what lets a window keep its configuration
 * in React state and recompute its chart props off the config's identity, and it
 * is asserted rather than assumed — a reducer that mutated in place would leave
 * the memo holding a stale tree.
 *
 * 一个窗口画什么：蜡烛之上的指标，以及下方各自放一个指标的面板。
 *
 * 它是值而非活对象：下面每一次改动都返回新的配置，并让它拿到的那个保持原样。正因如此，窗口才能把
 * 配置放在 React state 里、并以配置的引用为依赖重算图表 props —— 这一点是被断言的，而不是被假定
 * 的：一个就地修改的 reducer 会让记忆化抱住一棵过期的树。
 */
export interface WindowConfig {
	/** Names stacked onto the price pane. 叠加在价格面板上的指标名。 */
	main: string[];
	/** Panes below the candles, in order. 蜡烛下方的面板，按顺序。 */
	panes: WindowPane[];
}

/**
 * What a window draws before anyone opens its panel: the engine's `EMA` — its
 * own 6/12/20, three lines — with the volume overlay beneath it on the same
 * pane, and one `MACD` pane below.
 *
 * Volume on the candles rather than in a pane of its own is the whole point: a
 * pane below is a second chart with an axis of its own, and a reader comparing a
 * bar's height with the candle that produced it should not have to look in two
 * places. The pane list stays one study long on purpose, so a freshly opened
 * grid is a chart rather than a wall of axes.
 *
 * 打开面板之前窗口画的东西：引擎的 `EMA` —— 它自己的 6/12/20，三根线 —— 以及同一面板上它下方的
 * 成交量叠加，再加下方一个 `MACD` 面板。
 *
 * 把成交量画在蜡烛上而不是自开一个面板，正是要点：下方的面板是另一张图、另一条坐标轴，而一个想拿
 * 柱高与产生它的那根蜡烛作比较的读者，不该往两个地方看。面板清单特意只留一个指标，因此刚打开的
 * 网格是一张图，而不是一堵坐标轴。
 */
export const DEFAULT_CONFIG: WindowConfig = {
	main: ["EMA", VOLUME_OVERLAY_INDICATOR],
	panes: [{ id: "macd_pane", indicator: "MACD" }],
};

/**
 * The configuration in the shape `AdaChart` takes: main-pane names stacked onto
 * the candle pane, and each sub pane's study carrying that pane's id.
 *
 * The two halves differ in exactly one field, and that field is the whole
 * decision. A `stack`ed study joins the candles' pane and shares their axis; a
 * study with a `paneId` is given a pane of its own. Neither field alone says
 * anything: sending a moving average as its own pane would put a price on an
 * axis with no price, and stacking volume would put a count on the candles'
 * axis — both wrong, neither an error.
 *
 * 把配置写成 `AdaChart` 要的形状：主图名叠加在蜡烛面板上，副面板的指标带着该面板的 id。
 *
 * 两半只差一个字段，而这个字段就是全部决定。带 `stack` 的指标并入蜡烛面板、共用其坐标轴；带
 * `paneId` 的指标得到自己的面板。单看哪一个字段都不说明问题：把均线发成独立面板等于把价格放到一条
 * 没有价格的轴上，把成交量叠加则等于把计数放到蜡烛的轴上 —— 两者都错，却都不报错。
 */
export function indicatorsFor(config: WindowConfig): AdaChartIndicator[] {
	return [
		...config.main.map((name) => ({ name, stack: true })),
		...config.panes.map((pane) => ({ name: pane.indicator, paneId: pane.id })),
	];
}

/**
 * The panes to create, in the order the panel lists them: the same ids the
 * studies above are addressed by, and one height for all of them.
 *
 * 要创建的面板，按面板列出的顺序：与上面的指标所用的同一批 id，且共用同一个高度。
 */
export function panesFor(config: WindowConfig): Array<{ id: string; height: number }> {
	return config.panes.map((pane) => ({ id: pane.id, height: SUB_PANE_HEIGHT }));
}

/** Whether that study is currently stacked on the candles. 该指标此刻是否叠加在蜡烛上。 */
export function toggleMainIndicator(config: WindowConfig, name: string): WindowConfig {
	return {
		...config,
		main: config.main.includes(name)
			? config.main.filter((one) => one !== name)
			: [...config.main, name],
	};
}

/**
 * Adds a pane, on the first sub study this window is not already showing, so
 * that adding panes walks the list instead of stacking one name.
 *
 * The id is asked for rather than minted here: a pane id only has to be unique
 * within one chart, which is a fact about the chart, and a function that took it
 * from a counter of its own would be untestable in the one way that matters —
 * what it does with a given id.
 *
 * 添加一个面板，取本窗口尚未显示的第一个副图指标，因此不断添加是沿着清单往后走，而不是把同一个
 * 名字堆成好几份。
 *
 * id 由调用方给出而非在此铸造：面板 id 只需在一张图内唯一，这是关于那张图的事实；而一个从自己的
 * 计数器里取 id 的函数，恰恰在最要紧的那一点上无法测试 —— 它拿到某个 id 时做了什么。
 */
export function addSubPane(config: WindowConfig, id: string): WindowConfig {
	const taken = new Set(config.panes.map((pane) => pane.indicator));
	const indicator = SUB_INDICATORS.find((name) => !taken.has(name)) ?? SUB_INDICATORS[0];
	return { ...config, panes: [...config.panes, { id, indicator }] };
}

/** Points one pane at another study, leaving every other pane as it was. 把某个面板改成另一个指标，其余面板保持原样。 */
export function setSubPaneIndicator(
	config: WindowConfig,
	paneId: string,
	indicator: string,
): WindowConfig {
	return {
		...config,
		panes: config.panes.map((pane) => (pane.id === paneId ? { ...pane, indicator } : pane)),
	};
}

/** Removes one pane and nothing else. 移除某个面板，其余一概不动。 */
export function removeSubPane(config: WindowConfig, paneId: string): WindowConfig {
	return { ...config, panes: config.panes.filter((pane) => pane.id !== paneId) };
}