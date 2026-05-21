import type { OrderAddressInfo } from '../../../shared/types';
import { formatOrderAddressLine, getOrderPhoneDisplay } from '../../../shared/address-format';
import { normalizeText } from '../dom/text';
import { detectTaobaoPageType } from './page-adapter';

export interface CheckoutAddressFillResult {
  filledFields: string[];
  warnings: string[];
}

interface CheckoutAddressFillRequest {
  source: 'wishop-extension';
  type: 'wishop:checkoutAddress:fill';
  requestId: string;
  address: OrderAddressInfo;
}

interface CheckoutAddressPingRequest {
  source: 'wishop-extension';
  type: 'wishop:checkoutAddress:ping';
  requestId: string;
}

interface CheckoutAddressFillResponse {
  source: 'wishop-extension';
  type: 'wishop:checkoutAddress:filled';
  requestId: string;
  result: CheckoutAddressFillResult;
}

interface CheckoutAddressReadyResponse {
  source: 'wishop-extension';
  type: 'wishop:checkoutAddress:ready';
  requestId?: string;
}

type FillableElement = HTMLInputElement | HTMLTextAreaElement;

const EDITOR_OPEN_TEXTS = ['使用新地址', '新增地址', '添加地址', '添加收货地址', '新建地址'];
const ADDRESS_FRAME_SELECTOR = 'iframe[src*="/member/fresh/deliver_address_frame.htm"]';
const ADDRESS_FIELD_SELECTOR = '.cndzk-entrance-division-header-click';
const ADDRESS_OPTION_SELECTOR = '.cndzk-entrance-division-box-content-tag';
const PLACEHOLDER_CITY_NAMES = new Set(['市辖区', '县', '省直辖县级行政区划']);
const NO_STREET_OPTION_TEXTS = ['暂不选择', '暂不选择街道', '不选择', '无街道', '其他'];

export interface NormalizedCheckoutAddress {
  divisions: Array<{ label: string; value: string }>;
  detail: string;
  name: string;
  phone: string;
  warnings: string[];
}

function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

function setNativeValue(element: FillableElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

function clickAddressEditorTrigger(): boolean {
  const target = Array.from(document.querySelectorAll<HTMLElement>('button, a, span, div, [role="button"]'))
    .filter(isVisible)
    .find(element => {
      const text = normalizeText(element.textContent || '');
      return EDITOR_OPEN_TEXTS.some(candidate => text === candidate);
    });
  target?.click();
  return Boolean(target);
}

async function waitForAddressFrame(): Promise<HTMLIFrameElement | null> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const frame = document.querySelector<HTMLIFrameElement>(ADDRESS_FRAME_SELECTOR);
    if (frame?.contentWindow) return frame;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  return null;
}

export function isTaobaoAddressFramePage(): boolean {
  return location.hostname.endsWith('.taobao.com') && location.pathname.includes('/member/fresh/deliver_address_frame.htm');
}

function normalizeAddressPart(value?: string): string {
  return normalizeText(value || '').replace(/\s+/g, '');
}

function isPlaceholderCityName(value?: string): boolean {
  return PLACEHOLDER_CITY_NAMES.has(normalizeAddressPart(value));
}

function addressCandidates(value?: string): string[] {
  const normalized = normalizeAddressPart(value);
  if (!normalized) return [];
  if (normalized === '暂不选择') return NO_STREET_OPTION_TEXTS;
  const suffixless = normalized
    .replace(/(维吾尔自治区|壮族自治区|回族自治区|自治区|特别行政区|自治州|地区|林区|新区|省|市|区|县|镇|乡|街道|盟)$/u, '');
  const citySuffix = normalized.endsWith('市') ? normalized.slice(0, -1) : '';
  return Array.from(new Set([normalized, suffixless, citySuffix].filter(Boolean)));
}

function inferStreetName(address: OrderAddressInfo): string {
  const text = `${address.county_name || ''}${address.detail_info || ''}${address.house_number || ''}`;
  const match = text.match(/([\u4e00-\u9fa5A-Za-z0-9]+?(?:街道|镇|乡|苏木|民族乡|开发区|工业园区|园区|农场))/u);
  return match?.[1] || '';
}

