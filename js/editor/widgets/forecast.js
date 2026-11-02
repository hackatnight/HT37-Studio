/**
 * @file     js/editor/widgets/forecast.js
 * @layer    Editor widget (REAL watch widget: written into the .bin)
 * @summary  Widget type "forecast": sky icon + high + low for forecast days 1..N (N = 1..6). Today is NOT included.
 *           Appears in "Add Widget Layer"; its options (days, layout, spacing, sizes, icon style, colors) show in the Selected Layer Inspector.
 *           On Flash / Export the face is built from the layers by js/editor/face-project.js, which calls hw.build() below.
 *
 * WATCH WIDGETS USED (decoded on hardware, docs/BIN_FORMAT.md 11e/11f)
 *   icons: type 6 subs 4..9 = forecast days 1..6; the watch picks the frame from a LOOKUP of the sky code, so the 16 frame sprites are drawn in
 *   FRAME order (inverse of the measured table). numbers: day n high = type 3 sub 61+n (62..67), low = type 3 sub 49+n (50..55), Fahrenheit.
 *   Alignment b: 1 = centered on x, 2 = right edge at x. NO day-name widget is known yet, so no day label.
 * DATA   The watch shows whatever the phone/tool last pushed with 0x02/0x36 (Diagnostics tab > Weather & Sky Dispatch > Live weather sync).
 *        The editor preview below uses sample numbers.
 * API    HT37.forecastWidget = { defaults, layout, sizeOf, build, FRAME_FOR_CODE }
 */
