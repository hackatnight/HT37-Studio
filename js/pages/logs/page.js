/**
 * @file     js/pages/logs/page.js
 * @layer    UI page
 * @summary  Registers tab "Tab 4: 📋 Logs" — filterable protocol log.
 *
 * ROLE
 *   - HT37.ui.registerPage({ id: "logs", order: 4 }). Layout: 2 columns: toolbox | full-height terminal.
 *   - Columns become element ids (…LeftCol / …CenterCol / …RightCol) that this page's mount files fill.
 *
 * REGISTERS
 *   - ui.registerPage(id:logs, order:4)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *
 * DOM IDS TOUCHED
 *   #tab4LogStatusTitle #tab4LogTerminal
 *
 * LOAD ORDER
 *   #44 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/pages/dfu/page.js   before: js/pages/studio/toolbox.js
 *
 * HOW TO EXTEND
 *   - To remove the tab, delete its <script> tags: its mounts are skipped automatically.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerPage({
  id: 'logs',
  tabId: 'tab-logs',
  navLabel: 'Tab 4: 📋 Logs',
  order: 4,
  layout: '2col',            // 'grid-3col' (left|center|right) or '2col' (left|center)
  columns: { 'left': 'logsLeftCol' },
  // HTML placed in the center column of this page (the left column is filled by this page's mounts)
  centerHTML: `
              <div style="display:flex; flex-direction:column; gap:8px; height:calc(100vh - 160px); box-sizing:border-box;">
                <div style="display:flex; justify-content:space-between; align-items:center; background:#111827; padding:8px 12px; border:1px solid #1e293b;">
                  <span id="tab4LogStatusTitle" style="font-size:12px; font-weight:700; color:#38bdf8;">📡 Live System & BLE Protocol Telemetry</span>
                  <div style="display:flex; gap:8px;">
                    <button type="button" class="dock-btn" onclick="copyAllLogs()" style="padding:4px 12px; font-size:11px; background:#1e293b; color:#e2e8f0; border:1px solid #334155; cursor:pointer;">📋 Copy All Logs</button>
                    <button type="button" class="dock-btn danger" onclick="clearLogs()" style="padding:4px 12px; font-size:11px; background:#ef4444; color:#fff; border:none; cursor:pointer;">🧹 Clear</button>
                  </div>
                </div>
                <div id="tab4LogTerminal" class="terminal" style="flex:1; min-height:420px; height:100%; overflow-y:auto; background:#070a12; border:1px solid #1e293b; padding:10px; font-family:monospace; font-size:11px; line-height:1.45;"></div>
              </div>
            </div>
  `,
});
