/**
 * @file     js/editor/layer-view.js
 * @layer    EDITOR UI (replaces the plain layer list)
 * @summary  Visual layer list: a thumbnail for every widget, a plain-language name ("Steps number", "Weekday label"),
 *           what it is (Dial / Number / Label / Gauge / Icon / Hand / Built-in), what it shows, and filter chips.
 *
 * HOW
 *   - Overrides the global renderLayerList() from layers.js (same DOM: #layerList, #layerCountBadge, same row buttons).
 *   - describe(w) turns a layer + its hwMeta (type/sub/a/b of the .bin widget entry) into { kind, title, shows }.
 *     Sub codes are only known for some types (see docs/BIN_FORMAT.md); unknown ones fall back to "Widget (type T, sub S)".
 *   - A light poll re-renders when a thumbnail, a value or the selection changes (live sensor sliders, Sprite Studio edits).
 * API  HT37.layerView = { describe, render, setFilter, KINDS }
 */
(function () {
  window.HT37 = window.HT37 || {};

  const KINDS = {
    all:     { label: 'All',      icon: '▦' },
    number:  { label: 'Numbers',  icon: '🔢' },
    label:   { label: 'Labels',   icon: '🏷️' },
    gauge:   { label: 'Gauges',   icon: '📊' },
    icon:    { label: 'Icons',    icon: '🌤️' },
    hand:    { label: 'Hands',    icon: '🕐' },
    other:   { label: 'Other',    icon: '🧩' }
  };
  const NUMBER_SUBS = { 0: 'Steps', 1: 'Day of month', 2: 'Hour', 3: 'Minute', 6: 'Distance', 7: 'Calories', 8: 'Heart rate', 11: 'Temperature', 13: 'Date', 15: 'Battery %', 19: 'Year', 4: 'Seconds (guess)' };
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let filter = 'all';
  const checked = new Set(); // layers ticked for the "Layers I ticked" scope of Sprite Studio

  /** Plain-language description of one layer. */
  function describe(w) {
    const hm = w.hwMeta;
    if (!hm) {
      const clean = String(w.name || w.type || 'Widget').replace(/^[^\w(]+/, '');
      return { kind: 'other', title: clean, shows: 'Built-in ' + (w.type || 'widget') };
    }
    switch (hm.type) {
      case 0: return { kind: 'other', title: 'Background layer', shows: 'Static picture (sprite ' + hm.a + ')' };
      case 1: return { kind: 'hand', title: ({ 6: 'Hour hand', 7: 'Minute hand', 8: 'Second hand' })[hm.sub] || 'Hand', shows: 'Rotates with the time' };
      case 2:
      case 3: {
        const what = (hm.type === 2 && hm.sub === 0) ? 'Time' : NUMBER_SUBS[hm.sub];
        return { kind: 'number', title: what ? what + ' number' : 'Number (value ' + hm.sub + ')', shows: w.text ? '"' + w.text + '" · font ' + hm.a : 'Font ' + hm.a };
      }
      case 4:
        if (hm.sub === 0) return { kind: 'label', title: 'Weekday label', shows: '7 sprites, one per day (now ' + (DAYS[Number((document.getElementById('simWeekdaySelect') || {}).value) || 0] || 'Mon') + ')' };
        if (hm.sub === 6) return { kind: 'label', title: 'AM / PM label', shows: '2 sprites (AM, PM)' };
        if (hm.a === 86) return { kind: 'label', title: 'Distance unit label', shows: 'km or mi' };
        return { kind: 'label', title: 'Label (sprite ' + hm.a + ')', shows: 'Text sprite, language pair' };
      case 5: {
        const what = hm.sub === 1 ? 'Steps' : hm.sub === 0 ? 'Battery' : 'Value ' + hm.sub;
        return { kind: 'gauge', title: what + ' gauge', shows: '11 frames, 0–100% in 10% steps' };
      }
      case 6: return { kind: 'icon', title: hm.sub === 2 ? 'Weather icon' : 'Icon (sub ' + hm.sub + ')', shows: hm.sub === 2 ? '13 frames: unknown, then sunny to foggy' : 'Icon set' };
      case 7: return { kind: 'other', title: 'Animation', shows: 'Frame sequence (preview not drawn yet)' };
      case 8: return { kind: 'other', title: 'App shortcut', shows: 'Touch area, built-in app ' + hm.sub };
      case 9: return { kind: 'other', title: 'Background switcher', shows: 'Changes the background on tap' };
      default: return { kind: 'other', title: 'Widget (type ' + hm.type + ', sub ' + hm.sub + ')', shows: '' };
    }
  }

  function thumb(w, kind) {
    const c = document.createElement('canvas'); c.width = c.height = 40; c.className = 'lv-thumb';
    const g = c.getContext('2d');
    const src = w.spriteCanvas;
    if (src && src.width && src.height) {
      const s = Math.min(38 / src.width, 38 / src.height, 3);
      const dw = Math.max(1, src.width * s), dh = Math.max(1, src.height * s);
      g.imageSmoothingEnabled = s < 1;
      try { g.drawImage(src, (40 - dw) / 2, (40 - dh) / 2, dw, dh); } catch (e) { /* tainted or empty */ }
    } else {
      g.font = '20px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(KINDS[kind] ? KINDS[kind].icon : '🧩', 20, 21);
    }
    return c;
  }

  function injectStyle() {
    if (document.getElementById('lvStyle')) return;
    const st = document.createElement('style'); st.id = 'lvStyle';
    st.textContent = `
      .lv-chips{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 6px}
      .lv-chips .lv-chip{width:auto !important;height:20px !important;min-width:0 !important;display:inline-flex !important;align-items:center;margin:0 !important;padding:0 8px !important}
      #secWidgetLayersBody .layer-toolbar{display:none !important}
      #layerList{max-height:330px;overflow-y:auto}
      .lv-btns .icon-btn{width:22px !important;height:18px !important;min-width:0 !important;padding:0 !important;margin:0 !important;font-size:10px !important;display:inline-flex;align-items:center;justify-content:center}
      .lv-chip{font-size:10px;padding:2px 7px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#94a3b8;cursor:pointer}
      .lv-chip.on{background:#0e7490;border-color:#22d3ee;color:#fff}
      .lv-row{display:flex;align-items:center;gap:8px;padding:5px 6px}
      .lv-thumb{flex:none;width:40px;height:40px;border-radius:4px;background:repeating-conic-gradient(#1e293b 0% 25%,#0f172a 0% 50%) 0 0/8px 8px;border:1px solid #334155}
      .lv-check{flex:none;width:14px !important;height:14px !important;margin:0 !important;accent-color:#f59e0b}
      .lv-text{flex:1;min-width:0}
      .lv-title{font-size:11px;font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .lv-sub{font-size:10px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .lv-btns{display:flex;flex-direction:column;gap:2px}
            .lv-edited{color:#f59e0b;font-weight:700}`;
    document.head.appendChild(st);
  }

  function chips(container, counts) {
    let bar = document.getElementById('lvChips');
    if (!bar) { bar = document.createElement('div'); bar.id = 'lvChips'; bar.className = 'lv-chips'; container.parentElement.insertBefore(bar, container); }
    bar.innerHTML = '';
    Object.keys(KINDS).forEach((k) => {
      if (k !== 'all' && !counts[k]) return;
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'lv-chip' + (filter === k ? ' on' : '');
      b.textContent = KINDS[k].icon + ' ' + KINDS[k].label + (k === 'all' ? '' : ' ' + counts[k]);
      b.title = 'Show only: ' + KINDS[k].label;
      ['width:auto','height:20px','min-width:0','margin:0','padding:0 8px','display:inline-flex','flex:none'].forEach((d) => { const [k2, v] = d.split(':'); b.style.setProperty(k2, v, 'important'); });
      b.onclick = () => { filter = k; render(); };
      bar.appendChild(b);
    });
  }

  function render() {
    const container = document.getElementById('layerList');
    if (!container || typeof widgets === 'undefined') return;
    injectStyle();
    const badge = document.getElementById('layerCountBadge'); if (badge) badge.textContent = widgets.length;
    const info = widgets.map((w) => ({ w, d: describe(w) }));
    const counts = {}; info.forEach((x) => { counts[x.d.kind] = (counts[x.d.kind] || 0) + 1; });
    if (filter !== 'all' && !counts[filter]) filter = 'all';
    chips(container, counts);
    container.innerHTML = '';
    const M = window.decompiledBinData;
    [...info].reverse().forEach(({ w, d }) => {
      if (filter !== 'all' && d.kind !== filter) return;
      const div = document.createElement('div');
      div.className = 'layer-item lv-row' + (w.id === selectedWidgetId ? ' active' : '') + (!w.visible ? ' hidden-layer' : '');
      div.title = d.title + ' — ' + d.shows + '\nClick to select; the tools below follow your selection.';
      div.onclick = () => { selectedWidgetId = w.id; render(); if (typeof syncInspector === 'function') syncInspector(); };
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'lv-check'; cb.checked = checked.has(w.id);
      cb.title = 'Tick layers, then choose "Layers I ticked" under "Apply to" in the editor strip to restyle just these.';
      cb.onclick = (ev) => { ev.stopPropagation(); if (cb.checked) checked.add(w.id); else checked.delete(w.id); lastSig = ''; if (HT37.spriteStudio) HT37.spriteStudio.update(false); };
      div.appendChild(cb);
      div.appendChild(thumb(w, d.kind));
      const t = document.createElement('div'); t.className = 'lv-text';
      let edited = false;
      if (M && w.hwMeta && (w.hwMeta.type === 2 || w.hwMeta.type === 3) && HT37.faceWidgets && HT37.faceWidgets.numberFont) edited = HT37.faceWidgets.numberFont.isEditedFont(M, w.hwMeta.a);
      t.innerHTML = '<div class="lv-title"></div><div class="lv-sub"></div>';
      t.firstChild.textContent = d.title + (edited ? ' ' : '');
      if (edited) { const e = document.createElement('span'); e.className = 'lv-edited'; e.textContent = '● edited'; t.firstChild.appendChild(e); }
      t.lastChild.textContent = d.shows;
      div.appendChild(t);
      const b = document.createElement('div'); b.className = 'lv-btns';
      const mk = (txt, tip, fn, cls) => { const x = document.createElement('button'); x.className = 'icon-btn' + (cls ? ' ' + cls : ''); x.textContent = txt; x.title = tip; x.onclick = (ev) => { ev.stopPropagation(); fn(); }; return x; };
      const row1 = document.createElement('div'), row2 = document.createElement('div'); row1.style.display = row2.style.display = 'flex';
      row1.append(mk(w.visible ? '👁️' : '🚫', 'Show / hide', () => toggleLayerVisible(w.id)), mk(w.locked ? '🔒' : '🔓', 'Lock / unlock', () => toggleLayerLock(w.id)), mk('🗑️', 'Delete layer', () => deleteWidget(w.id), 'del-btn'));
      row2.append(mk('▲', 'Move up', () => moveLayer(w.id, 1)), mk('▼', 'Move down', () => moveLayer(w.id, -1)), mk('⧉', 'Duplicate', () => duplicateWidget(w.id)));
      b.append(row1, row2); div.appendChild(b);
      container.appendChild(div);
    });
    const bgRow = document.createElement('div');
    bgRow.className = 'layer-item base-layer';
    const hasImg = Boolean(customBgImage);
    bgRow.innerHTML = '<div class="layer-left"><span style="font-size:12px">🖼️</span><span class="layer-name" style="color:var(--text-muted)">[Base] ' + (hasImg ? 'Custom BG Image' : 'Theme: ' + String(bgTheme).toUpperCase()) + '</span></div><div class="layer-actions">' + (hasImg ? '<button class="icon-btn del-btn" onclick="deleteBackgroundImage(); event.stopPropagation()">🗑️ Clear BG</button>' : '') + '</div>';
    container.appendChild(bgRow);
    lastSig = signature();
  }

  function signature() {
    const M = window.decompiledBinData;
    let st = ''; try { st = M && M.studio ? JSON.stringify(M.studio).length : ''; } catch (e) { /* ignore */ }
    return (typeof widgets === 'undefined' ? '' : widgets.map((w) => [w.id, w.spriteId, w.text, w.visible, w.locked, w.spriteCanvas ? w.spriteCanvas.width + 'x' + w.spriteCanvas.height : ''].join(':')).join('|')) + '#' + selectedWidgetId + '#' + st + '#' + (M ? M.sprites.filter((s) => s.edited).length : 0) + '#' + checked.size;
  }
  let lastSig = '';
  setInterval(() => { try { if (signature() !== lastSig) render(); } catch (e) { /* optional */ } }, 400);

  window.renderLayerList = render;
  HT37.layerView = { describe, render, setFilter: (k) => { filter = k; render(); }, KINDS, checked };
  setTimeout(() => { try { render(); } catch (e) { /* optional */ } }, 400);
})();
