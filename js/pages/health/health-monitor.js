/**
 * @file     js/pages/health/health-monitor.js
 * @layer    UI tab (built at runtime, same pattern as js/editor/explore.js)
 * @summary  "Tab 6: ❤ Health Data": a hospital-style live monitor for the watch sensors (BPM and oxygen first).
 *
 * ROLE
 *   - Asks the watch to measure with 0x05/0x23 (start) and reads the replies 0x05/0x24 through HT37.onFrame:
 *     byte 6 = BPM, byte 7 = SpO2 %, byte 8 = diastolic, byte 9 = systolic (0 = not measured yet).
 *   - Draws three panels on one canvas: an animated pulse trace (SYNTHETIC: the shape is generated and only its RATE follows the
 *     real BPM; it is not a real ECG), a BPM trend and an oxygen trend (real samples, one about every second).
 *   - Start modes (nothing is sent until the user presses Start):
 *       hr        = [01 00]            verified on the watch (Live Watch Data card uses it); stop [00 00]
 *       hr+oxygen = [00 03 05 minutes] vendor SDK form (type bits 1=HR, 2=oxygen); stop [00 00 05 00]. NOT verified yet.
 *   - Samples are kept in memory (HT37.health.samples). TODO: save to a file / IndexedDB and add steps, distance, sleep.
 *
 * REGISTERS
 *   - HT37.health = { start, stop, clear, samples, state }
 *
 * USES: HT37.onFrame (js/ble/notifications.js), buildFitCloudFrame, enqueueBleWrite, cmdChar, bleDevice (page globals), log.
 *
 * DOM IDS TOUCHED
 *   #tab-health #hmCanvas #hmStart #hmStop #hmClear #hmMode #hmMin #hmStatus
 *
 * See AI_GUIDE.md and docs/APP_COMMANDS.md.
 */
