import type {
  CreatePreparedWxDraftBoxProductInput,
  CreateProductListingCollectionSessionInput,
  CreateWxDraftBoxProductInput,
  CreateWxDraftBoxProductPrepareInput,
  CreateWxProductDraftSuggestionInput,
  DeleteCreatedWxDraftBoxProductInput,
  TaobaoProductSnapshot,
  TaobaoSecurityChallengeSnapshot,
} from '../../shared/types.ts';
import type { RuntimeHandlerMap } from '../router/runtime-router.ts';
import {
  completeProductListingCollectionSession,
  failProductListingCollectionSession,
  openProductListingCollectionSession,
  productListingCollectionStore,
  reportProductListingCollectionChallenge,
  resolveProductListingCollectionChallenge,
  updateProductListingCollectionSessionStatus,
} from '../services/product-listing-collection-service.ts';
import { createWxProductFullCategorySuggestion } from '../services/product-listing-full-category-ai-service.ts';
import {
  createPreparedWxDraftBoxProduct,
  createWxDraftBoxProductFromCollectedListing,
  deleteCreatedWxDraftBoxProduct,
  prepareWxDraftBoxProductFromCollectedListing,
} from '../services/product-listing-wx-draft-service.ts';

type GetCurrentTabSession = (sender?: chrome.runtime.MessageSender) => Promise<unknown>;

export function createProductListingCollectionRuntimeHandlers(
  getCurrentTabSession: GetCurrentTabSession,
): RuntimeHandlerMap {
  return {
    async 'productListingCollection:list'() {
      return productListingCollectionStore.list();
    },
    async 'productListingCollection:remove'(args) {
      await productListingCollectionStore.remove(args[0] as string);
    },
    async 'productListingCollection:open'(args) {
      return openProductListingCollectionSession(args[0] as CreateProductListingCollectionSessionInput);
    },
    async 'productListingCollection:getCurrentTabSession'(_args, sender) {
      return getCurrentTabSession(sender);
    },
    async 'productListingCollection:markPageReady'(args) {
      return updateProductListingCollectionSessionStatus(args[0] as string, 'page-ready');
    },
    async 'productListingCollection:reportChallenge'(args) {
      return reportProductListingCollectionChallenge(args[0] as string, args[1] as TaobaoSecurityChallengeSnapshot);
    },
    async 'productListingCollection:resolveChallenge'(args) {
      return resolveProductListingCollectionChallenge(args[0] as string);
    },
    async 'productListingCollection:complete'(args) {
      return completeProductListingCollectionSession(args[0] as string, args[1] as TaobaoProductSnapshot);
    },
    async 'productListingCollection:fail'(args) {
      return failProductListingCollectionSession(args[0] as string, args[1] as string);
    },
    async 'productListingCollection:suggestWxCategoryFromFullList'(args) {
      return createWxProductFullCategorySuggestion(args[0] as CreateWxProductDraftSuggestionInput);
    },
    async 'productListingCollection:prepareWxDraftBoxProduct'(args) {
      return prepareWxDraftBoxProductFromCollectedListing(args[0] as CreateWxDraftBoxProductPrepareInput);
    },
    async 'productListingCollection:createPreparedWxDraftBoxProduct'(args) {
      return createPreparedWxDraftBoxProduct(args[0] as CreatePreparedWxDraftBoxProductInput);
    },
    async 'productListingCollection:createWxDraftBoxProduct'(args) {
      return createWxDraftBoxProductFromCollectedListing(args[0] as CreateWxDraftBoxProductInput);
    },
    async 'productListingCollection:deleteCreatedWxDraftBoxProduct'(args) {
      return deleteCreatedWxDraftBoxProduct(args[0] as DeleteCreatedWxDraftBoxProductInput);
    },
  };
}
