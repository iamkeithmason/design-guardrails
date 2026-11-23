/**
 * Pure: measurements + config + baseline -> findings. No browser, no files, so
 * its tests run in milliseconds (test/classify.test.mjs).
 *
 * Each render (one route at one width) is judged against the tokens as that
 * render resolved them, because a fluid token has a different pixel value at
 * every width. Off-token values are then gathered across renders.
 */

export const FAMILIES = ['colour', 'type', 'space', 'radius', 'duration', 'easing', 'icons', 'reduced', 'source'];

const TOL = 0.5; // px, for lengths that went through rounding

export function parseColour(value) {
  let m = value.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  m = value.match(/^color\(srgb ([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number);
    return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1];
  }
  return null;
}

/** The colour token a value is, or is at reduced alpha; null when neither. */
export function colourToken(value, tokens) {
  const c = parseColour(value);
  if (!c) return null;
  for (const [name, tv] of Object.entries(tokens)) {
    const t = parseColour(tv);
    if (!t || t[3] < 1) continue;
    if ([0, 1, 2].every((i) => Math.abs(t[i] - c[i]) <= 1)) return c[3] < 1 ? `${name} @ ${+c[3].toFixed(2)}` : name;
  }
  return null;
}

export const ms = (v) => (/ms$/.test(v) ? parseFloat(v) : parseFloat(v) * 1000);

/** The nearest numeric token, for a suggestion beside an off-scale value. */
export function nearest(value, tokens, toNumber = parseFloat) {
  const v = toNumber(value);
  let best = null;
  for (const [name, tv] of Object.entries(tokens)) {
    const t = toNumber(tv);
    if (!Number.isFinite(t)) continue;
    if (!best || Math.abs(t - v) < Math.abs(best.t - v)) best = { name, t, tv };
  }
  return best ? `${best.name} (${best.tv})` : null;
}

/** Is this one value on its family's tokens, for this render? */
export function judge(family, key, render, config) {
  const t = render.tokens[family] || {};
  const allow = new Set((config.tokens[family] && config.tokens[family].allow) || []);
  if (allow.has(key)) return { ok: true };
  switch (family) {
    case 'colour': {
      if (key === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(key)) return { ok: true };
      return { ok: !!colourToken(key, t) };
    }
    case 'space':
    case 'radius': {
      if (key.endsWith('%')) return { ok: allow.has(key) };
      const v = parseFloat(key);
      if (family === 'radius' && v >= 999) return { ok: true };
      const ok = Object.values(t).some((tv) => !tv.includes('%') && Math.abs(parseFloat(tv) - v) <= TOL);
      return ok ? { ok } : { ok, suggest: nearest(key, t) };
    }
    case 'duration': {
      const ok = Object.values(t).some((tv) => Math.abs(ms(tv) - ms(key)) < 1);
      return ok ? { ok } : { ok, suggest: nearest(key, t, ms) };
    }
    case 'easing':
      return { ok: Object.values(t).includes(key) };
    case 'type':
      return { ok: Object.values(render.typeStyles || {}).some((s) => s.key === key) };
    default:
      return { ok: false };
  }
}

/** Icons: the size must equal a paired style's font size, the box its line height. */
export function judgeIcon(icon, render, config) {
  const ic = config.icons || {};
  const pairs = (ic.pairWith || []).map((n) => render.typeStyles && render.typeStyles[n]).filter(Boolean);
  const near = (a, b) => Math.abs(a - b) <= TOL;
  const ok = pairs.some((p) => near(icon.w, p.size) && near(icon.h, p.size) && (near(icon.box, p.lineHeight) || (ic.tapTarget && icon.box >= ic.tapTarget)));
  const want = pairs.map((p) => `${+p.size.toFixed(2)}px in ${+p.lineHeight.toFixed(2)}px`).join(' or ');
  return { ok, want, thinInk: icon.ink != null && ic.minInkShare != null && icon.ink < ic.minInkShare };
}

/**
 * Judges every render and gathers off-token values per family:
 * { family: { key: { n, pages: [], ex: [], suggest } } }.
 * `inventory` holds every value seen, on or off, for --report.
 */
export function gather(renders, config) {
  const off = Object.fromEntries(FAMILIES.map((f) => [f, {}]));
  const inventory = Object.fromEntries(FAMILIES.map((f) => [f, {}]));
  const warnings = [];
  const note = (map, family, key, page, ex, extra = {}) => {
    const s = (map[family][key] ||= { n: 0, pages: [], ex: [], ...extra });
    s.n += 1;
    if (!s.pages.includes(page)) s.pages.push(page);
    if (ex && s.ex.length < 2 && !s.ex.includes(ex)) s.ex.push(ex);
    return s;
  };
  for (const r of renders) {
    if (r.error) continue;
    const page = `${r.route} @${r.width}`;
    for (const family of ['colour', 'type', 'space', 'radius', 'duration', 'easing']) {
      for (const [key, [n, ex]] of Object.entries(r[family] || {})) {
        const inv = note(inventory, family, key, page, ex);
        inv.n += n - 1;
        const j = judge(family, key, r, config);
        if (j.ok) continue;
        const s = note(off, family, key, page, ex, { suggest: j.suggest });
        s.n += n - 1;
      }
    }
    for (const [key, icon] of Object.entries(r.icons || {})) {
      const inv = note(inventory, 'icons', key, page, icon.ex);
      inv.n += icon.n - 1;
      const j = judgeIcon(icon, r, config);
      if (!j.ok) {
        const s = note(off, 'icons', key, page, icon.ex, { suggest: j.want ? `pair with a style: ${j.want}` : null });
        s.n += icon.n - 1;
      }
      if (j.thinInk) warnings.push({ level: 'warn', family: 'icons', key, message: `${key}: drawn ink fills ${Math.round(icon.ink * 100)}% of its box (needs ${Math.round(config.icons.minInkShare * 100)}%) on ${page}. Normalise its viewBox.` });
    }
    for (const key of r.reduced || []) note(off, 'reduced', key, page, null);
  }
  return { off, inventory, warnings: dedupe(warnings) };
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((f) => (seen.has(f.key) ? false : seen.add(f.key)));
}

/**
 * Off-token values against the mode, baseline and exceptions -> findings.
 * Strict: every off value is an error. Baseline: only values the baseline does
 * not hold are errors; entries nothing renders any more are warnings.
 */
export function classify({ off, warnings = [] }, config, baseline = {}, sourceFindings = []) {
  const findings = [...warnings];
  const exceptions = config.exceptions || [];
  const excepted = (family, key) => exceptions.some((e) => e.family === family && e.value === key);
  const allOff = { ...off, source: Object.fromEntries(sourceFindings.map((f) => [f.key, { n: 1, pages: [f.file], ex: [f.ex] }])) };
  const strict = config.mode === 'strict';
  for (const family of FAMILIES) {
    const held = new Set(strict ? [] : baseline[family] || []);
    for (const [key, s] of Object.entries(allOff[family] || {})) {
      if (excepted(family, key) || held.has(key)) continue;
      findings.push({ level: 'error', family, key, message: describe(family, key, s) });
    }
    if (!strict) {
      for (const key of held) {
        if (!(allOff[family] || {})[key]) findings.push({ level: 'warn', family, key, stale: true, message: `${key} is in the baseline but nothing renders it any more: --baseline will delete it` });
      }
    }
  }
  for (const e of exceptions) {
    if (!(allOff[e.family] || {})[e.value]) findings.push({ level: 'warn', family: e.family, key: e.value, message: `${e.value} is a listed exception but nothing renders it any more: delete it from the config` });
  }
  return findings;
}

function describe(family, key, s) {
  const where = `${s.n} use(s), e.g. ${s.ex.join(', ')} on ${s.pages.slice(0, 2).join(', ')}${s.pages.length > 2 ? ` and ${s.pages.length - 2} more` : ''}`;
  const hint = s.suggest ? `; nearest token ${s.suggest}` : '';
  switch (family) {
    case 'colour': return `${key} is not a colour token or a token at reduced alpha (${where})`;
    case 'type': return `${key} is not a named type style (${where})`;
    case 'space': return `${key} is off the spacing scale (${where}${hint})`;
    case 'radius': return `${key} is not a radius token (${where}${hint})`;
    case 'duration': return `${key} is not a duration token (${where}${hint})`;
    case 'easing': return `${key} is not an easing token (${where})`;
    case 'icons': return `${key} does not match a type pair (${where}${s.suggest ? `; ${s.suggest}` : ''})`;
    case 'reduced': return `${key} with prefers-reduced-motion: reduce (on ${s.pages.slice(0, 2).join(', ')}). Guard it with @media (prefers-reduced-motion: no-preference) or the motion library's setting`;
    case 'source': return `${key}: raw motion value in source; use a motion token (${s.ex[0]})`;
    default: return key;
  }
}

/**
 * The new baseline. The first write records everything off-token. After that
 * it may only shrink: it drops entries nothing renders, and refuses (returns
 * `refused`) if anything off-token is not already held.
 */
export function nextBaseline({ off }, baseline, sourceFindings = [], today = new Date().toISOString().slice(0, 10)) {
  const allOff = { ...off, source: Object.fromEntries(sourceFindings.map((f) => [f.key, {}])) };
  const first = !baseline || !baseline.written;
  const next = { written: first ? today : baseline.written, shrunk: today };
  const refused = [];
  let removed = 0;
  for (const family of FAMILIES) {
    const now = Object.keys(allOff[family] || {}).sort();
    if (first) { next[family] = now; continue; }
    const held = baseline[family] || [];
    for (const k of now) if (!held.includes(k)) refused.push(`${family}: ${k}`);
    next[family] = held.filter((k) => now.includes(k));
    removed += held.length - next[family].length;
  }
  if (first) delete next.shrunk;
  return { next, refused, removed, first };
}
