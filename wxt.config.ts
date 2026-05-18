import { defineConfig } from 'wxt';
import packageJson from './package.json';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '微店管家',
    description: '微信小店多账户商品提审、订单管理和违规词检测工具',
    version: packageJson.version,
    permissions: ['storage', 'alarms', 'tabs'],
    host_permissions: ['https://api.weixin.qq.com/*'],
    action: {
      default_title: '打开微店管家',
    },
  },
});
