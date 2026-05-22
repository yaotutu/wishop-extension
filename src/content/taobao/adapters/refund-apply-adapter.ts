import type { TaobaoRefundPrepareSnapshot } from '../../../shared/types';
import { normalizeText, valueAfterLabel } from '../dom/text';

const REFUND_REASON_LABEL = '退款原因';
const REFUND_AMOUNT_LABELS = ['退款金额', '退款金额：'];

function textContent(root?: ParentNode | Element | null): string {
  return normalizeText(root?.textContent || '');
}

function visibleText(root?: HTMLElement | null): string {
  return normalizeText(root?.innerText || root?.textContent || '');
}

function refundApplyUrlOrderId(): string {
  return new URL(location.href).searchParams.get('bizOrderId')?.trim() || '';
}

function findRefundReasonSelect(): HTMLElement | null {
  const selects = Array.from(document.querySelectorAll<HTMLElement>('.mod-select-pc'));
  return selects.find(select => textContent(select.querySelector('.select-title')).includes(REFUND_REASON_LABEL)) || null;
}

function findReasonOption(root: HTMLElement, reason: string): HTMLElement | null {
  return Array.from(root.querySelectorAll<HTMLElement>('.options-item'))
    .find(option => visibleText(option) === reason) || null;
}

function findSubmitButton(): HTMLElement | null {
  const submitContainer = document.querySelector<HTMLElement>('#submitButtonContainer_1');
  const submitFromContainer = submitContainer?.querySelector<HTMLElement>('.button-item');
  if (submitFromContainer && visibleText(submitFromContainer).includes('提交')) return submitFromContainer;

  return Array.from(document.querySelectorAll<HTMLElement>('.button-item, [role="button"], button'))
    .find(element => visibleText(element) === '提交') || null;
}

function readRefundAmountText(): string {
  const input = document.querySelector<HTMLInputElement>('#applyRefundFeeInput_1-input');
  if (input?.value) return input.value.trim();

  const text = textContent(document.body);
  return valueAfterLabel(text, REFUND_AMOUNT_LABELS);
}

export function isTaobaoRefundApplyPage(): boolean {
  return location.hostname === 'refund2.taobao.com'
    && location.pathname.includes('/dispute/apply.htm');
}

export function hasTaobaoRefundShipmentSignals(): boolean {
  const text = textContent(document.body);
  return ['货物状态', '已收到货', '退货退款', '退货物流', '退货地址', '物流公司', '快递单号', '运单号']
    .some(keyword => text.includes(keyword));
}

export function readTaobaoRefundPrepareSnapshot(expectedOrderId: string): TaobaoRefundPrepareSnapshot {
  const reasonRoot = findRefundReasonSelect();
  const submitButton = findSubmitButton();
  return {
    platformOrderId: expectedOrderId || refundApplyUrlOrderId(),
    selectedReason: visibleText(reasonRoot?.querySelector<HTMLElement>('.selected-wrap')) || '',
    refundAmountText: readRefundAmountText(),
    submitReady: !!submitButton && !submitButton.classList.contains('disabled'),
    url: location.href,
  };
}

export function prepareTaobaoRefundApplyPage(reason: string, expectedOrderId: string): TaobaoRefundPrepareSnapshot {
  if (!isTaobaoRefundApplyPage()) {
    throw new Error('当前页面不是淘宝退款申请页');
  }

  const urlOrderId = refundApplyUrlOrderId();
  if (expectedOrderId && urlOrderId && expectedOrderId !== urlOrderId) {
    throw new Error(`淘宝退款页订单号不匹配：当前 ${urlOrderId}，期望 ${expectedOrderId}`);
  }

  const reasonRoot = findRefundReasonSelect();
  if (!reasonRoot) throw new Error('未找到淘宝退款原因下拉框');

  const selectedWrap = reasonRoot.querySelector<HTMLElement>('.selected-wrap');
  const selectedReason = visibleText(selectedWrap);
  if (selectedReason !== reason) {
    const option = findReasonOption(reasonRoot, reason);
    if (!option) throw new Error(`退款原因列表中没有“${reason}”`);
    selectedWrap?.click();
    option.click();
  }

  return readTaobaoRefundPrepareSnapshot(expectedOrderId);
}

export function submitTaobaoRefundApplyPage(expectedOrderId: string): TaobaoRefundPrepareSnapshot {
  const snapshot = readTaobaoRefundPrepareSnapshot(expectedOrderId);
  if (!snapshot.submitReady) {
    throw new Error('淘宝提交按钮尚未就绪');
  }
  const submitButton = findSubmitButton();
  if (!submitButton) {
    throw new Error('未找到淘宝退款提交按钮');
  }
  submitButton.click();
  return {
    ...snapshot,
    autoSubmitted: true,
  };
}
