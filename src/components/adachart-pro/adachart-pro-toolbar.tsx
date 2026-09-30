import type { Period, SymbolInfo } from "klinecharts";
import { useEffect, useMemo, useRef, useState } from "react";
import { MAIN_INDICATORS, SUB_INDICATORS } from "../adachart/adachart-window-config";
import { messageFor } from "./adachart-pro-messages";
import {
	periodLabel,
	symbolOptionFields,
	symbolOptionKey,
	symbolOptionLabel,
	symbolOptionListLabel,
	type AdaChartProSymbolOption,
} from "./adachart-pro-options";
import { timezoneLabel } from "./adachart-pro-settings";

/**
 * The `AdaChartPro` toolbar: the drawing-bar toggle, the drawing manager's
 * toggle, period presets, an indicator picker split into main / sub panes, an
 * optional instrument picker, the theme toggle, the settings / timezone pair,
 * and the screenshot / fullscreen pair. It also renders the screenshot dialog,
 * which is where the captured image is previewed and saved.
 *
 * The picker's two halves list the two groups the window model keeps, rather
 * than one list twice: a study drawn in the instrument's own units goes on the
 * candles' pane, and one that is not priced gets a pane of its own. The cost is
 * that an oscillator like `RSI` is no longer *offered* on the candles — it never
 * could be drawn there meaningfully, since it has no price — and the gain is
 * that each column offers only what it can hold.
 *
 * It holds no chart state — every control reports upward and the Wrapper owns
 * the values — so the same strip drives a chart created from props or from the
 * imperative {@link AdaChartProApi}.
 *
 * Drawing tools are not here: they live on the left-hand drawing bar, which is
 * the one entry point for arming them. This strip only shows and hides that bar.
 *
 * The three settings dialogs are not here either: each of them needs a draft or
 * a value read from the chart instance, both of which the Wrapper holds. This
 * strip merely names the two dialogs it can open.
 *
 * `AdaChartPro` 的工具栏：画线栏开关、画线管理器开关、周期档位、分主/副图的指标选择、可选的标的选择、
 * 主题切换、设置 / 时区这一对，以及截屏 / 全屏这一对。它还渲染截屏对话框 —— 预览与保存截取图片的地方。
 *
 * 选择器的两半列的是窗口模型维护的两个分组，而不是同一份清单列两遍：以标的自身单位绘制的指标属于
 * 蜡烛面板，不是价格的指标自开一个面板。代价是 `RSI` 这类摆动量不再被*提供*在蜡烛上 —— 它本来也
 * 无法有意义地画在那里，因为它没有价格 —— 换来的是每一列只提供它装得下的东西。
 *
 * 它自己不保存图表状态 —— 每个控件都向上汇报、数值由 Wrapper 持有 —— 因此无论图表由
 * props 还是命令式 API 驱动，同一条工具栏都适用。
 *
 * 画线工具不在这里：它们位于左侧的画线栏上，那是选中画线工具的唯一入口。本条只负责显示与隐藏那条栏。
 *
 * 三个设置对话框也不在这里：它们各自需要草稿、或需要从图表实例读一个值，两者都由 Wrapper 持有。
 * 本条只负责命名它能打开的那两个对话框。
 */

/** Which drop panel is open; only one at a time. 当前展开的下拉面板；同时只开一个。 */
type Panel = "symbol" | "indicators" | null;

/** Two periods are the same bar size; identity is not the question. 两个周期是否同一档位；这里问的不是引用相等。 */
function samePeriod(a: Period, b: Period): boolean {
	return a.type === b.type && a.span === b.span;
}

/**
 * Hands the captured image to the browser as a download. The source names the
 * file `screenshot` with no extension, which leaves the jpeg unrecognised by
 * most tools; adding it is the one deliberate difference here.
 *
 * 把截取的图片交给浏览器下载。源把文件命名为不带扩展名的 `screenshot`，多数工具因此认不出
 * 这是 jpeg；加上扩展名是这里唯一一处有意的不同。
 */
function saveImage(url: string): void {
	const link = document.createElement("a");
	link.download = "screenshot.jpg";
	link.href = url;
	document.body.appendChild(link);
	link.click();
	link.remove();
}

