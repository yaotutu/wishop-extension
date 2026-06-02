import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  NOTIFICATION_TOPIC_DEFINITIONS,
  normalizeNotificationPreference,
} from '../src/shared/notification.ts';

test('notification topics only include explicit user-facing notification scenarios', () => {
  const topics = NOTIFICATION_TOPIC_DEFINITIONS.map(definition => definition.topic);
  assert.equal(topics.includes('scheduled_job.skipped' as any), false);
  assert.deepEqual(
    Object.keys(DEFAULT_NOTIFICATION_PREFERENCE.topicEnabled).sort(),
    topics.slice().sort(),
  );
});

test('notification preference normalization drops legacy audit topic keys', () => {
  const preference = normalizeNotificationPreference({
    topicEnabled: {
      'listing.audit_failed': false,
      'productAudit.audit_failed': false,
    },
    domainEnabled: {
      productAudit: false,
    },
  });

  assert.equal('listing.audit_failed' in preference.topicEnabled, false);
  assert.equal(preference.topicEnabled['productAudit.audit_failed'], false);
  assert.equal(preference.domainEnabled.productAudit, false);
});
