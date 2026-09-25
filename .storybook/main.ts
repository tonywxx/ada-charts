import type { Plugin } from "vite";
import type { StorybookConfig } from "@storybook/react-vite";

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
		async resolveId(source, importer) {
			if (source === "klinecharts" && importer && /@klinecharts[\\/]pro[\\/]/.test(importer)) {
				return (await this.resolve("klinecharts-v9", importer, { skipSelf: true }))?.id;
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
