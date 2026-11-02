/**
 * @file     js/editor/explore.js
 * @layer    Editor / UI
 * @summary  "Explore" tab: browse the vendor's watch face catalog (the same list the FitCloudPro app's dial page shows), see every detail the server gives, decode a downloaded .bin and open it in the editor.
 *
 * ROLE
 *   - The face list comes from POST https://fitcloud.hetangsmart.com/public/dial/list with form fields hardwareInfo, lcd, toolVersion (found in the FitCloudPro 2.6.6 app; browsers may call it, CORS is open).
 *   - The .bin files themselves cannot be fetched by a page (no CORS), so each face has a Download link; drop the downloaded file back on this tab to decode it (widget table, touch zones, animations) and open it in the editor.
 *   - Adds its own tab button and pane at run time (no page registry entry needed).
 *
 * DOM IDS TOUCHED
 *   #studioTabNav #studioMainContainer #decompBinFileInput #btnDecompAutoAssemble
 *
 * LOAD ORDER
 *   after js/editor/units.js (last editor script)
 */
(function () {
  'use strict';
  const API = 'https://fitcloud.hetangsmart.com/public/dial/list';
  const TYPE_NAMES = { 0: 'background', 1: 'hand', 2: 'number', 3: 'number', 4: 'sprite set', 5: 'gauge', 6: 'icon/preview', 7: 'animation', 8: 'touch zone', 9: 'full-screen entry' };
  const NUM2 = { 0: 'time HH:MM', 1: 'day of month', 2: 'hour', 3: 'minute', 4: 'seconds', 5: 'colon', 6: 'hour tens (probable)', 7: 'hour ones (probable)', 8: 'minute tens (probable)', 9: 'minute ones (probable)', 13: 'date MM/DD', 16: 'full date', 19: 'year', 20: 'month (probable)', 23: 'day tens (probable)', 24: 'day ones (probable)' };
  const NUM3 = { 0: 'steps', 1: 'steps digit (probable)', 2: 'steps digit (probable)', 3: 'steps digit (probable)', 4: 'steps digit (probable)', 5: 'steps digit (probable)', 6: 'distance', 7: 'kcal', 8: 'heart rate', 9: 'blood pressure (sys/dia)', 10: 'blood oxygen', 11: 'temperature', 15: 'battery %' };
  const SET4 = { 0: 'weekday', 6: 'AM/PM' };
  const TOUCH = { 3: 'blood oxygen', 6: 'messages', 7: 'sleep (moon)', 16: 'phone', 17: 'symbol (bottom right)' };
  let faces = [], shown = 60, sel = null, loaded = false, busy = false;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(2) + ' MB' : (n / 1024).toFixed(1) + ' KB');

  function widgetName(t, s) {
    if (t === 2) return NUM2[s] || 'number (unknown)';
    if (t === 3) return NUM3[s] || 'number (unknown)';
    if (t === 4) return SET4[s] || 'sprite set (frame by value)';
    if (t === 8) return TOUCH[s] ? 'opens: ' + TOUCH[s] : 'opens app #' + s;
    if (t === 1) return s === 6 ? 'hour hand' : s === 7 ? 'minute hand' : s === 8 ? 'second hand' : 'hand';
    if (t === 6) return s === 1 ? 'preview image' : s === 2 ? 'weather icon' : 'icon';
    return '';
  }

  /** Reads the TBUI tables of a face .bin (no rendering). */
  function summarize(buf) {
    const d = new DataView(buf), u = new Uint8Array(buf), B = 0x400;
    if (u.length < B + 0x60 || String.fromCharCode(...u.slice(0, 7)) !== 'TOPSTEP') throw new Error('not a TOPSTEP face file');
    const out = { size: u.length, dial: d.getUint32(B + 8, true) - 16777216, w: d.getUint16(B + 0x20, true), h: d.getUint16(B + 0x22, true), widgets: [], sprites: [] };
    const wo = d.getUint32(B + 0x40, true), wc = d.getUint16(B + 0x44, true), ws = d.getUint16(B + 0x46, true);
    const so = d.getUint32(B + 0x48, true), sc = d.getUint16(B + 0x4c, true), ss = d.getUint16(B + 0x4e, true);
    for (let i = 0; i < sc; i++) { const o = B + so + i * ss; out.sprites.push({ w: d.getUint16(o + 4, true), h: d.getUint16(o + 6, true) }); }
    for (let i = 0; i < wc; i++) {
      const o = B + wo + i * ws, t = u[o + 1], s = u[o + 3], x = d.getUint16(o + 4, true), y = d.getUint16(o + 6, true);
      const wd = { i, t, s, x, y, a: d.getUint16(o + 12, true) };
      if (t === 8) { wd.w = d.getUint16(o + 8, true); wd.h = d.getUint16(o + 10, true); }
      if (t === 7) { wd.n = u[o + 16]; wd.timing = d.getUint16(o + 14, true); }
      out.widgets.push(wd);
    }
    return out;
  }

  function css() {
    if ($('exploreCss')) return;
    const st = document.createElement('style'); st.id = 'exploreCss';
    st.textContent = '#tab-explore .xp-wrap{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(320px,1fr);gap:12px;padding:12px;height:calc(100vh - 340px);min-height:380px;box-sizing:border-box}' +
      '#tab-explore .xp-col{background:#111827;border:1px solid #1e293b;border-radius:8px;display:flex;flex-direction:column;min-height:0}' +
      '#tab-explore .xp-bar{display:flex;flex-wrap:wrap;gap:6px;padding:8px;border-bottom:1px solid #1e293b;align-items:center}' +
      '#tab-explore input,#tab-explore select{background:#0b1220;color:#e2e8f0;border:1px solid #334155;border-radius:4px;font-size:11px;padding:4px 6px;height:26px;box-sizing:border-box}' +
      '#tab-explore .xp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;padding:8px;overflow:auto}' +
      '#tab-explore .xp-card{background:#0b1220;border:1px solid #1e293b;border-radius:8px;padding:6px;cursor:pointer;text-align:center;font-size:10px;color:#94a3b8}' +
      '#tab-explore .xp-card:hover,#tab-explore .xp-card.on{border-color:#38bdf8;color:#e2e8f0}' +
      '#tab-explore .xp-card img{width:100%;aspect-ratio:1;object-fit:contain;border-radius:50%;background:#000}' +
      '#tab-explore .xp-det{padding:10px;overflow:auto;font-size:12px;color:#cbd5e1}' +
      '#tab-explore table{border-collapse:collapse;width:100%;font-size:11px}#tab-explore td,#tab-explore th{border-bottom:1px solid #1e293b;padding:3px 6px;text-align:left;vertical-align:top}' +
      '#tab-explore th{color:#94a3b8;font-weight:700;width:38%}' +
      '#tab-explore .xp-btn{background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:4px;font-size:11px;padding:5px 9px;cursor:pointer;text-decoration:none;display:inline-block}' +
      '#tab-explore .xp-btn:hover{border-color:#38bdf8}' +
      '#tab-explore .xp-drop{border:1px dashed #475569;border-radius:6px;padding:10px;text-align:center;color:#94a3b8;font-size:11px;margin:8px 0}' +
      '#tab-explore .xp-drop.over{border-color:#38bdf8;color:#e2e8f0}' +
      '#tab-explore .xp-msg{color:#94a3b8;font-size:11px;padding:6px 8px}' +
      '@media (max-width:900px){#tab-explore .xp-wrap{grid-template-columns:1fr;height:auto}}';
    document.head.appendChild(st);
  }

  function paneHTML() {
    return '<div class="xp-wrap"><div class="xp-col"><div class="xp-bar">' +
      '<input id="xpSearch" placeholder="Search name or number" style="flex:1;min-width:120px">' +
      '<select id="xpSort"><option value="new">Newest</option><option value="dl">Most downloaded</option><option value="small">Smallest file</option><option value="big">Largest file</option><option value="num">Face number</option></select>' +
      '<label style="font-size:11px;color:#94a3b8"><input type="checkbox" id="xpComp"> with components only</label>' +
      '<button class="xp-btn" id="xpReload" type="button">⟳ Reload list</button><button class="xp-btn" id="xpAll" type="button" style="background:#7f1d1d;border-color:#ef4444;color:#fee2e2" title="Warning: downloads EVERY face in the current list, one at a time (about 2 seconds each). This can take a long time and puts hundreds of .bin files in your Downloads folder.">⬇ Download all</button></div>' +
      '<div class="xp-bar" style="border-bottom:1px solid #1e293b"><span style="font-size:10px;color:#64748b">Request sent to the vendor server (the same three fields the app sends):</span>' +
      '<input id="xpHw" title="hardwareInfo" style="width:130px"><input id="xpLcd" title="lcd" style="width:40px"><input id="xpTool" title="toolVersion" style="width:50px"></div>' +
      '<div class="xp-msg" id="xpMsg">Opening this tab loads the catalog.</div><div class="xp-grid" id="xpGrid"></div></div>' +
      '<div class="xp-col"><div class="xp-det" id="xpDet"><div class="xp-msg">Pick a face to see its details.</div></div></div></div>';
  }

  function visible() {
    const q = ($('xpSearch').value || '').trim().toLowerCase(), so = $('xpSort').value, comp = $('xpComp').checked;
    let a = faces.filter((f) => (!q || (f.name + ' ' + f.dialNum).toLowerCase().includes(q)) && (!comp || f.hasComponent));
    const cmp = { new: (x, y) => String(y.createTime).localeCompare(String(x.createTime)), dl: (x, y) => y.downloadCount - x.downloadCount, small: (x, y) => x.binSize - y.binSize, big: (x, y) => y.binSize - x.binSize, num: (x, y) => x.dialNum - y.dialNum }[so];
    return a.sort(cmp);
  }

  function renderGrid() {
    const a = visible(), g = $('xpGrid');
    $('xpMsg').textContent = faces.length ? a.length + ' of ' + faces.length + ' faces' : $('xpMsg').textContent;
    g.innerHTML = a.map((f) => '<div class="xp-card' + (sel && sel.id === f.id ? ' on' : '') + '" data-id="' + f.id + '"><img loading="lazy" referrerpolicy="no-referrer" src="' + esc(f.imgUrl) + '" alt=""><div>' + esc(f.dialNum) + '</div><div>' + kb(f.binSize) + ' · ⬇' + f.downloadCount + '</div></div>').join('');
  }

  function row(k, v) { return '<tr><th>' + esc(k) + '</th><td>' + v + '</td></tr>'; }

  function renderDetail() {
    const f = sel, d = $('xpDet'); if (!f) return;
    const di = window.HT37_deviceInfo || {};
    let comps = '';
    if (f.hasComponent) { try { comps = '<pre style="white-space:pre-wrap;font-size:10px;color:#94a3b8">' + esc(typeof f.componentsRaw === 'string' ? f.componentsRaw.slice(0, 1200) : JSON.stringify(f.components || f.componentsRaw).slice(0, 1200)) + '</pre>'; } catch (e) { comps = ''; } }
    d.innerHTML = '<div style="display:flex;gap:10px;align-items:flex-start"><img referrerpolicy="no-referrer" src="' + esc(f.imgUrl || f.previewImgUrl || f.deviceImgUrl) + '" data-alt="' + esc(f.deviceImgUrl || f.previewImgUrl) + '" onerror="if(this.dataset.alt&&this.src!==this.dataset.alt){this.src=this.dataset.alt}" style="width:170px;height:170px;object-fit:contain;background:#000;border-radius:50%"><div><div style="font-size:15px;font-weight:700;color:#e2e8f0">' + esc(f.name) + '</div><div style="color:#94a3b8">face #' + esc(f.dialNum) + '</div>' +
      '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><a class="xp-btn" href="' + esc(f.binUrl) + '" target="_blank" rel="noopener" download="HT37_face_' + esc(f.dialNum) + '.bin">⬇ Download .bin</a><button class="xp-btn" type="button" id="xpCopy">Copy address</button></div></div></div>' +
      '<table style="margin-top:10px">' + row('Face number', esc(f.dialNum)) + row('Platform / chip', esc(f.platform) + ' (' + esc(f.type) + ')') + row('Screen type (lcd)', esc(f.lcd) + ' = 360×360 round') + row('Face tool version', esc(f.toolVersion)) +
      row('Your watch', esc((di.project ? 'project ' + di.project + ', firmware v' + di.fw : 'connect the watch to show its project/firmware'))) + row('Face file version', esc(f.binVersion)) + row('File size', kb(f.binSize) + ' (' + f.binSize + ' bytes)') + row('Downloads', esc(f.downloadCount)) + row('Published', esc(f.createTime)) + row('Creator', esc(f.creatorId)) + row('Customer', esc(f.customer)) +
      row('Has components', f.hasComponent ? 'yes' : 'no') + (f.relatedProject ? row('Related project', esc(JSON.stringify(f.relatedProject))) : '') + row('Record id', esc(f.id)) + row('File address', '<span style="word-break:break-all;font-size:10px">' + esc(f.binUrl) + '</span>') + '</table>' + comps +
      '<div class="xp-drop" id="xpDrop">After downloading, drop the .bin here (or <label style="color:#38bdf8;cursor:pointer;text-decoration:underline">choose it<input id="xpFile" type="file" accept=".bin" style="display:none"></label>) to decode it.</div><div id="xpDecoded"></div>';
    $('xpCopy').onclick = () => { try { navigator.clipboard.writeText(f.binUrl); } catch (e) {} };
    const drop = $('xpDrop');
    ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { const fl = e.dataTransfer.files[0]; if (fl) decode(fl); });
    $('xpFile').onchange = (e) => { if (e.target.files[0]) decode(e.target.files[0]); };
  }

  async function decode(file) {
    const box = $('xpDecoded');
    try {
      const buf = await file.arrayBuffer(), S = summarize(buf);
      const cnt = {}; S.widgets.forEach((w) => { const k = TYPE_NAMES[w.t] || ('type ' + w.t); cnt[k] = (cnt[k] || 0) + 1; });
      const match = sel && S.dial === sel.dialNum ? '<span style="color:#34d399">matches the selected face</span>' : '<span style="color:#f59e0b">face number ' + S.dial + ' differs from the selection</span>';
      box.innerHTML = '<div style="font-weight:700;color:#e2e8f0;margin:6px 0">Decoded ' + esc(file.name) + '</div><div>' + match + ' · ' + kb(S.size) + ' · ' + S.w + '×' + S.h + ' · ' + S.sprites.length + ' sprites · ' + S.widgets.length + ' widgets</div>' +
        '<div style="margin:6px 0;color:#94a3b8">' + Object.keys(cnt).map((k) => cnt[k] + ' × ' + k).join(', ') + '</div>' +
        '<table><tr><th>#</th><th>type / sub</th><th>meaning</th><th>where</th></tr>' + S.widgets.map((w) => '<tr><td>' + w.i + '</td><td>' + w.t + '/' + w.s + '</td><td>' + esc((TYPE_NAMES[w.t] || '') + (widgetName(w.t, w.s) ? ': ' + widgetName(w.t, w.s) : '')) + '</td><td>' + (w.t === 8 ? w.x + ',' + w.y + ' ' + w.w + '×' + w.h : w.t === 7 ? 'frames ' + w.a + '..' + (w.a + w.n - 1) + ' timing ' + w.timing : w.x + ',' + w.y) + '</td></tr>').join('') + '</table>' +
        '<div style="margin-top:8px"><button class="xp-btn" type="button" id="xpOpen">✎ Open in the editor</button> <span style="font-size:11px;color:#64748b">Then use Flash to Watch yourself.</span></div>';
      $('xpOpen').onclick = () => openInEditor(file);
    } catch (e) { box.innerHTML = '<div class="xp-msg" style="color:#f87171">Could not decode: ' + esc(e.message) + '</div>'; }
  }

  function openInEditor(file) {
    const input = $('decompBinFileInput'); if (!input) return;
    const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    let n = 0; const go = () => { const a = $('btnDecompAutoAssemble'); if (window.decompiledBinData && window.decompiledBinData.fileName === file.name && a) { a.click(); const b = document.querySelector('.studio-tab-btn'); if (b) b.click(); } else if (++n < 60) setTimeout(go, 100); }; go();
  }

  async function load() {
    if (busy) return; busy = true; $('xpMsg').textContent = 'Asking the vendor server…';
    try {
      const body = new URLSearchParams({ hardwareInfo: $('xpHw').value.trim(), lcd: $('xpLcd').value.trim(), toolVersion: $('xpTool').value.trim() });
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const j = await r.json();
      if (j.errorCode !== 0 && j.errorCode !== undefined) throw new Error(j.errorMsg || ('error ' + j.errorCode));
      faces = (j.data || []).map((f) => Object.assign({ binSize: 0, downloadCount: 0 }, f)); loaded = true; shown = 60; sel = null; renderGrid();
      if (typeof log === 'function') log('🧭 Explore: loaded ' + faces.length + ' vendor faces', 'ok');
    } catch (e) { $('xpMsg').textContent = 'Could not load the list: ' + e.message; }
    busy = false;
  }

  function mount(n) {
    const nav = $('studioTabNav'), cont = $('studioMainContainer');
    if (!nav || !cont || !nav.children.length) { if (n < 100) setTimeout(() => mount(n + 1), 100); return; }
    if ($('tab-explore')) return;
    css();
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'studio-tab-btn'; btn.dataset.tab = 'tab-explore'; btn.textContent = 'Tab 5: 🧭 Explore'; nav.appendChild(btn);
    const pane = document.createElement('div'); pane.id = 'tab-explore'; pane.className = 'studio-tab-pane'; pane.innerHTML = paneHTML(); cont.appendChild(pane);
    $('xpHw').value = (window.HT37_deviceInfo && window.HT37_deviceInfo.project) || '000000008545'; $('xpLcd').value = '3'; $('xpTool').value = '1.5';
    $('xpSearch').oninput = () => { shown = 60; renderGrid(); }; $('xpSort').onchange = () => { shown = 60; renderGrid(); }; $('xpComp').onchange = () => { shown = 60; renderGrid(); };
    $('xpReload').onclick = load;
    $('xpAll').onclick = async () => {
      const a = visible(); if (!a.length) return;
      const tot = a.reduce((n, f) => n + (f.binSize || 0), 0);
      if (!confirm('This might take a long time and generate a lot of files in your Downloads folder.\n\nDownload ' + a.length + ' face files (' + kb(tot) + ')?\n\nYes = OK, No = Cancel. Your browser may also ask to allow multiple downloads.')) return;
      for (let i = 0; i < a.length; i++) {
        const l = document.createElement('a'); l.href = a[i].binUrl; l.download = 'HT37_face_' + a[i].dialNum + '.bin'; l.rel = 'noopener'; document.body.appendChild(l); l.click(); l.remove();
        $('xpMsg').textContent = 'Downloading ' + (i + 1) + ' of ' + a.length + '…'; await new Promise((r) => setTimeout(r, 2000));
      }
      $('xpMsg').textContent = 'Started ' + a.length + ' downloads. Check your Downloads folder.';
    };
    $('xpGrid').addEventListener('click', (e) => {
      const c = e.target.closest('.xp-card'); if (!c) return; sel = faces.find((f) => String(f.id) === c.dataset.id); renderGrid(); renderDetail();
    });
    btn.addEventListener('click', () => { if (!loaded) load(); });
    try { if (localStorage.getItem('ht37_active_tab') === 'tab-explore') btn.click(); } catch (e) {}
  }
  setTimeout(() => mount(0), 800);
  window.HT37 = window.HT37 || {}; HT37.explore = { summarize, load };
})();
