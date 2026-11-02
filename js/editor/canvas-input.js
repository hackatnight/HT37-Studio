/**
 * @file     js/editor/canvas-input.js
 * @layer    Editor input
 * @summary  Pointer drag-and-drop of layers on the canvas and the Delete/Backspace shortcut.
 *
 * ROLE
 *   - pointerdown on #watchCanvas hit-tests layers top-down in canvas coordinates (rect scaled to canvas size)
 *     and selects/starts dragging; locked layers only log a hint.
 *   - pointermove (window) moves the layer, snapping to the center within 6 px when #chkShowGuides is checked;
 *     pointerup ends the drag.
 *   - keydown Delete/Backspace deletes the selected layer unless focus is in an input/select/textarea.
 *
 * USES (defined in other files)
 *   - js/editor/state.js: canvas, dragOffsetX, dragOffsetY, isDragging, screenConfig, selectedWidgetId, widgets
 *   - js/editor/render.js: getWidgetBounds
 *   - js/editor/layers.js: deleteWidget, renderLayerList
 *   - js/editor/inspector.js: syncInspector
 *   - js/core/log.js: log
 *
 * DOM IDS TOUCHED
 *   #chkShowGuides
 *
 * LOAD ORDER
 *   #22 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/editor/layers.js   before: js/editor/inspector.js
 *
 * NOTES
 *   - Top-level statements — runs at load, needs state.js and layers.js already loaded.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width / rect.width), my = (e.clientY - rect.top) * (canvas.height / rect.height);
  // Dial-center handle (analog hands) takes priority; Shift = move only the pivot, otherwise the whole hand set moves with it.
  if (typeof window.beginOverlayDrag === 'function' && window.beginOverlayDrag(mx, my, e.shiftKey)) { overlayDragging = true; return; }
  for (let i = widgets.length - 1; i >= 0; i--) {
    const w = widgets[i];
    if (!w.visible) continue;
    const b = getWidgetBounds(w);
    const rot = (typeof window.hitTestWidget === 'function') ? window.hitTestWidget(w, mx, my) : null; // analog hands: test in their rotated frame
    if (rot !== null ? rot : (mx >= w.x - b.w / 2 && mx <= w.x + b.w / 2 && my >= w.y - b.h / 2 && my <= w.y + b.h / 2)) {
      selectedWidgetId = w.id; renderLayerList(); syncInspector();
      if (!w.locked) { isDragging = true; dragOffsetX = mx - w.x; dragOffsetY = my - w.y; }
      else log(`Layer "${w.name}" is locked. Unlock it in the Layer Stack to move it.`, 'tx');
      return;
    }
  }
});

let overlayDragging = false;
window.addEventListener('pointermove', (e) => {
  if (overlayDragging) {
    const r0 = canvas.getBoundingClientRect();
    window.moveOverlayDrag((e.clientX - r0.left) * (canvas.width / r0.width), (e.clientY - r0.top) * (canvas.height / r0.height));
    return;
  }
  if (!isDragging || !selectedWidgetId) return;
  const w = widgets.find((item) => item.id === selectedWidgetId);
  if (!w || w.locked) return;
  const rect = canvas.getBoundingClientRect();
  let nx = Math.round((e.clientX - rect.left) * (canvas.width / rect.width) - dragOffsetX);
  let ny = Math.round((e.clientY - rect.top) * (canvas.height / rect.height) - dragOffsetY);
  if (document.getElementById('chkShowGuides').checked) {
    if (Math.abs(nx - screenConfig.width / 2) < 6) nx = screenConfig.width / 2;
    if (Math.abs(ny - screenConfig.height / 2) < 6) ny = screenConfig.height / 2;
  }
  w.x = nx; w.y = ny; syncInspector();
});

window.addEventListener('pointerup', () => { isDragging = false; if (overlayDragging) { overlayDragging = false; window.endOverlayDrag(); } });

window.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedWidgetId) deleteWidget(selectedWidgetId);
});
