/**
 * @file     js/editor/widgets/barometer.js
 * @layer    Editor widget
 * @summary  Widget type "barometer": Pressure (hPa) with estimated altitude (reads sensors.baro).
 *
 * ROLE
 *   - One HT37.widgets.register({...}) call. Firmware widget id shown in the inspector: 0x13 Barometer / Alt.
 *   - Fields: type, icon/label/desc/cardSpan (Add-Widget card), quickAdd (dropdown label+order), fw {id,label},
 *     size {w,h} (hit-box at scale 1), defaults {name,color,accent,text,fwId} (new-layer values), draw(c, w,
 *     now).
 *   - draw(): c is already translated to the layer center and scaled/faded by drawWatchface(); only draw around
 *     (0,0). `now` is one Date per frame. Live values come from the global `sensors`.
 *
 * REGISTERS
 *   - widgets.register(type:barometer)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: sensors
 *
 * LOAD ORDER
 *   #11 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/editor/widgets/heartrate.js   before: js/editor/widgets/steps.js
 *
 * NOTES
 *   - Canvas code: colors here are real canvas colors — do not replace them with CSS variables.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.widgets.register({
  type: 'barometer',
  // --- UI metadata (drives the "Add Widget Layer" card, the quick-add dropdown and the firmware-ID dropdown) ---
  icon: '⛰️',
  label: 'Baro / Altimeter',
  desc: 'hPa Pressure + Elev',
  cardSpan: 1,
  quickAdd: { label: '⛰️ Barometer / Altimeter Layer', order: 6 },
  fw: { id: '0x13', label: 'Barometer / Alt' },
  // --- hit-box / layout size at scale 1.0 (watch pixels) ---
  size: { w: 120, h: 52 },
  // --- initial values for a freshly added layer ---
  defaults: { name: '⛰️ Baro / Alt', color: '#00e676', accent: '#69f0ae', text: 'hPa', fwId: '0x13' },
  // --- renderer ---
  // c   : CanvasRenderingContext2D, ALREADY translated to the layer center and scaled/faded by drawWatchface()
  // w   : the layer object { x, y, scale, opacity, color, accent, text, ... }
  // now : a Date captured once per frame (so every widget in a frame shows the same time)
  // Live sensor values come from the global `sensors` object (see js/editor/state.js).
  draw(c, w, now) {
    c.fillStyle = 'rgba(0, 230, 118, 0.08)'; c.strokeStyle = w.color; c.lineWidth = 1.5;
    c.beginPath(); c.roundRect(-58, -24, 116, 48, 10); c.fill(); c.stroke();
    c.fillStyle = w.color; c.font = 'bold 14px monospace'; c.textAlign = 'left'; c.fillText(`${sensors.baro} hPa`, -48, -4);
    const estAlt = Math.round(44330 * (1 - Math.pow(sensors.baro / 1013.25, 0.1903)));
    c.fillStyle = w.accent; c.font = '10px monospace'; c.fillText(`ALT: ${estAlt}m`, -48, 13);
  }
});
