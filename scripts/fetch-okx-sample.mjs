/**
 * Regenerate the real BTC candles the Storybook stories render.
 *
 * Fetches OKX public market data and writes it to
 * `src/__data__/btc-usdt.json`, which the stories
 * import directly. Committing the snapshot keeps the docs site deterministic and
 * viewable offline, while `pnpm okx:sample` refreshes it to the latest market.
 *
 * 重新生成 Storybook 故事所使用的真实 BTC 行情。
 *
 * 从 OKX 公共行情接口拉取，写入
 * `src/__data__/btc-usdt.json`，由故事直接 import。
 * 把快照提交进仓库可以让文档站保持确定、且离线也能浏览；
 * 执行 `pnpm okx:sample` 即可刷新到最新行情。
 *
 * See https://www.okx.com/docs-v5/en/#order-book-trading-market-data-get-candles
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ORIGIN = "https://www.okx.com";
const INST_ID = "BTC-USDT";
const BARS = ["1D", "4H", "1m"];
const LIMIT = 300;

const OUT_FILE = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../src/__data__/btc-usdt.json",
);

/** One row of an OHLCV candle, in the shape `TChart` consumes. */
function toCandle(row) {
	const [timestamp, open, high, low, close, volume] = row;
	// OKX answers in milliseconds; lightweight-charts wants whole seconds.
	// OKX 返回毫秒，lightweight-charts 需要整秒。
	const time = Math.trunc(Number(timestamp) / 1000);
	if (!Number.isFinite(time)) throw new Error(`Unparsable timestamp: ${timestamp}`);

	return {
		time,
		open: Number(open),
		high: Number(high),
		low: Number(low),
		close: Number(close),
		value: Number(close),
		volume: Number(volume),
	};
}

async function fetchBar(bar) {
	const url = `${ORIGIN}/api/v5/market/candles?instId=${INST_ID}&bar=${bar}&limit=${LIMIT}`;
	const response = await fetch(url, { headers: { Accept: "application/json" } });
	if (!response.ok) {
		throw new Error(`${url} -> HTTP ${response.status} ${response.statusText}`);
	}

	const payload = await response.json();
	if (payload.code !== "0") {
		throw new Error(`${url} -> OKX code ${payload.code}: ${payload.msg}`);
	}

	// OKX returns newest-first; the chart requires ascending time.
	// OKX 按时间倒序返回，图表要求时间升序。
	return payload.data.map(toCandle).sort((a, b) => a.time - b.time);
}

const series = {};
for (const bar of BARS) {
	const candles = await fetchBar(bar);
	series[bar] = candles;
	const first = new Date(candles[0].time * 1000).toISOString();
	const last = new Date(candles.at(-1).time * 1000).toISOString();
	console.log(`${bar.padEnd(3)} ${String(candles.length).padStart(3)} candles  ${first} .. ${last}`);
}

const snapshot = {
	generatedAt: new Date().toISOString(),
	source: `${ORIGIN}/api/v5/market/candles`,
	instId: INST_ID,
	bars: series,
};

await mkdir(dirname(OUT_FILE), { recursive: true });
await writeFile(OUT_FILE, `${JSON.stringify(snapshot, null, "\t")}\n`, "utf8");
console.log(`\nwrote ${OUT_FILE}`);
