import type { OrderSearchParams, OrderStatus, OrderTimeScope, ShipOrderFromPurchaseInput } from '../../shared/types';
import { getClient } from '../wxshop/client-registry';
import type { RuntimeHandlerMap } from '../router/runtime-router';
import { shipOrderFromPurchase } from '../services/order-delivery-service';

interface OrderHandlerDeps {
  listOrders: (accountId: string, status?: OrderStatus, pageSize?: number, reset?: boolean, timeScope?: OrderTimeScope) => Promise<unknown>;
  searchOrders: (accountId: string, params: OrderSearchParams) => Promise<unknown>;
}

export function createOrderRuntimeHandlers(deps: OrderHandlerDeps): RuntimeHandlerMap {
  return {
    async 'orders:list'(args) {
      return deps.listOrders(
        args[0] as string,
        args[1] as OrderStatus | undefined,
        args[2] as number | undefined,
        args[3] as boolean | undefined,
        args[4] as OrderTimeScope | undefined,
      );
    },
    async 'orders:detail'(args) {
      return (await getClient(args[0] as string)).getOrderDetail(args[1] as string);
    },
    async 'orders:search'(args) {
      return deps.searchOrders(args[0] as string, args[1] as OrderSearchParams);
    },
    async 'orders:decodeAddress'(args) {
      return (await getClient(args[0] as string)).decodeOrderSensitiveInfo(args[1] as string);
    },
    async 'orders:listDeliveryCompanies'(args) {
      const companies = await (await getClient(args[0] as string)).getDeliveryCompanyList(false);
      return companies.map(company => ({
        deliveryId: company.delivery_id,
        deliveryName: company.delivery_name,
      }));
    },
    async 'orders:shipFromPurchase'(args) {
      return shipOrderFromPurchase(args[0] as ShipOrderFromPurchaseInput);
    },
  };
}
