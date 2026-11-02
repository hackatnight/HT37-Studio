/**
 * @file     js/pages/alerts/tool-2-social-notifications.js
 * @layer    UI mount
 * @summary  Tab 2 tool 2 "Social & App Notifications": 2-column grid of the generated 04/04–04/15 buttons.
 *
 * ROLE
 *   - Buttons are produced by ui/pool-generators.js from HT37.commands.
 *
 * REGISTERS
 *   - ui.registerMount(id:alerts.tool2, page:alerts, order:230)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: ctx
 *
 * DOM IDS TOUCHED
 *   #toolCard_2_alerts
 *
 * LOAD ORDER
 *   #53 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/pages/alerts/tool-1-telephony.js   before: js/pages/alerts/tool-3-weather-and-dial-slots.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerMount({
  id: 'alerts.tool2',
  page: 'alerts',
  order: 230,
  title: '2. Social & App Notifications (2-column grid of 04/04..04/15) + hides the emptied source card',
  run(ctx) {
    const { makeToolCard } = ctx;
    const { alertsToolbox, alertCard, alertBody, allButtons } = ctx.shared;   // handed over by an earlier unit of this page
    if (!alertBody) return;               // same condition the old monolith wrapped around this block
    // TOOL 2: Social & App Notifications (2-Column Grid matching standard)
    if (!document.getElementById('toolCard_2_alerts')) {
      const body2A = document.createElement('div');
      body2A.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:6px;';

      const appOrder = ['04/04','04/05','04/06','04/07','04/08','04/09','04/0A','04/0B','04/0C','04/0D','04/0E','04/0F','04/10','04/11','04/12','04/13','04/15'];
      const socialBtns = allButtons.filter(b => {
        return appOrder.some(code => b.textContent.includes(code));
      }).sort((a, b) => {
        const codeA = appOrder.findIndex(code => a.textContent.includes(code));
        const codeB = appOrder.findIndex(code => b.textContent.includes(code));
        return codeA - codeB;
      });

      socialBtns.forEach(b => {
        b.className = 'dock-btn';
        b.style.cssText = 'width:100% !important; margin:0 !important; padding:5px 6px !important; font-size:11px !important; background:#1e293b !important; color:#e2e8f0 !important; border:1px solid #334155 !important; border-radius:0 !important; cursor:pointer !important; white-space:nowrap !important; overflow:hidden !important; text-overflow:ellipsis !important;';
        body2A.appendChild(b);
      });

      const card2A = makeToolCard('2', 'Social & App Notifications', body2A);
      card2A.id = 'toolCard_2_alerts';
      if (card2A) alertsToolbox.appendChild(card2A);
    }
    if (alertCard && alertCard !== alertBody) {
      alertCard.style.display = 'none';
    }
  }
});
