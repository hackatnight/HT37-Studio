/**
 * @file     js/pages/alerts/tool-1-telephony.js
 * @layer    UI mount
 * @summary  Tab 2 tool 1 "Call & Telephony Dispatcher": sender/message/encoding inputs and call buttons.
 *
 * ROLE
 *   - Moves the pooled sender, message and #alertFormat controls plus Call / End / Mute buttons.
 *
 * REGISTERS
 *   - ui.registerMount(id:alerts.tool1, page:alerts, order:220)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: ctx
 *
 * DOM IDS TOUCHED
 *   #toolCard_1_alerts
 *
 * LOAD ORDER
 *   #52 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/pages/alerts/tool-0-master-command.js   before: js/pages/alerts/tool-2-social-notifications.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerMount({
  id: 'alerts.tool1',
  page: 'alerts',
  order: 220,
  title: '1. Call & Telephony Dispatcher',
  run(ctx) {
    const { makeToolCard } = ctx;
    const { alertsToolbox, alertBody, allButtons, allInputs, allSelects } = ctx.shared;   // handed over by an earlier unit of this page
    if (!alertBody) return;               // same condition the old monolith wrapped around this block
    // TOOL 1: Call & Telephony Dispatcher
    if (!document.getElementById('toolCard_1_alerts')) {
      const body1A = document.createElement('div');
      body1A.style.cssText = 'display:flex; flex-direction:column; gap:6px;';

      const callerInput = allInputs.find(i => (i.value && i.value.includes('HT37')) || (i.id && i.id.toLowerCase().includes('caller')));
      if (callerInput) {
        const rowCaller = (callerInput.parentElement && callerInput.parentElement !== alertBody) ? callerInput.parentElement : callerInput;
        body1A.appendChild(rowCaller);
      }

      const msgInput = allInputs.find(i => (i.value && i.value.includes('Watch link ok')) || (i.id && i.id.toLowerCase().includes('msg')));
      if (msgInput) {
        const rowMsg = (msgInput.parentElement && msgInput.parentElement !== alertBody) ? msgInput.parentElement : msgInput;
        body1A.appendChild(rowMsg);
      }

      const encSelect = allSelects.find(s => Array.from(s.options).some(o => o.text.includes('UTF') || o.text.includes('GBK') || o.text.includes('Encoding')));
      if (encSelect) {
        const rowEnc = (encSelect.parentElement && encSelect.parentElement !== alertBody) ? encSelect.parentElement : encSelect;
        body1A.appendChild(rowEnc);
      }

      const callGrid = document.createElement('div');
      callGrid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px;';
      allButtons.filter(b => {
        const t = b.textContent;
        return t.includes('Call') || t.includes('End Call') || t.includes('Mute');
      }).forEach(b => {
        b.style.cssText = 'width:100%; margin:0; padding:5px 8px; font-size:11px;';
        callGrid.appendChild(b);
      });
      body1A.appendChild(callGrid);

      const card1A = makeToolCard('1', 'Call & Telephony Dispatcher', body1A);
      card1A.id = 'toolCard_1_alerts';
      if (card1A) alertsToolbox.appendChild(card1A);
    }
  }
});
