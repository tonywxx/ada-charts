import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

/**
 * Library pass for the AdaChart family.
 *
 * `AdaChart` and `AdaChartPro` externalise their engines: a consumer resolves
 * `klinecharts` itself, and `@klinecharts/extension` needs the same v10 instance
 * as `AdaChart`.
 *
 * `AdaChartPro` also pulls in `@klinecharts/pro`, which is compiled against the
 * KLineChart v9 runtime. The `klinechartsProUsesV9` plugin in `vite.config.ts`
 * redirects Pro's own `klinecharts` import to the v9 copy, so the dev server,
 * Storybook and the browser test project all resolve it correctly. The library
 * build below does not need the alias: Pro is not externalised and keeps its v9
 * reference intact.
 *
 * 该文件只构建 AdaChart 系列。
 *
 * `AdaChart` 与 `AdaChartPro` 把引擎设为 external：由下游自己解析 `klinecharts`，
 * 而 `@klinecharts/extension` 必须与 `AdaChart` 用同一个 v10 实例。
 *
 * `AdaChartPro` 还引入 `@klinecharts/pro`，它按 KLineChart v9 运行时编译。
 * `vite.config.ts` 里的 `klinechartsProUsesV9` 插件把 Pro 自己的 `klinecharts`
 * 引用重定向到 v9 副本，使 dev、Storybook 与浏览器测试 project 都能正确解析。
 * 下面的库构建不需要 alias：Pro 不外链，其 v9 引用保持完整。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ENTRIES = {
	"adachart": "src/components/adachart/AdaChart.tsx",
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
