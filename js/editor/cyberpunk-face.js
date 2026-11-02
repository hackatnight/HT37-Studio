/**
 * @file     js/editor/cyberpunk-face.js
 * @layer    Demo face (our own original art, built from REAL watch widgets)
 * @summary  "Cyberpunk HUD" demo face: neon on black, a big HH:MM clock, four segmented progress bars around the bezel and a grid of live values.
 *           Listed in the test-face dropdown (Tab 1 > .BIN Decompiler card > Load) as "Cyberpunk HUD". All art is drawn by this tool.
 *
 * WATCH WIDGETS USED
 *   bars (type 5, 11 frames = 0%..100% in 10% steps; each bar is 10 slanted segments, frame k lights k of them):
 *     5/0 battery (top left) - known; 5/1 steps goal (top right) - known; 5/3 calories (bottom right) and 5/2 distance (bottom left) are a GUESS
 *     from vendor faces and are checked on the first flash (the static labels next to each bar are easy to swap in BARS below).
 *   numbers: 2/51 HH:MM with blinking colon, 2/4 seconds, 2/17 MM/DD/YYYY, 3/0 steps, 3/7 kcal, 3/6 distance, 3/8 heart rate, 3/10 SpO2 (unverified),
 *            3/9 blood pressure (unverified), 3/11 temperature, 3/15 battery %, 3/46 + 3/47 sleep hours / minutes, 3/48 / 3/49 today high / low, 3/61 compass heading (degrees, 0 = north).
 *   sprite sets: 4/0 weekday, 4/6 AM/PM (frames interleaved Chinese/English), 6/2 weather icon (frame = sky code), 6/0 Bluetooth link icon (2 frames).
 *   Everything is 12-hour and Fahrenheit because the watch is set that way; the face just shows what the watch reports.
 * FONTS  Orbitron (clock) and Share Tech Mono (values), both open source (SIL OFL), loaded from Google Fonts while designing (needs internet the
 *        first time); the glyphs are baked into the face as sprites.
 * ANIMATION  background = type 7 frame animation (6 full-screen frames, found on vendor faces such as 1004504): a driving-forward neon tunnel.
 *        Ring size grows by a fixed ratio per frame so the loop is seamless. Timing is ANIM.timing (guess; adjust after seeing it on the watch).
 * API    HT37.cyberFace = { buildSpec, BARS, ROWS }
 */
