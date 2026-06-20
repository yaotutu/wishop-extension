export interface ShipmentCheckSettings {
  enabled: boolean;
  autoShipEnabled: boolean;
  windowMinutes: number;
  maxChecksPerAccountPerWindow: number;
  minDispatchDelaySeconds: number;
  maxDispatchDelaySeconds: number;
  minTaskSpacingSeconds: number;
  orderLookbackDays: number;
  normalCooldownMinutes: number;
  verificationCooldownMinutes: number;
  failureCooldownMinutes: number;
}

export type PurchaseLinkSourceId = 'manual' | 'merchant_notes' | 'payment_success';

// 采购订单关联设置。sourceOrder 是用户排序的来源数组，靠前者优先级高；
// enabledSources 控制哪些自动来源允许写入关联（manual 永远可写，不在此列）。
export interface PurchaseLinkSettings {
  sourceOrder: PurchaseLinkSourceId[];
  enabledSources: PurchaseLinkSourceId[];
}

export interface AiServiceSettings {
  /** OpenAI 兼容接口地址仅保存在本地配置中，由后台统一拼接 chat completions 路径。 */
  baseUrl: string;
  /** API Key 只允许进入后台请求 Authorization header，不得进入日志、通知或业务数据。 */
  apiKey: string;
  /** 模型名称由用户按所选 OpenAI 兼容服务填写，系统不替用户猜测供应商模型。 */
  model: string;
}

/**
 * 违禁词相关设置。
 * 当前只控制「系统默认违禁词」是否并入扫描。用户自定义词不受此开关影响。
 */
export interface ViolationWordsSettings {
  /** 是否把系统默认违禁词并入扫描。默认 true（开箱即用，避免新用户词库为空时无法扫描）。 */
  defaultWordsEnabled: boolean;
}

export interface AppSettings {
  shipmentCheck: ShipmentCheckSettings;
  purchaseLink: PurchaseLinkSettings;
  aiService: AiServiceSettings;
  violationWords: ViolationWordsSettings;
}

export interface AppSettingsPatch {
  shipmentCheck?: Partial<ShipmentCheckSettings>;
  purchaseLink?: Partial<PurchaseLinkSettings>;
  aiService?: Partial<AiServiceSettings>;
  violationWords?: Partial<ViolationWordsSettings>;
}

interface LegacyAiProductCopySettings {
  siliconFlowApiKey?: string;
  siliconFlowModel?: string;
}

type LegacyAppSettingsPatch = AppSettingsPatch & {
  aiProductCopy?: Partial<LegacyAiProductCopySettings>;
  aiListing?: Partial<LegacyAiProductCopySettings>;
};

export const MAX_SHIPMENT_CHECK_ORDER_LOOKBACK_DAYS = 7;

// 来源默认顺序：用户手动输入最高，备注提取次之，付款页抓取最低。
// 新增来源时追加到数组末尾，保持既有来源相对顺序不变。
export const LINK_SOURCE_DEFAULT_ORDER: PurchaseLinkSourceId[] = ['manual', 'merchant_notes', 'payment_success'];

// 默认开启的自动来源（不含 manual，manual 永远可写不受开关控制）。
export const LINK_SOURCE_DEFAULT_ENABLED: PurchaseLinkSourceId[] = ['merchant_notes', 'payment_success'];

const PURCHASE_LINK_SOURCE_IDS: ReadonlySet<PurchaseLinkSourceId> = new Set([
  'manual',
  'merchant_notes',
  'payment_success',
]);

export const DEFAULT_SHIPMENT_CHECK_SETTINGS: ShipmentCheckSettings = {
  enabled: true,
  autoShipEnabled: false,
  windowMinutes: 10,
  maxChecksPerAccountPerWindow: 3,
  minDispatchDelaySeconds: 30,
  maxDispatchDelaySeconds: 540,
  minTaskSpacingSeconds: 60,
  orderLookbackDays: MAX_SHIPMENT_CHECK_ORDER_LOOKBACK_DAYS,
  normalCooldownMinutes: 60,
  verificationCooldownMinutes: 360,
  failureCooldownMinutes: 60,
};

