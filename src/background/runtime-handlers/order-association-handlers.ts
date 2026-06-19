import type { LinkedPlatformOrder } from '../../shared/types';
import { getOrderAssociations, setOrderAssociation } from '../store/order-association-repository';
import { applyLinkedOrder } from '../orders/order-association-service';
import type { RuntimeHandlerMap } from '../router/runtime-router';

// 手填路径直接走统一关联入口。前端 IPC channel 不变，语义收敛为「以 manual 来源写入」。
export function createOrderAssociationRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'orderAssociations:list'(args) {
      return getOrderAssociations(args[0] as string);
    },
    async 'orderAssociations:set'(args) {
      const accountId = args[0] as string;
      const orderId = args[1] as string;
      const input = args[2] as { internalRemark?: string; linkedOrders: LinkedPlatformOrder[] };
      const linked = input.linkedOrders[0];
      if (!linked) {
        // 没有关联订单时只更新内部备注，不经过来源优先级判断。
        return setOrderAssociation(accountId, orderId, {
          internalRemark: input.internalRemark || '',
          linkedOrders: [],
        });
      }
      const outcome = await applyLinkedOrder({
        accountId,
        orderId,
        platformOrderId: linked.platformOrderId,
        linkSource: 'manual',
        platformOrderStatus: linked.platformOrderStatus,
        logisticsStatus: linked.logisticsStatus,
        logisticsCompany: linked.logisticsCompany,
        trackingNumber: linked.trackingNumber,
        remark: linked.remark,
      });
      if (!outcome.written) {
        throw new Error('当前订单已有更高优先级的采购关联，手动修改被跳过');
      }
      return outcome.association;
    },
  };
}
