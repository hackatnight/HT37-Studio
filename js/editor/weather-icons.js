/**
 * @file     js/editor/weather-icons.js
 * @layer    EDITOR art (weather icon styles for widgets)
 * @summary  Draws a weather icon for a watch sky code (0 unknown, 1 sunny, 2 cloudy, 3 overcast, 4 shower, 5 thunder, 6 light rain, 7 moderate rain,
 *           8 sleet, 9 light snow, 10 moderate snow, 11 sandstorm, 12 foggy) in one of several styles.
 * STYLES (only art we own or that is open source; no art is copied from other watch faces)
 *   - 'line'     outline icons drawn by this tool (our own code, no license issue)  <- default
 *   - 'solid'    filled icons drawn by this tool
 *   - 'material' Google "Material Symbols" (Apache License 2.0), loaded from fonts.googleapis.com on first use (needs internet)
 *   - 'emoji'    the emoji font of THIS computer (the art belongs to Microsoft / Apple / Google, so it is not open source; offered for quick tests only)
 * API  HT37.weatherIcons = { STYLES, draw(g, code, size, color, style, ox, oy), loadMaterial() -> Promise<boolean>, materialReady() }
 */
(function () {
  window.HT37 = window.HT37 || {};
  const STYLES = [['line', 'Line (drawn by this tool)'], ['solid', 'Solid (drawn by this tool)'], ['material', 'Material Symbols (open source, needs internet)'], ['emoji', 'System emoji (not open source)']];
  const EMOJI = ['❓', '☀️', '⛅', '☁️', '🌦️', '⛈️', '🌧️', '☔', '🌨️', '🌨️', '❄️', '🌪️', '🌫️'];
  const MAT = ['help', 'sunny', 'partly_cloudy_day', 'cloud', 'rainy', 'thunderstorm', 'rainy_light', 'rainy_heavy', 'weather_mix', 'weather_snowy', 'snowing', 'air', 'foggy'];
  const FONT = '"Material Symbols Outlined"';
  let matState = 0; // 0 not requested, 1 loading, 2 ready, -1 failed
  function loadMaterial() {
    if (matState === 2) return Promise.resolve(true);
    if (matState === 1 && loadMaterial.p) return loadMaterial.p;
    matState = 1;
    const names = MAT.slice().sort().join(',');
    loadMaterial.p = new Promise((res) => {
      const l = document.createElement('link'); l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,500,0,0&icon_names=' + names + '&display=block';
      l.onerror = () => { matState = -1; res(false); };
      l.onload = () => { document.fonts.load('24px ' + FONT, 'sunny').then(() => { matState = document.fonts.check('24px ' + FONT, 'sunny') ? 2 : -1; res(matState === 2); }, () => { matState = -1; res(false); }); };
      document.head.appendChild(l);
    });
    return loadMaterial.p;
  }

  // ---- shapes (all inside a unit box 0..1, scaled by S) ----
  function cloudPath(S, cx, cy, w) {
    const p = new Path2D(), r1 = w * 0.2, r2 = w * 0.27, r3 = w * 0.17;
    p.arc(cx - w * 0.22, cy + w * 0.03, r1, 0, Math.PI * 2);
    p.arc(cx + w * 0.02, cy - w * 0.1, r2, 0, Math.PI * 2);
    p.arc(cx + w * 0.26, cy + w * 0.05, r3, 0, Math.PI * 2);
    p.rect(cx - w * 0.22, cy + w * 0.03, w * 0.48, w * 0.19);
    return p;
  }
  function sunPath(cx, cy, r) { const p = new Path2D(); p.arc(cx, cy, r, 0, Math.PI * 2); return p; }

  /** mode 'solid' fills; 'line' draws the outline of the union by dilating then clearing the inside. */
  function body(g, path, color, mode, t, S) {
    if (mode === 'solid') { g.fillStyle = color; g.fill(path); return; }
    const c = document.createElement('canvas'); c.width = c.height = Math.ceil(S * 2); const k = c.getContext('2d');
    k.translate(S / 2, S / 2); k.fillStyle = color; k.strokeStyle = color; k.lineWidth = t * 2; k.fill(path); k.stroke(path);
    k.globalCompositeOperation = 'destination-out'; k.fill(path);
    g.drawImage(c, -S / 2, -S / 2);
  }
  function clearUnder(g, path, t, S, mode) { // cut a gap around a shape so it can sit on top of another one
    if (mode !== 'line') return; g.save(); g.globalCompositeOperation = 'destination-out'; g.lineWidth = t * 2.6; g.fill(path); g.stroke(path); g.restore();
  }

  function draw(g, code, size, color, style, ox, oy) {
    ox = ox || 0; oy = oy || 0; code = (code | 0); if (code < 0 || code > 12) code = 0;
    g.save(); g.translate(ox, oy);
    if (style === 'emoji') { g.font = Math.round(size * 0.78) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(EMOJI[code], size / 2, size / 2 + 1); g.restore(); return; }
    if (style === 'material' && matState === 2) { g.font = Math.round(size * 0.95) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(MAT[code], size / 2, size / 2 + 1); g.restore(); return; }
    const S = size, mode = style === 'solid' ? 'solid' : 'line', t = Math.max(1.2, S * 0.075);
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = t; g.lineCap = 'round'; g.lineJoin = 'round';
    const rays = (cx, cy, r, n) => { for (let i = 0; i < n; i++) { const a = i * Math.PI * 2 / n; g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 1.35, cy + Math.sin(a) * r * 1.35); g.lineTo(cx + Math.cos(a) * r * 1.75, cy + Math.sin(a) * r * 1.75); g.stroke(); } };
    const drop = (x, y, l) => { g.beginPath(); g.moveTo(x, y); g.lineTo(x - l * 0.3, y + l); g.stroke(); };
    const flake = (x, y, r) => { for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; g.beginPath(); g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke(); } };
    const cloud = (cx, cy, w) => { const p = cloudPath(S, cx, cy, w); clearUnder(g, p, t, S, mode); body(g, p, color, mode, t, S); return p; };
    if (code === 1) { const r = S * 0.2; body(g, sunPath(S / 2, S / 2, r), color, mode, t, S); rays(S / 2, S / 2, r, 8); }
    else if (code === 2) { const r = S * 0.15; body(g, sunPath(S * 0.34, S * 0.34, r), color, mode, t, S); rays(S * 0.34, S * 0.34, r, 8); cloud(S * 0.55, S * 0.6, S * 0.7); }
    else if (code === 3) { cloud(S * 0.5, S * 0.5, S * 0.86); }
    else if (code === 4) { const r = S * 0.12; body(g, sunPath(S * 0.3, S * 0.26, r), color, mode, t, S); rays(S * 0.3, S * 0.26, r, 8); cloud(S * 0.55, S * 0.48, S * 0.7); drop(S * 0.42, S * 0.72, S * 0.18); drop(S * 0.6, S * 0.72, S * 0.18); }
    else if (code === 5) { cloud(S * 0.5, S * 0.38, S * 0.8); g.beginPath(); g.moveTo(S * 0.54, S * 0.58); g.lineTo(S * 0.42, S * 0.76); g.lineTo(S * 0.52, S * 0.76); g.lineTo(S * 0.44, S * 0.95); g.lineTo(S * 0.64, S * 0.7); g.lineTo(S * 0.53, S * 0.7); g.closePath(); if (mode === 'solid') g.fill(); else g.stroke(); }
    else if (code === 6) { cloud(S * 0.5, S * 0.4, S * 0.8); drop(S * 0.4, S * 0.66, S * 0.22); drop(S * 0.6, S * 0.66, S * 0.22); }
    else if (code === 7) { cloud(S * 0.5, S * 0.36, S * 0.8); [0.3, 0.5, 0.7].forEach((x) => drop(S * x, S * 0.62, S * 0.2)); [0.4, 0.6].forEach((x) => drop(S * x, S * 0.82, S * 0.16)); }
    else if (code === 8) { cloud(S * 0.5, S * 0.4, S * 0.8); drop(S * 0.38, S * 0.68, S * 0.22); flake(S * 0.62, S * 0.78, S * 0.08); }
    else if (code === 9) { cloud(S * 0.5, S * 0.4, S * 0.8); flake(S * 0.38, S * 0.78, S * 0.08); flake(S * 0.62, S * 0.78, S * 0.08); }
    else if (code === 10) { cloud(S * 0.5, S * 0.36, S * 0.8); flake(S * 0.3, S * 0.76, S * 0.08); flake(S * 0.5, S * 0.86, S * 0.08); flake(S * 0.7, S * 0.76, S * 0.08); }
    else if (code === 11) { [0.32, 0.5, 0.68].forEach((y, i) => { g.beginPath(); g.moveTo(S * (0.15 + i * 0.04), S * y); g.bezierCurveTo(S * 0.35, S * (y - 0.1), S * 0.5, S * (y + 0.1), S * 0.7, S * y); g.bezierCurveTo(S * 0.78, S * (y - 0.05), S * 0.88, S * (y - 0.03), S * 0.88, S * (y - 0.1)); g.stroke(); }); }
    else if (code === 12) { cloud(S * 0.5, S * 0.34, S * 0.7); [0.62, 0.78].forEach((y, i) => { g.beginPath(); g.moveTo(S * (0.16 + i * 0.06), S * y); g.lineTo(S * (0.84 - i * 0.06), S * y); g.stroke(); }); }
    else { g.font = '700 ' + Math.round(S * 0.8) + 'px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', S / 2, S / 2 + 1); }
    g.restore();
  }
  HT37.weatherIcons = { STYLES, draw, loadMaterial, materialReady: () => matState === 2 };
})();
