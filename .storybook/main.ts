import { createRequire } from "node:module";
import path from "node:path";
import type { Plugin } from "vite";
import type { StorybookConfig } from "@storybook/react-vite";

/**
 * v9's ESM build, resolved from this project's own dependencies. We cannot
 * resolve the file by subpath (`klinecharts-v9/dist/index.esm.js`): the package's
 * `exports` map only exposes the `.` root and `./package.json`, so that subpath
 * is blocked. Instead resolve the exported `package.json`, then take its `module`
 * field and join it to the package directory. Not the package name either: its
 * `main` field points at a CJS file whose named bindings (`utils`, `init`, …) an
 * ESM importer cannot take. Same resolution `vite.config.ts` uses.
 *
 * v9 的 ESM 产物，从本项目自己的依赖里解析。不能按子路径解析
 * （`klinecharts-v9/dist/index.esm.js`）：该包的 `exports` 只暴露 `.` 根与
 * `./package.json`，子路径被挡。改为解析导出的 `package.json`，取其 `module` 字段，
 * 拼到包目录上。也不能按包名解析：`main` 指向 CJS，ESM 取不到具名绑定
 * （`utils`、`init` 等）。与 `vite.config.ts` 同一解析方式。
 */
const requireV9 = createRequire(path.join(process.cwd(), "noop.cjs"));
const klinechartsV9Esm = path.join(
	path.dirname(requireV9.resolve("klinecharts-v9/package.json")),
	requireV9("klinecharts-v9/package.json").module,
);

/**
 * Redirect only `@klinecharts/pro`'s `klinecharts` import to the v9 copy so Pro
 * (v9 runtime) and `AdaChart` / `@klinecharts/extension` (v10) coexist. Mirrors the
 * identical plugin in `vite.config.ts`.
 *
 * 仅把 `@klinecharts/pro` 的 `klinecharts` 引用重定向到 v9 副本，使 Pro（v9 运行时）与
 * `AdaChart` / `@klinecharts/extension`（v10）共存。与 `vite.config.ts` 中的同名插件一致。
 */
function klinechartsProUsesV9(): Plugin {
	return {
		name: "klinecharts-pro-uses-v9",
		enforce: "pre",
		resolveId(source, importer) {
			if (source === "klinecharts" && importer && /@klinecharts[\\/]pro[\\/]/.test(importer)) {
				return klinechartsV9Esm;
			}
			return null;
		},
	};
}

const config: StorybookConfig = {
	stories: ["../src/**/*.stories.@(ts|tsx)"],
	addons: ["@storybook/addon-vitest", "@storybook/addon-docs"],
	framework: {
		name: "@storybook/react-vite",
		options: {},
	},
	async viteFinal(storybookConfig) {
		storybookConfig.plugins ??= [];
		storybookConfig.plugins.push(klinechartsProUsesV9());
		storybookConfig.optimizeDeps = {
			...storybookConfig.optimizeDeps,
			exclude: [
				...(storybookConfig.optimizeDeps?.exclude ?? []),
				"@klinecharts/pro",
			],
			include: [...(storybookConfig.optimizeDeps?.include ?? []), "klinecharts-v9"],
		};
		return storybookConfig;
	},
};

export default config;
