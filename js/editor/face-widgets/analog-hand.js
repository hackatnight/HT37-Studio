/**
 * @file     js/editor/face-widgets/analog-hand.js
 * @layer    Editor / face-widget TEMPLATES (hardware widgets that exist inside a TOPSTEP/TBUI .bin)
 * @summary  The analog clock-hand widget as ONE self-contained template: .bin entry layout, editor widget object,
 *           rotation/drawing geometry, selection outline, hit-testing, rounded-base centring, new-hand creation for
 *           from-scratch faces, and the draggable "dial center" handle. Reuse this pattern for other rotating widgets (compass needle).
 *
 * WHAT A HAND IS IN THE .bin  (see docs/BIN_FORMAT.md)
 *   Widget entry (32 bytes) in the TBUI widget directory:
 *     +0 id u8 | +1 type u8 (=1 analog hand) | +2 flag u8 (=1) | +3 sub u8 (6 hour, 7 minute, 8 second)
 *     +4 x u16, +6 y u16   = top-left of the UPRIGHT (12 o'clock) sprite, screen pixels
 *     +8 px u16, +0x0A py u16 = ROTATION CENTER, a fixed screen point (180,180 on every face seen)
 *     +0x0C a u16 = sprite id of the hand sprite (flag-4 "hand" PA sprite, 31-px row stride; see vault.js decodePA)
 *   The watch rotates the sprite about (px,py), clockwise, by the time angle. Moving a hand changes only where its sprite hangs
 *   relative to that fixed point; moving the CENTER moves the pivot. The two are independent fields.
 *
 * EDITOR WIDGET OBJECT (what this template creates; lives in the global `widgets` array)
 *   { type:'customText', handKind:'hour'|'minute'|'second', handSet:<string key>, handPivot:{x,y} (SCREEN px, shared by a dial set),
 *     handBaseShift:<px>, x,y = CENTER of w.spriteCanvas (screen px), spriteCanvas, spriteId, hwMeta:{i,id,type:1,sub,a,b,anchorX,anchorY,lastCalcX,lastCalcY} }
 *   handSet groups hands that share one center (normally all three hands of a face). Dragging the set handle moves them together.
 *
 * REGISTERS / PROVIDES
 *   HT37.faceWidgets.analogHand  (the template object; every method below)
 *   window.getHandFrame, window.getWidgetOutline, window.hitTestWidget, window.computeHandBaseShift   (thin wrappers; used by vault.js, render.js, canvas-input.js)
 *   window.drawWidgetOverlays, window.beginOverlayDrag, window.moveOverlayDrag, window.endOverlayDrag (dial-center handle; used by render.js, canvas-input.js)
 *
 * USES (defined elsewhere, looked up at call time)
 *   window.getSimClockParts() (js/decompiler/vault.js) = the one shared clock; global `widgets`, `canvas` (editor/state.js);
 *   #chkHandBasePivot, #chkShowGuides (DOM, optional).
 *
 * HOW TO USE FOR A FROM-SCRATCH FACE
 *   const hand = HT37.faceWidgets.analogHand.createNew({ kind:'hour', canvas:handCanvas, spriteId:11, center:{x:180,y:180} });
 *   widgets.push(hand);   // then write it with writeEntry() when the scratch .bin builder serializes widgets.
 *   Hand SPRITE bytes can be copied unchanged from an existing face; WRITING new flag-4 sprite data is not possible yet (index table undecoded).
 *
 * LOAD ORDER
 *   after js/editor/canvas-input.js, before js/decompiler/vault.js.
 */
