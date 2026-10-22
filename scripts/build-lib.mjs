import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
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
 * KLineChart v9 runtime. The `klinechartsProUsesV9()` plugin below redirects
 * **only** Pro's own `klinecharts` import to the v9 copy — the same redirect the
 * dev server and Storybook use — so the v9 runtime is bundled into
 * `adachart-pro.js` while `AdaChart`'s bare `klinecharts` import stays external
 * (resolved to the consumer's v10). Without the plugin the bare import would
 * escape to the consumer's v10 and call v9-only methods (`init`, `utils`,
 * `ActionType`) on a v10 chart — see ADR-0002.
 *
 * 该文件只构建 AdaChart 系列。
 *
 * `AdaChart` 与 `AdaChartPro` 把引擎设为 external：由下游自己解析 `klinecharts`，
 * 而 `@klinecharts/extension` 必须与 `AdaChart` 用同一个 v10 实例。
 *
 * `AdaChartPro` 还引入 `@klinecharts/pro`，它按 KLineChart v9 运行时编译。下面的
 * `klinechartsProUsesV9()` 插件只把 Pro 自己那份 `klinecharts` 引用重定向到 v9 副本
 * —— 与 dev、Storybook 用的是同一个重定向 —— 于是 v9 运行时被打进 `adachart-pro.js`，
 * 而 `AdaChart` 那份裸 `klinecharts` 仍保持 external（由下游解析成 v10）。没有这个插件，
 * 裸引用会落到下游的 v10 上，拿 v10 图表去调只有 v9 才有的方法（见 ADR-0002）。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Redirect only `@klinecharts/pro`'s own `klinecharts` import to the v9 ESM
 * copy. Mirrors the plugin in `vite.config.ts`; see ADR-0002 for why the v9
 * **ESM file** (not the package) must be named, and why the redirect is scoped
 * to Pro's importer rather than applied globally.
 * 只把 `@klinecharts/pro` 自身的 `klinecharts` 引用重定向到 v9 ESM 副本。
 * 与 `vite.config.ts` 里的插件一致；为何必须指 v9 的 ESM 文件、为何只限定 Pro 的
 * importer，见 ADR-0002。
 */
function klinechartsProUsesV9() {
	const v9Id = createRequire(path.join(root, "noop.cjs")).resolve(
		"klinecharts-v9/dist/index.esm.js",
	);
	return {
		name: "klinecharts-pro-uses-v9",
		enforce: "pre",
		resolveId(source, importer) {
			if (
				source === "klinecharts" &&
				importer &&
				/@klinecharts[\\/]pro[\\/]/.test(importer)
			) {
				return v9Id;
			}
			return null;
		},
	};
}


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
		plugins: [klinechartsProUsesV9(), react()],
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
