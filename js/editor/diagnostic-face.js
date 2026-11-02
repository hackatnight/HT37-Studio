/**
 * @file     js/editor/diagnostic-face.js
 * @layer    EDITOR content (the default face)
 * @summary  Builds the DIAGNOSTIC FACE: one numbered row per value the tool understands (time, date, year, day, hour, minute, seconds,
 *           weekday, AM/PM, weather, steps, heart rate, distance, calories, temperature, battery %), each with an icon and a label.
 *           Flash it and read what the watch shows next to what the editor shows (Live Watch Data card) to see which values match.
 *           It is also the default face the editor opens with.
 *
 * HOW
 *   - Static text and icons are drawn into the 360x360 background (the only static art every face is known to use).
 *   - Dynamic values are real watch widgets: number widgets (type 2/3 + font), weekday (type 4 sub 0), AM/PM (type 4 sub 6), weather icons (type 6 sub 2).
 *     Weekday / AM/PM / weather frames are drawn with their index ("W0".."W11") so you can tell which frame the watch picked.
 *   - The file is written by HT37.faceBuilder.build (js/dfu/face-builder.js), then loaded through the normal "Load .BIN" path.
 *   - AM/PM row: blank + the text "24H MODE" means the watch is in 24-hour mode; "AM"/"PM" means 12-hour.
 *   - Not included yet: analog hands (the hand sprite format can be read but not written) and the 11-frame gauges.
 * UI  "Diagnostic face" button next to "Load Template" in the .BIN Decompiler card. Loaded automatically at startup when no face is open.
 * API HT37.diagFace = { rows, buildSpec, buildBin, load }
 */
