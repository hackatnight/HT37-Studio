/**
 * @file     js/pages/alerts/toolbox.js
 * @layer    UI mount
 * @summary  Creates #alertsToolboxWindow and snapshots the pooled alert-tester controls once.
 *
 * ROLE
 *   - Hands { alertsToolbox, allButtons, alertBody, allInputs, allSelects, alertCard } to tools 0-3 via
 *     ctx.shared.
 *
 * REGISTERS
 *   - ui.registerMount(id:alerts.toolbox, page:alerts, order:200)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: ctx
 *
 * DOM IDS TOUCHED
 *   #alertsToolboxWindow #secAlertTesterBody
 *
 * LOAD ORDER
 *   #50 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/pages/studio/tool-3-live-sensors.js   before: js/pages/alerts/tool-0-master-command.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerMount({
  id: 'alerts.toolbox',
  page: 'alerts',
  order: 200,
  title: 'Creates #alertsToolboxWindow and snapshots the pooled alert-tester controls ONCE (before any tool moves them)',
  run(ctx) {
    const { getCard, alertsLeft } = ctx;
    let alertsToolbox = document.getElementById('alertsToolboxWindow');
    if (!alertsToolbox) {
      alertsToolbox = document.createElement('div');
      alertsToolbox.id = 'alertsToolboxWindow';
      alertsToolbox.className = 'unified-toolbox-window';
      alertsLeft.appendChild(alertsToolbox);
    }
    const alertCard = getCard('secAlertTesterBody');
    const alertBody = document.getElementById('secAlertTesterBody');

    // Snapshot of the pooled alert-tester controls, taken ONCE before any tool card moves them.
    let allButtons = [], allInputs = [], allSelects = [];
    if (alertBody) {
      allButtons = Array.from(alertBody.querySelectorAll('button'));
      allInputs = Array.from(alertBody.querySelectorAll('input'));
      allSelects = Array.from(alertBody.querySelectorAll('select'));
    }

    Object.assign(ctx.shared, { alertsToolbox, allButtons, alertBody, allInputs, allSelects, alertCard });   // for later units of this page
  }
});
