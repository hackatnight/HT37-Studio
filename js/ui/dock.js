/**
 * @file     js/ui/dock.js
 * @layer    UI mount
 * @summary  Persistent bottom log dock with minimize/expand.
 *
 * ROLE
 *   - Creates #persistentLogDock, moves #logTerminal and #hexInspector into it; toggles body.dock-collapsed
 *     (drives --dock-height in CSS).
 *
 * REGISTERS
 *   - ui.registerMount(id:shell.dock, order:600)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: ctx
 *
 * DOM IDS TOUCHED
 *   #dockActionGroup #dockBody #dockHeader #dockToggleBtn #hexInspector #logTerminal #persistentLogDock
 *
 * LOAD ORDER
 *   #58 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/pages/studio/stage.js   before: js/ui/cleanup.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerMount({
  id: 'shell.dock',
  order: 600,
  title: 'Persistent bottom log dock (#persistentLogDock) with minimize/expand',
  run(ctx) {
    const { header } = ctx;
    let dock = document.getElementById('persistentLogDock');
    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'persistentLogDock';
      dock.className = 'studio-bottom-dock';
      dock.innerHTML = `
          <div class="dock-header" id="dockHeader">
            <div class="dock-title">
              <span class="dock-status-dot"></span>
              <span>📋 System & BLE Logs</span>
            </div>
            <div class="dock-actions" id="dockActionGroup">
              <button type="button" class="dock-btn" id="dockToggleBtn">▼ Minimize</button>
            </div>
          </div>
          <div class="dock-body" id="dockBody"></div>
        `;
      document.body.appendChild(dock);

      const copyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Copy All Logs'));
      const clearBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Clear') && !b.textContent.includes('Clear All'));
      const actionGroup = dock.querySelector('#dockActionGroup');
      const toggleBtn = dock.querySelector('#dockToggleBtn');
      if (copyBtn) actionGroup.insertBefore(copyBtn, toggleBtn);
      if (clearBtn) actionGroup.insertBefore(clearBtn, toggleBtn);

      const dockBody = dock.querySelector('#dockBody');
      const logTerm = document.getElementById('logTerminal');
      const hexInsp = document.getElementById('hexInspector');
      if (logTerm) dockBody.appendChild(logTerm);
      if (hexInsp) dockBody.appendChild(hexInsp);

      function toggleDock() {
        const isCollapsed = document.body.classList.toggle('dock-collapsed');
        dock.classList.toggle('dock-collapsed', isCollapsed);
        toggleBtn.textContent = isCollapsed ? '▲ Expand' : '▼ Minimize';
      }

      dock.querySelector('#dockHeader').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        toggleDock();
      });
      toggleBtn.addEventListener('click', toggleDock);
    }
  }
});