(function () {
  window.HT37 = window.HT37 || {};
  HT37.faceWidgets = HT37.faceWidgets || {};

  const SUBS = { 6: 'hour', 7: 'minute', 8: 'second' };
  const SUB_OF = { hour: 6, minute: 7, second: 8 };
  const ENTRY = { type: 1, size: 32, x: 4, y: 6, px: 8, py: 0x0a, a: 0x0c };
  const DEFAULT_CENTER = { x: 180, y: 180 };

  // ---------------------------------------------------------------- geometry
  // Local frame: origin at the pivot, +y down the hand's own axis, rotated clockwise by `ang` from 12 o'clock.
  function getFrame(w) {
    if (!(w && w.spriteCanvas && w.handKind && w.handPivot)) return null;
    const cv = w.spriteCanvas, sc = w.scale || 1;
    const chk = document.getElementById('chkHandBasePivot'), shift = (!chk || chk.checked) ? (w.handBaseShift || 0) : 0;
    const t = window.getSimClockParts();
    const frac = w.handKind === 'hour' ? ((t.h % 12) + t.m / 60 + t.s / 3600) / 12 : w.handKind === 'minute' ? (t.m + t.s / 60) / 60 : t.s / 60;
    return { cv, sc, shift, ang: frac * Math.PI * 2, deg: frac * 360, ox: w.x, oy: w.y,
             px: (w.handPivot.x - w.x) / sc, py: (w.handPivot.y - w.y) / sc, pivot: [w.handPivot.x, w.handPivot.y] };
  }
  function toScreen(f, lx, ly) {
    const co = Math.cos(f.ang), si = Math.sin(f.ang);
    return [f.ox + f.sc * (f.px + co * lx - si * ly), f.oy + f.sc * (f.py + si * lx + co * ly)];
  }
  function label(kind, deg) {
    const p2 = n => String(n).padStart(2, '0'), a = deg.toFixed(1) + '°';
    if (kind === 'hour') { const hh = Math.floor(deg / 30) % 12 || 12; return 'hour ' + a + ' = ' + hh + ':' + p2(Math.floor((deg % 30) * 2)); }
    if (kind === 'minute') return 'minute ' + a + ' = :' + p2(Math.floor(deg / 6) % 60);
    return 'second ' + a + ' = :' + p2(Math.floor(deg / 6) % 60);
  }
  // Rotated outline of the sprite rectangle, the pivot, the tip (where the hand points) and a label. null for non-hands.
  function getOutline(w) {
    const f = getFrame(w); if (!f) return null;
    const x0 = -(f.px + f.cv.width / 2), y0 = -(f.py + f.cv.height / 2) - f.shift, x1 = x0 + f.cv.width, y1 = y0 + f.cv.height;
    return { poly: [toScreen(f, x0, y0), toScreen(f, x1, y0), toScreen(f, x1, y1), toScreen(f, x0, y1)],
             pivot: f.pivot, tip: toScreen(f, -f.px, y0), deg: f.deg, label: label(w.handKind, f.deg) };
  }
  // true/false in the hand's rotated frame (4 px grab margin); null = not a hand.
  function hitTest(w, mx, my) {
    const f = getFrame(w); if (!f) return null;
    const dx = (mx - f.ox) / f.sc - f.px, dy = (my - f.oy) / f.sc - f.py, co = Math.cos(f.ang), si = Math.sin(f.ang);
    const lx = dx * co + dy * si, ly = -dx * si + dy * co, tol = 4 / f.sc;
    const x0 = -(f.px + f.cv.width / 2), y0 = -(f.py + f.cv.height / 2) - f.shift;
    return lx >= x0 - tol && lx <= x0 + f.cv.width + tol && ly >= y0 - tol && ly <= y0 + f.cv.height + tol;
  }
  // Draw into context `c` that is ALREADY translated to the sprite center and scaled (the editor's drawWidget convention).
  function draw(c, w) {
    const f = getFrame(w); if (!f) return false;
    c.translate(f.px, f.py); c.rotate(f.ang);
    c.drawImage(f.cv, -f.cv.width / 2 - f.px, -f.cv.height / 2 - f.py - f.shift); // shift puts the rounded base center on the pivot
    return true;
  }
  // Rounded-base detector. Returns rows BELOW the pivot row at which the center of the rounded back end sits (e = baseCenterRow - pivotRow),
  // or 0 when the hand has no rounded base (squared/tapered tail) or the result looks implausible (|e| > 6).
  // Observed: hands with a round back end have their visual center 1.5-4.5 px from the stored pivot; the vendor's preview image centers the base.
  function baseShift(canvas, pivotRow) {
    try {
      const w = canvas.width, h = canvas.height, d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
      const span = y => { let a = -1, b = -1; for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) { if (a < 0) a = x; b = x; } return a < 0 ? 0 : b - a + 1; };
      let last = h - 1; while (last > 0 && !span(last)) last--;
      let mx = 0; for (let y = Math.max(0, last - 16); y <= last; y++) mx = Math.max(mx, span(y));
      if (mx < 14) return 0;
      const e = (last - mx / 2 + 0.5) - pivotRow;
      return Math.abs(e) <= 6 ? e : 0;
    } catch (err) { return 0; }
  }

  // ---------------------------------------------------------------- creation / serialization
  // From a parsed .bin widget entry `hw` ({i,id,type,sub,x,y,px,py,a,b}) and its decoded sprite `sp` ({id,canvas}).
  function createFromEntry(hw, sp, idSuffix) {
    const cv = sp.canvas, kind = SUBS[hw.sub] || ('sub' + hw.sub);
    const pvx = hw.px || DEFAULT_CENTER.x, pvy = hw.py || DEFAULT_CENTER.y;          // rotation center stored in the entry (+8/+0xA)
    const cx = hw.x + cv.width / 2, cy = hw.y + cv.height / 2;                          // exact halves: no rounding drift on odd sizes
    return {
      id: 'hw_hand_' + hw.i + '_' + Date.now() + '_' + idSuffix, type: 'customText',
      name: '\u{1F550} ' + kind + ' hand (Spr #' + sp.id + ')',
      x: cx, y: cy, scale: 1.0, opacity: 1.0, visible: true, locked: false,
      color: '#ffffff', accent: '#ffffff', text: kind, fwId: '0x01',
      spriteId: sp.id, spriteCanvas: cv,
      handKind: kind, handSet: 'set_' + pvx + '_' + pvy,                                // hands sharing a center form a set
      handBaseShift: baseShift(cv, pvy - hw.y),
      handPivot: { x: pvx, y: pvy },                                                    // fixed rotation center in SCREEN pixels
      hwMeta: { i: hw.i, id: hw.id, type: 1, sub: hw.sub, a: hw.a, b: hw.b, anchorX: hw.x, anchorY: hw.y, lastCalcX: cx, lastCalcY: cy }
    };
  }
  // NEW hand for a from-scratch face. kind: 'hour'|'minute'|'second'; canvas: upright hand art (tip up); pivotRow: sprite row to put on the
  // center (default: just inside the rounded base if present, else 90% down). The sprite is placed so that point lands on `center`.
  function createNew(o) {
    const cv = o.canvas, center = o.center || DEFAULT_CENTER;
    const pivotRow = o.pivotRow != null ? o.pivotRow : Math.round(cv.height * 0.9), pivotCol = cv.width / 2;
    const hw = { i: o.index != null ? o.index : 0, id: o.id != null ? o.id : 0, type: 1, sub: SUB_OF[o.kind], a: o.spriteId, b: 0,
                 x: Math.round(center.x - pivotCol), y: Math.round(center.y - pivotRow), px: center.x, py: center.y };
    const w = createFromEntry(hw, { id: o.spriteId, canvas: cv }, 'new');
    w.handBaseShift = o.pivotRow != null ? 0 : baseShift(cv, pivotRow);
    return w;
  }
  // Write x,y and the rotation center of widget `w` into a TBUI widget entry at byte offset `off` of DataView `dv`. Returns true if written.
  function writeEntry(dv, off, w, maxLen) {
    if (!w || !w.handKind || off + ENTRY.py + 2 > (maxLen == null ? Infinity : maxLen)) return false;
    const cv = w.spriteCanvas, clamp = v => Math.max(0, Math.min(65535, Math.round(v)));
    dv.setUint16(off + ENTRY.x, clamp(w.x - cv.width / 2), true);
    dv.setUint16(off + ENTRY.y, clamp(w.y - cv.height / 2), true);
    dv.setUint16(off + ENTRY.px, clamp(w.handPivot.x), true);
    dv.setUint16(off + ENTRY.py, clamp(w.handPivot.y), true);
    return true;
  }

  // ---------------------------------------------------------------- dial-set center handle
  function getSets() {
    const sets = {};
    (typeof widgets !== 'undefined' ? widgets : []).forEach(w => {
      if (!w.handKind || !w.handPivot) return;
      (sets[w.handSet || 'set'] = sets[w.handSet || 'set'] || { key: w.handSet || 'set', center: w.handPivot, widgets: [] }).widgets.push(w);
    });
    return Object.values(sets);
  }
  let drag = null;
  const HANDLE_R = 9;

  // Draws the handle for every set. Call from the editor's UI pass (showUI), in screen coordinates.
  function drawOverlays(c) {
    getSets().forEach(s => {
      const [x, y] = [s.center.x, s.center.y], active = drag && drag.set.key === s.key;
      c.save(); c.setLineDash([]); c.lineWidth = 1.5; c.strokeStyle = active ? '#ffffff' : '#ff4081'; c.fillStyle = 'rgba(255,64,129,0.25)';
      c.beginPath(); c.arc(x, y, HANDLE_R, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(x - 14, y); c.lineTo(x + 14, y); c.moveTo(x, y - 14); c.lineTo(x, y + 14); c.stroke();
      c.font = '10px monospace'; c.fillStyle = '#ff4081';
      c.fillText('center ' + Math.round(x) + ',' + Math.round(y) + (active && drag.pivotOnly ? ' (pivot only)' : ''), Math.min(250, x + 14), Math.max(12, y - 12));
      c.restore();
    });
  }
  // Pointer-down: returns true if a handle was grabbed. shift = move ONLY the pivot (sprites stay); otherwise the whole set moves with the center.
  function beginDrag(mx, my, shift) {
    for (const s of getSets()) {
      if (Math.hypot(mx - s.center.x, my - s.center.y) <= HANDLE_R + 3) {
        drag = { set: s, mx, my, center: { x: s.center.x, y: s.center.y }, pivotOnly: !!shift,
                 start: s.widgets.map(w => ({ w, x: w.x, y: w.y })) };
        return true;
      }
    }
    return false;
  }
  function moveDrag(mx, my) {
    if (!drag) return;
    let nx = Math.round(drag.center.x + (mx - drag.mx)), ny = Math.round(drag.center.y + (my - drag.my));
    const g = document.getElementById('chkShowGuides');
    if (g && g.checked && typeof screenConfig !== 'undefined') {                     // same 6 px snap-to-center as other layers
      if (Math.abs(nx - screenConfig.width / 2) < 6) nx = screenConfig.width / 2;
      if (Math.abs(ny - screenConfig.height / 2) < 6) ny = screenConfig.height / 2;
    }
    const dx = nx - drag.center.x, dy = ny - drag.center.y;
    drag.start.forEach(st => {
      st.w.handPivot.x = nx; st.w.handPivot.y = ny;                                   // handPivot object is shared by value per widget; set each
      if (drag.pivotOnly) st.w.handBaseShift = 0;                                     // deliberate pivot edit: stop auto base-centring
      else { st.w.x = st.x + dx; st.w.y = st.y + dy; }                                // move the whole dial with its center
    });
  }
  function endDrag() { drag = null; }

  const api = { id: 'analogHand', fwType: ENTRY.type, subs: SUBS, entry: ENTRY, defaultCenter: DEFAULT_CENTER,
    getFrame, label, getOutline, hitTest, draw, baseShift, createFromEntry, createNew, writeEntry,
    getSets, drawOverlays, beginDrag, moveDrag, endDrag };
  HT37.faceWidgets.analogHand = api;

  // Thin global wrappers (names used by vault.js / render.js / canvas-input.js).
  window.getHandFrame = getFrame;
  window.getWidgetOutline = getOutline;
  window.hitTestWidget = hitTest;
  window.computeHandBaseShift = baseShift;
  window.drawWidgetOverlays = drawOverlays;
  window.beginOverlayDrag = beginDrag;
  window.moveOverlayDrag = moveDrag;
  window.endOverlayDrag = endDrag;
})();
