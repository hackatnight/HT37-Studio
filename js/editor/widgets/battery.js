/**
 * @file     js/editor/widgets/battery.js
 * @layer    Editor widget
 * @summary  Widget type "battery": Battery ring with percent (reads sensors.battery).
 *
 * ROLE
 *   - One HT37.widgets.register({...}) call. Firmware widget id shown in the inspector: 0x14 Battery SOC.
 *   - Fields: type, icon/label/desc/cardSpan (Add-Widget card), quickAdd (dropdown label+order), fw {id,label},
 *     size {w,h} (hit-box at scale 1), defaults {name,color,accent,text,fwId} (new-layer values), draw(c, w,
 *     now).
 *   - draw(): c is already translated to the layer center and scaled/faded by drawWatchface(); only draw around
 *     (0,0). `now` is one Date per frame. Live values come from the global `sensors`.
 *
 * REGISTERS
 *   - widgets.register(type:battery)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: sensors
 *
 * LOAD ORDER
 *   #15 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/editor/widgets/weather.js   before: js/editor/widgets/temp.js
 *
 * NOTES
 *   - Canvas code: colors here are real canvas colors — do not replace them with CSS variables.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.widgets.register({
  type: 'battery',
  // --- UI metadata (drives the "Add Widget Layer" card, the quick-add dropdown and the firmware-ID dropdown) ---
  icon: '🔋',
  label: 'Battery Gauge',
  desc: 'Ring + SOC %',
  cardSpan: 1,
  quickAdd: { label: '🔋 Battery Gauge Layer', order: 8 },
  fw: { id: '0x14', label: 'Battery SOC' },
  // --- hit-box / layout size at scale 1.0 (watch pixels) ---
  size: { w: 58, h: 58 },
  // --- initial values for a freshly added layer ---
  defaults: { name: '🔋 Battery SOC', color: '#00e5ff', accent: '#00e676', text: 'BAT', fwId: '0x14' },
  // --- renderer ---
  // c   : CanvasRenderingContext2D, ALREADY translated to the layer center and scaled/faded by drawWatchface()
  // w   : the layer object { x, y, scale, opacity, color, accent, text, ... }
  // now : a Date captured once per frame (so every widget in a frame shows the same time)
  // Live sensor values come from the global `sensors` object (see js/editor/state.js).
  draw(c, w, now) {
    const pct = sensors.battery / 100, r = 24;
    c.lineWidth = 5; c.strokeStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = sensors.battery < 20 ? '#ff5252' : w.color; c.lineCap = 'round'; c.beginPath(); c.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2); c.stroke();
    c.fillStyle = '#ffffff'; c.font = 'bold 11px monospace'; c.textAlign = 'center'; c.fillText(`${sensors.battery}%`, 0, 3);
    c.fillStyle = w.accent; c.font = '7px monospace'; c.fillText(w.text || 'PWR', 0, 12);
    if (sensors.charging) { c.fillStyle = '#ffd23f'; c.font = 'bold 10px sans-serif'; c.fillText('⚡', 0, -7); }        // charging icon (real watch reports it)
  }
});
