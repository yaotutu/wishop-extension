import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(resolve(import.meta.dirname, '../src/components/ActivityLogDrawer.tsx'), 'utf8');

test('activity log center uses a dense modal table instead of timeline drawer', () => {
  assert.match(source, /import \{[^}]*Modal[^}]*Table[^}]*\} from 'antd';/s);
  assert.doesNotMatch(source, /\bDrawer\b/);
  assert.doesNotMatch(source, /\bTimeline\b/);
  assert.match(source, /<Table<ActivityLogEntry>/);
  assert.match(source, /rowKey="id"/);
  assert.match(source, /size="small"/);
  assert.match(source, /pagination=\{false\}/);
});
