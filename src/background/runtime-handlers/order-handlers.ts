import type { OrderListFilters, OrderScope, OrderSearchParams, OrderSearchSource, ShipOrderFromPurchaseInput } from '../../shared/types';
import { getClient } from '../wxshop/client-registry';
import type { RuntimeHandlerMap } from '../router/runtime-router';
import { shipOrderFromPurchase } from '../services/order-delivery-service';
import type { OrderDomainService } from '../orders/order-domain-service';
import { orderDomainService } from '../orders/order-domain';

interface OrderHandlerDeps {
  domain: OrderDomainService;
}

export function createOrderRuntimeHandlers(deps: OrderHandlerDeps = { domain: orderDomainService }): RuntimeHandlerMap {
  return {
    async 'orders:list'(args) {
      return deps.domain.list(args[0] as OrderScope, args[1] as OrderListFilters | undefined);
    },
    async 'orders:detail'(args) {
      return deps.domain.detail(args[0] as string, args[1] as string, args[2] as { refresh?: boolean } | undefined);
    },
    async 'orders:search'(args) {
      return deps.domain.search(args[0] as OrderScope, args[1] as OrderSearchParams, args[2] as OrderSearchSource);
    },
    async 'orders:refresh'(args) {
      return deps.domain.refresh(args[0] as OrderScope);
    },
    async 'orders:syncState'(args) {
      return deps.domain.syncState(args[0] as OrderScope);
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
