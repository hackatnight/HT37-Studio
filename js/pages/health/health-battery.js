/**
 * @file     js/pages/health/health-battery.js
 * @role     Battery history for the Health tab (Tab 6): records every battery report from the watch, estimates "time left" and "time to full" from
 *           the user's own past cycles, and draws the small battery window at the bottom right of the Health tab.
 * REGISTERS
 *   HT37.battery = { points, draw(g, x, y, w, h, rangeMs), summary(), clear() }
 *   points: [{ t (epoch ms), pct, bars, chg (true while charging), scan (true while a health scan was running) }]
 * DATA
 *   The watch pushes 02/1C = [charging flag][bars][percent] about every 20 s while charging, on screen wake, and the page asks for it every 20 s
 *   (js/editor/live-data.js). A point is stored when the value changes or at least once a minute. History is kept in localStorage, and
 *   js/pages/health/health-monitor.js (HT37.health.logBattery) also appends it to ht37-battery-YYYY-MM-DD.csv in the chosen folder.
 * ESTIMATES
 *   rate = total percent gained (charging) or lost (discharging) divided by the time of every run in the last 7 days that lasted 15 min or
 *   more and moved at least 2 percent. No such run yet: "learning".
 * LOAD ORDER  after js/pages/health/health-monitor.js
 */
