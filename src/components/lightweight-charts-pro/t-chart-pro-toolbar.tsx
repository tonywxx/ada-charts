import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ChartTheme } from "../../theme";
import type { DrawingToolEntry } from "./t-chart-pro-drawing";
import {
	chartThemeOf,
	messageFor,
	TCHARTPRO_INDICATORS,
	type TChartProMagnet,
	type TChartProSymbol,
} from "./t-chart-pro-options";

/**
 * The strip `@klinecharts/pro` renders for its Wrapper, rebuilt for
 * `lightweight-charts`: symbol picker, bar sizes, indicator picker, drawing
 * palette, drawing controls and theme toggle.
 *
 * `@klinecharts/pro` 为它的 Wrapper 渲染的那条工具栏，这里按 `lightweight-charts`
 * 重建一遍：标的选择、K 线周期、指标选择、画线面板、画线控制与主题切换。
 */

/** Which drop panel is open; only one at a time. 当前展开的下拉面板；同时只开一个。 */
type Panel = "symbol" | "indicators" | "drawing" | null;

/** Display names for the categories the tool registry reports. 工具注册表给出的分类的显示名。 */
const CATEGORY_LABELS: Record<string, { en: string; zh: string }> = {
	line: { en: "Lines", zh: "直线" },
	channel: { en: "Channels", zh: "通道" },
	fibonacci: { en: "Fibonacci", zh: "斐波那契" },
	gann: { en: "Gann", zh: "江恩" },
	pitchfork: { en: "Pitchforks", zh: "山形折线" },
	shape: { en: "Shapes", zh: "形状" },
	annotation: { en: "Annotations", zh: "标注" },
	trading: { en: "Trading", zh: "交易" },
	forecasting: { en: "Forecasting", zh: "预测" },
	measurement: { en: "Measurement", zh: "测量" },
};

export interface TChartProToolbarProps {
	theme: "light" | "dark";
	locale: string;
	symbol: TChartProSymbol;
	barSize: string;
	barSizes: readonly string[];
	mainIndicators: readonly string[];
	subIndicators: readonly string[];
	tools: readonly DrawingToolEntry[];
	activeTool: string | null;
	magnet: TChartProMagnet;
	keepToolArmed: boolean;
	lockNewDrawings: boolean;
	drawingBarVisible: boolean;
	drawingCount: number;
	searchSymbols: (search: string) => Promise<TChartProSymbol[]>;
	onSelectSymbol: (symbol: TChartProSymbol) => void;
	onBarSize: (barSize: string) => void;
	onIndicators: (main: string[], sub: string[]) => void;
	onTool: (tool: string | null) => void;
	onMagnet: (magnet: TChartProMagnet) => void;
	onKeepToolArmed: (on: boolean) => void;
	onLockNewDrawings: (on: boolean) => void;
	onUndo: () => void;
	onDeleteSelected: () => void;
	onClearDrawings: () => void;
	onToggleTheme: () => void;
}

/** The DOM surfaces the Theme has no token for, because the canvas never draws them. Theme 没有对应 token 的 DOM 表面 —— canvas 从不绘制它们。 */
interface ToolbarSurface {
	bar: string;
	panel: string;
	border: string;
	input: string;
}

const LIGHT_SURFACE: ToolbarSurface = {
	bar: "#f1f3f7",
	panel: "#ffffff",
	border: "#d1d4dc",
	input: "#ffffff",
};

const DARK_SURFACE: ToolbarSurface = {
	bar: "#1f1f28",
	panel: "#16161c",
	border: "#3a3a46",
	input: "#23232c",
};

