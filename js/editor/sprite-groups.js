/**
 * @file     js/editor/sprite-groups.js
 * @layer    EDITOR engine (generic sprite sets)
 * @summary  Every set of sprites the watch draws as one thing is a GROUP: a number font, a label set (weekday, AM/PM, units, text),
 *           a gauge (11 frames), an icon set (weather) or a static picture. Sprite Studio edits groups, and a SCOPE decides which groups
 *           an edit reaches (this widget / all numbers / all labels / dynamic / static / everything / checked layers), so one color
 *           change does not have to make the whole face the same color.
 *
 * GROUP { key, kind, dynamic, ids[], title, widgets[], locked }
 *   key   'f<i>' = number font i (styled by number-font.js, stored in M.studio[i]);  'g:<kind>:<a>:<sub>' = every other group (stored in M.studio[key])
 *   kind  number | label | gauge | icon | static | hand
 *   dynamic  true when the watch changes it by itself (time, sensors, weather, language/units); false for fixed art
 *   locked   hands: the flag-4 hand format can be read but not written yet, so they cannot be edited in the file
 * STYLE   the same object as number fonts (palette layers, tint, outline, glow, shadow). Groups other than numbers ignore typeface/size/spacing.
 *         The sprite keeps its size: effects are drawn inside the original footprint (content is fitted a few pixels smaller).
 * API     HT37.spriteGroups = { list, get, keyOfWidget, getStyle, apply, reset, isEdited, targets, propagate, SCOPES }
 */
