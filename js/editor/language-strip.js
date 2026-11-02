/**
 * @file     js/editor/language-strip.js
 * @layer    EDITOR tool (face-wide)
 * @summary  "Remove Chinese sprites": the vendor faces ship every label twice (Chinese first, English second, interleaved). When the watch is set to
 *           English the Chinese sprites are never drawn, so they can be blanked to save space for new widgets/sprites.
 *
 * WHICH SPRITES (observed on 1004080 / 1004189 / 1004380 / 1004504, see docs/BIN_FORMAT.md section 4):
 *   type-4 widget, sub 0 (weekday): a + 2k for k = 0..6   | sub 6 (AM/PM): a, a+2   | units a=86: a, a+2   | any other type-4 label pair: a
 *   A sprite that another widget uses as its ENGLISH half is never touched.
 * HOW: a blanked sprite becomes a 1x1 transparent sprite (same id, so every index stays valid). Restoring brings the original back.
 *   Sprite.blank = true, sprite.edited = true -> rebuildActiveBin() re-encodes it like any edited sprite.
 * NOT FLASH-TESTED: whether the watch accepts 1x1 sprites. The option is OFF by default.
 * API  HT37.languageStrip: ids(M), apply(M, on), isOn(M), savedBytes(M)
 */
(function () {
  window.HT37 = window.HT37 || {};
  const spr = (M, id) => M.sprites.find((s) => s.id === id);

  function ids(M) {
    const cn = new Set(), en = new Set();
    (M.widgets || []).filter((w) => w.type === 4).forEach((w) => {
      const a = w.a;
      if (w.sub === 0) { for (let k = 0; k < 7; k++) { cn.add(a + 2 * k); en.add(a + 2 * k + 1); } }
      else if (w.sub === 6) { cn.add(a); cn.add(a + 2); en.add(a + 1); en.add(a + 3); }
      else if (a === 86) { cn.add(a); cn.add(a + 2); en.add(a + 1); en.add(a + 3); }
      else { cn.add(a); en.add(a + 1); }
    });
    return [...cn].filter((id) => !en.has(id) && spr(M, id) && spr(M, id).canvas);
  }

  function blankCanvas() { const c = document.createElement('canvas'); c.width = c.height = 1; return c; }

  function apply(M, on) {
    ids(M).forEach((id) => {
      const s = spr(M, id);
      if (!s.origCanvas) { s.origCanvas = s.canvas; s.origW = s.w; s.origH = s.h; }
      if (on) { s.canvas = blankCanvas(); s.w = s.h = 1; s.edited = true; s.blank = true; }
      else if (s.blank) { s.canvas = s.origCanvas; s.w = s.origW; s.h = s.origH; s.blank = false; s.edited = false; }
    });
    M.stripCN = !!on;
    // restore the styling of label sets (color, effects) that was applied to the sprites we just brought back
    if (HT37.spriteGroups && M.studio) HT37.spriteGroups.list(M).filter((g) => g.kind === 'label' && M.studio[g.key]).forEach((g) => HT37.spriteGroups.apply(M, g.key, M.studio[g.key]));
    if (typeof window.syncBinWidgetsWithSensors === 'function') window.syncBinWidgetsWithSensors();
    if (typeof window.refreshDecompGallery === 'function') window.refreshDecompGallery();
    if (HT37.spriteStudio) HT37.spriteStudio.update(false);
    if (HT37.history) HT37.history.commitSoon();
    refresh();
  }

  /** Bytes the Chinese sprites take in the file right now (what turning the option on frees, roughly). */
  function savedBytes(M) {
    let n = 0;
    ids(M).forEach((id) => { const i = M.sprites.findIndex((s) => s.id === id), s = M.sprites[i], next = M.sprites[i + 1]; n += (next ? next.absOff : (M.origU || M.u).length - 4) - s.absOff; });
    return n;
  }

  let box = null;
  function refresh() {
    const M = window.decompiledBinData; if (!box) return;
    const n = M ? ids(M).length : 0;
    box.style.display = n ? '' : 'none';
    if (!n) return;
    box.querySelector('input').checked = !!M.stripCN;
    box.querySelector('span').textContent = 'Remove Chinese sprites (' + n + ' unused when the watch is set to English, ~' + (savedBytes(M) / 1024).toFixed(1) + ' KB)';
  }

  function mount(tries) {
    const anchor = document.getElementById('btnDecompAutoAssemble');
    if (!anchor) { if (tries < 100) setTimeout(() => mount(tries + 1), 100); return; }
    box = document.createElement('label');
    box.style.cssText = 'display:none;align-items:center;gap:6px;font-size:11px;margin:6px 0 0;cursor:pointer;color:#cbd5e1';
    box.title = 'The vendor faces store every label in Chinese and English. With the watch set to English the Chinese ones are never shown; blanking them frees file space. Turn it off to restore them. Not yet flash-tested.';
    box.innerHTML = '<input type="checkbox"> <span></span>';
    box.style.display = 'none';
    box.querySelector('input').addEventListener('change', (e) => { const M = window.decompiledBinData; if (M) apply(M, e.target.checked); });
    anchor.parentElement.insertBefore(box, anchor.nextSibling);
    // keep in step with face loads / selection changes
    const orig = window.syncInspector;
    if (typeof orig === 'function' && !orig._lsHooked) {
      window.syncInspector = function () { const r = orig.apply(this, arguments); try { refresh(); } catch (e) { /* optional */ } return r; };
      window.syncInspector._lsHooked = true; window.syncInspector._ssHooked = orig._ssHooked;
    }
  }
  setTimeout(() => mount(0), 300);
  HT37.languageStrip = { ids, apply, savedBytes, isOn: (M) => !!(M && M.stripCN), refresh };
})();
