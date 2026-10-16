import type { FieldExtractor, ScanField, ScannableProduct } from '../types';

/**
 * 标题 + 描述字段提取器（接口预留，本期默认不启用）。
 *
 * 在标题之外额外抽取商品描述文本。后续想「扫描述」时，
 * 把 ScanPlan.fields 换成这个即可，无需改 source 或 matcher。
 * 描述为空的商品只产出标题字段。
 */
export class TitleDescFieldExtractor implements FieldExtractor {
  readonly fieldKeys = ['title', 'desc'] as const;

  extract(product: ScannableProduct): ScanField[] {
    const fields: ScanField[] = [{ key: 'title', label: '标题', text: product.title }];
    if (product.desc) {
      fields.push({ key: 'desc', label: '描述', text: product.desc });
    }
    return fields;
  }
}
