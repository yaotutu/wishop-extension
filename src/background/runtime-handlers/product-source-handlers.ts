import type { ProductSourceItem } from '../../shared/types';
import { getProductSources, removeProductSource, setProductSources } from '../store/product-source-repository';
import type { RuntimeHandlerMap } from '../router/runtime-router';

export function createProductSourceRuntimeHandlers(): RuntimeHandlerMap {
  return {
    async 'productSources:list'(args) {
      return getProductSources(args[0] as string);
    },
    async 'productSources:set'(args) {
      return setProductSources(args[0] as string, args[1] as string, args[2] as ProductSourceItem[]);
    },
    async 'productSources:remove'(args) {
      return removeProductSource(args[0] as string, args[1] as string, args[2] as string);
    },
  };
}
