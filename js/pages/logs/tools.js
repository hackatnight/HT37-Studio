/**
 * @file     js/pages/logs/tools.js
 * @layer    UI mount
 * @summary  Tab 4 toolbox: copy / export / clear, category filters, text search.
 *
 * ROLE
 *   - Sets window.currentLogFilter via filterTab4Logs(mode) and re-renders with renderTab4Entries()
 *     (core/log.js). Search box: #tab4LogSearchInput.
 *
 * REGISTERS
 *   - ui.registerMount(id:logs.tools, page:logs, order:400)
 *
 * PROVIDES (globals)
 *   window. currentLogFilter, window. filterTab4Logs
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: ctx
 *   - js/core/log.js: clearLogs, copyAllLogs, logHistory, renderTab4Entries
 *
 * DOM IDS TOUCHED
 *   #btnTab4ClearLogs #btnTab4CopyLogs #btnTab4ExportLogs #logsLeftCol #logsToolboxWindow #tab4LogSearchInput
 *
 * LOAD ORDER
 *   #56 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/pages/dfu/tools.js   before: js/pages/studio/stage.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerMount({
  id: 'logs.tools',
  page: 'logs',
  order: 400,
  title: 'Logs toolbox: 0. Actions & Export, 1. Category Filters, 2. Search & Highlight',
  run(ctx) {
    const { makeToolCard } = ctx;
    const logsLeftCol = document.getElementById('logsLeftCol');
    if (logsLeftCol && !document.getElementById('logsToolboxWindow')) {
      const logsToolbox = document.createElement('div');
      logsToolbox.id = 'logsToolboxWindow';
      logsToolbox.className = 'unified-toolbox-window';
      logsLeftCol.appendChild(logsToolbox);

      // TOOL 0: Actions & File Export
      const body0L = document.createElement('div');
      body0L.style.cssText = 'display:flex; flex-direction:column; gap:6px;';
      body0L.innerHTML = `
          <button type="button" id="btnTab4CopyLogs" class="dock-btn" style="width:100% !important; padding:6px 8px !important; font-size:11px !important;">📋 Copy All Logs</button>
          <button type="button" id="btnTab4ExportLogs" class="dock-btn" style="width:100% !important; padding:6px 8px !important; font-size:11px !important; color:#38bdf8 !important;">💾 Download Logs (.txt)</button>
          <button type="button" id="btnTab4ClearLogs" class="dock-btn danger" style="width:100% !important; padding:6px 8px !important; font-size:11px !important; background:#ef4444 !important; color:#fff !important;">🧹 Clear Logs</button>
        `;
      body0L.querySelector('#btnTab4CopyLogs').onclick = () => copyAllLogs();
      body0L.querySelector('#btnTab4ClearLogs').onclick = () => clearLogs();
      body0L.querySelector('#btnTab4ExportLogs').onclick = () => {
        const blob = new Blob([logHistory.join('\n')], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `ht37_ble_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        a.click();
      };
      const card0L = makeToolCard('0', 'Log Actions & Export', body0L);
      if (card0L) logsToolbox.appendChild(card0L);

      // TOOL 1: Category Filters
      const body1L = document.createElement('div');
      body1L.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:6px;';
      const filterDefs = [
        { label: '🌐 All Logs', filter: 'all' },
        { label: '🔵 BLE RX', filter: 'rx' },
        { label: '🟢 BLE TX', filter: 'tx' },
        { label: '⚠️ Warn / Err', filter: 'err' },
        { label: '✨ OTA OK', filter: 'ok' }
      ];

      window.currentLogFilter = 'all';
      window.filterTab4Logs = function(mode) {
        window.currentLogFilter = mode;
        if (typeof renderTab4Entries === 'function') renderTab4Entries();
        body1L.querySelectorAll('button').forEach(btn => {
          const isActive = (btn.dataset.filter === mode);
          btn.style.borderColor = isActive ? '#38bdf8' : '#334155';
          btn.style.color = isActive ? '#38bdf8' : '#e2e8f0';
          btn.style.background = isActive ? '#0c2438' : '#1e293b';
        });
      };filterDefs.forEach(fd => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dock-btn';
        btn.dataset.filter = fd.filter;
        btn.textContent = fd.label;
        btn.style.cssText = 'width:100% !important; padding:5px 6px !important; font-size:11px !important;';
        if (fd.filter === 'all') { btn.style.borderColor = '#38bdf8'; btn.style.color = '#38bdf8'; }
        btn.onclick = () => window.filterTab4Logs(fd.filter);
        body1L.appendChild(btn);
      });
      const card1L = makeToolCard('1', 'Category Filters', body1L);
      if (card1L) logsToolbox.appendChild(card1L);

      // TOOL 2: Search & Highlight
      const body2L = document.createElement('div');
      body2L.style.cssText = 'display:flex; flex-direction:column; gap:6px;';
      body2L.innerHTML = `
          <input type="text" id="tab4LogSearchInput" placeholder="Filter by text (e.g. 0x02, OTA)..." style="width:100% !important; height:28px !important; background:#111827 !important; color:#38bdf8 !important; border:1px solid #334155 !important; font-size:11px !important; padding:4px 8px !important; box-sizing:border-box !important;" />
        `;
      const sInput = body2L.querySelector('#tab4LogSearchInput');
      sInput.oninput = () => {
        if (typeof renderTab4Entries === 'function') renderTab4Entries();
      };const card2L = makeToolCard('2', 'Text Search & Filter', body2L);
      if (card2L) logsToolbox.appendChild(card2L);
    }
  }
});
