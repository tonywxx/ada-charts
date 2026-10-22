import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

/**
 * Library pass for the AdaChart family.
 *
 * `AdaChart` and `AdaChartPro` externalise their engine: a consumer resolves
 * `klinecharts` itself, and `@klinecharts/extension` needs the same v10 instance
 * as `AdaChart`. There is exactly one engine in the published bundle.
 *
 * The klinecharts v9 runtime is not here at all. The Pro layer of the v9
 * generation — the one this repo's Pro layer was ported from — is a design
 * reference, not a runtime import: `AdaChartPro` reimplements that layer on top
 * of v10, so nothing pulls in a second copy of klinecharts and there is no v9
 * engine to keep apart. See ADR-0002 for what that arrangement used to cost.
 *
 * 该文件只构建 AdaChart 系列。
 *
 * `AdaChart` 与 `AdaChartPro` 把引擎设为 external：由下游自己解析 `klinecharts`，
 * 而 `@klinecharts/extension` 必须与 `AdaChart` 用同一个 v10 实例。发布的产物里
 * 只有这一个引擎。
 *
 * klinecharts v9 运行时完全不在这里。v9 那一代的 Pro 层（本仓库 Pro 层的移植来源）
 * 是设计参照，不是运行时引入：`AdaChartPro` 在 v10 之上重新实现了那一层，因此这里不会
 * 引入第二份 klinecharts，也没有需要分开的 v9 引擎。ADR-0002 记录了这种安排过去的代价。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ENTRIES = {
	"adachart": "src/components/adachart/AdaChart.tsx",
	// Cross-window linkage over several charts. It knows the engine, so it ships
	// next to the component rather than being re-derived by every application.
	// 多图之间的跨窗口联动。它懂引擎，因此与组件一起发布，而不是让每个应用各自重写一遍。
	"chart-link": "src/chart-link.ts",
};

const ADA_PRO_ENTRY = {
	"adachart-pro": "src/components/adachart-pro/AdaChartPro.tsx",
};

const isReact = (id) => id === "react" || id === "react-dom" || /^react(-dom)?\//.test(id);
const isEngine = (id) => id === "klinecharts";

/**
 * @param {Record<string, string>} entry
 * @param {{ external: (id: string) => boolean, first?: boolean, cssFileName?: string }} policy
 */
async function libPass(entry, { external, first, cssFileName }) {
	await build({
		root,
		logLevel: "info",
		plugins: [react()],
		build: {
			// Only the first pass clears `dist`; the others add to it.
			// 只有第一遍清空 `dist`；其余各遍在其上追加。
			emptyOutDir: Boolean(first),
			lib: {
				entry: Object.fromEntries(
					Object.entries(entry).map(([name, file]) => [name, path.resolve(root, file)]),
				),
				formats: ["es"],
				fileName: (_format, entryName) => `${entryName}.js`,
				// Vite names a lib pass's CSS after package.json's `name` unless told
				// otherwise, so a later pass with its own stylesheet would silently
				// overwrite the earlier pass's `ada-charts.css`.
				// 除非另行指定，Vite 会用 package.json 的 `name` 命名某一遍的 CSS，因此后面
				// 带着自己样式表的那一遍会静默覆盖前一遍的 `ada-charts.css`。
				...(cssFileName ? { cssFileName } : {}),
			},
			rollupOptions: { external },
		},
	});
}

await libPass(ENTRIES, { external: (id) => isReact(id) || isEngine(id), first: true });
// `AdaChartPro` is built on `AdaChart`, i.e. on plain v10 plus React, so it
// follows the entry pass's policy — with one caveat: it ships its own
// stylesheet for the toolbar and watermark.
// `AdaChartPro` 构建在 `AdaChart` 之上，也就是纯 v10 加 React，因此沿用入口那一遍的
// 策略 —— 只有一点不同：它自带工具栏与水印的样式表。
await libPass(ADA_PRO_ENTRY, {
	external: (id) => isReact(id) || isEngine(id),
	cssFileName: "adachart-pro",
});
