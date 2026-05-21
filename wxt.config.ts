import { defineConfig } from 'wxt';
import packageJson from './package.json';

const HOST_PERMISSIONS = [
  // 微信小店 API：商品提审、订单、违规检测等后台能力。
  'https://api.weixin.qq.com/*',
  // 淘宝/Tmall：订单去发货时注入发货助手工具栏。
  'https://*.taobao.com/*',
  'https://*.tmall.com/*',
];

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDir: 'output',
  vite: () => ({
    build: {
      sourcemap: false,
      minify: 'esbuild',
      // Ant Design based extension dashboards naturally include a larger UI
      // vendor bundle. Page-level lazy loading controls the real initial load;
      // this limit keeps WXT from warning on expected vendor chunk sizes.
      chunkSizeWarningLimit: 1000,
    },
  }),
  zip: {
    exclude: ['**/*.map'],
  },
  webExt: {
    chromiumProfile: '.wxt/chrome-profile',
    keepProfileChanges: true,
    chromiumArgs: ['--user-data-dir=./wxt-chrome-data'],
  },
  manifest: {
    name: '微店管家',
    description: '微信小店多账户商品提审、订单管理和违规词检测工具',
    version: packageJson.version,
    permissions: ['storage', 'alarms', 'tabs', 'notifications'],
    host_permissions: HOST_PERMISSIONS,
    action: {
      default_title: '打开微店管家',
    },
  },
});
