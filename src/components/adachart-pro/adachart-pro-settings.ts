import type {
	CandleType,
	DeepPartial,
	FormatDate,
	FormatDateType,
	IndicatorFigure,
	PeriodType,
	Styles,
} from "klinecharts";

/**
 * The pure half of the three settings dialogs: what they edit, what a change
 * means as a `klinecharts` patch, and the two derived tables (timezone labels,
 * date formats per bar size).
 *
 * It is kept apart from the dialogs themselves so the decisions can be asserted
 * in node: a dialog is a form, but the value it writes is a fact about v10.
 *
 * 三个设置对话框的纯函数部分：它们编辑什么、一次改动对应 `klinecharts` 的什么补丁，
 * 以及两张推导表（时区标签、各周期的日期格式）。
 *
 * 它与对话框本身分开，使这些判断能在 node 里断言：对话框是表单，而它写入的取值是关于
 * v10 的事实。
 */

// ------------------------------------------------------------------ settings

/**
 * The settings dialog's whole model.
 *
 * Six of Pro's eight rows map 1:1 onto `klinecharts` v10 style paths. The other
 * two do not, and are handled differently on purpose:
 *
 * - Pro's *price axis type* (`normal` / `percentage` / `log`) has no v10
 *   counterpart. v10's `Styles.yAxis` is an {@link AxisStyle} — `show`, `size`,
 *   `axisLine`, `tickLine`, `tickText` — with no axis-kind field anywhere, and
 *   `YAxisOverride` adds no kind either. Rather than write a row that cannot
 *   take effect, the row is dropped; a percentage or logarithmic price axis
 *   would have to be built in the caller's own `createRange` / `createTicks`.
 * - Pro's *reverse coordinate* is a v10 axis override (`overrideYAxis`), not a
 *   style, so it is applied through the chart instance rather than through this
 *   patch — see {@link AdaChartProSettingsDialog}.
 *
 * 设置对话框的整个模型。
 *
 * Pro 的八行里六行与 `klinecharts` v10 的样式路径一一对应。另外两行不对应，且刻意区别处理：
 *
 * - Pro 的*价格轴类型*（`normal` / `percentage` / `log`）在 v10 里没有对应物。v10 的
 *   `Styles.yAxis` 是 {@link AxisStyle} —— `show`、`size`、`axisLine`、`tickLine`、`tickText`
 *   —— 任何地方都没有轴种类字段，`YAxisOverride` 也没有。与其写一行不可能生效的设置，
 *   不如去掉这一行；百分比轴或对数轴需要调用方在自己的 `createRange` / `createTicks` 里实现。
 * - Pro 的*反转坐标*在 v10 里是坐标轴覆盖（`overrideYAxis`）而非样式，因此经图表实例下发，
 *   不走本补丁 —— 见 {@link AdaChartProSettingsDialog}。
 */
export interface AdaChartProSettings {
	candleType: CandleType;
	showLastPrice: boolean;
	showHighPrice: boolean;
	showLowPrice: boolean;
	showIndicatorLastValue: boolean;
	showGrid: boolean;
}

/**
 * The values the dialog opens with when it cannot read the chart — i.e. before
 * the instance exists. They mirror `klinecharts`' own defaults so the seed and
 * the engine agree: solid candles, both high/low and the last-price mark on,
 * indicator last-value marks off, grid on.
 *
 * 对话框读不到图表时（实例尚未建立）采用的初值。它们与 `klinecharts` 自身的默认值一致，
 * 使初值与引擎不矛盾：实心蜡烛、高低价与最新价标记开启、指标最新值标记关闭、网格开启。
 */
export const ADACHARTPRO_DEFAULT_SETTINGS: AdaChartProSettings = {
	candleType: "candle_solid",
	showLastPrice: true,
	showHighPrice: true,
	showLowPrice: true,
	showIndicatorLastValue: false,
	showGrid: true,
};

/**
 * The candle kinds the dialog offers, in the order Pro lists them.
 *
 * The list is spelled out here rather than imported from `AdaChart`'s own
 * `ADACHART_CANDLE_TYPES`: that module registers `klinecharts` overlays at import
 * time and therefore only loads in a browser, which would make this module —
 * documented as the part that is assertable in node — no longer assertable there.
 * The vocabulary is v10's, and this is the same six words in the same order.
 *
 * 对话框提供的蜡烛样式，按 Pro 的排列顺序。
 *
 * 这张清单直接写在这里而不是从 `AdaChart` 自己的 `ADACHART_CANDLE_TYPES` 导入：那个模块在
 * 导入时就注册 `klinecharts` 的 overlay，因此只能在浏览器里加载，会让本模块 —— 文档里写明
 * 是「能在 node 里断言」的那一半 —— 变得不能再在 node 里断言。词汇是 v10 的，这里是与它相同
 * 的六个词、相同的顺序。
 */
