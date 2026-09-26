import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { build, preview } from "vite";

/**
 * The Pro performance comparison driver.
 *
 * It builds `perf/index.html` as a minified production bundle (with the same
 * klinecharts v9 alias the library build uses), serves it statically, drives it
 * through Playwright, and writes every raw measurement to `perf/results.json`.
 * The markdown report is written from that file — never from a hand-typed
 * number.
 *
 * Pro 性能对比驱动。
 *
 * 它把 `perf/index.html` 打成压缩过的生产包（用与库构建相同的 klinecharts v9 别名），
 * 以静态服务端出，用 Playwright 驱动，并把每一项原始测量写进 `perf/results.json`。
 * markdown 报告由该文件生成 —— 绝不手写数字。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = path.join(root, "perf", "results.json");

/** `PERF_QUICK=1` shrinks the plan to a smoke run while the harness is being worked on. `PERF_QUICK=1` 在调试测试台时把计划缩成一次冒烟运行。 */
const QUICK = process.env.PERF_QUICK === "1";
/** Bar counts every engine is measured at. 每个引擎都要测的 K 线数量。 */
const SIZES = QUICK ? [500, 2_000] : [500, 2_000, 10_000, 30_000];
/** Repeats per size: more repeats where the run is cheap. The largest size gets two as well — that is the cell the report leans on hardest, and a single run there would make a 12× memory gap and a 280ms tick look like noise. 每个数量的重复次数：便宜的规模多跑几次。最大规模也给两次 —— 报告最依赖那一格，只跑一次会让 12 倍内存差距和 280ms 的 tick 看起来像噪声。 */
const REPEATS = QUICK
	? { 500: 1, 2000: 1 }
	: { 500: 3, 2000: 3, 10000: 2, 30000: 2 };
const ENGINES = ["t-chart-pro", "k-chart-pro"];
const INDICATOR_MODES = [false, true];
/** The sizes the streaming and interaction scenarios run at. 流式与交互场景使用的规模。 */
const LIVE_SIZES = QUICK ? [2_000] : [2_000, 30_000];
const LIVE_REPEATS = QUICK ? 1 : 3;

const median = (values) => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2
		? sorted[middle]
		: (sorted[middle - 1] + sorted[middle]) / 2;
};

const r2 = (value) => (value === null || value === undefined ? null : Math.round(value * 100) / 100);

function gzipSize(file) {
	return zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length;
}

function sizeOf(relative) {
	const file = path.join(root, relative);
	if (!fs.existsSync(file)) return null;
	return {
		rawKB: r2(fs.statSync(file).size / 1024),
		gzipKB: r2(gzipSize(file) / 1024),
	};
}

// ------------------------------------------------------------------- aggregation

function medianOf(rows, pick) {
	const values = rows
		.map(pick)
		.filter((value) => typeof value === "number" && Number.isFinite(value));
	return values.length ? r2(median(values)) : null;
}

/** Medians over the repeats, so the report quotes one number per cell instead of 36 raw runs. 对重复次数取中位数，使报告每个格子只引一个数字，而不是 36 次原始运行。 */
function summarizeMounts(rows) {
	const cells = [];
	for (const engine of ENGINES) {
		for (const bars of SIZES) {
			for (const indicators of INDICATOR_MODES) {
				const group = rows.filter(
					(row) =>
						row.engine === engine &&
						row.bars === bars &&
						row.indicators === indicators,
				);
				cells.push({
					engine,
					bars,
					indicators,
					runs: group.length,
					engineReadyMs: medianOf(group, (row) => row.engineReadyMs),
					firstPaintMs: medianOf(group, (row) => row.firstPaintMs),
					retainedHeapMB: medianOf(group, (row) => row.retainedHeapMB),
					domNodes: medianOf(group, (row) => row.domNodes),
					canvases: medianOf(group, (row) => row.canvases),
					readySignals: [...new Set(group.map((row) => row.readySignal))].sort(),
				});
			}
		}
	}
	return cells;
}