function stripLeadingDivisionNames(text: string, divisions: string[]): string {
  let next = normalizeText(text);
  for (let attempt = 0; attempt < 4; attempt++) {
    const previous = next;
    for (const division of divisions) {
      const normalized = normalizeAddressPart(division);
      if (!normalized) continue;
      const candidates = addressCandidates(normalized).sort((a, b) => b.length - a.length);
      const matched = candidates.find(candidate => next.startsWith(candidate));
      if (matched) {
        next = next.slice(matched.length).trim();
        break;
      }
    }
    if (next === previous) break;
  }
  return next || normalizeText(text);
}

function normalizeCheckoutContact(address: OrderAddressInfo): { name: string; phone: string } {
  const phoneDisplay = getOrderPhoneDisplay(address);
  const virtual = address.virtual_number_info;
  const extension = virtual?.extension?.trim()
    || phoneDisplay.value.match(/\s*转\s*([^\s]+)\s*$/u)?.[1]
    || '';
  const phone = virtual?.virtual_number?.trim()
    || phoneDisplay.value.replace(/\s*转\s*[^\s]+/u, '').trim();
  const name = extension
    ? `${address.user_name || ''} [拨打后输入分机号${extension}]`.trim()
    : address.user_name || '';

  return { name, phone };
}

export function normalizeCheckoutAddress(address: OrderAddressInfo): NormalizedCheckoutAddress {
  const warnings: string[] = [];
  const province = normalizeAddressPart(address.province_name);
  const city = normalizeAddressPart(address.city_name);
  const county = normalizeAddressPart(address.county_name);
  const street = normalizeAddressPart(inferStreetName(address));

  const divisions: Array<{ label: string; value: string }> = [];
  if (province) divisions.push({ label: '省', value: province });

  if (city && !isPlaceholderCityName(city)) {
    divisions.push({ label: '市', value: city });
    if (county && county !== city) {
      divisions.push({ label: '区县', value: county });
    }
  } else if (county) {
    divisions.push({ label: '市/区县', value: county });
  } else if (city) {
    warnings.push(`已忽略微信地址占位城市：${city}`);
  }

  if (street) {
    const lastDivision = divisions[divisions.length - 1]?.value;
    if (street !== lastDivision) {
      divisions.push({ label: '街道', value: street });
    }
  } else {
    divisions.push({ label: '街道', value: '暂不选择' });
  }

  const rawDetail = `${address.detail_info || ''}${address.house_number || ''}`;
  const detail = stripLeadingDivisionNames(rawDetail || formatOrderAddressLine(address), divisions.map(item => item.value));
  const contact = normalizeCheckoutContact(address);

  return {
    divisions,
    detail,
    name: contact.name,
    phone: contact.phone,
    warnings,
  };
}

async function waitForOption(candidates: string[]): Promise<HTMLElement | null> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const option = Array.from(document.querySelectorAll<HTMLElement>(ADDRESS_OPTION_SELECTOR))
      .filter(isVisible)
      .find(element => candidates.some(candidate => normalizeAddressPart(element.textContent) === candidate));
    if (option) return option;
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  return null;
}

async function selectDivision(label: string, value: string, result: CheckoutAddressFillResult): Promise<boolean> {
  const candidates = addressCandidates(value);
  if (candidates.length === 0) {
    result.warnings.push(`缺少${label}`);
    return false;
  }

  const option = await waitForOption(candidates);
  if (!option) {
    result.warnings.push(`未找到${label}：${value}`);
    return false;
  }

  option.click();
  result.filledFields.push(label);
  await new Promise(resolve => setTimeout(resolve, 220));
  return true;
}

async function fillAddressFrame(address: OrderAddressInfo): Promise<CheckoutAddressFillResult> {
  const normalized = normalizeCheckoutAddress(address);
  const result: CheckoutAddressFillResult = { filledFields: [], warnings: [...normalized.warnings] };
  const trigger = document.querySelector<HTMLElement>(ADDRESS_FIELD_SELECTOR);
  if (!trigger) {
    result.warnings.push('未找到省市区街道选择器');
  } else {
    trigger.click();
    await new Promise(resolve => setTimeout(resolve, 180));
    for (const division of normalized.divisions) {
      await selectDivision(division.label, division.value, result);
    }
  }

  const detail = document.querySelector<HTMLTextAreaElement>('.cndzk-entrance-associate-area-textarea');
  if (detail) {
    setNativeValue(detail, normalized.detail);
    result.filledFields.push('详细地址');
  } else {
    result.warnings.push('未找到详细地址输入框');
  }

  const fullName = document.querySelector<HTMLInputElement>('input#fullName[name="fullName"]');
  if (fullName) {
    setNativeValue(fullName, normalized.name);
    result.filledFields.push('收货人');
  } else {
    result.warnings.push('未找到收货人输入框');
  }

  const mobile = document.querySelector<HTMLInputElement>('input#mobile[name="mobile"]');
  if (mobile) {
    setNativeValue(mobile, normalized.phone);
    result.filledFields.push('手机号');
  } else {
    result.warnings.push('未找到手机号输入框');
  }

  return result;
}

