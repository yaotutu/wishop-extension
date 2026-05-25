import type { Order, OrderProductInfo, ShipOrderFromPurchaseInput, ShipOrderFromPurchaseResult } from '../../shared/types';
import { OrderStatus } from '../../shared/types';
import { DELIVERY_COMPANY_UNMATCHED_PREFIX } from '../../shared/errors';
import {
  recordTaskCompleted,
  recordTaskFailed,
  recordTaskStarted,
} from '../global-logs/global-log-service';
import { getClient } from '../wxshop/client-registry';
import type { DeliveryCompany, SendOrderDeliveryPayload } from '../wxshop/client';

function normalizeDeliveryName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/快递|速递|物流|快运|股份有限公司|有限公司|公司/g, '');
}

function buildDeliveryAliases(companyName: string): string[] {
  const normalized = normalizeDeliveryName(companyName);
  const aliases: Record<string, string[]> = {
    sf: ['顺丰'],
    zto: ['中通'],
    yto: ['圆通'],
    sto: ['申通'],
    yd: ['韵达'],
    yunda: ['韵达'],
    jtexpress: ['极兔', 'j&t', 'jt'],
    jd: ['京东'],
    ems: ['ems', '邮政'],
    yzpy: ['邮政'],
    debang: ['德邦'],
    best: ['百世'],
    ane: ['安能'],
    zjs: ['宅急送'],
    kuaijiesudi: ['快捷'],
  };
  return [normalized, ...(aliases[normalized] || [])].map(normalizeDeliveryName);
}

export function matchDeliveryCompany(
  logisticsCompany: string,
  companies: DeliveryCompany[],
): DeliveryCompany | null {
  const target = normalizeDeliveryName(logisticsCompany);
  if (!target) return null;

  for (const company of companies) {
    const deliveryId = normalizeDeliveryName(company.delivery_id);
    const deliveryName = normalizeDeliveryName(company.delivery_name);
    const aliases = buildDeliveryAliases(company.delivery_id);
    if (
      target === deliveryId
      || target === deliveryName
      || deliveryName.includes(target)
      || target.includes(deliveryName)
      || aliases.some(alias => alias && (target === alias || target.includes(alias) || alias.includes(target)))
    ) {
      return company;
    }
  }

  return null;
}

function findDeliveryCompanyById(deliveryId: string, companies: DeliveryCompany[]): DeliveryCompany | null {
  const normalized = normalizeDeliveryName(deliveryId);
  return companies.find(company => normalizeDeliveryName(company.delivery_id) === normalized) || null;
}

function assertShippableOrder(order: Order): void {
  if (order.status !== OrderStatus.PendingShipment) {
    throw new Error('当前微信小店订单不是待发货状态，无法提交发货');
  }
  if (order.order_detail?.delivery_info?.delivery_product_info?.length > 0) {
    throw new Error('当前微信小店订单已有物流信息，请勿重复发货');
  }
}

function buildProductInfos(products: OrderProductInfo[]): SendOrderDeliveryPayload['delivery_list'][number]['product_infos'] {
  const productInfos = products
    .map(product => ({
      product_cnt: product.sku_cnt,
      product_id: product.product_id,
      sku_id: product.sku_id,
    }))
    .filter(product => product.product_cnt > 0 && product.product_id && product.sku_id);
  if (productInfos.length === 0) {
    throw new Error('订单商品信息不完整，无法生成微信小店发货参数');
  }
  return productInfos;
}

export async function shipOrderFromPurchase(input: ShipOrderFromPurchaseInput): Promise<ShipOrderFromPurchaseResult> {
  const logisticsCompany = input.logisticsCompany.trim();
  const trackingNumber = input.trackingNumber.trim();
  const runId = `ship-${input.orderId}-${Date.now()}`;
  if (!input.accountId) throw new Error('缺少账号 ID');
  if (!input.orderId.trim()) throw new Error('缺少微信小店订单号');
  if (!logisticsCompany) throw new Error('缺少快递公司，无法提交发货');
  if (!trackingNumber) throw new Error('缺少快递单号，无法提交发货');

  void recordTaskStarted({
    module: 'orders',
    scope: 'account',
    accountId: input.accountId,
    taskKind: 'manual',
    runId,
    title: '手动回填微信小店发货已开始',
    detail: `订单号：${input.orderId}，快递：${logisticsCompany} ${trackingNumber}`,
    metadata: {
      orderId: input.orderId,
      source: 'purchaseLookup',
    },
  });

  try {
    const client = await getClient(input.accountId);
    const order = await client.getOrderDetail(input.orderId);
    assertShippableOrder(order);

    const companies = await client.getDeliveryCompanyList(false);
    const company = input.deliveryId
      ? findDeliveryCompanyById(input.deliveryId, companies)
      : matchDeliveryCompany(logisticsCompany, companies);
    if (!company) {
      if (input.deliveryId) {
        throw new Error(`选择的微信小店快递公司编码不存在或已失效：${input.deliveryId}`);
      }
      throw new Error(`${DELIVERY_COMPANY_UNMATCHED_PREFIX}无法自动匹配微信小店快递公司编码：${logisticsCompany}`);
    }

    await client.sendOrderDelivery({
      order_id: input.orderId,
      delivery_list: [{
        delivery_id: company.delivery_id,
        waybill_id: trackingNumber,
        deliver_type: 1,
        product_infos: buildProductInfos(order.order_detail?.product_infos || []),
      }],
    });

    const updatedOrder = await client.getOrderDetail(input.orderId);
    void recordTaskCompleted({
      module: 'orders',
      scope: 'account',
      accountId: input.accountId,
      taskKind: 'manual',
      runId,
      title: '手动回填微信小店发货完成',
      detail: `订单号：${input.orderId}，快递：${company.delivery_name} ${trackingNumber}`,
      metadata: {
        orderId: input.orderId,
        deliveryId: company.delivery_id,
        source: 'purchaseLookup',
      },
    });

    return {
      order: updatedOrder,
      deliveryId: company.delivery_id,
      deliveryName: company.delivery_name,
      waybillId: trackingNumber,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '提交微信小店发货失败';
    void recordTaskFailed({
      module: 'orders',
      scope: 'account',
      accountId: input.accountId,
      taskKind: 'manual',
      runId,
      title: '手动回填微信小店发货失败',
      error: { message },
      notification: {
        topic: 'orders.shipment_failed',
        urgency: 'important',
      },
      metadata: {
        orderId: input.orderId,
        source: 'purchaseLookup',
      },
    });
    throw error;
  }
}
