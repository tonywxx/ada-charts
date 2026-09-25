/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// https://vite.dev/config/
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
  return {
    name: 'klinecharts-pro-uses-v9',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (source === 'klinecharts' && importer && /@klinecharts[\\/]pro[\\/]/.test(importer)) {
        return (await this.resolve('klinecharts-v9', importer, { skipSelf: true }))?.id;
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