export interface AdaChartProToolbarProps {
	theme: "light" | "dark";
	locale: string;
	/** Bar sizes on offer. 提供的周期档位。 */
	periods: readonly Period[];
	period: Period;
	mainIndicators: readonly string[];
	subIndicators: readonly string[];
	/**
	 * Whether this chart can be drawn on at all — the umbrella feature flag. Both
	 * drawing entries leave the strip when it is off: a toggle for a bar that does
	 * not exist, or a panel for drawings nothing can add, would be a question the
	 * reader cannot answer. See {@link AdaChartProProps.drawing}.
	 *
	 * 这张图表是否可画 —— 总功能开关。关闭时两个画线入口都离开本条：一个并不存在的栏的开关、
	 * 或一块「没有任何东西能往里加」的画线面板，都是读者回答不了的问题。见
	 * {@link AdaChartProProps.drawing}。
	 */
	drawing: boolean;
	/** Whether the left-hand drawing bar is showing; drives the toggle's pressed state. 左侧画线栏是否显示；决定开关的按下态。 */
	drawingBarVisible: boolean;
	/**
	 * Whether the drawing manager is available at all, i.e. the feature flag. The
	 * entry is hidden when off rather than shown disabled: the flag is a decision
	 * about what this chart *is*, and a control that can never be pressed is a
	 * question the reader cannot answer.
	 *
	 * 画线管理器是否可用，即那个功能开关。关闭时入口直接隐藏而不是显示为禁用：该开关决定这张图表
	 * *是什么*，一个永远按不动的控件是读者回答不了的问题。
	 */
	drawingManager: boolean;
	/** Whether the drawing manager's panel is open; drives the toggle's pressed state. 画线管理器的面板是否打开；决定开关的按下态。 */
	drawingManagerOpen: boolean;
	/** The active timezone, named on its button. 当前时区，显示在它的按钮上。 */
	timezone: string;
	/** Instruments to pick from; the picker is hidden when absent. 可供选择的标的；缺省时不显示选择器。 */
	symbols?: readonly AdaChartProSymbolOption[];
	symbol?: SymbolInfo;
	/**
	 * Whether the Wrapper's root — this strip included — is the document's
	 * fullscreen element. The Wrapper owns it because only it holds the element.
	 *
	 * 外层根元素（含本工具栏）是否为文档的全屏元素。由 Wrapper 持有，因为只有它拿着那个元素。
	 */
	isFullscreen: boolean;
	/**
	 * A captured chart image as a data URL, or `null` when no dialog is open. The
	 * toolbar renders the dialog but neither captures nor keeps the image.
	 *
	 * 截取的图表图片（data URL）；无对话框时为 `null`。工具栏只负责渲染这个对话框，既不截取
	 * 也不保存图片。
	 */
	screenshot: string | null;
	onThemeChange: () => void;
	onPeriodChange: (period: Period) => void;
	onIndicatorsChange: (main: string[], sub: string[]) => void;
	onSymbolChange?: (symbol: AdaChartProSymbolOption) => void;
	onToggleDrawingBar: () => void;
	onToggleDrawingManager: () => void;
	onSettingsOpen: () => void;
	onTimezoneOpen: () => void;
	onScreenshot: () => void;
	onScreenshotClose: () => void;
	onFullscreenToggle: () => void;
}

/**
 * The strip is DOM, not canvas, so it cannot read the chart's `Styles` tree —
 * the `data-theme` attribute on the Wrapper is the one thing both sides agree
 * on, and `adachart-pro.css` holds the palettes it selects.
 *
 * 工具栏是 DOM 而非 canvas，读不到图表的 `Styles` 树 —— Wrapper 上的 `data-theme` 属性是
 * 两边唯一共识，它选中的配色表存放在 `adachart-pro.css` 里。
 */