(function () {
  window.HT37 = window.HT37 || {};
  const NF = () => HT37.faceWidgets.numberFont;
  const spr = (M, id) => M.sprites.find((s) => s.id === id);
  const range = (a, n) => Array.from({ length: n }, (_, i) => a + i);

  const SCOPES = [
    ['selected', 'This widget only'], ['numbers', 'All numbers'], ['labels', 'All labels'], ['gauges', 'All gauges'], ['icons', 'All icons'],
    ['dynamic', 'All dynamic (change on their own)'], ['static', 'All static (fixed art)'], ['all', 'Everything editable'], ['checked', 'Layers I ticked']
  ];

  let cache = { M: null, sig: '', list: [] };
  function list(M) {
    if (!M || !M.widgets) return [];
    const sig = M.widgets.map((w) => [w.type, w.sub, w.a].join(',')).join(';') + '#' + M.sprites.length;
    if (cache.M === M && cache.sig === sig) return cache.list;
    const groups = new Map();
    const add = (key, kind, dynamic, ids, hw, locked) => {
      ids = ids.filter((id) => { const s = spr(M, id); return s && s.dec && s.origCanvas || (s && s.dec && s.canvas); });
      if (!ids.length) return;
      let g = groups.get(key);
      if (!g) { g = { key, kind, dynamic, ids, hws: [], locked: !!locked }; groups.set(key, g); }
      g.hws.push(hw);
    };
    M.widgets.forEach((hw) => {
      const t = hw.type;
      if (t === 1) add('g:hand:' + hw.a + ':' + hw.sub, 'hand', true, [hw.a], hw, true);
      else if (t === 2 || t === 3) { const f = M.fonts && M.fonts[hw.a]; if (f) add('f' + hw.a, 'number', true, [...new Set(f.pairs.map((p) => p.sprite))], hw); }
      else if (t === 4) {
        const dyn = hw.sub === 0 || hw.sub === 6 || hw.a === 86;
        const n = hw.sub === 0 ? 14 : (hw.sub === 6 || hw.a === 86) ? 4 : 2;
        add('g:label:' + hw.a + ':' + hw.sub, 'label', dyn, range(hw.a, n), hw);
      } else if (t === 5) add('g:gauge:' + hw.a + ':' + hw.sub, 'gauge', true, range(hw.a, 11), hw);
      else if (t === 6) add('g:icon:' + hw.a + ':' + hw.sub, 'icon', hw.sub === 2, range(hw.a, hw.sub === 2 ? 13 : 1), hw);
      else if (t === 0) { const s = spr(M, hw.a); if (s && s.dec && !(s.w >= 350 && s.h >= 350) && !(s.w === 240 && s.h === 240)) add('g:static:' + hw.a + ':' + hw.sub, 'static', false, [hw.a], hw); }
    });
    const lv = HT37.layerView;
    const out = [...groups.values()].map((g) => {
      const d = lv ? lv.describe({ hwMeta: g.hws[0], text: '' }) : { title: g.kind };
      let title = d.title;
      if (g.kind === 'number') { const names = [...new Set(g.hws.map((h) => lv ? lv.describe({ hwMeta: h, text: '' }).title.replace(/ number$/, '') : 'value'))]; title = 'Digits font ' + g.key.slice(1) + ' (' + names.join(', ') + ')'; }
      else if (g.kind === 'static') title = 'Static picture (sprite ' + g.ids[0] + ')';
      return Object.assign(g, { title, widgets: g.hws });
    });
    cache = { M, sig, list: out };
    return out;
  }
  const get = (M, key) => list(M).find((g) => g.key === key) || null;

  function keyOfWidget(M, w) {
    const hm = w && w.hwMeta; if (!hm) return null;
    const g = list(M).find((x) => x.hws.some((h) => h.i === hm.i));
    return g ? g.key : null;
  }

  function getStyle(M, key) {
    const nf = NF(), g = get(M, key); if (!g) return null;
    if (g.kind === 'number') return nf.getStyle(M, Number(key.slice(1)));
    M.studio = M.studio || {};
    if (!M.studio[key]) { const st = nf.defaultStyle(); st.palette = nf.detectPalette(M, 0, g.ids); if (st.palette[0]) st.fill.c1 = st.palette[0].color; M.studio[key] = st; }
    if (!M.studio[key].tint) M.studio[key].tint = nf.defaultStyle().tint;
    return M.studio[key];
  }

  function contain(src, w, h, pad) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d'), iw = Math.max(2, w - 2 * pad), ih = Math.max(2, h - 2 * pad), f = Math.min(iw / src.width, ih / src.height);
    const dw = Math.max(1, Math.round(src.width * f)), dh = Math.max(1, Math.round(src.height * f));
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(src, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
    return cv;
  }

  function apply(M, key, style) {
    const nf = NF(), g = get(M, key); if (!g || g.locked) return;
    if (g.kind === 'number') return nf.apply(M, Number(key.slice(1)), style);
    if (!style.tint) style.tint = nf.defaultStyle().tint;
    M.studio = M.studio || {}; M.studio[key] = style;
    const neutral = nf.isNeutral(style), pad = nf.padFor(style);
    g.ids.forEach((id) => {
      const s = spr(M, id); if (!s) return;
      if (!s.origCanvas) { s.origCanvas = s.canvas; s.origW = s.w; s.origH = s.h; }
      if (s.blank) return; // removed Chinese sprite stays removed
      if (neutral) { s.canvas = s.origCanvas; s.w = s.origW; s.h = s.origH; s.edited = false; return; }
      let out = nf.recolor(s.origCanvas, style);
      if (pad > 0 && s.dec && s.dec.alpha) out = nf.withEffects(contain(out, s.origW, s.origH, pad), style);
      s.canvas = out; s.w = out.width; s.h = out.height; s.edited = true;
    });
    if (typeof window.syncBinWidgetsWithSensors === 'function') window.syncBinWidgetsWithSensors();
    if (typeof window.refreshDecompGallery === 'function') window.refreshDecompGallery();
  }

  function reset(M, key) {
    const nf = NF(), g = get(M, key); if (!g) return;
    if (g.kind === 'number') return nf.reset(M, Number(key.slice(1)));
    if (M.studio) delete M.studio[key];
    const st = getStyle(M, key); apply(M, key, st);
  }

  const isEdited = (M, key) => { const g = get(M, key); return !!g && g.ids.some((id) => { const s = spr(M, id); return s && s.edited && !s.blank; }); };

  /** Groups an edit reaches. The group being edited is always included. */
  function targets(M, scope, primaryKey) {
    const all = list(M).filter((g) => !g.locked), lv = HT37.layerView;
    let out;
    switch (scope) {
      case 'numbers': out = all.filter((g) => g.kind === 'number'); break;
      case 'labels': out = all.filter((g) => g.kind === 'label'); break;
      case 'gauges': out = all.filter((g) => g.kind === 'gauge'); break;
      case 'icons': out = all.filter((g) => g.kind === 'icon'); break;
      case 'dynamic': out = all.filter((g) => g.dynamic); break;
      case 'static': out = all.filter((g) => !g.dynamic); break;
      case 'all': out = all; break;
      case 'checked': {
        const keys = new Set(); const ticked = lv && lv.checked ? lv.checked : new Set();
        (typeof widgets !== 'undefined' ? widgets : []).forEach((w) => { if (ticked.has(w.id)) { const k = keyOfWidget(M, w); if (k) keys.add(k); } });
        out = all.filter((g) => keys.has(g.key)); break;
      }
      default: out = [];
    }
    const p = all.find((g) => g.key === primaryKey);
    if (p && !out.includes(p)) out = [p, ...out];
    return out;
  }

  /** Copy the properties that were just edited from the primary style onto every other target and re-render it. */
  function propagate(M, primaryKey, scope, props) {
    if (scope === 'selected') return 0;
    const nf = NF(), src = getStyle(M, primaryKey), pg = get(M, primaryKey); if (!src || !pg) return 0;
    let n = 0;
    targets(M, scope, primaryKey).forEach((g) => {
      if (g.key === primaryKey) return;
      const st = getStyle(M, g.key); if (!st) return;
      props.forEach((p) => {
        if (p === 'effects') { st.outline = nf.clone(src.outline); st.glow = nf.clone(src.glow); st.shadow = nf.clone(src.shadow); }
        else if (p === 'tint') { st.tint = nf.clone(src.tint); if (g.kind === 'number' && st.tint.mode === 'colorize') st.fill.c1 = st.tint.color; }
        else if (g.kind === 'number' && pg.kind === 'number' && ['scale', 'spacing', 'bold', 'italic', 'tabular', 'source', 'family', 'fill'].includes(p)) st[p] = nf.clone(src[p]);
      });
      apply(M, g.key, st); n++;
    });
    return n;
  }

  HT37.spriteGroups = { list, get, keyOfWidget, getStyle, apply, reset, isEdited, targets, propagate, SCOPES };
})();
