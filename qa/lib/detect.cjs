/**
 * In-page detector. Runs inside the browser via page.evaluate, so it must be fully self-contained
 * (no outer-scope references). Returns raw hits; engine.cjs turns them into findings.
 *
 * Every rule here is baseline-free: it needs only the rendered page. Rule ids match qa/rules.json.
 */
function detectInPage(opts) {
  const enabled = new Set(opts.enabled);
  const hits = [];
  const CAP = 60; // per rule per page, so one broken component cannot flood a run
  const perRule = {};
  const W = window.innerWidth;
  const csCache = new Map();
  const cs = (el) => {
    let v = csCache.get(el);
    if (!v) { v = getComputedStyle(el); csCache.set(el, v); }
    return v;
  };
  const rectOf = (el) => el.getBoundingClientRect();
  const sx = window.scrollX, sy = window.scrollY;
  const box = (r) => ({ x: Math.round(r.left + sx), y: Math.round(r.top + sy), w: Math.round(r.width), h: Math.round(r.height) });
  const selOf = (el) => {
    const parts = [];
    let n = el;
    for (let i = 0; n && n.nodeType === 1 && n !== document.body && i < 4; i++, n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(s + '#' + n.id); break; }
      const cls = (n.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)[0];
      if (cls) s += '.' + cls;
      parts.unshift(s);
    }
    return parts.join(' > ') || 'body';
  };
  const compOf = (el) => {
    const d = el.closest('[data-section]');
    if (d) return 'section:' + d.getAttribute('data-section') + (d.getAttribute('data-variant') ? '/' + d.getAttribute('data-variant') : '');
    const s = el.closest('section,header,footer,nav,main,article,aside');
    if (s) {
      const cls = (s.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)[0];
      return s.tagName.toLowerCase() + (cls ? '.' + cls : '');
    }
    return 'body';
  };
  const push = (rule, el, summary, detail, expected, actual) => {
    if (!enabled.has(rule)) return;
    perRule[rule] = (perRule[rule] || 0) + 1;
    if (perRule[rule] > CAP) return;
    hits.push({ rule, selector: selOf(el), component: compOf(el), box: box(rectOf(el)), summary, detail: detail || '', expected: expected || '', actual: actual || '' });
  };
  const visible = (el) => {
    if (el.checkVisibility) {
      if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    } else if (cs(el).display === 'none' || cs(el).visibility === 'hidden') return false;
    if (el.closest('[aria-hidden="true"],[hidden],[inert]')) return false;
    const r = rectOf(el);
    return r.width > 0 && r.height > 0;
  };
  const inFixed = (el) => {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      if (cs(n).position === 'fixed') return true;
    }
    return false;
  };
  const clips = (s) => s === 'hidden' || s === 'clip' || s === 'auto' || s === 'scroll';
  const clippedByAncestorX = (el) => {
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (clips(cs(n).overflowX)) return true;
    }
    return false;
  };
  const all = Array.from(document.body.querySelectorAll('*')).filter((e) => !e.closest('svg') || e.tagName.toLowerCase() === 'svg');
  const words = (t) => (t.trim().match(/\S+/g) || []).length;
  const baseName = (u) => (u || '').split('?')[0].split('/').pop().replace(/-[a-z0-9_]{6,}(?=\.)/i, '');

  // A1 viewport-overflow
  if (enabled.has('geo.viewport-overflow')) {
    const doc = document.documentElement;
    if (doc.scrollWidth > W + 2) {
      hits.push({ rule: 'geo.viewport-overflow', selector: 'html', component: 'page', box: { x: 0, y: 0, w: doc.scrollWidth, h: doc.scrollHeight }, summary: 'The page scrolls sideways: document is ' + doc.scrollWidth + 'px wide in a ' + W + 'px viewport.', detail: 'document', expected: '<= ' + W + 'px', actual: doc.scrollWidth + 'px' });
    }
    const bad = new Set();
    for (const el of all) {
      if (!visible(el) || inFixed(el)) continue;
      const r = rectOf(el);
      if (r.right > W + 2 && !clippedByAncestorX(el)) bad.add(el);
    }
    for (const el of bad) {
      if (el.parentElement && bad.has(el.parentElement)) continue;
      const r = rectOf(el);
      push('geo.viewport-overflow', el, 'Element extends ' + Math.round(r.right - W) + 'px past the right edge of the viewport.', 'right=' + Math.round(r.right), '<= ' + W + 'px', Math.round(r.right) + 'px');
    }
  }

  // A2 parent-overflow
  if (enabled.has('geo.parent-overflow')) {
    for (const el of all) {
      const st = cs(el);
      if (st.overflowX !== 'visible' || st.display === 'inline' || st.display === 'contents' || st.display === 'none') continue;
      if (!el.children.length || !visible(el)) continue;
      if (st.position === 'absolute' || st.position === 'fixed') continue;
      const r = rectOf(el);
      const padL = r.left + el.clientLeft, padR = padL + el.clientWidth;
      for (const c of el.children) {
        const cst = cs(c);
        if (cst.position === 'absolute' || cst.position === 'fixed' || cst.display === 'none' || cst.display === 'contents') continue;
        if (!visible(c)) continue;
        const cr = rectOf(c);
        if (cr.right <= padR + 2 && cr.left >= padL - 2) continue;
        // Overflow hidden further up means a deliberate carousel/track, not a leak.
        let carousel = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          if (clips(cs(p).overflowX)) { carousel = true; break; }
        }
        if (carousel) continue;
        const over = Math.round(Math.max(cr.right - padR, padL - cr.left));
        push('geo.parent-overflow', c, 'Element escapes its parent box by ' + over + 'px.', 'parent=' + selOf(el), 'inside parent', over + 'px outside');
      }
    }
  }

  // A3 clipped-text
  if (enabled.has('geo.clipped-text')) {
    for (const el of all) {
      const st = cs(el);
      if (st.overflowX !== 'hidden' && st.overflowX !== 'clip') continue;
      if (st.textOverflow === 'ellipsis' || st.webkitLineClamp !== 'none' && st.webkitLineClamp) continue;
      if (!el.textContent.trim() || !visible(el)) continue;
      if (st.clip !== 'auto' || st.clipPath !== 'none' || el.clientWidth <= 2) continue; // visually-hidden pattern
      // Text-bearing boxes only: block wrappers with many children are tracks/carousels, which clip on purpose.
      if (!Array.from(el.children).every((c) => cs(c).display.startsWith('inline'))) continue;
      if (el.scrollWidth > el.clientWidth + 2) {
        push('geo.clipped-text', el, 'Text is cut off: content is ' + (el.scrollWidth - el.clientWidth) + 'px wider than its box.', (el.textContent.trim().slice(0, 60)), el.clientWidth + 'px', el.scrollWidth + 'px');
      }
    }
  }

  // A4 micro-scroller
  if (enabled.has('geo.micro-scroller')) {
    for (const el of all) {
      if (/^(textarea|input|select)$/i.test(el.tagName)) continue;
      const st = cs(el);
      const r = rectOf(el);
      if (r.width === 0 || r.height === 0) continue;
      const dx = el.scrollWidth - el.clientWidth, dy = el.scrollHeight - el.clientHeight;
      const sx2 = (st.overflowX === 'auto' || st.overflowX === 'scroll') && dx > 1 && dx <= 100;
      const sy2 = (st.overflowY === 'auto' || st.overflowY === 'scroll') && dy > 1 && dy <= 100;
      if (sx2 || sy2) {
        push('geo.micro-scroller', el, 'A scroll box that only scrolls ' + (sx2 ? dx + 'px sideways' : dy + 'px vertically') + ', almost certainly by accident.', 'overflow-x=' + st.overflowX + ' overflow-y=' + st.overflowY, '0px', sx2 ? dx + 'px' : dy + 'px');
      }
    }
    const de = document.documentElement;
    void de;
  }

  // A5 zero-box
  if (enabled.has('geo.zero-box')) {
    for (const el of all) {
      const st = cs(el);
      if (st.display === 'none' || st.display === 'contents' || st.visibility === 'hidden') continue;
      if (el.closest('[aria-hidden="true"],[hidden],[inert],details:not([open]),dialog:not([open]),select,datalist')) continue;
      if (st.overflowX === 'hidden' || st.overflowY === 'hidden' || st.clip !== 'auto' || st.clipPath !== 'none') continue;
      let direct = false;
      for (const n of el.childNodes) {
        if (n.nodeType === 3 && n.nodeValue.trim()) { direct = true; break; }
        if (n.nodeType === 1 && n.tagName === 'IMG') { direct = true; break; }
      }
      if (!direct) continue;
      const r = rectOf(el);
      if (Math.round(r.width) !== 0 && Math.round(r.height) !== 0) continue;
      let collapsed = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const pr = rectOf(p);
        if ((pr.height === 0 || pr.width === 0) && (cs(p).overflowX === 'hidden' || cs(p).overflowY === 'hidden' || cs(p).display === 'none')) { collapsed = true; break; }
      }
      if (collapsed) continue;
      push('geo.zero-box', el, 'Element has content but renders ' + Math.round(r.width) + 'x' + Math.round(r.height) + 'px.', (el.textContent.trim().slice(0, 60)), 'non-zero', Math.round(r.width) + 'x' + Math.round(r.height));
    }
  }

  // A6 text-overlap (disabled by default; needs the component registry for intentional overlaps)
  if (enabled.has('geo.text-overlap')) {
    const leaves = [];
    for (const el of all) {
      const st = cs(el);
      if (st.position === 'absolute' || st.position === 'fixed' || st.position === 'sticky') continue;
      if (!visible(el)) continue;
      let direct = false;
      for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) { direct = true; break; }
      if (direct) leaves.push({ el, r: rectOf(el) });
      if (leaves.length > 1500) break;
    }
    leaves.sort((a, b) => a.r.top - b.r.top);
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i], b = leaves[j];
        if (b.r.top >= a.r.bottom) break;
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ix <= 0 || iy <= 0) continue;
        const small = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
        if (small > 0 && (ix * iy) / small > 0.25) {
          push('geo.text-overlap', a.el, 'Text overlaps other text (' + Math.round(100 * ix * iy / small) + '% of the smaller box).', 'other=' + selOf(b.el), 'no overlap', 'overlap');
        }
      }
    }
  }

  // A7 duplicate-sibling-src (disabled by default)
  if (enabled.has('media.duplicate-sibling-src')) {
    const groups = new Map();
    for (const img of document.body.querySelectorAll('img')) {
      const src = img.currentSrc || img.src;
      if (!src || /\.svg(\?|$)/i.test(src) || !visible(img)) continue;
      const r = rectOf(img);
      if (r.width < 48 || r.height < 48) continue;
      const scope = img.closest('[data-section],section,article,li,header,footer') || document.body;
      if (!groups.has(scope)) groups.set(scope, new Map());
      const m = groups.get(scope);
      const key = baseName(src);
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(img);
    }
    for (const m of groups.values()) {
      for (const [key, list] of m) {
        if (list.length > 1) push('media.duplicate-sibling-src', list[1], list.length + ' images in one component use the same file (' + key + ').', key, 'different images', 'same file x' + list.length);
      }
    }
  }

  // A8, A9, A10 image rules
  if (enabled.has('media.image-distortion') || enabled.has('media.image-upscaled') || enabled.has('media.percentage-clamp')) {
    const dpr = window.devicePixelRatio || 1;
    for (const img of document.body.querySelectorAll('img')) {
      if (!visible(img)) continue;
      const src = img.currentSrc || img.src || '';
      if (/\.svg(\?|$)/i.test(src)) continue;
      const r = rectOf(img);
      const st = cs(img);
      if (img.complete && img.naturalWidth > 0 && r.height > 0) {
        if (st.objectFit === 'fill') {
          const ratio = (r.width / r.height) / (img.naturalWidth / img.naturalHeight);
          if (Math.abs(ratio - 1) > 0.02) {
            push('media.image-distortion', img, 'Image is stretched: shown at ' + (r.width / r.height).toFixed(2) + ':1, file is ' + (img.naturalWidth / img.naturalHeight).toFixed(2) + ':1.', baseName(src), (img.naturalWidth / img.naturalHeight).toFixed(2), (r.width / r.height).toFixed(2));
          }
        }
        if (r.width >= 24 && r.width > (img.naturalWidth / dpr) * 1.15) {
          push('media.image-upscaled', img, 'Image shown at ' + Math.round(r.width) + 'px wide from a ' + img.naturalWidth + 'px file.', baseName(src), '<= ' + Math.round(img.naturalWidth / dpr) + 'px', Math.round(r.width) + 'px');
        }
      }
      const req = img.style.width || img.getAttribute('width') || '';
      const m = /^([\d.]+)%$/.exec(req.trim());
      if (m && parseFloat(m[1]) > 100.5 && img.parentElement) {
        const pw = img.parentElement.clientWidth;
        if (st.maxWidth === '100%' && r.width <= pw + 1) {
          push('media.percentage-clamp', img, 'Image asks for width ' + m[1] + '% but is clamped to its container by max-width:100%.', baseName(src), m[1] + '%', Math.round(r.width) + 'px of ' + pw + 'px');
        }
      }
    }
  }

  // A13 heading-order
  if (enabled.has('seo.heading-order')) {
    const hs = Array.from(document.body.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(visible);
    const h1s = hs.filter((h) => h.tagName === 'H1');
    const anchor = hs[0] || document.body;
    if (hs.length && h1s.length === 0) push('seo.heading-order', anchor, 'Page has no h1.', 'no-h1', '1 h1', '0');
    if (h1s.length > 1) push('seo.heading-order', h1s[1], 'Page has ' + h1s.length + ' h1 elements.', 'multi-h1', '1 h1', String(h1s.length));
    let prev = 0;
    for (const h of hs) {
      const lvl = +h.tagName[1];
      if (prev && lvl > prev + 1) push('seo.heading-order', h, 'Heading level jumps from h' + prev + ' to h' + lvl + '.', 'skip-' + prev + '-' + lvl, 'h' + (prev + 1) + ' or lower', 'h' + lvl);
      prev = lvl;
    }
  }

  // A14 tap-target (mobile widths only)
  if (enabled.has('a11y.tap-target') && W <= 768) {
    const q = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link]';
    for (const el of document.body.querySelectorAll(q)) {
      if (!visible(el)) continue;
      const r = rectOf(el);
      if (r.width >= 24 && r.height >= 24) continue;
      const st = cs(el);
      if (st.display === 'inline' && el.parentElement && el.parentElement.textContent.trim().length > el.textContent.trim().length + 12) continue;
      push('a11y.tap-target', el, 'Tap target is ' + Math.round(r.width) + 'x' + Math.round(r.height) + 'px (minimum 24x24).', (el.textContent.trim().slice(0, 40) || el.getAttribute('aria-label') || ''), '>= 24x24', Math.round(r.width) + 'x' + Math.round(r.height));
    }
  }

  // B1 heading-line-count
  if (enabled.has('typo.heading-line-count')) {
    for (const h of document.body.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
      if (!visible(h)) continue;
      const st = cs(h);
      let lh = parseFloat(st.lineHeight);
      if (!isFinite(lh)) lh = parseFloat(st.fontSize) * 1.2;
      const content = rectOf(h).height - parseFloat(st.paddingTop) - parseFloat(st.paddingBottom) - parseFloat(st.borderTopWidth) - parseFloat(st.borderBottomWidth);
      const lines = Math.round(content / lh);
      if (lines > 3) push('typo.heading-line-count', h, 'Heading wraps to ' + lines + ' lines at ' + st.fontSize + '.', h.textContent.trim().slice(0, 50), '<= 3 lines', lines + ' lines');
    }
  }

  // B2 extreme-aspect-text
  if (enabled.has('geo.extreme-aspect-text')) {
    const cand = [];
    for (const el of all) {
      if (!visible(el)) continue;
      const st = cs(el);
      if (st.writingMode !== 'horizontal-tb' || st.transform !== 'none') continue;
      const t = el.innerText || '';
      const n = words(t);
      if (n < 1 || n > 7) continue;
      const r = rectOf(el);
      if (r.height > 80 && r.width < 400 && r.height > 3 * r.width) cand.push(el);
    }
    for (const el of cand) {
      if (cand.some((o) => o !== el && el.contains(o))) continue; // deepest only
      const r = rectOf(el);
      push('geo.extreme-aspect-text', el, 'Narrow strip: ' + Math.round(r.width) + 'px wide and ' + Math.round(r.height) + 'px tall holding ' + words(el.innerText) + ' words.', el.innerText.trim().slice(0, 40), 'wider box', Math.round(r.width) + 'x' + Math.round(r.height));
    }
  }

  // B3 measure
  if (enabled.has('typo.measure')) {
    for (const p of document.body.querySelectorAll('p')) {
      if (!visible(p)) continue;
      const len = p.textContent.trim().length;
      if (len < 120) continue;
      const st = cs(p);
      let lh = parseFloat(st.lineHeight);
      if (!isFinite(lh)) lh = parseFloat(st.fontSize) * 1.2;
      const content = rectOf(p).height - parseFloat(st.paddingTop) - parseFloat(st.paddingBottom);
      const lines = Math.max(1, Math.round(content / lh));
      const cpl = len / lines;
      if (cpl > 90) push('typo.measure', p, 'Paragraph runs about ' + Math.round(cpl) + ' characters per line.', p.textContent.trim().slice(0, 40), '<= 90', String(Math.round(cpl)));
    }
  }

  // B5 orphan-width
  if (enabled.has('geo.orphan-width')) {
    for (const el of all) {
      const st = cs(el);
      const isGrid = st.display === 'grid' || st.display === 'inline-grid';
      const isWrap = (st.display === 'flex' || st.display === 'inline-flex') && st.flexWrap !== 'nowrap';
      if (!isGrid && !isWrap) continue;
      const kids = Array.from(el.children).filter((c) => visible(c) && cs(c).position !== 'absolute' && cs(c).position !== 'fixed');
      if (kids.length < 3) continue;
      const rows = [];
      for (const k of kids) {
        const top = Math.round(rectOf(k).top);
        const row = rows.find((r) => Math.abs(r.top - top) <= 2);
        if (row) row.n++; else rows.push({ top, n: 1 });
      }
      rows.sort((a, b) => a.top - b.top);
      if (rows.length >= 2 && rows[0].n >= 2 && rows[rows.length - 1].n === 1 && rows.slice(0, -1).every((r) => r.n === rows[0].n)) {
        push('geo.orphan-width', el, 'Last row of a ' + rows[0].n + '-column layout holds one lone item.', rows.map((r) => r.n).join('+'), 'balanced rows', rows.map((r) => r.n).join('+'));
      }
    }
  }

  return hits;
}

module.exports = { detectInPage };
