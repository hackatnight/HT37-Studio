/**
 * @file     js/editor/inspector.js
 * @layer    Editor logic
 * @summary  Layer inspector panel: coordinate HUD, form ⇄ layer sync, center and reset.
 *
 * ROLE
 *   - syncInspector(): copies the selected layer into the inspector inputs; applyInspector(): writes edited
 *     inputs back to the layer.
 *   - updateHwCoordHud()/copyHwHudCoords(): the "HW Top-Left (X,Y) / size / edges" readout above the canvas,
 *     i.e. the hardware coordinates a firmware widget would use.
 *   - centerSelectedWidget() and resetDefaultWatchface() (re-creates the default layout).
 *
 * PROVIDES (globals)
 *   function copyHwHudCoords, function updateHwCoordHud, function syncInspector, function applyInspector,
 *   function centerSelectedWidget, function resetDefaultWatchface
 *
 * USES (defined in other files)
 *   - js/core/log.js: log
 *   - js/editor/state.js: screenConfig, selectedWidgetId, widgets
 *   - js/editor/render.js: getWidgetBounds
 *   - js/editor/layers.js: createDefaultWidgets, renderLayerList
 *
 * DOM IDS TOUCHED
 *   #btnCopyHudCoords #hudDim #hudEdges #hudHwPos #inspectorBody #propAccent #propColor #propFwId #propName
 *   #propOpacity #propScale #propText #propX #propY #selWidgetTag
 *
 * LOAD ORDER
 *   #23 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/editor/canvas-input.js   before: js/editor/screen-background.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
function copyHwHudCoords(e) {
  if (e) e.stopPropagation();
  const pos = document.getElementById('hudHwPos')?.innerText || '';
  const dim = document.getElementById('hudDim')?.innerText || '';
  const edges = document.getElementById('hudEdges')?.innerText || '';
  const text = `${pos} | ${dim} | ${edges}`.trim();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('btnCopyHudCoords');
      if (btn) { btn.textContent = '✓'; setTimeout(() => btn.textContent = '📋', 1200); }
      if (typeof log === 'function') log('📋 Copied: ' + text, 'ok');
    });
  }
}

function updateHwCoordHud() {
  const hudPos = document.getElementById('hudHwPos');
  const hudDim = document.getElementById('hudDim');
  const hudEdges = document.getElementById('hudEdges');
  if (!hudPos) return;
  const w = (typeof widgets !== 'undefined' && Array.isArray(widgets)) ? widgets.find(x => x.id === selectedWidgetId) : null;
  if (!w) {
    hudPos.innerHTML = '📍 HW Top-Left: <span style="color:#64748b">(None Selected)</span>';
    hudDim.textContent = '📐 Size: --×--';
    hudEdges.textContent = '📏 L:-- R:-- T:-- B:--';
    return;
  }
  const sprW = (w.spriteCanvas && w.spriteCanvas.width) ? w.spriteCanvas.width : (typeof getWidgetBounds === 'function' ? getWidgetBounds(w).w : 0);
  const sprH = (w.spriteCanvas && w.spriteCanvas.height) ? w.spriteCanvas.height : (typeof getWidgetBounds === 'function' ? getWidgetBounds(w).h : 0);
  const nx = Math.max(0, Math.round(w.x - sprW / 2));
  const ny = Math.max(0, Math.round(w.y - sprH / 2));
  const rEdge = 360 - (nx + sprW);
  const bEdge = 360 - (ny + sprH);

  hudPos.innerHTML = `📍 HW Top-Left: <span style="color:#38bdf8;font-weight:700;">(X: ${nx}, Y: ${ny})</span>`;
  hudDim.textContent = `📐 ${sprW}×${sprH}px`;
  hudEdges.innerHTML = `📏 L:<span style="color:#00e5ff">${nx}</span> R:<span style="color:#00e5ff">${rEdge}</span> T:<span style="color:#f59e0b">${ny}</span> B:<span style="color:#f59e0b">${bEdge}</span>`;
}

function syncInspector() {
  const w = widgets.find((item) => item.id === selectedWidgetId);
  const els = document.querySelectorAll('#inspectorBody input, #inspectorBody select, #inspectorBody button');
  if (!w) { document.getElementById('selWidgetTag').textContent = 'NONE'; els.forEach((el) => (el.disabled = true)); return; }
  els.forEach((el) => (el.disabled = false));
  const sprW = (w.spriteCanvas && w.spriteCanvas.width) ? w.spriteCanvas.width : (getWidgetBounds(w).w || 0);
  const sprH = (w.spriteCanvas && w.spriteCanvas.height) ? w.spriteCanvas.height : (getWidgetBounds(w).h || 0);
  const hwX = Math.max(0, Math.round(w.x - sprW / 2));
  const hwY = Math.max(0, Math.round(w.y - sprH / 2));
  document.getElementById('selWidgetTag').textContent = `${w.type.toUpperCase()} [HW: ${hwX}, ${hwY} | ${sprW}×${sprH}]`;
  document.getElementById('propName').value = w.name;
  document.getElementById('propX').value = w.x;
  document.getElementById('propY').value = w.y;
  document.getElementById('propScale').value = w.scale;
  document.getElementById('propOpacity').value = w.opacity ?? 1.0;
  document.getElementById('propColor').value = w.color;
  document.getElementById('propAccent').value = w.accent;
  document.getElementById('propText').value = w.text;
  document.getElementById('propFwId').value = w.fwId;
  updateHwCoordHud();
}

function applyInspector() {
  const w = widgets.find((item) => item.id === selectedWidgetId);
  if (!w) return;
  w.name = document.getElementById('propName').value || w.name;
  w.x = Number(document.getElementById('propX').value);
  w.y = Number(document.getElementById('propY').value);
  w.scale = Number(document.getElementById('propScale').value);
  w.opacity = Number(document.getElementById('propOpacity').value);
  w.color = document.getElementById('propColor').value;
  w.accent = document.getElementById('propAccent').value;
  w.text = document.getElementById('propText').value;
  w.fwId = document.getElementById('propFwId').value;
  renderLayerList();
}

function centerSelectedWidget() { const w = widgets.find((x) => x.id === selectedWidgetId); if (w) { w.x = Math.round(screenConfig.width / 2); syncInspector(); } }

function resetDefaultWatchface() { createDefaultWidgets(); log('Reset watchface to default HT37 Tactical layout.', 'ok'); }