export const ADACHARTPRO_SETTING_CANDLE_TYPES: readonly CandleType[] = [
	"candle_solid",
	"candle_stroke",
	"candle_up_stroke",
	"candle_down_stroke",
	"ohlc",
	"area",
];

/**
 * Reads the six settings back out of a live `Styles` tree, which is what
 * `chart.getStyles()` returns. The dialog is seeded from this rather than from
 * props, so it shows what is actually on screen — including whatever a caller
 * passed through `styles`.
 *
 * 从活的 `Styles` 树（即 `chart.getStyles()` 的返回值）读回这六项设置。对话框由此播种而非由
 * props 播种，因此显示的是屏幕上真实的取值 —— 包括调用方经 `styles` 传入的一切。
 */
export function settingsFromStyles(styles: Styles): AdaChartProSettings {
	return {
		candleType: styles.candle.type,
		showLastPrice: styles.candle.priceMark.last.show,
		showHighPrice: styles.candle.priceMark.high.show,
		showLowPrice: styles.candle.priceMark.low.show,
		showIndicatorLastValue: styles.indicator.lastValueMark.show,
		showGrid: styles.grid.show,
	};
}

/**
 * The whole settings object as a `Styles` patch, applied as one unit.
 *
 * Applying all six on the first change rather than only the changed row is what
 * keeps the dialog from lying: it was seeded from the live styles, so writing
 * those same values back is a no-op for the rows nobody touched, while the
 * touched row lands. It also means a caller's `styles` prop still wins until the dialog
 * is actually used — which is why this patch is not applied on mount.
 *
 * 整个设置对象作为一个 `Styles` 补丁、整体下发。
 *
 * 第一次改动时一次下发全部六项而不是只下发被改的那行，是让对话框不说谎的关键：它的初值取自
 * 活的样式，因此把同样的取值写回去对没人碰过的行是空操作，而被动过的那行会落地。这也意味着
 * 调用方的 `styles` 属性在对话框真正被使用之前仍然生效 —— 正因如此这个补丁不在挂载时就应用。
 */
export function settingsStyles(
	settings: AdaChartProSettings,
): DeepPartial<Styles> {
	return {
		candle: {
			type: settings.candleType,
			priceMark: {
				last: { show: settings.showLastPrice },
				high: { show: settings.showHighPrice },
				low: { show: settings.showLowPrice },
			},
		},
		indicator: { lastValueMark: { show: settings.showIndicatorLastValue } },
		grid: { show: settings.showGrid },
	};
}

// ---------------------------------------------------------------------- icons

/** The three legend icons the indicator tooltip carries. 指标浮层携带的三个图例图标。 */
export const ADACHARTPRO_INDICATOR_FEATURE_IDS = [
	"visible",
	"setting",
	"close",
] as const;

export type AdaChartProIndicatorFeatureId =
	(typeof ADACHARTPRO_INDICATOR_FEATURE_IDS)[number];

/**
 * Pro draws four icons (`visible` *and* `invisible`, plus setting and close) and
 * relies on its v9 engine to show exactly one of the first pair for the
 * indicator's current state. v10 draws every feature it is given, so declaring
 * both would put two opposite glyphs side by side. One toggle, whose meaning is
 * read from the indicator itself, replaces the pair.
 *
 * Glyphs are `icon_font` features drawn with a system font rather than Pro's
 * bundled `icomoon` face, which this project does not ship.
 *
 * Pro 画四个图标（`visible` **与** `invisible`，外加设置与关闭），并依赖它的 v9 引擎按指标的
 * 当前状态在前两个里只显示一个。v10 会把它拿到的每个 feature 都画出来，两个都声明就会并排出现
 * 两个相反的字形。用一个开关取代那一对，其含义从指标自身读出。
 *
 * 字形是以系统字体绘制的 `icon_font` feature，而不是 Pro 自带、本项目并未随附的 `icomoon` 字体。
 */
export function indicatorTooltipStyles(
	theme: "light" | "dark",
): DeepPartial<Styles> {
	const color = theme === "dark" ? "#929AA5" : "#76808F";
	const common = {
		position: "middle" as const,
		type: "icon_font" as const,
		size: 14,
		color,
		activeColor: color,
		backgroundColor: "transparent",
		activeBackgroundColor: "rgba(22, 119, 255, 0.15)",
		marginTop: 7,
		marginBottom: 0,
		paddingLeft: 0,
		paddingTop: 0,
		paddingRight: 0,
		paddingBottom: 0,
		content: { family: "Helvetica Neue, Arial, sans-serif" },
	};
	return {
		indicator: {
			tooltip: {
				features: [
					{ ...common, id: "visible", marginLeft: 8, content: { ...common.content, code: "◉" } },
					{ ...common, id: "setting", marginLeft: 6, content: { ...common.content, code: "⚙" } },
					{ ...common, id: "close", marginLeft: 6, content: { ...common.content, code: "✕" } },
				],
			},
		},
	};
}

