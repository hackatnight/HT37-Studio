/**
 * @file     js/editor/widget-options.js
 * @layer    Editor UI (inspector extension)
 * @summary  Shows the options of the selected layer's widget type in the Selected Layer Inspector. A widget type opts in by defining
 *           `controls: [{ key, label, type: 'select'|'range'|'color'|'checkbox', options, min, max, step, num }]` and (optionally) `note`;
 *           values live in layer.opts[key]. Rebuilt only when the selection changes, so dragging a slider keeps focus.
 * API  HT37.widgetOptions = { render }
 */
(function () {
  window.HT37 = window.HT37 || {};
  let lastKey = '';
  function box() {
    let b = document.getElementById('wOptBox'); if (b) return b;
    const body = document.getElementById('inspectorBody'); if (!body) return null;
    b = document.createElement('div'); b.id = 'wOptBox'; b.style.cssText = 'display:none;flex:1 1 100%;width:100%;box-sizing:border-box;border-top:1px solid #334155;margin-top:4px;padding-top:6px;flex-wrap:wrap;gap:6px 18px;align-items:center'; // wide, short grid so the watch stays visible
    body.appendChild(b); return b;
  }
  function render() {
    const b = box(); if (!b) return;
    const w = (typeof widgets !== 'undefined' ? widgets : []).find((x) => x.id === selectedWidgetId), def = w && HT37.widgets.get(w.type);
    ['propScale', 'propOpacity'].forEach((id) => { const r = document.getElementById(id) && document.getElementById(id).closest('.field-row'); if (r) r.style.display = (def && def.hw) ? 'none' : ''; }); // the watch cannot scale or fade its widgets
    if (!w || !def || !def.controls) { b.style.display = 'none'; lastKey = ''; return; }
    const key = w.id + '|' + w.type; if (key === lastKey) return; lastKey = key;
    if (!w.opts) w.opts = JSON.parse(JSON.stringify((def.defaults && def.defaults.opts) || {}));
    b.style.display = 'flex'; b.innerHTML = '';
    const head = document.createElement('div'); head.style.cssText = 'flex:1 1 100%;font-size:11px;font-weight:700;color:#7dd3fc'; head.textContent = def.label + ' options'; b.appendChild(head);
    def.controls.forEach((c) => {
      const row = document.createElement('div'); row.className = 'field-row'; row.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin:0;flex:0 0 auto'; const lab = document.createElement('label'); lab.textContent = c.label; lab.style.cssText = 'font-size:10px;color:#94a3b8;white-space:nowrap;margin:0'; row.appendChild(lab);
      let el;
      if (c.type === 'select') { el = document.createElement('select'); c.options.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; el.appendChild(o); }); }
      else if (c.type === 'text') { el = document.createElement('input'); el.type = 'text'; el.placeholder = c.placeholder || ''; }
      else { el = document.createElement('input'); el.type = c.type === 'checkbox' ? 'checkbox' : c.type === 'color' ? 'color' : 'range'; if (c.type === 'range') { el.min = c.min; el.max = c.max; el.step = c.step || 1; } }
      if (c.type === 'checkbox') el.checked = !!w.opts[c.key]; else el.value = w.opts[c.key];
      if (c.previewFonts && HT37.fonts) { // each entry is shown in its own typeface (fonts load from Google Fonts on first use)
        const fam = (f) => (f === 'system' ? '"Segoe UI", Arial, sans-serif' : '"' + f + '", sans-serif');
        const opts = Array.from(el.options); opts.forEach((o) => { o.style.fontFamily = fam(o.value); o.style.fontSize = '15px'; });
        (async () => { for (const o of opts) { if (o.value !== 'system') await HT37.fonts.load(o.value); } })(); // one at a time, in the background
        const sync = () => { el.style.fontFamily = fam(el.value); }; sync(); el.addEventListener('change', sync);
      }
      const apply = () => { const v = c.type === 'checkbox' ? el.checked : (c.type === 'range' || c.num) ? Number(el.value) : el.value; w.opts[c.key] = v; if (typeof def.onOptions === 'function') def.onOptions(w); if (typeof updateHwCoordHud === 'function') updateHwCoordHud(); };
      el.style.cssText = c.type === 'color' ? 'width:34px;height:22px;padding:0' : c.type === 'range' ? 'width:96px' : c.type === 'text' ? 'width:130px' : 'width:auto;max-width:170px'; el.addEventListener('input', apply); el.addEventListener('change', apply); row.appendChild(el); b.appendChild(row);
    });
    if (def.note) { const n = document.createElement('div'); n.style.cssText = 'flex:1 1 100%;font-size:10px;color:#94a3b8'; n.textContent = def.note; b.appendChild(n); }
  }
  const prev = window.syncInspector;
  window.syncInspector = function () { const r = prev.apply(this, arguments); try { render(); } catch (e) { console.error(e); } return r; };
  HT37.widgetOptions = { render, reset: () => { lastKey = ''; } };
})();
