/**
 * @file     js/editor/face-project.js
 * @layer    Editor logic (builds a real .bin from the layers)
 * @summary  "Face project" mode: the layers of REAL watch widgets (widget types with `hw`, e.g. forecast) plus the base background are
 *           written into a brand-new TOPSTEP .bin by HT37.faceBuilder. Flash to Watch and Export .BIN call rebuildActiveBin(); while a project
 *           is active this file answers instead of the vendor-face patcher.
 *
 * RULES
 *   - Adding a real watch widget when no face project is active starts one: it clears the layers of a built-in test face (HT37_*.bin) or when
 *     nothing is loaded. If a vendor face is loaded it only logs a hint; use "New blank face" (Add Widget Layer card) to start from scratch.
 *   - Layers of preview-only widget types (compass, steps ring, ...) are NOT written; the log says how many were skipped.
 *   - The base background is the selected theme or the uploaded image (baked into the face art). Real watch widgets ignore Scale/Opacity.
 *   - Not yet possible: adding a real widget to a loaded vendor face (needs vendor-face -> project conversion).
 * API  HT37.faceProject = { active, start, build, rebuild }
 */
(function () {
  window.HT37 = window.HT37 || {};
  let on = false;
  const FILE = 'HT37_Custom_Face.bin';
  const isHw = (w) => { const d = HT37.widgets.get(w.type); return !!(d && d.hw); };
  const hwLayers = () => (typeof widgets !== 'undefined' ? widgets : []).filter((w) => w.visible !== false && isHw(w));

  function start() {
    window.decompiledBinData = null; widgets = []; selectedWidgetId = null; on = true;
    customBgImage = null; window.userUploadedCustomBg = false; bgTheme = 'oled'; // blank base: plain black (pick a theme or upload an image in "Watch Screen & Background Layer")
    const th = document.getElementById('bgPreset'); if (th) { const o = Array.from(th.options).find((x) => x.value === 'oled'); if (o) { th.value = o.value; bgTheme = o.value; } }
    if (HT37.widgetOptions) HT37.widgetOptions.reset();
    renderLayerList(); syncInspector();
    log('🆕 New blank face: add real watch widgets (marked in Add Widget Layer), then Flash to Watch or Export .BIN.', 'ok');
  }

  function build() {
    const H = HT37.diagFace.helpers, sprites = [], fonts = [], widgetsOut = [], statics = [];
    const add = (s) => { sprites.push(s); return sprites.length - 1; };
    const layers = hwLayers(), skipped = widgets.filter((w) => w.visible !== false && !isHw(w)).length;
    layers.forEach((w) => {
      const d = HT37.widgets.get(w.type), sz = d.hw.sizeOf(w), ox = Math.round(w.x - sz.w / 2), oy = Math.round(w.y - sz.h / 2);
      const comp = d.hw.build(w.opts, add, ox, oy), base = fonts.length;
      comp.fonts.forEach((f) => fonts.push(f));
      comp.widgets.forEach((cw) => { if (cw.type === 2 || cw.type === 3) cw.a += base; widgetsOut.push(cw); });
      if (comp.drawStatic) statics.push(comp.drawStatic);
    });
    const bg = H.cv(360, 360), g = bg.getContext('2d'), guides = document.getElementById('chkShowGuides'), gv = guides && guides.checked;
    if (guides) guides.checked = false;
    try { drawBackground(g, 360, 360); } finally { if (guides) guides.checked = gv; }
    statics.forEach((fn) => fn(g));
    const bgId = add({ w: 360, h: 360, alpha: false, rgba: H.pixels(bg), flag: 1 });
    const pv = H.cv(240, 240); pv.getContext('2d').drawImage(bg, 0, 0, 240, 240);
    const pvId = add({ w: 240, h: 240, alpha: false, rgba: H.pixels(pv), flag: 1 });
    const list = [{ type: 0, sub: 0, x: 0, y: 0, a: bgId }].concat(widgetsOut, [{ type: 6, sub: 1, x: 0, y: 0, a: pvId }]);
    const bytes = HT37.faceBuilder.build({ widgets: list, sprites, fonts, previewSprite: pvId });
    return { bytes, count: layers.length, skipped };
  }

  function rebuild() {
    const r = build(), u = r.bytes;
    window.decompiledBinData = { u, buffer: u.buffer, fileName: FILE, fileSize: u.byteLength, project: true };
    log('🧱 Built face from ' + r.count + ' real widget layer(s)' + (r.skipped ? ' (' + r.skipped + ' preview-only layer(s) not written)' : '') + ': ' + u.byteLength.toLocaleString() + ' B', 'ok');
    return u;
  }

  const active = () => on;
  // hook the exporter used by Flash / Export
  const origRebuild = window.rebuildActiveBin;
  window.rebuildActiveBin = function () {
    const M = window.decompiledBinData;
    if (on && M && !M.project) on = false;                       // a face was loaded from a file: leave project mode
    if (on && hwLayers().length) { try { return rebuild(); } catch (e) { log('⚠️ Face build failed: ' + (e.message || e), 'err'); return null; } }
    return typeof origRebuild === 'function' ? origRebuild.apply(this, arguments) : null;
  };
  // adding a real widget starts a project when it is safe to
  const origAdd = window.addWidget;
  window.addWidget = function (type) {
    const d = HT37.widgets.get(type), M = window.decompiledBinData;
    if (d && d.hw && !on) {
      if (!M || /^HT37_/.test(M.fileName || '')) start();
      else return log('ℹ️ A vendor face is loaded. Real widgets cannot be added to it yet; press "New blank face" in Add Widget Layer to start from scratch.', 'warn');
    }
    return origAdd.apply(this, arguments);
  };

  function mountUi(n) {
    const grid = document.getElementById('widgetCardGrid');
    if (!grid) { if (n < 400) setTimeout(() => mountUi(n + 1), 100); return; }
    if (document.getElementById('btnNewFace')) return;
    const b = document.createElement('button'); b.id = 'btnNewFace'; b.type = 'button'; b.className = 'dock-btn'; b.textContent = '🆕 New blank face (clears layers)';
    b.style.cssText = 'width:100%;height:28px;font-size:11px;font-weight:700;margin-bottom:6px'; b.onclick = start;
    const hint = document.createElement('div'); hint.style.cssText = 'font-size:10px;color:#94a3b8;margin-bottom:6px'; hint.textContent = 'Cards marked "real watch widget" are written into the face when you Flash or Export.';
    grid.parentElement.insertBefore(hint, grid); grid.parentElement.insertBefore(b, hint);
  }
  mountUi(0);
  HT37.faceProject = { active, start, build, rebuild, hwLayers };
})();
