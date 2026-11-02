/**
 * @file     js/pages/studio/page.js
 * @layer    UI page
 * @summary  Registers tab "Tab 1: 🎨 Watch Studio" — the watch face editor.
 *
 * ROLE
 *   - HT37.ui.registerPage({ id: "studio", order: 1 }). Layout: 3 columns: toolbox | WYSIWYG stage | right
 *     inspector/vault.
 *   - Columns become element ids (…LeftCol / …CenterCol / …RightCol) that this page's mount files fill.
 *
 * REGISTERS
 *   - ui.registerPage(id:studio, order:1)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *
 * LOAD ORDER
 *   #41 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/ui/shell.js   before: js/pages/alerts/page.js
 *
 * HOW TO EXTEND
 *   - To remove the tab, delete its <script> tags: its mounts are skipped automatically.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerPage({
  id: 'studio',
  tabId: 'tab-studio',
  navLabel: 'Tab 1: 🎨 Watch Studio',
  order: 1,
  layout: 'grid-3col',            // 'grid-3col' (left|center|right) or '2col' (left|center)
  columns: { 'left': 'studioLeftCol', 'center': 'studioCenterCol', 'right': 'studioRightCol' },
});
