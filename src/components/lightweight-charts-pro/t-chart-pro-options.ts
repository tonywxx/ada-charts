import { TickMarkType, type BusinessDay, type ChartOptions, type DeepPartial, type Time } from "lightweight-charts";
import { pricePrecisionOf } from "../../price-precision";
import { DARK_THEME, LIGHT_THEME, withAlpha, type ChartTheme } from "../../theme";
import type { TChartProps, TChartType } from "../lightweight-charts/TChart";
import type { TChartProProps } from "./TChartPro";

/**
 * The Pro layer's own vocabulary. Nothing in here knows about an engine:
 * `lightweight-charts` has no instrument, bar size or feed concept of its own,
 * so — unlike the `klinecharts` Wrappers, whose engine does supply those names —
 * the domain words from `CONTEXT.md` are used directly.
 *
 * Pro 层自己的词汇。这里没有任何引擎概念：`lightweight-charts` 本身没有标的、K 线周期
 * 与数据源的概念，因此不同于 `klinecharts` 那两层（引擎自带这些名字），这里直接用
 * `CONTEXT.md` 里的领域词。
 */

/**
 * The instrument a chart shows. Field names follow {@link TChartProProps} so the
 * toolbar's symbol dialog and the props agree.
 * 图表展示的标的。字段名与 {@link TChartProProps} 一致，使工具栏的标的选择与 props 同源。
 */
export interface TChartProSymbol {
	/** Instrument id as the feed spells it, e.g. `BTC-USDT`. 数据源使用的标的标识。 */
	ticker: string;
	/** Full name. 全称。 */
	name?: string;
	/** Compact name for the toolbar. 工具栏使用的简称。 */
	shortName?: string;
	/** Venue. 交易所。 */
	exchange?: string;
	/** Price decimals shown on the axis. 价格轴展示的小数位。 */
	pricePrecision?: number;
	/** Volume decimals. 成交量小数位。 */
	volumePrecision?: number;
	/** Quote currency. 计价货币。 */
	priceCurrency?: string;
}