(function () {
  window.HT37 = window.HT37 || {};
  const C = { cy: '#00e5ff', mg: '#ff2bd6', ye: '#ffe600', li: '#39ff14', or: '#ff7a1a', wh: '#e8f6ff', dim: '#5b6b8a', pk: '#ff4d6d' };
  const TIME_FONT = 'Orbitron', DATA_FONT = 'Share Tech Mono';
  const GLYPHS = '0123456789:/-.%CF_'.split('');

  // four segmented bars, angles in degrees clockwise from 12 o'clock; every bar fills clockwise
  const BARS = [
    { name: 'BATT', sub: 0, a0: 280, color: C.li },
    { name: 'STEPS', sub: 1, a0: 10, color: C.cy },
    { name: 'KCAL', sub: 3, a0: 100, color: C.or },
    { name: 'DIST', sub: 2, a0: 190, color: C.ye }
  ];
  const SPAN = 70, SEGS = 10, R_OUT = 174, R_IN = 162, SKEW = 2;
  // value cells: [label, sub, font, side(0 left col,1 right col), row]
  const ROWS = [
    { label: 'STEPS', sub: 0, font: 3, col: 0, row: 0, color: C.cy, sample: '10349' },
    { label: 'KCAL', sub: 7, font: 4, col: 0, row: 1, color: C.or, sample: '412' },
    { label: 'DIST', sub: 6, font: 5, col: 0, row: 2, color: C.ye, sample: '4.8' },
    { label: 'HEADING', sub: 61, font: 2, col: 0, row: 4, color: C.wh, sample: '214' },
    { label: 'HR BPM', sub: 8, font: 6, col: 1, row: 0, color: C.pk, sample: '72' },
    { label: 'SPO2 %', sub: 10, font: 7, col: 1, row: 1, color: C.li, sample: '98' },
    { label: 'BP', sub: 9, font: 2, col: 1, row: 2, color: C.wh, sample: '120' },
    { label: 'TEMP', sub: 11, font: 2, col: 1, row: 3, color: C.wh, sample: '73F' }
  ];
  const ROW_Y0 = 146, ROW_PITCH = 22, COL = [{ label: 56, right: 162 }, { label: 190, right: 304 }];
  // animation: frame count and timing (high byte of b; vendor full-screen animations use 0x100..0xD00, meaning of the unit not measured yet: tune after the first flash)
  const ANIM = { frames: 6, timing: 0x300 };
  const rad = (d) => (d * Math.PI) / 180;
  const polar = (r, deg) => [180 + r * Math.sin(rad(deg)), 180 - r * Math.cos(rad(deg))];

  function segPath(g, bar, i, grow) {
    const w = SPAN / SEGS, a = bar.a0 + i * w + 0.6, b = bar.a0 + (i + 1) * w - 0.6, ro = R_OUT + (grow || 0), ri = R_IN - (grow || 0);
    const p = [polar(ri, a), polar(ri, b), polar(ro, b + SKEW), polar(ro, a + SKEW)];
    g.beginPath(); p.forEach((q, k) => (k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath();
  }
  function drawBar(g, bar, lit, mode) { // mode 'track' = dim empty segments, 'lit' = glowing segments
    for (let i = 0; i < SEGS; i++) {
      if (mode === 'track') { segPath(g, bar, i); g.fillStyle = bar.color + '24'; g.fill(); g.strokeStyle = bar.color + '66'; g.lineWidth = 1; g.stroke(); }
      else if (i < lit) {
        segPath(g, bar, i); g.fillStyle = bar.color; g.fill(); // solid (no blur: keeps the sprites small)
        segPath(g, bar, i); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1; g.stroke();
      }
    }
  }
  function barBox(bar) { // bounding box of all 10 segments plus a 2 px margin
    let x0 = 999, y0 = 999, x1 = -1, y1 = -1;
    for (let i = 0; i < SEGS; i++) for (const r of [R_IN, R_OUT]) for (const d of [bar.a0 + i * 7 + 0.6, bar.a0 + (i + 1) * 7 + 2]) { const p = polar(r, d); x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    x0 = Math.max(0, Math.floor(x0 - 2)); y0 = Math.max(0, Math.floor(y0 - 2)); x1 = Math.min(360, Math.ceil(x1 + 2)); y1 = Math.min(360, Math.ceil(y1 + 2));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function buildSpec() {
    const H = HT37.diagFace.helpers, sprites = [], fonts = [], widgets = [];
    const add = (s) => { sprites.push(s); return sprites.length - 1; };
    const mctx = document.createElement('canvas').getContext('2d');
    const fcss = (fam, px, wt) => HT37.fonts.css(fam, wt || 700, px);

    // ---- number fonts (glyph sprites). index 0 time, 1 seconds, 2 white data, 3 cyan, 4 orange, 5 yellow, 6 pink, 7 green
    function makeFont(fam, px, fill, h) {
      const css = fcss(fam, px), arr = []; mctx.font = css;
      const dw = Math.max.apply(null, '0123456789'.split('').map((d) => Math.ceil(mctx.measureText(d).width)));
      GLYPHS.forEach((ch) => {
        const w = /\d/.test(ch) ? dw : Math.max(4, Math.ceil(mctx.measureText(ch).width)), c = H.cv(w, h), g = c.getContext('2d');
        g.font = css; g.textAlign = 'center'; g.textBaseline = 'middle';
        if (Array.isArray(fill)) { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, fill[0]); gr.addColorStop(1, fill[1]); g.fillStyle = gr; } else g.fillStyle = fill;
        g.fillText(ch, w / 2, h / 2 + 1); arr.push({ ch: ch.charCodeAt(0), sprite: add({ w, h, alpha: true, rgba: H.pixels(c) }) });
      });
      fonts.push(arr); return { css, h, dw };
    }
    const F = [
      makeFont(TIME_FONT, 54, ['#f2fdff', '#00c8ff'], 62), makeFont(TIME_FONT, 20, C.mg, 24),
      makeFont(DATA_FONT, 16, C.wh, 19), makeFont(DATA_FONT, 16, C.cy, 19), makeFont(DATA_FONT, 16, C.or, 19),
      makeFont(DATA_FONT, 16, C.ye, 19), makeFont(DATA_FONT, 16, C.pk, 19), makeFont(DATA_FONT, 16, C.li, 19)
    ];
    const dateF = makeFont(DATA_FONT, 14, '#b8f3ff', 17); // font 8: date

    // ---- sprite sets
    const label = (t, w, h, col, px) => { const c = H.cv(w, h), g = c.getContext('2d'); g.font = fcss(DATA_FONT, px || 13); g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, w / 2, h / 2 + 1); return { w, h, alpha: true, rgba: H.pixels(c) }; };
    const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const wk = sprites.length; DAYS.forEach((d) => { add(label(d, 36, 16, C.mg, 14)); add(label(d, 36, 16, C.mg, 14)); }); // interleaved: frame = 2*day + language
    const ap = sprites.length; ['AM', 'AM', 'PM', 'PM'].forEach((t) => add(label(t, 28, 16, C.ye, 13)));
    const wx = sprites.length; for (let i = 0; i < 16; i++) { const c = H.cv(30, 30); if (i < 13) HT37.weatherIcons.draw(c.getContext('2d'), i, 30, C.cy, 'line', 0, 0); add({ w: 30, h: 30, alpha: true, rgba: H.pixels(c) }); }
    const OPT = Object.assign({}, HT37.bluetoothWidget.defaults, { style: 'link', size: 20, on: C.cy, off: C.pk });
    const bt = HT37.bluetoothWidget.build(OPT, add, 142, 24);

    // ---- bars: 11 frames each, cropped to the bar's box
    const barIds = BARS.map((bar) => {
      const box = barBox(bar); let first = -1;
      for (let k = 0; k <= SEGS; k++) {
        const c = H.cv(360, 360), g = c.getContext('2d'); drawBar(g, bar, k, 'lit');
        const id = add({ w: box.w, h: box.h, alpha: true, rgba: g.getImageData(box.x, box.y, box.w, box.h).data }); if (k === 0) first = id;
      }
      return { first, box };
    });

    // ---- static background (also used for the preview, with sample values added)
    // driving-forward tunnel: neon square rings grow from the vanishing point (180,180) while 16 radial lines make the grid walls.
    // Ring half-size = S0 * R^(i + phase); phase 0..1 over the frames, so the last frame flows straight back into the first.
    const S0 = 5, RR = 1.5;
    function drawTunnel(g, phase) {
      g.save(); g.beginPath(); g.arc(180, 180, 180, 0, Math.PI * 2); g.clip();
      const far = 340, dirs = []; [-1, -0.5, 0, 0.5, 1].forEach((u) => { dirs.push([1, u], [-1, u], [u, 1], [u, -1]); });
      const seen = {}; dirs.forEach(([dx, dy]) => { const k = dx + ',' + dy; if (seen[k]) return; seen[k] = 1; const m = Math.max(Math.abs(dx), Math.abs(dy)), ex = 180 + (dx / m) * far, ey = 180 + (dy / m) * far, sx = 180 + (dx / m) * 14, sy = 180 + (dy / m) * 14;
        const gr = g.createLinearGradient(sx, sy, ex, ey); gr.addColorStop(0, 'rgba(0,229,255,0.0)'); gr.addColorStop(0.35, 'rgba(0,229,255,0.30)'); gr.addColorStop(1, 'rgba(0,229,255,0.55)');
        g.strokeStyle = gr; g.lineWidth = 1; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke(); });
      for (let i = 0; i < 12; i++) {
        const sz = S0 * Math.pow(RR, i + phase); if (sz > far) break;
        const t = Math.min(1, sz / 200), al = (0.10 + 0.55 * t) * Math.min(1, sz / 12);
        const mix = (a, b) => Math.round(a + (b - a) * t); // small rings magenta, big rings cyan-white
        g.strokeStyle = 'rgba(' + mix(255, 120) + ',' + mix(43, 235) + ',' + mix(214, 255) + ',' + al.toFixed(3) + ')'; g.lineWidth = 1 + t * 1.5;
        g.strokeRect(180 - sz, 180 - sz, sz * 2, sz * 2);
      }
      g.restore();
    }
    function drawBackground(g, withSamples, phase) {
      g.save(); g.beginPath(); g.arc(180, 180, 180, 0, Math.PI * 2); g.clip();
      g.fillStyle = '#06050f'; g.fillRect(0, 0, 360, 360); // flat color: gradients and scanlines make every frame much bigger (RLE sprites)
      g.restore();
      drawTunnel(g, phase || 0);
      BARS.forEach((b) => drawBar(g, b, 0, 'track'));
      // thin inner ring with ticks
      g.strokeStyle = 'rgba(0,229,255,0.35)'; g.lineWidth = 1; [[12, 78], [102, 168], [192, 258], [282, 348]].forEach(([a, b]) => { g.beginPath(); g.arc(180, 180, 154, rad(a - 90), rad(b - 90)); g.stroke(); });
      g.strokeStyle = 'rgba(255,43,214,0.55)'; for (let a = 0; a < 360; a += 15) { if ((a % 90) < 10 || (a % 90) > 80) continue; const p = polar(150, a), q = polar(156, a); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); }
      // clock frame: cut-corner brackets
      const bracket = (x0, y0, x1, y1, col) => { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0 + 14); g.lineTo(x0, y0 + 6); g.lineTo(x0 + 6, y0); g.lineTo(x0 + 34, y0); g.moveTo(x1, y1 - 14); g.lineTo(x1, y1 - 6); g.lineTo(x1 - 6, y1); g.lineTo(x1 - 34, y1); g.stroke(); };
      bracket(66, 66, 304, 134, C.cy); g.strokeStyle = C.mg; g.lineWidth = 1; g.beginPath(); g.moveTo(304, 66); g.lineTo(272, 66); g.moveTo(66, 134); g.lineTo(98, 134); g.stroke();
      // tiny status text
      g.font = fcss(DATA_FONT, 9, 400); g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = C.dim; g.fillText('SYS//HUD', 72, 72); g.textAlign = 'right'; g.fillText('T-CLK', 298, 128);
      g.fillStyle = C.mg; g.textAlign = 'left'; g.fillText('NET', 118, 34); g.fillStyle = C.li; g.fillText('PWR', 226, 34);
      // data grid
      g.strokeStyle = 'rgba(0,229,255,0.45)'; g.lineWidth = 1; [140, 254].forEach((y) => { g.beginPath(); g.moveTo(58, y + 0.5); g.lineTo(302, y + 0.5); g.stroke(); });
      g.beginPath(); g.moveTo(180.5, 146); g.lineTo(180.5, 246); g.strokeStyle = 'rgba(255,43,214,0.45)'; g.stroke();
      g.textAlign = 'left'; g.font = fcss(DATA_FONT, 10, 700);
      ROWS.forEach((r) => { const y = ROW_Y0 + r.row * ROW_PITCH; g.fillStyle = r.color; g.fillText(r.label, COL[r.col].label, y + 10); });
      const sy = ROW_Y0 + 3 * ROW_PITCH; g.fillStyle = C.mg; g.fillText('SLEEP', COL[0].label, sy + 10); g.fillStyle = C.dim; g.fillText('H', 120, sy + 12); g.fillText('M', 156, sy + 12);
      const hy = ROW_Y0 + 4 * ROW_PITCH; g.fillStyle = C.cy; g.fillText('HI/LO', COL[1].label, hy + 10); g.fillStyle = C.dim; g.font = fcss(DATA_FONT, 14, 700); g.textAlign = 'center'; g.fillText('/', 268, hy + 9);
      // bottom strip
      g.strokeStyle = 'rgba(0,229,255,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(96, 276.5); g.lineTo(150, 276.5); g.moveTo(210, 276.5); g.lineTo(264, 276.5); g.stroke();
      g.font = fcss(DATA_FONT, 9, 400); g.fillStyle = C.dim; g.textAlign = 'right'; g.fillText('WX//LOCAL', 148, 270); g.textAlign = 'left'; g.fillText('HT37//NEON', 212, 270);
      g.fillStyle = C.mg; g.font = fcss(TIME_FONT, 10, 700); g.textAlign = 'center'; g.fillText('CYBER HUD', 180, 306);
      if (withSamples) {
        const put = (txt, font, rx, y, a) => { g.font = font.css; g.fillStyle = a; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(txt, rx, y + font.h / 2 + 1); };
        ROWS.forEach((r) => put(r.sample, F[r.font], COL[r.col].right, ROW_Y0 + r.row * ROW_PITCH, r.color));
        put('7', F[2], 112, sy, C.mg); put('42', F[2], 152, sy, C.mg);
        put('78F', F[2], 255, hy, C.cy); put('64F', F[2], 304, hy, C.cy);
        g.font = F[0].css; g.textAlign = 'center'; const gr = g.createLinearGradient(0, 68, 0, 128); gr.addColorStop(0, '#f2fdff'); gr.addColorStop(1, '#00c8ff'); g.fillStyle = gr; g.fillText('10:09', 168, 100);
        g.font = F[1].css; g.fillStyle = C.mg; g.textAlign = 'right'; g.fillText('30', 296, 118);
        g.font = fcss(DATA_FONT, 14, 700); g.fillStyle = C.mg; g.textAlign = 'left'; g.fillText('WED', 114, 56); g.fillStyle = '#b8f3ff'; g.textAlign = 'right'; g.fillText('11/04/2026', 245, 56);
        g.fillStyle = C.ye; g.textAlign = 'left'; g.fillText('AM', 262, 82); g.fillStyle = C.li; g.textAlign = 'right'; g.fillText('82%', 214, 35);
        HT37.bluetoothWidget.drawIcon(g, OPT, true, 142, 24); HT37.weatherIcons.draw(g, 2, 30, C.cy, 'line', 165, 258);
        [[0, 0.8], [1, 0.6], [2, 0.5], [3, 0.4]].forEach(([i, f]) => { const bar = BARS[i]; drawBar(g, bar, Math.round(f * SEGS), 'lit'); });
      }
    }
    // animated background: FRAMES full-screen opaque frames (type 7 widget #0 replaces the static background widget)
    const FRAMES = ANIM.frames; let animFirst = -1;
    for (let f = 0; f < FRAMES; f++) {
      const fc = H.cv(360, 360), fg = fc.getContext('2d'); drawBackground(fg, false, f / FRAMES); H.stampVer(fg);
      const id = add({ w: 360, h: 360, alpha: false, rgba: H.pixels(fc), flag: 1 }); if (f === 0) animFirst = id;
    }
    const pvFull = H.cv(360, 360); drawBackground(pvFull.getContext('2d'), true, 0);
    const pv = H.cv(240, 240); pv.getContext('2d').drawImage(pvFull, 0, 0, 240, 240);
    const pvId = add({ w: 240, h: 240, alpha: false, rgba: H.pixels(pv), flag: 1 });

    // ---- widgets (draw order = array order)
    widgets.push({ type: 7, sub: 0, x: 0, y: 0, a: animFirst, b: ANIM.timing, n: FRAMES }); // animated tunnel background
    BARS.forEach((b, i) => widgets.push({ type: 5, sub: b.sub, x: barIds[i].box.x, y: barIds[i].box.y, a: barIds[i].first, b: 0 }));
    widgets.push(bt.widgets[0]);
    widgets.push({ type: 3, sub: 15, x: 214, y: 27, a: 7, b: 2 });                    // battery % (green)
    widgets.push({ type: 4, sub: 0, x: 114, y: 48, a: wk });                          // weekday
    widgets.push({ type: 2, sub: 17, x: 245, y: 48, a: 8, b: 2 });                    // date MM/DD/YYYY
    widgets.push({ type: 2, sub: 51, x: 168, y: 68, a: 0, b: 1 });                    // HH:MM, blinking colon
    widgets.push({ type: 4, sub: 6, x: 262, y: 74, a: ap });                          // AM/PM
    widgets.push({ type: 2, sub: 4, x: 296, y: 96, a: 1, b: 2 });                     // seconds
    ROWS.forEach((r) => widgets.push({ type: 3, sub: r.sub, x: COL[r.col].right, y: ROW_Y0 + r.row * ROW_PITCH, a: r.font, b: 2 }));
    const sy = ROW_Y0 + 3 * ROW_PITCH, hy = ROW_Y0 + 4 * ROW_PITCH;
    widgets.push({ type: 3, sub: 46, x: 112, y: sy, a: 2, b: 2 }, { type: 3, sub: 47, x: 152, y: sy, a: 2, b: 2 }); // sleep hours / minutes
    widgets.push({ type: 3, sub: 48, x: 255, y: hy, a: 2, b: 2 }, { type: 3, sub: 49, x: 304, y: hy, a: 2, b: 2 }); // today high / low
    widgets.push({ type: 6, sub: 2, x: 165, y: 258, a: wx });                         // weather icon
    widgets.push({ type: 6, sub: 1, x: 0, y: 0, a: pvId });
    return { widgets, sprites, fonts, previewSprite: pvId };
  }

  if (HT37.diagFace && HT37.diagFace.addFace) {
    HT37.diagFace.addFace('cyber1', {
      name: 'HT37_Cyberpunk_Face.bin', label: '🟣 Cyberpunk HUD (demo face)', spec: buildSpec,
      prepare: () => Promise.all([HT37.fonts.load(TIME_FONT), HT37.fonts.load(DATA_FONT)]) // fonts must be loaded before the glyphs are drawn
    });
  }
  HT37.cyberFace = { buildSpec, BARS, ROWS, ANIM };
})();
