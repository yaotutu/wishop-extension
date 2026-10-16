import type { ActivityLogDomain } from '../../../shared/activity-log.ts';
import type { DraftProduct, QuotaResult, WxProductCategoryPath } from '../../../shared/types';
import { createWxShopRequestClient } from '../core/request';
import type {
  DraftProductFull,
  ListingResult,
  ProductListResult,
  WxShopAddProductRequest,
  WxShopAddProductResult,
  WxShopCategoryPrecheckResult,
  WxShopCategoryProductAttrRule,
  WxShopCategoryProductRule,
  WxShopFreightTemplateSummary,
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

function uniqueFreightTemplates(templates: WxShopFreightTemplateSummary[]): WxShopFreightTemplateSummary[] {
  const seen = new Set<string>();
  return templates.filter(template => {
    if (seen.has(template.templateId)) return false;
    seen.add(template.templateId);
    return true;
  });
}

function normalizeFreightTemplateItem(item: unknown): WxShopFreightTemplateSummary | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const templateId = normalizeText(record.template_id ?? record.templateId ?? record.id);
  if (!templateId) return null;
  const valuationType = Number(record.valuation_type ?? record.valuationType);
  return {
    templateId,
    name: normalizeText(record.name ?? record.template_name ?? record.templateName) || undefined,
    valuationType: Number.isFinite(valuationType) ? valuationType : undefined,
  };
}

function normalizeFreightTemplates(data: Record<string, unknown>): WxShopFreightTemplateSummary[] {
  const list = Array.isArray(data.template_list)
    ? data.template_list
    : Array.isArray(data.freight_template_list)
      ? data.freight_template_list
      : [];
  const templates = list
    .map(normalizeFreightTemplateItem)
    .filter((item): item is WxShopFreightTemplateSummary => Boolean(item));
  if (templates.length > 0) return uniqueFreightTemplates(templates);

  return normalizeIdList(data.template_id_list).map(templateId => ({ templateId }));
}

