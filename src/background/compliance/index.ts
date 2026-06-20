/**
 * 合规扫描域的统一出口。
 *
 * 三段式管道（ScanSource → FieldExtractor → WordMatcher → ScanItem → ResultAction）
 * 的类型、默认实现和扫描器都从这里导出。消费侧（compliance-service）只 import 这一个文件。
 *
 * 详见 docs/superpowers/specs/2026-06-20-compliance-scanner-pipeline-design.md。
 */
export type {
  ScanField,
  ScanItem,
  FieldMatch,
  ScannableProduct,
  ScanSource,
  FieldExtractor,
  WordMatcher,
  ResultAction,
  ActionResult,
  ActionResultContext,
  ScanPlan,
  ComplianceScanner,
} from './types';

export { createComplianceScanner } from './scanner';
export { DraftBoxScanSource } from './source/draft-box-source';
export { OnlineProductScanSource } from './source/online-source';
export { TitleFieldExtractor } from './extractor/title-extractor';
export { TitleDescFieldExtractor } from './extractor/title-desc-extractor';
export { SubstringMatcher } from './matcher/substring-matcher';
export { DeleteResultAction } from './action/delete-action';
export { ExportResultAction } from './action/export-action';
