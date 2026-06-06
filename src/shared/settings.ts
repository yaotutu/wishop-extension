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

export interface AiProductCopySettings {
  /** SiliconFlow API Key 仅保存在本地 chrome.storage，不进入日志和草稿请求。 */
  siliconFlowApiKey: string;
  /** 默认使用 SiliconFlow 文档里的聊天补全示例模型，设置页允许用户按账号额度自行替换。 */
  siliconFlowModel: string;
}

export interface AppSettings {
  shipmentCheck: ShipmentCheckSettings;
  aiProductCopy: AiProductCopySettings;
}

export interface AppSettingsPatch {
  shipmentCheck?: Partial<ShipmentCheckSettings>;
  aiProductCopy?: Partial<AiProductCopySettings>;
}

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

export const DEFAULT_AI_PRODUCT_COPY_SETTINGS: AiProductCopySettings = {
  siliconFlowApiKey: '',
  siliconFlowModel: 'Qwen/QwQ-32B',
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  shipmentCheck: DEFAULT_SHIPMENT_CHECK_SETTINGS,
  aiProductCopy: DEFAULT_AI_PRODUCT_COPY_SETTINGS,
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

export function normalizeAiProductCopySettings(input?: Partial<AiProductCopySettings>): AiProductCopySettings {
  const model = normalizeOptionalText(input?.siliconFlowModel);
  return {
    siliconFlowApiKey: normalizeOptionalText(input?.siliconFlowApiKey),
    siliconFlowModel: model || DEFAULT_AI_PRODUCT_COPY_SETTINGS.siliconFlowModel,
  };
}

export function normalizeAppSettings(input?: AppSettingsPatch): AppSettings {
  // 只在存储迁移和旧本地数据归一化时读取 aiListing，运行期设置统一使用 aiProductCopy。
  const legacyInput = input as AppSettingsPatch & { aiListing?: Partial<AiProductCopySettings> } | undefined;
  return {
    shipmentCheck: normalizeShipmentCheckSettings(input?.shipmentCheck),
    aiProductCopy: normalizeAiProductCopySettings(input?.aiProductCopy || legacyInput?.aiListing),
  };
}
