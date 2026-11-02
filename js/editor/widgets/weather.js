/**
 * @file     js/editor/widgets/weather.js
 * @layer    Editor widget
 * @summary  Widget type "weather": Weather icon + temperature + UV text (reads sensors.weatherTemp / weatherCond).
 *
 * ROLE
 *   - One HT37.widgets.register({...}) call. Firmware widget id shown in the inspector: 0x06 Weather Forecast.
 *   - Fields: type, icon/label/desc/cardSpan (Add-Widget card), quickAdd (dropdown label+order), fw {id,label},
 *     size {w,h} (hit-box at scale 1), defaults {name,color,accent,text,fwId} (new-layer values), draw(c, w,
 *     now).
 *   - draw(): c is already translated to the layer center and scaled/faded by drawWatchface(); only draw around
 *     (0,0). `now` is one Date per frame. Live values come from the global `sensors`.
 *
 * REGISTERS
 *   - widgets.register(type:weather)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: sensors
 *
 * LOAD ORDER
 *   #14 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/editor/widgets/date.js   before: js/editor/widgets/battery.js
 *
 * NOTES
 *   - Canvas code: colors here are real canvas colors — do not replace them with CSS variables.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.widgets.register({
  type: 'weather',
  // --- UI metadata (drives the "Add Widget Layer" card, the quick-add dropdown and the firmware-ID dropdown) ---
  icon: '🌤️',
  label: 'Live Weather',
  desc: 'Icon + Temp + UV',
  cardSpan: 1,
  quickAdd: { label: '🌤️ Live Weather Layer', order: 4 },
  fw: { id: '0x06', label: 'Weather Forecast' },
  // --- hit-box / layout size at scale 1.0 (watch pixels) ---
  size: { w: 104, h: 40 },
  // --- initial values for a freshly added layer ---
  defaults: { name: '🌤️ Live Weather', color: '#ffab00', accent: '#00e5ff', text: 'UV 5', fwId: '0x06' },
  // --- renderer ---
  // c   : CanvasRenderingContext2D, ALREADY translated to the layer center and scaled/faded by drawWatchface()
  // w   : the layer object { x, y, scale, opacity, color, accent, text, ... }
  // now : a Date captured once per frame (so every widget in a frame shows the same time)
  // Live sensor values come from the global `sensors` object (see js/editor/state.js).
  draw(c, w, now) {
    const icons = { SUNNY: '☀️', CLOUDY: '⛅', OVERCAST: '☁️', SHOWER: '🌦️', THUNDER: '⛈️', LIGHTRAIN: '🌧️', MODRAIN: '🌧️', SLEET: '🌨️', LIGHTSNOW: '🌨️', MODSNOW: '❄️', SANDSTORM: '🌪️', FOGGY: '🌫️', UNKNOWN: '❓' };
    c.fillStyle = 'rgba(14, 22, 34, 0.85)'; c.strokeStyle = w.color; c.lineWidth = 1.5;
    c.beginPath(); c.roundRect(-50, -18, 100, 36, 8); c.fill(); c.stroke();
    c.font = '18px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(icons[sensors.weatherCond] || '⛅', -30, 1);
    c.fillStyle = '#ffffff'; c.font = 'bold 13px monospace'; c.textAlign = 'left'; c.fillText(`${sensors.weatherTemp}°C`, -12, -3);
    c.fillStyle = w.accent; c.font = 'bold 9px monospace'; c.fillText(w.text || sensors.weatherCond, -12, 9);
  }
});
