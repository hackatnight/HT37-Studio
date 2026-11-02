/**
 * @file     js/editor/widgets/compass.js
 * @layer    Editor widget
 * @summary  Widget type "compass": Rotating compass rose with heading degrees (reads sensors.heading).
 *
 * ROLE
 *   - One HT37.widgets.register({...}) call. Firmware widget id shown in the inspector: 0x10 Compass Sensor.
 *   - Fields: type, icon/label/desc/cardSpan (Add-Widget card), quickAdd (dropdown label+order), fw {id,label},
 *     size {w,h} (hit-box at scale 1), defaults {name,color,accent,text,fwId} (new-layer values), draw(c, w,
 *     now).
 *   - draw(): c is already translated to the layer center and scaled/faded by drawWatchface(); only draw around
 *     (0,0). `now` is one Date per frame. Live values come from the global `sensors`.
 *
 * REGISTERS
 *   - widgets.register(type:compass)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: sensors
 *
 * LOAD ORDER
 *   #9 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/editor/widget-registry.js   before: js/editor/widgets/heartrate.js
 *
 * NOTES
 *   - Canvas code: colors here are real canvas colors — do not replace them with CSS variables.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.widgets.register({
  type: 'compass',
  // --- UI metadata (drives the "Add Widget Layer" card, the quick-add dropdown and the firmware-ID dropdown) ---
  icon: '🧭',
  label: 'Live Compass',
  desc: 'Rotating Rose + Deg',
  cardSpan: 1,
  quickAdd: { label: '🧭 Live Compass Layer', order: 0 },
  fw: { id: '0x10', label: 'Compass Sensor' },
  // --- hit-box / layout size at scale 1.0 (watch pixels) ---
  size: { w: 96, h: 96 },
  // --- initial values for a freshly added layer ---
  defaults: { name: '🧭 Live Compass', color: '#00e5ff', accent: '#ff5252', text: 'MAG', fwId: '0x10' },
  // --- renderer ---
  // c   : CanvasRenderingContext2D, ALREADY translated to the layer center and scaled/faded by drawWatchface()
  // w   : the layer object { x, y, scale, opacity, color, accent, text, ... }
  // now : a Date captured once per frame (so every widget in a frame shows the same time)
  // Live sensor values come from the global `sensors` object (see js/editor/state.js).
  draw(c, w, now) {
    const r = 46;
    c.fillStyle = 'rgba(8, 15, 26, 0.85)'; c.strokeStyle = w.color; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); c.stroke();
    c.save(); c.rotate((-sensors.heading * Math.PI) / 180);
    const dirs = ['N', 'E', 'S', 'W'];
    for (let i = 0; i < 36; i++) {
      c.save(); c.rotate((i * 10 * Math.PI) / 180);
      c.strokeStyle = i % 9 === 0 ? w.color : 'rgba(255,255,255,0.35)';
      c.lineWidth = i % 9 === 0 ? 2 : 1;
      c.beginPath(); c.moveTo(0, -r + 4); c.lineTo(0, -r + (i % 9 === 0 ? 11 : 7)); c.stroke();
      c.restore();
    }
    c.font = 'bold 11px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    dirs.forEach((d, idx) => { c.save(); c.rotate((idx * 90 * Math.PI) / 180); c.fillStyle = d === 'N' ? w.accent : '#e6edf3'; c.fillText(d, 0, -r + 18); c.restore(); });
    c.fillStyle = w.accent; c.beginPath(); c.moveTo(0, -r + 2); c.lineTo(-4, -r + 9); c.lineTo(4, -r + 9); c.closePath(); c.fill();
    c.restore();
    const dirs8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    c.fillStyle = '#ffffff'; c.font = 'bold 13px monospace'; c.textAlign = 'center'; c.fillText(`${Math.round(sensors.heading)}°`, 0, -1);
    c.fillStyle = w.color; c.font = 'bold 9px monospace'; c.fillText(dirs8[Math.round(sensors.heading / 45) % 8], 0, 11);
  }
});
