/**
 * @file     js/pages/studio/tool-0-canvas-layers.js
 * @layer    UI mount
 * @summary  Tab 1 tool 0 "Canvas & Layer Tools": Export .BIN + Center / Duplicate / Remove / Reset grid.
 *
 * ROLE
 *   - Re-uses the original buttons (found by their onclick text) and re-styles them into a 2×2 grid.
 *
 * REGISTERS
 *   - ui.registerMount(id:studio.tool0, page:studio, order:110)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: ctx
 *   - js/editor/inspector.js: centerSelectedWidget, resetDefaultWatchface
 *   - js/editor/layers.js: deleteSelectedWidget, duplicateSelectedWidget
 *
 * DOM IDS TOUCHED
 *   #btnCompileBin #toolCard_0_studio
 *
 * LOAD ORDER
 *   #46 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/pages/studio/toolbox.js   before: js/pages/studio/tool-1-add-widget.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerMount({
  id: 'studio.tool0',
  page: 'studio',
  order: 110,
  title: '0. Canvas & Layer Tools (Export .BIN + Center/Duplicate/Remove/Reset grid)',
  run(ctx) {
    const { makeToolCard } = ctx;
    const { studioToolbox } = ctx.shared;   // handed over by an earlier unit of this page
    // Tool 0: Canvas & Layer Tools (Export .BIN Full-Width on Top + Deduplicated 2x2 Grid)
    if (!document.getElementById('toolCard_0_studio')) {
      const body0 = document.createElement('div');
      body0.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin:0; padding:0; width:100%; box-sizing:border-box;';

      // 1. 📦 Export .BIN Full-Width on Top
      const btnBin = document.getElementById('btnCompileBin') || document.createElement('button');
      btnBin.className = 'dock-btn';
      btnBin.removeAttribute('style');
      btnBin.innerHTML = '📦 Export .BIN';
      btnBin.style.cssText = 'width:100% !important; height:28px !important; margin:0 !important; font-size:11px !important; font-weight:700 !important; background:#1e293b !important; color:#38bdf8 !important; border:1px solid #334155 !important; border-radius:0 !important; box-sizing:border-box !important; cursor:pointer !important;';
      body0.appendChild(btnBin);

      // 2. Deduplicated 2x2 Grid Below
      const grid0 = document.createElement('div');
      grid0.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:6px; margin:0; width:100%; box-sizing:border-box;';

      const btnCenter = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('onclick') && b.getAttribute('onclick').includes('centerSelectedWidget')) || document.createElement('button');
      btnCenter.innerHTML = '🎯 Center';
      btnCenter.onclick = () => { if (typeof centerSelectedWidget === 'function') centerSelectedWidget(); };

      const btnDup = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('onclick') && b.getAttribute('onclick').includes('duplicateSelectedWidget')) || document.createElement('button');
      btnDup.innerHTML = '⧉ Duplicate';
      btnDup.onclick = () => { if (typeof duplicateSelectedWidget === 'function') duplicateSelectedWidget(); };

      const btnRemove = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('onclick') && b.getAttribute('onclick').includes('deleteSelectedWidget')) || document.createElement('button');
      btnRemove.innerHTML = '🗑️ Remove';
      btnRemove.onclick = () => { if (typeof deleteSelectedWidget === 'function') deleteSelectedWidget(); };

      const btnReset = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('onclick') && (b.getAttribute('onclick').includes('resetDefault') || b.textContent.includes('Reset'))) || document.createElement('button');
      btnReset.innerHTML = '🔄 Reset';
      btnReset.onclick = () => { if (typeof resetDefaultWatchface === 'function') resetDefaultWatchface(); };

      [btnCenter, btnDup, btnRemove, btnReset].forEach(b => {
        b.className = 'dock-btn';
        b.removeAttribute('style');
        b.style.cssText = 'width:100% !important; height:28px !important; margin:0 !important; padding:5px 6px !important; font-size:11px !important; font-weight:600 !important; background:#1e293b !important; color:#e2e8f0 !important; border:1px solid #334155 !important; border-radius:0 !important; cursor:pointer !important; box-sizing:border-box !important; text-align:center !important;';
        grid0.appendChild(b);
      });

      body0.appendChild(grid0);

      const card0 = makeToolCard('0', 'Canvas & Layer Tools', body0);
      card0.id = 'toolCard_0_studio';
      if (card0) studioToolbox.appendChild(card0);
    }
  }
});
