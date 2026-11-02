/**
 * @file     js/ui/pool-generators.js
 * @layer    UI framework
 * @summary  Fills the placeholder containers in the HTML pool from the registries.
 *
 * ROLE
 *   - Generates: .widget-card tiles → #widgetCardGrid (HT37.widgets), #quickAddSelect, #propFwId, alert buttons
 *     → #alertButtonGrid and the #extraAlertKey dropdown (HT37.commands with `ui` + HT37.reservedAlertKeys).
 *   - Runs while the page loads, i.e. BEFORE the shell moves pool elements into tabs.
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *
 * DOM IDS TOUCHED
 *   #alertButtonGrid #extraAlertKey #propFwId #quickAddSelect #widgetCardGrid
 *
 * LOAD ORDER
 *   #39 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/boot.js   before: js/ui/shell.js
 *
 * HOW TO EXTEND
 *   - A new registry-backed list = add a placeholder id in index.html and one block here.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
// Fills the placeholder containers in index.html's HTML "pool" from the registries.
// Runs while the page is still loading — BEFORE the shell adopts pool elements into tabs at DOMContentLoaded.
(function () {
  const $ = (id) => document.getElementById(id);
  const hex2 = (n, upper) => { const s = n.toString(16).padStart(2, '0'); return upper ? s.toUpperCase() : s; };

  // 1. "Add Widget Layer" cards  <- HT37.widgets
  const grid = $('widgetCardGrid');
  if (grid) {
    grid.insertAdjacentHTML('beforeend', HT37.widgets.list().map((d) =>
      '<div class="widget-card" onclick="addWidget(\'' + d.type + '\')"' + (d.cardSpan === 2 ? ' style="grid-column:span 2;"' : '') + '>' +
      '<div class="w-top"><span class="w-icon">' + d.icon + '</span><span class="w-add-badge">+ LAYER</span></div>' +
      '<span class="w-name">' + d.label + '</span><span class="w-desc">' + d.desc + '</span></div>').join(''));
  }

  // 2. Quick-add dropdown  <- HT37.widgets (sorted by quickAdd.order)
  const quick = $('quickAddSelect');
  if (quick) {
    quick.innerHTML = HT37.widgets.list().slice().sort((a, b) => a.quickAdd.order - b.quickAdd.order)
      .map((d) => '<option value="' + d.type + '">' + d.quickAdd.label + '</option>').join('');
  }

  // 3. Firmware widget-id dropdown  <- HT37.widgets (unique ids, ascending)
  const fw = $('propFwId');
  if (fw) {
    const seen = new Map();
    HT37.widgets.list().forEach((d) => { if (!seen.has(d.fw.id)) seen.set(d.fw.id, d.fw.label); });
    fw.innerHTML = [...seen.entries()].sort((a, b) => parseInt(a[0], 16) - parseInt(b[0], 16))
      .map(([id, label]) => '<option value="' + id + '">' + id + ' - ' + label + '</option>').join('');
  }

  // 4. Alert buttons (04/xx)  <- HT37.commands entries that carry a `ui` block
  const alertGrid = $('alertButtonGrid');
  const alerts = HT37.commands.filter((c) => c.cmd === 0x04 && c.ui);
  if (alertGrid) {
    alertGrid.insertAdjacentHTML('afterbegin', alerts.map((c) =>
      '<button' + (c.ui.cls ? ' class="' + c.ui.cls + '"' : '') + ' onclick="sendWatchAlert(\'' + c.id + '\')">' +
      c.ui.icon + ' ' + c.ui.btn + ' (04/' + hex2(c.key, true) + ')</button>').join('\n'));
  }

  // 5. "Send Icon" dropdown: every 0x04 key, verified ones from the registry + reserved ones
  const extra = $('extraAlertKey');
  if (extra) {
    const rows = alerts.map((c) => ({ key: c.key, html: c.ui.optIcon + ' 04/' + hex2(c.key, true) + ' - ' + c.ui.opt, sel: !!c.ui.selected }))
      .concat(HT37.reservedAlertKeys.map((r) => ({ key: parseInt(r.key, 16), html: r.icon + ' 04/' + hex2(parseInt(r.key, 16), true) + ' - ' + r.label, sel: false })))
      .sort((a, b) => a.key - b.key);
    extra.innerHTML = rows.map((r) => '<option value="0x' + hex2(r.key, false) + '"' + (r.sel ? ' selected' : '') + '>' + r.html + '</option>').join('');
  }
})();
