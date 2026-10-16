import type { FieldExtractor, ScanField, ScannableProduct } from '../types';

/**
 * 标题字段提取器（默认实现）。
 *
 * 只从商品里抽出标题文本，作为唯一可扫字段。
 * 本期默认配置就是它，行为等价重构前的「只扫 title」。
 */
export class TitleFieldExtractor implements FieldExtractor {
  readonly fieldKeys = ['title'] as const;

  extract(product: ScannableProduct): ScanField[] {
    return [{ key: 'title', label: '标题', text: product.title }];
  }
}
