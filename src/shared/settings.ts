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

export interface AiServiceSettings {
  /** OpenAI 兼容接口地址仅保存在本地配置中，由后台统一拼接 chat completions 路径。 */
  baseUrl: string;
  /** API Key 只允许进入后台请求 Authorization header，不得进入日志、通知或业务数据。 */
  apiKey: string;
  /** 模型名称由用户按所选 OpenAI 兼容服务填写，系统不替用户猜测供应商模型。 */
  model: string;
}

export interface AppSettings {
  shipmentCheck: ShipmentCheckSettings;
  aiService: AiServiceSettings;
}

export interface AppSettingsPatch {
  shipmentCheck?: Partial<ShipmentCheckSettings>;
  aiService?: Partial<AiServiceSettings>;
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

export const DEFAULT_AI_SERVICE_SETTINGS: AiServiceSettings = {
  baseUrl: '',
  apiKey: '',
  model: '',
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  shipmentCheck: DEFAULT_SHIPMENT_CHECK_SETTINGS,
  aiService: DEFAULT_AI_SERVICE_SETTINGS,
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

export function normalizeAppSettings(input?: AppSettingsPatch | LegacyAppSettingsPatch): AppSettings {
  // 旧版本把 AI 配置挂在复制商品或更早的 listing 语义下；归一化时统一提升到系统级 aiService。
  const legacyInput = input as LegacyAppSettingsPatch | undefined;
  const legacyAiService = normalizeLegacyAiServiceSettings(legacyInput?.aiProductCopy || legacyInput?.aiListing);
  return {
    shipmentCheck: normalizeShipmentCheckSettings(input?.shipmentCheck),
    aiService: normalizeAiServiceSettings(input?.aiService || legacyAiService || DEFAULT_AI_SERVICE_SETTINGS),
  };
}
