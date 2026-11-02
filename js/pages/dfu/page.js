/**
 * @file     js/pages/dfu/page.js
 * @layer    UI page
 * @summary  Registers tab "Tab 3: ⚡ Flash to Watch" — OTA flashing controls.
 *
 * ROLE
 *   - HT37.ui.registerPage({ id: "dfu", order: 3 }). Layout: 2 columns: toolbox | info panel.
 *   - Columns become element ids (…LeftCol / …CenterCol / …RightCol) that this page's mount files fill.
 *
 * REGISTERS
 *   - ui.registerPage(id:dfu, order:3)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *
 * LOAD ORDER
 *   #43 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/pages/alerts/page.js   before: js/pages/logs/page.js
 *
 * HOW TO EXTEND
 *   - To remove the tab, delete its <script> tags: its mounts are skipped automatically.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerPage({
  id: 'dfu',
  tabId: 'tab-dfu',
  navLabel: 'Tab 3: ⚡ Flash to Watch',
  order: 3,
  layout: '2col',            // 'grid-3col' (left|center|right) or '2col' (left|center)
  columns: { 'left': 'dfuLeftCol' },
  // HTML placed in the center column of this page (the left column is filled by this page's mounts)
  centerHTML: `
              <div class="stage-info-panel">
                <div style="font-size:12px; font-weight:700; color:#38bdf8; text-transform:uppercase;">
                  ⚡ TopStep HT37 Flash to Watch (Hardware OTA Engine)
                </div>
                <div style="font-size:11px; color:#64748b;">
                  Trigger White Arrow upload mode (FFB1) or probe step 2 to flash custom watch face dials (.bin) and firmware updates directly over Web Bluetooth.
                </div>
              </div>
  `,
});
