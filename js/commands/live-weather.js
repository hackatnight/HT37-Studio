/**
 * @file     js/commands/live-weather.js
 * @layer    Commands + UI
 * @summary  Live weather sync: look up a place (ZIP / city / phone location), fetch a forecast, build the extended 0x02/0x36 frame, send it.
 *
 * SOURCES (free, no key, browser-friendly; none of them is the vendor's private server)
 *   - ZIP (US 5 digits)  api.zippopotam.us          -> lat/lon + place name
 *   - city / other text  geocoding-api.open-meteo.com -> lat/lon + place name
 *   - "Use my location"  navigator.geolocation (asks permission), place name via api.bigdatacloud.net (reverse, no key)
 *   - forecast           api.open-meteo.com: current temperature/code/pressure/wind/visibility + 7 daily min/max/code
 * FRAME  Same layout the FitCloud app builds (z5/d.java), verified on hardware: see docs/BIN_FORMAT.md 11e.
 *   [cur][low][high][sky][cityLen][city][time 4B packed][count][count x (low,high,sky)][pressure hPa 4B big-endian][wind scale][vis km][0][vis m hi,lo][0][0][last]
 *   Temperatures are Celsius (the watch converts to F). Wind byte = Beaufort scale (the vendor JSON field is called windScale). Last byte = 0 (meaning unknown).
 *   Forecast entries = days 1..6 (daily[1..6]); today's low/high come from daily[0].
 * API  HT37.liveWeather = { lookup, locate, fetchForecast, buildPayload, send, wmoToSky, beaufort, state }
 */
