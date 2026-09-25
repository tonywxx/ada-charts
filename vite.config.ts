/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// https://vite.dev/config/
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

/**
 * `@klinecharts/pro` is compiled against the KLineChart v9 runtime (`loadMore`,
 * `applyMoreData`, the v9 `createIndicator` signature, the string enums), while
 * `KChart` and `@klinecharts/extension` need v10. Both versions are installed
 * (`klinecharts` = v10, `klinecharts-v9` = v9); this plugin redirects only the
 * Pro package's own `klinecharts` import to the v9 copy, so the two coexist.
 *
 * `@klinecharts/pro` 基于 KLineChart v9 运行时编译（`loadMore`、`applyMoreData`、v9 的
 * `createIndicator` 签名、字符串枚举），而 `KChart` 与 `@klinecharts/extension` 需要 v10。
 * 两个版本都已安装（`klinecharts` = v10，`klinecharts-v9` = v9）；本插件仅把 Pro 包自身的
 * `klinecharts` 引用重定向到 v9 副本，使两者共存。
 */
function klinechartsProUsesV9(): Plugin {
  // Resolve the v9 copy once, from this project's own dependencies, instead of
  // asking Rollup per-importer: under pnpm's layout a bare `klinecharts-v9` is
  // not reachable from inside `@klinecharts/pro`, so the per-importer form
  // returned `undefined` in `vite build` and Pro's `klinecharts` import fell
  // through to the v10 peer — shipping a bundle that called v9-only methods
  // (`init`, `utils`, `ActionType`) on a v10 chart.
  // 只解析一次 v9 副本，而不是逐个 importer 问 Rollup：pnpm 布局下
  // `@klinecharts/pro` 内部够不到裸的 `klinecharts-v9`，逐 importer 的写法在
  // `vite build` 里返回 `undefined`，Pro 的 `klinecharts` 引用遂落到 v10 peer ——
  // 产物就会拿 v10 图表去调只有 v9 才有的方法（`init`、`utils`、`ActionType`）。
  // The ESM build specifically: resolving the package by name follows its `main`
  // field into `index.cjs`, and an ESM importer cannot take a named binding such as
  // `utils` from that, which is what broke story collection once this file was
  // shared with the vitest project.
  // 特意指 ESM 那份：按包名解析会顺着 `main` 落到 `index.cjs`，而 ESM 引用方拿不到
  // `utils` 这类具名绑定 —— 本文件被 vitest project 共用后，正是这一点打断了 story 收集。
  const v9Id = createRequire(path.join(process.cwd(), 'noop.cjs')).resolve(
    'klinecharts-v9/dist/index.esm.js',
  );
  return {
    name: 'klinecharts-pro-uses-v9',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'klinecharts' && importer && /@klinecharts[\\/]pro[\\/]/.test(importer)) {
        return v9Id;
      }
      return null;
    },
  };
}

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [klinechartsProUsesV9(), react()],
  optimizeDeps: {
    // Serve Pro un-bundled so the plugin's resolveId runs on its imports.
    // 让 Pro 不经预打包，插件的 resolveId 才能作用于它的 import。
    exclude: ['@klinecharts/pro'],
    include: ['klinecharts-v9'],
  },
  test: {
    projects: [{
      // Pure modules under `src` are tested in node: no DOM, no canvas, no
      // charting Engine. Story `play` functions cover the rendered path instead.
      // `src` 下的纯模块在 node 环境测试：不需要 DOM、canvas 和图表引擎。
      // 渲染路径交给 story 的 play 函数覆盖。
      extends: true,
      test: {
        name: 'unit',
        environment: 'node',
        include: ['src/**/*.test.{ts,tsx}']
      }
    }, {
      extends: true,
      plugins: [
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      storybookTest({
        configDir: path.join(dirname, '.storybook')
      })],
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({}),
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }]
  }
});