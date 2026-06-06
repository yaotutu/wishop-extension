import type {
  CreatePreparedWxDraftBoxProductInput,
  CreateProductCopySessionInput,
  CreateWxDraftBoxProductInput,
  CreateWxDraftBoxProductPrepareInput,
  CreateWxProductDraftSuggestionInput,
  DeleteCreatedWxDraftBoxProductInput,
  TaobaoProductSnapshot,
  TaobaoSecurityChallengeSnapshot,
} from '../../shared/types.ts';
import type { RuntimeHandlerMap } from '../router/runtime-router.ts';
import { getProductCopyCreatedProduct } from '../store/product-copy-created-product-repository.ts';
import {
  completeProductCopySession,
  failProductCopySession,
  openProductCopySession,
  productCopyRecordStore,
  reportProductCopyChallenge,
  resolveProductCopyChallenge,
  updateProductCopySessionStatus,
} from '../services/product-copy-session-service.ts';
import { createWxProductFullCategorySuggestion } from '../services/product-copy-full-category-ai-service.ts';
import {
  createPreparedWxDraftBoxProduct,
  createWxDraftBoxProductFromCopyRecord,
  deleteCreatedWxDraftBoxProduct,
  prepareWxDraftBoxProductFromCopyRecord,
} from '../services/product-copy-wx-draft-service.ts';
import { getProductCopyDraftParameterOptions } from '../services/product-copy-parameter-options-service.ts';

type GetCurrentTabSession = (sender?: chrome.runtime.MessageSender) => Promise<unknown>;

export function createProductCopyRuntimeHandlers(
  getCurrentTabSession: GetCurrentTabSession,
): RuntimeHandlerMap {
  return {
    async 'productCopy:list'() {
      return productCopyRecordStore.list();
    },
    async 'productCopy:remove'(args) {
      await productCopyRecordStore.remove(args[0] as string);
    },
    async 'productCopy:getDraftParameterOptions'(args) {
      return getProductCopyDraftParameterOptions(args[0] as string);
    },
    async 'productCopy:getCreatedProduct'(args) {
      return getProductCopyCreatedProduct(args[0] as string, args[1] as string);
    },
    async 'productCopy:open'(args) {
      return openProductCopySession(args[0] as CreateProductCopySessionInput);
    },
    async 'productCopy:getCurrentTabSession'(_args, sender) {
      return getCurrentTabSession(sender);
    },
    async 'productCopy:markPageReady'(args) {
      return updateProductCopySessionStatus(args[0] as string, 'page-ready');
    },
    async 'productCopy:reportChallenge'(args) {
      return reportProductCopyChallenge(args[0] as string, args[1] as TaobaoSecurityChallengeSnapshot);
    },
    async 'productCopy:resolveChallenge'(args) {
      return resolveProductCopyChallenge(args[0] as string);
    },
    async 'productCopy:complete'(args) {
      return completeProductCopySession(args[0] as string, args[1] as TaobaoProductSnapshot);
    },
    async 'productCopy:fail'(args) {
      return failProductCopySession(args[0] as string, args[1] as string);
    },
    async 'productCopy:suggestWxCategoryFromFullList'(args) {
      return createWxProductFullCategorySuggestion(args[0] as CreateWxProductDraftSuggestionInput);
    },
    async 'productCopy:prepareWxDraftBoxProduct'(args) {
      return prepareWxDraftBoxProductFromCopyRecord(args[0] as CreateWxDraftBoxProductPrepareInput);
    },
    async 'productCopy:createPreparedWxDraftBoxProduct'(args) {
      return createPreparedWxDraftBoxProduct(args[0] as CreatePreparedWxDraftBoxProductInput);
    },
    async 'productCopy:createWxDraftBoxProduct'(args) {
      return createWxDraftBoxProductFromCopyRecord(args[0] as CreateWxDraftBoxProductInput);
    },
    async 'productCopy:deleteCreatedWxDraftBoxProduct'(args) {
      return deleteCreatedWxDraftBoxProduct(args[0] as DeleteCreatedWxDraftBoxProductInput);
    },
  };
}
