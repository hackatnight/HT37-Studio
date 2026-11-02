/**
 * @file     js/ui/cleanup.js
 * @layer    UI mount
 * @summary  Hides every <body> child that is not header, nav, #studioMainContainer or the dock.
 *
 * ROLE
 *   - This is what hides the unadopted HTML pool. New always-visible UI must live inside <header> or inside a
 *     page.
 *
 * REGISTERS
 *   - ui.registerMount(id:shell.cleanup, order:610)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: ctx
 *
 * DOM IDS TOUCHED
 *   #persistentLogDock
 *
 * LOAD ORDER
 *   #59 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/ui/dock.js   before: js/ui/tabs.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerMount({
  id: 'shell.cleanup',
  order: 610,
  title: 'Hides every body-level element that is not header/nav/container/dock (the unadopted HTML "pool")',
  run(ctx) {
    const { nav, header, container } = ctx;
    const dock = document.getElementById('persistentLogDock');
    Array.from(document.body.children).forEach(el => {
      if (el !== header && el !== nav && el !== container && el !== dock && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') {
        el.style.display = 'none';
      }
    });
  }
});