export const DEFAULT_PURCHASE_LINK_SETTINGS: PurchaseLinkSettings = {
  sourceOrder: [...LINK_SOURCE_DEFAULT_ORDER],
  enabledSources: [...LINK_SOURCE_DEFAULT_ENABLED],
};

export const DEFAULT_AI_SERVICE_SETTINGS: AiServiceSettings = {
  baseUrl: '',
  apiKey: '',
  model: '',
};

// 默认开启系统默认违禁词并入扫描，保证新用户在未导入自定义词时也能正常检测。
export const DEFAULT_VIOLATION_WORDS_SETTINGS: ViolationWordsSettings = {
  defaultWordsEnabled: true,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  shipmentCheck: DEFAULT_SHIPMENT_CHECK_SETTINGS,
  purchaseLink: DEFAULT_PURCHASE_LINK_SETTINGS,
  aiService: DEFAULT_AI_SERVICE_SETTINGS,
  violationWords: DEFAULT_VIOLATION_WORDS_SETTINGS,
};

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value < min || value > max) return fallback;
  return Math.round(value);
}

function cappedNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value < min) return fallback;
  return Math.min(Math.round(value), max);
}

// 归一化来源数组：过滤未知值、去重、并把用户遗漏的新来源补到末尾，
// 保证新增来源后老配置也能自动出现在设置页里。
function normalizeSourceOrder(input: unknown): PurchaseLinkSourceId[] {
  const raw = Array.isArray(input) ? (input as unknown[]).filter((id): id is PurchaseLinkSourceId =>
    typeof id === 'string' && PURCHASE_LINK_SOURCE_IDS.has(id as PurchaseLinkSourceId),
  ) : [];
  const seen = new Set<PurchaseLinkSourceId>();
  const ordered: PurchaseLinkSourceId[] = [];
  for (const id of raw) {
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  for (const id of LINK_SOURCE_DEFAULT_ORDER) {
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
}

function normalizeEnabledSources(input: unknown): PurchaseLinkSourceId[] {
  const raw = Array.isArray(input) ? (input as unknown[]).filter((id): id is PurchaseLinkSourceId =>
    typeof id === 'string' && PURCHASE_LINK_SOURCE_IDS.has(id as PurchaseLinkSourceId),
  ) : [];
  const seen = new Set<PurchaseLinkSourceId>();
  const enabled: PurchaseLinkSourceId[] = [];
  for (const id of raw) {
    if (id === 'manual') continue; // manual 只参与排序，不进 enabled 开关
    if (seen.has(id)) continue;
    seen.add(id);
    enabled.push(id);
  }
  return enabled;
}

export function normalizePurchaseLinkSettings(input?: Partial<PurchaseLinkSettings>): PurchaseLinkSettings {
  const fallback = DEFAULT_PURCHASE_LINK_SETTINGS;
  return {
    sourceOrder: input ? normalizeSourceOrder(input.sourceOrder) : [...fallback.sourceOrder],
    enabledSources: input ? normalizeEnabledSources(input.enabledSources) : [...fallback.enabledSources],
  };
}

export function normalizeShipmentCheckSettings(input?: Partial<ShipmentCheckSettings>): ShipmentCheckSettings {
  const normalized = {
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : DEFAULT_SHIPMENT_CHECK_SETTINGS.enabled,
    autoShipEnabled: typeof input?.autoShipEnabled === 'boolean'
      ? input.autoShipEnabled
      : DEFAULT_SHIPMENT_CHECK_SETTINGS.autoShipEnabled,
    windowMinutes: boundedNumber(input?.windowMinutes, DEFAULT_SHIPMENT_CHECK_SETTINGS.windowMinutes, 5, 120),
    maxChecksPerAccountPerWindow: cappedNumber(input?.maxChecksPerAccountPerWindow, DEFAULT_SHIPMENT_CHECK_SETTINGS.maxChecksPerAccountPerWindow, 1, 10),
    minDispatchDelaySeconds: boundedNumber(input?.minDispatchDelaySeconds, DEFAULT_SHIPMENT_CHECK_SETTINGS.minDispatchDelaySeconds, 10, 3600),
    maxDispatchDelaySeconds: boundedNumber(input?.maxDispatchDelaySeconds, DEFAULT_SHIPMENT_CHECK_SETTINGS.maxDispatchDelaySeconds, 30, 7200),
    minTaskSpacingSeconds: boundedNumber(input?.minTaskSpacingSeconds, DEFAULT_SHIPMENT_CHECK_SETTINGS.minTaskSpacingSeconds, 30, 1800),
    orderLookbackDays: boundedNumber(
      input?.orderLookbackDays,
      DEFAULT_SHIPMENT_CHECK_SETTINGS.orderLookbackDays,
      1,
      MAX_SHIPMENT_CHECK_ORDER_LOOKBACK_DAYS,
    ),
    normalCooldownMinutes: boundedNumber(input?.normalCooldownMinutes, DEFAULT_SHIPMENT_CHECK_SETTINGS.normalCooldownMinutes, 10, 24 * 60),
    verificationCooldownMinutes: boundedNumber(input?.verificationCooldownMinutes, DEFAULT_SHIPMENT_CHECK_SETTINGS.verificationCooldownMinutes, 30, 7 * 24 * 60),
    failureCooldownMinutes: boundedNumber(input?.failureCooldownMinutes, DEFAULT_SHIPMENT_CHECK_SETTINGS.failureCooldownMinutes, 10, 24 * 60),
  };
  const windowSeconds = normalized.windowMinutes * 60;
  const minDispatchDelaySeconds = Math.min(normalized.minDispatchDelaySeconds, Math.max(10, windowSeconds - 60));
  const maxWindowDelay = Math.max(minDispatchDelaySeconds, windowSeconds - 60);
  return {
    ...normalized,
    minDispatchDelaySeconds,
    maxDispatchDelaySeconds: Math.min(normalized.maxDispatchDelaySeconds, maxWindowDelay),
  };
}

function normalizeOptionalText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBaseUrl(value: unknown): string {
  return normalizeOptionalText(value).replace(/\/+$/u, '');
}

function normalizeLegacyAiServiceSettings(input?: Partial<LegacyAiProductCopySettings>): AiServiceSettings | null {
  if (!input) return null;
  const apiKey = normalizeOptionalText(input.siliconFlowApiKey);
  const model = normalizeOptionalText(input.siliconFlowModel);
  return {
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey,
    model: model || 'Qwen/QwQ-32B',
  };
}

export function normalizeAiServiceSettings(input?: Partial<AiServiceSettings>): AiServiceSettings {
  return {
    baseUrl: normalizeBaseUrl(input?.baseUrl),
    apiKey: normalizeOptionalText(input?.apiKey),
    model: normalizeOptionalText(input?.model),
  };
}

export function normalizeViolationWordsSettings(input?: Partial<ViolationWordsSettings>): ViolationWordsSettings {
  return {
    defaultWordsEnabled: typeof input?.defaultWordsEnabled === 'boolean'
      ? input.defaultWordsEnabled
      : DEFAULT_VIOLATION_WORDS_SETTINGS.defaultWordsEnabled,
  };
}

export function normalizeAppSettings(input?: AppSettingsPatch | LegacyAppSettingsPatch): AppSettings {
  // 旧版本把 AI 配置挂在复制商品或更早的 listing 语义下；归一化时统一提升到系统级 aiService。
  const legacyInput = input as LegacyAppSettingsPatch | undefined;
  const legacyAiService = normalizeLegacyAiServiceSettings(legacyInput?.aiProductCopy || legacyInput?.aiListing);
  return {
    shipmentCheck: normalizeShipmentCheckSettings(input?.shipmentCheck),
    purchaseLink: normalizePurchaseLinkSettings(input?.purchaseLink),
    aiService: normalizeAiServiceSettings(input?.aiService || legacyAiService || DEFAULT_AI_SERVICE_SETTINGS),
    violationWords: normalizeViolationWordsSettings(input?.violationWords),
  };
}
