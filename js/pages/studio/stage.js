/**
 * @file     js/pages/studio/stage.js
 * @layer    UI mount
 * @summary  Tab 1 center stage (zoomable WYSIWYG viewport + HUD) and the right column (layers + inspector).
 *
 * ROLE
 *   - Builds #studioWysiwygViewport with zoom buttons (40-300 %, Ctrl+wheel), moves #watchChassis into
 *     #watchZoomWrapper, and moves #secWidgetLayersBody and #inspectorBody into the right column.
 *
 * REGISTERS
 *   - ui.registerMount(id:studio.stage, page:studio, order:500)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: ctx
 *
 * DOM IDS TOUCHED
 *   #btnCopyHudCoords #btnZoomIn #btnZoomOut #btnZoomReset #hudDim #hudEdges #hudHwPos #liveCoordHud
 *   #studioWysiwygViewport #watchChassis #watchZoomWrapper #wysiwygScrollStage #zoomLevelIndicator
 *
 * LOAD ORDER
 *   #57 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/pages/logs/tools.js   before: js/ui/dock.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerMount({
  id: 'studio.stage',
  page: 'studio',
  order: 500,
  title: 'Center stage (WYSIWYG canvas viewport + zoom + preview box) and right-hand inspector column',
  run(ctx) {
    const { getCard, studioCenter, studioRight } = ctx;
    let wysiwygViewport = document.getElementById('studioWysiwygViewport');
    if (!wysiwygViewport) {
      wysiwygViewport = document.createElement('div');
      wysiwygViewport.id = 'studioWysiwygViewport';
      wysiwygViewport.className = 'studio-wysiwyg-viewport';
      wysiwygViewport.innerHTML = `
          <div class="wysiwyg-zoom-bar">
            <button type="button" class="zoom-btn" id="btnZoomOut" title="Zoom Out (Ctrl -)">🔍 -</button>
            <span class="zoom-indicator" id="zoomLevelIndicator" title="Click to Reset">100%</span>
            <button type="button" class="zoom-btn" id="btnZoomIn" title="Zoom In (Ctrl +)">🔍 +</button>
            <button type="button" class="zoom-btn" id="btnZoomReset" title="Reset Zoom">Fit 100%</button>
            <span class="resolution-badge">360 × 360</span>
            <span style="color:#334155; margin:0 4px;">|</span>
            <div id="liveCoordHud" style="display:inline-flex; align-items:center; gap:8px; background:#0b1120; border:1px solid #0284c7; border-radius:3px; padding:2px 8px; font-family:monospace; font-size:11px; user-select:text; -webkit-user-select:text; cursor:text;">
              <span id="hudHwPos" style="font-weight:700; color:#00e5ff; user-select:text; -webkit-user-select:text;">HW Top-Left: (X: --, Y: --)</span>
              <span style="color:#1e293b">|</span>
              <span id="hudDim" style="color:#94a3b8; user-select:text; -webkit-user-select:text;">Size: --x--</span>
              <span style="color:#1e293b">|</span>
              <span id="hudEdges" style="color:#f59e0b; user-select:text; -webkit-user-select:text;">L:-- R:-- T:-- B:--</span>
              <button type="button" id="btnCopyHudCoords" onclick="copyHwHudCoords(event)" title="Copy coordinates to clipboard (Ctrl+C)" style="background:#1e293b; color:#38bdf8; border:1px solid #0284c7; border-radius:2px; font-size:10px; padding:1px 5px; cursor:pointer; font-weight:700; margin-left:4px;">📋</button>
            </div>
          </div>
          <div class="wysiwyg-scroll-stage" id="wysiwygScrollStage">
            <div class="watch-zoom-wrapper" id="watchZoomWrapper"></div>
          </div>
        `;
      studioCenter.appendChild(wysiwygViewport);

      const zoomWrapper = wysiwygViewport.querySelector('#watchZoomWrapper');
      const scrollStage = wysiwygViewport.querySelector('#wysiwygScrollStage');
      const chassis = document.getElementById('watchChassis');
      if (chassis) {
        zoomWrapper.appendChild(chassis);
      }

      let zoomLevel = 1.0;
      const zoomIndicator = wysiwygViewport.querySelector('#zoomLevelIndicator');

      function updateZoom(newZoom) {
        zoomLevel = Math.max(0.4, Math.min(3.0, Math.round(newZoom * 100) / 100));
        zoomWrapper.style.transform = 'scale(' + zoomLevel + ')';
        zoomIndicator.textContent = Math.round(zoomLevel * 100) + '%';
      }

      wysiwygViewport.querySelector('#btnZoomIn').addEventListener('click', () => updateZoom(zoomLevel + 0.25));
      wysiwygViewport.querySelector('#btnZoomOut').addEventListener('click', () => updateZoom(zoomLevel - 0.25));
      wysiwygViewport.querySelector('#btnZoomReset').addEventListener('click', () => updateZoom(1.0));
      zoomIndicator.addEventListener('click', () => updateZoom(1.0));

      scrollStage.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.15 : -0.15;
          updateZoom(zoomLevel + delta);
        }
      }, { passive: false });
    }
    ['secWidgetLayersBody', 'inspectorBody'].forEach(id => {
      const c = getCard(id);
      if (c && !studioRight.contains(c)) studioRight.appendChild(c);
    });
  }
});
