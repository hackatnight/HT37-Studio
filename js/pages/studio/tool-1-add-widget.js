/**
 * @file     js/pages/studio/tool-1-add-widget.js
 * @layer    UI mount
 * @summary  Tab 1 tool 1 "Add Widget Layer": adopts the pooled #secAddWidgetBody (cards generated from HT37.widgets).
 *
 * ROLE
 *   - Adoption = makeToolCard(…, pooledElement) then hide the emptied source card.
 *
 * REGISTERS
 *   - ui.registerMount(id:studio.tool1, page:studio, order:120)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: ctx
 *
 * DOM IDS TOUCHED
 *   #secAddWidgetBody #toolCard_1_studio
 *
 * LOAD ORDER
 *   #47 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/pages/studio/tool-0-canvas-layers.js   before: js/pages/studio/tool-2-screen-background.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerMount({
  id: 'studio.tool1',
  page: 'studio',
  order: 120,
  title: '1. Add Widget Layer (adopts pooled #secAddWidgetBody)',
  run(ctx) {
    const { getCard, makeToolCard } = ctx;
    const { studioToolbox } = ctx.shared;   // handed over by an earlier unit of this page
    // Tool 1: Add Widget Layer
    const cardAddWidget = getCard('secAddWidgetBody');
    const bodyAddWidget = document.getElementById('secAddWidgetBody');
    if (bodyAddWidget && !studioToolbox.querySelector('#toolCard_1_studio')) {
      const card1 = makeToolCard('1', 'Add Widget Layer', bodyAddWidget);
      card1.id = 'toolCard_1_studio';
      if (card1) studioToolbox.appendChild(card1);
      if (cardAddWidget && cardAddWidget !== card1 && cardAddWidget.parentElement) cardAddWidget.style.display = 'none';
    }
  }
});
