import type { OrderAddressInfo } from './types';

export interface OrderPhoneDisplay {
  label: '电话' | '虚拟号码';
  value: string;
  isVirtual: boolean;
}

/**
 * WeChat returns virtual phone data outside address_info. After the background
 * service merges it into OrderAddressInfo, every UI should prefer the virtual
 * number because it is the actionable shipping contact for privacy orders.
 */
export function getOrderPhoneDisplay(addr?: OrderAddressInfo): OrderPhoneDisplay {
  const virtual = addr?.virtual_number_info;
  if (virtual?.virtual_number?.trim()) {
    const extension = virtual.extension?.trim();
    return {
      label: '虚拟号码',
      value: extension ? `${virtual.virtual_number} 转 ${extension}` : virtual.virtual_number,
      isVirtual: true,
    };
  }

  const phone = addr?.purchaser_tel_number?.trim()
    || addr?.tel_number?.trim()
    || addr?.virtual_order_tel_number?.trim()
    || '';
  return { label: '电话', value: phone, isVirtual: false };
}

export function formatOrderPhoneInline(addr?: OrderAddressInfo): string {
  const phone = getOrderPhoneDisplay(addr);
  return phone.value ? `${phone.label}：${phone.value}` : `${phone.label}：-`;
}

export function formatOrderAddressLine(addr?: OrderAddressInfo): string {
  if (!addr) return '';
  return `${addr.province_name || ''}${addr.city_name || ''}${addr.county_name || ''}${addr.detail_info || ''}${addr.house_number || ''}`.trim();
}

export function formatOrderAddressForCopy(addr?: OrderAddressInfo): string {
  if (!addr) return '';
  return [
    [addr.user_name || '', formatOrderPhoneInline(addr)].filter(Boolean).join(' '),
    formatOrderAddressLine(addr),
  ].filter(Boolean).join('\n');
}
