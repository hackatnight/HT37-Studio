/**
 * @file     js/editor/widgets/temp.js
 * @layer    Editor widget
 * @summary  Widget type "temp": Body / ambient temperature readout (reads sensors.tempC).
 *
 * ROLE
 *   - One HT37.widgets.register({...}) call. Firmware widget id shown in the inspector: 0x15 Temp Sensor.
 *   - Fields: type, icon/label/desc/cardSpan (Add-Widget card), quickAdd (dropdown label+order), fw {id,label},
 *     size {w,h} (hit-box at scale 1), defaults {name,color,accent,text,fwId} (new-layer values), draw(c, w,
 *     now).
 *   - draw(): c is already translated to the layer center and scaled/faded by drawWatchface(); only draw around
 *     (0,0). `now` is one Date per frame. Live values come from the global `sensors`.
 *
 * REGISTERS
 *   - widgets.register(type:temp)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: sensors
 *
 * LOAD ORDER
 *   #16 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/editor/widgets/battery.js   before: js/editor/widgets/digitalClock.js
 *
 * NOTES
 *   - Canvas code: colors here are real canvas colors — do not replace them with CSS variables.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.widgets.register({
  type: 'temp',
  // --- UI metadata (drives the "Add Widget Layer" card, the quick-add dropdown and the firmware-ID dropdown) ---
  icon: '🌡️',
  label: 'Body / Amb Temp',
  desc: 'Sensor °C / °F',
  cardSpan: 1,
  quickAdd: { label: '🌡️ Temperature Layer', order: 9 },
  fw: { id: '0x15', label: 'Temp Sensor' },
  // --- hit-box / layout size at scale 1.0 (watch pixels) ---
  size: { w: 96, h: 34 },
  // --- initial values for a freshly added layer ---
  defaults: { name: '🌡️ Sensor Temp', color: '#ffab00', accent: '#ffffff', text: 'TEMP', fwId: '0x15' },
  // --- renderer ---
  // c   : CanvasRenderingContext2D, ALREADY translated to the layer center and scaled/faded by drawWatchface()
  // w   : the layer object { x, y, scale, opacity, color, accent, text, ... }
  // now : a Date captured once per frame (so every widget in a frame shows the same time)
  // Live sensor values come from the global `sensors` object (see js/editor/state.js).
  draw(c, w, now) {
    c.fillStyle = 'rgba(255, 171, 0, 0.1)'; c.strokeStyle = w.color; c.lineWidth = 1.5;
    c.beginPath(); c.roundRect(-46, -15, 92, 30, 8); c.fill(); c.stroke();
    c.fillStyle = w.color; c.font = 'bold 13px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(`🌡️ ${sensors.tempC.toFixed(1)}°C`, 0, 1);
  }
});
