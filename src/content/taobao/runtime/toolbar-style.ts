export const toolbarCss = `
  :host {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    z-index: 2147483647 !important;
    pointer-events: none !important;
  }
  .dianxiaoqi-shipping-toolbar {
    box-sizing: border-box;
    position: fixed;
    z-index: 2147483647;
    width: 380px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
    overflow: auto;
    padding: 12px;
    border: 1px solid rgba(22, 119, 255, 0.22);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
    color: #1f1f1f;
    font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    pointer-events: auto;
  }
  .dianxiaoqi-shipping-toolbar * {
    box-sizing: border-box;
  }
  .dianxiaoqi-shipping-toolbar--collapsed {
    width: auto;
    min-width: 0;
    padding: 0;
    overflow: visible;
    border-color: #1677ff;
  }
  .dianxiaoqi-shipping-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    cursor: move;
    user-select: none;
    touch-action: none;
  }
  .dianxiaoqi-shipping-title {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .dianxiaoqi-shipping-header strong {
    font-size: 14px;
    line-height: 20px;
  }
  .dianxiaoqi-shipping-status {
    color: #1677ff;
    font-size: 12px;
  }
  .dianxiaoqi-shipping-icon-button {
    width: 28px;
    height: 28px;
    border: 1px solid #d9d9d9;
    border-radius: 4px;
    background: #fff;
    color: #595959;
    cursor: pointer;
    flex: 0 0 auto;
  }
  .dianxiaoqi-shipping-icon-button:hover {
    border-color: #1677ff;
    color: #1677ff;
  }
  .dianxiaoqi-shipping-collapsed-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 12px;
    border: 0;
    border-radius: 6px;
    background: #1677ff;
    color: #fff;
    box-shadow: 0 10px 24px rgba(22, 119, 255, 0.28);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .dianxiaoqi-shipping-grid {
    display: grid;
    gap: 8px;
  }
  .dianxiaoqi-shipping-card {
    min-width: 0;
    padding: 8px;
    border: 1px solid #f0f0f0;
    border-radius: 6px;
    background: #fafafa;
  }
  .dianxiaoqi-shipping-grid label {
    display: block;
    color: #8c8c8c;
    font-size: 12px;
  }
  .dianxiaoqi-shipping-grid p {
    margin: 2px 0;
    display: -webkit-box;
    max-height: 60px;
    overflow: hidden;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    font-weight: 600;
    line-height: 20px;
  }
  .dianxiaoqi-shipping-grid small {
    display: block;
    color: #595959;
    overflow-wrap: anywhere;
    line-height: 18px;
  }
  .dianxiaoqi-shipping-inline-primary {
    width: 100%;
    height: 30px;
    margin-top: 6px;
    border: 1px solid #1677ff;
    border-radius: 4px;
    background: #1677ff;
    color: #fff;
    cursor: pointer;
    font-weight: 600;
  }
  .dianxiaoqi-shipping-inline-primary:hover {
    background: #4096ff;
    border-color: #4096ff;
  }
  .dianxiaoqi-shipping-inline-primary:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }
  .dianxiaoqi-shipping-inline-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin-top: 6px;
  }
  .dianxiaoqi-shipping-inline-actions .dianxiaoqi-shipping-inline-primary {
    margin-top: 0;
  }
  .dianxiaoqi-shipping-inline-actions--single {
    grid-template-columns: 1fr;
  }
  .dianxiaoqi-shipping-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }
  .dianxiaoqi-shipping-actions button {
    height: 28px;
    padding: 0 10px;
    border: 1px solid #d9d9d9;
    border-radius: 4px;
    background: #fff;
    color: #1f1f1f;
    cursor: pointer;
    white-space: nowrap;
  }
  .dianxiaoqi-shipping-actions button:hover {
    border-color: #1677ff;
    color: #1677ff;
  }
  .dianxiaoqi-shipping-notice {
    margin-top: 8px;
    color: #389e0d;
    font-size: 12px;
  }
  .dianxiaoqi-shipping-login-warning {
    margin-top: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    background: #fff1f0;
    border: 1px solid #ffa39e;
    color: #cf1322;
    font-size: 12px;
    line-height: 1.5;
  }
  .dianxiaoqi-shipping-profit-value {
    font-size: 14px;
    color: #1677ff;
  }
  .dianxiaoqi-shipping-profit-value--negative {
    color: #cf1322;
  }
  .dianxiaoqi-purchase-lookup {
    box-sizing: border-box;
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 2147483647;
    width: 360px;
    max-width: calc(100vw - 48px);
    padding: 12px;
    border: 1px solid rgba(250, 140, 22, 0.35);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
    color: #1f1f1f;
    font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    pointer-events: auto;
  }
  .dianxiaoqi-purchase-lookup * {
    box-sizing: border-box;
  }
  .dianxiaoqi-purchase-lookup__header {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }
  .dianxiaoqi-purchase-lookup__header strong {
    font-size: 14px;
  }
  .dianxiaoqi-purchase-lookup__header span {
    color: #fa8c16;
    font-size: 12px;
    white-space: nowrap;
  }
  .dianxiaoqi-purchase-lookup__body {
    padding: 8px;
    border: 1px solid #f0f0f0;
    border-radius: 6px;
    background: #fff7e6;
  }
  .dianxiaoqi-purchase-lookup__body p {
    margin: 0 0 6px;
    font-weight: 600;
  }
  .dianxiaoqi-purchase-lookup__body ul {
    margin: 0;
    padding-left: 18px;
  }
  .dianxiaoqi-purchase-lookup__body li,
  .dianxiaoqi-purchase-lookup small {
    overflow-wrap: anywhere;
  }
  .dianxiaoqi-purchase-lookup__actions {
    margin-top: 8px;
  }
  .dianxiaoqi-purchase-lookup__actions button {
    height: 30px;
    padding: 0 10px;
    border: 1px solid #fa8c16;
    border-radius: 4px;
    background: #fa8c16;
    color: #fff;
    cursor: pointer;
  }
  .dianxiaoqi-purchase-lookup__actions button:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }
  .dianxiaoqi-work-tab-notice {
    box-sizing: border-box;
    position: fixed;
    top: 12px;
    /* 默认靠右上角，避免遮挡页面主体内容（尤其是淘宝登录页的二维码，位于页面中央）。 */
    right: 16px;
    left: auto;
    transform: none;
    width: min(360px, calc(100vw - 32px));
    padding: 8px 10px;
    z-index: 2147483647;
    width: min(520px, calc(100vw - 32px));
    padding: 10px 12px;
    border: 1px solid rgba(22, 119, 255, 0.28);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
    color: #1f1f1f;
    font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    pointer-events: auto;
  }
  /* shipping 与 task 两种角色共用右上角轻量提示条，避免遮挡页面主体内容。 */
  .dianxiaoqi-work-tab-notice__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
  }
  .dianxiaoqi-work-tab-notice strong {
    display: block;
    margin-bottom: 2px;
    color: #1677ff;
    font-size: 14px;
  }
  .dianxiaoqi-work-tab-notice__close {
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid #d9d9d9;
    border-radius: 4px;
    background: #fff;
    color: #595959;
    cursor: pointer;
    flex: 0 0 auto;
    line-height: 20px;
  }
  .dianxiaoqi-work-tab-notice__close:hover {
    border-color: #1677ff;
    color: #1677ff;
  }
  .dianxiaoqi-work-tab-notice span {
    display: block;
    color: #595959;
    overflow-wrap: anywhere;
  }
  .dianxiaoqi-work-tab-notice__footer {
    margin-top: 8px;
  }
  .dianxiaoqi-work-tab-notice__state {
    color: #8c8c8c;
    font-size: 12px;
  }
`;