/** Palette derived from the Theme, so the toolbar and the canvas agree. 由 Theme 推导的配色，使工具栏与 canvas 一致。 */
function useToolbarStyle(theme: ChartTheme, surface: ToolbarSurface) {
	return useMemo(
		() => ({
			bar: {
				display: "flex",
				alignItems: "center",
				gap: 4,
				flexWrap: "wrap",
				padding: "6px 8px",
				background: surface.bar,
				borderBottom: `1px solid ${surface.border}`,
				fontFamily: theme.fontFamily,
				fontSize: theme.fontSize,
				color: theme.axisText,
			} as CSSProperties,
			group: { display: "flex", alignItems: "center", gap: 2 } as CSSProperties,
			button: {
				appearance: "none",
				border: "1px solid transparent",
				borderRadius: 4,
				background: "transparent",
				color: theme.axisText,
				padding: "3px 8px",
				font: "inherit",
				lineHeight: "18px",
				cursor: "pointer",
			} as CSSProperties,
			active: {
				background: theme.accent,
				color: theme.labelText,
			} as CSSProperties,
			panel: {
				position: "absolute",
				top: "100%",
				left: 0,
				zIndex: 10,
				minWidth: 220,
				maxHeight: 320,
				overflowY: "auto",
				padding: 8,
				background: surface.panel,
				border: `1px solid ${surface.border}`,
				borderRadius: 6,
				boxShadow: "0 6px 18px rgba(0, 0, 0, 0.18)",
			} as CSSProperties,
			item: {
				display: "block",
				width: "100%",
				textAlign: "left",
				border: "none",
				background: "transparent",
				color: theme.axisText,
				padding: "4px 6px",
				font: "inherit",
				cursor: "pointer",
			} as CSSProperties,
			section: {
				margin: "6px 0 2px",
				fontSize: theme.fontSize - 1,
				opacity: 0.7,
				textTransform: "uppercase",
			} as CSSProperties,
			input: {
				width: "100%",
				boxSizing: "border-box",
				marginBottom: 6,
				padding: "4px 6px",
				font: "inherit",
				borderRadius: 4,
				border: `1px solid ${surface.border}`,
				background: surface.input,
				color: theme.axisText,
			} as CSSProperties,
		}),
		[theme, surface],
	);
}

/**
 * The Pro toolbar. It holds no chart state: every control reports upward, and
 * the Wrapper owns the values, so the same toolbar drives a chart created from
 * props or from an imperative call.
 *
 * Pro 工具栏。它自己不保存图表状态：每个控件都向上汇报，数值由 Wrapper 持有，因此
 * 无论图表由 props 还是命令式调用驱动，同一套工具栏都适用。
 */
