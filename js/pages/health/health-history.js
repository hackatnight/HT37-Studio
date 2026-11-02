/**
 * @file     js/pages/health/health-history.js
 * @role     "Watch history" section at the bottom of the Health tab (Tab 6): reads the data the watch has STORED (steps in 10-minute slots and
 *           workout records with one reading per minute) and shows it, and can check every data type the watch knows to see which ones hold data.
 * REGISTERS
 *   HT37.watchSync = { read(type), probeAll(), decode: { steps, sport, simple }, TYPES }
 * PROTOCOL (verified on the HT37 on Nov 1 2026, see docs/UNKNOWNS.md "STORED-DATA SYNC")
 *   write 05/01 [type]  ->  watch answers 05/07 [u32 total bytes], then one or more 05/30 frames (the records), then 05/08 [u32 total] (the end).
 *   The page's reassembler already ACKs the Bluetooth frames. This file never writes 05/32 (the "sync OK" confirm), because that may let the
 *   watch erase what it just sent. It only reads.
 * RECORD LAYOUT
 *   header 8 bytes: count u16, time 4 bytes (see stamp()), interval u16. Steps items are 6 bytes [steps u16][distance u16 /100000 km][calories
 *   u16 /1000 kcal]. Workout (type 16): 17 more header bytes (not decoded), then 13-byte items [0x000d][elapsed seconds u16][A u16][distance m
 *   u16][calories u16 /1000 kcal][D u16][heart rate u8]. A is probably steps and D is unknown.
 * LOAD ORDER  after js/pages/health/health-battery.js
 */
