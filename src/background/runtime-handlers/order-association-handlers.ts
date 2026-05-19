import type { OrderAssociation } from '../../shared/types';
import { getOrderAssociations, setOrderAssociation } from '../store/order-association-repository';
import type { RuntimeHandlerMap } from '../router/runtime-router';

export function createOrderAssociationRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'orderAssociations:list'(args) {
      return getOrderAssociations(args[0] as string);
    },
    async 'orderAssociations:set'(args) {
      return setOrderAssociation(
        args[0] as string,
        args[1] as string,
        args[2] as Pick<OrderAssociation, 'internalRemark' | 'linkedOrders'>,
      );
    },
  };
}
