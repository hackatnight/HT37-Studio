/**
 * @file     js/pages/studio/tool-2-screen-background.js
 * @layer    UI mount
 * @summary  Tab 1 tool 2 "Watch Screen & Background Layer": adopts #secScreenBgBody.
 *
 * ROLE
 *   - Contains #lcdPreset, #bgPreset, upload/delete background, #chkShowGuides.
 *
 * REGISTERS
 *   - ui.registerMount(id:studio.tool2, page:studio, order:130)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: ctx
 *
 * DOM IDS TOUCHED
 *   #secScreenBgBody #toolCard_2_studio
 *
 * LOAD ORDER
 *   #48 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/pages/studio/tool-1-add-widget.js   before: js/pages/studio/tool-3-live-sensors.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerMount({
  id: 'studio.tool2',
  page: 'studio',
  order: 130,
  title: '2. Watch Screen & Background Layer (adopts pooled #secScreenBgBody)',
  run(ctx) {
    const { getCard, makeToolCard } = ctx;
    const { studioToolbox } = ctx.shared;   // handed over by an earlier unit of this page
    // Tool 2: Watch Screen & Background Layer
    const cardScreenBg = getCard('secScreenBgBody');
    const bodyScreenBg = document.getElementById('secScreenBgBody');
    if (bodyScreenBg && !studioToolbox.querySelector('#toolCard_2_studio')) {
      const card2 = makeToolCard('2', 'Watch Screen & Background Layer', bodyScreenBg);
      card2.id = 'toolCard_2_studio';
      if (card2) studioToolbox.appendChild(card2);
      if (cardScreenBg && cardScreenBg !== card2 && cardScreenBg.parentElement) cardScreenBg.style.display = 'none';
    }
  }
});
