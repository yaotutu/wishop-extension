import type {
  ProductCopyAfterSaleAddressOption,
  ProductCopyCategoryOption,
  ProductCopyDraftParameterOptions,
  ProductCopyFreightTemplateOption,
} from '../../shared/types.ts';
import { getListingClient } from '../wxshop/client-registry.ts';
import type { WxShopFreightTemplateSummary, WxShopMerchantAddressDetail } from '../wxshop/listing/types.ts';
import { loadRuntimeWxCategoryPaths } from './wxshop-category-path-cache.ts';

function categoryKey(catIds: string[]): string {
  return catIds.join('/');
}

function toCategoryOption(path: { catIds: string[]; names: string[]; path: string }): ProductCopyCategoryOption {
  return {
    key: categoryKey(path.catIds),
    catIds: path.catIds,
    names: path.names,
    path: path.path,
  };
}

function toFreightTemplateOption(template: WxShopFreightTemplateSummary): ProductCopyFreightTemplateOption {
  const name = template.name?.trim();
  return {
    templateId: template.templateId,
    name,
    label: name ? `${name}（ID：${template.templateId}）` : `模板 ID：${template.templateId}`,
  };
}

function addressLabel(detail: WxShopMerchantAddressDetail): string {
  const flags = [
    detail.defaultRecv ? '默认售后' : '',
    detail.defaultSend ? '默认发货' : '',
    detail.recvAddr ? '收货地址' : '',
    detail.sendAddr ? '发货地址' : '',
  ].filter(Boolean);
  return flags.length > 0 ? `${detail.addressId}（${flags.join(' / ')}）` : detail.addressId;
}

function toAfterSaleAddressOption(detail: WxShopMerchantAddressDetail): ProductCopyAfterSaleAddressOption {
  return {
    addressId: detail.addressId,
    label: addressLabel(detail),
    defaultSend: detail.defaultSend,
    defaultRecv: detail.defaultRecv,
    sendAddr: detail.sendAddr,
    recvAddr: detail.recvAddr,
  };
}

/**
 * 参数设置页使用的选项必须从后台统一读取。
 * 类目走本地静态缓存，运费模板和售后地址走当前账号微信小店 client，保证预览和最终提交使用同一组数据来源。
 */
export async function getProductCopyDraftParameterOptions(accountId: string): Promise<ProductCopyDraftParameterOptions> {
  if (!accountId.trim()) throw new Error('请选择微信小店账号');
  const client = await getListingClient(accountId, 'productCopy');
  const [categoryPaths, freightTemplates, addressIds] = await Promise.all([
    loadRuntimeWxCategoryPaths(),
    client.getFreightTemplates(),
    client.getMerchantAddressIds(),
  ]);
  const addressDetails = await Promise.all(addressIds.map(async addressId => {
    try {
      return await client.getMerchantAddressDetail(addressId);
    } catch {
      return {
        addressId,
        defaultSend: false,
        defaultRecv: false,
        sendAddr: false,
        recvAddr: false,
      };
    }
  }));

  return {
    categories: categoryPaths.map(toCategoryOption),
    freightTemplates: freightTemplates.map(toFreightTemplateOption),
    afterSaleAddresses: addressDetails.map(toAfterSaleAddressOption),
    fetchedAt: Date.now(),
  };
}
