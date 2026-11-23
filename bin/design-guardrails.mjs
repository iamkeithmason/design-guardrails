#!/usr/bin/env node
/**
 * design-guardrails: checks what the pages render against the design tokens.
 *
 *   npx design-guardrails                    check (config: design-guardrails.json)
 *   npx design-guardrails --report           also print the full inventory per family
 *   npx design-guardrails --baseline         write the baseline (first run) or shrink it
 *   npx design-guardrails --json out.json    write findings and inventory as JSON
 *   npx design-guardrails --source-only      run only the motion source rule (no browser)
 *   npx design-guardrails --config path      use another config file
 *
 * Exit codes: 0 nothing new off-token, 1 drift, 2 could not run. CI fails on
 * 1 and 2: a check that could not look must never read as one that found nothing.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { ConfigError, readConfig } from '../lib/config.mjs';
import { FAMILIES, classify, gather, nextBaseline } from '../lib/classify.mjs';
import { runSourceRule } from '../lib/source.mjs';

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const value = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const cwd = process.cwd();
const fail = (msg) => { console.error(`  Cannot run: ${msg}`); process.exit(2); };

let config;
try { config = readConfig(resolve(cwd, value('--config') || 'design-guardrails.json')); } catch (e) { fail(e instanceof ConfigError ? e.message : String(e)); }

const baselinePath = resolve(cwd, config.baseline);
const baseline = config.mode === 'baseline' && existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : {};
if (config.mode === 'baseline' && !existsSync(baselinePath) && !flag('--baseline')) fail(`mode is "baseline" but ${config.baseline} does not exist. Run with --baseline once to record today's drift.`);

let sourceFindings = [];
try { sourceFindings = runSourceRule(cwd, config); } catch (e) { fail(`the source rule could not read the CSS: ${e.message}`); }

let renders = [];
if (!flag('--source-only')) {
  const { run } = await import('../lib/run.mjs');
  const total = config.serve.routes.length * config.widths.length * config.themes.length;
  console.log(`  ${config.serve.routes.length} route(s) at ${config.widths.join(' and ')}px${config.themes.length > 1 ? `, ${config.themes.length} themes` : ''}: ${total} render(s), each measured then re-run with reduced motion\n`);
  try {
    renders = await run(config, { cwd, chromePath: process.env.CHROME_PATH, onProgress: (p) => { if (p.error) console.error(`  ${p.route} @${p.width} (${p.pass || 'load'}): ${p.error}`); } });
  } catch (e) { fail(e.message); }
  if (!renders.length || renders.every((r) => r.error)) fail('every route failed to load');
  const tokenCount = Object.values(renders.find((r) => !r.error).tokens).reduce((n, t) => n + Object.keys(t).length, 0);
  if (!tokenCount) fail('no tokens matched the configured prefixes: check tokens.*.prefix against the stylesheet');
}

const gathered = gather(renders, config);
if (flag('--source-only')) for (const f of FAMILIES) if (f !== 'source') { gathered.off[f] = Object.fromEntries((baseline[f] || []).map((k) => [k, { n: 0, pages: [], ex: [] }])); }

if (flag('--baseline')) {
  if (config.mode === 'strict') fail('strict mode has no baseline');
  if (flag('--source-only')) fail('--baseline needs the browser pass too');
  const { next, refused, removed, first } = nextBaseline(gathered, existsSync(baselinePath) ? baseline : null, sourceFindings);
  if (refused.length) {
    console.error(`  Refused: the baseline may only shrink, and ${refused.length} value(s) are not in it:`);
    for (const r of refused.slice(0, 20)) console.error(`    ${r}`);
    console.error('\n  Fix them, or add them to the file by hand with a reason a reviewer will see.');
    process.exit(1);
  }
  writeFileSync(baselinePath, JSON.stringify(next, null, 2) + '\n');
  const size = FAMILIES.reduce((n, f) => n + next[f].length, 0);
  console.log(first ? `  Wrote ${config.baseline}: ${size} off-token value(s) recorded.` : `  Shrank ${config.baseline} by ${removed} entr${removed === 1 ? 'y' : 'ies'}; ${size} remain.`);
  process.exit(0);
}

if (flag('--report')) {
  for (const family of FAMILIES) {
    const inv = family === 'source' ? Object.fromEntries(sourceFindings.map((f) => [f.key, { n: 1, pages: [f.file] }])) : gathered.inventory[family];
    const rows = Object.entries(inv || {}).sort((a, b) => b[1].n - a[1].n);
    if (!rows.length) continue;
    const off = family === 'source' ? inv : gathered.off[family];
    console.log(`  ${family}: ${rows.length} distinct, ${Object.keys(off || {}).length} off-token`);
    for (const [k, s] of rows) console.log(`    ${off && off[k] ? 'off' : '   '} ${String(s.n).padStart(5)}  ${k}`);
    console.log('');
  }
}

const findings = classify(gathered, config, baseline, sourceFindings);
for (const f of findings) console.log(`  ${f.family.padEnd(8)} ${f.level === 'error' ? 'error' : 'warn '}  ${f.message}`);
const errors = findings.filter((f) => f.level === 'error').length;
const measured = renders.filter((r) => !r.error).length;
const held = config.mode === 'baseline' ? FAMILIES.reduce((n, f) => n + (baseline[f] || []).length, 0) : 0;
console.log(`\n  ${measured} render(s)${sourceFindings.length || config.source ? ', source rule on' : ''}. ${errors} error(s), ${findings.length - errors} warning(s)${held ? `; ${held} known value(s) held in the baseline` : ''}.`);

const out = value('--json');
if (out) writeFileSync(resolve(cwd, out), JSON.stringify({ findings, off: gathered.off, inventory: gathered.inventory, source: sourceFindings }, null, 2) + '\n');
process.exit(errors ? 1 : 0);
