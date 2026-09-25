import { createRequire } from "node:module";
import path from "node:path";
import type { Plugin } from "vite";
import type { StorybookConfig } from "@storybook/react-vite";

/**
 * v9's ESM build, resolved from this project's own dependencies. Not the package
 * name: its `main` field points at a CJS file whose named bindings (`utils`,
 * `init`, …) an ESM importer cannot take. Same file `vite.config.ts` pins.
 *
 * v9 的 ESM 产物，从本项目自己的依赖里解析。不能按包名解析：其 `main` 指向 CJS 文件，
 * ESM 引用方取不到里面的具名绑定（`utils`、`init` 等）。与 `vite.config.ts` 钉住同一文件。
 */
const klinechartsV9Esm = createRequire(path.join(process.cwd(), "noop.cjs")).resolve(
	"klinecharts-v9/dist/index.esm.js",
);

/**
 * Redirect only `@klinecharts/pro`'s `klinecharts` import to the v9 copy so Pro
 * (v9 runtime) and `KChart` / `@klinecharts/extension` (v10) coexist. Mirrors the
 * identical plugin in `vite.config.ts`.
 *
 * 仅把 `@klinecharts/pro` 的 `klinecharts` 引用重定向到 v9 副本，使 Pro（v9 运行时）与
 * `KChart` / `@klinecharts/extension`（v10）共存。与 `vite.config.ts` 中的同名插件一致。
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
