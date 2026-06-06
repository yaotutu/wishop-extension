import type { ActivityLogDomain } from '../../../shared/activity-log.ts';
import type { DraftProduct, QuotaResult, WxProductCategoryPath } from '../../../shared/types';
import { createWxShopRequestClient } from '../core/request';
import type {
  ListingResult,
  ProductListResult,
  WxShopAddProductRequest,
  WxShopAddProductResult,
  WxShopCategoryPrecheckResult,
  WxShopCategoryProductAttrRule,
  WxShopCategoryProductRule,
  WxShopListingClient,
  WxShopMerchantAddressDetail,
  WxShopProductImageUploadResult,
} from './types';
import { normalizeWxCategoryPaths } from './category-paths.ts';

function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => String(item ?? '').trim())
    .filter(Boolean);
}

function normalizeFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function extractAddressIds(data: Record<string, unknown>): string[] {
  const addressIds = normalizeIdList(data.address_id_list);
  if (addressIds.length > 0) return addressIds;
  if (!Array.isArray(data.address_list)) return [];
  return normalizeIdList(data.address_list.map((item: any) => item?.address_id ?? item?.id));
}

function normalizeFailReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      const record = item as Record<string, unknown>;
      return String(record.reason ?? record.message ?? record.desc ?? record.name ?? JSON.stringify(record)).trim();
    })
    .filter(Boolean);
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function parseRuleValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(normalizeText).filter(Boolean)));
  }
  const text = normalizeText(value);
  if (!text) return [];

  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return Array.from(new Set(parsed.map(normalizeText).filter(Boolean)));
      }
    } catch {
      // 官方规则值可能以 JSON 数组字符串或分号字符串表达；解析失败时按分号格式读取枚举。
    }
  }

  return Array.from(new Set(text.split(/[;；]/u).map(item => item.trim()).filter(Boolean)));
}

function normalizeRuleRequired(record: Record<string, unknown>): boolean {
  if (record.is_must === 1 || record.is_must === true || record.is_must === '1') return true;
  const requiredRule = record.required_rule;
  if (!requiredRule || typeof requiredRule !== 'object') return false;
  const ruleType = Number((requiredRule as Record<string, unknown>).rule_type);
  // 微信小店 getcategoryproductrule 文档里 rule_type=1 表示当前属性为必填规则。
  return ruleType === 1;
}

function normalizeCategoryAttrRule(item: unknown): WxShopCategoryProductAttrRule | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const name = normalizeText(record.name);
  if (!name) return null;
  return {
    name,
    type: normalizeText(record.type_v2) || normalizeText(record.type),
    values: parseRuleValues(record.value),
    required: normalizeRuleRequired(record),
    appendAllowed: record.append_allowed === true || record.append_allowed === 1 || record.append_allowed === '1',
    hint: normalizeText(record.hint) || undefined,
  };
}

function normalizeCategoryAttrRules(value: unknown): WxShopCategoryProductAttrRule[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeCategoryAttrRule)
    .filter((item): item is WxShopCategoryProductAttrRule => Boolean(item));
}