// -------------------------------------------------------------------- timezone

/**
 * The timezones the dialog offers. A curated list rather than every IANA zone:
 * the select is a convenience, and `setTimezone` on the Wrapper accepts any zone
 * a caller wants.
 *
 * 对话框提供的时区。这是精选列表而非全部 IANA 时区：下拉只是便利，封装层的 `setTimezone`
 * 接受调用方想要的任何时区。
 */
export const ADACHARTPRO_TIMEZONES: readonly string[] = [
	"UTC",
	"Pacific/Honolulu",
	"America/Los_Angeles",
	"America/Denver",
	"America/Chicago",
	"America/New_York",
	"America/Sao_Paulo",
	"Europe/London",
	"Europe/Paris",
	"Europe/Berlin",
	"Europe/Moscow",
	"Asia/Dubai",
	"Asia/Kolkata",
	"Asia/Shanghai",
	"Asia/Hong_Kong",
	"Asia/Singapore",
	"Asia/Tokyo",
	"Asia/Seoul",
	"Australia/Sydney",
	"Pacific/Auckland",
];

/**
 * A zone's label: the zone name plus its current offset, e.g.
 * `Asia/Shanghai (UTC+08:00)`. The offset is read from `Intl` rather than
 * tabulated, so it follows daylight saving on its own; a zone `Intl` cannot
 * resolve keeps its bare name instead of throwing.
 *
 * 时区标签：时区名加当前偏移，例如 `Asia/Shanghai (UTC+08:00)`。偏移由 `Intl` 读取而非
 * 手工列表，因此会自行跟随夏令时；`Intl` 无法解析的时区保留裸名而不是抛错。
 */
export function timezoneLabel(timezone: string, locale: string): string {
	try {
		const parts = new Intl.DateTimeFormat(locale, {
			timeZone: timezone,
			timeZoneName: "shortOffset",
		}).formatToParts(new Date());
		const offset = parts.find((part) => part.type === "timeZoneName")?.value;
		return offset ? `${timezone} (${offset})` : timezone;
	} catch {
		return timezone;
	}
}

// ------------------------------------------------------------------ date format

const TIME: Intl.DateTimeFormatOptions = {
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
};
const DATE: Intl.DateTimeFormatOptions = {
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
};
const SHORT_DATE: Intl.DateTimeFormatOptions = { month: "2-digit", day: "2-digit" };
const YEAR_MONTH: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit" };
const YEAR_ONLY: Intl.DateTimeFormatOptions = { year: "numeric" };

/**
 * The date a bar size deserves, per surface.
 *
 * A one-minute chart has no room for a year in 60 ticks and neither does the
 * reader need it; a yearly chart says nothing useful in `HH:mm`. Pro made the
 * same call with a template table of its own — these are the same shapes, written
 * as `Intl` options so the runtime locale and timezone do the rest.
 *
 * 某种周期的 K 线在某个位置上该显示什么日期。
 *
 * 一分钟图在 60 个刻度里放不下年份，读图的人也不需要；年线图写 `HH:mm` 则毫无用处。
 * Pro 用自己的一张模板表做了同样的判断 —— 这里是同样的形状，写成 `Intl` 选项，
 * 余下交给运行时的语言与时区。
 */
export function dateFormatOptions(
	periodType: PeriodType,
	type: FormatDateType,
): Intl.DateTimeFormatOptions {
	switch (periodType) {
		case "second":
			return type === "xAxis" ? { ...TIME, second: "2-digit" } : { ...DATE, ...TIME };
		case "minute":
			return type === "xAxis" ? TIME : { ...DATE, ...TIME };
		case "hour":
			return { ...SHORT_DATE, ...TIME };
		case "month":
			return YEAR_MONTH;
		case "year":
			return YEAR_ONLY;
		default:
			// day / week — and any type v10 adds later, which reads best as a date.
			// day / week —— 以及 v10 将来新增的任何类型，按日期显示最合理。
			return DATE;
	}
}