/** A candle in the shape the Pro feed hands over: `time` is a unix second. Pro 数据源交出的 K 线：`time` 为秒级 Unix 时间戳。 */
export interface TChartProCandle {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

/**
 * Where a feed pushes the newest candle.
 * 数据源推送最新一根 K 线的回调。
 */
export type TChartProFeedCallback = (candle: TChartProCandle) => void;

/**
 * The data source behind `TChartPro`: symbol search, history, and a live
 * subscription — the same four responsibilities as `@klinecharts/pro`'s
 * `Datafeed`, expressed without that engine's types.
 *
 * `TChartPro` 的数据源：标的搜索、历史数据与实时订阅 —— 与 `@klinecharts/pro` 的
 * `Datafeed` 承担同样四项职责，但不带那个引擎的类型。
 */
export interface TChartProDatafeed {
	searchSymbols(search?: string): Promise<TChartProSymbol[]>;
	getHistory(
		symbol: TChartProSymbol,
		barSize: string,
	): Promise<TChartProCandle[]>;
	subscribe(symbol: TChartProSymbol, barSize: string, onNext: TChartProFeedCallback): void;
	unsubscribe(symbol: TChartProSymbol, barSize: string): void;
}

/**
 * Every indicator `TChartPro` can plot, in the order `KChartPro`'s engine lists
 * its own: the same 27 studies, so a name means the same thing whichever Wrapper
 * draws it. Either list in {@link TChartProProps} accepts any of them — the
 * engine decides nothing about placement, so neither does this layer.
 *
 * `TChartPro` 能绘制的全部指标，顺序与 `KChartPro` 引擎自带目录一致：同样 27 个指标，
 * 因此无论由哪一层 Wrapper 绘制，一个名字的含义都相同。{@link TChartProProps} 的
 * 两个清单都接受其中任意一个 —— 引擎不判断落点，本层同样不判断。
 */
export const TCHARTPRO_INDICATORS = [
	"AVP",
	"AO",
	"BIAS",
	"BOLL",
	"BRAR",
	"BBI",
	"CCI",
	"CR",
	"DMA",
	"DMI",
	"EMV",
	"EMA",
	"MTM",
	"MA",
	"MACD",
	"OBV",
	"PVT",
	"PSY",
	"ROC",
	"RSI",
	"SMA",
	"KDJ",
	"SAR",
	"TRIX",
	"VOL",
	"VR",
	"WR",
] as const;

/** Any indicator name `TChartPro` understands. `TChartPro` 认识的指标名。 */
export type TChartProIndicator = (typeof TCHARTPRO_INDICATORS)[number];

/** Magnet strength when placing a drawing: none, or snap to the nearest bar's OHLC. 画线时的磁吸强度：关闭，或吸附到最近 K 线的 OHLC。 */
export type TChartProMagnet = "off" | "weak" | "strong";

/** A saved drawing, in the exact shape `lightweight-charts-drawing` serializes. 已保存画线的结构，与 `lightweight-charts-drawing` 的序列化格式一致。 */
export interface TChartProDrawingAnchor {
	time: number | string;
	price: number;
}

/**
 * Everything the Pro toolbar offers, in the defaults' shadow so docs, args and
 * runtime read from one object — the same rule `TCHART_DEFAULTS` follows.
 *
 * Pro 工具栏提供的全部默认值，与 `TCHART_DEFAULTS` 同一条规则：默认值只此一份，
 * 文档、控件与运行时都从它读取。
 */
export const TCHARTPRO_DEFAULTS = {
	width: 900,
	height: 520,
	autoSize: true,
	theme: "light",
	locale: "en-US",
	timezone: "UTC",
	drawingBarVisible: true,
	drawingTools: [] as const,
	magnet: "off",
	keepToolArmed: false,
	lockNewDrawings: false,
	barSize: "1D",
	mainIndicators: ["MA"],
	subIndicators: ["VOL"],
} as const;

/**
 * Bar sizes the toolbar offers by default; the labels double as OKX `bar` codes.
 * 工具栏默认提供的 K 线周期；标签同时就是 OKX 的 `bar` 代码。
 */
export const TCHARTPRO_DEFAULT_BAR_SIZES = [
	"1m",
	"15m",
	"1H",
	"4H",
	"1D",
	"1W",
] as const;

/**
 * The instrument `TChartPro` loads when none is given, and its minimum moves.
 * Precision is stated as the instrument's tick and the decimals are derived from
 * it, per `CONTEXT.md`: the tick is the fact, the decimal count is a consequence.
 *
 * 未指定标的时 `TChartPro` 加载的那一个，以及它的最小变动单位。精度以标的的 tick 表述，
 * 小数位由它推得 —— 依 `CONTEXT.md`：tick 才是事实，小数位数只是它的结果。
 */
export const TCHARTPRO_DEFAULT_SYMBOL: TChartProSymbol = {
	ticker: "BTC-USDT",
	name: "Bitcoin / Tether",
	shortName: "BTC",
	exchange: "OKX",
	priceCurrency: "USDT",
	pricePrecision: pricePrecisionOf(0.1)?.decimals ?? 0,
	volumePrecision: pricePrecisionOf(0.01)?.decimals ?? 0,
};

/** Keys of {@link TChartProProps} that a default in {@link TCHARTPRO_DEFAULTS} fills. {@link TChartProProps} 中由 {@link TCHARTPRO_DEFAULTS} 补齐的键。 */
export type TChartProResolvedProps = Omit<TChartProProps, keyof typeof TCHARTPRO_DEFAULTS> & {
	[K in keyof typeof TCHARTPRO_DEFAULTS]-?: NonNullable<
		K extends keyof TChartProProps ? TChartProProps[K] : never
	>;
} & {
	symbol: TChartProSymbol;
	barSizes: readonly string[];
};

/**
 * Merge caller props over {@link TCHARTPRO_DEFAULTS}, ignoring keys the caller
 * passed as `undefined` so an explicit `undefined` still means "use the default".
 *
 * 把调用方 props 合并到 {@link TCHARTPRO_DEFAULTS} 之上；值为 `undefined` 的键视为
 * 未传，仍然使用默认值。
 */
export function resolveTChartProProps(props: TChartProProps): TChartProResolvedProps {
	const resolved: Record<string, unknown> = { ...TCHARTPRO_DEFAULTS };
	for (const [key, value] of Object.entries(props)) {
		if (value !== undefined) resolved[key] = value;
	}
	resolved.symbol = props.symbol ?? TCHARTPRO_DEFAULT_SYMBOL;
	resolved.barSizes = props.barSizes ?? [...TCHARTPRO_DEFAULT_BAR_SIZES];
	// The defaults' own arrays must not leak out: one caller pushing into
	// `mainIndicators` would otherwise re-decide everyone else's default.
	// 默认值里的数组不能原样交出去：否则某个调用方往 `mainIndicators` 里 push 一下，
	// 就等于替所有人重写了默认值。
	resolved.mainIndicators = [...(resolved.mainIndicators as readonly string[])];
	resolved.subIndicators = [...(resolved.subIndicators as readonly string[])];
	return resolved as unknown as TChartProResolvedProps;
}


/**
 * Shallow `memo` comparator: object-valued props compare by identity, so a
 * caller that keeps `symbol`/`datafeed` stable pays nothing for them.
 *
 * 浅层 `memo` 比较器：对象型属性按引用比较，因此保持稳定引用的 `symbol`/`datafeed`
 * 不产生开销。
 */
export function areTChartProPropsEqual(
	previous: Record<string, unknown>,
	next: Record<string, unknown>,
): boolean {
	const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
	for (const key of keys) {
		const left = previous[key];
		const right = next[key];
		if (left !== right && !(left === undefined && right === undefined)) {
			return false;
		}
	}
	return true;
}

/** The Theme tokens behind a named theme, shared with every other Wrapper. 命名主题背后的 Theme token，与其他 Wrapper 共用同一份。 */
export function chartThemeOf(theme: "light" | "dark"): ChartTheme {
	return theme === "dark" ? DARK_THEME : LIGHT_THEME;
}

/**
 * Toolbar strings, per locale. `@klinecharts/pro` ships its own catalogue; this
 * layer only has its own buttons to name.
 *
 * 工具栏文案，按语言分。`@klinecharts/pro` 自带词条库；这一层需要命名的只有自己
 * 这几个按钮。
 */
const MESSAGES = {
	"en-US": {
		symbol: "Symbol",
		search: "Search",
		indicators: "Indicators",
		drawing: "Draw",
		main: "Main",
		sub: "Sub",
		theme: "Theme",
		undo: "Undo",
		clear: "Clear",
		delete: "Delete",
		magnet: "Magnet",
		lock: "Lock",
		keep: "Keep tool",
		close: "Close",
		noResults: "No matches",
	},
	"zh-CN": {
		symbol: "标的",
		search: "搜索",
		indicators: "指标",
		drawing: "画线",
		main: "主图",
		sub: "副图",
		theme: "主题",
		undo: "撤销",
		clear: "清空",
		delete: "删除",
		magnet: "磁吸",
		lock: "锁定",
		keep: "保持工具",
		close: "关闭",
		noResults: "无匹配",
	},
} as const;

/** Toolbar message key. 工具栏文案的键。 */
export type TChartProMessageKey = keyof (typeof MESSAGES)["en-US"];

/**
 * The message for `locale`, falling back to English for an unlisted language.
 * `locale` 对应的文案；未收录的语言回退到英文。
 */
export function messageFor(locale: string, key: TChartProMessageKey): string {
	const table = MESSAGES[locale as keyof typeof MESSAGES];
	return table?.[key] ?? MESSAGES["en-US"][key];
}

/**
 * The named Theme translated into the {@link TChartProps} it implies.
 *
 * `@klinecharts/pro` takes one `theme` string because its engine owns a theme
 * catalogue; `lightweight-charts` has none, so the Pro layer fans the same
 * {@link ChartTheme} tokens out over the props `TChart` already exposes — and a
 * caller's own colour prop still wins, because these are merged underneath it.
 *
 * 把命名主题翻译成它隐含的那组 {@link TChartProps}。
 *
 * `@klinecharts/pro` 只需一个 `theme` 字符串，因为它的引擎自带主题目录；
 * `lightweight-charts` 没有，所以 Pro 层把同一批 {@link ChartTheme} token 扇出到
 * `TChart` 已有的 prop 上 —— 并且调用方自己传的颜色 prop 仍然优先，因为这些值垫在它下面。
 */
export function tChartPropsForTheme(theme: "light" | "dark"): Partial<TChartProps> {
	const tokens = chartThemeOf(theme);
	const dark = theme === "dark";
	return {
		backgroundColor: dark ? "#131722" : "#ffffff",
		textColor: tokens.axisText,
		fontFamily: tokens.fontFamily,
		fontSize: tokens.fontSize,
		vertGridColor: tokens.gridLine,
		horzGridColor: tokens.gridLine,
		timeScaleBorderColor: tokens.axisBorder,
		priceScaleBorderColor: tokens.axisBorder,
		paneSeparatorColor: tokens.gridLine,
		paneSeparatorHoverColor: tokens.accent,
		crosshairVertColor: tokens.crosshair,
		crosshairHorzColor: tokens.crosshair,
		crosshairVertLabelBackgroundColor: tokens.crosshair,
		crosshairHorzLabelBackgroundColor: tokens.crosshair,
		upColor: tokens.trendUp,
		downColor: tokens.trendDown,
		wickUpColor: tokens.trendUp,
		wickDownColor: tokens.trendDown,
		borderUpColor: tokens.trendUp,
		borderDownColor: tokens.trendDown,
		volumeUpColor: withAlpha(tokens.trendUp, 0.5),
		volumeDownColor: withAlpha(tokens.trendDown, 0.5),
		lineColor: tokens.accent,
		topColor: tokens.accent,
		bottomColor: dark ? "#131722" : "#ffffff",
		priceLineColor: tokens.accent,
	} as Partial<TChartProps>;
}

/**
 * A `Date` for any time the library accepts: a unix second, a business-day
 * string, or a business-day object.
 * 库接受的任意时间形式对应的 `Date`：秒级时间戳、交易日字符串或交易日对象。
 */
function dateOf(time: Time): Date {
	if (typeof time === "number") return new Date(time * 1000);
	if (typeof time === "string") {
		const [year, month, day] = time.split("-").map(Number);
		return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
	}
	const business = time as BusinessDay;
	return new Date(Date.UTC(business.year, business.month - 1, business.day));
}

/**
 * `lightweight-charts` prints dates in the browser's zone and has no
 * `timezone` option, so the Pro layer supplies the formatters its engine would
 * otherwise own: labels are produced through `Intl` in the requested IANA zone.
 *
 * `lightweight-charts` 按浏览器时区打印日期，也没有 `timezone` 选项，因此 Pro 层要
 * 自己提供引擎本来会负责的那批格式化函数：标签一律用 `Intl` 按请求的 IANA 时区生成。
 */
export function formattersFor(
	locale: string,
	timezone: string,
): Pick<DeepPartial<ChartOptions>, "localization" | "timeScale"> {
	const parts = (time: Time, options: Intl.DateTimeFormatOptions) => {
		try {
			return new Intl.DateTimeFormat(locale, {
				...options,
				timeZone: timezone,
			}).format(dateOf(time));
		} catch {
			// An IANA name the runtime does not know must not take the whole chart
			// down with it; `Intl` throws at construction, not at format time.
			// 运行时不认识的 IANA 名字不该把整张图一起带倒；`Intl` 是在构造时抛错，
			// 不是格式化的时候。
			return new Intl.DateTimeFormat(locale, options).format(dateOf(time));
		}
	};
	return {
		localization: {
			locale,
			timeFormatter: (time: Time) =>
			parts(time, {
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
			}),
		},
		timeScale: {
			tickMarkFormatter: (time: Time, tickMarkType: TickMarkType) => {
			switch (tickMarkType) {
				case TickMarkType.Year:
					return parts(time, { year: "numeric" });
				case TickMarkType.Month:
					return parts(time, { month: "short", year: "numeric" });
				case TickMarkType.DayOfMonth:
					return parts(time, { month: "short", day: "numeric" });
				case TickMarkType.TimeWithSeconds:
					return parts(time, {
						hour: "2-digit",
						minute: "2-digit",
						second: "2-digit",
						hour12: false,
					});
				case TickMarkType.Time:
					return parts(time, {
						hour: "2-digit",
						minute: "2-digit",
						hour12: false,
					});
				}
			},
		},
	};
}

/**
 * Whether a bar size is shorter than a day, i.e. whether the axis has to print
 * a clock time to be readable. `@klinecharts/pro` derives this from its
 * `Period`; here the label itself carries the unit.
 *
 * 该 K 线周期是否小于一天，也就是坐标轴是否必须打印时分才读得懂。`@klinecharts/pro`
 * 由 `Period` 推出这一点；这里的标签本身就带单位。
 *
 * Case carries meaning here: lowercase `m` is a minute, uppercase `M` a month —
 * the same spelling `@klinecharts/pro` periods and OKX bar codes use. Folding
 * the case would read `1M` as one minute and print a clock on a monthly chart.
 *
 * 这里的大小写是有含义的：小写 `m` 是分钟，大写 `M` 是月 —— 与 `@klinecharts/pro`
 * 的周期和 OKX 的周期代码同一种拼法。折叠大小写会把 `1M` 读成一分钟，于是月线图上
 * 会去打印时分。
 */
export function isIntradayBarSize(barSize: string): boolean {
	const match = /^(\d*\.?\d*)([A-Za-z])$/.exec(barSize.trim());
	if (!match) return true;
	const amount = Number(match[1]) || 1;
	// Minutes are the one place case is load-bearing, so they are matched before
	// the unit is folded; every other letter is spelled in either case.
	// 分钟是唯一大小写有含义的单位，因此先于折叠判断；其余字母两种大小写都收。
	if (match[2] === "m") return amount < 1440;
	const unit = match[2].toLowerCase();
	if (unit === "s") return true;
	if (unit === "h") return amount < 24;
	// A day, a week and a month are all calendar-sized.
	// 日、周、月都按日历计。
	if (unit === "d" || unit === "w") return amount < 1;
	return false;
}

/** The {@link TChartType} a Pro chart plots: always a candlestick unless the caller chose otherwise. Pro 图表绘制的系列类型：除非调用方另有选择，始终是蜡烛图。 */
export const TCHARTPRO_DEFAULT_CHART_TYPE: TChartType = "candlestick";

