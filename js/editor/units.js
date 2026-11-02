/**
 * @file     js/editor/units.js
 * @layer    EDITOR logic (units)
 * @summary  One setting decides metric or US units for the whole tool and for the watch: Fahrenheit + miles, or Celsius + kilometers.
 *           - The master is the watch unit selector #watchTimeUnitSelect ("24_F", "12_C"...; the letter after "_" is the temperature unit).
 *           - It is mirrored to the face locale selector #decompLocaleSelect (EN_IMPERIAL / EN_METRIC; Chinese stays Chinese) so number widgets
 *             (temperature "72F", distance "mi") and the preview follow it, and to the "Units" dropdown in the Live Watch Data card.
 *           - Temperatures are stored in °C inside the tool (sensors.weatherTemp, data-c on Min/Max); the Cur/Min/Max inputs and the weather
 *             slider only DISPLAY the chosen unit. Everything sent to the watch is converted back to °C by inputC().
 *           - Default is US: °F and miles.
 * API      HT37.units = { isF, cToDisp, dispToC, inputC, set, refresh }
 */
(function () {
  window.HT37 = window.HT37 || {};
  const $ = (id) => document.getElementById(id);
  const unitSel = () => $('watchTimeUnitSelect');
  const isF = () => { const s = unitSel(); return !!s && /_F$/.test(s.value); };
  const cToDisp = (c) => isF() ? Math.trunc(Number(c) * 9 / 5) + 32 : Math.round(Number(c)); // the watch converts with whole-number math (22°C shows 71°F), so the editor does the same
  const dispToC = (v) => isF() ? (Number(v) - 32) * 5 / 9 : Number(v);
  const cur0 = () => { const c = $('liveTempCur'); return !!(c && c._units); };
  const KEEP = { liveTempMin: 16, liveTempMax: 26 };

  /** Value of a temperature input in °C (what the watch protocol wants). */
  function inputC(id, def) {
    const e = $(id); if (!e) return def;
    if (id === 'liveTempCur') return (typeof sensors !== 'undefined' && sensors.weatherTemp != null) ? Number(sensors.weatherTemp) : (def == null ? 22 : def);
    if (e.dataset.c !== undefined && e.dataset.c !== '') return Number(e.dataset.c);
    return e.value === '' ? def : dispToC(e.value);
  }

  let last = '';
  function refresh() {
    const us = unitSel(); if (us && us.onchange !== onUnit && us.onchange !== null && cur0()) us.onchange = onUnit; // other modules re-assign it; keep ours
    const f = isF(), unit = f ? '°F' : '°C', tc = (typeof sensors !== 'undefined' && sensors.weatherTemp != null) ? Number(sensors.weatherTemp) : 22;
    const cur = $('liveTempCur'), mn = $('liveTempMin'), mx = $('liveTempMax');
    if (cur && document.activeElement !== cur) cur.value = cToDisp(tc);
    [[mn, 'liveTempMin'], [mx, 'liveTempMax']].forEach(([e, id]) => {
      if (!e) return; if (e.dataset.c === undefined) e.dataset.c = String(KEEP[id]);
      if (document.activeElement !== e) e.value = cToDisp(Number(e.dataset.c));
    });
    [cur, mn, mx].forEach((e, i) => { if (e) e.title = ['Current', 'Min', 'Max'][i] + ' temperature ' + unit; });
    const vt = $('valWeatherTemp'); if (vt) { vt.textContent = cToDisp(tc); if (vt.nextSibling && vt.nextSibling.nodeType === 3) vt.nextSibling.nodeValue = unit; else if (vt.parentElement) { const t = vt.parentElement.lastChild; if (t && t.nodeType === 3) t.nodeValue = unit; } }
    document.querySelectorAll('#secSensorWeatherBody span, #toolCard_3_alerts span').forEach((s) => { if (/^°[CF]$/.test(s.textContent) && !s.children.length && s.id !== 'valWeatherTemp') s.textContent = unit; });
    const ld = $('ldUnits'); if (ld && ld.value !== (f ? 'F' : 'C')) ld.value = f ? 'F' : 'C';
    const loc = $('decompLocaleSelect');
    if (loc && !/^CN_/.test(loc.value)) { const want = f ? 'EN_IMPERIAL' : 'EN_METRIC'; if (loc.value !== want) { loc.value = want; loc.dispatchEvent(new Event('change', { bubbles: true })); } }
    const sig = [f, tc, mn && mn.dataset.c, mx && mx.dataset.c].join('|');
    if (sig !== last) { last = sig; if (typeof window.syncBinWidgetsWithSensors === 'function') window.syncBinWidgetsWithSensors(); }
  }

  /** Switch units. toF true = °F + miles. Tells the watch too when it is connected. */
  function set(toF, sendToWatch) {
    const s = unitSel(); if (!s) return;
    s.value = s.value.split('_')[0] + '_' + (toF ? 'F' : 'C');
    refresh();
    if (sendToWatch !== false && typeof applyWatchUnitsAndTime === 'function' && typeof bleServer !== 'undefined' && bleServer && bleServer.connected) applyWatchUnitsAndTime();
  }

  function onUnit() { refresh(); if (typeof applyWatchUnitsAndTime === 'function') applyWatchUnitsAndTime(); }

  function wire() {
    const cur = $('liveTempCur'), mn = $('liveTempMin'), mx = $('liveTempMax'), s = unitSel();
    if (!cur || !mn || !mx || !s) return false;
    if (cur._units) return true; cur._units = 1;
    // the Cur/Min/Max inputs now hold the DISPLAYED unit; convert to °C on input (replaces the old inline handler and the old convert-on-toggle hook)
    cur.removeAttribute('oninput'); cur.oninput = null;
    cur.addEventListener('input', () => { const c = Math.round(dispToC(cur.value)); sensors.weatherTemp = c; const sl = $('simWeatherTemp'); if (sl) sl.value = c; if (typeof updateLiveSensorReadout === 'function') updateLiveSensorReadout(); refresh(); });
    [mn, mx].forEach((e) => { e.removeAttribute('oninput'); e.oninput = null; e.addEventListener('input', () => { e.dataset.c = String(dispToC(e.value)); if (typeof updateLiveSensorReadout === 'function') updateLiveSensorReadout(); }); });
    s.removeAttribute('onchange'); s.onchange = onUnit;
    const sl = $('simWeatherTemp'); if (sl) sl.addEventListener('input', () => setTimeout(refresh, 0));
    s.value = '12_F'; // default for the US: 12-hour clock, °F
    set(true, false); // default: US units (°F, miles)
    return true;
  }
  function boot(n) { if (!wire()) { if (n < 200) setTimeout(() => boot(n + 1), 100); return; } setInterval(refresh, 400); }
  setTimeout(() => boot(0), 900);
  HT37.units = { isF, cToDisp, dispToC, inputC, set, refresh };
})();
