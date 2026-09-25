import snapshot from "./__data__/btc-usdt.json";

/**
 * Everything that knows how OKX spells market data, in one place and free of any
 * charting engine.
 *
 * Three modules used to parse the same response three different ways, and the
 * copies had already drifted: two dropped non-finite candles and one did not, so
 * a bad row could reach `KChartPro` and nowhere else. The row layout and the
 * ordering rule are facts about the *feed*, not about the engine, so they now
 * live here and each Wrapper maps the result onto whatever its engine wants.
 *
 * 所有知道 OKX 如何表达市场数据的代码集中一处，且不含任何图表引擎。
 *
 * 同一段响应此前被三个模块各解析一遍，而且副本已经漂移：两处会丢弃非有限值的 K 线、
 * 一处不会，于是一根坏数据能到达 `KChartPro` 却到不了别处。行格式与排序规则是*数据源*
 * 的事实、不是引擎的事实，所以现在放这里，各 Wrapper 只把结果映射成自己引擎要的形状。
 */

export const OKX_INST_ID = "BTC-USDT";
export const OKX_CANDLES_URL = "https://www.okx.com/api/v5/market/candles";
export const OKX_HISTORY_LIMIT = 300;
export const OKX_REQUEST_TIMEOUT_MS = 8_000;

/** One Candle in engine-neutral shape: milliseconds since the epoch, all fields finite. 引擎无关的一根 K 线：毫秒时间戳，各字段均为有限值。 */
export interface OkxCandle {
	timestamp: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	turnover: number;
}

/**
 * `[timestamp, open, high, low, close, volume, turnover, …]`, newest first.
 * OKX returns strings for every field.
 *
 * `[时间戳, 开, 高, 低, 收, 成交量, 成交额, …]`，倒序返回；OKX 每个字段都是字符串。
 */
export function parseOkxRows(rows: readonly string[][]): OkxCandle[] {
	// `Number("")` is `0`, not `NaN`, so an absent field would otherwise slip
	// through as a price of zero and drag the axis down with it.
	// `Number("")` 是 `0` 而不是 `NaN`，因此缺失字段若不加处理会被当成价格为 0 混进来，
	// 并把坐标轴一起拉下去。
	const num = (value: string | undefined): number =>
		value === undefined || value.trim() === "" ? Number.NaN : Number(value);

	return rows
		.map((row) => {
			const [time, open, high, low, close, volume, turnover] = row;
			return {
				timestamp: num(time),
				open: num(open),
				high: num(high),
				low: num(low),
				close: num(close),
				volume: num(volume),
				turnover: num(turnover),
			};
		})
		// A row with a non-finite time or close would be drawn as an invisible
		// gap that still occupies an index; dropping it keeps the ascending order
		// meaningful.
		// 时间或收盘非有限的一根会被画成一个仍占据索引位的隐形缺口；丢掉它才能让升序排列仍然成立。
		.filter(
			(candle) => Number.isFinite(candle.timestamp) && Number.isFinite(candle.close),
		)
		.sort((a, b) => a.timestamp - b.timestamp);
}

export function okxCandlesUrl(instId: string, bar: string, limit = OKX_HISTORY_LIMIT): string {
	return `${OKX_CANDLES_URL}?instId=${encodeURIComponent(instId)}&bar=${encodeURIComponent(bar)}&limit=${limit}`;
}

/**
 * The committed snapshot, in the same shape as a live answer.
 * The file stores seconds because it was first captured for
 * lightweight-charts, so it is scaled back up here rather than at every call site.
 *
 * 仓库内提交的快照，形状与实时响应一致。文件里存的是秒（最初为 lightweight-charts 抓取时
 * 归一化过），所以在这里统一换算回毫秒，而不是在每个调用点各换算一次。
 */
export function okxSnapshotCandles(bar: string): OkxCandle[] {
	const rows =
		(snapshot.bars as Record<string, Array<Record<string, number>>>)[bar] ?? [];
	return rows
		.map((row) => ({
			timestamp: Math.trunc(row.time) * 1000,
			open: row.open,
			high: row.high,
			low: row.low,
			close: row.close,
			volume: row.volume ?? 0,
			turnover: row.turnover ?? 0,
		}))
		.sort((a, b) => a.timestamp - b.timestamp);
}

/** When the snapshot was captured. Its age is always shown, never hidden. 快照的抓取时间；它的陈旧程度始终展示、不做隐藏。 */
export function okxSnapshotTimestamp(): number {
	return Date.parse(snapshot.generatedAt) || Date.now();
}

/**
 * One request, one parse, no fallback: a failed fetch rejects so each caller
 * decides for itself whether a Snapshot answers. The two callers that did this
 * by hand had drifted on whether a non-finite row survives.
 *
 * 一次请求、一次解析、不做兜底：失败就 reject，由各调用方自己决定是否改用 Snapshot。
 * 之前两处手写这份逻辑的调用方，在「非有限值的行是否保留」上已经不一致。
 */
export async function fetchOkxCandles(
	instId: string,
	bar: string,
): Promise<OkxCandle[]> {
	const response = await fetch(okxCandlesUrl(instId, bar), {
		signal: AbortSignal.timeout(OKX_REQUEST_TIMEOUT_MS),
		headers: { Accept: "application/json" },
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);

	const payload = (await response.json()) as {
		code: string;
		msg?: string;
		data?: string[][];
	};
	if (payload.code !== "0" || !payload.data?.length) {
		throw new Error(`OKX code ${payload.code} ${payload.msg ?? ""}`.trim());
	}
	return parseOkxRows(payload.data);
}
