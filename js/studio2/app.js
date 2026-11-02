/**
 * @file     js/studio2/app.js
 * @layer    Studio 2 page logic (editor2.html)
 * @summary  The new editor: load a face (our own or any .bin), see it exactly as the watch draws it INCLUDING the animated background,
 *           click to select, drag or nudge to move, read a plain-English description of the selected widget, change the simulated values,
 *           and export the edited .bin. Moves are written in place (see bin-model.js). Real watch widgets cannot be resized, so there are
 *           NO resize handles: the selection is a plain outline.
 *
 * NOT IN STUDIO 2 YET (use the classic editor, index.html): pairing/flashing, adding new widgets, editing sprites, vendor library browser.
 * STATE  model (bin-model), sim (catalog.defaultSim), hidden (Set of widget indexes), sel (widget index or -1), playing (animation)
 */
(function () {
  const S = window.HT37S, $ = (id) => document.getElementById(id);
  const cat = S.catalog, R = S.renderer;
  const state = { model: null, sim: cat.defaultSim(), hidden: new Set(), sel: -1, hover: -1, playing: true, touch: false, zoom: 'fit', boxes: [], t0: performance.now(), faceKey: null };
  const face = $('face'), g = face.getContext('2d'), ov = $('overlay'), og = ov.getContext('2d');
  const ICON = { 0: '🖼️', 1: '🕒', 2: '🔢', 3: '📊', 4: '🔤', 5: '▰', 6: '🔹', 7: '🎞️', 8: '👆', 9: '⬜' };
  const SKY = ['Unknown', 'Sunny', 'Cloudy', 'Overcast', 'Shower', 'Thunder', 'Light rain', 'Moderate rain', 'Sleet', 'Light snow', 'Moderate snow', 'Sand', 'Foggy'];
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3500); }
  const wOf = (i) => (state.model && state.model.widgets[i]) || null;
  const isBackdrop = (w) => w.type === 0 || w.type === 7 || (w.type === 6 && w.sub === 1);
  const isMovable = (w) => !isBackdrop(w);

  // ---------- loading ----------
  function setModel(model, key) {
    state.model = model; state.faceKey = key || null; state.hidden = new Set(); state.sel = -1; state.hover = -1;
    const anim = model.widgets.find((w) => w.type === 7);
    $('faceInfo').textContent = model.name + ' · ' + (model.size / 1024).toFixed(0) + ' KB · ' + model.widgets.length + ' widgets · ' + model.sprites.length + ' pictures' + (anim ? ' · animated (' + anim.n + ' frames)' : '');
    $('btnPlay').style.display = anim ? '' : 'none';
    state.t0 = performance.now(); redraw(); renderLayers(); renderInspector(); fit();
  }
  async function loadOurs(key) {
    const def = HT37.diagFace.faces[key]; if (!def) return;
    try {
      if (def.prepare) { toast('Loading fonts…'); await def.prepare(); }
      const bytes = HT37.diagFace.buildBin(key);
      setModel(S.bin.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), def.name), key);
    } catch (e) { toast('Could not build that face: ' + e.message); console.error(e); }
  }
  async function openFile(file) {
    try { setModel(S.bin.parse(await file.arrayBuffer(), file.name), null); $('faceSelect').value = ''; } catch (e) { toast(e.message); }
  }

  // ---------- drawing ----------
  function redraw() {
    if (!state.model) return;
    state.boxes = R.draw(g, state.model, state.sim, performance.now() - state.t0, { hidden: state.hidden, touch: state.touch, frozen: !state.playing });
    drawOverlay();
  }
  function outline(b, style, dash, label) {
    og.save(); og.strokeStyle = style; og.lineWidth = 1.5; if (dash) og.setLineDash([4, 3]);
    og.strokeRect(Math.round(b.x) - 1.5, Math.round(b.y) - 1.5, Math.round(b.w) + 3, Math.round(b.h) + 3);
    if (label) {
      og.setLineDash([]); og.font = '600 10px system-ui, sans-serif'; const tw = og.measureText(label).width + 10, ty = b.y > 18 ? b.y - 17 : b.y + b.h + 3, tx = Math.max(2, Math.min(358 - tw, b.x - 1));
      og.fillStyle = style; og.fillRect(tx, ty, tw, 14); og.fillStyle = '#04070d'; og.textBaseline = 'middle'; og.fillText(label, tx + 5, ty + 7.5);
    }
    og.restore();
  }
  function drawOverlay() {
    og.clearRect(0, 0, 360, 360);
    const h = state.boxes[state.hover], s = state.boxes[state.sel];
    if (h && h.drawn && state.hover !== state.sel && !isBackdrop(wOf(state.hover))) outline(h, 'rgba(230,233,245,.7)', true);
    if (s && s.drawn) { const w = wOf(state.sel); outline(s, '#00e5ff', false, cat.describe(w.type, w.sub).name + ' · ' + Math.round(w.x) + ', ' + Math.round(w.y)); }
  }
  let last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!state.model || ts - last < 66) return; last = ts;
    const animated = state.playing && state.model.widgets.some((w) => w.type === 7 && w.n > 1);
    if (animated || state.sim.live) redraw();
  }

  // ---------- layers ----------
  function renderLayers() {
    const ul = $('layerList'); ul.innerHTML = ''; if (!state.model) return;
    for (let i = state.model.widgets.length - 1; i >= 0; i--) {
      const w = state.model.widgets[i], d = cat.describe(w.type, w.sub), li = document.createElement('li');
      li.className = (i === state.sel ? 'sel ' : '') + (state.hidden.has(i) ? 'hidden' : ''); li.dataset.i = i; li.title = d.help;
      li.innerHTML = '<span class="ic">' + (ICON[w.type] || '◻') + '</span><span class="nm"><span class="dot ' + d.status + '"></span></span><span class="tag">' + w.type + '/' + w.sub + '</span><button class="eye" title="Show or hide in the preview (does not change the face)">' + (state.hidden.has(i) ? '🚫' : '👁') + '</button>';
      li.querySelector('.nm').appendChild(document.createTextNode(d.name));
      li.addEventListener('click', (e) => { if (e.target.closest('.eye')) { state.hidden.has(i) ? state.hidden.delete(i) : state.hidden.add(i); renderLayers(); redraw(); return; } select(i); });
      ul.appendChild(li);
    }
  }
  function select(i) { state.sel = i; renderLayers(); renderInspector(); drawOverlay(); const li = $('layerList').querySelector('li.sel'); if (li) li.scrollIntoView({ block: 'nearest' }); }

  // ---------- inspector ----------
  function row(label, html) { return '<label>' + label + '</label><div>' + html + '</div>'; }
  function renderInspector() {
    const box = $('inspector'), w = wOf(state.sel);
    if (!w) { box.innerHTML = '<h2>Selected widget</h2><div class="empty">Click a widget on the watch or in the Layers list.<br><br>Green dot = tested on the real watch, amber = inferred, grey = not decoded yet.</div>'; return; }
    const d = cat.describe(w.type, w.sub), m = state.model, hasAmPm = m.widgets.some((x) => x.type === 4 && x.sub === 6);
    let info = '';
    if (w.type === 2 || w.type === 3) info = row('Shows now', '<b>' + cat.text(w.type, w.sub, state.sim, hasAmPm) + '</b> <span class="muted">(simulated)</span>') + row('Alignment', '<span class="muted">' + ['starts at X', 'centered on X', 'ends at X'][w.b] + '</span>');
    else if (w.type === 7) info = row('Frames', '<b>' + w.n + '</b>') + row('Timing', '<span class="muted">' + (w.b >> 8) + ' (0x' + w.b.toString(16) + ') · speed unit not measured yet</span>');
    else if (w.type === 4 || w.type === 5 || w.type === 6) info = row('Pictures', '<b>' + m.runLength(w.a) + '</b> <span class="muted">in the set</span>');
    else if (w.type === 8) info = row('Tap area', '<b>' + w.w + ' × ' + w.h + ' px</b>');
    const canMove = isMovable(w);
    box.innerHTML = '<h2>Selected widget</h2><div class="insp-title"><span>' + (ICON[w.type] || '') + '</span><span>' + d.name + '</span><span class="pill ' + d.status + '">' + { known: 'tested', guess: 'inferred', unknown: 'not decoded' }[d.status] + '</span></div>' +
      '<div class="help">' + d.help + '</div><div class="rows">' +
      row('Position X', '<input id="inX" type="number" step="1" min="0" max="360" ' + (canMove ? '' : 'disabled') + ' value="' + Math.round(w.x) + '">') +
      row('Position Y', '<input id="inY" type="number" step="1" min="0" max="360" ' + (canMove ? '' : 'disabled') + ' value="' + Math.round(w.y) + '">') + info + '</div>' +
      '<div class="note">' + (canMove ? (w.type === 8 ? 'Tap areas have no picture. Moving one changes where a tap is detected.' : 'You can move this widget, not resize it: the watch draws it at the size of its picture or font. Different size = different font or picture (done in the classic editor for now).') : 'This is part of the face backdrop, so it is fixed to the full screen.') + '</div>' +
      '<div class="actions"><button class="btn small" id="btnReset"' + (canMove ? '' : ' disabled') + '>Reset position</button><button class="btn small" id="btnHide">' + (state.hidden.has(w.i) ? 'Show in preview' : 'Hide in preview') + '</button></div>' +
      '<details><summary>Advanced details</summary><table><tr><td>list position</td><td>' + w.i + '</td></tr><tr><td>type / sub</td><td>' + w.type + ' / ' + w.sub + '</td></tr><tr><td>picture / font (a)</td><td>' + w.a + '</td></tr><tr><td>b</td><td>' + w.b + ' (0x' + w.b.toString(16) + ')</td></tr><tr><td>flag</td><td>' + w.flag + '</td></tr><tr><td>count byte</td><td>' + w.n + '</td></tr></table></details>';
    const inX = $('inX'), inY = $('inY');
    if (inX) { inX.oninput = () => { w.x = Math.max(0, Math.min(360, +inX.value || 0)); redraw(); }; inY.oninput = () => { w.y = Math.max(0, Math.min(360, +inY.value || 0)); redraw(); }; }
    $('btnReset').onclick = () => { w.x = w.orig.x; w.y = w.orig.y; redraw(); renderInspector(); };
    $('btnHide').onclick = () => { state.hidden.has(w.i) ? state.hidden.delete(w.i) : state.hidden.add(w.i); renderLayers(); renderInspector(); redraw(); };
  }

  // ---------- simulated values ----------
  function renderSim() {
    const s = state.sim, el = $('simPanel');
    const num = (k, min, max) => '<input type="number" data-k="' + k + '" min="' + min + '" max="' + max + '" value="' + s[k] + '">';
    const rng = (k, min, max) => '<input type="range" data-k="' + k + '" min="' + min + '" max="' + max + '" value="' + s[k] + '"><div class="val" id="v_' + k + '">' + s[k] + '</div>';
    el.innerHTML = '<div class="rows">' +
      row('Clock', '<label class="check"><input type="checkbox" data-k="live" ' + (s.live ? 'checked' : '') + '> use this computer\'s time</label>') +
      row('Time (h : m)', '<input type="number" data-k="h" min="0" max="23" value="' + s.h + '" ' + (s.live ? 'disabled' : '') + ' style="width:48%"> <input type="number" data-k="m" min="0" max="59" value="' + s.m + '" ' + (s.live ? 'disabled' : '') + ' style="width:48%">') +
      row('Weekday', '<select data-k="dow" ' + (s.live ? 'disabled' : '') + '>' + DAYS.map((d, i) => '<option value="' + i + '" ' + (s.dow === i ? 'selected' : '') + '>' + d + '</option>').join('') + '</select>') +
      row('12-hour', '<label class="check"><input type="checkbox" data-k="twelve" ' + (s.twelve ? 'checked' : '') + '> 12-hour clock</label>') +
      row('Battery', rng('batt', 0, 100)) + row('Steps', num('steps', 0, 99999)) + row('Heart rate', num('hr', 0, 220)) +
      row('Compass', rng('heading', 0, 359)) + row('Sky', '<select data-k="sky">' + SKY.map((n, i) => '<option value="' + i + '" ' + (s.sky === i ? 'selected' : '') + '>' + n + '</option>').join('') + '</select>') +
      row('Temperature °F', num('tempF', -40, 130)) + row('Bluetooth', '<label class="check"><input type="checkbox" data-k="linked" ' + (s.linked ? 'checked' : '') + '> phone linked</label>') + '</div>';
    el.querySelectorAll('[data-k]').forEach((inp) => {
      const k = inp.dataset.k;
      inp.addEventListener('input', () => {
        s[k] = inp.type === 'checkbox' ? inp.checked : (inp.tagName === 'SELECT' || inp.type === 'number' || inp.type === 'range') ? +inp.value : inp.value;
        const v = $('v_' + k); if (v) v.textContent = s[k];
        if (k === 'live' || k === 'dow') renderSim();
        redraw(); if (state.sel >= 0) renderInspector();
      });
    });
  }

  // ---------- pointer + keyboard ----------
  function pt(e) { const r = ov.getBoundingClientRect(), k = 360 / r.width; return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, k }; }
  function hit(p) {
    for (let j = state.boxes.length - 1; j >= 0; j--) {
      const b = state.boxes[j], w = wOf(j); if (!b.drawn || isBackdrop(w) || state.hidden.has(j)) continue;
      if (w.type === 8 && !state.touch) continue;
      if (p.x >= b.x - 2 && p.x <= b.x + b.w + 2 && p.y >= b.y - 2 && p.y <= b.y + b.h + 2) return j;
    }
    return -1;
  }
  let drag = null;
  ov.addEventListener('pointerdown', (e) => {
    const p = pt(e), j = hit(p); select(j);
    if (j >= 0 && isMovable(wOf(j))) { drag = { j, sx: p.x, sy: p.y, wx: wOf(j).x, wy: wOf(j).y }; ov.setPointerCapture(e.pointerId); ov.style.cursor = 'grabbing'; }
  });
  ov.addEventListener('pointermove', (e) => {
    const p = pt(e);
    if (drag) { const w = wOf(drag.j); w.x = Math.max(0, Math.min(360, Math.round(drag.wx + p.x - drag.sx))); w.y = Math.max(0, Math.min(360, Math.round(drag.wy + p.y - drag.sy))); redraw(); const ix = $('inX'); if (ix) { ix.value = w.x; $('inY').value = w.y; } return; }
    const j = hit(p); if (j !== state.hover) { state.hover = j; ov.style.cursor = j >= 0 ? 'grab' : 'default'; drawOverlay(); }
  });
  const end = () => { if (drag) { drag = null; ov.style.cursor = 'default'; } };
  ov.addEventListener('pointerup', end); ov.addEventListener('pointercancel', end);
  document.addEventListener('keydown', (e) => {
    const w = wOf(state.sel); if (!w || !isMovable(w) || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const st = e.shiftKey ? 10 : 1, d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key]; if (!d) return;
    e.preventDefault(); w.x = Math.max(0, Math.min(360, w.x + d[0])); w.y = Math.max(0, Math.min(360, w.y + d[1])); redraw(); renderInspector();
  });

  // ---------- toolbar, menus ----------
  function fit() {
    const wrap = $('watchWrap'), z = state.zoom === 'fit' ? Math.max(0.5, Math.min(2, (Math.min(wrap.clientWidth, wrap.clientHeight) - 50) / 360)) : +state.zoom;
    [face, ov].forEach((c) => { c.style.width = c.style.height = Math.round(360 * z) + 'px'; });
  }
  window.addEventListener('resize', fit);
  $('zoomSelect').onchange = (e) => { state.zoom = e.target.value; fit(); };
  $('chkTouch').onchange = (e) => { state.touch = e.target.checked; redraw(); };
  $('btnPlay').onclick = () => { state.playing = !state.playing; $('btnPlay').textContent = state.playing ? '⏸ Pause animation' : '▶ Play animation'; if (state.playing) state.t0 = performance.now(); redraw(); };
  $('btnOpen').onclick = () => $('fileInput').click();
  $('fileInput').onchange = (e) => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ''; };
  $('btnExport').onclick = () => {
    if (!state.model) return; const bytes = state.model.bytes(), url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' })), a = document.createElement('a');
    a.href = url; a.download = state.model.name.replace(/\.bin$/i, '') + (state.model.dirty() ? '_edited' : '') + '.bin'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Saved ' + a.download + (state.model.dirty() ? ' (with your moves)' : ''));
  };
  ['dragover', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' && e.dataTransfer.files[0]) openFile(e.dataTransfer.files[0]); }));
  $('faceSelect').onchange = (e) => { if (e.target.value) loadOurs(e.target.value); };

  function buildFaceMenu() {
    const sel = $('faceSelect'), F = HT37.diagFace.faces, keys = Object.keys(F), ours = ['cyber1', 'diag'].filter((k) => F[k]), tests = keys.filter((k) => !ours.includes(k));
    const og1 = document.createElement('optgroup'); og1.label = 'Our faces'; ours.forEach((k) => { const o = document.createElement('option'); o.value = k; o.textContent = F[k].label.replace(/^[^\w(]+\s*/, ''); og1.appendChild(o); });
    const og2 = document.createElement('optgroup'); og2.label = 'Test faces (advanced)'; tests.forEach((k) => { const o = document.createElement('option'); o.value = k; o.textContent = F[k].label.replace(/^[^\w(]+\s*/, ''); og2.appendChild(o); });
    sel.appendChild(og1); sel.appendChild(og2);
  }

  buildFaceMenu(); renderSim(); renderInspector(); requestAnimationFrame(loop);
  loadOurs('cyber1').then(() => { $('faceSelect').value = 'cyber1'; });
  window.HT37S.app = { state, setModel, loadOurs, openFile, redraw, select };
})();