export function TChartProToolbar(props: TChartProToolbarProps) {
	const { theme, locale } = props;
	const style = useToolbarStyle(
		chartThemeOf(theme),
		theme === "dark" ? DARK_SURFACE : LIGHT_SURFACE,
	);
	const [panel, setPanel] = useState<Panel>(null);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<TChartProSymbol[]>([]);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const t = (key: Parameters<typeof messageFor>[1]) => messageFor(locale, key);

	useEffect(() => {
		if (panel !== "symbol") return;
		let active = true;
		void props.searchSymbols(query).then((found) => {
			if (active) setResults(found);
		});
		return () => {
			active = false;
		};
	}, [panel, query, props.searchSymbols]);

	useEffect(() => {
		if (!panel) return;
		const dismiss = (event: MouseEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setPanel(null);
		};
		document.addEventListener("mousedown", dismiss);
		return () => document.removeEventListener("mousedown", dismiss);
	}, [panel]);

	const grouped = useMemo(() => {
		const byCategory = new Map<string, DrawingToolEntry[]>();
		for (const tool of props.tools) {
			const list = byCategory.get(tool.category) ?? [];
			list.push(tool);
			byCategory.set(tool.category, list);
		}
		return [...byCategory.entries()];
	}, [props.tools]);

	const toggleIndicator = (name: string, main: boolean) => {
		const list = main ? props.mainIndicators : props.subIndicators;
		const next = list.includes(name)
			? list.filter((item) => item !== name)
			: [...list, name];
		if (main) props.onIndicators([...next], [...props.subIndicators]);
		else props.onIndicators([...props.mainIndicators], [...next]);
	};

	const open = (target: Exclude<Panel, null>) =>
		setPanel((current) => (current === target ? null : target));

	return (
		<div ref={rootRef} style={{ position: "relative" }}>
			<div style={style.bar}>
				<div style={{ ...style.group, position: "relative" }}>
					<button
						type="button"
						style={{ ...style.button, ...style.active, fontWeight: 600 }}
						onClick={() => open("symbol")}
						title={props.symbol.name ?? props.symbol.ticker}
					>
						{props.symbol.shortName ?? props.symbol.ticker}
					</button>
					{panel === "symbol" && (
						<div style={style.panel}>
							<input
								autoFocus
								style={style.input}
								placeholder={t("search")}
								value={query}
								onChange={(event) => setQuery(event.target.value)}
							/>
							{results.length === 0 && (
								<span style={style.item}>{t("noResults")}</span>
							)}
							{results.map((symbol) => (
								<button
									key={symbol.ticker}
									type="button"
									style={style.item}
									onClick={() => {
										props.onSelectSymbol(symbol);
										setPanel(null);
									}}
								>
									{symbol.ticker}
									{symbol.name ? ` — ${symbol.name}` : ""}
								</button>
							))}
						</div>
					)}
				</div>

				<div style={style.group}>
					{props.barSizes.map((size) => (
						<button
							key={size}
							type="button"
							style={{
								...style.button,
								...(size === props.barSize ? style.active : null),
							}}
							onClick={() => props.onBarSize(size)}
						>
							{size}
						</button>
					))}
				</div>

				<div style={{ ...style.group, position: "relative" }}>
					<button type="button" style={style.button} onClick={() => open("indicators")}>
						{t("indicators")}
					</button>
					{panel === "indicators" && (
						<div style={style.panel}>
							<div style={style.section}>{t("main")}</div>
							{TCHARTPRO_INDICATORS.map((name) => (
								<label key={name} style={style.item}>
									<input
										type="checkbox"
										checked={props.mainIndicators.includes(name)}
										onChange={() => toggleIndicator(name, true)}
									/>{" "}
									{name}
								</label>
							))}
							<div style={style.section}>{t("sub")}</div>
							{TCHARTPRO_INDICATORS.map((name) => (
								<label key={name} style={style.item}>
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

				{props.drawingBarVisible && (
					<>
						<div style={{ ...style.group, position: "relative" }}>
							<button
								type="button"
								style={{
									...style.button,
									...(props.activeTool ? style.active : null),
								}}
								onClick={() => open("drawing")}
							>
								{t("drawing")}
								{props.activeTool ? ` · ${props.activeTool}` : ""}
							</button>
							{panel === "drawing" && (
								<div style={{ ...style.panel, minWidth: 280 }}>
									<button
										type="button"
										style={{
											...style.item,
											...(props.activeTool === null ? style.active : null),
										}}
										onClick={() => {
											props.onTool(null);
											setPanel(null);
										}}
									>
										{t("close")}
									</button>
									{grouped.map(([category, tools]) => (
										<div key={category}>
											<div style={style.section}>
												{CATEGORY_LABELS[category]?.[locale === "zh-CN" ? "zh" : "en"] ?? category}
											</div>
											{tools.map((tool) => (
												<button
													key={tool.type}
													type="button"
													style={{
														...style.item,
														...(tool.type === props.activeTool ? style.active : null),
													}}
													onClick={() => {
														props.onTool(tool.type);
														setPanel(null);
													}}
												>
													{tool.name}
													<span style={{ opacity: 0.6 }}>
														{" "}
														· {tool.requiredAnchors}
													</span>
												</button>
											))}
										</div>
									))}
								</div>
							)}
						</div>

						<div style={style.group}>
							<button
								type="button"
								style={{
									...style.button,
									...(props.magnet !== "off" ? style.active : null),
								}}
								title={`${t("magnet")}: ${props.magnet}`}
								onClick={() =>
									props.onMagnet(
										props.magnet === "off" ? "strong" : props.magnet === "strong" ? "weak" : "off",
									)
								}
							>
								{t("magnet")}
							</button>
							<button
								type="button"
								style={{
									...style.button,
									...(props.keepToolArmed ? style.active : null),
								}}
								onClick={() => props.onKeepToolArmed(!props.keepToolArmed)}
							>
								{t("keep")}
							</button>
							<button
								type="button"
								style={{
									...style.button,
									...(props.lockNewDrawings ? style.active : null),
								}}
								onClick={() => props.onLockNewDrawings(!props.lockNewDrawings)}
							>
								{t("lock")}
							</button>
							<button
								type="button"
								style={style.button}
								disabled={props.drawingCount === 0}
								onClick={props.onUndo}
							>
								{t("undo")}
							</button>
							<button
								type="button"
								style={style.button}
								disabled={props.drawingCount === 0}
								onClick={props.onDeleteSelected}
							>
								{t("delete")}
							</button>
							<button
								type="button"
								style={style.button}
								disabled={props.drawingCount === 0}
								onClick={props.onClearDrawings}
							>
								{t("clear")}
							</button>
						</div>
					</>
				)}

				<button
					type="button"
					style={{ ...style.button, marginLeft: "auto" }}
					onClick={props.onToggleTheme}
				>
					{t("theme")}
				</button>
			</div>
		</div>
	);
}

/**
 * The toolbar is DOM, not canvas, so it reads the same {@link ChartTheme} tokens
 * the chart fans out into — only the surfaces it needs have no chart
 * counterpart, and those are {@link LIGHT_SURFACE} / {@link DARK_SURFACE}.
 *
 * 工具栏是 DOM 而非 canvas，读取的仍是图表扇出去的那批 {@link ChartTheme} token ——
 * 只有它需要的「表面」在图表侧没有对应物，那部分就是 {@link LIGHT_SURFACE} 与
 * {@link DARK_SURFACE}。
 */
