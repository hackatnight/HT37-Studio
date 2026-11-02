/**
 * @file     js/editor/widgets/customText.js
 * @layer    Editor widget
 * @summary  Widget type "customText": Static text label / badge placed anywhere on the dial.
 *
 * ROLE
 *   - One HT37.widgets.register({...}) call. Firmware widget id shown in the inspector: 0x20 Static Graphic.
 *   - Fields: type, icon/label/desc/cardSpan (Add-Widget card), quickAdd (dropdown label+order), fw {id,label},
 *     size {w,h} (hit-box at scale 1), defaults {name,color,accent,text,fwId} (new-layer values), draw(c, w,
 *     now).
 *   - draw(): c is already translated to the layer center and scaled/faded by drawWatchface(); only draw around
 *     (0,0). `now` is one Date per frame. Live values come from the global `sensors`.
 *
 * REGISTERS
 *   - widgets.register(type:customText)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *
 * LOAD ORDER
 *   #19 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/editor/widgets/analogClock.js   before: js/editor/render.js
 *
 * NOTES
 *   - Canvas code: colors here are real canvas colors — do not replace them with CSS variables.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.widgets.register({
  type: 'customText',
  // --- UI metadata (drives the "Add Widget Layer" card, the quick-add dropdown and the firmware-ID dropdown) ---
  icon: '🔤',
  label: 'Custom Text / Tactical Callsign Layer',
  desc: 'Add custom static text label or badge anywhere on dial',
  cardSpan: 2,
  quickAdd: { label: '🔤 Custom Text Layer', order: 10 },
  fw: { id: '0x20', label: 'Static Graphic' },
  // --- hit-box / layout size at scale 1.0 (watch pixels) ---
  size: { w: 125, h: 28 },
  // --- initial values for a freshly added layer ---
  defaults: { name: '🔤 Custom Tag', color: '#00e676', accent: '#ffffff', text: 'HT-37 PRO', fwId: '0x20' },
  // --- renderer ---
  // c   : CanvasRenderingContext2D, ALREADY translated to the layer center and scaled/faded by drawWatchface()
  // w   : the layer object { x, y, scale, opacity, color, accent, text, ... }
  // now : a Date captured once per frame (so every widget in a frame shows the same time)
  // Live sensor values come from the global `sensors` object (see js/editor/state.js).
  draw(c, w, now) {
    c.fillStyle = w.color; c.font = 'bold 14px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(w.text || 'HT37 TACTICAL', 0, 0);
  }
});