export function createWxShopListingClient(accountId: string, domain: ActivityLogDomain = 'productAudit'): WxShopListingClient {
  const wxshop = createWxShopRequestClient({
    accountId,
    domain,
    component: 'WxShopListingClient',
  });

  async function getDraftProducts(pageSize = 30, nextKey = ''): Promise<ProductListResult> {
    const path = '/channels/ec/product/list/get';
    const stage = '获取草稿商品列表';
    const data = await wxshop.request<any>(path, {
      page_size: Math.min(pageSize, 30),
      next_key: nextKey || undefined,
      status: 0,
    }, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }

    return {
      productIds: data.product_ids || [],
      nextKey: data.next_key || '',
      hasMore: Boolean(data.next_key),
    };
  }

  async function getProductDetail(productId: string): Promise<DraftProduct> {
    const path = '/channels/ec/product/get';
    const stage = '获取商品详情';
    const data = await wxshop.request<any>(path, {
      product_id: productId,
      data_type: 2,
    }, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }

    const product = data.edit_product;
    if (!product) {
      throw new Error(`商品 ${productId} 详情为空`);
    }

    return {
      productId: product.product_id,
      title: product.title,
      headImgs: product.head_imgs || [],
      status: product.status,
      editStatus: product.edit_status,
    };
  }

  async function getProductQrcode(productId: string) {
    const path = '/channels/ec/product/qrcode/get';
    const stage = '获取商品二维码';
    // 官方接口要求在服务端调用，并且只支持上架销售中的小店自营商品。
    // 这里保持最小请求体，避免把企业微信归因参数误带到普通商家查看场景里。
    const data = await wxshop.request<any>(path, {
      product_id: productId,
      qrcode_type: 1,
    }, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }

    const qrcodeUrl = typeof data.product_qrcode === 'string' ? data.product_qrcode.trim() : '';
    if (!qrcodeUrl) {
      throw new Error(`商品 ${productId} 二维码链接为空`);
    }

    return {
      productId,
      qrcodeUrl,
    };
  }

  async function getAllCategoryPaths(): Promise<WxProductCategoryPath[]> {
    const path = '/shop/ec/category/all';
    const stage = '获取微信小店类目';
    const data = await wxshop.get<any>(path, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data, 'GET');
    }

    const paths = normalizeWxCategoryPaths(data.cats_v2 ?? data.cats ?? data.category_list ?? []);
    if (paths.length === 0) {
      throw new Error('微信小店类目接口未返回可用三级叶子类目');
    }
    return paths;
  }

  async function precheckProductCategory(catId: string): Promise<WxShopCategoryPrecheckResult> {
    const path = '/channels/ec/product/categoryprecheck';
    const stage = '发品前类目校验';
    const normalizedCatId = catId.trim();
    if (!/^\d+$/u.test(normalizedCatId)) throw new Error('发品前类目校验缺少有效叶子类目 ID');
    wxshop.logger.info('按微信小店官方文档执行发品前类目校验', {
      method: 'POST',
      path,
      body: { cat_id: Number(normalizedCatId) },
    });
    const data = await wxshop.request<any>(path, { cat_id: Number(normalizedCatId) }, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }

    return {
      catId: normalizedCatId,
      allPass: Boolean(data.all_pass),
      failReasons: normalizeFailReasons(data.fail_reasons),
    };
  }

  async function getCategoryProductRule(catId: string): Promise<WxShopCategoryProductRule> {
    const path = '/shop/ec/category/getcategoryproductrule';
    const stage = '获取类目发品规则';
    const normalizedCatId = catId.trim();
    if (!/^\d+$/u.test(normalizedCatId)) throw new Error('获取类目发品规则缺少有效叶子类目 ID');
    const body = { cat_id: Number(normalizedCatId), release_mode: 0 };
    wxshop.logger.info('按微信小店官方文档读取类目发品规则', {
      method: 'POST',
      path,
      body,
    });
    const data = await wxshop.request<any>(path, body, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }

    return {
      catId: String(data.info?.cat_id ?? normalizedCatId),
      name: normalizeText(data.info?.name) || undefined,
      productAttrs: normalizeCategoryAttrRules(data.product_attr_list),
      saleAttrs: normalizeCategoryAttrRules(data.sale_attr_list),
    };
  }

  async function getFreightTemplateIds(): Promise<string[]> {
    const path = '/channels/ec/merchant/getfreighttemplatelist';
    const stage = '获取运费模板列表';
    const pageInput = { offset: 0, limit: 10 };
    // 微信小店运费模板列表接口要求分页参数，之前传空对象会被微信按 limit=0 校验失败。
    wxshop.logger.info('按微信小店官方文档读取运费模板列表', {
      method: 'POST',
      path,
      body: pageInput,
    });
    const data = await wxshop.request<any>(path, pageInput, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }

    return normalizeIdList(data.template_id_list);
  }

  async function getMerchantAddressIds(): Promise<string[]> {
    const path = '/channels/ec/merchant/address/list';
    const stage = '获取商家地址列表';
    const pageInput = { offset: 0, limit: 100 };
    wxshop.logger.info('按微信小店官方文档读取商家地址列表', {
      method: 'POST',
      path,
      body: pageInput,
    });
    const data = await wxshop.request<any>(path, pageInput, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }

    return extractAddressIds(data);
  }

  async function getMerchantAddressDetail(addressId: string): Promise<WxShopMerchantAddressDetail> {
    const path = '/channels/ec/merchant/address/get';
    const stage = '获取商家地址详情';
    const data = await wxshop.request<any>(path, { address_id: addressId }, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }

    const detail = data.address_detail;
    const normalizedAddressId = String(detail?.address_id ?? addressId ?? '').trim();
    if (!normalizedAddressId) throw new Error('微信小店地址详情未返回地址 ID');
    return {
      addressId: normalizedAddressId,
      defaultSend: normalizeFlag(detail?.default_send),
      defaultRecv: normalizeFlag(detail?.default_recv),
      sendAddr: normalizeFlag(detail?.send_addr),
      recvAddr: normalizeFlag(detail?.recv_addr),
    };
  }

  async function uploadImageByUrl(imgUrl: string): Promise<WxShopProductImageUploadResult> {
    const path = '/shop/ec/basics/img/upload?upload_type=1&resp_type=1';
    const stage = '上传商品图片';
    const data = await wxshop.request<any>(path, { img_url: imgUrl }, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }

    const uploadedUrl = typeof data.pic_file?.img_url === 'string' ? data.pic_file.img_url.trim() : '';
    if (!uploadedUrl) {
      throw new Error('微信小店图片上传接口未返回图片链接');
    }

    return { imgUrl: uploadedUrl };
  }

  async function addProduct(input: WxShopAddProductRequest): Promise<WxShopAddProductResult> {
    const path = '/channels/ec/product/add';
    const stage = '创建商品草稿';
    const data = await wxshop.request<any>(path, input, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }

    const productId = data.data?.product_id ?? data.product_id;
    if (productId === undefined || productId === null || String(productId).trim() === '') {
      throw new Error('微信小店新增商品接口未返回商品 ID');
    }

    return {
      productId: String(productId),
      createTime: typeof data.data?.create_time === 'string' ? data.data.create_time : undefined,
    };
  }

  async function submitProductAudit(productId: string): Promise<ListingResult> {
    return wxshop.request<ListingResult>('/channels/ec/product/listing', { product_id: productId }, '提交商品提审');
  }

  async function getAuditQuota(): Promise<QuotaResult> {
    const path = '/channels/ec/product/getauditquota';
    const stage = '获取商品提审配额';
    const data = await wxshop.request<any>(path, {}, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }

    if (!data.audit_quota) {
      return { quota: 0, total: 0 };
    }

    return {
      quota: data.audit_quota.avail_quota,
      total: data.audit_quota.total_quota,
    };
  }

  async function deleteProduct(productId: string): Promise<ListingResult> {
    return wxshop.request<ListingResult>('/channels/ec/product/delete', { product_id: productId }, '删除商品草稿');
  }

  return {
    getDraftProducts,
    getProductDetail,
    getProductQrcode,
    getAllCategoryPaths,
    precheckProductCategory,
    getCategoryProductRule,
    getFreightTemplateIds,
    getMerchantAddressIds,
    getMerchantAddressDetail,
    uploadImageByUrl,
    addProduct,
    submitProductAudit,
    getAuditQuota,
    deleteProduct,
  };
}
