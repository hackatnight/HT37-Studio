/**
 * @file     js/editor/layers.js
 * @layer    Editor logic
 * @summary  Layer stack operations: default layout, add/duplicate/delete/reorder/lock/hide, and the layer list UI.
 *
 * ROLE
 *   - createDefaultWidgets(): resets widgets[] to the 8-layer HT37 tactical layout.
 *   - addWidget(type): reads defaults from HT37.widgets.get(type); places the layer near the center with a
 *     small jitter; selects it.
 *   - renderLayerList(): rebuilds #layerList (top-most layer first) plus the base-background row and
 *     #layerCountBadge.
 *   - Other operations are keyed by layer id: toggleLayerVisible, toggleLayerLock, moveLayer(id, ±1),
 *     duplicateWidget, deleteWidget, clearAllWidgets; the *SelectedWidget variants act on selectedWidgetId.
 *
 * PROVIDES (globals)
 *   function createDefaultWidgets, function addWidget, function renderLayerList, function toggleLayerVisible,
 *   function toggleLayerLock, function moveLayer, function duplicateWidget, function duplicateSelectedWidget,
 *   function deleteWidget, function deleteSelectedWidget, function clearAllWidgets
 *
 * USES (defined in other files)
 *   - js/editor/state.js: bgTheme, customBgImage, screenConfig, selectedWidgetId, widgets
 *   - js/editor/inspector.js: syncInspector
 *   - js/core/namespace.js: HT37
 *
 * DOM IDS TOUCHED
 *   #layerCountBadge #layerList
 *
 * LOAD ORDER
 *   #21 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/editor/render.js   before: js/editor/canvas-input.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
function createDefaultWidgets() {
  widgets = [
    { id: 'layer_compass', type: 'compass', name: '🧭 Live Compass', x: 180, y: 84, scale: 0.92, opacity: 1, visible: true, locked: false, color: '#00e5ff', accent: '#ff5252', text: 'MAG HDG', fwId: '0x10' },
    { id: 'layer_date', type: 'date', name: '📅 Date Calendar', x: 92, y: 142, scale: 0.95, opacity: 1, visible: true, locked: false, color: '#00e5ff', accent: '#ffffff', text: 'CAL', fwId: '0x05' },
    { id: 'layer_weather', type: 'weather', name: '🌤️ Live Weather', x: 268, y: 142, scale: 0.95, opacity: 1, visible: true, locked: false, color: '#ffab00', accent: '#00e5ff', text: 'UV 5', fwId: '0x06' },
    { id: 'layer_clock', type: 'digitalClock', name: '🕓 Digital Time', x: 180, y: 194, scale: 1.12, opacity: 1, visible: true, locked: false, color: '#ffffff', accent: '#00e5ff', text: '24H', fwId: '0x01' },
    { id: 'layer_hr', type: 'heartrate', name: '❤️ Heart Rate PPG', x: 95, y: 258, scale: 0.92, opacity: 1, visible: true, locked: false, color: '#ff5252', accent: '#ff8a80', text: 'BPM', fwId: '0x11' },
    { id: 'layer_baro', type: 'barometer', name: '⛰️ Baro / Altimeter', x: 265, y: 258, scale: 0.92, opacity: 1, visible: true, locked: false, color: '#00e676', accent: '#69f0ae', text: 'hPa', fwId: '0x13' },
    { id: 'layer_steps', type: 'steps', name: '👟 Steps Goal Ring', x: 122, y: 318, scale: 0.88, opacity: 1, visible: true, locked: false, color: '#ffab00', accent: '#ffe57f', text: 'STEPS', fwId: '0x12' },
    { id: 'layer_bat', type: 'battery', name: '🔋 Battery Gauge', x: 238, y: 318, scale: 0.88, opacity: 1, visible: true, locked: false, color: '#00e5ff', accent: '#00e676', text: 'BAT', fwId: '0x14' }
  ];
  selectedWidgetId = widgets[widgets.length - 1].id;
  renderLayerList(); syncInspector();
}

function addWidget(type) {
  // Per-type defaults come from the widget registry (js/editor/widgets/<type>.js -> defaults)
  const _def = HT37.widgets.get(type);
  const defaults = _def && _def.defaults;
  if (!defaults) return;
  const jitter = (widgets.length % 5) * 8 - 16;
  const newW = { id: 'layer_' + Date.now() + '_' + Math.floor(Math.random() * 100), type, name: defaults.name, x: Math.round(screenConfig.width / 2) + jitter, y: Math.round(screenConfig.height / 2) + jitter, scale: 1.0, opacity: 1.0, visible: true, locked: false, color: defaults.color, accent: defaults.accent, text: defaults.text, fwId: defaults.fwId };
  if (defaults.opts) newW.opts = JSON.parse(JSON.stringify(defaults.opts)); // per-widget options (real watch widgets)
  widgets.push(newW); selectedWidgetId = newW.id; renderLayerList(); syncInspector();
}

function renderLayerList() {
  const container = document.getElementById('layerList');
  document.getElementById('layerCountBadge').textContent = widgets.length;
  container.innerHTML = '';
  [...widgets].reverse().forEach((w) => {
    const div = document.createElement('div');
    div.className = 'layer-item' + (w.id === selectedWidgetId ? ' active' : '') + (!w.visible ? ' hidden-layer' : '');
    div.onclick = () => { selectedWidgetId = w.id; renderLayerList(); syncInspector(); };
    div.innerHTML = `<div class="layer-left"><button class="icon-btn" onclick="toggleLayerVisible('${w.id}'); event.stopPropagation()">${w.visible ? '👁️' : '🚫'}</button><button class="icon-btn ${w.locked ? 'active-toggle' : ''}" onclick="toggleLayerLock('${w.id}'); event.stopPropagation()">${w.locked ? '🔒' : '🔓'}</button><span class="layer-name">${w.name}</span></div><div class="layer-actions"><button class="icon-btn" onclick="moveLayer('${w.id}', 1); event.stopPropagation()">▲</button><button class="icon-btn" onclick="moveLayer('${w.id}', -1); event.stopPropagation()">▼</button><button class="icon-btn" onclick="duplicateWidget('${w.id}'); event.stopPropagation()">⧉</button><button class="icon-btn del-btn" onclick="deleteWidget('${w.id}'); event.stopPropagation()">🗑️</button></div>`;
    container.appendChild(div);
  });
  const bgRow = document.createElement('div');
  bgRow.className = 'layer-item base-layer';
  const hasImg = Boolean(customBgImage);
  bgRow.innerHTML = `<div class="layer-left"><span style="font-size:12px">🖼️</span><span class="layer-name" style="color:var(--text-muted)">[Base] ${hasImg ? 'Custom BG Image' : 'Theme: ' + bgTheme.toUpperCase()}</span></div><div class="layer-actions">${hasImg ? `<button class="icon-btn del-btn" onclick="deleteBackgroundImage(); event.stopPropagation()">🗑️ Clear BG</button>` : ''}</div>`;
  container.appendChild(bgRow);
}

function toggleLayerVisible(id) { const w = widgets.find((x) => x.id === id); if (w) { w.visible = !w.visible; renderLayerList(); } }

function toggleLayerLock(id) { const w = widgets.find((x) => x.id === id); if (w) { w.locked = !w.locked; renderLayerList(); } }

function moveLayer(id, dir) {
  const idx = widgets.findIndex((w) => w.id === id);
  if (idx === -1 || idx + dir < 0 || idx + dir >= widgets.length) return;
  const [item] = widgets.splice(idx, 1); widgets.splice(idx + dir, 0, item); renderLayerList();
}

function duplicateWidget(id) {
  const orig = widgets.find((w) => w.id === id);
  if (!orig) return;
  const copy = { ...orig, id: 'layer_' + Date.now(), name: orig.name + ' Copy', x: orig.x + 14, y: orig.y + 14, locked: false };
  if (orig.opts) copy.opts = JSON.parse(JSON.stringify(orig.opts));
  widgets.push(copy); selectedWidgetId = copy.id; renderLayerList(); syncInspector();
}

function duplicateSelectedWidget() { if (selectedWidgetId) duplicateWidget(selectedWidgetId); }

function deleteWidget(id) {
  widgets = widgets.filter((w) => w.id !== id);
  if (selectedWidgetId === id) selectedWidgetId = widgets[widgets.length - 1]?.id || null;
  renderLayerList(); syncInspector();
}

function deleteSelectedWidget() { if (selectedWidgetId) deleteWidget(selectedWidgetId); }

function clearAllWidgets() { widgets = []; selectedWidgetId = null; renderLayerList(); syncInspector(); }
