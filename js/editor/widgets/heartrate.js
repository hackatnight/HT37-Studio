/**
 * @file     js/editor/widgets/heartrate.js
 * @layer    Editor widget
 * @summary  Widget type "heartrate": Heart-rate box with BPM and a scrolling ECG trace (reads sensors.hr, sensors.ecgPhase).
 *
 * ROLE
 *   - One HT37.widgets.register({...}) call. Firmware widget id shown in the inspector: 0x11 Heart Rate PPG.
 *   - Fields: type, icon/label/desc/cardSpan (Add-Widget card), quickAdd (dropdown label+order), fw {id,label},
 *     size {w,h} (hit-box at scale 1), defaults {name,color,accent,text,fwId} (new-layer values), draw(c, w,
 *     now).
 *   - draw(): c is already translated to the layer center and scaled/faded by drawWatchface(); only draw around
 *     (0,0). `now` is one Date per frame. Live values come from the global `sensors`.
 *
 * REGISTERS
 *   - widgets.register(type:heartrate)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: sensors
 *
 * LOAD ORDER
 *   #10 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/editor/widgets/compass.js   before: js/editor/widgets/barometer.js
 *
 * NOTES
 *   - Canvas code: colors here are real canvas colors — do not replace them with CSS variables.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.widgets.register({
  type: 'heartrate',
  // --- UI metadata (drives the "Add Widget Layer" card, the quick-add dropdown and the firmware-ID dropdown) ---
  icon: '❤️',
  label: 'Heart Rate PPG',
  desc: 'Live BPM + ECG Graph',
  cardSpan: 1,
  quickAdd: { label: '❤️ Heart Rate PPG Layer', order: 5 },
  fw: { id: '0x11', label: 'Heart Rate PPG' },
  // --- hit-box / layout size at scale 1.0 (watch pixels) ---
  size: { w: 120, h: 52 },
  // --- initial values for a freshly added layer ---
  defaults: { name: '❤️ Heart Rate PPG', color: '#ff5252', accent: '#ff8a80', text: 'BPM', fwId: '0x11' },
  // --- renderer ---
  // c   : CanvasRenderingContext2D, ALREADY translated to the layer center and scaled/faded by drawWatchface()
  // w   : the layer object { x, y, scale, opacity, color, accent, text, ... }
  // now : a Date captured once per frame (so every widget in a frame shows the same time)
  // Live sensor values come from the global `sensors` object (see js/editor/state.js).
  draw(c, w, now) {
    const bpm = Math.max(30, Math.min(220, Number(sensors.hr) || 76));
    c.fillStyle = 'rgba(255, 82, 82, 0.1)'; c.strokeStyle = w.color; c.lineWidth = 1.5;
    c.beginPath(); c.roundRect(-58, -24, 116, 48, 10); c.fill(); c.stroke();
    c.fillStyle = w.color; c.font = 'bold 16px monospace'; c.textAlign = 'left';
    c.fillText(`♥ ${bpm}`, -48, -4);
    c.fillStyle = '#9aa4b2'; c.font = '9px monospace'; c.fillText(w.text || 'PPG LIVE', -48, 12);
    c.strokeStyle = w.accent; c.lineWidth = 1.6; c.beginPath();
    const pxPerBeat = Math.max(14, Math.min(42, Math.round(28 * (60 / bpm))));
    for (let x = 0; x < 46; x++) {
      const pos = Math.floor(x + sensors.ecgPhase) % pxPerBeat;
      const y = pos === 4 ? -3 : pos === 6 ? -13 : pos === 8 ? 10 : pos === 10 ? -5 : pos === 12 ? 2 : 0;
      if (x === 0) c.moveTo(4 + x, 2 + y); else c.lineTo(4 + x, 2 + y);
    }
    c.stroke();
  }
});
