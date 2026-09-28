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
const RESULTS = "/private/tmp/adachart-pro-before-results.json";

/** `PERF_QUICK=1` shrinks the plan to a smoke run while the harness is being worked on. `PERF_QUICK=1` 在调试测试台时把计划缩成一次冒烟运行。 */
const QUICK = false;
/** Bar counts every engine is measured at. 每个引擎都要测的 K 线数量。 */
const SIZES = [30_000];
/** Repeats per size: more repeats where the run is cheap. The largest size gets two as well — that is the cell the report leans on hardest, and a single run there would make a 12× memory gap and a 280ms tick look like noise. 每个数量的重复次数：便宜的规模多跑几次。最大规模也给两次 —— 报告最依赖那一格，只跑一次会让 12 倍内存差距和 280ms 的 tick 看起来像噪声。 */
const REPEATS = { 30000: 2 };
const ENGINES = ["ada-chart-pro"];
const INDICATOR_MODES = [true];
/** The sizes the streaming and interaction scenarios run at. 流式与交互场景使用的规模。 */
const LIVE_SIZES = [30_000];
const LIVE_REPEATS = 1;

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
					const session = await page.context().newCDPSession(page);
					await session.send("Profiler.enable");
					await session.send("Profiler.start", { samplingInterval: 1000 });
					const stream = await page.evaluate(() => window.__perf.stream(120));
					const { profile } = await session.send("Profiler.stop");
					fs.writeFileSync("/private/tmp/adachart-pro-before-profile.json", JSON.stringify(profile));
					await session.detach();
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
 * Redirects `klinecharts` to v9 *only* for the imports made from inside
 * `@klinecharts/pro`, which is compiled against that runtime.
 *
 * The page now carries both versions side by side: `KChartPro` needs v9, while
 * `AdaChartPro` — built on `AdaChart`, i.e. on plain v10 — needs v10, and so does
 * `@klinecharts/extension`. A blanket alias cannot express that split; it was
 * harmless only while nothing on the page imported v10.
 *
 * 只把 `@klinecharts/pro` 发起的 `klinecharts` 引用重定向到 v9 —— 该包就是按那个运行时编译的。
 *
 * 页面上现在同时存在两个版本：`KChartPro` 需要 v9，而构建在 `AdaChart`（也就是纯 v10）之上的
 * `AdaChartPro` 需要 v10，`@klinecharts/extension` 同样需要 v10。全局别名表达不了这种分裂；
 * 它在「页面上没有任何东西引用 v10」时才是无害的。
 */
function klinechartsProUsesV9(v9Entry) {
	return {
		name: "klinecharts-pro-uses-v9",
		enforce: "pre",
		resolveId(source, importer) {
			if (
				source === "klinecharts" &&
				importer &&
				/@klinecharts[\\/]pro[\\/]/.test(importer)
			) {
				return v9Entry;
			}
			return null;
		},
	};
}

/**
 * A production bundle of the perf page, then a static server for it.
 *
 * Measuring against `vite dev` would be measuring the wrong thing: React's
 * development build is several times more expensive to render, and `TChartPro`
 * does far more work inside React than `KChartPro` does — so dev mode would
 * systematically flatter the smaller wrapper. The bundle is built with the same
 * v9/v10 split the library build uses and minified exactly as a consumer would
 * ship it.
 *
 * 先给基准页打一份生产包，再用静态服务把它端出来。
 *
 * 拿 `vite dev` 测就是在测错的东西：React 的开发构建渲染成本高好几倍，而 `TChartPro`
 * 在 React 里做的事远多于 `KChartPro` —— 开发模式会系统性地偏袒更轻的那一层。打包用
 * 的是与库构建相同的 v9/v10 分工，并按下游实际发布的样子压缩。
 */
async function buildPerfBundle() {
	const requireFromRoot = createRequire(path.join(root, "noop.cjs"));
	const v9Entry = requireFromRoot.resolve("klinecharts-v9/dist/index.esm.js");
	await build({
		root,
		configFile: false,
		logLevel: "warn",
		plugins: [klinechartsProUsesV9(v9Entry), react()],
		resolve: {
			alias: [{ find: /^klinecharts-v9$/, replacement: v9Entry }],
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
		const frameMs = await page.evaluate(() => window.__perf.frameMs());
		const memoryAvailable = (await page.evaluate(() => window.__perf.heapMB())) !== null;

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

		// Read *after* the warm-up, not before: `AdaChartPro` is the one engine whose
		// drawing tools come from `@klinecharts/extension`, and those register on
		// first mount. Counting at page load would report its overlay set as the 16
		// built-ins only — an undercount caused by call order rather than by the
		// library, which is exactly the kind of drift the live registries exist to
		// prevent.
		// 在预热**之后**读取，而不是之前：`AdaChartPro` 是唯一一个画线工具来自
		// `@klinecharts/extension` 的引擎，而那些工具在首次挂载时才注册。在页面加载时统计
		// 只会把它的画线集合报成 16 个内置项 —— 这个少报由调用顺序造成，而非库本身，正是
		// 「读实时注册表」本来要防的那种漂移。
		const features = await page.evaluate(() => window.__perf.features());
		console.log(`[perf] features: ${JSON.stringify(features)} frame ${frameMs}ms`);

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
			adaChartPro: sizeOf("dist/adachart-pro.js"),
			adaChartProCss: sizeOf("dist/adachart-pro.css"),
			// Each engine is the other half of its Pro layer's delivered size: the
			// `*Pro` artefacts externalise it, so a consumer resolves it once and
			// shares it with the plain Wrapper. Both copies of klinecharts are listed
			// because the page ships both (ADR-0002), and the v10 file is the one
			// `AdaChartPro` hands to downstream.
			// 每个引擎是自己那层 Pro 的另一半交付体积：`*Pro` 产物把它设为 external，由下游
			// 解析一次并与普通 Wrapper 共用。两份 klinecharts 都列出，因为页面上两份都在
			// （ADR-0002），而 v10 那份才是 `AdaChartPro` 交给下游的。
			lightweightCharts: sizeOf(
				"node_modules/lightweight-charts/dist/lightweight-charts.production.mjs",
			),
			klinechartsV9: sizeOf("node_modules/klinecharts-v9/dist/index.esm.js"),
			klinechartsV10: sizeOf("node_modules/klinecharts/dist/index.esm.js"),
			// `@klinecharts/pro`'s stylesheet, named after the package because it is
			// the only pass that lets Vite pick the name.
			// `@klinecharts/pro` 的样式表；文件名取自包名，因为它是唯一让 Vite 自己命名的一遍。
			kChartProCss: sizeOf("dist/ada-charts.css"),
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