(() => {
  'use strict';
  window.HT37 = window.HT37 || {}; HT37.onFrame = HT37.onFrame || [];
  const KEY = 'ht37BatteryHistory', MAXP = 20000, MIN = 60000, HOUR = 3600000;
  const B = HT37.battery = {};
  B.points = []; try { B.points = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { B.points = []; }
  let dirty = false;
  const $ = (id) => document.getElementById(id);

  HT37.onFrame = HT37.onFrame.filter((f) => !f.__batHandler);
  const handler = (cmd, key, v) => {
    if (cmd !== 0x02 || key !== 0x1c || v.length < 3) return;
    const now = Date.now(), chg = v[0] !== 0, pct = Math.min(100, v[2]), bars = v[1];
    const scan = !!(HT37.health && HT37.health.state && HT37.health.state.scanning), l = B.points[B.points.length - 1];
    if (l && l.chg === chg && l.pct === pct && l.scan === scan && now - l.t < MIN) return;          // unchanged: at most one point a minute
    const p = { t: now, pct, bars, chg, scan }; B.points.push(p); dirty = true;
    if (B.points.length > MAXP) B.points.splice(0, B.points.length - MAXP);
    try { if (HT37.health && HT37.health.logBattery) HT37.health.logBattery(p); } catch (e) { /* csv not ready */ }
  };
  handler.__batHandler = true; HT37.onFrame.push(handler);
  clearInterval(window.__batSaveTimer);
  window.__batSaveTimer = setInterval(() => { if (!dirty) return; dirty = false; try { localStorage.setItem(KEY, JSON.stringify(B.points)); } catch (e) { /* storage full or blocked */ } }, 60000);
  B.clear = () => { B.points.length = 0; dirty = false; try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } };

  function runs(chg) {                                  // contiguous runs of the same kind (charging or not), points less than 30 min apart
    const cut = Date.now() - 7 * 24 * HOUR, out = []; let cur = null;
    B.points.forEach((p) => {
      if (p.t < cut) return;
      if (p.chg !== chg) { cur = null; return; }
      if (cur && p.t - cur[cur.length - 1].t < 30 * MIN) cur.push(p); else out.push(cur = [p]);
    });
    return out;
  }
  function rate(chg) {                                  // percent per hour, or null while there is not enough history
    let dp = 0, dt = 0;
    runs(chg).forEach((r) => { const a = r[0], b = r[r.length - 1], d = chg ? b.pct - a.pct : a.pct - b.pct, span = b.t - a.t; if (span >= 15 * MIN && d >= 2) { dp += d; dt += span; } });
    return dt ? dp / (dt / HOUR) : null;
  }
  const fmtH = (h) => (h >= 48 ? (h / 24).toFixed(1) + ' days' : h >= 1 ? Math.floor(h) + ' h ' + String(Math.round((h % 1) * 60)).padStart(2, '0') + ' min' : Math.max(1, Math.round(h * 60)) + ' min');
  B.summary = () => {
    const l = B.points[B.points.length - 1]; if (!l) return null;
    const rd = rate(false), rc = rate(true);
    return { pct: l.pct, chg: l.chg, at: l.t, rateDis: rd, rateChg: rc,
      left: !l.chg && rd ? l.pct / rd : null, toFull: l.chg && rc ? (100 - l.pct) / rc : null, fullLife: rd ? 100 / rd : null };
  };

  B.draw = (g, x, y, w, h, rangeMs) => {
    const now = Date.now(), pts = B.points.filter((p) => !rangeMs || p.t >= now - rangeMs), sm = B.summary();
    g.save(); g.textAlign = 'left';
    g.fillStyle = '#060b10'; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1; g.strokeRect(x + .5, y + .5, w - 1, h - 1);
    const BLUE = '#4aa3ff', YEL = '#ffd23f';
    g.fillStyle = sm && sm.chg ? YEL : BLUE; g.font = '600 11px system-ui,sans-serif'; g.fillText('BATTERY  ' + (sm ? (sm.chg ? '⚡ charging' : 'discharging') : ''), x + 8, y + 15);
    if (!pts.length) { g.fillStyle = 'rgba(255,255,255,.3)'; g.font = '11px system-ui,sans-serif'; g.fillText('waiting for a battery report...', x + 8, y + 44); g.restore(); return; }
    const gx = x + 8, gy = y + 22, gw = w - 16, gh = Math.max(40, Math.min(72, h - 70));
    const t0 = Math.min(pts[0].t, now - 5 * MIN), X = (t) => gx + (t - t0) / (now - t0) * gw, Y = (p) => gy + gh - p / 100 * gh;
    g.strokeStyle = 'rgba(255,255,255,.1)'; g.beginPath(); [0, 50, 100].forEach((p) => { g.moveTo(gx, Y(p) + .5); g.lineTo(gx + gw, Y(p) + .5); }); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.3)'; g.font = '8px system-ui,sans-serif'; g.fillText('100', gx + 1, gy + 8); g.fillText('0', gx + 1, gy + gh - 2);
    g.fillStyle = 'rgba(53,208,255,.18)';                                                               // shaded = a health scan was running (sensors on)
    pts.forEach((p, i) => { if (!p.scan) return; const n = pts[i + 1], e = n && n.scan ? n.t : p.t + MIN; g.fillRect(X(p.t), gy, Math.max(1.5, X(e) - X(p.t)), gh); });
    g.lineWidth = 2; g.lineJoin = 'round';
    let seg = null; const flush = () => { if (seg && seg.p.length) { g.strokeStyle = seg.chg ? YEL : BLUE; g.beginPath(); seg.p.forEach((q, k) => { if (k) g.lineTo(X(q.t), Y(q.pct)); else g.moveTo(X(q.t), Y(q.pct)); }); if (seg.p.length === 1) g.lineTo(X(seg.p[0].t) + 2, Y(seg.p[0].pct)); g.stroke(); } };
    pts.forEach((p) => { if (!seg || seg.chg !== p.chg || p.t - seg.p[seg.p.length - 1].t > 30 * MIN) { flush(); seg = { chg: p.chg, p: [] }; } seg.p.push(p); }); flush();
    const e = pts[pts.length - 1]; g.fillStyle = '#fff'; g.beginPath(); g.arc(X(e.t), Y(e.pct), 3, 0, 7); g.fill();
    let ty = gy + gh + 14;
    g.fillStyle = '#e6edf3'; g.font = '700 12px ui-monospace,Consolas,monospace'; g.fillText(sm.pct + '%' + (sm.chg ? ' ⚡' : ''), x + 8, ty);
    g.font = '10px system-ui,sans-serif'; g.fillStyle = '#9aa7b5'; ty += 13;
    g.fillText(sm.chg ? (sm.toFull ? 'Full in about ' + fmtH(sm.toFull) : 'Time to full: learning') : (sm.left ? 'About ' + fmtH(sm.left) + ' left' : 'Time left: learning'), x + 8, ty); ty += 12;
    g.fillText(sm.fullLife ? 'Full battery lasts ~' + fmtH(sm.fullLife) : 'Needs a 15+ min run with 2% change', x + 8, ty);
    g.restore();
  };
})();
