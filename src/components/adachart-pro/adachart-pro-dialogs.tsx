import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import { messageFor } from "./adachart-pro-messages";
import {
	ADACHARTPRO_SETTING_CANDLE_TYPES,
	ADACHARTPRO_TIMEZONES,
	type AdaChartProSettings,
	timezoneLabel,
} from "./adachart-pro-settings";

/**
 * The three settings dialogs: appearance, timezone and indicator parameters.
 *
 * They are drawn here rather than in the toolbar because they are forms, not
 * strip controls — the toolbar's job is to name the things it can open, and
 * every one of these needs a draft state of its own while it is open.
 *
 * All three are modal: they reuse the screenshot dialog's backdrop / dialog pair
 * (`position: fixed` siblings, the backdrop a real `<button>`), so a click
 * outside, a click on `×` and `Escape` all close them, and a keyboard user can
 * reach every one of those without a mouse.
 *
 * 三个设置对话框：外观、时区与指标参数。
 *
 * 它们画在这里而不是工具栏里，因为它们是表单而不是条上的控件 —— 工具栏的职责是命名它能打开
 * 的东西，而这三个在打开期间都需要各自的草稿状态。
 *
 * 三者都是模态：复用截屏对话框的「遮罩 / 对话框」一对（`position: fixed` 的兄弟元素，
 * 遮罩是真 `<button>`），因此点外部、点 `×`、按 `Escape` 都能关闭，键盘用户无需鼠标即可
 * 触达其中每一个。
 */

interface ModalProps {
	locale: string;
	title: string;
	/** Dialog width in px, as Pro states it. 对话框宽度（像素），与 Pro 所述一致。 */
	width: number;
	/** The confirm button's label; Pro's dialogs each have exactly one action. 确定按钮文案；Pro 的对话框各只有一个动作。 */
	confirmLabel: string;
	onConfirm: () => void;
	onClose: () => void;
	children: ReactNode;
}

/**
 * A Pro-style modal: title row with a `×`, a body, and one confirm button.
 *
 * `Escape` is handled here rather than by each dialog, so no dialog can be the
 * one that forgot — a modal that cannot be dismissed from the keyboard is not a
 * modal, it is a trap.
 *
 * Pro 风格的模态：带 `×` 的标题行、主体、一个确定按钮。
 *
 * `Escape` 在这里处理而不是由各对话框自己处理，这样就不会有哪个对话框成为被遗忘的那个 ——
 * 无法从键盘关闭的模态不是模态，是陷阱。
 */
function Modal(props: ModalProps) {
	const { onClose } = props;

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	return (
		// The backdrop and the dialog are siblings, both `position: fixed`: the
		// backdrop can therefore be a real button — clickable, focusable and
		// keyboard-operable — without the dialog's own clicks bubbling into it.
		//
		// 遮罩与对话框是兄弟、都是 `position: fixed`：因此遮罩可以是真正的按钮 —— 可点击、
		// 可聚焦、可键盘操作 —— 而对话框自身的点击不会冒泡进去。
		<>
			<button
				type="button"
				aria-label={messageFor(props.locale, "close")}
				className="adachart-pro__modal-backdrop"
				onClick={props.onClose}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={props.title}
				className="adachart-pro__modal"
				style={{ width: props.width }}
			>
				<div className="adachart-pro__modal-header">
					<span className="adachart-pro__modal-title">{props.title}</span>
					<button
						type="button"
						className="adachart-pro__modal-close"
						aria-label={messageFor(props.locale, "close")}
						onClick={props.onClose}
					>
						×
					</button>
				</div>
				{props.children}
				<div className="adachart-pro__modal-footer">
					<button
						type="button"
						className="adachart-pro__button adachart-pro__button--active"
						onClick={props.onConfirm}
					>
						{props.confirmLabel}
					</button>
				</div>
			</div>
		</>
	);
}

/**
 * One settings row: a label and its control.
 *
 * The association is explicit (`htmlFor` / `id`) rather than by nesting the
 * control, because the control arrives as `children` and a label cannot be
 * proven to wrap it from here.
 *
 * 一行设置：标签与控件。
 *
 * 关联写成显式的 `htmlFor` / `id`，而不是把控件嵌进标签里 —— 控件是作为 `children` 到达的，
 * 从这一点无法证明标签把它包住了。
 */
function Field(props: { id: string; label: string; children: ReactNode }) {
	return (
		<div className="adachart-pro__field">
			<label className="adachart-pro__field-label" htmlFor={props.id}>
				{props.label}
			</label>
			{props.children}
		</div>
	);
}

