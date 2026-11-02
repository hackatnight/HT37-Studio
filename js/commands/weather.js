/**
 * @file     js/commands/weather.js
 * @layer    Commands
 * @summary  Weather and time/unit commands.
 *
 * ROLE
 *   - encodeFitCloudTemp(t): signed °C → 1 byte (bit 7 = negative). buildFitCloudTime6B(): [yy-2000, mm, dd,
 *     hh, mi, ss].
 *   - getWatchUnitSwitchBytes(): 0x02/0x18 payload from #watchTimeUnitSelect: 24H°C=03 EB, 12H°C=03 EF,
 *     12H°F=03 FF, 24H°F=03 FB.
 *   - applyWatchUnitsAndTime(): 0x02/0x01 time then 0x02/0x18 units. pushWeatherToWatch(): 0x02/0x36 =
 *     [cur,min,max,sky,sky,01,01] (format variants chosen by #weatherFmtSelect).
 *   - sendSingleSkyCode(code,label) and cycleAllSkyCodes() (codes 0x01-0x0C, 2.2 s apart) for icon discovery;
 *     setAndPushSky(key, code, label).
 *
 * PROVIDES (globals)
 *   function encodeFitCloudTemp, function setAndPushSky, function buildFitCloudTime6B, function
 *   getWatchUnitSwitchBytes, function applyWatchUnitsAndTime, function pushWeatherToWatch, function
 *   sendSingleSkyCode, function cycleAllSkyCodes
 *
 * USES (defined in other files)
 *   - js/editor/state.js: sensors
 *   - js/ble/state.js: abortBleOperation, bleServer, cmdChar
 *   - js/core/log.js: log
 *   - js/ble/frames.js: buildFitCloudFrame
 *   - js/ble/transport.js: enqueueBleWrite, waitForAck
 *   - js/editor/sensors-sim.js: updateLiveSensorReadout
 *   - js/protocol/constants.js: HT37_SKY_MAP
 *
 * DOM IDS TOUCHED
 *   #liveTempCur #liveTempMax #liveTempMin #rawCmd #rawKey #rawPayload #simWeatherCond #watchTimeUnitSelect
 *   #weatherFmtSelect
 *
 * LOAD ORDER
 *   #33 of 62, section "6. WATCH COMMANDS  (alerts, weather, dial slots, explorer console)"
 *   after: js/commands/alerts.js   before: js/commands/dial-slots.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
function encodeFitCloudTemp(t) {
  const v = Math.round(Number(t) || 0);
  return v < 0 ? (0x80 | Math.min(127, Math.abs(v))) : (v & 0x7f);
}

function setAndPushSky(condKey, hexCode, label) {
  sensors.weatherCond = condKey;
  const sel = document.getElementById('simWeatherCond');
  if (sel) sel.value = condKey;
  sendSingleSkyCode(hexCode, `${hexCode.toString(16).padStart(2,'0').toUpperCase()} ${label}`);
}

function buildFitCloudTime6B() {
  const now = new Date();
  return [
    Math.max(0, now.getFullYear() - 2000) & 0xff,
    (now.getMonth() + 1) & 0xff,
    now.getDate() & 0xff,
    now.getHours() & 0xff,
    now.getMinutes() & 0xff,
    now.getSeconds() & 0xff
  ];
}

/** Time payload the SDK really sends (0x02/0x01): 4 bytes, bit-packed year-2000 (6 bits), month 1-12 (4), day (5), hour (5), minute (6), second (6). */
function buildFitCloudTime4B(d) {
  const n = d || new Date(), y = Math.max(0, n.getFullYear() - 2000) & 63, mo = (n.getMonth() + 1) & 15, da = n.getDate() & 31, h = n.getHours() & 31, mi = n.getMinutes() & 63, se = n.getSeconds() & 63;
  const v = ((y << 26) | (mo << 22) | (da << 17) | (h << 12) | (mi << 6) | se) >>> 0;
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
}

function getWatchUnitSwitchBytes() {
  const mode = document.getElementById('watchTimeUnitSelect')?.value || '24_C';
  // Byte1 bits: 0x04 = 12-Hour mode (0=24H, 1=12H), 0x10 = Fahrenheit (0=°C, 1=°F)
  if (mode === '24_C') return [0x03, 0xeb]; // 24H + Celsius + Weather Push ON
  if (mode === '12_C') return [0x03, 0xef]; // 12H + Celsius + Weather Push ON
  if (mode === '12_F') return [0x03, 0xff]; // 12H + Fahrenheit + Weather Push ON
  return [0x03, 0xfb];                      // 24H + Fahrenheit + Weather Push ON
}

async function applyWatchUnitsAndTime() {
  if (!cmdChar || !bleServer || !bleServer.connected) return;
  abortBleOperation = false;
  const time6B = buildFitCloudTime4B();
  const swBytes = getWatchUnitSwitchBytes();
  log(`🕒 Syncing Watch Time (0x02/0x01, 4-byte packed) + Units/Format (0x02/0x18 = [${swBytes.map(b=>b.toString(16).padStart(2,'0').toUpperCase()).join(' ')}])...`, 'ok');
  const tf = buildFitCloudFrame(0x02, 0x01, time6B, 0x00);
  await enqueueBleWrite(cmdChar, tf.frame, `SyncTime6B_0x01 seq=${tf.seq}`);
  await waitForAck(tf.seq, 300);
  const sf = buildFitCloudFrame(0x02, 0x18, swBytes, 0x00);
  await enqueueBleWrite(cmdChar, sf.frame, `SetUnits_0x18 seq=${sf.seq}`);
  await waitForAck(sf.seq, 300);
}

