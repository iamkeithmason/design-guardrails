/**
 * The motion source rule: no raw `ms` or `s` in a transition or animation
 * declaration, and no @keyframes, outside the tokens file. It reads plain CSS
 * only. It exists because the rendered check does not measure hover and focus
 * states, and a raw `transition: color 0.3s` on a hover rule never renders
 * until someone hovers. Modelled on @shopify/stylelint-polaris's motion rules.
 *
 * Findings are keyed `file: selector property value`, without line numbers,
 * so a baseline entry survives edits elsewhere in the file.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Strips comments, keeping newlines so nothing shifts. */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/** Walks a stylesheet: yields { selector, prop, value, atRule } per declaration. */
export function* declarations(css) {
  const src = stripComments(css);
  const stack = [];
  let buf = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      stack.push(buf.trim().replace(/\s+/g, ' '));
      buf = '';
    } else if (ch === '}') {
      if (buf.trim()) yield* decl(buf, stack);
      stack.pop();
      buf = '';
    } else if (ch === ';') {
      yield* decl(buf, stack);
      buf = '';
    } else buf += ch;
  }
}

function* decl(text, stack) {
  const t = text.trim();
  if (!t) return;
  if (t.startsWith('@')) return; // @import and friends
  const at = t.indexOf(':');
  if (at < 0) return;
  const prop = t.slice(0, at).trim().toLowerCase();
  const value = t.slice(at + 1).trim().replace(/\s+/g, ' ');
  const selector = [...stack].reverse().find((s) => !s.startsWith('@')) || '';
  const atRule = stack.find((s) => /^@(-webkit-)?keyframes/.test(s)) || null;
  yield { selector, prop, value, atRule, stack: [...stack] };
}

const RAW_TIME = /(^|[\s,(])-?\d*\.?\d+m?s\b/;

/** Findings for one file. `isTokens` exempts @keyframes in the tokens file. */
export function checkSource(css, file, { isTokens = false } = {}) {
  const out = [];
  const seenKeyframes = new Set();
  for (const d of declarations(css)) {
    if (d.atRule) {
      if (!isTokens && !seenKeyframes.has(d.atRule)) {
        seenKeyframes.add(d.atRule);
        out.push({ file, key: `${file}: ${d.atRule}`, ex: '@keyframes belong in the tokens file' });
      }
      continue;
    }
    if (d.prop.startsWith('--')) continue; // a token definition
    if (!/^(transition|animation)(-duration|-delay)?$/.test(d.prop)) continue;
    if (!RAW_TIME.test(d.value)) continue;
    out.push({ file, key: `${file}: ${d.selector} { ${d.prop}: ${d.value} }`, ex: `${d.prop}: ${d.value}` });
  }
  return out;
}

/** Minimal glob: `*` within a segment, `**` across segments. No dependencies. */
export function glob(root, pattern) {
  const re = new RegExp('^' + pattern.split('/').map((seg) => (seg === '**' ? '(?:.*/)?' : seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '/')).join('').replace(/\/$/, '').replace(/\(\?:\.\*\/\)\?$/, '.*') + '$');
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.git') continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else {
        const rel = relative(root, p).split(sep).join('/');
        if (re.test(rel)) files.push(rel);
      }
    }
  };
  walk(root);
  return files.sort();
}

export function runSourceRule(root, config) {
  const src = config.source;
  if (!src || !src.css) return [];
  const files = [...new Set(src.css.flatMap((p) => glob(root, p)))];
  return files.flatMap((f) => checkSource(readFileSync(join(root, f), 'utf8'), f, { isTokens: (src.tokensFile || []).includes(f) }));
}
