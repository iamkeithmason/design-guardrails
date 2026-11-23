/**
 * What runs inside the page. `measurePage` is passed to Playwright's
 * page.evaluate, so it must be self-contained: no imports, no closures over
 * module scope. It returns plain data; lib/classify.mjs decides what is wrong.
 *
 * Tokens are read from the page's own stylesheets and resolved with probe
 * elements at the current viewport width, so a fluid token such as
 * clamp(1rem, 2vw, 2rem) is compared at the pixel value it renders here.
 */

export function measurePage(opts) {
  const { tokens, typeStyles, icons } = opts;
  const out = { tokens: {}, typeStyles: {}, colour: {}, type: {}, space: {}, radius: {}, duration: {}, easing: {}, icons: {}, errors: [] };
  const add = (map, key, ex) => { const e = map[key] || (map[key] = [0, ex]); e[0]++; };
  const label = (el) => {
    if (!el || !el.tagName) return '?';
    const c = (el.getAttribute('class') || '').trim();
    return el.tagName.toLowerCase() + (c ? '.' + c.split(/\s+/)[0] : '');
  };
  const px = (v) => (+parseFloat(v).toFixed(2)) + 'px';

  // 1. Every custom property defined anywhere in the page's own stylesheets.
  const names = new Set();
  const walk = (rules) => {
    for (const r of rules) {
      if (r.style) for (let i = 0; i < r.style.length; i++) if (r.style[i].startsWith('--')) names.add(r.style[i]);
      if (r.cssRules) walk(r.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules); } catch { out.errors.push('could not read a cross-origin stylesheet: ' + sheet.href); }
  }

  // 2. Resolve each token family with a probe. A name belongs to a family when
  // it starts with one of the family's prefixes.
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;';
  document.body.appendChild(probe);
  const resolve = (prop, value) => { probe.style.setProperty(prop, ''); probe.style.setProperty(prop, value); return getComputedStyle(probe).getPropertyValue(prop).trim(); };
  const families = {
    colour: ['color', (v) => v],
    space: ['width', (v) => v],
    radius: ['border-top-left-radius', (v) => v],
    duration: ['transition-duration', (v) => v],
    easing: ['transition-timing-function', (v) => v],
  };
  for (const [family, [prop]] of Object.entries(families)) {
    const spec = tokens[family];
    out.tokens[family] = {};
    if (!spec) continue;
    for (const name of names) {
      if (!spec.prefix.some((p) => name.startsWith(p))) continue;
      const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      if (!raw) continue;
      if (family === 'colour') {
        // Only names whose value is a colour: resolve against two different
        // fallbacks; a non-colour value leaves the fallback in place.
        probe.style.color = 'rgb(1, 2, 3)';
        const a = resolve('color', `var(${name})`);
        probe.style.color = 'rgb(4, 5, 6)';
        const b = resolve('color', `var(${name})`);
        if (a === b) out.tokens.colour[name] = a;
        continue;
      }
      const value = resolve(prop, `var(${name})`);
      if (value && value !== 'auto') out.tokens[family][name] = value;
    }
  }

  // 3. Named type styles: either a class to probe, or explicit values.
  for (const [name, style] of Object.entries(typeStyles || {})) {
    const el = document.createElement('span');
    el.textContent = 'Hg';
    if (typeof style === 'string') el.className = style.replace(/^\./, '').split('.').join(' ');
    else {
      const v = (x) => (typeof x === 'string' && x.startsWith('--') ? `var(${x})` : String(x));
      if (style.family) el.style.fontFamily = v(style.family);
      if (style.weight) el.style.fontWeight = v(style.weight);
      if (style.size) el.style.fontSize = v(style.size);
      if (style.lineHeight) el.style.lineHeight = v(style.lineHeight);
      if (style.tracking) el.style.letterSpacing = v(style.tracking);
      if (style.case === 'upper') el.style.textTransform = 'uppercase';
      if (style.style) el.style.fontStyle = style.style;
    }
    el.style.display = 'block';
    probe.appendChild(el);
    const cs = getComputedStyle(el);
    out.typeStyles[name] = { key: typeKey(cs), size: parseFloat(cs.fontSize), lineHeight: cs.lineHeight === 'normal' ? parseFloat(cs.fontSize) * 1.2 : parseFloat(cs.lineHeight) };
    el.remove();
  }

  function typeKey(cs) {
    return [
      cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
      cs.fontWeight,
      cs.fontStyle === 'italic' ? 'italic' : 'normal',
      px(cs.fontSize),
      cs.lineHeight === 'normal' ? 'normal' : px(cs.lineHeight),
      cs.letterSpacing === 'normal' ? '0' : px(cs.letterSpacing),
      cs.textTransform === 'uppercase' ? 'upper' : 'none',
    ].join(' / ');
  }

  // 4. Every visible element and its ::before and ::after.
  const iconSet = new Set(icons && icons.match ? document.querySelectorAll(icons.match) : []);
  const ignoreIcon = (el) => (icons && icons.ignore || []).some((s) => el.closest(s));
  const paints = (cs, where) => {
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') add(out.colour, cs.backgroundColor, where + ' background');
    for (const s of ['Top', 'Right', 'Bottom', 'Left']) {
      if (parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none') { add(out.colour, cs['border' + s + 'Color'], where + ' border'); break; }
    }
    for (const prop of ['boxShadow', 'textShadow']) {
      if (cs[prop] !== 'none') for (const m of cs[prop].matchAll(/(rgba?\([^)]*\)|color\(srgb [^)]*\))/g)) add(out.colour, m[1], where + ' shadow');
    }
  };
  const boxes = (cs, where) => {
    for (const p of ['marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'rowGap', 'columnGap']) {
      const v = cs[p];
      if (!v || v === 'normal' || v === 'auto' || parseFloat(v) === 0) continue;
      add(out.space, px(Math.abs(parseFloat(v))), `${where} ${p}`);
    }
    for (const c of ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft']) {
      const v = cs['border' + c + 'Radius'];
      if (v && parseFloat(v) !== 0) add(out.radius, v.includes('%') ? v : px(v.split(' ')[0]), `${where} radius`);
    }
  };
  const motion = (cs, where) => {
    const durations = cs.transitionDuration.split(',').concat(cs.animationName !== 'none' ? cs.animationDuration.split(',') : []);
    for (const d of durations.map((s) => s.trim())) if (d && parseFloat(d) !== 0) add(out.duration, d, where);
    const hasTransition = cs.transitionDuration.split(',').some((d) => parseFloat(d) !== 0);
    // Split timing functions on commas outside brackets.
    const split = (s) => s.match(/[^,(]+(\([^)]*\))?/g).map((x) => x.trim()).filter(Boolean);
    if (hasTransition) for (const e of split(cs.transitionTimingFunction)) add(out.easing, e, where);
    if (cs.animationName !== 'none') for (const e of split(cs.animationTimingFunction)) add(out.easing, e, where);
  };

  for (const el of document.querySelectorAll('body *')) {
    if (el === probe || probe.contains(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const where = label(el);

    if (iconSet.has(el) && !ignoreIcon(el)) {
      const box = (icons.box && el.closest(icons.box)) || el.parentElement;
      const br = box.getBoundingClientRect();
      let ink = null;
      if (el instanceof SVGSVGElement && el.viewBox && el.viewBox.baseVal && el.viewBox.baseVal.width) {
        try {
          const vb = el.viewBox.baseVal;
          const bb = el.getBBox();
          ink = +Math.max(bb.width / vb.width, bb.height / vb.height).toFixed(2);
        } catch { ink = null; }
      }
      const key = `${where} ${px(r.width)}×${px(r.height)} in ${px(br.height)}`;
      const e = out.icons[key] || (out.icons[key] = { n: 0, ex: where, w: r.width, h: r.height, box: br.height, ink });
      e.n++;
      if (ink != null && (e.ink == null || ink < e.ink)) e.ink = ink;
    }

    if (el instanceof SVGElement) {
      if (el.tagName.toLowerCase() === 'svg') continue;
      for (const p of ['fill', 'stroke']) {
        const v = cs[p];
        if (v && v !== 'none' && !v.startsWith('url(')) add(out.colour, v, label(el.ownerSVGElement && el.ownerSVGElement.parentElement) + ' svg ' + p);
      }
      continue;
    }
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (own) {
      add(out.colour, cs.color, where + ' text');
      add(out.type, typeKey(cs), where);
    }
    paints(cs, where);
    boxes(cs, where);
    motion(cs, where);
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') continue;
      if (ps.content !== '""' && ps.content !== "''") add(out.colour, ps.color, where + pseudo + ' text');
      paints(ps, where + pseudo);
      boxes(ps, where + pseudo);
      motion(ps, where + pseudo);
    }
  }
  probe.remove();
  return out;
}

/**
 * The reduced motion pass, run twice 300ms apart with the preference set to
 * reduce: what is animating, and where each element's box and opacity sit. A
 * change between the two samples is motion that ignored the preference,
 * including motion a script drives frame by frame.
 */
export function sampleMotion() {
  const label = (el) => {
    const c = (el.getAttribute('class') || '').trim();
    return el.tagName.toLowerCase() + (c ? '.' + c.split(/\s+/)[0] : '');
  };
  const boxes = {};
  let i = 0;
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) { i++; continue; }
    const cs = getComputedStyle(el);
    boxes[i++] = [label(el), Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), cs.opacity, cs.transform];
  }
  const running = document.getAnimations()
    .filter((a) => a.playState === 'running')
    .map((a) => {
      const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
      const target = a.effect && a.effect.target;
      return `${target ? label(target) : '?'} ${a.animationName || a.transitionProperty || 'script'} ${t.duration}ms${t.iterations === Infinity ? ' infinite' : ''}`;
    });
  return { boxes, running };
}
