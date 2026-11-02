/**
 * @file     js/editor/face-widgets/number-font.js
 * @layer    EDITOR / face-widget template (number widgets) - ENGINE (no UI; the ribbon is js/editor/sprite-studio.js)
 * @summary  Style engine for the glyph set (TBUI font) behind a type 2/3 number widget.
 *
 * MODEL
 *   A number widget points at a FONT (M.fonts[hw.a]) = list of {char, spriteId} pairs; editing a font edits those glyph
 *   sprites. Edits are NON-DESTRUCTIVE: the original canvas of each glyph is kept (sprite.origCanvas) and the current look is
 *   always regenerated from it:
 *       source  = 'original' (the vendor glyphs) or 'font' (digits drawn from a typeface)
 *       original: palette recolor -> scale
 *       font:     text in family / size / bold / italic, solid or gradient fill, tabular digits
 *       then:     outline -> glow -> drop shadow (adds an even margin = "pad"), then letter spacing
 *
 * STATE  M.studio[fontIdx] = style (see defaultStyle). sprite.edited = true when the glyph differs from the original;
 *        rebuildActiveBin() then re-encodes those sprites with encodePA and repacks offsets.
 *
 * API  HT37.faceWidgets.numberFont:
 *   isNumberWidget(w), fontOf(w), usage(M, fi), getStyle(M, fi), apply(M, fi, style), reset(M, fi),
 *   fontsInFace(M), sizeReport(M), encodeSprite(s), isEditedFont(M, fi)
 */
