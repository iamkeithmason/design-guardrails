import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSource } from '../lib/source.mjs';

test('a raw duration in a transition fails, a token passes', () => {
  assert.equal(checkSource('.a:hover { transition: color 0.3s ease; }', 'a.css').length, 1);
  assert.equal(checkSource('.a { transition: color var(--duration-state) var(--ease-state); }', 'a.css').length, 0);
  assert.equal(checkSource('.a { animation-duration: 200ms; }', 'a.css').length, 1);
});

test('@keyframes fail outside the tokens file and pass inside it', () => {
  const css = '@keyframes pop { from { opacity: 0 } to { opacity: 1 } }';
  assert.equal(checkSource(css, 'a.css').length, 1);
  assert.equal(checkSource(css, 'tokens.css', { isTokens: true }).length, 0);
});

test('token definitions and comments are not findings', () => {
  assert.equal(checkSource(':root { --duration-state: 150ms; } /* transition: 1s */', 'a.css').length, 0);
});

test('the key names the selector, so it survives line moves', () => {
  const [f] = checkSource('\n\n@media (hover: hover) { .nav a:hover { transition: color .2s } }', 'a.css');
  assert.equal(f.key, 'a.css: .nav a:hover { transition: color .2s }');
});
