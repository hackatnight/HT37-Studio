/**
 * @file     js/editor/sensors-sim.js
 * @layer    Editor logic
 * @summary  Live-sensor simulation sliders, device-orientation compass, and the sensor/weather hex readout.
 *
 * ROLE
 *   - Slider listeners (#simHeading, #simHr, #simSteps, #simBaro, #simWeatherTemp, #simBat) write the matching
 *     sensors.* value and call updateLiveSensorReadout().
 *   - enableDeviceOrientation(): uses the phone/laptop gyro to drive sensors.heading (the 🧭 Gyro button).
 *   - updateLiveSensorReadout(): fills #liveSensorSummary / #liveSensorHex with the 4-byte weather payload
 *     preview [cur min max sky].
 *
 * PROVIDES (globals)
 *   function enableDeviceOrientation, function updateLiveSensorReadout
 *
 * USES (defined in other files)
 *   - js/editor/state.js: sensors
 *   - js/core/log.js: log
 *   - js/protocol/constants.js: HT37_SKY_MAP
 *   - js/commands/weather.js: encodeFitCloudTemp
 *
 * DOM IDS TOUCHED
 *   #liveSensorHex #liveSensorSummary #liveTempCur #liveTempMax #liveTempMin #simHeading #valHeading
 *
 * LOAD ORDER
 *   #25 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/editor/screen-background.js   before: js/dfu/bin-compiler.js
 *
 * NOTES
 *   - decompiler/vault.js wraps window.updateLiveSensorReadout to also refresh .bin-bound widgets.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
['Heading', 'Hr', 'Steps', 'Baro', 'WeatherTemp', 'Bat'].forEach((key) => {
  const el = document.getElementById('sim' + key), valEl = document.getElementById('val' + key);
  if (!el || !valEl) return;
  el.addEventListener('input', () => {
    valEl.textContent = el.value;
    if (key === 'Heading') sensors.heading = Number(el.value);
    if (key === 'Hr') sensors.hr = Number(el.value);
    if (key === 'Steps') sensors.steps = Number(el.value);
    if (key === 'Baro') sensors.baro = Number(el.value);
    if (key === 'WeatherTemp') sensors.weatherTemp = Number(el.value);
    if (key === 'Bat') sensors.battery = Number(el.value);
    if (typeof updateLiveSensorReadout === 'function') updateLiveSensorReadout();
  });
});

async function enableDeviceOrientation() {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    const perm = await DeviceOrientationEvent.requestPermission();
    if (perm !== 'granted') return log('DeviceOrientation permission denied.', 'err');
  }
  window.addEventListener('deviceorientation', (e) => {
    const h = e.webkitCompassHeading || (e.alpha !== null ? (360 - e.alpha) % 360 : null);
    if (h !== null) {
      sensors.heading = Math.round(h);
      document.getElementById('simHeading').value = sensors.heading;
      document.getElementById('valHeading').textContent = sensors.heading;
    }
  });
  log('Hardware compass / gyroscope bound to live watchface compass widget.', 'ok');
}

function updateLiveSensorReadout() {
  const condMap = HT37_SKY_MAP;
  const code = skyCodeFromCond(sensors.weatherCond) || 0x02;
  const cur = encodeFitCloudTemp(sensors.weatherTemp);
  const min = encodeFitCloudTemp(window.HT37 && HT37.units ? HT37.units.inputC('liveTempMin', 16) : (document.getElementById('liveTempMin')?.value ?? 16));
  const max = encodeFitCloudTemp(window.HT37 && HT37.units ? HT37.units.inputC('liveTempMax', 26) : (document.getElementById('liveTempMax')?.value ?? 26));
  const curEl = document.getElementById('liveTempCur');
  if (curEl && document.activeElement !== curEl) curEl.value = window.HT37 && HT37.units ? HT37.units.cToDisp(sensors.weatherTemp) : sensors.weatherTemp;
  const sumEl = document.getElementById('liveSensorSummary');
  if (sumEl) {
    sumEl.value = `HDG:${sensors.heading}° HR:${sensors.hr} STP:${sensors.steps}`;
  }
  const hexEl = document.getElementById('liveSensorHex');
  if (hexEl) {
    const h = [cur, min, max, code].map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ');
    hexEl.value = `${h} | ${sensors.baro}hPa BAT:${sensors.battery}%`;
  }
}
