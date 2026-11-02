/**
 * @file     js/editor/render.js
 * @layer    Editor renderer
 * @summary  Canvas rendering: background styles, per-layer drawing via the widget registry, selection box, 60 fps loop.
 *
 * ROLE
 *   - drawWatchface(targetCtx, width, height, {showUI, onlyStatic}): clips to the round/rect LCD, draws the
 *     background, then every visible layer (translate → scale → drawWidget). showUI adds the selection box;
 *     used for the live canvas (showUI:true) and offscreen exports (false).
 *   - drawBackground(c,W,H): bgTheme styles + optional guides/bezel marks (#chkShowGuides).
 *   - drawWidget(c,w) delegates to HT37.widgets.get(w.type).draw; getWidgetBounds(w) returns registry size ×
 *     w.scale.
 *   - animateLoop(): advances sensors.ecgPhase, clears and redraws #watchCanvas, re-arms requestAnimationFrame
 *     (started by boot.js).
 *
 * PROVIDES (globals)
 *   function drawWatchface, function drawBackground, function drawWidget, function getWidgetBounds, let
 *   lastFrameTime, function animateLoop
 *
 * USES (defined in other files)
 *   - js/editor/state.js: bgTheme, canvas, ctx, customBgImage, screenConfig, selectedWidgetId, sensors, widgets
 *   - js/core/namespace.js: HT37
 *
 * DOM IDS TOUCHED
 *   #chkShowGuides
 *
 * LOAD ORDER
 *   #20 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/editor/widgets/customText.js   before: js/editor/layers.js
 *
 * NOTES
 *   - decompiler/vault.js WRAPS window.drawWidget and window.getWidgetBounds so layers carrying a decoded
 *     sprite (w.spriteCanvas) draw that sprite instead.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
function drawWatchface(targetCtx, width, height, options = {}) {
  const showUI = options.showUI ?? true;
  const scaleFactor = width / screenConfig.width;
  targetCtx.save(); targetCtx.scale(scaleFactor, scaleFactor);
  const W = screenConfig.width, H = screenConfig.height, cx = W / 2, cy = H / 2;
  targetCtx.beginPath();
  if (screenConfig.isRect) targetCtx.roundRect(0, 0, W, H, 36);
  else targetCtx.arc(cx, cy, Math.min(cx, cy), 0, Math.PI * 2);
  targetCtx.clip();
  drawBackground(targetCtx, W, H);
  for (const w of widgets) {
    if (!w.visible) continue;
    targetCtx.save();
    targetCtx.globalAlpha = w.opacity ?? 1.0;
    targetCtx.translate(w.x, w.y); targetCtx.scale(w.scale, w.scale);
    drawWidget(targetCtx, w);
    targetCtx.restore();
    if (showUI && w.id === selectedWidgetId) {
      targetCtx.save();
      targetCtx.strokeStyle = w.locked ? '#ffab00' : '#00e5ff';
      targetCtx.lineWidth = 1.5; targetCtx.setLineDash([4, 3]);
      const ol = (typeof window.getWidgetOutline === 'function') ? window.getWidgetOutline(w) : null; // analog hands: rotated outline (vault.js)
      if (ol) {
        const col = w.locked ? '#ffab00' : '#00e5ff';
        targetCtx.beginPath(); ol.poly.forEach((pt, i) => i ? targetCtx.lineTo(pt[0], pt[1]) : targetCtx.moveTo(pt[0], pt[1])); targetCtx.closePath(); targetCtx.stroke();
        targetCtx.fillStyle = col; ol.poly.forEach(pt => targetCtx.fillRect(pt[0] - 2.5, pt[1] - 2.5, 5, 5));
        // pointing axis: pivot -> tip, with arrowhead, plus a pivot crosshair and the angle label
        targetCtx.setLineDash([]); targetCtx.strokeStyle = '#ffeb3b'; targetCtx.fillStyle = '#ffeb3b'; targetCtx.lineWidth = 1;
        const [px, py] = ol.pivot, [tx, ty] = ol.tip, a = Math.atan2(ty - py, tx - px);
        targetCtx.beginPath(); targetCtx.moveTo(px, py); targetCtx.lineTo(tx, ty); targetCtx.stroke();
        targetCtx.beginPath(); targetCtx.moveTo(tx, ty); targetCtx.lineTo(tx - 8 * Math.cos(a - 0.4), ty - 8 * Math.sin(a - 0.4));
        targetCtx.lineTo(tx - 8 * Math.cos(a + 0.4), ty - 8 * Math.sin(a + 0.4)); targetCtx.closePath(); targetCtx.fill();
        targetCtx.beginPath(); targetCtx.arc(px, py, 5, 0, Math.PI * 2); targetCtx.moveTo(px - 9, py); targetCtx.lineTo(px + 9, py);
        targetCtx.moveTo(px, py - 9); targetCtx.lineTo(px, py + 9); targetCtx.stroke();
        targetCtx.font = '10px monospace'; targetCtx.fillText(ol.label, Math.min(290, Math.max(4, tx + 6)), Math.min(350, Math.max(12, ty)));
      } else {
        const box = getWidgetBounds(w);
        targetCtx.strokeRect(w.x - box.w / 2, w.y - box.h / 2, box.w, box.h);
        targetCtx.fillStyle = w.locked ? '#ffab00' : '#00e5ff';
        targetCtx.fillRect(w.x - box.w / 2 - 3, w.y - box.h / 2 - 3, 6, 6);
        targetCtx.fillRect(w.x + box.w / 2 - 3, w.y + box.h / 2 - 3, 6, 6);
      }
      targetCtx.restore();
    }
  }
  if (showUI && typeof window.drawWidgetOverlays === 'function') window.drawWidgetOverlays(targetCtx); // dial-center handles (js/editor/face-widgets/analog-hand.js)
  targetCtx.restore();
}

function drawBackground(c, W, H) {
  const cx = W / 2, cy = H / 2;
  if (bgTheme === 'image' && customBgImage) {
    const ratio = Math.max(W / customBgImage.width, H / customBgImage.height);
    const nw = customBgImage.width * ratio, nh = customBgImage.height * ratio;
    c.drawImage(customBgImage, (W - nw) / 2, (H - nh) / 2, nw, nh);
  } else if (bgTheme === 'tactical') {
    const grad = c.createRadialGradient(cx, cy, 10, cx, cy, cx);
    grad.addColorStop(0, '#0e1926'); grad.addColorStop(1, '#04070b');
    c.fillStyle = grad; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(0, 229, 255, 0.08)'; c.lineWidth = 1;
    for (let r = 60; r < cx; r += 55) { c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke(); }
  } else if (bgTheme === 'cyber') {
    c.fillStyle = '#090712'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255, 0, 128, 0.1)';
    for (let i = 0; i < W; i += 24) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, H); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(W, i); c.stroke(); }
  } else if (bgTheme === 'deepblue') {
    const grad = c.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#001e3c'); grad.addColorStop(1, '#000814');
    c.fillStyle = grad; c.fillRect(0, 0, W, H);
  } else { c.fillStyle = '#000000'; c.fillRect(0, 0, W, H); }
  if (document.getElementById('chkShowGuides').checked && !screenConfig.isRect) {
    c.save(); c.translate(cx, cy);
    for (let i = 0; i < 60; i++) {
      const isMajor = i % 5 === 0;
      c.strokeStyle = isMajor ? 'rgba(0, 229, 255, 0.55)' : 'rgba(255, 255, 255, 0.18)';
      c.lineWidth = isMajor ? 2 : 1;
      c.beginPath(); c.moveTo(0, -cx + 3); c.lineTo(0, -cx + (isMajor ? 12 : 7)); c.stroke();
      c.rotate((Math.PI * 2) / 60);
    }
    c.restore();
  }
}

// Dispatches to the renderer registered for w.type (see js/editor/widgets/*.js).
// NOTE: js/decompiler/vault.js wraps this function at runtime to add .BIN sprite widgets.
function drawWidget(c, w) {
  const now = new Date();
  const def = HT37.widgets.get(w.type);
  if (def && def.draw) def.draw(c, w, now);
}

// Hit-box of a layer in watch pixels = registered base size * layer scale (unknown types fall back to 80x40).
// NOTE: js/decompiler/vault.js wraps this function at runtime for .BIN sprite widgets.
function getWidgetBounds(w) {
  const def = HT37.widgets.get(w.type);
  if (def && def.sizeOf) { const sz = def.sizeOf(w); return def.hw ? sz : { w: sz.w * w.scale, h: sz.h * w.scale }; } // real watch widgets (def.hw) ignore Scale
  const base = (def && def.size) || { w: 80, h: 40 };
  return { w: base.w * w.scale, h: base.h * w.scale };
}

let lastFrameTime = performance.now();

function animateLoop() {
  const nowMs = performance.now();
  const dtSec = Math.min(0.1, (nowMs - lastFrameTime) / 1000);
  lastFrameTime = nowMs;
  const bpm = Math.max(30, Math.min(220, Number(sensors.hr) || 76));
  const pxPerBeat = Math.max(14, Math.min(42, Math.round(28 * (60 / bpm))));
  sensors.ecgPhase = (sensors.ecgPhase + (bpm / 60) * pxPerBeat * dtSec) % 10000;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawWatchface(ctx, canvas.width, canvas.height, { showUI: true });
  requestAnimationFrame(animateLoop);
}
