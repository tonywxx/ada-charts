import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

/**
 * Two library passes, because the two groups of Wrappers cannot share one
 * dependency policy.
 *
 * `TChart` and `AdaChart` externalise their engines: a consumer resolves
 * `lightweight-charts` and `klinecharts` itself, and `@klinecharts/extension`
 * needs the same v10 instance as `AdaChart`.
 *
 * `KChartPro` is the exception. `@klinecharts/pro` is compiled against the v9
 * runtime, and ADR-0002's `resolveId` redirect does **not** survive
 * `vite build` — the first attempt at this file produced a bundle that linked
 * Pro's `init` / `utils` / `ActionType` to bare `klinecharts`, i.e. to the
 * consumer's v10, which is the missing-method failure moved downstream. So the
 * Pro pass externalises nothing but React and pins the `klinecharts` specifier
 * to the v9 file with an alias, which a bundler cannot lose.
 *
 * 两遍库构建，因为两组 Wrapper 没法共用同一套依赖策略。
 *
 * `TChart` 与 `AdaChart` 把引擎设为 external：由下游自己解析 `lightweight-charts` 与
 * `klinecharts`，而 `@klinecharts/extension` 必须与 `AdaChart` 用同一个 v10 实例。
 *
 * `KChartPro` 是例外。`@klinecharts/pro` 按 v9 运行时编译，而 ADR-0002 里的
 * `resolveId` 重定向**撑不过** `vite build` —— 本文件的第一版产物就把 Pro 的
 * `init` / `utils` / `ActionType` 链到了裸 `klinecharts`，也就是下游的 v10，等于把
 * 缺方法故障搬到下游。因此 Pro 这一遍除 React 外什么都不外部化，并用 alias 把
 * `klinecharts` 这个引用钉到 v9 文件上 —— 别名是打包器弄不丢的。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromRoot = createRequire(path.join(root, "noop.cjs"));

/** v9's ESM entry, resolved once so both passes and Pro itself share one file. */
const v9Entry = requireFromRoot.resolve("klinecharts-v9/dist/index.esm.js");

const ENTRIES = {
	"t-chart": "src/components/lightweight-charts/TChart.tsx",
	"adachart": "src/components/adachart/AdaChart.tsx",
};

const PRO_ENTRY = { "k-chart-pro": "src/components/klinecharts-pro/KChartPro.tsx" };

const TPRO_ENTRY = {
	"t-chart-pro": "src/components/lightweight-charts-pro/TChartPro.tsx",
};

const ADA_PRO_ENTRY = {
	"adachart-pro": "src/components/adachart-pro/AdaChartPro.tsx",
};

const isReact = (id) => id === "react" || id === "react-dom" || /^react(-dom)\//.test(id);
const isEngine = (id) => id === "lightweight-charts" || id === "klinecharts";

/**
 * @param {Record<string, string>} entry
 * @param {{ external: (id: string) => boolean, alias?: boolean, first?: boolean, cssFileName?: string }} policy
 */
async function libPass(entry, { external, alias, first, cssFileName }) {
	await build({
		root,
		logLevel: "info",
		plugins: [react()],
		resolve: alias
			? {
				alias: [
					{ find: /^klinecharts$/, replacement: v9Entry },
					{ find: /^klinecharts-v9$/, replacement: v9Entry },
				],
			}
			: undefined,
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
// `@klinecharts/pro` is compiled against v9 and cannot survive a bare
// `klinecharts` specifier, so it links nothing but React.
// `@klinecharts/pro` 按 v9 编译，撑不住裸 `klinecharts` 引用，因此除 React 外什么都不外链。
await libPass(PRO_ENTRY, { external: isReact, alias: true });
// `TChartPro` bundles `lightweight-charts-drawing`, but must keep the chart
// library itself external: the drawings attach to the very `IChartApi` that
// `TChart` created, and a second copy of the library could not attach to it.
// `TChartPro` 把 `lightweight-charts-drawing` 打包进来，但图表库本身必须外链：画线要挂在
// `TChart` 建的那个 `IChartApi` 上，多带一份库就挂不上去。
await libPass(TPRO_ENTRY, { external: (id) => isReact(id) || id === "lightweight-charts" });
// `AdaChartPro` is built on `AdaChart`, i.e. on plain v10 plus React, so it
// follows the entry pass's policy — with one caveat: it ships its own
// stylesheet for the toolbar and watermark, which must not land on the name
// `KChartPro`'s pass already used.
// `AdaChartPro` 构建在 `AdaChart` 之上，也就是纯 v10 加 React，因此沿用入口那一遍的
// 策略 —— 只有一点不同：它自带工具栏与水印的样式表，不能落在 `KChartPro` 那一遍
// 已经用掉的文件名上。
await libPass(ADA_PRO_ENTRY, {
	external: (id) => isReact(id) || isEngine(id),
	cssFileName: "adachart-pro",
});
