import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_AI_LISTING_SETTINGS,
  DEFAULT_SHIPMENT_CHECK_SETTINGS,
  normalizeAppSettings,
  normalizeAiListingSettings,
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

test('AI listing settings keep SiliconFlow credentials local and normalize optional defaults', () => {
  const settings = normalizeAiListingSettings({
    siliconFlowApiKey: '  sk-test-123  ',
    siliconFlowModel: '  Qwen/QwQ-32B  ',
    defaultExpressTemplateId: '  47428464001  ',
  });

  assert.equal(settings.siliconFlowApiKey, 'sk-test-123');
  assert.equal(settings.siliconFlowModel, 'Qwen/QwQ-32B');
  assert.equal(settings.defaultExpressTemplateId, '47428464001');
});

test('AI listing settings fall back to a documented SiliconFlow chat model when model is empty', () => {
  const settings = normalizeAppSettings({
    aiListing: {
      siliconFlowApiKey: '',
      siliconFlowModel: '',
      defaultExpressTemplateId: '',
    },
  });

  assert.deepEqual(settings.aiListing, DEFAULT_AI_LISTING_SETTINGS);
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