(function () {
  window.HT37 = window.HT37 || {};
  HT37.faceWidgets = HT37.faceWidgets || {};

  const isNumberWidget = (w) => !!(w && w.hwMeta && (w.hwMeta.type === 2 || w.hwMeta.type === 3));
  const fontOf = (w) => (isNumberWidget(w) ? w.hwMeta.a : -1);
  const spriteById = (M, id) => M.sprites.find((s) => s.id === id);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const hexToRgb = (hex) => { const v = parseInt(String(hex).replace('#', ''), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
  const rgba = (hex, a) => { const c = hexToRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };

  function defaultStyle() {
    return {
      source: 'original', family: 'Arial', bold: false, italic: false, px: 0, tabular: true,
      scale: 100, spacing: 0,
      fill: { c1: '#00e5ff', grad: false, c2: '#0077ff' },
      palette: null, // [{orig:[r,g,b,a], color:'#rrggbb', opacity:0..100}] detected from the original glyphs
      tint: { mode: 'none', hue: 0, sat: 0, light: 0, color: '#ff3b30' }, // after the palette: 'shift' = relative hue/saturation/brightness, 'colorize' = one color, shading kept
      outline: { on: false, color: '#000000', width: 2 },
      glow: { on: false, color: '#00e5ff', radius: 6, strength: 2 },
      shadow: { on: false, color: '#000000', dx: 2, dy: 2, blur: 2, opacity: 80 }
    };
  }

  function fontsInFace(M) { return M && M.fonts ? M.fonts.filter((f) => (M.widgets || []).some((w) => (w.type === 2 || w.type === 3) && w.a === f.i)) : []; }

  function glyphIds(M, fi) { const f = M.fonts[fi]; return f ? [...new Set(f.pairs.map((p) => p.sprite))] : []; }

  function ensureOrig(M, fi) {
    glyphIds(M, fi).forEach((id) => { const s = spriteById(M, id); if (s && s.canvas && !s.origCanvas) { s.origCanvas = s.canvas; s.origW = s.w; s.origH = s.h; } });
  }

  /** Which canvas widgets and which other fonts use this font's glyph sprites. */
  function usage(M, fi) {
    const ids = new Set(glyphIds(M, fi));
    const widgetsUsing = (typeof widgets !== 'undefined' ? widgets : []).filter((w) => isNumberWidget(w) && w.hwMeta.a === fi);
    const fontsSharing = M.fonts.filter((f) => f.i !== fi && f.pairs.some((p) => ids.has(p.sprite))).map((f) => f.i);
    return { glyphIds: [...ids], widgetsUsing, fontsSharing };
  }

  // ------------------------------------------------------------------ palette detection (color layers of the original glyphs)
  function detectPalette(M, fi, idsOverride) {
    const idList = idsOverride || glyphIds(M, fi);
    idList.forEach((id) => { const s0 = spriteById(M, id); if (s0 && s0.canvas && !s0.origCanvas) { s0.origCanvas = s0.canvas; s0.origW = s0.w; s0.origH = s0.h; } });
    const bins = new Map();
    idList.forEach((id) => {
      const s = spriteById(M, id); if (!s || !s.origCanvas) return;
      const d = s.origCanvas.getContext('2d').getImageData(0, 0, s.origCanvas.width, s.origCanvas.height).data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 16) continue;
        const k = (d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4) + ',' + (d[i + 3] >> 6);
        const b = bins.get(k) || { n: 0, r: 0, g: 0, b: 0, a: 0 };
        b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; b.a += d[i + 3]; bins.set(k, b);
      }
    });
    const list = [...bins.values()].map((b) => ({ n: b.n, c: [b.r / b.n, b.g / b.n, b.b / b.n, b.a / b.n] })).sort((x, y) => y.n - x.n);
    const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2], (p[3] - q[3]) * 0.8);
    const clusters = [];
    list.forEach((e) => {
      const near = clusters.find((c) => dist(c.c, e.c) < 70);
      if (near) { const t = near.n + e.n; near.c = near.c.map((v, i) => (v * near.n + e.c[i] * e.n) / t); near.n = t; }
      else if (clusters.length < 5) clusters.push({ n: e.n, c: e.c.slice() });
      else { // assign to nearest existing cluster
        let best = clusters[0], bd = 1e9; clusters.forEach((c) => { const q = dist(c.c, e.c); if (q < bd) { bd = q; best = c; } });
        const t = best.n + e.n; best.c = best.c.map((v, i) => (v * best.n + e.c[i] * e.n) / t); best.n = t;
      }
    });
    clusters.sort((a, b) => b.n - a.n);
    return clusters.map((c) => ({ orig: c.c.map(Math.round), color: rgbToHex(c.c[0], c.c[1], c.c[2]), opacity: 100 }));
  }

  function getStyle(M, fi) {
    M.studio = M.studio || {};
    if (!M.studio[fi]) {
      const st = defaultStyle(); M.studio[fi] = st;
      st.palette = detectPalette(M, fi);
      if (st.palette[0]) { st.fill.c1 = st.palette[0].color; }
    }
    if (!M.studio[fi].tint) M.studio[fi].tint = defaultStyle().tint;
    return M.studio[fi];
  }

  const palOnly = (st) => !!(st.palette && st.palette.some((p) => p.color.toLowerCase() !== rgbToHex(p.orig[0], p.orig[1], p.orig[2]) || p.opacity !== 100));
  const tintActive = (st) => !!(st.tint && (st.tint.mode === 'colorize' || (st.tint.mode === 'shift' && (st.tint.hue || st.tint.sat || st.tint.light))));
  const paletteChanged = (st) => palOnly(st) || tintActive(st);
  const effectsOn = (st) => st.outline.on || st.glow.on || st.shadow.on;
  function isNeutral(st) { return st.source === 'original' && st.scale === 100 && !st.spacing && !paletteChanged(st) && !effectsOn(st); }
  function isEditedFont(M, fi) { return glyphIds(M, fi).some((id) => { const s = spriteById(M, id); return s && s.edited; }); }

  // ------------------------------------------------------------------ rendering
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };

  // --- HSL helpers for the tint step
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s2 = 0;
    if (mx !== mn) { const d = mx - mn; s2 = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    return [h, s2, l];
  }
  function hsl2rgb(h, s2, l) {
    h = ((h % 360) + 360) % 360 / 360; if (s2 === 0) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s2) : l + s2 - l * s2, p = 2 * l - q, f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  }
  /** Relative hue/saturation/brightness shift, or "colorize": every pixel takes the chosen color's hue and saturation and keeps its own light/dark relative to the set's average. */
  function applyTint(d, t) {
    let lref = 0.5;
    if (t.mode === 'colorize') { let sum = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 128) { sum += rgb2hsl(d[i], d[i + 1], d[i + 2])[2]; n++; } if (n) lref = sum / n; }
    const tc = t.mode === 'colorize' ? rgb2hsl.apply(null, hexToRgb(t.color)) : null;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      let [h, s2, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]);
      if (tc) { h = tc[0]; s2 = tc[1]; l = Math.max(0, Math.min(1, tc[2] + (l - lref))); }
      else { h += t.hue; s2 = Math.max(0, Math.min(1, s2 * (1 + t.sat / 100))); l = t.light >= 0 ? l + (1 - l) * t.light / 100 : l * (1 + t.light / 100); }
      const o = hsl2rgb(h, s2, l); d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2];
    }
  }

  function recolor(orig, st) {
    const cv = mk(orig.width, orig.height), c = cv.getContext('2d');
    c.drawImage(orig, 0, 0);
    if (!paletteChanged(st)) return cv;
    const img = c.getImageData(0, 0, cv.width, cv.height), d = img.data, P = palOnly(st) ? st.palette.map((p) => ({ o: p.orig, n: hexToRgb(p.color), k: p.opacity / 100 })) : [];
    for (let i = 0; i < d.length && P.length; i += 4) {
      if (!d[i + 3]) continue;
      let best = P[0], bd = 1e9;
      for (const p of P) { const q = Math.hypot(d[i] - p.o[0], d[i + 1] - p.o[1], d[i + 2] - p.o[2], (d[i + 3] - p.o[3]) * 0.8); if (q < bd) { bd = q; best = p; } }
      // shift by the palette delta so shading inside a color layer (gradients, anti-aliasing) is preserved
      d[i] = Math.max(0, Math.min(255, d[i] + best.n[0] - best.o[0]));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + best.n[1] - best.o[1]));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + best.n[2] - best.o[2]));
      d[i + 3] = Math.round(d[i + 3] * best.k);
    }
    if (tintActive(st)) applyTint(d, st.tint);
    c.putImageData(img, 0, 0);
    return cv;
  }

  function padFor(st) {
    let p = 0;
    if (st.outline.on) p = Math.max(p, st.outline.width);
    if (st.glow.on) p = Math.max(p, st.glow.radius);
    if (st.shadow.on) p = Math.max(p, Math.max(Math.abs(st.shadow.dx), Math.abs(st.shadow.dy)) + st.shadow.blur);
    return Math.ceil(p);
  }

  function silhouette(src, color) {
    const cv = mk(src.width, src.height), c = cv.getContext('2d');
    c.drawImage(src, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = color; c.fillRect(0, 0, cv.width, cv.height);
    return cv;
  }

  /** shadow -> glow -> outline -> glyph. Same canvas size as `src`: the glyph was already inset by the effect margin, so the cell never grows. */
  function withEffects(src, st) {
    const cv = mk(src.width, src.height), c = cv.getContext('2d'), OFF = 4000;
    const sh = (color, blur, dx, dy, alpha, times) => {
      for (let i = 0; i < times; i++) {
        c.save(); c.globalAlpha = alpha; c.shadowColor = color; c.shadowBlur = blur; c.shadowOffsetX = dx + OFF; c.shadowOffsetY = dy;
        c.drawImage(src, -OFF, 0); c.restore();
      }
    };
    if (st.shadow.on) sh(st.shadow.color, st.shadow.blur, st.shadow.dx, st.shadow.dy, st.shadow.opacity / 100, 1);
    if (st.glow.on) sh(st.glow.color, st.glow.radius, 0, 0, 1, Math.max(1, st.glow.strength));
    if (st.outline.on && st.outline.width > 0) {
      const sil = silhouette(src, st.outline.color);
      for (let r = 1; r <= st.outline.width; r++) for (let a = 0; a < 24; a++) { const t = (a / 24) * Math.PI * 2; c.drawImage(sil, Math.round(Math.cos(t) * r), Math.round(Math.sin(t) * r)); }
    }
    c.drawImage(src, 0, 0);
    return cv;
  }

  const fontCss = (st, px) => (st.italic ? 'italic ' : '') + (st.bold ? '700 ' : '400 ') + px + 'px "' + st.family + '", sans-serif';
  const isDigit = (ch) => ch >= 48 && ch <= 57;

  /**
   * Fit a typeface into the ORIGINAL digit cell: one font size for the whole set such that the widest digit and the digit height
   * both fit the (size-scaled, effect-inset) cell of the "0" glyph. Returns {px, asc, desc, digW}.
   */
  function fitTypeface(M, fi, st, innerW, innerH) {
    const c = mk(10, 10).getContext('2d');
    c.font = fontCss(st, 100);
    let adv = 1, asc = 1, desc = 0;
    for (const ch of '0123456789') { const m = c.measureText(ch); adv = Math.max(adv, m.width); asc = Math.max(asc, m.actualBoundingBoxAscent); desc = Math.max(desc, m.actualBoundingBoxDescent); }
    const px = Math.max(4, Math.min(innerH * 100 / (asc + desc), innerW * 100 / adv));
    c.font = fontCss(st, px);
    let a2 = 1, d2 = 0, w2 = 1;
    for (const ch of '0123456789') { const m = c.measureText(ch); w2 = Math.max(w2, m.width); a2 = Math.max(a2, m.actualBoundingBoxAscent); d2 = Math.max(d2, m.actualBoundingBoxDescent); }
    return { px, asc: a2, desc: d2, digW: w2 };
  }

  /** Apply a style to every glyph sprite of font `fi`. Every glyph keeps the footprint of its original sprite (x Size%), so layouts never move. */
  function apply(M, fi, style) {
    const font = M.fonts[fi]; if (!font) return;
    if (!style.tint) style.tint = defaultStyle().tint; // styles saved before the tint existed
    M.studio = M.studio || {}; M.studio[fi] = style;
    ensureOrig(M, fi);
    const ids = glyphIds(M, fi), neutral = isNeutral(style), pad = padFor(style), k = Math.max(0.1, style.scale / 100);
    const chOf = new Map(); font.pairs.forEach((p) => { if (!chOf.has(p.sprite)) chOf.set(p.sprite, p.ch); });
    const space = Math.round(style.spacing || 0);
    let fit = null;
    if (!neutral && style.source === 'font') {
      const zero = font.pairs.find((p) => p.ch === 48) || font.pairs.find((p) => isDigit(p.ch)) || font.pairs[0], zs = spriteById(M, zero.sprite);
      fit = fitTypeface(M, fi, style, Math.max(2, Math.round(zs.origW * k) - 2 * pad), Math.max(2, Math.round(zs.origH * k) - 2 * pad));
    }
    ids.forEach((id) => {
      const s = spriteById(M, id); if (!s || !s.origCanvas) return;
      if (neutral) { s.canvas = s.origCanvas; s.w = s.origW; s.h = s.origH; s.edited = false; return; }
      const fullW = Math.max(2, Math.round(s.origW * k)), cellH = Math.max(2, Math.round(s.origH * k));
      const iw = Math.max(2, fullW - 2 * pad), ih = Math.max(2, cellH - 2 * pad);
      const cw = Math.max(1, fullW + space), cell = mk(cw, cellH), c = cell.getContext('2d');
      const cx = Math.floor(space / 2) + fullW / 2, cy = cellH / 2, ch = chOf.get(id);
      if (fit && ch >= 32 && ch < 127) {
        const text = String.fromCharCode(ch);
        c.font = fontCss(style, fit.px); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
        const m = c.measureText(text), adv = style.tabular && isDigit(ch) ? Math.max(m.width, fit.digW) : m.width, sx = adv > iw ? iw / adv : 1;
        const top = cy - (fit.asc + fit.desc) / 2, base = top + fit.asc;
        if (style.fill.grad) { const gr = c.createLinearGradient(0, top, 0, top + fit.asc + fit.desc); gr.addColorStop(0, style.fill.c1); gr.addColorStop(1, style.fill.c2); c.fillStyle = gr; } else c.fillStyle = style.fill.c1;
        c.save(); c.translate(cx, base); c.scale(sx, 1); c.fillText(text, 0, 0); c.restore();
      } else {
        const src = recolor(s.origCanvas, style), f = Math.min(iw / s.origW, ih / s.origH);
        c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
        const dw = Math.max(1, Math.round(s.origW * f)), dh = Math.max(1, Math.round(s.origH * f));
        c.drawImage(src, Math.round(cx - dw / 2), Math.round(cy - dh / 2), dw, dh);
      }
      const out = (pad > 0) ? withEffects(cell, style) : cell;
      s.canvas = out; s.w = out.width; s.h = out.height; s.edited = true;
    });
    if (typeof window.syncBinWidgetsWithSensors === 'function') window.syncBinWidgetsWithSensors();
    if (typeof window.refreshDecompGallery === 'function') window.refreshDecompGallery();
  }

  function reset(M, fi) { const st = defaultStyle(); st.palette = detectPalette(M, fi); if (st.palette[0]) st.fill.c1 = st.palette[0].color; apply(M, fi, st); }

  function encodeSprite(s) {
    const cv = s.canvas, data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    return window.encodePA(data, cv.width, cv.height, !!(s.dec && s.dec.alpha), 2);
  }

  /** Space meter: raw bytes of the edited sprites before and after. */
  function sizeReport(M) {
    let before = 0, after = 0, n = 0;
    M.sprites.forEach((s, i) => {
      if (!s.edited) return;
      n++;
      const next = M.sprites[i + 1];
      before += (next ? next.absOff : (M.origU || M.u).length - 4) - s.absOff;
      after += (encodeSprite(s).length + 3) & ~3;
    });
    return { editedSprites: n, bytesBefore: before, bytesAfter: after };
  }

  HT37.faceWidgets.numberFont = { isNumberWidget, fontOf, usage, getStyle, defaultStyle, detectPalette, apply, reset, fontsInFace, sizeReport, encodeSprite, isEditedFont, isNeutral, clone, rgbToHex, recolor, withEffects, padFor, effectsOn, paletteChanged, tintActive, hexToRgb };
})();