(function () {
  window.HT37 = window.HT37 || {};
  const LS = 'ht37_liveweather';
  const state = { lat: null, lon: null, label: '', query: '', last: null, timer: null };
  try { Object.assign(state, JSON.parse(localStorage.getItem(LS) || '{}'), { last: null, timer: null }); } catch (e) {}
  const save = () => { try { localStorage.setItem(LS, JSON.stringify({ lat: state.lat, lon: state.lon, label: state.label, query: state.query })); } catch (e) {} };

  async function getJson(url) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 12000);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); }
  }

  /** WMO weather code (Open-Meteo) -> watch sky code (0 unknown, 1 sunny, 2 cloudy, 3 overcast, 4 shower, 5 thunder, 6 light rain, 7 moderate rain, 8 sleet, 9 light snow, 10 moderate snow, 11 sandstorm, 12 foggy) */
  function wmoToSky(c) {
    if (c === 0 || c === 1) return 1;
    if (c === 2) return 2;
    if (c === 3) return 3;
    if (c === 45 || c === 48) return 12;
    if (c >= 51 && c <= 55) return 6;
    if (c === 56 || c === 57 || c === 66 || c === 67) return 8;
    if (c === 61) return 6;
    if (c === 63 || c === 65) return 7;
    if (c === 71 || c === 77) return 9;
    if (c === 73 || c === 75 || c === 85 || c === 86) return 10;
    if (c >= 80 && c <= 82) return 4;
    if (c >= 95) return 5;
    return 0;
  }
  function beaufort(kmh) { const T = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118]; let b = 0; while (b < T.length && kmh >= T[b]) b++; return b; }
  const tempByte = (c) => { const v = Math.max(-127, Math.min(127, Math.round(c))); return v < 0 ? (0x80 | -v) : v; };

  async function lookup(q) {
    q = String(q || '').trim(); if (!q) throw new Error('Type a ZIP code or city first.');
    let r;
    if (/^\d{5}$/.test(q)) {
      const j = await getJson('https://api.zippopotam.us/us/' + q); const p = j.places && j.places[0]; if (!p) throw new Error('ZIP not found');
      r = { lat: parseFloat(p.latitude), lon: parseFloat(p.longitude), label: p['place name'] + ', ' + p['state abbreviation'] + ' ' + q };
    } else {
      const j = await getJson('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=' + encodeURIComponent(q)); const p = j.results && j.results[0]; if (!p) throw new Error('Place not found: ' + q);
      r = { lat: p.latitude, lon: p.longitude, label: [p.name, p.admin1, p.country_code].filter(Boolean).join(', ') };
    }
    Object.assign(state, r, { query: q }); save(); return r;
  }

  function locate() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('This browser has no location support.'));
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude; let label = lat.toFixed(2) + ', ' + lon.toFixed(2);
        try { const j = await getJson('https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en&latitude=' + lat + '&longitude=' + lon); label = [j.city || j.locality, j.principalSubdivisionCode ? j.principalSubdivisionCode.split('-').pop() : '', j.postcode].filter(Boolean).join(', ') || label; } catch (e) {}
        Object.assign(state, { lat, lon, label, query: 'my location' }); save(); res({ lat, lon, label });
      }, (e) => rej(new Error('Location was not shared (' + (e && e.message || 'denied') + '). Type a ZIP or city instead.')), { timeout: 15000, maximumAge: 600000 });
    });
  }

  async function fetchForecast(lat, lon) {
    const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,weather_code,pressure_msl,wind_speed_10m,visibility&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=7&timezone=auto';
    const j = await getJson(u); if (!j.current || !j.daily) throw new Error('No forecast returned');
    const d = j.daily; return { cur: j.current, days: d.time.map((t, i) => ({ date: t, code: d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i] })) };
  }

  function buildPayload(fc, city) {
    const c = fc.cur, days = fc.days, now = new Date();
    const cityB = Array.from(new TextEncoder().encode(String(city || '').replace(/[^\x20-\x7e]/g, '').slice(0, 20)));
    const ts = ((((now.getFullYear() - 2000) & 63) << 26) | (((now.getMonth() + 1) & 15) << 22) | ((now.getDate() & 31) << 17) | ((now.getHours() & 31) << 12) | ((now.getMinutes() & 63) << 6) | (now.getSeconds() & 63)) >>> 0;
    const out = [tempByte(c.temperature_2m), tempByte(days[0].min), tempByte(days[0].max), wmoToSky(c.weather_code), cityB.length].concat(cityB, [ts >>> 24 & 255, ts >>> 16 & 255, ts >>> 8 & 255, ts & 255]);
    const fut = days.slice(1, 7); out.push(fut.length);
    fut.forEach((d) => out.push(tempByte(d.min), tempByte(d.max), wmoToSky(d.code)));
    const hpa = Math.round(c.pressure_msl || 1013), vis = Math.min(65535, Math.round(c.visibility == null ? 10000 : c.visibility));
    out.push(hpa >>> 24 & 255, hpa >>> 16 & 255, hpa >>> 8 & 255, hpa & 255, beaufort(c.wind_speed_10m || 0), Math.min(255, Math.floor(vis / 1000)), 0, vis >>> 8 & 255, vis & 255, 0, 0, 0);
    return out;
  }

  // temperatures are shown in the tool's unit (US default: F; follows the watch unit selector); the packet itself is always Celsius
  const disp = (c) => (window.HT37.units && HT37.units.cToDisp ? HT37.units.cToDisp(c) + (HT37.units.isF() ? '°F' : '°C') : Math.round(c) + '°C');
  function syncSensors(fc) {
    try {
      if (typeof sensors !== 'undefined') sensors.weatherTemp = Math.round(fc.cur.temperature_2m);
      const mn = document.getElementById('liveTempMin'), mx = document.getElementById('liveTempMax');
      if (mn && mx) { mn.dataset.c = String(fc.days[0].min); mx.dataset.c = String(fc.days[0].max); }
      if (HT37.units && HT37.units.refresh) HT37.units.refresh();
    } catch (e) {}
  }
  const hex = (a) => a.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

  async function send(opts) {
    opts = opts || {};
    if (state.lat == null) throw new Error('Pick a location first.');
    const fc = await fetchForecast(state.lat, state.lon), p = buildPayload(fc, state.label.split(',')[0]);
    state.last = { fc, payload: p }; syncSensors(fc);
    if (opts.dry) return state.last;
    if (!cmdChar || !bleServer || !bleServer.connected) throw new Error('Pair & Bind to the watch first.');
    abortBleOperation = false;
    const fr = buildFitCloudFrame(0x02, 0x36, p, 0);
    log('🌤️ Live weather for ' + state.label + ': ' + disp(fc.cur.temperature_2m) + ' now, ' + (fc.days.length - 1) + ' forecast days. Payload (' + p.length + ' B): ' + hex(p), 'ok');
    await enqueueBleWrite(cmdChar, fr.frame, 'LIVE-WEATHER seq=' + fr.seq);
    await waitForAck(fr.seq, 800);
    return state.last;
  }

  // ---- UI: a section at the top of the "Weather & Sky Dispatch" card (Alerts tab) ----
  function mountUi(n) {
    const card = document.getElementById('toolCard_3_alerts'), body = card && card.querySelector('.toolbox-tool-body');
    if (!body) { if (n < 400) setTimeout(() => mountUi(n + 1), 100); return; }
    if (document.getElementById('lwBox')) return;
    const box = document.createElement('div'); box.id = 'lwBox';
    box.style.cssText = 'border:1px solid #334155;border-radius:6px;padding:8px;margin-bottom:8px;display:flex;flex-direction:column;gap:6px;background:#0b1220';
    const inp = 'height:26px;font-size:11px;background:#111827;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:0 6px;min-width:0';
    box.innerHTML = '<div style="font-size:11px;font-weight:700;color:#7dd3fc">LIVE WEATHER SYNC (Open-Meteo)</div>' +
      '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px"><input id="lwQuery" placeholder="ZIP code or city" style="' + inp + '"><button id="lwFind" class="dock-btn" style="height:26px;font-size:11px">Find</button><button id="lwGps" class="dock-btn" style="height:26px;font-size:11px" title="Uses this device location (asks permission)">Use my location</button></div>' +
      '<div id="lwPlace" style="font-size:11px;color:#94a3b8">No location chosen yet.</div>' +
      '<div style="display:grid;grid-template-columns:auto auto minmax(0,1fr);gap:6px;align-items:center"><button id="lwPreview" class="dock-btn" style="height:26px;font-size:11px">Preview</button><button id="lwSend" class="dock-btn" style="height:26px;font-size:11px">Send to watch</button><label style="font-size:11px;color:#94a3b8"><input type="checkbox" id="lwAuto"> refresh every 30 min</label></div>' +
      '<div id="lwOut" style="font-size:10px;color:#9ca3af;font-family:monospace;white-space:pre-wrap;max-height:130px;overflow:auto"></div>';
    body.insertBefore(box, body.firstChild);
    const $ = (id) => document.getElementById(id), out = (t) => { $('lwOut').textContent = t; }, place = () => { $('lwPlace').textContent = state.lat == null ? 'No location chosen yet.' : '📍 ' + state.label + '  (' + Number(state.lat).toFixed(3) + ', ' + Number(state.lon).toFixed(3) + ')'; };
    $('lwQuery').value = state.query && state.query !== 'my location' ? state.query : ''; place();
    const guard = (fn) => async () => { try { await fn(); } catch (e) { out('⚠️ ' + (e.message || e)); if (typeof log === 'function') log('Live weather: ' + (e.message || e), 'err'); } };
    $('lwFind').onclick = guard(async () => { out('Looking up…'); await lookup($('lwQuery').value); place(); out('Found. Press Preview or Send to watch.'); });
    $('lwQuery').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('lwFind').click(); });
    $('lwGps').onclick = guard(async () => { out('Waiting for location permission…'); await locate(); place(); $('lwQuery').value = ''; out('Location set. Press Preview or Send to watch.'); });
    const show = (r) => out(state.label + '\nNow ' + disp(r.fc.cur.temperature_2m) + ', sky ' + wmoToSky(r.fc.cur.weather_code) + '\n' + r.fc.days.map((d, i) => (i ? '+' + i : 'today') + ': ' + disp(d.min) + ' / ' + disp(d.max) + ' sky ' + wmoToSky(d.code)).join('\n') + '\nPayload (' + r.payload.length + ' B): ' + hex(r.payload));
    $('lwPreview').onclick = guard(async () => { out('Fetching…'); show(await send({ dry: true })); });
    $('lwSend').onclick = guard(async () => { out('Fetching…'); show(await send()); });
    $('lwAuto').onchange = () => { clearInterval(state.timer); state.timer = null; if ($('lwAuto').checked) state.timer = setInterval(guard(async () => { show(await send()); }), 30 * 60 * 1000); };
  }
  mountUi(0);
  HT37.liveWeather = { lookup, locate, fetchForecast, buildPayload, send, wmoToSky, beaufort, state };
})();
