/**
 * @file     js/editor/widgets/digitalClock.js
 * @layer    Editor widget
 * @summary  Widget type "digitalClock": HH:MM:SS digital time with seconds and 24H tag.
 *
 * ROLE
 *   - One HT37.widgets.register({...}) call. Firmware widget id shown in the inspector: 0x01 Time Digital.
 *   - Fields: type, icon/label/desc/cardSpan (Add-Widget card), quickAdd (dropdown label+order), fw {id,label},
 *     size {w,h} (hit-box at scale 1), defaults {name,color,accent,text,fwId} (new-layer values), draw(c, w,
 *     now).
 *   - draw(): c is already translated to the layer center and scaled/faded by drawWatchface(); only draw around
 *     (0,0). `now` is one Date per frame. Live values come from the global `sensors`.
 *
 * REGISTERS
 *   - widgets.register(type:digitalClock)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *
 * LOAD ORDER
 *   #17 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/editor/widgets/temp.js   before: js/editor/widgets/analogClock.js
 *
 * NOTES
 *   - Canvas code: colors here are real canvas colors — do not replace them with CSS variables.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.widgets.register({
  type: 'digitalClock',
  // --- UI metadata (drives the "Add Widget Layer" card, the quick-add dropdown and the firmware-ID dropdown) ---
  icon: '🕓',
  label: 'Digital Time',
  desc: 'HH:MM:SS Custom Font',
  cardSpan: 1,
  quickAdd: { label: '🕓 Digital Time Layer', order: 1 },
  fw: { id: '0x01', label: 'Time Digital' },
  // --- hit-box / layout size at scale 1.0 (watch pixels) ---
  size: { w: 175, h: 56 },
  // --- initial values for a freshly added layer ---
  defaults: { name: '🕓 Digital Time', color: '#ffffff', accent: '#00e5ff', text: '24H', fwId: '0x01' },
  // --- renderer ---
  // c   : CanvasRenderingContext2D, ALREADY translated to the layer center and scaled/faded by drawWatchface()
  // w   : the layer object { x, y, scale, opacity, color, accent, text, ... }
  // now : a Date captured once per frame (so every widget in a frame shows the same time)
  // Live sensor values come from the global `sensors` object (see js/editor/state.js).
  draw(c, w, now) {
    const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0'), ss = String(now.getSeconds()).padStart(2, '0');
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = w.accent; c.shadowBlur = 10;
    c.fillStyle = w.color; c.font = 'bold 46px monospace'; c.fillText(`${hh}:${mm}`, -14, 0);
    c.shadowBlur = 0; c.fillStyle = w.accent; c.font = 'bold 18px monospace'; c.fillText(ss, 68, -8);
    c.fillStyle = '#8b949e'; c.font = '10px monospace'; c.fillText(w.text || '24H', 68, 10);
  }
});
