import { defineConfig } from 'wxt';
import { resolve } from 'node:path';
import packageJson from './package.json';

/**
 * 「复制商品」业务域只需要这些 host 权限：
 *  - 微信小店 API：把采集到的淘宝商品生成微信小店草稿。
 *  - 淘宝/Tmall：商品详情页采集。
 *  - 淘宝图片 CDN：把商品图片从源地址代理上传到微信小店。
 *
 * 旧版还需要的订单/发货/退款相关 host 已经全部去掉。
 */
const HOST_PERMISSIONS = [
  'https://api.weixin.qq.com/*',
  'https://*.taobao.com/*',
  'https://*.tmall.com/*',
  'https://*.alicdn.com/*',
  'https://*.taobaocdn.com/*',
  'https://*.tbcdn.cn/*',
];

const EXTENSION_PERMISSIONS = [
  'storage',
  'unlimitedStorage',
  'tabs',
  'notifications',
];

function formatBuildTime(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const BUILD_TIME = formatBuildTime();
const WXT_CHROME_DATA_DIR = resolve('wxt-chrome-data');
const WXT_CDP_PORT = 19222;

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  outDir: 'output',
  vite: () => ({
    define: {
      __DIANXIAOQI_BUILD_TIME__: JSON.stringify(BUILD_TIME),
    },
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
    // WXT 默认每次开发启动都可能创建临时浏览器数据目录。
    // 淘宝登录态依赖 Chrome profile cookies，所以开发浏览器必须固定到同一个 user-data-dir。
    // 自动化测试统一连接同一个 Chrome DevTools Protocol 端口：127.0.0.1:19222。
    chromiumPort: WXT_CDP_PORT,
    chromiumArgs: [
      `--user-data-dir=${WXT_CHROME_DATA_DIR}`,
      '--remote-debugging-address=127.0.0.1',
      `--remote-debugging-port=${WXT_CDP_PORT}`,
    ],
  },
  manifest: {
    name: '店小七',
    description: '店小七：把淘宝商品复制到微信小店',
    version: packageJson.version,
    permissions: EXTENSION_PERMISSIONS,
    host_permissions: HOST_PERMISSIONS,
    action: {
      default_title: '打开店小七',
    },
  },
});