/**
 * A v10 {@link FormatDate} for one bar size.
 *
 * The engine hands its own `dateTimeFormat` and `template` to every call; both
 * are ignored on purpose, because the whole point of this formatter is to pick a
 * shape from the period rather than to accept the one template `klinecharts`
 * would use for every bar size. The timezone and locale are the Wrapper's, so
 * the axis still agrees with the tooltip.
 *
 * Callers must memoize the result per (period type, locale, timezone): it owns
 * an `Intl` cache, and a fresh one per render would rebuild three formatters.
 *
 * 某一周期的 v10 {@link FormatDate}。
 *
 * 引擎每次调用都会交来它自己的 `dateTimeFormat` 与 `template`；两者都被有意忽略，因为本
 * 格式化器的全部意义就是从周期决定形状，而不是接受 `klinecharts` 对每种周期都使用的那个模板。
 * 时区与语言来自封装层，因此坐标轴与浮层仍然一致。
 *
 * 调用方必须按（周期类型、语言、时区）记忆化结果：它持有一份 `Intl` 缓存，每次渲染新建一份
 * 会重建三个格式化器。
 */
export function dateFormatterFor(
	periodType: PeriodType,
	locale: string,
	timezone: string,
): FormatDate {
	const formats = new Map<FormatDateType, Intl.DateTimeFormat>();
	return ({ timestamp, type }) => {
		let format = formats.get(type);
		if (!format) {
			format = new Intl.DateTimeFormat(locale, {
				timeZone: timezone,
				...dateFormatOptions(periodType, type),
			});
			formats.set(type, format);
		}
		return format.format(timestamp);
	};
}

// ------------------------------------------------------------------ indicator

/**
 * `klinecharts`' own default indicator line colours, in its own order. Used to
 * pre-fill the parameter dialog's colour inputs: an indicator that has never
 * been overridden carries no `styles.lines` at all, so there is nothing on the
 * instance to read, and an empty colour box would look like "no colour".
 *
 * `klinecharts` 自带的指标线默认配色，按其自身顺序。用于预填参数对话框的颜色输入：从未被
 * 覆盖过的指标根本不带 `styles.lines`，实例上没有东西可读，而一个空的颜色框会被误解成
 * 「没有颜色」。
 */
export const ADACHARTPRO_DEFAULT_LINE_COLORS: readonly string[] = [
	"#FF9600",
	"#935EBD",
	"#1677FF",
	"#E11D74",
	"#01C5C4",
];

/**
 * The colour a line shows when neither the instance nor the palette has one —
 * e.g. an indicator with more lines than the palette has entries.
 *
 * 当实例与调色板都没有颜色时该线显示的颜色 —— 例如线条数超过调色板长度的指标。
 */
export const ADACHARTPRO_FALLBACK_LINE_COLOR = "#1677FF";

/**
 * The indicator's calculation parameters as numbers.
 *
 * v10 types them as `unknown[]` because the indicator registry is generic; the
 * dialog can only edit numbers, and the built-in indicators all use numbers, so
 * anything else is coerced here rather than reaching an `<input type="number">`.
 *
 * 指标的算参，转为数字。
 *
 * v10 把它们标成 `unknown[]`，因为指标注册表是泛型的；对话框只能编辑数字，而内置指标用的都是
 * 数字，因此这里统一转换，而不是让非数字值到达 `<input type="number">`。
 */
export function numericCalcParams(calcParams: readonly unknown[]): number[] {
	return calcParams.map((value) =>
		typeof value === "number" && Number.isFinite(value) ? value : Number(value),
	);
}

/**
 * How many line figures an indicator has, which is how many colour inputs it
 * deserves — `styles.lines` is indexed in lockstep with the line figures.
 *
 * 指标有多少条线图形，就该有多少个颜色输入 —— `styles.lines` 与线图形按下标一一对应。
 */
export function lineFigureCount(figures: readonly IndicatorFigure[]): number {
	return figures.filter((figure) => figure.type === "line").length;
}

/**
 * The colour input's value for line `index`.
 *
 * A slot can be absent rather than merely unset: the instance holds `styles.lines`
 * as a partial array, so a line that has never been recoloured has no entry at
 * all, and one that has been recoloured sits at its own index. Both cases fall
 * back to the palette in order, so the input shows the colour actually in use.
 *
 * 第 `index` 条线的颜色输入取值。
 *
 * 槽位可以是不存在而不只是未设置：实例把 `styles.lines` 持为部分数组，因此从未改过色的线根本
 * 没有条目，而改过色的那条位于自己的下标上。两种情况都按序回退到调色板，因此输入框显示的是
 * 实际在用的颜色。
 */
export function lineColorAt(
	current: readonly (string | undefined)[] | undefined,
	index: number,
): string {
	return (
		current?.[index] ??
		ADACHARTPRO_DEFAULT_LINE_COLORS[index] ??
		ADACHARTPRO_FALLBACK_LINE_COLOR
	);
}