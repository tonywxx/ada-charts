import type { Chart, KLineData } from "klinecharts";
import { useEffect, useRef, useState } from "react";
import { detectPatternsAsync, isPatternCandleClosed, patternStatistics, PATTERN_HORIZON, PATTERN_MIN_SAMPLES, PATTERN_SCAN_LIMIT, type PatternSignal } from "./patterns";

interface Props {
	engine: () => Chart | null;
	events: EventTarget;
	locale: string;
	theme: "light" | "dark";
	timezone: string;
	isCandleClosed?: (bar: KLineData) => boolean;
}
interface Position { signal: PatternSignal; path: string; boundaries: string[]; x: number; y: number }
interface Snapshot { signals: PatternSignal[]; data: KLineData[]; positions: Position[]; left: number; top: number; width: number; height: number; symbol: string; period: string; unknown: boolean }
const EMPTY: Snapshot = { signals: [], data: [], positions: [], left: 0, top: 0, width: 0, height: 0, symbol: "", period: "", unknown: false };

// shortcut: engine-only image exports exclude this DOM layer; composite capture if exports need patterns.
export function PatternInterpretation({ engine, events, locale, theme, timezone, isCandleClosed = isPatternCandleClosed }: Props) {
	const [visible, setVisible] = useState(true);
	const [snapshot, setSnapshot] = useState(EMPTY);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const dialog = useRef<HTMLDialogElement>(null);
	const focusBack = useRef<HTMLElement | null>(null);
	const control = useRef<HTMLButtonElement>(null);
	const zh = locale.startsWith("zh");
	const text = (en: string, cn: string) => zh ? cn : en;
	const name = (signal: PatternSignal) => zh ? signal.pattern.zhName : signal.pattern.name;
	const selected = snapshot.signals.find(signal => signal.id === selectedId);
	const stats = selected ? patternStatistics(snapshot.data, snapshot.signals, selected, isCandleClosed, engine()?.getPeriod() ?? undefined) : null;
	const color = theme === "dark" ? "#e5e7eb" : "#20252c";
	const background = theme === "dark" ? "#20252c" : "#ffffff";
	const buttonStyle = { color, background, border: "1px solid #8886", borderRadius: 6, padding: "5px 8px", cursor: "pointer", font: "inherit" };
	const date = (timestamp: number) => new Intl.DateTimeFormat(locale, { timeZone: timezone, year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(timestamp);
	const price = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: engine()?.getSymbol()?.pricePrecision ?? 8 }).format(value);
	const open = (id: string) => { focusBack.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setSelectedId(id); };

	useEffect(() => {
		let frame: number | null = null, chart: Chart | null = null;
		let current = EMPTY, signature = "", dirty = true, generation = 0, disposed = false;
		const update = () => {
			frame = null;
			if (!chart || engine() !== chart) return;
			const source = chart.getDataList();
			if (dirty) {
				dirty = false;
				const data = source.slice(-PATTERN_SCAN_LIMIT);
				const nextSignature = JSON.stringify(data.map(bar => isCandleClosed(bar) ? [bar.timestamp, bar.open, bar.high, bar.low, bar.close] : [bar.timestamp, false]));
				if (nextSignature !== signature) {
					signature = nextSignature;
					const token = ++generation;
					void detectPatternsAsync(data, isCandleClosed, chart.getPeriod() ?? undefined, () => disposed || generation !== token).then(signals => {
						if (!signals || disposed || generation !== token) return;
						current = { ...current, data, signals, unknown: data.some(bar => bar.closed === undefined && isCandleClosed === isPatternCandleClosed) };
						queue();
					});
				}
			}
			const bounds = chart.getSize("candle_pane", "main");
			if (!bounds) return;
			const pixel = (timestamp: number, value: number) => {
				const point = chart!.convertToPixel({ timestamp, value }, { paneId: "candle_pane" });
				return Array.isArray(point) ? point[0] : point;
			};
			const path = (points: PatternSignal["points"]) => points.map(point => { const p = pixel(point.timestamp, point.value); return `${p.x},${p.y}`; }).join(" ");
			const positions = current.signals.slice(-40).flatMap(signal => {
				const p = pixel(signal.confirmedAt, signal.price);
				if (p.x === undefined || p.y === undefined || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return [];
				return [{ signal, path: path([...signal.points, { timestamp: signal.confirmedAt, value: signal.price }]), boundaries: signal.boundaries.map(path), x: p.x, y: p.y }];
			});
			const period = chart.getPeriod();
			current = { ...current, positions, left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, symbol: chart.getSymbol()?.ticker ?? "", period: period ? `${period.span} ${period.type}` : "" };
			setSnapshot(current);
		};
		const queue = () => { if (frame === null) frame = requestAnimationFrame(update); };
		const dataChanged = () => { dirty = true; queue(); };
		const reset = () => { generation++; current = EMPTY; signature = ""; setSnapshot(EMPTY); setSelectedId(null); dirty = true; queue(); };
		let observer: ResizeObserver | undefined;
		const mount = requestAnimationFrame(() => {
			chart = engine();
			if (!chart) return;
			for (const action of ["onZoom", "onScroll", "onVisibleRangeChange", "onPaneDrag"] as const) chart.subscribeAction(action, queue);
			observer = new ResizeObserver(queue);
			const host = control.current?.parentElement?.parentElement;
			if (host) observer.observe(host);
			queue();
		});
		events.addEventListener("data", dataChanged);
		events.addEventListener("reset", reset);
		return () => {
			disposed = true; generation++;
			cancelAnimationFrame(mount);
			if (frame !== null) cancelAnimationFrame(frame);
			observer?.disconnect();
			events.removeEventListener("data", dataChanged); events.removeEventListener("reset", reset);
			if (chart && engine() === chart) for (const action of ["onZoom", "onScroll", "onVisibleRangeChange", "onPaneDrag"] as const) chart.unsubscribeAction(action, queue);
		};
	}, [engine, events, isCandleClosed]);

	useEffect(() => {
		if (selected && visible) dialog.current?.showModal();
		else if (dialog.current?.open) dialog.current.close();
	}, [selected, visible]);

	return <>
		<div style={{ position: "absolute", right: 60, top: 6, zIndex: 4, display: "flex", gap: 4, maxWidth: "85%", fontSize: 12 }}>
			<button ref={control} type="button" style={buttonStyle} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{text("Patterns", "形态解读")}</button>
			{visible ? <select style={{ ...buttonStyle, minWidth: 0, maxWidth: 190 }} aria-label={text("Recognized patterns", "已识别形态")} value="" onChange={event => { if (event.target.value) open(event.target.value); }}>
				<option value="">{snapshot.signals.length ? text(`${Math.min(40, snapshot.signals.length)} latest signals`, `最近 ${Math.min(40, snapshot.signals.length)} 个信号`) : snapshot.unknown ? text("Closure data needed", "缺少 K 线完成标记") : text("No confirmed pattern", "暂无已确认形态")}</option>
				{snapshot.signals.slice(-40).reverse().map(signal => <option key={signal.id} value={signal.id}>{name(signal)} · {date(signal.confirmedAt)}</option>)}
			</select> : null}
		</div>
		{visible ? <div style={{ position: "absolute", pointerEvents: "none", overflow: "hidden", left: snapshot.left, top: snapshot.top, width: snapshot.width, height: snapshot.height, zIndex: 3 }}>
			<svg aria-hidden="true" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
				{snapshot.positions.map(p => <g key={p.signal.id}>
					<polyline points={p.path} stroke="#4c78ef" strokeWidth={2} fill="none" />
					{p.boundaries.map((boundary, i) => <polyline key={i} points={boundary} stroke={color} opacity={0.45} strokeDasharray="5 4" fill="none" />)}
				</g>)}
			</svg>
			{snapshot.positions.filter(p => p.x >= 0 && p.x <= snapshot.width && p.y >= 0 && p.y <= snapshot.height).map(p => <button key={p.signal.id} type="button" aria-label={`${name(p.signal)} · ${date(p.signal.confirmedAt)}`} title={name(p.signal)} onClick={() => open(p.signal.id)} style={{ position: "absolute", pointerEvents: "auto", left: p.x, top: p.y, transform: "translate(-50%, -50%)", width: 26, height: 26, boxSizing: "border-box", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", border: "2px solid white", background: p.signal.pattern.direction === 1 ? "#079e70" : "#df4260", color: "white", cursor: "pointer", fontSize: 16 }}><svg aria-hidden="true" viewBox="0 0 16 16" style={{ width: 14, height: 14, display: "block", flexShrink: 0 }}><path fill="currentColor" d={p.signal.pattern.direction === 1 ? "M8 2 14 14H2Z" : "M2 2H14L8 14Z"} /></svg></button>)}
		</div> : null}
		<dialog ref={dialog} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.close(); } }} aria-label={selected ? name(selected) : text("Pattern interpretation", "形态解读")} onClose={() => { setSelectedId(null); (focusBack.current?.isConnected ? focusBack.current : control.current)?.focus(); }} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close(); } }} style={{ color, background, border: "1px solid #8886", borderRadius: 12, padding: 24, width: "min(420px, 90vw)", maxHeight: "80vh", overflow: "auto", boxSizing: "border-box", font: "14px/1.6 system-ui, sans-serif" }}>
			{selected && stats ? <>
				<div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}><h2 style={{ margin: 0, fontSize: 22 }}>{name(selected)}</h2><button type="button" autoFocus style={buttonStyle} aria-label={text("Close pattern details", "关闭形态详情")} onClick={() => dialog.current?.close()}>×</button></div>
				<p>{snapshot.symbol} · {snapshot.period}</p>
				<dl style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: "12px 16px", margin: "20px 0" }}>
					<dt>{text("Start time", "起始时间")}</dt><dd style={{ margin: 0 }}>{date(selected.points[0].timestamp)}</dd>
					<dt>{text("Confirmed", "确认时间")}</dt><dd style={{ margin: 0 }}>{date(selected.confirmedAt)}</dd>
					<dt>{text("Pattern", "形态方向")}</dt><dd style={{ margin: 0 }}>{selected.pattern.direction === 1 ? text("Bullish", "看涨") : text("Bearish", "看跌")}</dd>
					<dt>{text("Confirmation price", "确认价格")}</dt><dd style={{ margin: 0 }}>{price(selected.price)}</dd>
					<dt>{text("Structural support", "形态支撑位")}</dt><dd style={{ margin: 0 }}>{price(selected.support)} ({((selected.support / selected.price - 1) * 100).toFixed(2)}%)</dd>
					<dt>{text("Structural resistance", "形态阻力位")}</dt><dd style={{ margin: 0 }}>{price(selected.resistance)} ({((selected.resistance / selected.price - 1) * 100).toFixed(2)}%)</dd>
				</dl>
				<h3>{text("Historical outcomes", "历史涨跌统计")}</h3>
				<p>{text(`Close after ${PATTERN_HORIZON} candles versus confirmation close. Same symbol, bar size and pattern; non-overlapping earlier signals only.`, `比较确认后 ${PATTERN_HORIZON} 根已完成 K 线的收盘价与确认价。仅统计相同标的、周期、形态的先前非重叠信号。`)}</p>
				{stats.frequencies ? <p>{text("Rise", "上涨")} {(stats.frequencies.rise * 100).toFixed(1)}% · {text("Fall", "下跌")} {(stats.frequencies.fall * 100).toFixed(1)}% · {text("Unchanged", "持平")} {(stats.frequencies.unchanged * 100).toFixed(1)}%</p> : <p role="status">{text(`Insufficient data (${stats.samples}/${PATTERN_MIN_SAMPLES} samples)`, `数据不足（${stats.samples}/${PATTERN_MIN_SAMPLES} 个样本）`)}</p>}
				<p>{text("Samples", "样本量")}: {stats.samples}{stats.from && stats.to ? ` · ${date(stats.from)} – ${date(stats.to)}` : ""}</p>
				{snapshot.data.length ? <p>{text("Loaded scan window", "已加载扫描窗口")}: {date(snapshot.data[0].timestamp)} – {date(snapshot.data.at(-1)!.timestamp)} · {text(`up to ${PATTERN_SCAN_LIMIT} candles`, `最多 ${PATTERN_SCAN_LIMIT} 根 K 线`)}</p> : null}
				<p style={{ opacity: 0.7 }}>{text("Rule-based recognition; historical frequency is not a forecast. Structural levels and past outcomes do not guarantee future results.", "基于规则识别；历史频率不代表预测概率。形态价位及历史结果不保证未来表现。")}</p>
			</> : null}
		</dialog>
	</>;
}
