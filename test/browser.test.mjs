// End to end: the CLI on a page with one of each defect must exit 1 and name
// each; the repaired page must exit 0. Proves the measurement can see them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const cli = (cfg) => spawnSync(process.execPath, ['bin/design-guardrails.mjs', '--config', cfg], { encoding: 'utf8' });

test('the repaired fixture passes', () => {
  const r = cli('test/fixtures/good.json');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('the broken fixture fails on every planted defect', () => {
  const r = cli('test/fixtures/bad.json');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  for (const want of [/colour +error +rgb\(200, 0, 0\)/, /space +error +13px/, /icons +error +svg\.icon 18px×18px in 24px/, /reduced +error +div\.spin/, /duration +error +1s/]) assert.match(r.stdout, want);
});

test('a missing config is exit 2, never a pass', () => {
  assert.equal(cli('test/fixtures/none.json').status, 2);
});
