/**
 * @file     js/editor/history.js
 * @layer    EDITOR
 * @summary  Undo / Redo for the watch editor: Sprite Studio styles (M.studio) and widget positions / dial centers.
 *
 * MODEL
 *   A snapshot = { studio: deep copy of M.studio, widgets: [{id, x, y, pivot, shift, anchorX, anchorY, lastX, lastY}] }.
 *   commit() pushes a snapshot when it differs from the current one (call it after an edit; Sprite Studio and pointer-up on the canvas do).
 *   undo()/redo() restore a snapshot: fonts are re-applied (glyph sprites regenerate), widgets are moved back, the ribbon refreshes.
 *   reset() starts a fresh history for a newly loaded face. Keyboard: Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z (not while typing in a text field).
 * API  HT37.history: commit(), undo(), redo(), reset(), canUndo(), canRedo()
 */
(function () {
  window.HT37 = window.HT37 || {};
  const stack = []; let idx = -1, tracked = null, timer = 0, restoring = false;
  const M = () => window.decompiledBinData;

  function capture() {
    const m = M(); if (!m || typeof widgets === 'undefined') return null;
    return JSON.stringify({
      studio: m.studio || {},
      widgets: widgets.map((w) => ({
        id: w.id, x: w.x, y: w.y, pivot: w.handPivot ? { x: w.handPivot.x, y: w.handPivot.y } : null, shift: w.handBaseShift,
        ax: w.hwMeta && w.hwMeta.anchorX, ay: w.hwMeta && w.hwMeta.anchorY, lx: w.hwMeta && w.hwMeta.lastCalcX, ly: w.hwMeta && w.hwMeta.lastCalcY
      }))
    });
  }

  function buttons() {
    ['btnUndo', 'btnRedo', 'ssUndo', 'ssRedo'].forEach((id) => {
      const b = document.getElementById(id); if (!b) return;
      b.disabled = id.endsWith('Undo') ? !canUndo() : !canRedo();
      b.style.opacity = b.disabled ? '0.4' : '1';
    });
  }
  const canUndo = () => idx > 0;
  const canRedo = () => idx < stack.length - 1;

  function reset() { const s = capture(); stack.length = 0; idx = -1; tracked = M(); if (s) { stack.push(s); idx = 0; } buttons(); }
  function commit() {
    if (restoring) return;
    if (M() !== tracked) { reset(); return; }
    const s = capture(); if (!s || s === stack[idx]) return;
    stack.length = idx + 1; stack.push(s); idx = stack.length - 1;
    if (stack.length > 100) { stack.shift(); idx--; }
    buttons();
  }
  function commitSoon() { clearTimeout(timer); timer = setTimeout(commit, 350); }

  function restore(json) {
    const m = M(), snap = JSON.parse(json), nf = HT37.faceWidgets.numberFont; if (!m) return;
    restoring = true;
    try {
      const now = m.studio || {};
      const SG = HT37.spriteGroups, K = (k) => (/^\d+$/.test(k) ? 'f' + k : k); // number fonts are stored under their index, other sprite groups under 'g:...'
      Object.keys(now).forEach((k) => { if (!snap.studio[k]) SG.reset(m, K(k)); });
      Object.keys(snap.studio).forEach((k) => SG.apply(m, K(k), JSON.parse(JSON.stringify(snap.studio[k]))));
      snap.widgets.forEach((sw) => {
        const w = widgets.find((x) => x.id === sw.id); if (!w) return;
        w.x = sw.x; w.y = sw.y;
        if (sw.pivot && w.handPivot) { w.handPivot.x = sw.pivot.x; w.handPivot.y = sw.pivot.y; w.handBaseShift = sw.shift; }
        if (w.hwMeta && sw.ax !== undefined) { w.hwMeta.anchorX = sw.ax; w.hwMeta.anchorY = sw.ay; w.hwMeta.lastCalcX = sw.lx; w.hwMeta.lastCalcY = sw.ly; }
      });
      if (typeof window.syncBinWidgetsWithSensors === 'function') window.syncBinWidgetsWithSensors();
      if (typeof renderLayerList === 'function') renderLayerList();
      if (typeof syncInspector === 'function') syncInspector();
      if (HT37.spriteStudio) HT37.spriteStudio.update(true);
    } finally { restoring = false; }
  }
  function undo() { if (!canUndo()) return; idx--; restore(stack[idx]); buttons(); }
  function redo() { if (!canRedo()) return; idx++; restore(stack[idx]); buttons(); }

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const t = e.target, typing = t && ((t.tagName === 'INPUT' && /text|number|search/.test(t.type)) || t.tagName === 'TEXTAREA');
    if (typing) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
  });
  // moves / scales / dial-center drags on the canvas, and edits made in the layer inspector
  document.addEventListener('pointerup', (e) => { if (e.target && e.target.id === 'watchCanvas') commitSoon(); });
  document.addEventListener('change', (e) => { if (e.target && e.target.closest && e.target.closest('#inspectorBody')) commitSoon(); });

  // zoom-bar buttons (the bar is created at runtime)
  (function mount(n) {
    const bar = document.querySelector('.wysiwyg-zoom-bar');
    if (!bar) { if (n < 100) setTimeout(() => mount(n + 1), 100); return; }
    if (document.getElementById('btnUndo')) return;
    const mk = (id, txt, tip, fn) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.className = 'zoom-btn'; b.textContent = txt; b.title = tip; b.onclick = fn; return b; };
    bar.insertBefore(mk('btnRedo', '↷', 'Redo (Ctrl+Y)', redo), bar.firstChild);
    bar.insertBefore(mk('btnUndo', '↶', 'Undo (Ctrl+Z): last style edit or move', undo), bar.firstChild);
    buttons();
  })(0);

  HT37.history = { commit, commitSoon, undo, redo, reset, canUndo, canRedo, buttons };
})();
