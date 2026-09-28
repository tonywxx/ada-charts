import type { DeepPartial, Styles } from "klinecharts";
import { DARK_THEME, LIGHT_THEME, withAlpha } from "../../theme";

/**
 * The klinecharts style tables and the rule that layers them.
 *
 * This module deliberately imports only **types** from `klinecharts`: the engine
 * touches `window` the moment it loads, so keeping the presets here — rather than
 * beside `registerOverlay` — is what makes the precedence rule testable without a
 * browser.
 *
 * klinecharts 的样式表与叠加规则。
 *
 * 本模块刻意只从 `klinecharts` 引入**类型**：引擎一被加载就会碰 `window`，所以把预设
 * 放在这里（而不是跟 `registerOverlay` 同处一个模块），才让优先级规则能在没有浏览器的
 * 情况下被测试。
 */

// -------------------------------------------------------------------- style

/**
 * Recursively merges a set of partial style objects, left to right. Arrays are
 * replaced wholesale (a style array is a fixed-length palette, so element-wise
 * merging would never be meaningful).
 *
 * 从左到右递归合并多个部分样式对象。数组整体替换（样式数组是定长调色板，逐元素合并没有意义）。
 */
export function mergeStyles(
	...sources: Array<DeepPartial<Styles> | undefined>
): DeepPartial<Styles> {
	const out: Record<string, unknown> = {};
	for (const source of sources) {
		if (!source) continue;
		for (const [key, value] of Object.entries(source)) {
			const existing = out[key];
			if (
				value &&
				typeof value === "object" &&
				!Array.isArray(value) &&
				existing &&
				typeof existing === "object" &&
				!Array.isArray(existing)
			) {
				out[key] = mergeStyles(
					existing as DeepPartial<Styles>,
					value as DeepPartial<Styles>,
				);
			} else {
				out[key] = value;
			}
		}
	}
	return out as DeepPartial<Styles>;
}

const LIGHT_STYLES: DeepPartial<Styles> = {
	grid: {
		show: true,
		horizontal: { show: true, color: LIGHT_THEME.gridLine, style: "solid", size: 1 },
		vertical: { show: true, color: LIGHT_THEME.gridLine, style: "solid", size: 1 },
	},
	candle: {
		bar: {
			upColor: LIGHT_THEME.trendUp,
			downColor: LIGHT_THEME.trendDown,
			noChangeColor: LIGHT_THEME.noChange,
			upBorderColor: LIGHT_THEME.trendUp,
			downBorderColor: LIGHT_THEME.trendDown,
			noChangeBorderColor: LIGHT_THEME.noChange,
			upWickColor: LIGHT_THEME.trendUp,
			downWickColor: LIGHT_THEME.trendDown,
			noChangeWickColor: LIGHT_THEME.noChange,
		},
		area: {
			lineColor: LIGHT_THEME.accent,
			backgroundColor: [
				{ offset: 0, color: withAlpha(LIGHT_THEME.accent, 0.01) },
				{ offset: 1, color: withAlpha(LIGHT_THEME.accent, 0.2) },
			],
			point: { color: LIGHT_THEME.accent, rippleColor: LIGHT_THEME.accent },
		},
		priceMark: {
			show: true,
			high: { show: true, color: LIGHT_THEME.axisText },
			low: { show: true, color: LIGHT_THEME.axisText },
			last: {
				show: true,
				upColor: LIGHT_THEME.trendUp,
				downColor: LIGHT_THEME.trendDown,
				noChangeColor: LIGHT_THEME.noChange,
				line: { show: true, style: "dashed", size: 1, dashedValue: [2, 2] },
				text: {show: true, color: LIGHT_THEME.labelText, size: 10 },
			},
		},
		tooltip: {
			showRule: "follow_cross",
			showType: "standard",
			title: {color: LIGHT_THEME.axisText, size: LIGHT_THEME.fontSize },
			legend: {color: LIGHT_THEME.axisText, size: LIGHT_THEME.fontSize },
		},
	},
	xAxis: {
		show: true,
		axisLine: { show: true, color: LIGHT_THEME.axisBorder, size: 1 },
		tickLine: { show: true, color: LIGHT_THEME.axisBorder, size: 1, length: 3 },
		tickText: {show: true, color: LIGHT_THEME.axisText, size: LIGHT_THEME.fontSize },
	},
	yAxis: {
		show: true,
		axisLine: { show: true, color: LIGHT_THEME.axisBorder, size: 1 },
		tickLine: { show: true, color: LIGHT_THEME.axisBorder, size: 1, length: 3 },
		tickText: {show: true, color: LIGHT_THEME.axisText, size: LIGHT_THEME.fontSize },
	},
	separator: { size: 1, color: LIGHT_THEME.axisBorder, activeBackgroundColor: LIGHT_THEME.gridLine },
	crosshair: {
		show: true,
		horizontal: {
			show: true,
			line: { show: true, color: LIGHT_THEME.crosshair, style: "dashed", size: 1, dashedValue: [4, 2] },
			text: {show: true, color: LIGHT_THEME.labelText, size: LIGHT_THEME.fontSize },
		},
		vertical: {
			show: true,
			line: { show: true, color: LIGHT_THEME.crosshair, style: "dashed", size: 1, dashedValue: [4, 2] },
			text: {show: true, color: LIGHT_THEME.labelText, size: LIGHT_THEME.fontSize },
		},
	},
	indicator: {
		ohlc: { upColor: LIGHT_THEME.trendUp, downColor: LIGHT_THEME.trendDown, noChangeColor: LIGHT_THEME.noChange },
		bars: [{ upColor: withAlpha(LIGHT_THEME.trendUp, 0.7), downColor: withAlpha(LIGHT_THEME.trendDown, 0.7), noChangeColor: LIGHT_THEME.noChange }],
		lines: LIGHT_THEME.indicatorLines.map((color) => ({ color, size: 1 })),
		circles: [{ upColor: withAlpha(LIGHT_THEME.trendUp, 0.7), downColor: withAlpha(LIGHT_THEME.trendDown, 0.7), noChangeColor: LIGHT_THEME.noChange }],
		lastValueMark: { show: false },
		tooltip: { showRule: "always", title: { showName: true, showParams: true }, legend: {color: LIGHT_THEME.axisText, size: LIGHT_THEME.fontSize } },
	},
	overlay: {
		point: { color: LIGHT_THEME.accent, borderColor: LIGHT_THEME.accent, activeColor: LIGHT_THEME.accent, activeBorderColor: LIGHT_THEME.accent },
		line: { color: LIGHT_THEME.accent, size: 1, style: "solid" },
		rect: { color: withAlpha(LIGHT_THEME.accent, 0.2), borderColor: LIGHT_THEME.accent },
		text: {color: LIGHT_THEME.labelText, size: LIGHT_THEME.fontSize },
	},
};