export interface AdaChartProSettingsDialogProps {
	locale: string;
	/** Seeded from the live chart styles when the dialog opens. 打开对话框时由活的图表样式播种。 */
	settings: AdaChartProSettings;
	/** Reverse-axis state, which is an axis override rather than a style. 反转坐标状态，它是坐标轴覆盖而非样式。 */
	reverseAxis: boolean;
	/** Fires on every change: Pro applies settings live, and so does this. 每次改动都触发：Pro 的设置实时生效，这里也是。 */
	onChange: (settings: AdaChartProSettings) => void;
	onReverseAxisChange: (reverse: boolean) => void;
	onClose: () => void;
}

/**
 * The appearance dialog: candle kind, the four marks, the axis direction and the
 * grid.
 *
 * Every change is pushed upward immediately — the dialog has no draft of its
 * own, because the point of this one is to see the chart change while you look
 * at it. The confirm button therefore only closes.
 *
 * 外观对话框：蜡烛样式、四个标记、坐标轴方向与网格。
 *
 * 每次改动都立刻向上推送 —— 这个对话框没有自己的草稿，因为它的意义正是让你盯着图表看它变。
 * 因此确定按钮只是关闭。
 */
export function AdaChartProSettingsDialog(props: AdaChartProSettingsDialogProps) {
	const { locale, settings } = props;
	const baseId = useId();
	const t = (key: string) => messageFor(locale, key);
	const change = (patch: Partial<AdaChartProSettings>) =>
		props.onChange({ ...settings, ...patch });
	const id = (name: string) => `${baseId}-${name}`;

	const switches: Array<{
		name: string;
		label: string;
		checked: boolean;
		onChange: (checked: boolean) => void;
	}> = [
		{
			name: "last-price",
			label: t("lastPriceShow"),
			checked: settings.showLastPrice,
			onChange: (checked) => change({ showLastPrice: checked }),
		},
		{
			name: "high-price",
			label: t("highPriceShow"),
			checked: settings.showHighPrice,
			onChange: (checked) => change({ showHighPrice: checked }),
		},
		{
			name: "low-price",
			label: t("lowPriceShow"),
			checked: settings.showLowPrice,
			onChange: (checked) => change({ showLowPrice: checked }),
		},
		{
			name: "indicator-last-value",
			label: t("indicatorLastValueShow"),
			checked: settings.showIndicatorLastValue,
			onChange: (checked) => change({ showIndicatorLastValue: checked }),
		},
		{
			name: "reverse",
			label: t("reverseCoordinate"),
			checked: props.reverseAxis,
			onChange: props.onReverseAxisChange,
		},
		{
			name: "grid",
			label: t("gridShow"),
			checked: settings.showGrid,
			onChange: (checked) => change({ showGrid: checked }),
		},
	];

	return (
		<Modal
			locale={locale}
			title={t("settings")}
			width={320}
			confirmLabel={t("confirm")}
			onConfirm={props.onClose}
			onClose={props.onClose}
		>
			<div className="adachart-pro__fields">
				<Field id={id("candle-type")} label={t("candleType")}>
					<select
						id={id("candle-type")}
						className="adachart-pro__select"
						value={settings.candleType}
						onChange={(event) =>
							change({ candleType: event.target.value as AdaChartProSettings["candleType"] })
						}
					>
						{ADACHARTPRO_SETTING_CANDLE_TYPES.map((type) => (
							<option key={type} value={type}>
								{t(type)}
							</option>
						))}
					</select>
				</Field>

				{switches.map((item) => (
					<Field key={item.name} id={id(item.name)} label={item.label}>
						<input
							id={id(item.name)}
							type="checkbox"
							checked={item.checked}
							onChange={(event) => item.onChange(event.target.checked)}
						/>
					</Field>
				))}
			</div>
		</Modal>
	);
}

export interface AdaChartProTimezoneDialogProps {
	locale: string;
	timezone: string;
	onConfirm: (timezone: string) => void;
	onClose: () => void;
}

/**
 * The timezone dialog: one select and a confirm button.
 *
 * Unlike the appearance dialog this one *does* draft — Pro commits a timezone on
 * confirm, not on every keystroke, because moving the axis is a bigger change
 * than it looks and should be a deliberate one.
 *
 * 时区对话框：一个下拉加一个确定按钮。
 *
 * 与外观对话框不同，这个**有**草稿 —— Pro 在确定时才提交时区，而不是每次选择都提交，因为
 * 挪动坐标轴比看上去的影响大，应当是一次有意的动作。
 */
