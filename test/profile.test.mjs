import assert from 'node:assert/strict';
import { test } from 'node:test';

test('the PostgreSQL starter requires a schema-qualified table and a real application version', async () => {
  const url = new URL('../examples/postgres-profile.mjs', import.meta.url);
  process.env.DRILL_PROJECT_ID = 'inventory';
  process.env.DRILL_APP_VERSION = '2026.11';
  process.env.DRILL_REQUIRED_TABLE = 'public.orders';
  const { default: profile } = await import(url.href + '?valid');
  assert.equal(profile.id, 'inventory');
  assert.equal(profile.applicationVersion, '2026.11');
  assert.match(profile.suiteVersion, /public\.orders/);
  process.env.DRILL_REQUIRED_TABLE = "public.orders'); SELECT 1; --";
  await assert.rejects(import(url.href + '?invalid'), /DRILL_REQUIRED_TABLE/);
});
