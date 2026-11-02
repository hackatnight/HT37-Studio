/**
 * @file     js/editor/live-data.js
 * @layer    EDITOR logic (live values for the preview)
 * @summary  Makes the preview show REAL values instead of frozen test values:
 *             - date (MM/DD) and weekday follow the computer's clock while the shared clock is running (time already did);
 *             - steps and battery are pulled from the watch every 20 s while it is connected (0x05/0x21 today total, 0x02/0x1B battery);
 *             - any value the watch pushes on its own (heart rate, battery, steps) moves the sliders and redraws the widgets at once.
 *           Heart rate is NOT polled: it needs the optical LEDs on (battery drain); use the heart-rate slider or the Diagnostics tab.
 * UI       Its own tool card "Live Watch Data" (#liveWatchCard) above "Live Sensors & Simulation": a tile per value the watch reports (steps, heart rate, oxygen, blood pressure, battery, distance, calories), Refresh and Measure buttons, two checkboxes.
 * Steps, battery and heart rate were verified against a real watch (steps matched the watch screen).
 * API      HT37.liveData = { tick, pullNow, state }
 */
(function () {
  window.HT37 = window.HT37 || {};
  const state = { realDate: true, pull: true, lastPull: 0, lastMsg: '', wasConnected: false };
  const known = { steps: false, hr: false, battery: false }; // true once the WATCH (or you, with a slider) gave a value; unknown values show as 00 while a watch is connected
  const pad2 = (n) => String(n).padStart(2, '0');
  const $ = (id) => document.getElementById(id);

  function connected() {
    try { return typeof cmdChar !== 'undefined' && cmdChar && typeof bleDevice !== 'undefined' && bleDevice && bleDevice.gatt && bleDevice.gatt.connected; } catch (e) { return false; }
  }

  const isLive = () => connected();
  function received(k) { if (k in known && !known[k]) { known[k] = true; if (typeof window.syncBinWidgetsWithSensors === 'function') window.syncBinWidgetsWithSensors(); } paint(); }

  /** Date and weekday from the computer clock (only while the shared clock is live; STOP TIME keeps whatever you typed). */
  function syncDate() {
    if (!state.realDate || !(window.simClock && window.simClock.live)) return;
    const d = new Date(), md = pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()), wd = String((d.getDay() + 6) % 7); // 0 = MON
    const di = $('simDateInput'), ws = $('simWeekdaySelect'); let changed = false;
    if (di && di.value !== md) { di.value = md; changed = true; }
    if (ws && ws.value !== wd) { ws.value = wd; changed = true; }
    if (changed && typeof window.syncBinWidgetsWithSensors === 'function') window.syncBinWidgetsWithSensors();
  }

  /** Heart rate: the watch measures on its own but only streams the value to the app while the optical LEDs are switched on (0x05/0x23). 30 s, then off again. */
  async function stopHr() {
    clearTimeout(state.hrTimer); state.hrTimer = 0;
    const b = $('ldHr'); if (b) b.textContent = '❤ Measure heart rate (30 s)';
    if (!connected()) return;
    try { const f = buildFitCloudFrame(0x05, 0x23, [0x00, 0x00], 0x00); await enqueueBleWrite(cmdChar, f.frame, 'LiveData PPG stop seq=' + f.seq, false); } catch (e) { /* ignore */ }
  }
  async function measureHr() {
    if (state.hrTimer) return stopHr();
    if (!connected()) { state.lastMsg = 'watch not connected'; paint(); return; }
    try {
      const f = buildFitCloudFrame(0x05, 0x23, [0x01, 0x00], 0x00); await enqueueBleWrite(cmdChar, f.frame, 'LiveData PPG start seq=' + f.seq, false);
      const b = $('ldHr'); if (b) b.textContent = '■ Stop measuring';
      state.hrTimer = setTimeout(stopHr, 30000);
    } catch (e) { state.lastMsg = 'heart rate request failed: ' + e.message; paint(); }
  }

  async function pullNow() {
    if (!connected()) { state.lastMsg = 'watch not connected'; paint(); return false; }
    try {
      const b = buildFitCloudFrame(0x02, 0x1b, [], 0x00); await enqueueBleWrite(cmdChar, b.frame, 'LiveData battery seq=' + b.seq, true);
      await new Promise((r) => setTimeout(r, 250));
      const s = buildFitCloudFrame(0x05, 0x21, [], 0x00); await enqueueBleWrite(cmdChar, s.frame, 'LiveData today total (0x05/0x21) seq=' + s.seq, true); // reply 0x05/0x22: steps, distance, calories (decoded in ble/notifications.js)
      state.lastPull = Date.now(); state.lastMsg = 'asked the watch at ' + new Date().toLocaleTimeString();
    } catch (e) { state.lastMsg = 'request failed: ' + e.message; }
    paint(); return true;
  }

  // push every value the watch reported into the sliders and the bin widgets
  let last = '';
  function mirrorSensors() {
    if (typeof sensors === 'undefined') return;
    const sig = [sensors.steps, sensors.hr, sensors.battery, sensors.charging].join('|'); if (sig === last) return; last = sig;
    [['simSteps', 'valSteps', sensors.steps], ['simBat', 'valBat', sensors.battery], ['simHrBin', 'valHrBin', sensors.hr], ['simHr', 'valHr', sensors.hr]].forEach(([i, v, val]) => {
      const e = $(i), t = $(v); if (e && val != null && Number(e.value) !== Number(val)) e.value = val; if (t && val != null) t.textContent = val;
    });
    if (typeof window.syncBinWidgetsWithSensors === 'function') window.syncBinWidgetsWithSensors();
  }

  function tick() {
    try {
      const c = connected();
      if (state.wasConnected && !c) { known.steps = known.hr = known.battery = false; sensors.charging = false; window.HT37_watchIs12 = null; ['spo2', 'bpSys', 'bpDia', 'distanceM', 'calories'].forEach((f) => { try { delete sensors[f]; } catch (e) { /* ignore */ } }); if (typeof window.syncBinWidgetsWithSensors === 'function') window.syncBinWidgetsWithSensors(); }
      state.wasConnected = c;
      syncDate(); mirrorSensors();
      const M = window.decompiledBinData; // small "seconds" number: redraw every second
      if (M && M.widgets && M.widgets.some((w) => w.type === 2 && w.sub === 4) && typeof window.syncBinWidgetsWithSensors === 'function') window.syncBinWidgetsWithSensors();
    } catch (e) { /* optional */ }
    if (state.pull && connected() && Date.now() - state.lastPull > 20000) { state.lastPull = Date.now(); pullNow(); }
  }

  // ---- "Live Watch Data" tool card: its own readouts for everything the watch reports ----
  let box = null;
  const stamp = {}; const lastVal = {};
  const fmtAge = (t) => { if (!t) return ''; const s = Math.round((Date.now() - t) / 1000); return s < 5 ? 'just now' : s < 90 ? s + ' s ago' : Math.round(s / 60) + ' min ago'; };
  const TILES = [
    ['steps', '👟', 'Steps', () => known.steps && sensors.steps != null ? String(sensors.steps) : null],
    ['hr', '❤️', 'Heart rate', () => known.hr && sensors.hr != null ? sensors.hr + ' bpm' : null],
    ['spo2', '🩸', 'Oxygen', () => sensors.spo2 != null ? sensors.spo2 + ' %' : null],
    ['bp', '🫀', 'Blood pressure', () => sensors.bpSys != null ? sensors.bpSys + ' / ' + sensors.bpDia : null],
    ['battery', '🔋', 'Battery', () => known.battery && sensors.battery != null ? sensors.battery + ' %' + (sensors.charging ? ' ⚡ charging' : '') : null],
    ['dist', '📏', 'Distance', () => sensors.distanceM != null ? (sensors.distanceM >= 1000 ? (sensors.distanceM / 1000).toFixed(2) + ' km' : sensors.distanceM + ' m') : null],
    ['cal', '🔥', 'Calories', () => sensors.calories != null ? (sensors.calories / 1000).toFixed(1) + ' kcal' : null]
  ];
  function paint() {
    if (!box) return;
    const c = connected(), now = Date.now();
    const dot = $('ldDot'), st = $('ldStatus');
    if (dot) dot.style.background = c ? '#22c55e' : '#64748b';
    if (st) st.textContent = c ? 'Connected' + (state.lastMsg ? ' · ' + state.lastMsg : '') : 'Not connected. The preview uses simulated values.';
    TILES.forEach(([k, , , get]) => {
      const v = c ? get() : null, el = box.querySelector('#ldV_' + k), ag = box.querySelector('#ldA_' + k); if (!el) return;
      if (v !== lastVal[k]) { lastVal[k] = v; if (v != null) stamp[k] = now; }
      el.textContent = v != null ? v : (k === 'bp' ? '-- / --' : '--');
      el.style.color = v != null ? '#e2e8f0' : '#64748b';
      if (ag) ag.textContent = v != null ? fmtAge(stamp[k]) : (c ? 'no data yet' : '');
    });
  }

  function mount(n) {
    const anchor = $('secSensorWeatherBody');
    const host = anchor && anchor.closest('.toolbox-tool-card');
    if (!host || !host.parentElement) { if (n < 150) setTimeout(() => mount(n + 1), 100); return; }
    if ($('liveWatchCard')) return;
    const card = document.createElement('div'); card.className = 'toolbox-tool-card'; card.id = 'liveWatchCard';
    const header = document.createElement('div'); header.className = 'toolbox-tool-header';
    header.innerHTML = '<span><span id="ldDot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#64748b;margin-right:6px"></span>Live Watch Data</span><span class="tool-chevron">▾</span>';
    const body = document.createElement('div'); body.className = 'toolbox-tool-body';
    box = document.createElement('div'); box.id = 'liveDataBox';
    box.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;box-sizing:border-box;font-size:11px;color:#cbd5e1';
    const tile = (k, ic, lb) => '<div style="min-width:0;background:#0b1220;border:1px solid #1e293b;border-radius:6px;padding:6px 8px"><div style="font-size:10px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + ic + ' ' + lb + '</div><div id="ldV_' + k + '" style="font-size:15px;font-weight:600;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">--</div><div id="ldA_' + k + '" style="font-size:9px;color:#64748b;min-height:11px"></div></div>';
    box.innerHTML =
      '<div id="ldStatus" style="color:#94a3b8;font-size:10px;line-height:1.3"></div>' +
      '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px">' + TILES.map(([k, ic, lb]) => tile(k, ic, lb)).join('') + '</div>' +
      '<div style="display:grid;grid-template-columns:minmax(0,1fr);gap:6px">' +
      '<button type="button" id="ldNow" class="dock-btn" title="Asks the watch for today\'s steps, distance, calories and the battery level right now." style="height:26px;font-size:11px;width:100%">⟳ Refresh now</button>' +
      '<button type="button" id="ldHr" class="dock-btn" title="Switches the watch\'s heart-rate sensor on for 30 seconds so heart rate, oxygen and blood pressure can reach the editor." style="height:26px;font-size:11px;width:100%">❤ Measure heart rate (30 s)</button></div>' +
      '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px"><select id="ldFmt" title="Clock format to put on the watch" style="height:26px;font-size:11px;min-width:0;background:#111827;color:#e2e8f0;border:1px solid #334155"><option value="12" selected>12-hour (AM/PM)</option><option value="24">24-hour</option></select><select id="ldUnits" title="Units for temperature and distance, in the editor and on the watch" style="height:26px;font-size:11px;min-width:0;background:#111827;color:#e2e8f0;border:1px solid #334155"><option value="F" selected>°F · miles (US)</option><option value="C">°C · km (metric)</option></select></div>' +
      '<button type="button" id="ldTime" class="dock-btn" title="Sets the watch clock from this computer and sends the chosen 12/24-hour format and units." style="height:26px;font-size:11px;width:100%">🕒 Send time, format &amp; units</button>' +
      '<label style="display:flex;gap:6px;align-items:center;cursor:pointer" title="Asks the connected watch for steps and battery every 20 seconds. Heart rate is never polled because it turns the sensor light on."><input type="checkbox" id="ldPull" checked> Update steps &amp; battery every 20 s</label>' +
      '<label style="display:flex;gap:6px;align-items:center;cursor:pointer" title="While the clock is running, the date and weekday on the face follow this computer\'s calendar."><input type="checkbox" id="ldDate" checked> Use today\'s real date &amp; weekday</label>';
    body.appendChild(box); card.appendChild(header); card.appendChild(body);
    header.addEventListener('click', () => { const closed = body.classList.toggle('is-collapsed'); header.querySelector('.tool-chevron').textContent = closed ? '▸' : '▾'; });
    host.parentElement.insertBefore(card, host);
    $('ldDate').addEventListener('change', (e) => { state.realDate = e.target.checked; syncDate(); });
    $('ldPull').addEventListener('change', (e) => { state.pull = e.target.checked; });
    $('ldNow').addEventListener('click', pullNow);
    $('ldHr').addEventListener('click', measureHr);
    $('ldUnits').addEventListener('change', (e) => { if (window.HT37 && HT37.units) HT37.units.set(e.target.value === 'F', true); });
    $('ldFmt').addEventListener('change', (e) => { const sel = $('watchTimeUnitSelect'); if (sel) sel.value = e.target.value + '_' + (sel.value.split('_')[1] || 'F'); });
    $('ldTime').addEventListener('click', async () => {
      if (!connected()) { state.lastMsg = 'watch not connected'; paint(); return; }
      const sel = $('watchTimeUnitSelect'), want = $('ldFmt').value, temp = $('ldUnits').value === 'F' ? 'F' : 'C';
      if (sel) sel.value = want + '_' + temp;
      try { await applyWatchUnitsAndTime(); window.HT37_watchIs12 = want === '12'; if (typeof window.syncBinWidgetsWithSensors === 'function') window.syncBinWidgetsWithSensors(); state.lastMsg = 'sent time, ' + want + '-hour, °' + temp; } catch (e) { state.lastMsg = 'send failed: ' + e.message; }
      paint();
    });
    paint(); setInterval(paint, 1000); syncDate();
  }
  setInterval(tick, 1000);
  setTimeout(() => mount(0), 300);
  setTimeout(() => [['simSteps', 'steps'], ['simBat', 'battery'], ['simHr', 'hr'], ['simHrBin', 'hr']].forEach(([id, k]) => { const e = document.getElementById(id); if (e && !e._ld) { e._ld = 1; e.addEventListener('input', () => { if (connected()) received(k); }); } }), 1500);
  HT37.liveData = { tick, pullNow, state, known, isLive, received };
})();
