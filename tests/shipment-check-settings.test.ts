import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_AI_SERVICE_SETTINGS,
  DEFAULT_SHIPMENT_CHECK_SETTINGS,
  normalizeAppSettings,
  normalizeAiServiceSettings,
  normalizeShipmentCheckSettings,
} from '../src/shared/settings.ts';

test('shipment check settings default to a ten minute randomized window', () => {
  assert.equal(DEFAULT_SHIPMENT_CHECK_SETTINGS.enabled, true);
  assert.equal(DEFAULT_SHIPMENT_CHECK_SETTINGS.windowMinutes, 10);
  assert.equal(DEFAULT_SHIPMENT_CHECK_SETTINGS.maxChecksPerAccountPerWindow, 3);
  assert.equal(DEFAULT_SHIPMENT_CHECK_SETTINGS.minDispatchDelaySeconds, 30);
  assert.equal(DEFAULT_SHIPMENT_CHECK_SETTINGS.maxDispatchDelaySeconds, 540);
  assert.equal(DEFAULT_SHIPMENT_CHECK_SETTINGS.minTaskSpacingSeconds, 60);
});

test('shipment check settings normalize unsafe values for the settings module', () => {
  const settings = normalizeShipmentCheckSettings({
    enabled: true,
    windowMinutes: 0,
    maxChecksPerAccountPerWindow: 100,
    minDispatchDelaySeconds: -1,
    maxDispatchDelaySeconds: 5,
    minTaskSpacingSeconds: 0,
    orderLookbackDays: 0,
    normalCooldownMinutes: 0,
    verificationCooldownMinutes: 0,
    failureCooldownMinutes: 0,
  });

  assert.equal(settings.windowMinutes, 10);
  assert.equal(settings.maxChecksPerAccountPerWindow, 10);
  assert.equal(settings.minDispatchDelaySeconds, 30);
  assert.equal(settings.maxDispatchDelaySeconds, 540);
  assert.equal(settings.minTaskSpacingSeconds, 60);
  assert.equal(settings.orderLookbackDays, 7);
  assert.equal(settings.normalCooldownMinutes, 60);
  assert.equal(settings.verificationCooldownMinutes, 360);
  assert.equal(settings.failureCooldownMinutes, 60);
});

test('app settings normalize nested shipment check settings', () => {
  const settings = normalizeAppSettings({
    shipmentCheck: { enabled: false, windowMinutes: 15 },
  });

  assert.equal(settings.shipmentCheck.enabled, false);
  assert.equal(settings.shipmentCheck.windowMinutes, 15);
  assert.equal(settings.shipmentCheck.maxChecksPerAccountPerWindow, 3);
});

test('AI service settings keep OpenAI-compatible credentials local and normalize text fields', () => {
  const settings = normalizeAiServiceSettings({
    baseUrl: '  https://llm.example.test/v1/  ',
    apiKey: '  sk-test-123  ',
    model: '  gpt-compatible  ',
  });

  assert.equal(settings.baseUrl, 'https://llm.example.test/v1');
  assert.equal(settings.apiKey, 'sk-test-123');
  assert.equal(settings.model, 'gpt-compatible');
});

test('AI service settings default to empty values until the user configures a compatible endpoint', () => {
  const settings = normalizeAppSettings({
    aiService: {
      baseUrl: '',
      apiKey: '',
      model: '',
    },
  });

  assert.deepEqual(settings.aiService, DEFAULT_AI_SERVICE_SETTINGS);
});

test('app settings migrate legacy AI product copy settings into the global AI service shape', () => {
  const settings = normalizeAppSettings({
    aiProductCopy: {
      siliconFlowApiKey: '  sk-legacy  ',
      siliconFlowModel: '  Qwen/QwQ-32B  ',
    },
  } as Parameters<typeof normalizeAppSettings>[0] & {
    aiProductCopy: { siliconFlowApiKey: string; siliconFlowModel: string };
  });

  assert.deepEqual(settings.aiService, {
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: 'sk-legacy',
    model: 'Qwen/QwQ-32B',
  });
});

test('shipment check dispatch delay stays inside the configured window', () => {
  const settings = normalizeShipmentCheckSettings({
    windowMinutes: 5,
    minDispatchDelaySeconds: 600,
    maxDispatchDelaySeconds: 7200,
  });

  assert.equal(settings.minDispatchDelaySeconds, 240);
  assert.equal(settings.maxDispatchDelaySeconds, 240);
});

test('shipment check order lookback stays within the WeChat order list limit', () => {
  const settings = normalizeShipmentCheckSettings({
    orderLookbackDays: 15,
  });

  assert.equal(settings.orderLookbackDays, 7);
});