const DARK_STYLES: DeepPartial<Styles> = {
	grid: {
		horizontal: { color: DARK_THEME.gridLine },
		vertical: { color: DARK_THEME.gridLine },
	},
	candle: {
		bar: {
			upColor: DARK_THEME.trendUp,
			downColor: DARK_THEME.trendDown,
			upBorderColor: DARK_THEME.trendUp,
			downBorderColor: DARK_THEME.trendDown,
			upWickColor: DARK_THEME.trendUp,
			downWickColor: DARK_THEME.trendDown,
		},
		area: {
			lineColor: DARK_THEME.accent,
			backgroundColor: [
				{ offset: 0, color: withAlpha(DARK_THEME.accent, 0.01) },
				{ offset: 1, color: withAlpha(DARK_THEME.accent, 0.35) },
			],
		},
		priceMark: {
			high: { color: DARK_THEME.axisText },
			low: { color: DARK_THEME.axisText },
			last: { text: { color: DARK_THEME.labelText } },
		},
		tooltip: { title: { color: DARK_THEME.axisText }, legend: { color: DARK_THEME.axisText } },
	},
	xAxis: {
		axisLine: { color: DARK_THEME.axisBorder },
		tickLine: { color: DARK_THEME.axisBorder },
		tickText: { color: DARK_THEME.axisText },
	},
	yAxis: {
		axisLine: { color: DARK_THEME.axisBorder },
		tickLine: { color: DARK_THEME.axisBorder },
		tickText: { color: DARK_THEME.axisText },
	},
	separator: { color: DARK_THEME.axisBorder, activeBackgroundColor: DARK_THEME.gridLine },
	crosshair: {
		horizontal: { line: { color: DARK_THEME.crosshair }, text: { color: DARK_THEME.labelText } },
		vertical: { line: { color: DARK_THEME.crosshair }, text: { color: DARK_THEME.labelText } },
	},
	indicator: {
		ohlc: { upColor: DARK_THEME.trendUp, downColor: DARK_THEME.trendDown },
		tooltip: { legend: { color: DARK_THEME.axisText } },
	},
	overlay: {
		point: { color: DARK_THEME.accent, borderColor: DARK_THEME.accent, activeColor: DARK_THEME.accent, activeBorderColor: DARK_THEME.accent },
		line: { color: DARK_THEME.accent },
	},
};

/**
 * The Theme preset for a mode, shared with `KChartPro` so both klinecharts-based
 * Wrappers fan the same tokens out through the same table.
 *
 * 某个模式对应的 Theme 预设；与 `KChartPro` 共用，使两个基于 klinecharts 的 Wrapper
 * 把同一批 token 扇出到同一张表。
 */
export function themeStyles(mode: "light" | "dark"): DeepPartial<Styles> {
	return mode === "dark" ? DARK_STYLES : LIGHT_STYLES;
}
