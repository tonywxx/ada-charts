/**
 * The coordinated colour and typography treatment shared by every Wrapper —
 * per `CONTEXT.md`, a **Theme** is the treatment applied *across* a chart's
 * parts, while a *style* is one part's own settings.
 *
 * Only concepts that actually appear in more than one place are here. A token
 * for something a single engine happens to spell once would be a name without a
 * meaning, and the engine's own vocabulary stays visible either way
 * (ADR-0001): these values fan *out* into each engine's settings, they do not
 * replace them.
 *
 * 供所有 Wrapper 共用的协同配色与排版处理 —— 按 `CONTEXT.md`，**Theme** 是「跨图表
 * 各部分」的处理，而 style 是单个部分自己的设置。
 *
 * 这里只收真正出现在多处的心智概念。给某引擎只写了一次的东西设 token 只是起个没有
 * 含义的名字；而且无论如何引擎自己的词汇仍然可见（ADR-0001）：这些值是「扇出」到各
 * 引擎的设置里，不是把它们替掉。
 */
export interface ChartTheme {
	/** Candle, wick, volume bar and indicator mark for a rising period. 上涨一期的蜡烛、影线、成交量柱与指标标记。 */
	trendUp: string;
	/** As {@link ChartTheme.trendUp}, for a falling period. 同上，下跌一期。 */
	trendDown: string;
	/** A period that closed where it opened. 收盘等于开盘的一期。 */
	noChange: string;
	/** Grid lines behind every pane. 所有面板背后的网格线。 */
	gridLine: string;
	/** Axis and pane separator rules. 坐标轴与面板分隔线。 */
	axisBorder: string;
	/** Tick labels and legends. 刻度文字与图例。 */
	axisText: string;
	/** The follow-the-pointer rules and their labels. 跟随指针的十字线及其标签。 */
	crosshair: string;
	/** Default colour of a drawn line, marker or overlay that means nothing directional. 无语义方向的下划线、标记与画线默认色。 */
	accent: string;
	/** Text drawn on top of a coloured chip, where the surface colour is not ours to pick. 画在彩色底块上的文字：底色不是我们挑的，所以单独一个概念。 */
	labelText: string;
	/** The cycling palette an engine assigns to the first, second, … indicator line. 引擎依序分配给第 1、2… 条指标线的循环调色板。 */
	indicatorLines: readonly string[];
	fontFamily: string;
	fontSize: number;
}

export const LIGHT_THEME: ChartTheme = {
	trendUp: "#26a69a",
	trendDown: "#ef5350",
	noChange: "#aaaaaa",
	gridLine: "rgba(197, 203, 206, 0.5)",
	axisBorder: "#d1d4dc",
	axisText: "#677489",
	crosshair: "#758696",
	accent: "#1677ff",
	labelText: "#ffffff",
	indicatorLines: ["#888888", "#fec108", "#f52887", "#485fb1", "#664499"],
	fontFamily: "Arial, sans-serif",
	fontSize: 12,
};

/**
 * Trend colours do not flip with the surface they sit on — a rising candle is
 * green on either background — so they are shared with {@link LIGHT_THEME}
 * rather than re-decided here. Only the treatment of the chrome differs.
 *
 * 涨跌色不随底色翻转 —— 上涨的蜡烛在哪种背景上都是绿 —— 因此直接沿用
 * {@link LIGHT_THEME}，不在这里重新决定。不同的只是外围装饰部分。
 */
export const DARK_THEME: ChartTheme = {
	...LIGHT_THEME,
	gridLine: "#2b2b43",
	axisBorder: "#4c525e",
	axisText: "#b2b5be",
	crosshair: "#b2b5be",
};

/**
 * The same colour at a given opacity.
 *
 * Replaces string concatenation of a hex alpha suffix, which silently produced
 * invalid CSS for any colour that was not 6-digit hex — and both engines accept
 * far more than that: lightweight-charts resolves a string through the computed
 * style of a real element, and `klinecharts` assigns it straight to
 * `ctx.fillStyle`.
 *
 * 同一颜色在不透明度下的版本。
 *
 * 用来取代「往 hex 后面拼两位 alpha」的写法 —— 那种写法对任何不是 6 位 hex 的颜色都
 * 会静默产生非法 CSS，而两个引擎实际接受的范围大得多：lightweight-charts 会把字符串
 * 写进真实元素的 computed style 来解析，`klinecharts` 则直接赋给 `ctx.fillStyle`。
 */
export function withAlpha(color: string, alpha: number): string {
	const opacity = Math.max(0, Math.min(1, alpha));
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
	if (hex) {
		const six = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join("") : hex[1];
		const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(six.slice(i, i + 2), 16));
		return `rgba(${r}, ${g}, ${b}, ${opacity})`;
	}
	// Anything else (rgb(), hsl(), a named colour, a gradient) is left to
	// `color-mix`, which the canvas and the computed-style parser both resolve.
	// 其余形式（rgb()、hsl()、颜色名、渐变）交给 `color-mix`：canvas 与 computed style
	// 解析器都能算出来。
	return `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
}