export function installCheckoutAddressFrameBridge(): void {
  if (!isTaobaoAddressFramePage()) return;
  document.documentElement.setAttribute('data-wishop-checkout-address-bridge', 'ready');

  const postReady = (requestId?: string): void => {
    const response: CheckoutAddressReadyResponse = {
      source: 'wishop-extension',
      type: 'wishop:checkoutAddress:ready',
      requestId,
    };
    window.parent.postMessage(response, '*');
  };

  window.addEventListener('message', event => {
    const data = event.data as Partial<CheckoutAddressFillRequest | CheckoutAddressPingRequest>;
    if (data?.source !== 'wishop-extension' || !data.requestId) return;
    if (data.type === 'wishop:checkoutAddress:ping') {
      postReady(data.requestId);
      return;
    }
    if (data.type !== 'wishop:checkoutAddress:fill' || !('address' in data) || !data.address) return;
    const requestId = data.requestId;
    void fillAddressFrame(data.address).then(result => {
      const response: CheckoutAddressFillResponse = {
        source: 'wishop-extension',
        type: 'wishop:checkoutAddress:filled',
        requestId,
        result,
      };
      window.parent.postMessage(response, '*');
    });
  });
  postReady();
}

export function isTaobaoCheckoutPage(): boolean {
  return detectTaobaoPageType() === 'checkout';
}

export async function fillTaobaoCheckoutAddress(address: OrderAddressInfo): Promise<CheckoutAddressFillResult> {
  if (!isTaobaoCheckoutPage()) {
    return { filledFields: [], warnings: ['当前不是淘宝下单页'] };
  }

  clickAddressEditorTrigger();
  const frame = await waitForAddressFrame();
  if (!frame?.contentWindow) {
    return { filledFields: [], warnings: ['未找到新建地址表单'] };
  }
  const frameWindow = frame.contentWindow;

  const bridgeReady = await waitForAddressFrameBridge(frameWindow);
  if (!bridgeReady) {
    return { filledFields: [], warnings: ['地址 iframe 未响应：地址框已打开，但扩展脚本未注入到淘宝地址 iframe'] };
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const message: CheckoutAddressFillRequest = {
    source: 'wishop-extension',
    type: 'wishop:checkoutAddress:fill',
    requestId,
    address,
  };

  return new Promise(resolve => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      resolve({ filledFields: [], warnings: ['地址 iframe 未响应：请在扩展管理页重新加载微店管家，并重新打开淘宝下单页'] });
    }, 5000);

    function handleMessage(event: MessageEvent): void {
      const data = event.data as Partial<CheckoutAddressFillResponse>;
      if (data?.source !== 'wishop-extension' || data.type !== 'wishop:checkoutAddress:filled' || data.requestId !== requestId || !data.result) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', handleMessage);
      resolve(data.result);
    }

    window.addEventListener('message', handleMessage);
    frameWindow.postMessage(message, '*');
  });
}

function waitForAddressFrameBridge(frameWindow: Window): Promise<boolean> {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const message: CheckoutAddressPingRequest = {
    source: 'wishop-extension',
    type: 'wishop:checkoutAddress:ping',
    requestId,
  };

  return new Promise(resolve => {
    const interval = window.setInterval(() => {
      frameWindow.postMessage(message, '*');
    }, 250);
    const timer = window.setTimeout(() => {
      window.clearInterval(interval);
      window.removeEventListener('message', handleMessage);
      resolve(false);
    }, 8000);

    function handleMessage(event: MessageEvent): void {
      const data = event.data as Partial<CheckoutAddressReadyResponse>;
      if (data?.source !== 'wishop-extension' || data.type !== 'wishop:checkoutAddress:ready') return;
      if (data.requestId && data.requestId !== requestId) return;
      window.clearInterval(interval);
      window.clearTimeout(timer);
      window.removeEventListener('message', handleMessage);
      resolve(true);
    }

    window.addEventListener('message', handleMessage);
    frameWindow.postMessage(message, '*');
  });
}
