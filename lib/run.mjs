/**
 * Drives the browser: every theme, width and route, a measuring pass with
 * motion allowed and the page scrolled so revealed content is at rest, then a
 * pass with reduced motion emulated that looks for anything still moving.
 */

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { measurePage, sampleMotion } from './measure.mjs';
import { startCommand, startStatic } from './serve.mjs';

export async function loadPlaywright(cwd = process.cwd()) {
  try { return await import('playwright'); } catch {}
  try { return createRequire(join(cwd, 'package.json'))('playwright'); } catch {}
  throw new Error('Playwright is not installed. Add it as a dev dependency: npm i -D playwright');
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 60));
    }
    scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 60));
    scrollTo({ top: 0, behavior: 'instant' });
  });
}

async function open(page, url, theme) {
  const res = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  if (!res || res.status() >= 400) throw new Error(`the server answered ${res ? res.status() : 'nothing'}`);
  if (theme.attr) await page.evaluate(([sel, name, value]) => document.querySelector(sel).setAttribute(name, value), theme.attr);
  await page.evaluate(() => (document.fonts ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]) : null));
  await scrollThrough(page);
}

export async function run(config, { cwd = process.cwd(), onProgress = () => {}, chromePath } = {}) {
  const { chromium } = await loadPlaywright(cwd);
  const server = config.serve.static ? await startStatic(resolve(cwd, config.serve.static)) : await startCommand(config.serve.command, config.serve.url, { cwd });
  let browser;
  try {
    browser = await chromium.launch(chromePath ? { executablePath: chromePath } : {});
    let storageState;
    if (config.auth && config.auth.setup) {
      const missing = (config.auth.env || []).filter((k) => !process.env[k]);
      if (missing.length) throw new Error(`auth needs ${missing.join(', ')} in the environment`);
      storageState = join(cwd, config.auth.state || '.guardrails-auth.json');
      const r = spawnSync(process.execPath, [join(cwd, config.auth.setup), server.url, storageState], { cwd, stdio: 'inherit', env: process.env });
      if (r.status !== 0 || !existsSync(storageState)) throw new Error(`${config.auth.setup} did not sign in`);
    }
    const routes = config.serve.routes.map((route) => ({ route, auth: false })).concat(((config.auth && config.auth.routes) || []).map((route) => ({ route, auth: true })));
    const renders = [];
    const opts = { tokens: config.tokens, typeStyles: config.type.styles, icons: config.icons };
    for (const theme of config.themes) {
      for (const width of config.widths) {
        for (const reduced of [false, true]) {
          const context = await browser.newContext({
            viewport: { width, height: 900 },
            reducedMotion: reduced ? 'reduce' : 'no-preference',
            colorScheme: theme.colorScheme || 'light',
            ...(storageState ? { storageState } : {}),
          });
          const page = await context.newPage();
          for (const { route, auth } of routes) {
            if (auth && !storageState) continue;
            const label = { route: config.themes.length > 1 ? `${route} [${theme.name}]` : route, width };
            try {
              await open(page, server.url + route, theme);
              if (!reduced) {
                await page.waitForTimeout(config.motion.settleMs || 1200);
                const m = await page.evaluate(measurePage, opts);
                renders.push({ ...label, ...m });
                onProgress({ ...label, pass: 'measure' });
              } else {
                await page.waitForTimeout(500);
                const a = await page.evaluate(sampleMotion);
                await page.waitForTimeout(300);
                const b = await page.evaluate(sampleMotion);
                const moved = [];
                for (const [i, box] of Object.entries(a.boxes)) {
                  const after = b.boxes[i];
                  if (after && after[0] === box[0] && after.slice(1).join() !== box.slice(1).join()) moved.push(`${box[0]} moved`);
                }
                const reducedKeys = [...new Set([...moved, ...b.running.map((s) => `${s} running`)])];
                const target = renders.find((r) => r.route === label.route && r.width === width && !r.error);
                if (target) target.reduced = reducedKeys;
                onProgress({ ...label, pass: 'reduced motion' });
              }
            } catch (err) {
              if (!reduced) renders.push({ ...label, error: String(err.message || err).split('\n')[0] });
              onProgress({ ...label, error: String(err.message || err).split('\n')[0] });
            }
          }
          await context.close();
        }
      }
    }
    return renders;
  } finally {
    if (browser) await browser.close();
    await server.stop();
  }
}