async function pushWeatherToWatch() {
  updateLiveSensorReadout();
  if (!cmdChar || !bleServer || !bleServer.connected) {
    return log('ERROR: Pair & Bind to the watch first!', 'err');
  }
  abortBleOperation = false;
  const condMap = HT37_SKY_MAP;
  const code = skyCodeFromCond(sensors.weatherCond);
  const cur = encodeFitCloudTemp(HT37.units.inputC('liveTempCur', 22));
  const min = encodeFitCloudTemp(HT37.units.inputC('liveTempMin', 16));
  const max = encodeFitCloudTemp(HT37.units.inputC('liveTempMax', 26));
  const fmt = document.getElementById('weatherFmtSelect')?.value || 'key_36_7b';
  const cityBytes = Array.from(new TextEncoder().encode('HT37'));

  // 1. Sync 6B Time + Selected 12H/24H & °C/°F Units (Default: 24H + °C = [03 EB])
  await applyWatchUnitsAndTime();

  // 2. Build payload for Verified Weather Key 0x02/0x36 (Read=0x37, Reply=0x38)
  const targetKey = 0x36;
  let payload = [cur, min, max, code, code, 0x01, 0x01];
  if (fmt === 'key_36_b3') {
    payload = [cur, min, max, code, 0x00, 0x00, 0x00];
  } else if (fmt === 'key_36_b4') {
    payload = [cur, min, max, 0x00, code, 0x00, 0x00];
  } else if (fmt === 'key_36_city') {
    payload = [cur, min, max, code, code, 0x01, 0x01, cityBytes.length, ...cityBytes];
  }

  document.getElementById('rawCmd').value = '0x02';
  document.getElementById('rawKey').value = '0x36';
  document.getElementById('rawPayload').value = payload.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ');

  log(`🌤️ Pushing Live Weather to HT37 (Cmd=0x02, Key=0x36, Cur=${sensors.weatherTemp}°C, Min=${Math.round(HT37.units.inputC('liveTempMin', 16))}°C, Max=${Math.round(HT37.units.inputC('liveTempMax', 26))}°C (watch is set to ${HT37.units.isF() ? '°F' : '°C'}), Sky=${sensors.weatherCond} [0x${code.toString(16).padStart(2,'0').toUpperCase()}])...`, 'ok');
  const wf = buildFitCloudFrame(0x02, targetKey, payload, 0x00);
  await enqueueBleWrite(cmdChar, wf.frame, `Weather_0x36 seq=${wf.seq}`);
  await waitForAck(wf.seq, 350);
}

async function sendSingleSkyCode(skyCode, label) {
  updateLiveSensorReadout();
  if (!cmdChar || !bleServer || !bleServer.connected) {
    return log('ERROR: Pair & Bind to the watch first!', 'err');
  }
  abortBleOperation = false;
  const cur = encodeFitCloudTemp(HT37.units.inputC('liveTempCur', 22));
  const min = encodeFitCloudTemp(HT37.units.inputC('liveTempMin', 16));
  const max = encodeFitCloudTemp(HT37.units.inputC('liveTempMax', 26));
  const payload = [cur, min, max, skyCode & 0xff, skyCode & 0xff, 0x01, 0x01];

  document.getElementById('rawCmd').value = '0x02';
  document.getElementById('rawKey').value = '0x36';
  document.getElementById('rawPayload').value = payload.map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ');

  log(`🌤️ Sent Single Sky Code [${label}] -> Cmd=0x02, Key=0x36, Payload=[${payload.map(b=>b.toString(16).padStart(2,'0').toUpperCase()).join(' ')}] (Open watch Weather app now!)`, 'ok');
  const wf = buildFitCloudFrame(0x02, 0x36, payload, 0x00);
  await enqueueBleWrite(cmdChar, wf.frame, `Sky_${label.replace(/\s+/g,'_')} seq=${wf.seq}`);
  await waitForAck(wf.seq, 350);
}

async function cycleAllSkyCodes() {
  if (!cmdChar || !bleServer || !bleServer.connected) {
    return log('ERROR: Pair & Bind to the watch first!', 'err');
  }
  abortBleOperation = false;
  await applyWatchUnitsAndTime();
  log('🎞️ Cycling Sky Codes 0x01..0x0C on Key 0x02/0x36 (Watch Temp = Code # so you can match each icon!)...', 'ok');
  for (let c = 1; c <= 12; c++) {
    if (abortBleOperation) break;
    const pl = [c, 10, 25, c, c, 0x01, 0x01];
    const wf = buildFitCloudFrame(0x02, 0x36, pl, 0x00);
    await enqueueBleWrite(cmdChar, wf.frame, `SkyTest_Code0x${c.toString(16).padStart(2,'0')}_Temp${c}C seq=${wf.seq}`);
    await waitForAck(wf.seq, 300);
    await new Promise(r => setTimeout(r, 2200));
  }
  log('✅ Finished Sky Code cycle (0x01..0x0C)!', 'ok');
}
