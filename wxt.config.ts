import { defineConfig } from 'wxt';
import { resolve } from 'node:path';
import packageJson from './package.json';

const HOST_PERMISSIONS = [
  // 微信小店 API：商品提审、订单、违规检测等后台能力。
  'https://api.weixin.qq.com/*',
  // 淘宝/Tmall：订单去发货、采购单读取和退款申请时注入工作页工具栏。
  'https://*.taobao.com/*',
  'https://*.tmall.com/*',
  // 淘宝商品图片 CDN：上货时先由插件校验可用图片候选 URL，再交给微信小店图片上传接口处理。
  'https://*.alicdn.com/*',
  'https://*.taobaocdn.com/*',
  'https://*.tbcdn.cn/*',
];

const EXTENSION_PERMISSIONS = [
  'storage',
  'unlimitedStorage',
  'alarms',
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
      __WISHOP_BUILD_TIME__: JSON.stringify(BUILD_TIME),
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
      // web-ext-run 会默认追加 --remote-debugging-pipe；这里显式追加端口，确保外部测试工具能连接。
      `--remote-debugging-port=${WXT_CDP_PORT}`,
    ],
  },
  manifest: {
    name: '微店管家',
    description: '微信小店多账户商品提审、订单管理和违规词检测工具',
    version: packageJson.version,
    permissions: EXTENSION_PERMISSIONS,
    host_permissions: HOST_PERMISSIONS,
    action: {
      default_title: '打开微店管家',
    },
  },
});