export function AdaChartProToolbar(props: AdaChartProToolbarProps) {
	const { locale, symbols, screenshot, onScreenshotClose } = props;
	const [panel, setPanel] = useState<Panel>(null);
	const [query, setQuery] = useState("");
	const rootRef = useRef<HTMLDivElement | null>(null);
	const searchRef = useRef<HTMLInputElement | null>(null);

	const t = (key: string) => messageFor(locale, key);

	// Focus the search box when the picker opens. Done through a ref rather than
	// `autoFocus`, which would steal focus on mount instead of on open.
	// 选择器展开时聚焦搜索框。这里用 ref 而不是 `autoFocus`：后者会在挂载时就抢走焦点，
	// 而不是在展开时。
	useEffect(() => {
		if (panel === "symbol") searchRef.current?.focus();
	}, [panel]);

	// Dismiss any open panel on an outside click, so the strip cannot be left
	// with a dropdown stranded over the chart.
	// 点击外部即收起已展开的面板，避免下拉框滞留在图表之上。
	useEffect(() => {
		if (!panel) return;
		const dismiss = (event: MouseEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setPanel(null);
		};
		document.addEventListener("mousedown", dismiss);
		return () => document.removeEventListener("mousedown", dismiss);
	}, [panel]);

	// Escape closes the screenshot dialog, as it does every other one. The dialog
	// is `aria-modal`, so a keyboard dismissal is part of the contract, not a
	// nicety.
	// Escape 关闭截屏对话框，与其它对话框一致。该对话框是 `aria-modal` 的，因此键盘可关闭是契约
	// 的一部分，不是锦上添花。
	useEffect(() => {
		if (screenshot === null) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onScreenshotClose();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [screenshot, onScreenshotClose]);

	const found = useMemo(() => {
		if (!symbols) return [];
		const q = query.trim().toLowerCase();
		if (!q) return [...symbols];
		return symbols.filter((item) =>
			symbolOptionFields(item).some(
				(value) => typeof value === "string" && value.toLowerCase().includes(q),
			),
		);
	}, [symbols, query]);

	const toggleIndicator = (name: string, main: boolean) => {
		const list = main ? props.mainIndicators : props.subIndicators;
		const next = list.includes(name)
			? list.filter((item) => item !== name)
			: [...list, name];
		props.onIndicatorsChange(
			main ? next : [...props.mainIndicators],
			main ? [...props.subIndicators] : next,
		);
	};

	const open = (target: Exclude<Panel, null>) =>
		setPanel((current) => (current === target ? null : target));

	return (
		<div ref={rootRef} className="adachart-pro__toolbar">
			{/* The drawing-bar toggle leads the strip: the bar it controls hangs off the
			 * left edge, directly below. `aria-pressed` reports the bar's visibility so
			 * the control is a toggle to assistive tech, not a mystery button.
			 *
			 * It goes when the umbrella flag is off: `drawingBarVisible` still says
			 * `true` in that state — nobody hid the bar, the bar is simply not part of
			 * this chart — so a pressed toggle pointing at nothing would be worse than
			 * absent.
			 *
			 * 画线栏开关排在最前：它控制的那条栏就挂在左边缘、正下方。`aria-pressed` 汇报栏的
			 * 可见性，因此对辅助技术而言这是个开关，而不是一个用途不明的按钮。
			 *
			 * 总开关关闭时它会消失：那种状态下 `drawingBarVisible` 仍是 `true` —— 没有人把栏藏起来，
			 * 只是这条栏不属于这张图表 —— 因此一个按亮着却什么都没指向的开关比没有更糟。 */}
			{props.drawing && (
				<button
					type="button"
					className="adachart-pro__button adachart-pro__button--icon"
					title={t("menu")}
					aria-label={t("menu")}
					aria-pressed={props.drawingBarVisible}
					onClick={props.onToggleDrawingBar}
				>
					<svg
						className="adachart-pro__menu-icon"
						viewBox="0 0 22 22"
						width="22"
						height="22"
						aria-hidden="true"
						focusable="false"
					>
						<rect x="2" y="5" width="18" height="2" rx="1" fill="currentColor" />
						<rect x="2" y="10" width="18" height="2" rx="1" fill="currentColor" />
						<rect x="2" y="15" width="18" height="2" rx="1" fill="currentColor" />
					</svg>
				</button>
			)}

			{/* The drawing manager's entry sits next to the drawing bar's, so the two
			 * drawing surfaces are one pair: the bar makes a shape, the panel accounts
			 * for it. It is text rather than a glyph because it names a panel rather
			 * than a tool, like the settings entries at the other end of the strip.
			 *
			 * 画线管理器的入口紧挨画线栏开关，使两个画线界面成为一对：栏负责画，面板负责清点。它是
			 * 文字而不是图标，因为它命名的是一块面板而不是一个工具 —— 与工具栏另一端的设置入口相同。 */}
			{props.drawingManager && (
				<button
					type="button"
					className={
						props.drawingManagerOpen
							? "adachart-pro__button adachart-pro__button--active"
							: "adachart-pro__button"
					}
					aria-pressed={props.drawingManagerOpen}
					onClick={props.onToggleDrawingManager}
				>
					{t("drawings")}
				</button>
			)}

			{props.symbols && props.symbol && (
				<div className="adachart-pro__group">
					<button
						type="button"
						className="adachart-pro__button adachart-pro__button--active"
						title={props.symbol.ticker}
						onClick={() => open("symbol")}
					>
						{typeof props.symbol.logo === "string" && props.symbol.logo ? (
							// `alt=""` on purpose: the adjacent label already names the
							// instrument, so the logo is decoration and should not repeat it.
							//
							// 有意写 `alt=""`：紧邻的文案已经点明标的，logo 是装饰，不该复述。
							<img
								className="adachart-pro__logo"
								src={props.symbol.logo}
								alt=""
							/>
						) : null}
						{symbolOptionLabel(props.symbol)}
					</button>
					{panel === "symbol" && (
						<div className="adachart-pro__panel">
							<input
								ref={searchRef}
								className="adachart-pro__input"
								placeholder={t("search")}
								value={query}
								onChange={(event) => setQuery(event.target.value)}
							/>
							{found.length === 0 && (
								<span className="adachart-pro__item">{t("noResults")}</span>
							)}
							{found.map((item) => (
								<button
									key={symbolOptionKey(item)}
									type="button"
									className="adachart-pro__item"
									onClick={() => {
										props.onSymbolChange?.(item);
										setPanel(null);
									}}
								>
									{symbolOptionListLabel(item)}
								</button>
							))}
						</div>
					)}
				</div>
			)}

			<div className="adachart-pro__group">
				{props.periods.map((option) => (
					<button
						key={periodLabel(option)}
						type="button"
						className={
							samePeriod(option, props.period)
								? "adachart-pro__button adachart-pro__button--active"
								: "adachart-pro__button"
						}
						onClick={() => props.onPeriodChange(option)}
					>
						{periodLabel(option)}
					</button>
				))}
			</div>

			<div className="adachart-pro__group">
				<button
					type="button"
					className="adachart-pro__button"
					onClick={() => open("indicators")}
				>
					{t("indicators")}
				</button>
				{panel === "indicators" && (
					<div className="adachart-pro__panel">
						<div className="adachart-pro__section">{t("main")}</div>
						{MAIN_INDICATORS.map((name) => (
							<label key={name} className="adachart-pro__item">
								<input
									type="checkbox"
									checked={props.mainIndicators.includes(name)}
									onChange={() => toggleIndicator(name, true)}
								/>{" "}
								{name}
							</label>
						))}
						<div className="adachart-pro__section">{t("sub")}</div>
						{SUB_INDICATORS.map((name) => (
							<label key={name} className="adachart-pro__item">
								<input
									type="checkbox"
									checked={props.subIndicators.includes(name)}
									onChange={() => toggleIndicator(name, false)}
								/>{" "}
								{name}
							</label>
						))}
					</div>
				)}
			</div>

			<button
				type="button"
				className="adachart-pro__button adachart-pro__button--end"
				onClick={props.onThemeChange}
			>
				{t("theme")}
			</button>

			{/* The two settings entries sit between the theme toggle and the capture
			 * pair. The timezone button shows the bare zone name (it has to stay short
			 * to fit the strip) and spells the offset out in its `title`, which is what
			 * `Intl` can produce reliably.
			 *
			 * 两个设置入口位于主题切换与截屏这一对之间。时区按钮显示裸的时区名（要短才能放进工具栏），
			 * 并在 `title` 里写明偏移量 —— 后者正是 `Intl` 能可靠给出的。 */}
			<button
				type="button"
				className="adachart-pro__button"
				title={timezoneLabel(props.timezone, locale)}
				onClick={props.onTimezoneOpen}
			>
				{props.timezone}
			</button>

			<button
				type="button"
				className="adachart-pro__button"
				onClick={props.onSettingsOpen}
			>
				{t("settings")}
			</button>

			<button
				type="button"
				className="adachart-pro__button"
				onClick={props.onScreenshot}
			>
				{t("screenshot")}
			</button>

			<button
				type="button"
				className="adachart-pro__button"
				onClick={props.onFullscreenToggle}
			>
				{props.isFullscreen ? t("exitFullScreen") : t("fullScreen")}
			</button>

			{screenshot !== null && (
				// The dialog and its backdrop are siblings, not nested: that is what
				// lets the backdrop be a real `<button>` — dismissed by click, focus and
				// keyboard alike — without the dialog's own clicks bubbling into it.
				// Both are `position: fixed`, so they cover the chart rather than only
				// the strip they are mounted in; the parent is static, so that works.
				//
				// 对话框与其遮罩是兄弟而非嵌套：正因如此遮罩才能是真正的 `<button>` —— 点击、
				// 聚焦、键盘都能关闭 —— 而对话框自身的点击不会冒泡进去。两者都 `position: fixed`，
				// 因此盖住图表而不只是它们挂载的那条工具栏；父元素是 static，所以这行得通。
				<>
					<button
						type="button"
						aria-label={t("close")}
						className="adachart-pro__modal-backdrop"
						onClick={props.onScreenshotClose}
					/>
					<div
						role="dialog"
						aria-modal="true"
						aria-label={t("screenshot")}
						className="adachart-pro__modal"
					>
						<div className="adachart-pro__modal-header">
							<span className="adachart-pro__modal-title">{t("screenshot")}</span>
							<button
								type="button"
								className="adachart-pro__modal-close"
								aria-label={t("close")}
								onClick={props.onScreenshotClose}
							>
								×
							</button>
						</div>
						<img
							className="adachart-pro__modal-image"
							src={screenshot}
							alt={t("screenshot")}
						/>
						<div className="adachart-pro__modal-footer">
							<button
								type="button"
								className="adachart-pro__button adachart-pro__button--active"
								onClick={() => saveImage(screenshot)}
							>
								{t("save")}
							</button>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