function summarizeLive(rows) {
	const cells = [];
	for (const engine of ENGINES) {
		for (const bars of LIVE_SIZES) {
			for (const indicators of INDICATOR_MODES) {
				const group = rows.filter(
					(row) =>
						row.engine === engine &&
						row.bars === bars &&
						row.indicators === indicators,
				);
				if (!group.length) continue;
				cells.push({
					engine,
					bars,
					indicators,
					runs: group.length,
					streamAvgDispatchMs: medianOf(group, (row) => row.stream.avgDispatchMs),
					streamWindowMs: medianOf(group, (row) => row.stream.windowMs),
					streamLongTaskMs: medianOf(group, (row) => row.stream.longTaskMs),
					streamLongTasks: medianOf(group, (row) => row.stream.longTasks),
					panAvgSyncMs: medianOf(group, (row) => row.pan.avgSyncMs),
					panLongTaskMs: medianOf(group, (row) => row.pan.longTaskMs),
					panSettleMs: medianOf(group, (row) => row.pan.settleMs),
					zoomAvgSyncMs: medianOf(group, (row) => row.zoom.avgSyncMs),
					zoomLongTaskMs: medianOf(group, (row) => row.zoom.longTaskMs),
					zoomSettleMs: medianOf(group, (row) => row.zoom.settleMs),
				});
			}
		}
	}
	return cells;
}

// ------------------------------------------------------------------ page setup

async function openPerfPage(browser, url) {
	const page = await browser.newPage({ viewport: { width: 1_400, height: 900 } });
	const failures = [];
	page.on("pageerror", (error) => failures.push(String(error)));
	page.on("console", (message) => {
		if (message.type() === "error") failures.push(message.text());
	});

	await page.goto(`${url}perf/index.html`, { waitUntil: "load" });
	await page.waitForFunction(() => window.__perf?.ready === true, null, {
		timeout: 30_000,
	});
	await page.waitForTimeout(500);
	return { page, failures };
}

// ------------------------------------------------------------------- scenarios

async function runMatrix(page) {
	const rows = [];
	for (const engine of ENGINES) {
		for (const bars of SIZES) {
			for (const indicators of INDICATOR_MODES) {
				for (let repeat = 0; repeat < REPEATS[bars]; repeat += 1) {
					const result = await page.evaluate(
						([engine, bars, indicators]) =>
							window.__perf.mount({ engine, bars, indicators }),
						[engine, bars, indicators],
					);
					rows.push(result);
				}
			}
		}
	}
	return rows;
}

async function runLive(page) {
	const rows = [];
	for (const engine of ENGINES) {
		for (const bars of LIVE_SIZES) {
			for (const indicators of INDICATOR_MODES) {
				for (let repeat = 0; repeat < LIVE_REPEATS; repeat += 1) {
					await page.evaluate(
						([engine, bars, indicators]) =>
							window.__perf.mount({ engine, bars, indicators }),
						[engine, bars, indicators],
					);
					const stream = await page.evaluate(() => window.__perf.stream(120));
					const pan = await page.evaluate(() => window.__perf.interact("pan", 120));
					const zoom = await page.evaluate(() => window.__perf.interact("zoom", 120));
					rows.push({ engine, bars, indicators, stream, pan, zoom });
				}
			}
		}
	}
	return rows;
}

// ------------------------------------------------------------------------ main

/**
 * A production bundle of the perf page, then a static server for it.
 *
 * Measuring against `vite dev` would be measuring the wrong thing: React's
 * development build is several times more expensive to render, and `TChartPro`
 * does far more work inside React than `KChartPro` does — so dev mode would
 * systematically flatter the smaller wrapper. The bundle is built with the v9
 * alias the library build uses (`@klinecharts/pro` is compiled against v9 and
 * cannot take the v10 copy) and minified exactly as a consumer would ship it.
 *
 * 先给基准页打一份生产包，再用静态服务把它端出来。
 *
 * 拿 `vite dev` 测就是在测错的东西：React 的开发构建渲染成本高好几倍，而 `TChartPro`
 * 在 React 里做的事远多于 `KChartPro` —— 开发模式会系统性地偏袒更轻的那一层。打包用
 * 的是库构建同款的 v9 别名（`@klinecharts/pro` 按 v9 编译，吃不下 v10 的那份），
 * 并按下游实际发布的样子压缩。
 */
async function buildPerfBundle() {
	const requireFromRoot = createRequire(path.join(root, "noop.cjs"));
	const v9Entry = requireFromRoot.resolve("klinecharts-v9/dist/index.esm.js");
	await build({
		root,
		configFile: false,
		logLevel: "warn",
		plugins: [react()],
		resolve: {
			alias: [
				{ find: /^klinecharts$/, replacement: v9Entry },
				{ find: /^klinecharts-v9$/, replacement: v9Entry },
			],
		},
		build: {
			outDir: "perf/dist",
			emptyOutDir: true,
			rollupOptions: { input: { perf: path.resolve(root, "perf/index.html") } },
		},
	});
}

