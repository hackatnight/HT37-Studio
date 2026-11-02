/**
 * @file     js/editor/widgets/steps.js
 * @layer    Editor widget
 * @summary  Widget type "steps": Pedometer arc ring with step count (reads sensors.steps / stepGoal).
 *
 * ROLE
 *   - One HT37.widgets.register({...}) call. Firmware widget id shown in the inspector: 0x12 Step Counter.
 *   - Fields: type, icon/label/desc/cardSpan (Add-Widget card), quickAdd (dropdown label+order), fw {id,label},
 *     size {w,h} (hit-box at scale 1), defaults {name,color,accent,text,fwId} (new-layer values), draw(c, w,
 *     now).
 *   - draw(): c is already translated to the layer center and scaled/faded by drawWatchface(); only draw around
 *     (0,0). `now` is one Date per frame. Live values come from the global `sensors`.
 *
 * REGISTERS
 *   - widgets.register(type:steps)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: sensors
 *
 * LOAD ORDER
 *   #12 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/editor/widgets/barometer.js   before: js/editor/widgets/date.js
 *
 * NOTES
 *   - Canvas code: colors here are real canvas colors — do not replace them with CSS variables.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.widgets.register({
  type: 'steps',
  // --- UI metadata (drives the "Add Widget Layer" card, the quick-add dropdown and the firmware-ID dropdown) ---
  icon: '👟',
  label: 'Steps Goal Ring',
  desc: 'Pedometer Arc + Count',
  cardSpan: 1,
  quickAdd: { label: '👟 Steps Goal Ring Layer', order: 7 },
  fw: { id: '0x12', label: 'Step Counter' },
  // --- hit-box / layout size at scale 1.0 (watch pixels) ---
  size: { w: 58, h: 58 },
  // --- initial values for a freshly added layer ---
  defaults: { name: '👟 Steps Ring', color: '#ffab00', accent: '#ffe57f', text: 'STEPS', fwId: '0x12' },
  // --- renderer ---
  // c   : CanvasRenderingContext2D, ALREADY translated to the layer center and scaled/faded by drawWatchface()
  // w   : the layer object { x, y, scale, opacity, color, accent, text, ... }
  // now : a Date captured once per frame (so every widget in a frame shows the same time)
  // Live sensor values come from the global `sensors` object (see js/editor/state.js).
  draw(c, w, now) {
    const pct = Math.min(1, sensors.steps / sensors.stepGoal), r = 24;
    c.lineWidth = 5; c.strokeStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = w.color; c.lineCap = 'round'; c.beginPath(); c.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2); c.stroke();
    c.fillStyle = '#ffffff'; c.font = 'bold 10px monospace'; c.textAlign = 'center'; c.fillText(`${sensors.steps}`, 0, 2);
    c.fillStyle = w.accent; c.font = '7px monospace'; c.fillText(w.text || 'STEPS', 0, 12);
  }
});
