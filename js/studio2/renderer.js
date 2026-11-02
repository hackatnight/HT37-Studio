/**
 * @file     js/studio2/renderer.js
 * @layer    Studio 2 core
 * @summary  Draws a face model onto a 360x360 canvas the way the watch does, with simulated values, INCLUDING frame animations (type 7).
 *           Returns one box per drawn widget so the editor can select and move them. Rules come from docs/BIN_FORMAT.md section 11 and the
 *           old vault.js renderer: number alignment b (0 left, 1 center, 2 right of x), weekday frame = a + 2*day + 1, AM/PM = a + 2*pm + 1,
 *           weather icon frame = sky code, forecast icons = lookup table, Bluetooth icon frame 0 = linked.
 * API  HT37S.renderer = { draw(g, model, sim, tMs, opts) -> boxes[], ANIM_UNIT_MS }
 *      opts: { hidden: Set(widgetIndex), touch: bool (outline tap areas) }
 *      box = { i, x, y, w, h, drawn }
 */
(function () {
  const S = (window.HT37S = window.HT37S || {});
  const R = { ANIM_UNIT_MS: 100 }; // the unit of the animation timing byte is not measured yet: ms per step is a guess (docs/UNKNOWNS.md)

  function numberImage(model, w, str) {
    const map = model.fonts[w.a] || model.fonts[0]; if (!map) return null;
    const parts = []; let tw = 0, th = 0;
    for (const ch of String(str)) { const id = map[ch.charCodeAt(0)]; const cv = id == null ? null : model.sprite(id); if (cv) { parts.push(cv); tw += cv.width; th = Math.max(th, cv.height); } }
    return parts.length ? { parts, w: tw, h: th } : null;
  }

  function draw(g, model, sim, tMs, opts) {
    opts = opts || {}; const boxes = [], cat = S.catalog, hasAmPm = model.widgets.some((x) => x.type === 4 && x.sub === 6), clk = cat.clock(sim);
    g.clearRect(0, 0, 360, 360); g.fillStyle = '#000'; g.fillRect(0, 0, 360, 360);
    model.widgets.forEach((w) => {
      const box = { i: w.i, x: w.x, y: w.y, w: 0, h: 0, drawn: false }; boxes.push(box);
      if (opts.hidden && opts.hidden.has(w.i)) return;
      const img = (cv, x, y) => { if (!cv) return false; g.drawImage(cv, x, y); box.x = x; box.y = y; box.w = cv.width; box.h = cv.height; box.drawn = true; return true; };
      const t = w.type, s = w.sub;
      if (t === 0) { img(model.sprite(w.a), w.x, w.y); }
      else if (t === 7) {
        const n = Math.max(1, w.n || 1), ms = Math.max(30, (w.b >> 8) * R.ANIM_UNIT_MS), f = opts.frozen ? 0 : Math.floor(tMs / ms) % n;
        img(model.sprite(w.a + f), w.x, w.y);
      } else if (t === 1) {
        const cv = model.sprite(w.a); if (!cv) return;
        const ang = s === 6 ? ((clk.h % 12) + clk.m / 60) * 30 : s === 7 ? (clk.m + clk.s / 60) * 6 : clk.s * 6;
        g.save(); g.translate(180, 180); g.rotate(ang * Math.PI / 180); g.drawImage(cv, w.x - 180, w.y - 180); g.restore();
        box.x = w.x; box.y = w.y; box.w = cv.width; box.h = cv.height; box.drawn = true;
      } else if (t === 2 || t === 3) {
        const str = cat.text(t, s, sim, hasAmPm), im = numberImage(model, w, str); if (!im) return;
        let x = w.x; if (w.b === 1) x = w.x - im.w / 2; else if (w.b === 2) x = w.x - im.w;
        let cx = x; im.parts.forEach((p) => { g.drawImage(p, cx, w.y); cx += p.width; });
        box.x = x; box.y = w.y; box.w = im.w; box.h = im.h; box.drawn = true;
      } else if (t === 4) {
        const pm = clk.h >= 12 ? 1 : 0; let id = w.a + 1;
        if (s === 0) id = w.a + clk.dow * 2 + 1; else if (s === 6) id = w.a + pm * 2 + 1;
        img(model.sprite(id) || model.sprite(w.a), w.x, w.y);
      } else if (t === 5) {
        const n = Math.min(model.runLength(w.a), 40), ratio = s === 0 ? sim.batt / 100 : s === 1 ? sim.steps / sim.stepGoal : s === 2 ? sim.distMi / sim.distGoalMi : s === 3 ? sim.kcal / sim.kcalGoal : 0.5;
        const steps = Math.max(1, Math.min(n, 11)) - 1, f = Math.round(Math.max(0, Math.min(1, ratio)) * steps); // 11 pictures = 0%..100% in 10% steps (longer sets: first 11 shown)
        img(model.sprite(w.a + f), w.x, w.y);
      } else if (t === 6) {
        if (s === 1) return; // preview thumbnail: not drawn on the watch
        let f = 0; const n = model.runLength(w.a);
        if (s === 0) f = sim.linked ? 0 : 1; else if (s === 2) f = Math.min(sim.sky, Math.max(0, n - 1)); else if (s >= 4 && s <= 9) f = cat.FRAME_FOR_CODE[Math.min(sim.sky, 13)] || 0;
        img(model.sprite(w.a + f) || model.sprite(w.a), w.x, w.y);
      } else if (t === 8) {
        box.x = w.x; box.y = w.y; box.w = w.w || 40; box.h = w.h || 40; box.drawn = true;
        if (opts.touch) { g.save(); g.strokeStyle = 'rgba(255,200,0,0.7)'; g.setLineDash([4, 3]); g.strokeRect(box.x + 0.5, box.y + 0.5, box.w, box.h); g.restore(); }
      }
    });
    return boxes;
  }
  R.draw = draw; S.renderer = R;
})();
