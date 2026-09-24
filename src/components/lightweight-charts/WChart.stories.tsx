import type { Meta, StoryObj } from "@storybook/react";
import WChart from "./WChart";

/**
 * Deterministic OHLC sample data (no Math.random).
 * Uses a seeded LCG so the story renders identical output on every build,
 * which keeps `build-storybook` reproducible. Time is a unix timestamp (seconds),
 * which lightweight-charts treats as a UTCTimestamp.
 */
function buildSampleData(count = 90): {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
	value: number;
	volume: number;
}[] {
	const start = Math.floor(Date.UTC(2024, 0, 1) / 1000);
	const day = 86400;
	let price = 100;
	let seed = 0x9e3779b9;
	const rand = () => {
		// Deterministic linear congruential generator.
		seed = (seed * 1103515245 + 12345) & 0x7fffffff;
		return seed / 0x7fffffff;
	};

	const data: {
		time: number;
		open: number;
		high: number;
		low: number;
		close: number;
		value: number;
		volume: number;
	}[] = [];

	for (let i = 0; i < count; i++) {
		const open = price;
		const change = (rand() - 0.5) * 6;
		const close = Math.max(1, open + change);
		const high = Math.max(open, close) + rand() * 3;
		const low = Math.min(open, close) - rand() * 3;
		const volume = Math.floor(1000 + rand() * 9000);

		data.push({
			time: start + i * day,
			open: Number(open.toFixed(2)),
			high: Number(high.toFixed(2)),
			low: Number(low.toFixed(2)),
			close: Number(close.toFixed(2)),
			value: Number(close.toFixed(2)),
			volume,
		});

		price = close;
	}

	return data;
}

const sampleData = buildSampleData();

const meta: Meta<typeof WChart> = {
	title: "Charts/WChart",
	component: WChart,
	args: {
		data: sampleData,
		chartType: "candlestick",
		height: 480,
		autoSize: true,
		showVolume: true,
		showEma: true,
		showHighPriceLine: true,
		showLowPriceLine: true,
		showAvgPriceLine: true,
		upColor: "#26a69a",
		downColor: "#ef5350",
		lineColor: "#2962FF",
		emaColor1: "#FF8C00",
		emaColor2: "#8A2BE2",
		crosshairMode: "magnet",
	},
	argTypes: {
		// Control to switch chart type at runtime.
		chartType: {
			control: "select",
			options: [
				"candlestick",
				"line",
				"area",
				"bar",
				"histogram",
				"baseline",
			],
		},
	},
	parameters: {
		docs: {
			description: {
				component:
					"WChart wraps TradingView lightweight-charts to render candlestick, line, area, bar, histogram, and baseline charts with optional volume and EMA overlays.",
			},
		},
	},
};

export default meta;

type Story = StoryObj<typeof WChart>;

// Candlestick is the default, shown via the chartType control above.
export const Candlestick: Story = {};

// A second chart type (line) using the same deterministic data.
export const Line: Story = {
	args: { chartType: "line" },
};

// A third chart type (area) using the same deterministic data.
export const Area: Story = {
	args: { chartType: "area" },
};