function normalizeFreightTemplateDetail(
  data: Record<string, unknown>,
  templateId: string,
): WxShopFreightTemplateSummary {
  const candidates = [
    data.template_info,
    data.freight_template,
    data.freight_template_info,
    data,
  ];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const normalized = normalizeFreightTemplateItem({
      template_id: templateId,
      ...(candidate as Record<string, unknown>),
    });
    if (normalized) return normalized;
  }
  return { templateId };
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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
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

  /**
   * 把微信 edit_product 里的属性列表聚合成「键:值」文本。
   * attrs 和 sku_attrs 都是 [{ attr_key, attr_value }] 结构，统一处理。
   */
  function aggregateAttrsText(attrs: unknown): string {
    if (!Array.isArray(attrs)) return '';
    return attrs
      .map((item: any) => {
        const key = normalizeText(item?.attr_key ?? item?.key ?? item?.name);
        const value = normalizeText(item?.attr_value ?? item?.value);
        if (!key && !value) return '';
        return key ? `${key}:${value}` : value;
      })
      .filter(Boolean)
      .join(' ');
  }

  /**
   * 把 skus[].sku_attrs 聚合成一段文本，供合规扫描抽 SKU 属性。
   */
  function aggregateSkuAttrsText(skus: unknown): string {
    if (!Array.isArray(skus)) return '';
    const parts: string[] = [];
    for (const sku of skus) {
      const text = aggregateAttrsText(sku?.sku_attrs);
      if (text) parts.push(text);
    }
    return Array.from(new Set(parts)).join(' ');
  }

  async function getProductDetailFull(productId: string): Promise<DraftProductFull> {
    const path = '/channels/ec/product/get';
    const stage = '获取商品详情（含可扫描字段）';
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
      desc: normalizeText(product.desc_info?.desc) || undefined,
      attrsText: aggregateAttrsText(product.attrs) || undefined,
      skuAttrsText: aggregateSkuAttrsText(product.skus) || undefined,
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

  async function requestFreightTemplateList(): Promise<Record<string, unknown>> {
    const path = '/channels/ec/logistics/merchant/freighttemplate/list/get';
    const stage = '获取运费模板列表';
    const pageInput = { page_size: 100 };
    wxshop.logger.info('按微信小店官方文档读取运费模板列表', {
      method: 'POST',
      path,
      body: pageInput,
    });
    const data = await wxshop.request<Record<string, unknown>>(path, pageInput, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }
    return data;
  }

  async function requestLegacyFreightTemplateList(): Promise<Record<string, unknown>> {
    const path = '/channels/ec/merchant/getfreighttemplatelist';
    const stage = '获取运费模板列表';
    const pageInput = { offset: 0, limit: 100 };
    // 旧接口要求分页参数，保留兜底路径，避免真实商家账号尚未切到新版物流接口时列表不可用。
    wxshop.logger.info('按微信小店旧接口读取运费模板列表', {
      method: 'POST',
      path,
      body: pageInput,
    });
    const data = await wxshop.request<Record<string, unknown>>(path, pageInput, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }
    return data;
  }

  async function requestFreightTemplateDetail(templateId: string): Promise<Record<string, unknown>> {
    const path = '/channels/ec/logistics/merchant/freighttemplate/get';
    const stage = '获取运费模板详情';
    const body = { template_id: templateId };
    wxshop.logger.info('按微信小店官方文档读取运费模板详情', {
      method: 'POST',
      path,
      body,
    });
    const data = await wxshop.request<Record<string, unknown>>(path, body, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }
    return data;
  }

  async function requestLegacyFreightTemplateDetail(templateId: string): Promise<Record<string, unknown>> {
    const path = '/channels/ec/merchant/getfreighttemplatedetail';
    const stage = '获取运费模板详情';
    const body = { template_id: templateId };
    wxshop.logger.info('按微信小店旧接口读取运费模板详情', {
      method: 'POST',
      path,
      body,
    });
    const data = await wxshop.request<Record<string, unknown>>(path, body, stage);

    if (data.errcode && data.errcode !== 0) {
      wxshop.throwWxApiError(path, stage, data);
    }
    return data;
  }

  async function fillFreightTemplateName(template: WxShopFreightTemplateSummary): Promise<WxShopFreightTemplateSummary> {
    if (template.name?.trim()) return template;
    // 有些账号的列表接口只返回 template_id_list，参数设置页必须继续查详情才能给用户展示可读名称。
    try {
      const detail = normalizeFreightTemplateDetail(await requestFreightTemplateDetail(template.templateId), template.templateId);
      return { ...template, ...detail };
    } catch (error) {
      wxshop.logger.warn('新版微信小店运费模板详情读取失败，尝试旧接口兜底', {
        templateId: template.templateId,
        error: errorMessage(error, '新版运费模板详情读取失败'),
      });
      try {
        const detail = normalizeFreightTemplateDetail(await requestLegacyFreightTemplateDetail(template.templateId), template.templateId);
        return { ...template, ...detail };
      } catch (legacyError) {
        wxshop.logger.warn('微信小店运费模板详情读取失败，保留模板 ID 作为兜底显示', {
          templateId: template.templateId,
          error: errorMessage(legacyError, '运费模板详情读取失败'),
        });
        return template;
      }
    }
  }

  async function getFreightTemplates(): Promise<WxShopFreightTemplateSummary[]> {
    let templates: WxShopFreightTemplateSummary[];
    try {
      templates = normalizeFreightTemplates(await requestFreightTemplateList());
    } catch (error) {
      wxshop.logger.warn('新版微信小店运费模板列表读取失败，尝试旧接口兜底', {
        error: errorMessage(error, '新版运费模板列表读取失败'),
      });
      templates = normalizeFreightTemplates(await requestLegacyFreightTemplateList());
    }
    return Promise.all(templates.map(fillFreightTemplateName));
  }

  async function getFreightTemplateIds(): Promise<string[]> {
    return (await getFreightTemplates()).map(template => template.templateId);
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
    getProductDetailFull,
    getProductQrcode,
    getAllCategoryPaths,
    precheckProductCategory,
    getCategoryProductRule,
    getFreightTemplates,
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
