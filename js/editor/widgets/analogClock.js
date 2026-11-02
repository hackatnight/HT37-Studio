/**
 * @file     js/editor/widgets/analogClock.js
 * @layer    Editor widget
 * @summary  Widget type "analogClock": Sweeping vector hour/minute/second hands.
 *
 * ROLE
 *   - One HT37.widgets.register({...}) call. Firmware widget id shown in the inspector: 0x02 Analog Hands.
 *   - Fields: type, icon/label/desc/cardSpan (Add-Widget card), quickAdd (dropdown label+order), fw {id,label},
 *     size {w,h} (hit-box at scale 1), defaults {name,color,accent,text,fwId} (new-layer values), draw(c, w,
 *     now).
 *   - draw(): c is already translated to the layer center and scaled/faded by drawWatchface(); only draw around
 *     (0,0). `now` is one Date per frame. Live values come from the global `sensors`.
 *
 * REGISTERS
 *   - widgets.register(type:analogClock)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *
 * LOAD ORDER
 *   #18 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/editor/widgets/digitalClock.js   before: js/editor/widgets/customText.js
 *
 * NOTES
 *   - Canvas code: colors here are real canvas colors — do not replace them with CSS variables.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.widgets.register({
  type: 'analogClock',
  // --- UI metadata (drives the "Add Widget Layer" card, the quick-add dropdown and the firmware-ID dropdown) ---
  icon: '🕰️',
  label: 'Analog Hands',
  desc: 'Sweeping Vector Hands',
  cardSpan: 1,
  quickAdd: { label: '🕰️ Analog Hands Layer', order: 2 },
  fw: { id: '0x02', label: 'Analog Hands' },
  // --- hit-box / layout size at scale 1.0 (watch pixels) ---
  size: { w: 140, h: 140 },
  // --- initial values for a freshly added layer ---
  defaults: { name: '🕰️ Analog Hands', color: '#ffffff', accent: '#ff5252', text: 'ANALOG', fwId: '0x02' },
  // --- renderer ---
  // c   : CanvasRenderingContext2D, ALREADY translated to the layer center and scaled/faded by drawWatchface()
  // w   : the layer object { x, y, scale, opacity, color, accent, text, ... }
  // now : a Date captured once per frame (so every widget in a frame shows the same time)
  // Live sensor values come from the global `sensors` object (see js/editor/state.js).
  draw(c, w, now) {
    const r = 70, sec = now.getSeconds() + now.getMilliseconds() / 1000, min = now.getMinutes() + sec / 60, hr = (now.getHours() % 12) + min / 60;
    c.save(); c.rotate((hr * Math.PI) / 6); c.strokeStyle = w.color; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 10); c.lineTo(0, -r * 0.55); c.stroke(); c.restore();
    c.save(); c.rotate((min * Math.PI) / 30); c.strokeStyle = w.color; c.lineWidth = 3.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 12); c.lineTo(0, -r * 0.82); c.stroke(); c.restore();
    c.save(); c.rotate((sec * Math.PI) / 30); c.strokeStyle = w.accent; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 16); c.lineTo(0, -r * 0.92); c.stroke();
    c.fillStyle = w.accent; c.beginPath(); c.arc(0, 0, 4, 0, Math.PI * 2); c.fill(); c.restore();
  }
});