async function main() {
	console.log("[perf] building the production perf bundle…");
	await buildPerfBundle();
	const previewServer = await preview({
		root,
		configFile: false,
		logLevel: "warn",
		build: { outDir: "perf/dist" },
		preview: { port: 0 },
	});
	const url = previewServer.resolvedUrls?.local?.[0];
	if (!url) throw new Error("preview server exposed no local URL");
	console.log(`[perf] serving ${url}`);

	const browser = await chromium.launch({
		args: [
			// The two flags that make heap numbers trustworthy: `--expose-gc` gives
			// the harness a real collection, `--enable-precise-memory-info` makes
			// `performance.memory` fine-grained instead of quantised.
			// 让堆数字可信的两个开关：`--expose-gc` 给出真正的回收，`
			// --enable-precise-memory-info` 让 `performance.memory` 精细而非量化。
			"--js-flags=--expose-gc",
			"--enable-precise-memory-info",
		],
	});

	try {
		const { page, failures } = await openPerfPage(browser, url);
		const features = await page.evaluate(() => window.__perf.features());
		const frameMs = await page.evaluate(() => window.__perf.frameMs());
		const memoryAvailable = (await page.evaluate(() => window.__perf.heapMB())) !== null;
		console.log(`[perf] features: ${JSON.stringify(features)} frame ${frameMs}ms`);

		// Warm-up: one throwaway mount per engine, so JIT and first-paint costs
		// land outside the measured runs.
		// 预热：每个引擎先跑一次丢弃的挂载，使 JIT 与首帧开销落在测量之外。
		for (const engine of ENGINES) {
			await page.evaluate(
				([engine]) => window.__perf.mount({ engine, bars: 300, indicators: true }),
				[engine],
			);
		}
		await page.evaluate(() => window.__perf.unmount());

		console.log("[perf] mount matrix…");
		const mounts = await runMatrix(page);
		// A fallback means the engine's readiness signal was never observed, so its
		// `firstPaintMs` measured the harness's own wait instead of the engine.
		// 退回固定帧意味着没能观察到引擎的就绪信号，那一格的 `firstPaintMs` 测的是本
		// 测试台自己的等待，而不是引擎。
		const fallbacks = mounts.filter((row) => row.readySignal === "frame-fallback");
		if (fallbacks.length) {
			console.warn(
				`[perf] ${fallbacks.length}/${mounts.length} mount(s) used the frame fallback — treat those firstPaintMs values as unavailable`,
			);
		}
		console.log("[perf] streaming + interaction…");
		const live = await runLive(page);
		await page.evaluate(() => window.__perf.unmount());

		const bundles = {
			tChartPro: sizeOf("dist/t-chart-pro.js"),
			kChartPro: sizeOf("dist/k-chart-pro.js"),
			lightweightCharts: sizeOf(
				"node_modules/lightweight-charts/dist/lightweight-charts.production.mjs",
			),
			klinechartsV9: sizeOf("node_modules/klinecharts-v9/dist/index.esm.js"),
			proCss: sizeOf("dist/ada-charts.css"),
		};

		const results = {
			generatedAt: new Date().toISOString(),
			environment: {
				userAgent: await page.evaluate(() => navigator.userAgent),
				mode: "production bundle, minified, served statically",
				memoryAvailable,
				memoryFlags: "--js-flags=--expose-gc --enable-precise-memory-info",
				frameMs,
			},
			plan: {
				sizes: SIZES,
				repeatsPerSize: REPEATS,
				liveSizes: LIVE_SIZES,
				engines: ENGINES,
			},
			features,
			bundles,
			mountSummary: summarizeMounts(mounts),
			liveSummary: summarizeLive(live),
			mounts,
			live,
			pageErrors: failures,
		};

		fs.writeFileSync(RESULTS, `${JSON.stringify(results, null, "\t")}\n`);
		console.log(`[perf] wrote ${path.relative(root, RESULTS)}`);
		if (failures.length) {
			console.warn(`[perf] ${failures.length} page error(s) captured in results.json`);
		}
	} finally {
		await browser.close();
		await previewServer.close();
	}
}

await main();