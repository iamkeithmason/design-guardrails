/**
 * Reads and checks design-guardrails.json. A bad config is exit 2: the check
 * could not run, which must never read as "found nothing".
 */

import { readFileSync, existsSync } from 'node:fs';

const DEFAULT_TOKENS = {
  colour: { prefix: ['--'] },
  space: { prefix: ['--space-'], allow: [] },
  radius: { prefix: ['--radius-'], allow: [] },
  duration: { prefix: ['--duration-', '--motion-'], allow: [] },
  easing: { prefix: ['--ease-', '--easing-'], allow: ['linear', 'ease'] },
};

export class ConfigError extends Error {}

export function readConfig(path) {
  if (!existsSync(path)) throw new ConfigError(`no config at ${path}`);
  let raw;
  try { raw = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { throw new ConfigError(`${path} is not valid JSON: ${e.message}`); }
  return normalise(raw);
}

export function normalise(raw) {
  const c = { ...raw };
  const s = c.serve || {};
  if (!s.static && !(s.command && s.url)) throw new ConfigError('serve needs either "static" (a folder) or "command" and "url"');
  if (!Array.isArray(s.routes) || !s.routes.length) throw new ConfigError('serve.routes must list at least one route');
  c.widths = c.widths || [1440, 390];
  c.mode = c.mode || 'baseline';
  if (!['strict', 'baseline'].includes(c.mode)) throw new ConfigError('mode must be "strict" or "baseline"');
  c.baseline = c.baseline || 'design-baseline.json';
  c.tokens = Object.fromEntries(Object.entries(DEFAULT_TOKENS).map(([k, d]) => [k, { ...d, ...((raw.tokens || {})[k] || {}) }]));
  for (const [k, t] of Object.entries(c.tokens)) {
    if (typeof t.prefix === 'string') t.prefix = [t.prefix];
    if (!Array.isArray(t.prefix)) throw new ConfigError(`tokens.${k}.prefix must be a list`);
  }
  c.type = c.type || {};
  c.type.styles = c.type.styles || {};
  c.icons = c.icons || null;
  if (c.icons) {
    for (const n of c.icons.pairWith || []) if (!c.type.styles[n]) throw new ConfigError(`icons.pairWith names "${n}", which is not in type.styles`);
  }
  c.motion = { reducedMotion: 'nothing-moves', ...(c.motion || {}) };
  c.themes = c.themes && c.themes.length ? c.themes : [{ name: 'default' }];
  c.exceptions = c.exceptions || [];
  for (const e of c.exceptions) {
    if (!e.family || !e.value) throw new ConfigError('each exception needs a family and a value');
    if (!e.reason || !String(e.reason).trim()) throw new ConfigError(`the exception ${e.value} has no reason: every exception says why`);
  }
  if (c.source) {
    c.source.css = c.source.css || [];
    c.source.tokensFile = [].concat(c.source.tokensFile || []);
  }
  return c;
}