(function () {
  window.HT37 = window.HT37 || {};

  // Hide the stage and the layer list until the default face is in, so the old placeholder layers never flash on reload.
  const root = document.documentElement;
  if (!window.HT37_noAutoFace) {
    const st = document.createElement('style'); st.textContent = '.ht37-booting #watchCanvas, .ht37-booting #layerList { visibility: hidden; }'; document.head.appendChild(st);
    root.classList.add('ht37-booting'); setTimeout(() => root.classList.remove('ht37-booting'), 5000);
  }
  const reveal = () => root.classList.remove('ht37-booting');

  // value rows: [label, emoji, widget {type, sub}] ; left column first, then right column
  const LEFT = [
    ['Time', '⏰', { type: 2, sub: 0 }], ['Date', '📅', { type: 2, sub: 13 }], ['Year', '🗓️', { type: 2, sub: 19 }], ['Day#', '📆', { type: 2, sub: 1 }],
    ['Hour', '🕐', { type: 2, sub: 2 }], ['Min', '🕑', { type: 2, sub: 3 }], ['Sec', '⏱️', { type: 2, sub: 4 }],
    ['Weekday', '📖', { type: 4, sub: 0, kind: 'weekday' }], ['AM/PM', '🌓', { type: 4, sub: 6, kind: 'ampm' }], ['Weather', '🌤️', { type: 6, sub: 2, kind: 'weather' }]
  ];
  const RIGHT = [
    ['Steps', '👟', { type: 3, sub: 0 }], ['Heart', '❤️', { type: 3, sub: 8 }], ['Dist', '📏', { type: 3, sub: 6 }],
    ['Kcal', '🔥', { type: 3, sub: 7 }], ['Temp', '🌡️', { type: 3, sub: 11 }], ['Batt%', '🔋', { type: 3, sub: 15 }], ['BP', '🩸', { type: 3, sub: 9 }], ['SpO2', '💧', { type: 3, sub: 10 }]
  ];
  const Y0 = 62, ROW = 24;
  const COLS = [{ icon: 53, text: 71, right: 178, comp: 136, rows: LEFT }, { icon: 190, text: 208, right: 312, comp: 250, rows: RIGHT }];
  const GLYPHS = [['0', 8], ['1', 8], ['2', 8], ['3', 8], ['4', 8], ['5', 8], ['6', 8], ['7', 8], ['8', 8], ['9', 8], ['%', 12], ['-', 6], ['.', 4], ['/', 7], [':', 5], ['C', 9], ['F', 8], ['_', 8]];

  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  // build number drawn at the bottom of every test face so the version on the watch can be matched to what was pushed (increments on every build, remembered in localStorage)
  function nextVer() { let n = 0; try { n = parseInt(localStorage.getItem('ht37_facever') || '0', 10) || 0; } catch (e) {} n = Math.max(n, window.HT37_faceVer || 0) + 1; window.HT37_faceVer = n; try { localStorage.setItem('ht37_facever', String(n)); } catch (e) {} return n; }
  function stampVer(g) { const n = nextVer(); g.save(); g.fillStyle = '#facc15'; g.font = '700 14px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('v' + n, 180, 338); g.restore(); }
  function pixels(c) { return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; }
  function textSprite(txt, w, h, color, font) {
    const c = cv(w, h), g = c.getContext('2d');
    g.font = font; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2 + 1);
    return { w, h, alpha: true, rgba: pixels(c) };
  }

  function buildSpec() {
    const sprites = [], widgets = [], fonts = [[]];
    const add = (s) => { sprites.push(s); return sprites.length - 1; };
    // font 0: every glyph a value widget needs (digits, % - . / : C F _)
    GLYPHS.forEach(([ch, w]) => fonts[0].push({ ch: ch.charCodeAt(0), sprite: add(textSprite(ch, w, 16, '#7dd3fc', '700 14px "Segoe UI", Arial, sans-serif')) }));
    const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    // the watch stores language pairs INTERLEAVED (Chinese, English): weekday frame = a + 2*day + lang, AM/PM frame = a + 2*pm + lang
    const wk = sprites.length; DAYS.forEach((d) => { add(textSprite(d, 38, 16, '#fbbf24', '700 12px Arial, sans-serif')); add(textSprite(d, 38, 16, '#fbbf24', '700 12px Arial, sans-serif')); });
    // AM/PM frames have an opaque black backing so they cover the "24H" hint drawn in the background; in 24-hour mode the watch hides the label and the hint shows
    const ampmSprite = (t) => { const c = cv(42, 18), g2 = c.getContext('2d'); g2.fillStyle = '#000'; g2.fillRect(0, 0, 42, 18); g2.font = '700 12px Arial, sans-serif'; g2.fillStyle = '#fbbf24'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(t, 21, 10); return { w: 42, h: 18, alpha: true, rgba: pixels(c) }; };
    const ap = sprites.length; ['AM', 'AM', 'PM', 'PM'].forEach((t) => add(ampmSprite(t)));
    // 13 real frames (0 = unknown, 1..12 = sky codes sunny..foggy; frame index = sky code) + 3 spare frames: with no weather data the watch picks a frame past the set, which would otherwise be the next sprite (the background) drawn at this spot
    const wx = sprites.length; for (let i = 0; i < 16; i++) add(textSprite('W' + i, 34, 20, i < 13 ? '#fbbf24' : '#f87171', '700 12px Arial, sans-serif'));

    // background: static labels + icons
    const bg = cv(360, 360), g = bg.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 360, 360);
    g.textAlign = 'center'; g.fillStyle = '#6b7280'; g.font = '700 11px Arial, sans-serif'; g.textBaseline = 'middle';
    g.fillText('HT37 DIAGNOSTIC', 180, 30);
    let n = 0;
    COLS.forEach((col) => col.rows.forEach((r, i) => {
      n++; const y = Y0 + i * ROW;
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.font = '14px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; g.fillStyle = '#fff'; g.fillText(r[1], col.icon, y + 12);
      g.font = '700 11px Arial, sans-serif'; g.fillStyle = '#d1d5db'; g.fillText(n + ' ' + r[0], col.text, y + 12);
      if (r[2].kind === 'ampm') { g.font = '700 9px Arial, sans-serif'; g.fillStyle = '#9ca3af'; g.textAlign = 'left'; g.fillText('24H', col.comp + 1, y + 13); }
      g.strokeStyle = '#1f2937'; g.lineWidth = 1; g.beginPath(); g.moveTo(col.icon, y + ROW - 0.5); g.lineTo(col.right, y + ROW - 0.5); g.stroke();
    }));
    stampVer(g);
    const bgId = add({ w: 360, h: 360, alpha: false, rgba: pixels(bg), flag: 1 });
    const pv = cv(240, 240); pv.getContext('2d').drawImage(bg, 0, 0, 240, 240);
    const pvId = add({ w: 240, h: 240, alpha: false, rgba: pixels(pv), flag: 1 });

    widgets.push({ type: 0, sub: 0, x: 0, y: 0, a: bgId });
    COLS.forEach((col) => col.rows.forEach((r, i) => {
      const y = Y0 + i * ROW, w = r[2];
      if (w.kind === 'weekday') widgets.push({ type: 4, sub: 0, x: col.comp, y: y + 4, a: wk });
      else if (w.kind === 'ampm') widgets.push({ type: 4, sub: 6, x: col.comp, y: y + 3, a: ap });
      else if (w.kind === 'weather') widgets.push({ type: 6, sub: 2, x: col.comp, y: y + 2, a: wx });
      else widgets.push({ type: w.type, sub: w.sub, x: col.right, y: y + 4, a: 0, b: 2 });
    }));
    widgets.push({ type: 6, sub: 1, x: 0, y: 0, a: pvId });
    return { widgets, sprites, fonts, previewSprite: pvId };
  }

  // PROBE face: number widgets for every (type, sub) pair we have not decoded yet, one labeled row each. Flash it and note which ones show a value or change (looking for milliseconds / stopwatch).
  // (type, sub) pairs that real vendor faces use but we have not decoded (from 24 faces), plus a few that no face uses (3/9-3/14) to confirm they are absent
  const PROBES = [].concat(
    [5, 6, 7, 8, 9, 16, 20, 23, 24].map((sub) => ({ type: 2, sub })),
    [1, 2, 3, 4, 5, 25, 26, 27, 28, 9, 10, 12, 13, 14].map((sub) => ({ type: 3, sub }))
  );
  // second probe: (type, sub) pairs only seen on 1-2 vendor faces of the 351-face library (2/10-12, 2/25-31, 2/48, 3/22-24, 3/31, 3/41, 3/46, 3/47, 3/76)
  const PROBES2 = [10, 11, 12, 25, 26, 27, 28, 29, 30, 31, 48].map((sub) => ({ type: 2, sub })).concat([22, 23, 24, 31, 41, 46, 47, 76].map((sub) => ({ type: 3, sub })));
  // sweep pages: every (type, sub) number pair that no vendor face uses or that is still undecoded, 24 per page (probe3 .. probe6)
  const SWEEP = [].concat(
    [14, 15, 17, 18, 21, 22].concat(Array.from({ length: 16 }, (_, i) => 32 + i), Array.from({ length: 12 }, (_, i) => 49 + i)).map((sub) => ({ type: 2, sub })),
    [12, 13, 14, 17, 18, 19, 20, 21, 29, 30].concat(Array.from({ length: 9 }, (_, i) => 32 + i), [42, 43, 44, 45], Array.from({ length: 28 }, (_, i) => 48 + i)).map((sub) => ({ type: 3, sub }))
  );
  const SWEEP_PAGES = []; for (let i = 0; i < SWEEP.length; i += 24) SWEEP_PAGES.push(SWEEP.slice(i, i + 24));
  function buildProbeSpec(list, title, opt) {
    opt = opt || {}; const PERCOL = opt.perCol || 12;
    list = list || PROBES;
    const sprites = [], widgets = [], fonts = [[]];
    const add = (sp) => { sprites.push(sp); return sprites.length - 1; };
    const S = opt.big || 1;
    GLYPHS.forEach(([ch, w]) => fonts[0].push({ ch: ch.charCodeAt(0), sprite: add(textSprite(ch, Math.round(w * S), 16 * S, '#ffe600', '700 ' + (14 * S) + 'px "Segoe UI", Arial, sans-serif')) }));
    let wxp = 0; if (list.some((q) => q.type === 6)) { wxp = sprites.length; for (let i = 0; i < 16; i++) add(textSprite('W' + i, 44, 26, i < 13 ? '#ffe600' : '#ff6b6b', '700 20px Arial, sans-serif')); }
    const bg = cv(360, 360), g = bg.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 360, 360);
    g.fillStyle = '#6b7280'; g.font = '700 11px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(title || 'HT37 PROBE  (type.sub)', 180, 34);
    const PR = opt.pitch || 16, PY0 = 58, PCOLS = [{ text: 53, right: 178 }, { text: 190, right: 312 }];
    const G = opt.grid; const place = (i) => { if (G) { const c = i % G.cols, r = Math.floor(i / G.cols); return { col: { text: G.x0 + c * G.dx, right: G.x0 + c * G.dx + (G.w || 24) }, y: G.y0 + r * G.dy }; } const col = PCOLS[i < PERCOL ? 0 : 1], row = i < PERCOL ? i : i - PERCOL; return { col, y: PY0 + row * PR }; };
    list.forEach((pr, i) => {
      const { col, y } = place(i);
      g.textAlign = 'left'; g.font = '700 11px Arial, sans-serif'; g.fillStyle = '#ffffff'; g.fillText('T' + pr.type + '.' + pr.sub, col.text, y + 8);
      if (!G) { g.strokeStyle = '#1f2937'; g.beginPath(); g.moveTo(col.text, y + PR - 0.5); g.lineTo(col.right, y + PR - 0.5); g.stroke(); }
    });
    stampVer(g);
    const bgId = add({ w: 360, h: 360, alpha: false, rgba: pixels(bg), flag: 1 });
    const pv = cv(240, 240); pv.getContext('2d').drawImage(bg, 0, 0, 240, 240);
    const pvId = add({ w: 240, h: 240, alpha: false, rgba: pixels(pv), flag: 1 });
    widgets.push({ type: 0, sub: 0, x: 0, y: 0, a: bgId });
    list.forEach((pr, i) => { const { col, y } = place(i); if (pr.type === 6) widgets.push({ type: 6, sub: pr.sub, x: col.text, y: y + 16, a: wxp }); else widgets.push({ type: pr.type, sub: pr.sub, x: col.right, y: y + (G ? 16 : 1), a: 0, b: 2 }); });
    widgets.push({ type: 2, sub: 48, x: (opt.clock ? opt.clock.x : 252), y: (opt.clock ? opt.clock.y : 306), a: 0, b: 2 }); // live HH:MM:SS so every photo is time-stamped
    widgets.push({ type: 6, sub: 1, x: 0, y: 0, a: pvId });
    return { widgets, sprites, fonts, previewSprite: pvId };
  }

  const FACES = { diag: { name: 'HT37_Diagnostic_Face.bin', label: '🧪 Diagnostic face (all known values)', spec: () => buildSpec() }, probe: { name: 'HT37_Probe_Face.bin', label: '🔬 Probe face (untested widget types)', spec: () => buildProbeSpec() }, probe2: { name: 'HT37_Probe2_Face.bin', label: '🔬 Probe face 2 (rare vendor widgets)', spec: () => buildProbeSpec(PROBES2, 'HT37 PROBE 2  (type.sub)') } };
  SWEEP_PAGES.forEach((pg, i) => { FACES['probe' + (3 + i)] = { name: 'HT37_Probe' + (3 + i) + '_Face.bin', label: '🔬 Sweep page ' + (i + 1) + '/' + SWEEP_PAGES.length, spec: () => buildProbeSpec(pg, 'HT37 SWEEP ' + (i + 1) + '/' + SWEEP_PAGES.length) }; });
  const GRID = { cols: 4, x0: 52, dx: 70, y0: 62, dy: 86 };
  const SPREAD = [29, 30, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41].map((sub) => ({ type: 3, sub }));
  const SPREAD2 = [42, 43, 44, 45, 46, 47].map((sub) => ({ type: 3, sub }));
  FACES.probe7 = { name: 'HT37_Probe7_Face.bin', label: '🔬 Grid page A (T3.29-41)', spec: () => buildProbeSpec(SPREAD, 'HT37 GRID A  (vertical stacks)', { grid: GRID, big: 2 }) };
  FACES.probe8 = { name: 'HT37_Probe8_Face.bin', label: '🔬 Grid page B (T3.42-47)', spec: () => buildProbeSpec(SPREAD2, 'HT37 GRID B  (vertical stacks)', { grid: GRID, big: 2 }) };
  const HUM = [{ type: 3, sub: 51 }];
  FACES.probe9 = { name: 'HT37_Probe9_Face.bin', label: '🔬 Humidity test (T3.51 only, huge digits)', spec: () => buildProbeSpec(HUM, 'HT37 HUMIDITY TEST  (T3.51)', { grid: { cols: 1, x0: 70, dx: 0, y0: 120, dy: 0, w: 190 }, big: 3, clock: { x: 290, y: 215 } }) };
  const WX = Array.from({ length: 9 }, (_, i) => ({ type: 3, sub: 52 + i }));
  FACES.probe10 = { name: 'HT37_Probe10_Face.bin', label: '🔬 Weather slots T3.52-60 (big)', spec: () => buildProbeSpec(WX, 'HT37 WEATHER SLOTS  (T3.52-60)', { grid: { cols: 3, x0: 30, dx: 100, y0: 64, dy: 84, w: 62 }, big: 2 }) };
  const WX2 = Array.from({ length: 13 }, (_, i) => ({ type: 3, sub: 48 + i }));
  FACES.probe11 = { name: 'HT37_Probe11_Face.bin', label: '🔬 Weather slots T3.48-60 (big, 4 across)', spec: () => buildProbeSpec(WX2, 'HT37 WEATHER 48-60', { grid: { cols: 4, x0: 20, dx: 80, y0: 56, dy: 62, w: 62 }, big: 2 }) };
  const WX3 = Array.from({ length: 9 }, (_, i) => ({ type: 3, sub: 62 + i }));
  FACES.probe12 = { name: 'HT37_Probe12_Face.bin', label: '🔬 Weather slots T3.62-70 (big)', spec: () => buildProbeSpec(WX3, 'HT37 WEATHER 62-70', { grid: { cols: 3, x0: 30, dx: 100, y0: 64, dy: 84, w: 62 }, big: 2 }) };
  const ICONS = [0, 2, 3, 4, 5, 6, 7, 8, 9].map((sub) => ({ type: 6, sub }));
  FACES.probe13 = { name: 'HT37_Probe13_Face.bin', label: '🔬 Icon probe (type 6 subs, W frames)', spec: () => buildProbeSpec(ICONS, 'HT37 ICON PROBE (T6.n)', { grid: { cols: 3, x0: 40, dx: 100, y0: 64, dy: 84, w: 62 } }) };
  const buildBin = (kind) => HT37.faceBuilder.build(FACES[kind || 'diag'].spec());

  function load(why, kind) {
    kind = FACES[kind] ? kind : 'diag';
    if (FACES[kind].prepare && !FACES[kind].prepared) { FACES[kind].prepared = true; if (typeof log === 'function') log('Loading fonts for ' + FACES[kind].label + ' ...', 'info'); FACES[kind].prepare().then(() => load(why, kind), () => load(why, kind)); return true; } // some faces need web fonts loaded first
    const FN = FACES[kind].name;
    const input = document.getElementById('decompBinFileInput'), auto = document.getElementById('btnDecompAutoAssemble');
    if (!input) return false;
    const bytes = buildBin(kind), dt = new DataTransfer();
    dt.items.add(new File([bytes], FN, { type: 'application/octet-stream' }));
    input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    let tries = 0;
    const go = () => { const a = document.getElementById('btnDecompAutoAssemble'); if (window.decompiledBinData && window.decompiledBinData.fileName === FN && a) { a.click(); setTimeout(reveal, 250); } else if (++tries < 60) setTimeout(go, 50); else reveal(); };
    go();
    if (typeof log === 'function') log(FACES[kind].label + ' built (' + bytes.length.toLocaleString() + ' B)' + (why ? ' - ' + why : ''), 'ok');
    return true;
  }

  function mount(n) {
    const tpl = document.getElementById('btnDecompUseTemplate');
    if (!tpl || !document.getElementById('decompBinFileInput')) { if (n < 600) setTimeout(() => mount(n + 1), 25); else reveal(); return; }
    if (!document.getElementById('btnDiagFace')) {
      const row = document.createElement('div'); row.style.cssText = 'grid-column:1 / -1;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px';
      const sel = document.createElement('select'); sel.id = 'selTestFace'; sel.title = 'Built-in test faces made by this tool. Pick one and press Load, then flash it.';
      sel.style.cssText = 'height:26px;font-size:11px;min-width:0;background:#111827;color:#e2e8f0;border:1px solid #334155';
      Object.keys(FACES).forEach((k) => { const o = document.createElement('option'); o.value = k; o.textContent = FACES[k].label; sel.appendChild(o); });
      const b = document.createElement('button'); b.type = 'button'; b.id = 'btnDiagFace'; b.className = 'dock-btn'; b.textContent = 'Load';
      b.title = 'Loads the selected test face into the editor. Then use Flash to Watch.'; b.style.cssText = 'height:26px;font-size:11px';
      row.appendChild(sel); row.appendChild(b); tpl.parentElement.appendChild(row); b.addEventListener('click', () => load('button', sel.value));
    }
    if (!window.decompiledBinData && !window.HT37_noAutoFace) load('default face'); else reveal();
  }
  mount(0);
  // Other files add faces here (e.g. js/editor/forecast-face.js). Works before or after the Load dropdown exists.
  function addFace(key, def) {
    FACES[key] = def;
    const sel = document.getElementById('selTestFace');
    if (sel && !Array.from(sel.options).some((o) => o.value === key)) { const o = document.createElement('option'); o.value = key; o.textContent = def.label; sel.appendChild(o); }
  }
  HT37.diagFace = { rows: { left: LEFT, right: RIGHT }, buildSpec, buildProbeSpec, probes: PROBES, probes2: PROBES2, buildBin, load, addFace, helpers: { cv, pixels, textSprite, stampVer } };
})();