(function () {
  'use strict';
  window.HT37 = window.HT37 || {}; HT37.onFrame = HT37.onFrame || [];
  const $ = (id) => document.getElementById(id);
  const S = HT37.health = { samples: [], state: { scanning: false, bpm: 0, spo2: 0, sys: 0, dia: 0, last: 0 } };
  let WINDOW_S = 0;            // seconds shown in the trend panels (the Time range box changes it)
  // a second copy of this file (live update) must not leave the first copy's timers running: they could keep starting scans
  clearTimeout(window.__hmScanTimer); clearTimeout(window.__hmRepTimer);
  let timer = 0, stopAt = 0;
  const GAP_MAX = 6000;           // pauses between scans count as at most 6 s on the graph axis, so a new scan continues the same line
  const bp = { start: 0, vs: 0, sys: [], dia: [] };   // blood pressure readings collected for the current averaging window
  const track = {};              // per metric: smoothed value + when it was last shown (see the update/smoothing boxes on the left)

  const connected = () => { try { return typeof cmdChar !== 'undefined' && cmdChar && typeof bleDevice !== 'undefined' && bleDevice && bleDevice.gatt && bleDevice.gatt.connected; } catch (e) { return false; } };
  const say = (t) => { const e = $('hmStatus'); if (e) e.textContent = t; };
  const lg = (m, k) => { try { if (typeof log === 'function') log(m, k || 'ok'); } catch (e) { /* ignore */ } };

  const MODES = {
    hr:  { label: 'Heart rate only (verified)', start: (m) => [0x01, 0x00], stop: [0x00, 0x00] },
    oxy: { label: 'Heart rate + oxygen (vendor SDK form)', start: (m) => [0x00, 0x03, 0x05, m], stop: [0x00, 0x00, 0x05, 0x00] },
  };

  async function send(payload, what) {
    const f = buildFitCloudFrame(0x05, 0x23, payload, 0x00);
    await enqueueBleWrite(cmdChar, f.frame, 'Health monitor ' + what + ' seq=' + f.seq, false);
  }
  function resetTracks() { Object.keys(track).forEach((k) => delete track[k]); bp.start = 0; bp.vs = 0; bp.sys = []; bp.dia = []; }
  let repTimer = 0;
  const everyMs = () => (parseInt($('hmEvery').value, 10) || 0) * 60000;
  function plan() {                                           // schedule the next scan when "repeat every" is on
    clearTimeout(repTimer); repTimer = 0; const st = S.state; st.nextAt = 0;
    if (!st.repeating) return;
    if (!everyMs()) { st.repeating = false; return; }                          // "Once": there is nothing to repeat
    const fire = () => {
      if (!connected()) { st.repeating = false; st.nextAt = 0; say('Repeat cancelled: the watch is not connected.'); return; }
      if (st.charging) { st.nextAt = Date.now() + 60000; repTimer = window.__hmRepTimer = setTimeout(fire, 60000); return; }          // charging: look again in a minute
      S.start(true);
    };
    const wait = Math.max(30000, st.startedAt + everyMs() - Date.now());              // never closer than 30 s, so a mistake can not become a loop st.nextAt = Date.now() + wait;
    repTimer = window.__hmRepTimer = setTimeout(fire, wait);
  }
  async function halt(noSend) {
    clearTimeout(timer); timer = 0; const was = S.state.scanning; S.state.scanning = false;
    flushBp(Date.now(), true);                                   // show the partly filled blood pressure window when the scan ends
    if (connected() && !noSend) { try { await send((MODES[$('hmMode').value] || MODES.oxy).stop, 'stop'); } catch (e) { /* ignore */ } }
    return was;
  }
  async function finish() { await halt(); flush(false); say('Scan finished.' + (S.state.repeating ? ' Next scan is scheduled (see the right side).' : '')); lg('Health monitor: scan finished.'); plan(); }
  S.start = async (auto, over) => {
    if (!connected()) { say('Watch not connected. Pair & Bind first.'); return false; }
    if (S.state.charging) { say('The watch is charging, so scans are paused. Take it off the charger and put it on your wrist first.'); return false; }
    const mode = MODES[$('hmMode').value] || MODES.oxy, min = over || Math.max(1, Math.min(60, parseInt($('hmMin').value, 10) || 2));
    const ev = parseInt($('hmEvery').value, 10) || 0;
    if (ev && !over && ev <= min) { say('"Repeat every" (' + ev + ' min) must be longer than the scan length (' + min + ' min).'); return false; }
    try {
      await send(mode.start(min), 'start [' + mode.start(min).map((b) => b.toString(16).padStart(2, '0')).join(' ') + ']');
      resetTracks();
      const st = S.state; st.hadValid = false; st.off = false; st.scanning = true; st.startedAt = Date.now(); st.sessionStart = Date.now(); stopAt = Date.now() + min * 60000; clearTimeout(timer); timer = window.__hmScanTimer = setTimeout(finish, min * 60000 + 500);
      if (!auto) st.repeating = ev > 0;
      say('Scanning for ' + min + ' min' + (st.repeating ? ', then again every ' + ev + ' min' : '') + '. Keep the watch snug on your wrist and hold still.'); lg('Health monitor: scan started (' + mode.label + ', ' + min + ' min' + (st.repeating ? ', repeat every ' + ev + ' min' : '') + ').');
      if (st.repeating) plan();
      return true;
    } catch (e) { say('Start failed: ' + e.message); return false; }
  };
  S.stop = async () => {
    const st = S.state; st.repeating = false; st.nextAt = 0; clearTimeout(repTimer); repTimer = 0;
    const was = await halt(); say(was ? 'Scan stopped. Repeating is off.' : 'Not scanning.');
  };
  S.clear = () => { S.samples.length = 0; resetTracks(); S.state.sessionStart = 0; S.state.bpm = S.state.spo2 = S.state.sys = S.state.dia = 0; say('Cleared.'); };

  // Each metric has its own "update every N seconds" and "smoothing %" box on the left. The watch sends one raw value per second;
  // we low-pass it (exponential smoothing, 0% = raw, 90% = very slow) and only show/plot it when its update time has come.
  const cfg = (id, d, lo, hi) => { const e = $(id), n = e ? parseFloat(e.value) : NaN; return Math.max(lo, Math.min(hi, isFinite(n) ? n : d)); };
  function step(name, vals, ok, out, keys, now) {
    if (!ok) return false;
    const T = track[name] || (track[name] = { ema: null, lastEma: 0, lastEmit: 0 });
    const alpha = Math.max(0.03, 1 - cfg('hmSmooth' + name, 0, 0, 95) / 100);
    if (!T.ema) { T.ema = vals.slice(); T.lastEma = now; } else if (now - T.lastEma >= 950) { T.ema = T.ema.map((e, i) => e + (vals[i] - e) * alpha); T.lastEma = now; }
    if (now - T.lastEmit >= cfg('hmEvery' + name, 1, 0.5, 600) * 1000 - 60) { keys.forEach((k, i) => { out[k] = Math.round(T.ema[i]); }); T.lastEmit = now; return true; }
    return false;
  }
  // Blood pressure averaging: collect every reading for "Average over (min)", then show ONE value per window (mean of the readings, or the
  // midpoint of the highest and lowest) and keep the high and low of that window so the graph can shade the range.
  function pushSample(o) { const l = S.samples[S.samples.length - 1]; o.v = l ? (l.v != null ? l.v : 0) + Math.min(GAP_MAX, Math.max(0, o.t - l.t)) : 0; S.samples.push(o); }
  function fillV() {              // samples that came from an older version of this page have no axis position yet
    const a = S.samples; let i = a.length; while (i > 0 && a[i - 1].v == null) i--;
    for (; i < a.length; i++) a[i].v = i ? a[i - 1].v + Math.min(GAP_MAX, Math.max(0, a[i].t - a[i - 1].t)) : 0;
  }
  function flushBp(now, force) {
    if (!bp.sys.length) return false;
    const win = cfg('hmBpAvg', 1, 0, 60) * 60000;
    if (!force && now - bp.start < win) return false;
    const a = bp.sys, d = bp.dia, vs = bp.vs; bp.start = 0; bp.vs = 0; bp.sys = []; bp.dia = [];
    if (force && a.length < 5) return false;                      // too few readings to average
    const mid = ($('hmBpMethod') || {}).value === 'mid';
    const calc = (arr) => { const hi = Math.max(...arr), lo = Math.min(...arr); return { hi, lo, v: Math.round(mid ? (hi + lo) / 2 : arr.reduce((x, y) => x + y, 0) / arr.length) }; };
    const sY = calc(a), dY = calc(d), st = S.state;
    st.sys = sY.v; st.dia = dY.v; st.sysHi = sY.hi; st.sysLo = sY.lo; st.diaHi = dY.hi; st.diaLo = dY.lo;
    pushSample({ t: now, vs, bpm: null, spo2: null, sys: sY.v, dia: dY.v, sysHi: sY.hi, sysLo: sY.lo, diaHi: dY.hi, diaLo: dY.lo, raw: {} });
    return true;
  }
  HT37.onFrame.push((cmd, key, v) => {
    if (cmd !== 0x05 || key !== 0x24 || v.length < 7 || S.state.charging) return;         // nothing is read while the watch is charging
    const bpm = v[6], spo2 = v.length > 7 ? v[7] : 0, dia = v.length > 8 ? v[8] : 0, sys = v.length > 9 ? v[9] : 0;
    const okB = bpm > 30 && bpm < 220, okO = spo2 >= 70 && spo2 <= 100, okP = sys > 0 && dia > 0 && (okB || okO);      // the watch repeats an old blood pressure when nothing is sensed: only trust it with a pulse or oxygen reading
    const now = Date.now(), st = S.state;
    if (okB) st.hadValid = true;
    // sensors are on but heart rate AND oxygen are both 0 (after the warm-up): nothing is being sensed, the watch is off the wrist. The watch keeps
    // repeating the last blood pressure, so ignore it; mark the graph with a flat "no data" line instead.
    if (bpm === 0 && spo2 === 0 && st.scanning && (st.hadValid || now - st.startedAt >= 25000)) {
      if (!st.off) { flushBp(now, true); st.off = true; st.offSince = now; say('No reading: is the watch on your wrist?'); lg('Health monitor: no reading (all zeros), watch looks off the wrist.'); }
      const l0 = S.samples[S.samples.length - 1];
      logRow(now, 'no_reading', null, null, null, null);
      if (!l0 || !l0.off || now - l0.t >= 1000) pushSample({ t: now, off: true, bpm: null, spo2: null, sys: null, dia: null, raw: {} });
      return;
    }
    if (!okB && !okO && !okP) return;                       // warm-up frames carry zeros
    if (okB || okO) st.off = false;
    st.last = now;
    logRow(now, 'ok', okB ? bpm : null, okO ? spo2 : null, okP ? sys : null, okP ? dia : null);
    const out = { t: now, bpm: null, spo2: null, sys: null, dia: null, raw: { bpm: okB ? bpm : null, spo2: okO ? spo2 : null, sys: okP ? sys : null, dia: okP ? dia : null } };
    const e1 = step('Bpm', [bpm], okB, out, ['bpm'], now), e3 = step('O2', [spo2], okO, out, ['spo2'], now);
    let e2 = false;
    if (cfg('hmBpAvg', 1, 0, 60) > 0) { if (okP) { if (!bp.start) { bp.start = now; const l = S.samples[S.samples.length - 1]; bp.vs = l ? l.v + Math.min(GAP_MAX, Math.max(0, now - l.t)) : 0; } bp.sys.push(sys); bp.dia.push(dia); } flushBp(now, false); }
    else e2 = step('Bp', [sys, dia], okP, out, ['sys', 'dia'], now);
    if (!(e1 || e2 || e3)) return;
    if (out.bpm != null) st.bpm = out.bpm; if (out.sys != null) { st.sys = out.sys; st.dia = out.dia; } if (out.spo2 != null) st.spo2 = out.spo2;
    pushSample(out);
    if (S.samples.length > 20000) S.samples.splice(0, 2000);
  });


  // ---------- saving readings to CSV files ----------
  // One file per day (ht37-health-YYYY-MM-DD.csv) in a folder the user picks once. Chrome remembers the folder; after a restart it may ask to
  // allow access again (one click on the button). Until a folder is ready the rows wait in this browser, so nothing is lost.
  const LOGK = 'ht37HealthPendingRows', HDR = 'timestamp_local,time_12h,epoch_ms,state,bpm,spo2,sys_est,dia_est,scan_id\n', BHDR = 'timestamp_local,time_12h,epoch_ms,percent,bars,charging,scanning\n';
  const logq = []; let dirHandle = null, lastLogT = 0, lastLogState = '', flushing = false, saveNote = '';
  try { JSON.parse(localStorage.getItem(LOGK) || '[]').forEach((q) => logq.push(q)); } catch (e) { /* no saved rows */ }
  const idb = (mode, fn) => new Promise((res, rej) => { const o = indexedDB.open('ht37-health', 1); o.onupgradeneeded = () => o.result.createObjectStore('kv'); o.onerror = () => rej(o.error); o.onsuccess = () => { const tx = o.result.transaction('kv', mode), q = fn(tx.objectStore('kv')); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); }; });
  const pad2 = (n) => String(n).padStart(2, '0');
  function rowText(q) {
    const d = new Date(q.t), day = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    const v = (x) => (x == null ? '' : x), stamp = [day + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()), d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }), q.t];
    if (q.kind === 'battery') return { day, file: 'ht37-battery-', hdr: BHDR, line: stamp.concat([q.pct, q.bars, q.chg ? 1 : 0, q.scan ? 1 : 0]).join(',') + '\n' };
    return { day, file: 'ht37-health-', hdr: HDR, line: stamp.concat([q.state, v(q.bpm), v(q.spo2), v(q.sys), v(q.dia), v(q.scan)]).join(',') + '\n' };
  }
  function savePending() { try { localStorage.setItem(LOGK, JSON.stringify(logq.slice(-20000))); } catch (e) { /* storage full or blocked */ } }
  function logRow(now, state, bpm, spo2, sys, dia) {
    const on = $('hmSave'); if (!on || !on.checked) return;
    const every = cfg('hmSaveEvery', 5, 1, 3600) * 1000;
    if (state === lastLogState && now - lastLogT < every - 60) return;       // a change between "ok" and "no_reading" is always written
    lastLogT = now; lastLogState = state;
    logq.push({ t: now, state, bpm, spo2, sys, dia, scan: Math.round((S.state.startedAt || now) / 1000) });
  }
  async function perm(ask) {
    if (!dirHandle) return false;
    try { let p = await dirHandle.queryPermission({ mode: 'readwrite' }); if (p !== 'granted' && ask) p = await dirHandle.requestPermission({ mode: 'readwrite' }); return p === 'granted'; } catch (e) { return false; }
  }
  async function flush(ask) {
    if (flushing || !logq.length) { info(); return; }
    flushing = true; let rows = [];
    try {
      if (!(await perm(ask))) { savePending(); return; }
      rows = logq.splice(0); const byDay = {};
      const hdrOf = {};
      rows.forEach((q) => { const r = rowText(q), k = r.file + r.day; hdrOf[k] = r.hdr; (byDay[k] = byDay[k] || []).push(r.line); });
      for (const k of Object.keys(byDay)) {                                    // k = file name without ".csv", e.g. ht37-health-2026-11-01
        const fh = await dirHandle.getFileHandle(k + '.csv', { create: true });
        const size = (await fh.getFile()).size, w = await fh.createWritable({ keepExistingData: true });
        await w.write({ type: 'seek', position: size }); await w.write((size ? '' : hdrOf[k]) + byDay[k].join('')); await w.close();
      }
      saveNote = 'Last saved ' + new Date().toLocaleTimeString('en-US') + ' (' + rows.length + ' rows)'; rows = []; savePending();
    } catch (e) { logq.unshift(...rows); saveNote = 'Could not write the file: ' + e.message; savePending(); }
    finally { flushing = false; info(); }
  }
  function info() {
    const e = $('hmSaveInfo'); if (!e) return;
    const wait = logq.length ? ' ' + logq.length + ' rows waiting.' : '';
    e.textContent = !window.showDirectoryPicker ? 'This browser cannot save to a folder. Use Chrome or Edge.' + wait
      : !dirHandle ? 'No folder chosen yet. Rows are kept in this browser until you pick one.' + wait
      : 'Folder: ' + dirHandle.name + (saveNote ? '. ' + saveNote : '.') + wait;
  }
  async function chooseFolder() {
    try {
      if (dirHandle && !(await perm(true))) dirHandle = null;
      if (!dirHandle) { dirHandle = await window.showDirectoryPicker({ id: 'ht37health', mode: 'readwrite' }); await idb('readwrite', (st) => st.put(dirHandle, 'dir')); }
      await flush(true);
    } catch (e) { if (e.name !== 'AbortError') say('Folder not saved: ' + e.message); }
    info();
  }
  function downloadWaiting() {
    [['health', HDR, (q) => q.kind !== 'battery'], ['battery', BHDR, (q) => q.kind === 'battery']].forEach(([name, hdr, pick]) => {
      const rows = logq.filter(pick); if (!rows.length) return;
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([hdr + rows.map((q) => rowText(q).line).join('')], { type: 'text/csv' }));
      a.download = 'ht37-' + name + '-waiting-rows.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
  }
  S.logBattery = (p) => { const c = $('hmBatSave'); if (c && c.checked) logq.push({ kind: 'battery', t: p.t, pct: p.pct, bars: p.bars, chg: p.chg, scan: p.scan }); };
  clearInterval(window.__hmFlushTimer); window.__hmFlushTimer = setInterval(() => flush(false), 15000);
  idb('readonly', (st) => st.get('dir')).then((h) => { if (h) { dirHandle = h; saveNote = 'Click "Choose folder" again if Chrome asks for access'; } info(); }).catch(() => info());

  // charging: the watch reports 02/1C (charging flag, bars, percent) on its own about every 20 s while on a charger. A charging watch is not on the wrist,
  // so end any scan WITHOUT sending anything, freeze the graphs and send nothing more until it is off the charger.
  HT37.onFrame.push((cmd, key, v) => { /* S.samples */
    if (cmd !== 0x02 || key !== 0x1c || v.length < 3) return;
    const st = S.state, chg = v[0] !== 0;
    if (chg === !!st.charging) return;
    st.charging = chg; const now = Date.now();
    if (chg) {
      clearTimeout(timer); timer = 0;
      if (st.scanning) { halt(true); }
      st.off = false; logRow(now, 'charging', null, null, null, null);
      say('The watch is charging: scans are paused and the graphs are frozen until it is off the charger.'); lg('Health monitor: watch is charging, scan paused (nothing is sent to the watch).');
    } else { say('Charging ended. Put the watch on your wrist and press Start scan.'); lg('Health monitor: watch is off the charger.'); }
  });

  // when the watch was off the wrist, a raise-to-wake (the watch then sends its 05/22 today-total frame) starts one short 1-minute scan to pick the readings back up
  HT37.onFrame.push((cmd, key) => { /* S.samples */
    if (cmd !== 0x05 || key !== 0x22) return;
    const st = S.state, wk = $('hmWake');
    if (st.scanning || st.charging || !st.off || !wk || !wk.checked || !connected() || Date.now() - (st.autoAt || 0) < 90000) return;
    st.autoAt = Date.now(); say('Watch woke up: starting a 1-minute scan to look for a reading.'); lg('Health monitor: watch woke while off-wrist, starting a short scan.'); S.start(true, 1);
  });

  // ---------- drawing ----------
  const GREEN = '#22ff88', YEL = '#ffd23f', CYAN = '#35d0ff', RED = '#ff6b6b', PINK = '#ffa6c9', GRID = 'rgba(80,140,120,.18)';
  // one beat of a PQRST-like shape, phase 0..1 -> about -0.3..1 (synthetic)
  function beat(p) {
    const g = (c, w, a) => a * Math.exp(-Math.pow((p - c) / w, 2));
    return g(0.16, 0.035, 0.18) + g(0.36, 0.010, -0.14) + g(0.385, 0.012, 1.0) + g(0.41, 0.012, -0.28) + g(0.62, 0.05, 0.30);
  }
  let col = [], sweepX = 0, phase = 0, lastT = 0, rpT = 0, rpIdx = 0;
  let rsKey = '', rsVal = [];
  function replaySet() {
    const t = S.state.sessionStart || 0, key = S.samples.length + ':' + t; if (key === rsKey) return rsVal; rsKey = key;
    let src = S.samples.filter((q) => q.t >= t); if (src.filter((q) => q.bpm != null).length < 5) src = S.samples.slice(-300);
    const last = { sys: null, dia: null, spo2: null }, out = [];
    src.forEach((q) => { ['sys', 'dia', 'spo2'].forEach((k) => { if (q[k] != null) last[k] = q[k]; }); if (q.bpm != null) out.push({ t: q.t, v: q.v, bpm: q.bpm, sys: last.sys, dia: last.dia, spo2: last.spo2 }); });
    return (rsVal = out);
  }
  const fmtT = (t) => { const d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }); };

  // turning points (peaks and lows) of a series, ignoring wiggles smaller than thr
  function turns(pts, thr) {
    if (!pts.length) return [];
    const out = []; let lo = pts[0], hi = pts[0], dir = 0;
    for (const p of pts) {
      if (dir === 0) { if (p.v > hi.v) hi = p; if (p.v < lo.v) lo = p; if (p.v - lo.v >= thr && lo.i <= p.i) { out.push({ ...lo, k: 'lo' }); dir = 1; hi = p; } else if (hi.v - p.v >= thr) { out.push({ ...hi, k: 'hi' }); dir = -1; lo = p; } }
      else if (dir === 1) { if (p.v > hi.v) hi = p; else if (hi.v - p.v >= thr) { out.push({ ...hi, k: 'hi' }); dir = -1; lo = p; } }
      else { if (p.v < lo.v) lo = p; else if (p.v - lo.v >= thr) { out.push({ ...lo, k: 'lo' }); dir = 1; hi = p; } }
    }
    if (dir === 1) out.push({ ...hi, k: 'hi' }); else if (dir === -1) out.push({ ...lo, k: 'lo' });
    return out;
  }

  // keep the whole monitor visible: the canvas is as tall as the space above the log bar at the bottom (it grows when that bar is minimized)
  let fitAt = 0;
  function fit(cv) {
    const nowT = Date.now(); if (nowT - fitAt < 400) return; fitAt = nowT;
    let e = document.elementFromPoint(40, window.innerHeight - 8), dockTop = window.innerHeight;
    while (e && e !== document.body) { const cs = getComputedStyle(e); if (cs.position === 'fixed' || cs.position === 'sticky') { dockTop = e.getBoundingClientRect().top; break; } e = e.parentElement; }
    const h = Math.max(420, Math.floor(dockTop - cv.getBoundingClientRect().top - 12));
    if (Math.abs(cv.getBoundingClientRect().height - h) > 2) cv.style.height = h + 'px';
    const lf = $('hmLeft'); if (lf) lf.style.maxHeight = h + 'px';
  }
  function frame(ts) {
    const cv = $('hmCanvas'); if (!cv || !$('tab-health')) return;
    if ($('tab-health').classList.contains('active')) fit(cv);
    if (!$('tab-health').classList.contains('active')) { lastT = 0; requestAnimationFrame(frame); return; }   // idle when the tab is hidden
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, W = Math.max(300, Math.floor(r.width)), H = Math.max(400, Math.floor(r.height));
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; col = []; sweepX = 0; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dt = lastT ? Math.min(0.1, (ts - lastT) / 1000) : 0; lastT = ts;
    const st0 = S.state, live = Date.now() - st0.last < 6000 && st0.bpm > 0, idle = !live && !st0.scanning, off = !!st0.off;
    // when no scan is running, replay the last scan in a loop so the monitor keeps moving (the Replay box turns this off)
    const rs = replaySet(), rpOn = idle && !off && !st0.charging && rs.length > 1 && $('hmReplay') && $('hmReplay').checked;
    if (rpOn) { if (!rpT) rpT = ts; if (ts - rpT >= 1000) { rpIdx = (rpIdx + Math.floor((ts - rpT) / 1000)) % rs.length; rpT = ts; } } else { rpT = 0; rpIdx = 0; }
    const rp = rpOn ? rs[rpIdx % rs.length] : null;
    const st = rp ? { bpm: rp.bpm, spo2: rp.spo2 || st0.spo2, sys: rp.sys || st0.sys, dia: rp.dia || st0.dia, scanning: false, last: st0.last } : st0;
    const lastSampleT = S.samples.length ? S.samples[S.samples.length - 1].t : Date.now();
    g.fillStyle = '#04080c'; g.fillRect(0, 0, W, H);

    const side = Math.min(230, Math.floor(W * 0.22)), PW = W - side - 12;       // plot width, numbers on the right
    const h0 = Math.floor(H * 0.375), hT = Math.floor((H - h0) / 2.5), hBp = Math.floor(hT / 2);       // pulse is the biggest panel, blood pressure is half of a trend panel
    const P = [{ y: 0, h: h0 }, { y: h0, h: hT }, { y: h0 + hT, h: hBp }, { y: h0 + hT + hBp, h: H - h0 - hT - hBp }];

    P.forEach((p) => {
      g.strokeStyle = GRID; g.lineWidth = 1; g.beginPath();
      for (let x = 0; x <= PW; x += 40) { g.moveTo(x + .5, p.y); g.lineTo(x + .5, p.y + p.h); }
      for (let y = 0; y <= p.h; y += 40) { g.moveTo(0, p.y + y + .5); g.lineTo(PW, p.y + y + .5); }
      g.stroke(); g.strokeStyle = 'rgba(255,255,255,.12)'; g.strokeRect(.5, p.y + .5, PW - 1, p.h - 1);
    });

    // panel 0: synthetic pulse trace paced by the real BPM
    const beating = !off && !S.state.charging && (live || !!rp || (S.state.scanning && st.bpm > 0)), mid = P[0].y + P[0].h * 0.58, amp = P[0].h * 0.36, speed = 140, hz = beating ? st.bpm / 60 : 0;
    const steps = Math.max(1, Math.round(dt * speed));
    for (let s = 0; s < steps && dt > 0; s++) {
      phase = (phase + (hz / speed)) % 1; sweepX = (sweepX + 1) % PW;
      col[sweepX] = beating ? mid - beat(phase) * amp : mid;
      for (let k = 1; k <= 18; k++) col[(sweepX + k) % PW] = undefined;
    }
    g.strokeStyle = beating ? GREEN : (off ? '#c0504d' : S.state.charging ? '#4aa3ff' : '#2d6b4d'); g.lineWidth = 2; g.shadowColor = GREEN; g.shadowBlur = beating ? 6 : 0; g.beginPath();
    let pen = false; for (let x = 0; x < PW; x++) { const y = col[x]; if (y === undefined) { pen = false; continue; } if (!pen) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y); }
    g.stroke(); g.shadowBlur = 0;
    g.fillStyle = GREEN; g.font = '600 11px system-ui,sans-serif'; g.textAlign = 'left'; g.fillText('PULSE  -  ' + (S.state.charging ? 'CHARGING' : off ? 'NO READING' : S.state.scanning ? 'SCANNING' : 'MONITORING'), 8, 15);

    // trend panels: real samples with a marker and a time + date label on every peak and low
    fillV(); const lastS = S.samples[S.samples.length - 1];
    const headV = lastS ? lastS.v + (idle ? 0 : Math.min(2000, Date.now() - lastS.t)) : 0, winMs = WINDOW_S > 0 ? WINDOW_S * 1000 : Math.max(30000, headV - (S.samples.length ? S.samples[0].v : headV)), t0 = headV - winMs;     // axis position, not wall-clock time
    const now = idle ? lastSampleT : Date.now();                                                                              // wall-clock time for the labels
    const trend = (p, title, color, unit, series, minSpan, thr, lanes) => {
      g.fillStyle = color; g.font = '600 11px system-ui,sans-serif'; g.textAlign = 'left'; g.fillText(title, 8, p.y + 15);
      // blood pressure (se.win) is drawn as level segments, one per averaging window, joined into one continuous line, held to the present while scanning;
      // the window still being collected is drawn dashed from its running average
      const mkPts = (se) => {
        const out = [];
        let sawOff = false, i = 0;                                                      // a no-data stretch breaks the line instead of drawing a slope across it
        S.samples.forEach((s) => {
          if (s.off) { sawOff = true; return; }
          if (s.v < t0 || s[se.key] == null) return;
          const base = { rt: s.t, v: s[se.key], i: i++, hi: se.hi && s[se.hi] != null ? s[se.hi] : null, lo: se.lo && s[se.lo] != null ? s[se.lo] : null };
          const brk = sawOff && out.length > 0; sawOff = false;
          if (se.win && s.vs != null && s.vs < s.v) { out.push({ ...base, t: s.vs, mark: false, gap: brk }); out.push({ ...base, t: s.v, mark: true }); }
          else out.push({ ...base, t: s.v, mark: true, gap: brk });
        });
        if (se.win) {
          const l = out[out.length - 1], arr = S.state.scanning && !S.state.off ? (se.key === 'sys' ? bp.sys : bp.dia) : [];
          if (arr.length) { const m = Math.round(arr.reduce((a, b2) => a + b2, 0) / arr.length), vsP = Math.max(bp.vs || 0, l ? l.t : 0); out.push({ rt: Date.now(), v: m, i: 1e9, hi: null, lo: null, t: vsP, mark: false, prov: true }, { rt: Date.now(), v: m, i: 1e9 + 1, hi: null, lo: null, t: Math.max(vsP, headV), mark: false, prov: true }); }
          else if (l && headV > l.t && !S.state.off) out.push({ ...l, t: headV, mark: false });
        }
        return out;
      };
      // flat red "no data" line along the bottom wherever the watch reported nothing (off the wrist)
      { const xx = (t) => (t - t0) / winMs * PW, yy = p.y + p.h - 8; let run = null; const runs = [];
        S.samples.forEach((q) => { if (q.off) { if (!run) runs.push(run = { a: q.v, b: q.v }); else run.b = q.v; } else run = null; });
        const lastQ = S.samples[S.samples.length - 1];
        if (runs.length && lastQ && lastQ.off && S.state.off) runs[runs.length - 1].b = Math.max(runs[runs.length - 1].b, headV);
        g.strokeStyle = '#ff5a5a'; g.fillStyle = '#ff5a5a'; g.lineWidth = 2; g.font = '9px system-ui,sans-serif';
        runs.forEach((q) => { if (q.b < t0) return; const x1 = Math.max(0, xx(q.a)), x2 = Math.min(PW, xx(q.b)); g.beginPath(); g.moveTo(x1, yy); g.lineTo(Math.max(x1 + 2, x2), yy); g.stroke(); if (x2 - x1 > 70) g.fillText('NO DATA (watch off wrist?)', x1 + 4, yy - 4); }); }
      const data = series.map(mkPts);
      let vmin = Infinity, vmax = -Infinity; data.forEach((d) => d.forEach((q) => { vmin = Math.min(vmin, q.lo != null ? q.lo : q.v); vmax = Math.max(vmax, q.hi != null ? q.hi : q.v); }));
      if (!isFinite(vmin)) { g.fillStyle = 'rgba(255,255,255,.25)'; g.font = '12px system-ui,sans-serif'; g.fillText('no data yet: press Start scan', 12, p.y + p.h / 2); return; }
      const X = (t) => (t - t0) / winMs * PW, Ys = [];
      series.forEach((se, si) => {                                                       // one scale per line when lanes is on (each line gets its own band of the panel)
        let a = Infinity, b = -Infinity; (lanes ? [data[si]] : data).forEach((d) => d.forEach((q) => { a = Math.min(a, lanes ? q.v : (q.lo != null ? q.lo : q.v)); b = Math.max(b, lanes ? q.v : (q.hi != null ? q.hi : q.v)); }));
        if (!isFinite(a)) { Ys[si] = () => p.y + p.h / 2; return; }
        const span = Math.max(minSpan, b - a), m2 = (a + b) / 2, lo = Math.floor(m2 - span * 0.7), hi = Math.ceil(m2 + span * 0.7);
        const top = lanes ? p.y + 20 + si * (p.h - 24) / series.length : p.y + 12, bot = lanes ? top + (p.h - 24) / series.length - 4 : p.y + p.h - 12;
        Ys[si] = (v) => { const y = bot - (v - lo) / (hi - lo) * (bot - top - (lanes ? 6 : 12)); return lanes ? Math.max(top - 2, Math.min(bot + 2, y)) : y; };
        g.fillStyle = 'rgba(255,255,255,.35)'; g.font = '10px system-ui,sans-serif'; g.fillText(hi + unit, PW - 44, top + 8); g.fillText(lo + unit, PW - 44, bot);
      });
      series.forEach((se, si) => {
        const d = data[si]; if (!d.length) return; const Y = Ys[si];
        const bd = d.filter((q) => q.hi != null && q.lo != null);                      // shaded band = highest and lowest reading of each averaging window
        if (bd.length) { g.globalAlpha = 0.22; g.fillStyle = se.color; g.beginPath(); bd.forEach((q, k) => { if (k) g.lineTo(X(q.t), Y(q.hi)); else g.moveTo(X(q.t), Y(q.hi)); }); for (let k = bd.length - 1; k >= 0; k--) g.lineTo(X(bd[k].t), Y(bd[k].lo)); g.closePath(); g.fill(); g.globalAlpha = 1;
          bd.filter((q) => q.mark).forEach((q) => { const x = X(q.t); g.strokeStyle = se.color; g.globalAlpha = 0.5; g.lineWidth = 1; g.beginPath(); g.moveTo(x, Y(q.hi)); g.lineTo(x, Y(q.lo)); g.stroke(); g.globalAlpha = 1; }); }
        const ip = d.findIndex((q) => q.prov), solid = ip < 0 ? d : d.slice(0, ip + 1);
        g.strokeStyle = se.color; g.lineWidth = 2; g.setLineDash([]); g.beginPath(); solid.forEach((q, k) => { if (k && !q.gap) g.lineTo(X(q.t), Y(q.v)); else g.moveTo(X(q.t), Y(q.v)); }); g.stroke();
        if (ip >= 0) { g.setLineDash([5, 4]); g.beginPath(); d.slice(ip).forEach((q, k) => { if (k) g.lineTo(X(q.t), Y(q.v)); else g.moveTo(X(q.t), Y(q.v)); }); g.stroke(); g.setLineDash([]); }
        const tp = turns(d.filter((q) => q.mark), thr); let lastX = -999;
        tp.forEach((q) => {
          const x = X(q.t), y = Y(q.v); g.fillStyle = se.color; g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill();
          if (Math.abs(x - lastX) < 74) return; lastX = x;
          const txt = q.v + ' ' + fmtT(q.rt); g.font = '9px system-ui,sans-serif'; const w = g.measureText(txt).width, lx = Math.max(3, Math.min(PW - w - 3, x - w / 2));
          g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(lx - 1, (q.k === 'hi' ? y - 18 : y + 5), w + 2, 11); g.fillStyle = se.color; g.fillText(txt, lx, (q.k === 'hi' ? y - 9 : y + 14));
        });
        const e = d[d.length - 1]; g.fillStyle = '#fff'; g.beginPath(); g.arc(X(e.t), Y(e.v), 3.8, 0, 7); g.fill();
      });
      g.fillStyle = 'rgba(255,255,255,.3)'; g.font = '10px system-ui,sans-serif'; g.fillText((WINDOW_S <= 0 ? 'all data' : 'last ' + (WINDOW_S >= 3600 ? WINDOW_S / 3600 + ' h' : WINDOW_S / 60 + ' min')), PW - 90, p.y + 26);
    };
    trend(P[1], 'HEART RATE (bpm)', YEL, '', [{ key: 'bpm', color: YEL }], 20, 3);
    trend(P[2], 'BLOOD PRESSURE (mmHg, estimate)  top = systolic, bottom = diastolic, shaded = high to low of each window', RED, '', [{ key: 'sys', color: RED, hi: 'sysHi', lo: 'sysLo', win: true }, { key: 'dia', color: PINK, hi: 'diaHi', lo: 'diaLo', win: true }], 4, 2, true);
    trend(P[3], 'BLOOD OXYGEN (SpO₂ %, estimate from the watch)', CYAN, '', [{ key: 'spo2', color: CYAN }], 6, 1);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.font = '10px system-ui,sans-serif'; g.textAlign = 'left'; g.fillText(fmtT((S.samples.find((q) => q.v >= t0) || { t: now }).t), 4, H - 3); g.textAlign = 'right'; g.fillText((idle ? 'last reading ' : 'now ') + fmtT(now), PW - 4, H - 3); g.textAlign = 'left';
    if (rp) { const px = (rp.v - t0) / winMs * PW; if (px >= 0 && px <= PW) { g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px, P[1].y); g.lineTo(px, H); g.stroke(); } }

    // numbers: heart rate, blood pressure (right under it), oxygen, all stacked at the top right
    const nx = PW + 14, bigPx = Math.floor(side * 0.40);
    const dim = !!S.state.charging;                                  // charging: show the last values grayed out
    const big = (y, label, val, unit, color, px) => { g.fillStyle = dim ? '#5d6875' : color; g.font = '600 12px system-ui,sans-serif'; g.fillText(label + (dim ? ' (last reading)' : ''), nx, y); g.font = '700 ' + px + 'px ui-monospace,Consolas,monospace'; g.fillText(val, nx, y + px * 0.95); g.font = '12px system-ui,sans-serif'; g.fillText(unit, nx, y + px * 0.95 + 16); return y + px * 0.95 + 30; };
    let y = big(24, 'HEART RATE', st.bpm && !off ? String(st.bpm) : '--', 'bpm', GREEN, bigPx);
    y = big(y + 6, 'BLOOD PRESSURE (est.)', off ? '--/--' : st.sys ? st.sys + '/' + st.dia : (bp.sys.length ? Math.round(bp.sys.reduce((a, b2) => a + b2, 0) / bp.sys.length) + '/' + Math.round(bp.dia.reduce((a, b2) => a + b2, 0) / bp.dia.length) : '--/--'), (st.sysHi != null && !rp ? 'mmHg  range ' + st.sysLo + '-' + st.sysHi + ' / ' + st.diaLo + '-' + st.diaHi : 'mmHg  (systolic/diastolic)'), RED, Math.floor(bigPx * 0.72));
    y = big(y + 6, 'BLOOD OXYGEN (est.)', st.spo2 && !off ? String(st.spo2) : '--', '% SpO\u2082', CYAN, Math.floor(bigPx * 0.72));
    g.font = '12px system-ui,sans-serif'; g.fillStyle = S.state.charging ? '#ffd23f' : off ? RED : S.state.scanning ? YEL : CYAN;
    const left = S.state.scanning ? Math.max(0, Math.round((stopAt - Date.now()) / 1000)) : 0;
    g.fillText(S.state.charging ? '\u26a1 CHARGING: paused' : off ? 'NO READING: watch on wrist?' : S.state.scanning ? 'SCANNING ' + left + 's' : 'MONITORING', nx, y + 4);
    if (S.state.nextAt) { const nl = Math.max(0, Math.round((S.state.nextAt - Date.now()) / 1000)); g.fillStyle = YEL; g.fillText('NEXT SCAN IN ' + Math.floor(nl / 60) + ':' + String(nl % 60).padStart(2, '0'), nx, y + 40); }
    g.fillStyle = '#6b7785'; g.fillText('samples: ' + S.samples.length, nx, y + 22);
    const win = S.samples.filter((q) => q.v >= t0 && q.bpm != null).map((q) => q.bpm);
    if (win.length) { g.fillStyle = '#9aa7b5'; g.fillText('avg ' + Math.round(win.reduce((a, b2) => a + b2, 0) / win.length) + '  min ' + Math.min(...win) + '  max ' + Math.max(...win), nx, y + 58); }
    if (HT37.battery && HT37.battery.draw) {                                                  // small battery window under the numbers (js/pages/health/health-battery.js)
      const hrs = parseInt(($('hmBatRange') || {}).value, 10), by0 = Math.max(y + 66, H - 168), bh0 = H - by0 - 6;
      if (bh0 >= 118 && W - (PW + 8) > 150) HT37.battery.draw(g, PW + 8, by0, W - PW - 12, bh0, hrs > 0 ? hrs * 3600000 : 0);
    }
    requestAnimationFrame(frame);
  }

  // ---------- tab ----------
  function mount(n) {
    const nav = $('studioTabNav'), cont = $('studioMainContainer');
    if (!nav || !cont || !nav.children.length) { if (n < 100) setTimeout(() => mount(n + 1), 100); return; }
    if ($('tab-health')) return;
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'studio-tab-btn'; btn.dataset.tab = 'tab-health'; btn.textContent = 'Tab 6: ❤ Health Data'; nav.appendChild(btn);
    const pane = document.createElement('div'); pane.id = 'tab-health'; pane.className = 'studio-tab-pane';
    const ctl = 'height:28px;font-size:12px;background:#111827;color:#e2e8f0;border:1px solid #334155;box-sizing:border-box;padding:2px 6px;';
    const b = 'width:100% !important;height:34px;font-size:13px;font-weight:700;border:none;cursor:pointer;color:#fff;margin-top:6px;';
    const small = 'height:26px;font-size:12px;background:#111827;color:#e2e8f0;border:1px solid #334155;box-sizing:border-box;padding:2px 4px;width:100% !important;';
    const timing = (label, id, ev, sm) => '<div style="font-size:11px;color:#cbd5e1;margin-top:2px;">' + label + '</div><div style="display:flex;gap:6px;"><label style="flex:1;font-size:10px;color:#94a3b8;">Every (s)<input id="hmEvery' + id + '" type="number" min="0.5" max="600" step="0.5" value="' + ev + '" style="' + small + '"></label><label style="flex:1;font-size:10px;color:#94a3b8;">Smoothing (%)<input id="hmSmooth' + id + '" type="number" min="0" max="95" step="5" value="' + sm + '" style="' + small + '"></label></div>';
    const bpAvgHtml = '<div style="display:flex;gap:6px;margin-top:2px;"><label style="flex:1;font-size:10px;color:#94a3b8;">BP average over (min)<input id="hmBpAvg" type="number" min="0" max="60" step="0.5" value="1" style="' + small + '"></label><label style="flex:1;font-size:10px;color:#94a3b8;">Average type<select id="hmBpMethod" style="' + small + '"><option value="mean">Mean of readings</option><option value="mid">Midpoint high/low</option></select></label></div><div style="font-size:10px;color:#94a3b8;line-height:1.3;">Blood pressure shows one value per averaging window, with its high to low range shaded. Set 0 to use the Every and Smoothing boxes above instead.</div>';
    const saveHtml = '<div style="font-size:12px;font-weight:700;color:#38bdf8;margin-top:6px;">Save readings to a file</div>' +
      '<label style="font-size:11px;color:#cbd5e1;display:flex;gap:6px;align-items:flex-start;"><input id="hmSave" type="checkbox" checked style="width:auto !important;margin:2px 0 0;"> Save readings as CSV files (one file per day)</label>' +
      '<label style="font-size:10px;color:#94a3b8;">Save one reading every (seconds)<input id="hmSaveEvery" type="number" min="1" max="3600" step="1" value="5" style="' + small + '"></label>' +
      '<button id="hmFolder" type="button" style="' + b + 'background:#0369a1;">📁 Choose folder…</button>' +
      '<label style="font-size:10px;color:#94a3b8;">Battery graph shows<select id="hmBatRange" style="' + small + '"><option value="6">Last 6 hours</option><option value="24" selected>Last 24 hours</option><option value="72">Last 3 days</option><option value="168">Last 7 days</option><option value="0">All saved</option></select></label>' +
      '<label style="font-size:11px;color:#cbd5e1;display:flex;gap:6px;align-items:flex-start;"><input id="hmBatSave" type="checkbox" checked style="width:auto !important;margin:2px 0 0;"> Also save battery readings (ht37-battery-DATE.csv)</label>' +
      '<div id="hmSaveInfo" style="font-size:10px;color:#94a3b8;line-height:1.35;"></div>' +
      '<button id="hmDl" type="button" style="' + b + 'background:#334155;height:28px;font-size:11px;">⬇ Download waiting rows</button>';
    pane.innerHTML =
      '<div style="display:flex;gap:12px;padding:10px;box-sizing:border-box;align-items:flex-start;">' +
      '<div id="hmLeft" style="width:250px;flex:none;display:flex;flex-direction:column;gap:6px;overflow-y:auto;padding-right:4px;box-sizing:border-box;">' +
      '<div style="font-size:12px;font-weight:700;color:#38bdf8;">❤ Live Health Monitor</div>' +
      '<div style="font-size:11px;color:#94a3b8;line-height:1.35;">Press Start to turn on the sensor lights on the back of the watch. The watch sends a new reading about once a second. It stops by itself.</div>' +
      '<label style="font-size:11px;color:#94a3b8;">What to measure</label><select id="hmMode" style="' + ctl + 'width:100% !important;"></select>' +
      '<label style="font-size:11px;color:#94a3b8;">Graph time range</label><select id="hmRange" style="' + ctl + 'width:100% !important;"><option value="0">Fit all data (auto)</option><option value="120">Last 2 minutes</option><option value="600">Last 10 minutes</option><option value="3600">Last hour</option></select>' +
      '<label style="font-size:11px;color:#94a3b8;">Scan length (minutes, how long the sensors stay on)</label><input id="hmMin" type="number" min="1" max="60" value="2" style="' + ctl + 'width:100% !important;">' +
      '<label style="font-size:11px;color:#94a3b8;">Repeat the scan</label><select id="hmEvery" style="' + ctl + 'width:100% !important;"><option value="0">Once (no repeat)</option><option value="3">Every 3 minutes</option><option value="5">Every 5 minutes</option><option value="10">Every 10 minutes</option><option value="15">Every 15 minutes</option><option value="30">Every 30 minutes</option><option value="60">Every hour</option></select>' +
      '<div style="font-size:10px;line-height:1.3;color:#fbbf24;background:#2a2108;border:1px solid #5c4a10;padding:4px 6px;">⚠ Scanning keeps the watch sensors (green lights) on. Long or frequent scans drain the watch battery faster.</div>' +
      '<div style="font-size:11px;color:#38bdf8;font-weight:700;margin-top:4px;">Update speed and smoothing</div>' +
      '<div style="font-size:10px;color:#94a3b8;line-height:1.3;">Every = how often the number and graph update (seconds). Smoothing = how much the value is calmed down: 0 is raw, 90 is very slow.</div>' +
      timing('Heart rate', 'Bpm', 1, 0) + timing('Blood pressure', 'Bp', 10, 80) + bpAvgHtml + timing('Oxygen', 'O2', 5, 70) +
      '<label style="font-size:11px;color:#cbd5e1;display:flex;gap:6px;align-items:center;"><input id="hmLogClr" type="checkbox" checked style="width:auto !important;margin:0;"> Clear the log while scanning, every</label><div style="display:flex;gap:6px;align-items:center;font-size:11px;color:#94a3b8;"><input id="hmLogMin" type="number" min="0.5" max="30" step="0.5" value="1" style="' + ctl + 'width:60px !important;"> minutes (keeps the page fast)</div>' +
      '<label style="font-size:11px;color:#cbd5e1;display:flex;gap:6px;align-items:flex-start;"><input id="hmWake" type="checkbox" checked style="width:auto !important;margin:2px 0 0;"> If the watch is off my wrist, run a 1-minute scan when it wakes up (wrist motion)</label>' +
      '<label style="font-size:11px;color:#cbd5e1;display:flex;gap:6px;align-items:center;"><input id="hmReplay" type="checkbox" checked style="width:auto !important;margin:0;"> Replay the last scan when idle</label>' +
      '<button id="hmStart" type="button" style="' + b + 'background:#10b981;">▶ Start scan</button>' +
      '<button id="hmStop" type="button" style="' + b + 'background:#ef4444;">■ Stop</button>' +
      '<button id="hmClear" type="button" style="' + b + 'background:#334155;">🧹 Clear graph</button>' +
      '<div id="hmStatus" style="font-size:11px;color:#cbd5e1;line-height:1.35;margin-top:4px;">Idle. Nothing is sent until you press Start.</div>' +
      saveHtml +
      '</div>' +
      '<canvas id="hmCanvas" style="flex:1;min-width:0;height:600px;background:#04080c;border:1px solid #1e293b;display:block;"></canvas></div>';
    cont.appendChild(pane);
    const sel = $('hmMode'); Object.keys(MODES).forEach((k) => { const o = document.createElement('option'); o.value = k; o.textContent = MODES[k].label; sel.appendChild(o); }); sel.value = 'oxy';
    $('hmRange').onchange = () => { WINDOW_S = parseInt($('hmRange').value, 10) || 0; };
    $('hmFolder').onclick = chooseFolder; $('hmDl').onclick = downloadWaiting; info();
    // keep the page fast: the log fills with ~8 lines a second during a scan, so empty it every N minutes (quietly) while scanning
    clearInterval(window.__hmLogTimer); let lastClr = Date.now();
    window.__hmLogTimer = setInterval(() => {
      if (!S.state.scanning) { lastClr = Date.now(); return; }
      const on = $('hmLogClr') && $('hmLogClr').checked, mins = Math.max(0.5, parseFloat($('hmLogMin') && $('hmLogMin').value) || 1);
      if (!on || Date.now() - lastClr < mins * 60000) return;
      lastClr = Date.now();
      try { logHistory = []; window.structuredLogHistory = []; ['logTerminal', 'tab4LogTerminal'].forEach((id) => { const e = document.getElementById(id); if (e) e.innerHTML = ''; }); } catch (e) { /* log not available: nothing to clear */ }
    }, 5000);
    $('hmStart').onclick = () => S.start(); $('hmStop').onclick = () => S.stop(); $('hmClear').onclick = () => S.clear();
    requestAnimationFrame(frame);
  }
  setTimeout(() => mount(0), 800);
})();