(() => {
  'use strict';
  window.HT37 = window.HT37 || {}; HT37.onFrame = HT37.onFrame || [];
  const W = HT37.watchSync = {};
  const $ = (id) => document.getElementById(id);
  const TYPES = [
    { id: 1, name: 'Steps (10-minute slots)' }, { id: 16, name: 'Workouts' }, { id: 3, name: 'Heart rate' }, { id: 4, name: 'Blood oxygen' },
    { id: 5, name: 'Blood pressure' }, { id: 6, name: 'Breathing rate' }, { id: 7, name: 'ECG' }, { id: 10, name: 'GPS tracks' },
    { id: 17, name: 'Temperature' }, { id: 18, name: 'Stress' }, { id: 19, name: 'Games' }, { id: 20, name: 'Mood' }, { id: 21, name: 'Vitality' },
    { id: 22, name: 'Sleep score' }, { id: 23, name: 'HRV' }, { id: 131, name: 'Heart rate (manual checks)' }, { id: 132, name: 'Oxygen (manual checks)' },
    { id: 133, name: 'Blood pressure (manual checks)' }, { id: 134, name: 'Breathing (manual checks)' }, { id: 145, name: 'Temperature (manual checks)' },
    { id: 146, name: 'Stress (manual checks)' }, { id: 253, name: 'HRV (daily)' }, { id: 254, name: 'Resting heart rate' }, { id: 255, name: "Today's totals" }];
  W.TYPES = TYPES;
  const hx = (a, n) => Array.from(a.slice(0, n || a.length)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
  const u16 = (d, o) => (d[o] << 8) | d[o + 1];
  const u32 = (d, o) => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
  const t12 = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const day = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const stamp = (d, o) => {                                         // 4-byte watch time -> epoch ms (local time)
    const y = 2000 + ((d[o] & 126) >> 1), mo = ((d[o] & 1) << 3) | ((d[o + 1] >> 5) & 7), dd = d[o + 1] & 31, mm = u16(d, o + 2);
    return new Date(y, mo - 1, dd, Math.floor(mm / 60), mm % 60, 0, 0).getTime();
  };

  // ---------- reading one data type ----------
  const R = { cur: null };
  HT37.onFrame = HT37.onFrame.filter((f) => !f.__histHandler);
  const onFrame = (cmd, key, v) => {
    const c = R.cur; if (!c || cmd !== 5) return;
    if (key === 7) { c.total = u32(v, 0); c.got07 = true; c.last = Date.now(); }
    else if (key === 0x30) { c.parts.push(Uint8Array.from(v)); c.last = Date.now(); }
    else if (key === 8) { c.end = true; c.last = Date.now(); }
  };
  onFrame.__histHandler = true; HT37.onFrame.push(onFrame);

  W.read = async (type) => {
    if (R.cur) throw new Error('Another read is still running.');
    if (!(typeof cmdChar !== 'undefined' && cmdChar && bleServer && bleServer.connected)) throw new Error('The watch is not connected.');
    const hs = HT37.health && HT37.health.state;
    if (hs && hs.charging) throw new Error('The watch is charging. Nothing is sent while it charges.');
    if (hs && hs.scanning) throw new Error('A health scan is running. Stop it first.');
    const c = R.cur = { type, parts: [], total: 0, got07: false, end: false, t0: Date.now(), last: Date.now() };
    try {
      await enqueueBleWrite(cmdChar, buildFitCloudFrame(5, 1, new Uint8Array([type]), 0).frame, 'SYNC-READ type ' + type);
      for (;;) {
        await new Promise((r) => setTimeout(r, 100)); const n = Date.now();
        if (c.end) { await new Promise((r) => setTimeout(r, 600)); break; }
        if (!c.got07 && n - c.t0 > 6000) break;
        if (c.got07 && n - c.last > 7000) break;
        if (n - c.t0 > 40000) break;
      }
    } finally { R.cur = null; }
    const len = c.parts.reduce((s, p) => s + p.length, 0), data = new Uint8Array(len); let o = 0; c.parts.forEach((p) => { data.set(p, o); o += p.length; });
    return { type, total: c.total, data, ok: c.end && data.length === c.total, answered: c.got07 || c.end, ms: Date.now() - c.t0 };
  };

  // ---------- decoders ----------
  const header = (d, o) => ({ count: u16(d, o), start: stamp(d, o + 2), interval: u16(d, o + 6) });
  const decodeSteps = (d) => {
    const out = []; let o = 0;
    while (o + 8 <= d.length) {
      const h = header(d, o); o += 8;
      for (let i = 0; i < h.count && o + 6 <= d.length; i++, o += 6) out.push({ t: h.start + i * h.interval * 60000, steps: u16(d, o), km: u16(d, o + 2) / 100000, kcal: u16(d, o + 4) / 1000 });
    }
    return out;
  };
  const decodeSport = (d) => {
    const out = []; let o = 0;
    while (o + 25 <= d.length) {
      const h = header(d, o), extra = hx(d.subarray(o + 8, o + 25)); o += 25; const items = [];
      for (let i = 0; i < h.count && o + 13 <= d.length; i++, o += 13) items.push({ sec: u16(d, o + 2), a: u16(d, o + 4), m: u16(d, o + 6), kcal: u16(d, o + 8) / 1000, dval: u16(d, o + 10), hr: d[o + 12] });
      out.push({ start: h.start, count: h.count, extra, items, complete: items.length === h.count });
    }
    return out;
  };
  const decodeSimple = (d) => {                                      // heart rate style: one byte per sample (0 = no sample)
    const out = []; let o = 0;
    while (o + 8 <= d.length) { const h = header(d, o); o += 8; for (let i = 0; i < h.count && o < d.length; i++, o++) if (d[o] > 0) out.push({ t: h.start + i * h.interval * 60000, v: d[o] }); }
    return out;
  };
  W.decode = { steps: decodeSteps, sport: decodeSport, simple: decodeSimple };

  // ---------- screen ----------
  let steps = [], workouts = [], probe = [];
  const say = (m) => { const e = $('hhStatus'); if (e) e.textContent = m; };
  const miles = (m) => (m / 1609.344).toFixed(2);
  const csvDownload = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };

  const drawWorkout = () => {
    const cv = $('hhCanvas'); if (!cv) return; const g = cv.getContext('2d'), sel = $('hhWorkout'), w = workouts[sel ? +sel.value : 0];
    const dpr = window.devicePixelRatio || 1, cw = cv.clientWidth || 600, ch = cv.clientHeight || 220; cv.width = cw * dpr; cv.height = ch * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#04080c'; g.fillRect(0, 0, cw, ch); if (!w || !w.items.length) { g.fillStyle = '#94a3b8'; g.font = '12px sans-serif'; g.fillText('No workout loaded yet.', 12, 24); return; }
    const m = $('hhMetric').value, items = w.items;
    const val = (x) => (m === 'hr' ? x.hr : m === 'kcal' ? x.kcal : x.m * 3.28084);
    const unit = m === 'hr' ? 'BPM' : m === 'kcal' ? 'kcal per minute' : 'feet per minute', color = m === 'hr' ? '#ef4444' : m === 'kcal' ? '#f59e0b' : '#22c55e';
    const vs = items.map(val).filter((v) => m !== 'hr' || v > 0); let lo = Math.min(...vs), hi = Math.max(...vs); if (m !== 'hr') lo = 0; if (hi === lo) hi = lo + 1;
    const padL = 44, padR = 10, padT = 14, padB = 24, pw = cw - padL - padR, ph = ch - padT - padB, tmax = items[items.length - 1].sec;
    const X = (s) => padL + (s / tmax) * pw, Y = (v) => padT + ph - ((v - lo) / (hi - lo)) * ph;
    g.strokeStyle = '#1e293b'; g.fillStyle = '#94a3b8'; g.font = '10px sans-serif'; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const v = lo + ((hi - lo) * i) / 4, y = Y(v); g.beginPath(); g.moveTo(padL, y); g.lineTo(cw - padR, y); g.stroke(); g.fillText(m === 'kcal' ? v.toFixed(2) : String(Math.round(v)), 4, y + 3); }
    const step = Math.max(1, Math.round(tmax / 60 / 8));
    for (let mi = 0; mi * 60 <= tmax; mi += step) { g.fillText(t12(w.start + mi * 60000), X(mi * 60) - 14, ch - 8); }
    g.strokeStyle = color; g.lineWidth = 2; g.beginPath(); let started = false;
    items.forEach((x) => { const v = val(x); if (m === 'hr' && v === 0) { started = false; return; } const px = X(x.sec), py = Y(v); if (!started) { g.moveTo(px, py); started = true; } else g.lineTo(px, py); }); g.stroke();
    g.fillStyle = color; g.font = '11px sans-serif'; g.fillText(unit, padL + 6, padT + 10);
  };

  const render = () => {
    const box = $('hhResults'); if (!box) return; let h = '';
    if (workouts.length) {
      const opts = workouts.map((w, i) => '<option value="' + i + '">' + day(w.start) + ' ' + t12(w.start) + ' (' + Math.round((w.items.length ? w.items[w.items.length - 1].sec : 0) / 60) + ' min)</option>').join('');
      const w0 = workouts[0], it = w0.items, hrs = it.map((x) => x.hr).filter((v) => v > 0), sm = (k) => it.reduce((s, x) => s + x[k], 0);
      h += '<div style="font-weight:700;color:#38bdf8;font-size:12px;margin-top:6px;">🏃 Workouts stored on the watch</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:4px 0;"><label style="font-size:10px;color:#94a3b8;">Workout<select id="hhWorkout" style="display:block;">' + opts + '</select></label>' +
        '<label style="font-size:10px;color:#94a3b8;">Graph shows<select id="hhMetric" style="display:block;"><option value="hr">Heart rate (BPM)</option><option value="kcal">Calories per minute</option><option value="ft">Distance per minute (feet)</option></select></label></div>' +
        '<div id="hhSum" style="font-size:11px;color:#cbd5e1;line-height:1.5;"></div>' +
        '<canvas id="hhCanvas" style="width:100%;height:220px;background:#04080c;border:1px solid #1e293b;display:block;margin-top:4px;"></canvas>' +
        '<div style="font-size:10px;color:#64748b;margin-top:2px;">Technical details: ' + w0.count + ' readings, interval header ok, extra header bytes ' + w0.extra + '. "A" (probably steps) totals ' + sm('a') + ', "D" (unknown) totals ' + sm('dval') + '.' + (hrs.length ? '' : ' No heart rate in this workout.') + '</div>';
      box.dataset.opts = opts;
    }
    if (steps.length) {
      const tot = steps.reduce((s, x) => s + x.steps, 0);
      h += '<div style="font-weight:700;color:#38bdf8;font-size:12px;margin-top:10px;">👟 Steps stored on the watch (10-minute slots)</div><div style="font-size:11px;color:#cbd5e1;margin:2px 0;">' + tot + ' steps in ' + steps.length + ' slots.</div>' +
        '<table style="font-size:11px;color:#cbd5e1;border-collapse:collapse;"><tr style="color:#94a3b8;"><td style="padding:1px 10px 1px 0;">Time</td><td style="padding:1px 10px 1px 0;">Steps</td><td style="padding:1px 10px 1px 0;">Miles</td><td>Calories</td></tr>' +
        steps.map((x) => '<tr><td style="padding:1px 10px 1px 0;">' + day(x.t) + ' ' + t12(x.t) + '</td><td>' + x.steps + '</td><td>' + miles(x.km * 1000) + '</td><td>' + x.kcal.toFixed(1) + ' kcal</td></tr>').join('') + '</table>';
    }
    if (probe.length) {
      h += '<div style="font-weight:700;color:#38bdf8;font-size:12px;margin-top:10px;">🔎 Every data type the watch knows</div><table style="font-size:11px;color:#cbd5e1;border-collapse:collapse;"><tr style="color:#94a3b8;"><td style="padding:1px 10px 1px 0;">Type</td><td style="padding:1px 10px 1px 0;">Name</td><td style="padding:1px 10px 1px 0;">Result</td><td>First bytes</td></tr>' +
        probe.map((p) => '<tr><td style="padding:1px 10px 1px 0;">' + p.type + '</td><td style="padding:1px 10px 1px 0;">' + p.name + '</td><td style="padding:1px 10px 1px 0;color:' + (p.data.length ? '#4ade80' : '#94a3b8') + ';">' + (!p.answered ? 'no answer' : p.data.length ? p.data.length + ' bytes' + (p.ok ? '' : ' (incomplete)') : 'empty') + '</td><td style="font-family:monospace;font-size:10px;">' + hx(p.data, 12) + '</td></tr>').join('') + '</table>';
    }
    box.innerHTML = h || '<div style="font-size:11px;color:#94a3b8;">Nothing loaded yet. Press a button above.</div>';
    const sel = $('hhWorkout'); if (sel) { sel.onchange = () => { sumLine(); drawWorkout(); }; $('hhMetric').onchange = drawWorkout; sumLine(); drawWorkout(); }
  };
  const sumLine = () => {
    const sel = $('hhWorkout'), e = $('hhSum'); if (!sel || !e) return; const w = workouts[+sel.value], it = w.items, hrs = it.map((x) => x.hr).filter((v) => v > 0);
    const m = it.reduce((s, x) => s + x.m, 0), k = it.reduce((s, x) => s + x.kcal, 0), last = it.length ? it[it.length - 1].sec : 0;
    e.innerHTML = 'Started ' + day(w.start) + ' ' + t12(w.start) + ' · ' + Math.floor(last / 60) + ':' + String(last % 60).padStart(2, '0') + ' long · ' + miles(m) + ' mi · ' + k.toFixed(1) + ' kcal' +
      (hrs.length ? ' · heart rate ' + Math.min(...hrs) + '–' + Math.max(...hrs) + ' BPM, average ' + Math.round(hrs.reduce((s, v) => s + v, 0) / hrs.length) : '');
  };

  const busy = (on) => ['hhRead', 'hhProbe'].forEach((id) => { const b = $(id); if (b) b.disabled = on; });
  const doRead = async () => {
    busy(true);
    try {
      say('Asking the watch for stored steps…'); const a = await W.read(1); steps = a.answered ? decodeSteps(a.data) : [];
      say('Asking the watch for stored workouts…'); const b = await W.read(16); workouts = b.answered ? decodeSport(b.data).reverse() : [];
      say(!a.answered && !b.answered ? 'The watch did not answer. Is it connected and awake?' : 'Done. ' + steps.length + ' step slots, ' + workouts.length + ' workouts. Nothing was erased on the watch.' + ((a.answered && !a.ok && a.data.length) || (b.answered && !b.ok && b.data.length) ? ' (A transfer looks incomplete: try again.)' : ''));
    } catch (e) { say('Could not read: ' + e.message); }
    busy(false); render();
  };
  const doProbe = async () => {
    busy(true); probe = [];
    try {
      for (const t of TYPES) { say('Checking ' + t.name + ' (' + (probe.length + 1) + ' of ' + TYPES.length + ')…'); const r = await W.read(t.id); probe.push({ type: t.id, name: t.name, answered: r.answered, ok: r.ok, data: r.data }); await new Promise((x) => setTimeout(x, 600)); }
      const have = probe.filter((p) => p.data.length).length; say('Done. ' + have + ' of ' + TYPES.length + ' types hold data. Nothing was erased on the watch.');
    } catch (e) { say('Stopped: ' + e.message); }
    busy(false); render();
  };
  W.probeAll = doProbe;

  const csv = () => {
    const d = new Date(), tag = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (steps.length) csvDownload('ht37-watch-steps-' + tag + '.csv', 'time_local,steps,miles,kcal\n' + steps.map((x) => new Date(x.t).toLocaleString('en-US') + ',' + x.steps + ',' + miles(x.km * 1000) + ',' + x.kcal.toFixed(3)).join('\n') + '\n');
    workouts.forEach((w, i) => csvDownload('ht37-watch-workout-' + tag + '-' + (i + 1) + '.csv', 'time_local,elapsed_s,heart_rate_bpm,kcal,distance_m,a_probably_steps,d_unknown\n' + w.items.map((x) => new Date(w.start + x.sec * 1000).toLocaleTimeString('en-US') + ',' + x.sec + ',' + x.hr + ',' + x.kcal.toFixed(3) + ',' + x.m + ',' + x.a + ',' + x.dval).join('\n') + '\n'));
    if (!steps.length && !workouts.length) say('Nothing to save yet. Read the watch first.');
  };

  // ---------- build the section into Tab 6 ----------
  const build = () => {
    const cv = $('hmCanvas'); if (!cv || $('hhWrap')) return !!$('hhWrap');
    const pane = cv.closest('.studio-tab-pane') || cv.parentElement.parentElement, b = 'border:0;border-radius:6px;color:#fff;font-weight:700;font-size:12px;padding:8px 12px;cursor:pointer;';
    const s = document.createElement('div'); s.id = 'hhWrap'; s.style.cssText = 'margin:0 10px 14px;padding:10px;border:1px solid #1e293b;border-radius:8px;background:#0b1220;';
    s.innerHTML = '<div style="font-size:12px;font-weight:700;color:#38bdf8;">📥 Watch history (data stored on the watch)</div>' +
      '<div style="font-size:11px;color:#94a3b8;line-height:1.4;margin:3px 0 6px;">The watch keeps some data on its own: steps in 10-minute slots and every workout (with a heart rate reading each minute). These buttons only read it. Nothing on the watch is changed or erased. Paused while the watch is charging or a live scan is running.</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button id="hhRead" type="button" style="' + b + 'background:#10b981;">📥 Read steps and workouts</button>' +
      '<button id="hhProbe" type="button" style="' + b + 'background:#334155;" title="Asks for all ' + TYPES.length + ' data types one by one and lists which ones hold data (takes about a minute)">🔎 Check every data type</button>' +
      '<button id="hhCsv" type="button" style="' + b + 'background:#0369a1;">⬇ Save as CSV</button></div>' +
      '<div id="hhStatus" style="font-size:11px;color:#cbd5e1;margin:6px 0;">Idle. Nothing is sent until you press a button.</div><div id="hhResults"></div>';
    pane.appendChild(s); $('hhRead').onclick = doRead; $('hhProbe').onclick = doProbe; $('hhCsv').onclick = csv; render(); return true;
  };
  let tries = 0; const tick = () => { if (build() || ++tries > 60) return; setTimeout(tick, 500); }; tick();
})();
