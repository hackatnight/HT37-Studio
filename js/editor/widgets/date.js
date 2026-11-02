/**
 * @file     js/editor/widgets/date.js
 * @layer    Editor widget
 * @summary  Widget type "date": Weekday + day-of-month badge from the current date.
 *
 * ROLE
 *   - One HT37.widgets.register({...}) call. Firmware widget id shown in the inspector: 0x05 Date Calendar.
 *   - Fields: type, icon/label/desc/cardSpan (Add-Widget card), quickAdd (dropdown label+order), fw {id,label},
 *     size {w,h} (hit-box at scale 1), defaults {name,color,accent,text,fwId} (new-layer values), draw(c, w,
 *     now).
 *   - draw(): c is already translated to the layer center and scaled/faded by drawWatchface(); only draw around
 *     (0,0). `now` is one Date per frame. Live values come from the global `sensors`.
 *
 * REGISTERS
 *   - widgets.register(type:date)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *
 * LOAD ORDER
 *   #13 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/editor/widgets/steps.js   before: js/editor/widgets/weather.js
 *
 * NOTES
 *   - Canvas code: colors here are real canvas colors — do not replace them with CSS variables.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.widgets.register({
  type: 'date',
  // --- UI metadata (drives the "Add Widget Layer" card, the quick-add dropdown and the firmware-ID dropdown) ---
  icon: '📅',
  label: 'Date Calendar',
  desc: 'Weekday + Date Badge',
  cardSpan: 1,
  quickAdd: { label: '📅 Date Calendar Layer', order: 3 },
  fw: { id: '0x05', label: 'Date Calendar' },
  // --- hit-box / layout size at scale 1.0 (watch pixels) ---
  size: { w: 100, h: 40 },
  // --- initial values for a freshly added layer ---
  defaults: { name: '📅 Date Calendar', color: '#00e5ff', accent: '#ffffff', text: 'CAL', fwId: '0x05' },
  // --- renderer ---
  // c   : CanvasRenderingContext2D, ALREADY translated to the layer center and scaled/faded by drawWatchface()
  // w   : the layer object { x, y, scale, opacity, color, accent, text, ... }
  // now : a Date captured once per frame (so every widget in a frame shows the same time)
  // Live sensor values come from the global `sensors` object (see js/editor/state.js).
  draw(c, w, now) {
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    c.fillStyle = 'rgba(14, 22, 34, 0.85)'; c.strokeStyle = w.color; c.lineWidth = 1.5;
    c.beginPath(); c.roundRect(-48, -18, 96, 36, 8); c.fill(); c.stroke();
    c.fillStyle = w.color; c.beginPath(); c.roundRect(-43, -13, 34, 26, 5); c.fill();
    c.fillStyle = '#06090e'; c.font = 'bold 11px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(days[now.getDay()], -26, 0);
    c.fillStyle = w.accent; c.font = 'bold 14px monospace'; c.textAlign = 'left'; c.fillText(String(now.getDate()).padStart(2, '0'), -4, -3);
    c.fillStyle = '#9aa4b2'; c.font = 'bold 9px monospace'; c.fillText(months[now.getMonth()], -4, 9);
  }
});
