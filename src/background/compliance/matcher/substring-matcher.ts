import type { FieldMatch, ScanField, WordMatcher } from '../types';

/**
 * 子串匹配器（默认实现）。
 *
 * 对每个字段的文本做大小写不敏感的子串匹配：
 * 词库里的任意词只要作为子串出现在字段文本里，就视为命中。
 *
 * 这是原 compliance-detect.ts 的 findMatches 逻辑，
 * 改造成「多字段 × 词库」，产出 FieldMatch 明细（标注命中在哪个字段）。
 */
export class SubstringMatcher implements WordMatcher {
  match(fields: ScanField[], words: string[]): FieldMatch[] {
    const result: FieldMatch[] = [];
    for (const field of fields) {
      if (!field.text) continue;
      const lower = field.text.toLowerCase();
      for (const word of words) {
        if (word && lower.includes(word.toLowerCase())) {
          result.push({ fieldKey: field.key, word });
        }
      }
    }
    return result;
  }
}
