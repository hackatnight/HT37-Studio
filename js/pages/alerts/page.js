/**
 * @file     js/pages/alerts/page.js
 * @layer    UI page
 * @summary  Registers tab "Tab 2: 🩺 Diagnostics" — alerts, weather, dial slots and the master command station.
 *
 * ROLE
 *   - HT37.ui.registerPage({ id: "alerts", order: 2 }). Layout: 2 columns: toolbox | info panel.
 *   - Columns become element ids (…LeftCol / …CenterCol / …RightCol) that this page's mount files fill.
 *
 * REGISTERS
 *   - ui.registerPage(id:alerts, order:2)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *
 * LOAD ORDER
 *   #42 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/pages/studio/page.js   before: js/pages/dfu/page.js
 *
 * HOW TO EXTEND
 *   - To remove the tab, delete its <script> tags: its mounts are skipped automatically.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerPage({
  id: 'alerts',
  tabId: 'tab-alerts',
  navLabel: 'Tab 2: 🩺 Diagnostics',
  order: 2,
  layout: '2col',            // 'grid-3col' (left|center|right) or '2col' (left|center)
  columns: { 'left': 'alertsLeftCol' },
  // HTML placed in the center column of this page (the left column is filled by this page's mounts)
  centerHTML: `
              <div class="stage-info-panel">
                <div style="font-size:12px; font-weight:700; color:#38bdf8; text-transform:uppercase;">
                  📡 Real-Time Command & Alert Telemetry
                </div>
                <div style="font-size:11px; color:#64748b;">
                  Select any tool on the left toolbox to dispatch telephony alerts, app notifications, weather telemetry, or custom BLE commands.
                </div>
              </div>
  `,
});