export function AdaChartProTimezoneDialog(props: AdaChartProTimezoneDialogProps) {
	const { locale, timezone } = props;
	const [draft, setDraft] = useState(timezone);
	// A zone the list does not carry — a caller's own `timezone` prop — is offered
	// as-is rather than silently replaced by the first entry on open.
	// 列表之外的时区（调用方自己传的 `timezone`）原样提供，而不是打开时被第一项悄悄替换。
	const zones = ADACHARTPRO_TIMEZONES.includes(timezone)
		? ADACHARTPRO_TIMEZONES
		: [timezone, ...ADACHARTPRO_TIMEZONES];

	return (
		<Modal
			locale={locale}
			title={messageFor(locale, "timezone")}
			width={320}
			confirmLabel={messageFor(locale, "confirm")}
			onConfirm={() => props.onConfirm(draft)}
			onClose={props.onClose}
		>
			<div className="adachart-pro__fields">
				<select
					className="adachart-pro__select"
					aria-label={messageFor(locale, "timezone")}
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
				>
					{zones.map((zone) => (
						<option key={zone} value={zone}>
							{timezoneLabel(zone, locale)}
						</option>
					))}
				</select>
			</div>
		</Modal>
	);
}

export interface AdaChartProIndicatorParamsDialogProps {
	locale: string;
	/** The indicator's name, which is also the dialog's title. 指标名，同时是对话框标题。 */
	name: string;
	/** The instance's current parameters, also the fallback for a blank input. 实例当前的参数，同时是空输入的兜底值。 */
	calcParams: number[];
	/** One entry per line figure; the instance's override or the default palette. 每个线图形一项；实例的覆盖值或默认调色板。 */
	lineColors: string[];
	onConfirm: (calcParams: number[], lineColors: string[]) => void;
	onClose: () => void;
}

/**
 * The indicator parameter dialog: one number per `calcParams` entry, one colour
 * per line figure, and a confirm button.
 *
 * A blank number input keeps the parameter it was seeded with rather than
 * becoming `NaN` — dropping a parameter would silently rebuild the indicator
 * with fewer figures than the dialog just showed.
 *
 * 指标参数对话框：每个 `calcParams` 一项数字输入、每条线图形一个颜色输入，以及一个确定按钮。
 *
 * 留空的数字输入保留它被播种时的取值而不是变成 `NaN` —— 丢掉一个参数会让指标以比对话框刚
 * 显示的更少的图形被悄悄重建。
 */
export function AdaChartProIndicatorParamsDialog(
	props: AdaChartProIndicatorParamsDialogProps,
) {
	const { locale, name, calcParams, lineColors } = props;
	const baseId = useId();
	const [params, setParams] = useState(() => calcParams.map(String));
	const [colors, setColors] = useState(() => [...lineColors]);

	/**
	 * Row identities, minted once. Parameters and lines are positional and never
	 * reorder, so keying by position is correct — but a key has to be a value, not
	 * an index expression, and this also keeps the two lists' ids apart.
	 *
	 * 行标识只铸一次。参数与线是位置性的、永不重排，因此按下标作键是正确的 —— 但键必须是一个
	 * 值而不是下标表达式，这同时还把两个列表的 id 分开了。
	 */
	const [ids] = useState(() => ({
		params: calcParams.map((_, index) => `adacp-param-${index}`),
		lines: lineColors.map((_, index) => `adacp-line-${index}`),
	}));

	const confirm = () =>
		props.onConfirm(
			params.map((text, index) => {
				const value = Number(text);
				return Number.isFinite(value) && text.trim() !== ""
					? value
					: calcParams[index];
			}),
			colors,
		);

	return (
		<Modal
			locale={locale}
			title={name || messageFor(locale, "indicatorSettings")}
			width={360}
			confirmLabel={messageFor(locale, "confirm")}
			onConfirm={confirm}
			onClose={props.onClose}
		>
			<div className="adachart-pro__fields">
				{params.map((value, index) => (
					<Field
						// Parameters have no names in v10 — only an order — so the index is
						// the only honest label.
						// 参数在 v10 里没有名字、只有次序，因此下标是唯一诚实的标签。
						key={ids.params[index]}
						id={`${baseId}-${ids.params[index]}`}
						label={`${messageFor(locale, "parameter")} ${index + 1}`}
					>
						<input
							id={`${baseId}-${ids.params[index]}`}
							type="number"
							className="adachart-pro__number"
							value={value}
							onChange={(event) =>
								setParams((current) =>
									current.map((item, i) => (i === index ? event.target.value : item)),
								)
							}
						/>
					</Field>
				))}
				{colors.map((value, index) => (
					<Field
						key={ids.lines[index]}
						id={`${baseId}-${ids.lines[index]}`}
						label={`${messageFor(locale, "lineColor")} ${index + 1}`}
					>
						<input
							id={`${baseId}-${ids.lines[index]}`}
							type="color"
							className="adachart-pro__color"
							value={value}
							onChange={(event) =>
								setColors((current) =>
									current.map((item, i) => (i === index ? event.target.value : item)),
								)
							}
						/>
					</Field>
				))}
			</div>
		</Modal>
	);
}