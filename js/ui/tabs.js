/**
 * @file     js/ui/tabs.js
 * @layer    UI mount
 * @summary  Tab switching and remembered tab.
 *
 * ROLE
 *   - Click on .studio-tab-btn toggles .active on buttons and panes; Tab 4 re-renders its log; last tab stored
 *     in localStorage "ht37_active_tab".
 *
 * REGISTERS
 *   - ui.registerMount(id:shell.tabs, order:620)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: ctx
 *   - js/core/log.js: renderTab4Entries
 *
 * LOAD ORDER
 *   #60 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/ui/cleanup.js   before: js/decompiler/vault.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerMount({
  id: 'shell.tabs',
  order: 620,
  title: 'Tab switching (click on nav) + restores the last active tab from localStorage',
  run(ctx) {
    const { nav } = ctx;
    // Tab Switcher
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.studio-tab-btn');
      if (!btn) return;
      const targetTab = btn.dataset.tab;
      document.querySelectorAll('.studio-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.studio-tab-pane').forEach(p => p.classList.toggle('active', p.id === targetTab));
      if (targetTab === 'tab-logs') {
        if (typeof renderTab4Entries === 'function') renderTab4Entries();
      }
      try { localStorage.setItem('ht37_active_tab', targetTab); } catch(err){}
    });
    const savedTab = localStorage.getItem('ht37_active_tab');
    if (savedTab && document.getElementById(savedTab)) {
      const targetBtn = nav.querySelector(`[data-tab="` + savedTab + `"]`);
      if (targetBtn) targetBtn.click();
    }
  }
});
