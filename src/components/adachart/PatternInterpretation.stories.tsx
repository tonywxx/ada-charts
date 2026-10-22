import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { useMemo, useRef, useState } from "react";
import type { DataLoader, KLineData } from "klinecharts";
import AdaChart from "./AdaChart";
import AdaChartPro from "../adachart-pro/AdaChartPro";
import { PATTERN_FAMILIES, type PatternFamily } from "./patterns";
import { patternFixture } from "./pattern-fixtures";

function PatternDemo({ pro = false }: { pro?: boolean }) {
	const [family, setFamily] = useState<PatternFamily>("double");
	const [direction, setDirection] = useState<1 | -1>(1);
	const [theme, setTheme] = useState<"light" | "dark">("light");
	const [locale, setLocale] = useState("en-US");
	const [hourly, setHourly] = useState(false);
	const [openLast, setOpenLast] = useState(false);
	const push = useRef<((bar: KLineData) => void) | null>(null);
	const data = useMemo(() => patternFixture(family, direction).map((bar, i, all) => ({ ...bar, timestamp: all[0].timestamp + i * (hourly ? 3_600_000 : 86_400_000), closed: i !== all.length - 1 || !openLast })), [family, direction, hourly, openLast]);
	const loader = useMemo<DataLoader>(() => ({ getBars: params => {
		const family = PATTERN_FAMILIES.find(([id]) => params.symbol.ticker.startsWith(`SYNTHETIC-${id}-`))?.[0] ?? "double";
		const candles = patternFixture(family, params.symbol.ticker.endsWith("--1") ? -1 : 1);
		params.callback(candles.map((bar, i) => ({ ...bar, timestamp: candles[0].timestamp + i * (params.period.type === "hour" ? 3_600_000 : 86_400_000) })), false);
	}, subscribeBar: params => { push.current = params.callback; }, unsubscribeBar: () => { push.current = null; } }), []);
	const symbol = useMemo(() => ({ ticker: `SYNTHETIC-${family}-${direction}`, pricePrecision: 2, volumePrecision: 0 }), [family, direction]);
	const period = useMemo(() => ({ type: hourly ? "hour" as const : "day" as const, span: 1 }), [hourly]);
	const props = { symbol, period, patternInterpretation: true, theme, locale, height: 440, autoSize: true };
	return <div style={{ maxWidth: 1000, padding: 12 }}>
		<p>Synthetic shape fixtures · Not market observations or measured forecast accuracy.</p>
		<div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
			<label>Family <select value={family} onChange={event => setFamily(event.target.value as PatternFamily)}>{PATTERN_FAMILIES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
			<label>Direction <select value={direction} onChange={event => setDirection(Number(event.target.value) as 1 | -1)}><option value={1}>Bullish</option><option value={-1}>Bearish</option></select></label>
			<button onClick={() => setTheme(value => value === "light" ? "dark" : "light")}>Demo theme</button>
			<button onClick={() => setLocale(value => value === "en-US" ? "zh-CN" : "en-US")}>Demo language</button>
			<button onClick={() => setHourly(value => !value)}>Bar size</button>
			<button onClick={() => { const next = !openLast; setOpenLast(next); push.current?.({ ...data.at(-1)!, closed: !next }); }}>Candle finality</button>
		</div>
		{pro ? <AdaChartPro {...props} dataLoader={loader} mainIndicators={[]} subIndicators={[]} /> : <AdaChart {...props} data={data} indicators={[]} backgroundColor={theme === "dark" ? "#171b23" : "#ffffff"} textColor={theme === "dark" ? "#b2b5be" : "#677489"} gridColor={theme === "dark" ? "#303646" : "#e5e7eb"} />}
	</div>;
}

const meta = { title: "AdaChart/Pattern interpretation", component: PatternDemo, parameters: { layout: "fullscreen" } } satisfies Meta<typeof PatternDemo>;
export default meta;
type Story = StoryObj<typeof meta>;

const play: Story["play"] = async ({ canvasElement }) => {
	const canvas = within(canvasElement);
	await waitFor(() => expect(canvas.getByRole("combobox", { name: "Recognized patterns" }).querySelectorAll("option").length).toBeGreaterThan(1));
	await userEvent.click(canvas.getByRole("button", { name: "Candle finality" }));
	await waitFor(() => expect(canvas.queryByRole("button", { name: /Double bottom ·/ })).toBeNull());
	await userEvent.click(canvas.getByRole("button", { name: "Candle finality" }));
	await waitFor(() => expect(canvas.getByRole("button", { name: /Double bottom ·/ })).toBeVisible());
	const marker = canvas.getByRole("button", { name: /Double bottom ·/ });
	await userEvent.click(marker);
	const details = canvas.getByRole("dialog", { name: "Double bottom" });
	await expect(details).toBeVisible();
	await expect(within(details).getByText(/Insufficient data/)).toBeVisible();
	await userEvent.keyboard("{Escape}");
	await expect(details).not.toBeVisible();
	await expect(marker).toHaveFocus();
	await userEvent.click(canvas.getByRole("button", { name: "Patterns" }));
	await expect(canvas.queryByRole("button", { name: /Double bottom ·/ })).toBeNull();
	await userEvent.click(canvas.getByRole("button", { name: "Patterns" }));
	await userEvent.click(canvas.getByRole("button", { name: "Bar size" }));
	await waitFor(() => expect(canvas.getByRole("button", { name: /Double bottom ·/ })).toBeVisible());
	await userEvent.click(canvas.getByRole("button", { name: "Demo theme" }));
	await userEvent.click(canvas.getByRole("button", { name: "Demo language" }));
	await userEvent.click(canvas.getByRole("button", { name: /W 型底 ·/ }));
	await expect(canvas.getByRole("dialog", { name: "W 型底" })).toBeVisible();
	await expect(canvas.getByText("SYNTHETIC-double-1 · 1 hour")).toBeVisible();
	await userEvent.keyboard("{Escape}");
	await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Family" }), "megaphone");
	await waitFor(() => expect(canvas.getByRole("button", { name: /喇叭底 ·/ })).toBeVisible());
	await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Direction" }), "-1");
	await waitFor(() => expect(canvas.getByRole("button", { name: /喇叭顶 ·/ })).toBeVisible());
	await expect(canvas.queryByRole("button", { name: /喇叭底 ·/ })).toBeNull();
};

export const Basic: Story = { play };
export const Pro: Story = { args: { pro: true }, play };
