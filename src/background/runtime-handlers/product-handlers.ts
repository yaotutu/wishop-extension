import type { RuntimeHandlerMap } from '../router/runtime-router';
import { getProductQrcode } from '../services/product-share-service';

export function createProductRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'products:getQrcode'(args) {
      // Runtime handler 只做通道参数转发，商品二维码获取和官方错误处理都留在 service/client 层。
      return getProductQrcode(args[0] as string, args[1] as string);
    },
  };
}