(function () {
  window.HT37 = window.HT37 || {};
  const FRAME_FOR_CODE = [12, 1, 0, 5, 8, 11, 10, 3, 9, 2, 4, 7, 6, 12]; // sky code 0..13 -> frame the watch draws (measured)
  const FRAME_CODE = Array.from({ length: 16 }, (_, f) => { const c = FRAME_FOR_CODE.findIndex((fr, i) => fr === f && i !== 13); return c >= 0 ? c : 0; }); // frame -> sky code (frames 13-15 are spares)
  const defaults = { days: 5, layout: 'column', icon: 24, num: 15, gap: 4, iconStyle: 'line', iconColor: '#e5e7eb', high: '#ffab40', low: '#4fc3f7', font: 'system', fontCustom: '', bold: true, digits: 2 };
  const SAMPLE = { hi: [78, 79, 81, 83, 82, 80], lo: [68, 69, 70, 71, 70, 67], code: [3, 6, 6, 4, 1, 2] };
  const mctx = document.createElement('canvas').getContext('2d');
  const famOf = (o) => (o.fontCustom && o.fontCustom.trim()) || o.font;
  const fontCss = (o) => HT37.fonts.css(famOf(o), o.bold ? 700 : 400, o.num);
  /** width of one glyph sprite in the chosen font (measured, so narrow and wide fonts both fit) */
  const glyphW = (ch, o) => { mctx.font = fontCss(o); return Math.max(3, Math.ceil(mctx.measureText(ch).width)); };
  const digitW = (o) => Math.max.apply(null, '0123456789'.split('').map((d) => glyphW(d, o)));
  const GL = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '-', ':'];
  const full = (o) => Object.assign({}, defaults, o || {});

  /** Geometry relative to the widget's top-left. b: 1 centered, 2 right-aligned. Spacing slider 0 = 1 px between neighbours. */
  function layout(opts) {
    const o = full(opts), n = Math.max(1, Math.min(6, o.days | 0)), I = o.icon, gp = (o.gap | 0) + 1, nh = Math.max(8, Math.round(o.num * 1.05)), dw = digitW(o), dg = o.digits === 3 ? 3 : 2, cells = [];
    if (o.layout === 'strip') {
      const cw = Math.max(I, dw * dg) + gp;
      for (let d = 0; d < n; d++) { const cx = d * cw + cw / 2; cells.push({ icon: { x: cx - I / 2, y: 0 }, high: { x: cx, y: I + gp, b: 1 }, low: { x: cx, y: I + gp + nh + gp - 1, b: 1 } }); }
      return { w: n * cw - gp + 1, h: I + gp + nh * 2 + gp - 1, cells, nh, dw };
    }
    const rowH = Math.max(I, nh), pitch = rowH + gp, sw = glyphW('/', o), lowR = I + gp + dw * dg, highL = lowR + gp + sw + gp, highR = highL + dw * dg;
    for (let d = 0; d < n; d++) { const y = d * pitch; cells.push({ icon: { x: 0, y: y + (rowH - I) / 2 }, low: { x: lowR, y: y + (rowH - nh) / 2, b: 2 }, high: { x: highR, y: y + (rowH - nh) / 2, b: 2 }, slash: { x: lowR + gp + sw / 2, y: y + rowH / 2 } }); }
    return { w: highR, h: n * pitch - gp, cells, nh, dw };
  }
  const sizeOf = (w) => { const L = layout(w && w.opts); return { w: L.w, h: L.h }; }; // unscaled: real watch widgets ignore the Scale slider

  function iconSprite(code, o) {
    const H = HT37.diagFace.helpers, c = H.cv(o.icon, o.icon), g = c.getContext('2d'); HT37.weatherIcons.draw(g, code, o.icon, o.iconColor, o.iconStyle, 0, 0);
    return { w: o.icon, h: o.icon, alpha: true, rgba: H.pixels(c) };
  }

  /** Writes this widget's sprites with add(sprite) -> id. (ox, oy) = top-left on the 360x360 screen. Local font index 0 = high color, 1 = low color; the face builder offsets them. */
  function build(opts, add, ox, oy) {
    const o = full(opts), L = layout(o), H = HT37.diagFace.helpers, fonts = [[], []], widgets = [];
    if (o.iconStyle === 'material' && !HT37.weatherIcons.materialReady()) o.iconStyle = 'line'; // font not loaded: never ship text names as icons
    [o.high, o.low].forEach((col, fi) => GL.forEach((ch) => fonts[fi].push({ ch: ch.charCodeAt(0), sprite: add(H.textSprite(ch, glyphW(ch, o), L.nh, col, fontCss(o))) })));
    const frame0 = Array.from({ length: 16 }, (_, f) => add(f < 13 ? iconSprite(FRAME_CODE[f], o) : iconSprite(0, o)))[0];
    L.cells.forEach((c, d) => {
      widgets.push({ type: 6, sub: 4 + d, x: Math.round(ox + c.icon.x), y: Math.round(oy + c.icon.y), a: frame0 });
      widgets.push({ type: 3, sub: 62 + d, x: Math.round(ox + c.high.x), y: Math.round(oy + c.high.y), a: 0, b: c.high.b });
      widgets.push({ type: 3, sub: 50 + d, x: Math.round(ox + c.low.x), y: Math.round(oy + c.low.y), a: 1, b: c.low.b });
    });
    const drawStatic = (g) => { if (o.layout === 'strip') return; g.save(); g.fillStyle = '#6b7280'; g.font = fontCss(o); g.textAlign = 'center'; g.textBaseline = 'middle'; L.cells.forEach((c) => g.fillText('/', ox + c.slash.x, oy + c.slash.y)); g.restore(); };
    return { widgets, fonts, drawStatic, size: { w: L.w, h: L.h } };
  }

  function draw(c, w) {
    const o = full(w.opts), L = layout(o), s = w.scale || 1; if (o.iconStyle === 'material') HT37.weatherIcons.loadMaterial();
    const fam = famOf(o); if (fam !== 'system') HT37.fonts.load(fam);
    c.save(); c.scale(1 / s, 1 / s); // real watch widgets cannot be scaled: size comes from Icon / Number size
    const ox = -L.w / 2, oy = -L.h / 2;
    c.textBaseline = 'middle'; c.font = fontCss(o);
    L.cells.forEach((cell, d) => {
      HT37.weatherIcons.draw(c, SAMPLE.code[d], o.icon, o.iconColor, o.iconStyle, ox + cell.icon.x, oy + cell.icon.y);
      [['high', SAMPLE.hi[d], o.high], ['low', SAMPLE.lo[d], o.low]].forEach(([k, v, col]) => { c.fillStyle = col; c.textAlign = cell[k].b === 1 ? 'center' : 'right'; c.fillText(String(v), ox + cell[k].x, oy + cell[k].y + L.nh / 2 + 1); });
      if (cell.slash) { c.fillStyle = '#6b7280'; c.textAlign = 'center'; c.fillText('/', ox + cell.slash.x, oy + cell.slash.y + 1); }
    });
    c.restore();
  }

  HT37.forecastWidget = { defaults, layout, sizeOf, build, FRAME_FOR_CODE, FRAME_CODE };

  HT37.widgets.register({
    type: 'forecast', icon: '🌦️', label: 'Forecast', desc: 'Icon + high/low, 1-6 days (real watch widget)', cardSpan: 1,
    quickAdd: { label: '🌦️ Forecast (icon + high/low)', order: 5 },
    fw: { id: '0x06', label: 'Weather Forecast' },
    size: { w: 96, h: 130 }, sizeOf, hw: { build, sizeOf },
    defaults: { name: '🌦️ Forecast', color: '#ffab40', accent: '#4fc3f7', text: '', fwId: '0x06', opts: Object.assign({}, defaults) },
    controls: [
      { key: 'days', label: 'Days', type: 'select', options: [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], num: true },
      { key: 'layout', label: 'Layout', type: 'select', options: [['column', 'Column (one row per day)'], ['strip', 'Strip (one column per day)']] },
      { key: 'gap', label: 'Spacing', type: 'range', min: 0, max: 20, step: 1 },
      { key: 'digits', label: 'Digits reserved', type: 'select', options: [[2, '2 (tight)'], [3, '3 (100+ safe)']], num: true },
      { key: 'icon', label: 'Icon size', type: 'range', min: 14, max: 44, step: 1 },
      { key: 'num', label: 'Number size', type: 'range', min: 10, max: 28, step: 1 },
      { key: 'font', label: 'Number font', type: 'select', options: HT37.fonts.LIST, previewFonts: true },
      { key: 'fontCustom', label: 'Any Google font', type: 'text', placeholder: 'type a font name' },
      { key: 'bold', label: 'Bold', type: 'checkbox' },
      { key: 'iconStyle', label: 'Icon style', type: 'select', options: HT37.weatherIcons.STYLES },
      { key: 'iconColor', label: 'Icon color', type: 'color' },
      { key: 'high', label: 'High color', type: 'color' },
      { key: 'low', label: 'Low color', type: 'color' }
    ],
    note: 'Number fonts: open source (Google Fonts, needs internet the first time) or this computer\'s font. Real watch widget. Shows the last weather pushed to the watch. No day label (no day-name widget found yet). Spacing 0 = 1 px between items. Scale and Opacity do not apply to real watch widgets.',
    draw
  });
})();
