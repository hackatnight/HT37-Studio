/**
 * @file     js/editor/widgets/bluetooth.js
 * @layer    Editor widget (REAL watch widget: written into the .bin)
 * @summary  Widget type "bluetooth": the phone-link indicator. The watch itself swaps the picture: frame 0 while the phone is linked,
 *           frame 1 while it is not. Appears in "Add Widget Layer" (card shows the rendered sprite); options in the Selected Layer Inspector.
 *
 * WATCH WIDGET USED (found Nov 1 2026 on the user's watch, vendor face 1004458, docs/BIN_FORMAT.md section 11h)
 *   type 6 sub 0, two consecutive sprites (20x19 on that face): frame 0 = linked, frame 1 = broken link. The watch picks the frame from the
 *   Bluetooth connection state. Which frame shows when is proven for "linked = frame 0" (photo with the phone connected); "frame 1 = not linked"
 *   is inferred from the art, still to confirm by disconnecting. Like every real watch widget it ignores Scale and Opacity.
 * ART    Drawn by this tool (no vendor art is copied): chain link, Bluetooth rune, or a plain dot. Edit later in the sprite studio.
 * API    HT37.bluetoothWidget = { defaults, sizeOf, build, drawIcon, cardIcon }
 */
(function () {
  window.HT37 = window.HT37 || {};
  const defaults = { style: 'link', size: 20, on: '#e5e7eb', off: '#6b7280', offStyle: 'slash', preview: 'on' };
  const full = (o) => Object.assign({}, defaults, o || {});

  /** Draws one state (linked = true / false) into g inside a size x size box at (ox, oy). */
  function drawIcon(g, o, linked, ox, oy) {
    const S = o.size, col = linked ? o.on : o.off, k = S / 20;
    g.save(); g.translate(ox, oy); g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = Math.max(1.5, 2 * k);
    if (o.style === 'dot') {
      g.beginPath(); g.arc(S / 2, S / 2, S * 0.3, 0, Math.PI * 2); linked ? g.fill() : g.stroke();
    } else if (o.style === 'rune') {
      g.beginPath(); [[0.3, 0.3], [0.7, 0.7], [0.5, 0.9], [0.5, 0.1], [0.7, 0.3], [0.3, 0.7]].forEach((p, i) => (i ? g.lineTo(p[0] * S, p[1] * S) : g.moveTo(p[0] * S, p[1] * S))); g.stroke();
    } else { // chain link: two rounded bars at 45 degrees; pulled apart when not linked
      const gap = linked ? 0 : 2.2 * k, bar = (cx, cy) => {
        g.save(); g.translate(cx, cy); g.rotate(-Math.PI / 4); g.beginPath();
        const w = 9 * k, h = 5 * k, r = h / 2; g.moveTo(-w + r, -r); g.lineTo(w - r, -r); g.arc(w - r, 0, r, -Math.PI / 2, Math.PI / 2); g.lineTo(-w + r, r); g.arc(-w + r, 0, r, Math.PI / 2, Math.PI * 1.5); g.closePath(); g.stroke(); g.restore();
      };
      bar(S * 0.36 - gap, S * 0.64 + gap); bar(S * 0.64 + gap, S * 0.36 - gap);
      if (linked) { g.beginPath(); g.moveTo(S * 0.38, S * 0.62); g.lineTo(S * 0.62, S * 0.38); g.stroke(); }
    }
    if (!linked && o.offStyle === 'slash' && o.style !== 'link') { g.beginPath(); g.moveTo(S * 0.15, S * 0.85); g.lineTo(S * 0.85, S * 0.15); g.stroke(); }
    g.restore();
  }

  const sizeOf = (w) => { const o = full(w && w.opts); return { w: o.size, h: o.size }; };

  /** Writes the two frame sprites with add(sprite) -> id (consecutive). (ox, oy) = top-left on the 360x360 screen. */
  function build(opts, add, ox, oy) {
    const o = full(opts), H = HT37.diagFace.helpers;
    const frame = (linked) => { const c = H.cv(o.size, o.size); drawIcon(c.getContext('2d'), o, linked, 0, 0); return add({ w: o.size, h: o.size, alpha: true, rgba: H.pixels(c) }); };
    const f0 = frame(true); frame(false);
    return { widgets: [{ type: 6, sub: 0, x: Math.round(ox), y: Math.round(oy), a: f0 }], fonts: [], size: { w: o.size, h: o.size } };
  }

  function draw(c, w) {
    const o = full(w.opts), s = w.scale || 1;
    c.save(); c.scale(1 / s, 1 / s); // real watch widgets cannot be scaled: the size option sets the pixel size
    drawIcon(c, o, o.preview !== 'off', -o.size / 2, -o.size / 2);
    c.restore();
  }

  /** Small picture of the linked sprite for the Add Widget card (rendered from the same drawing code that makes the sprite). */
  function cardIcon() {
    try { const c = document.createElement('canvas'); c.width = c.height = 40; const g = c.getContext('2d'); g.fillStyle = '#0f172a'; g.fillRect(0, 0, 40, 40); drawIcon(g, Object.assign(full(), { size: 32 }), true, 4, 4); return '<img alt="" width="22" height="22" style="image-rendering:auto;border-radius:4px" src="' + c.toDataURL('image/png') + '">'; } catch (e) { return '🔗'; }
  }

  HT37.bluetoothWidget = { defaults, sizeOf, build, drawIcon, cardIcon };

  HT37.widgets.register({
    type: 'bluetooth', icon: cardIcon(), label: 'Bluetooth Link', desc: 'Linked / not linked icon (real watch widget)', cardSpan: 1,
    quickAdd: { label: '🔗 Bluetooth Link (real watch widget)', order: 9 },
    fw: { id: '0x06', label: 'Weather Forecast' },
    size: { w: 20, h: 20 }, sizeOf, hw: { build, sizeOf },
    defaults: { name: '🔗 Bluetooth Link', color: '#e5e7eb', accent: '#6b7280', text: '', fwId: '0x06', opts: Object.assign({}, defaults) },
    controls: [
      { key: 'style', label: 'Icon style', type: 'select', options: [['link', 'Chain link (like the vendor face)'], ['rune', 'Bluetooth symbol'], ['dot', 'Dot']] },
      { key: 'size', label: 'Icon size', type: 'range', min: 12, max: 48, step: 1 },
      { key: 'on', label: 'Linked color', type: 'color' },
      { key: 'off', label: 'Not linked color', type: 'color' },
      { key: 'offStyle', label: 'Not linked marker', type: 'select', options: [['slash', 'Slash through the icon'], ['none', 'Color only']] },
      { key: 'preview', label: 'Editor preview shows', type: 'select', options: [['on', 'Linked'], ['off', 'Not linked']] }
    ],
    note: 'Real watch widget: the watch switches between the two pictures by itself (linked / not linked). The chain-link style pulls the two links apart when not linked. Scale and Opacity do not apply to real watch widgets.',
    draw
  });
})();
