// Mutation tests for the pure classifier: each rule must flag a broken value
// and pass the repaired one. No browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, colourToken, gather, judge, judgeIcon, nextBaseline } from '../lib/classify.mjs';
import { normalise, ConfigError } from '../lib/config.mjs';

const config = normalise({
  serve: { static: '.', routes: ['/'] },
  mode: 'strict',
  type: { styles: { body: '.b' } },
  icons: { match: 'svg', pairWith: ['body'], minInkShare: 0.6, tapTarget: 44 },
});
const render = (extra = {}) => ({
  route: '/', width: 390,
  tokens: {
    colour: { '--ink': 'rgb(26, 26, 26)' },
    space: { '--space-4': '16px', '--space-6': '19.7px' },
    radius: { '--radius-sm': '4px' },
    duration: { '--duration-state': '0.15s' },
    easing: { '--ease-state': 'ease-out' },
  },
  typeStyles: { body: { key: 'Jost / 400 / normal / 16px / 24px / 0 / none', size: 16, lineHeight: 24 } },
  ...extra,
});

test('colour: a token, a token at reduced alpha, and transparent pass; anything else fails', () => {
  assert.equal(colourToken('rgb(26, 26, 26)', render().tokens.colour), '--ink');
  assert.equal(colourToken('rgba(26, 26, 26, 0.5)', render().tokens.colour), '--ink @ 0.5');
  assert.equal(judge('colour', 'rgba(0, 0, 0, 0)', render(), config).ok, true);
  assert.equal(judge('colour', 'rgb(28, 25, 23)', render(), config).ok, false);
});

test('space: a fluid token passes at the value it resolved to on this render', () => {
  assert.equal(judge('space', '19.7px', render(), config).ok, true);
  const j = judge('space', '18px', render(), config);
  assert.equal(j.ok, false);
  assert.match(j.suggest, /--space-6/);
});

test('radius, duration and easing compare against their own tokens', () => {
  assert.equal(judge('radius', '4px', render(), config).ok, true);
  assert.equal(judge('radius', '6px', render(), config).ok, false);
  assert.equal(judge('radius', '9999px', render(), config).ok, true);
  assert.equal(judge('duration', '150ms', render(), config).ok, true);
  assert.equal(judge('duration', '0.3s', render(), config).ok, false);
  assert.equal(judge('easing', 'ease-out', render(), config).ok, true);
  assert.equal(judge('easing', 'ease-in-out', render(), config).ok, false);
});

test('type: only a named style passes in strict mode', () => {
  assert.equal(judge('type', 'Jost / 400 / normal / 16px / 24px / 0 / none', render(), config).ok, true);
  assert.equal(judge('type', 'Jost / 400 / normal / 16px / 28px / 0 / none', render(), config).ok, false);
});

test('icons: the size is the paired font size and the box its line height, or a tap target', () => {
  assert.equal(judgeIcon({ w: 16, h: 16, box: 24 }, render(), config).ok, true);
  assert.equal(judgeIcon({ w: 16, h: 16, box: 44 }, render(), config).ok, true);
  assert.equal(judgeIcon({ w: 18, h: 18, box: 24 }, render(), config).ok, false);
  assert.equal(judgeIcon({ w: 16, h: 16, box: 28 }, render(), config).ok, false);
  assert.equal(judgeIcon({ w: 16, h: 16, box: 24, ink: 0.45 }, render(), config).thinInk, true);
});

test('strict mode: every off value is an error; baseline mode: only new ones', () => {
  const g = gather([render({ colour: { 'rgb(28, 25, 23)': [3, 'p text'] }, space: { '13px': [1, 'p marginTop'] } })], config);
  assert.equal(classify(g, config).filter((f) => f.level === 'error').length, 2);
  const base = { ...config, mode: 'baseline' };
  const held = classify(g, base, { written: 'x', colour: ['rgb(28, 25, 23)'], space: [] });
  assert.deepEqual(held.filter((f) => f.level === 'error').map((f) => f.family), ['space']);
});

test('a baseline entry nothing renders any more is reported', () => {
  const g = gather([render()], config);
  const f = classify(g, { ...config, mode: 'baseline' }, { written: 'x', radius: ['6px'] });
  assert.ok(f.some((x) => x.stale && x.key === '6px'));
});

test('the baseline may only shrink', () => {
  const g = gather([render({ space: { '13px': [1, 'p'] } })], config);
  const first = nextBaseline(g, null);
  assert.deepEqual(first.next.space, ['13px']);
  const grew = nextBaseline(gather([render({ space: { '13px': [1, 'p'], '18px': [1, 'p'] } })], config), first.next);
  assert.deepEqual(grew.refused, ['space: 18px']);
  const shrank = nextBaseline(gather([render()], config), first.next);
  assert.equal(shrank.removed, 1);
  assert.deepEqual(shrank.refused, []);
});

test('an exception needs a reason, and a stale one is reported', () => {
  assert.throws(() => normalise({ serve: { static: '.', routes: ['/'] }, exceptions: [{ family: 'colour', value: 'rgb(1, 2, 3)' }] }), ConfigError);
  const c = normalise({ serve: { static: '.', routes: ['/'] }, mode: 'strict', exceptions: [{ family: 'colour', value: 'rgb(1, 2, 3)', reason: 'brand swatch' }] });
  const f = classify(gather([render()], c), c);
  assert.ok(f.some((x) => x.level === 'warn' && x.key === 'rgb(1, 2, 3)'));
  const g = gather([render({ colour: { 'rgb(1, 2, 3)': [1, 'swatch'] } })], c);
  assert.equal(classify(g, c).filter((x) => x.level === 'error').length, 0);
});

test('reduced motion findings are errors', () => {
  const g = gather([render({ reduced: ['div.spin moved'] })], config);
  assert.equal(classify(g, config)[0].family, 'reduced');
});
