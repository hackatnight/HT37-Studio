/**
 * @file     js/pages/studio/toolbox.js
 * @layer    UI mount
 * @summary  Creates the empty left toolbox window #studioToolboxWindow for Tab 1.
 *
 * ROLE
 *   - Hands { studioToolbox } to tools 0-3 through ctx.shared.
 *
 * REGISTERS
 *   - ui.registerMount(id:studio.toolbox, page:studio, order:100)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: ctx
 *
 * DOM IDS TOUCHED
 *   #studioToolboxWindow
 *
 * LOAD ORDER
 *   #45 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/pages/logs/page.js   before: js/pages/studio/tool-0-canvas-layers.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerMount({
  id: 'studio.toolbox',
  page: 'studio',
  order: 100,
  title: 'Creates the empty left toolbox window (#studioToolboxWindow) that tools 0-3 fill',
  run(ctx) {
    const { studioLeft } = ctx;
    let studioToolbox = document.getElementById('studioToolboxWindow');
    if (!studioToolbox) {
      studioToolbox = document.createElement('div');
      studioToolbox.id = 'studioToolboxWindow';
      studioToolbox.className = 'unified-toolbox-window';
      studioLeft.appendChild(studioToolbox);
    }

    Object.assign(ctx.shared, { studioToolbox });   // for later units of this page
  }
});
