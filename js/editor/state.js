/**
 * @file     js/editor/state.js
 * @layer    Editor state
 * @summary  All shared editor state as plain globals: canvas, screen config, background, sensor simulation values, layer list.
 *
 * ROLE
 *   - canvas / ctx: the #watchCanvas 2-D context (WYSIWYG surface).
 *   - screenConfig { width, height, isRect, previewWidth, previewHeight }: current LCD preset (default 360×360
 *     round).
 *   - bgTheme ("tactical"|"cyber"|"deepblue"|"black"|"image"), customBgImage, loadedTemplateBin (Uint8Array of
 *     an official template .bin).
 *   - sensors { heading, hr, steps, stepGoal, baro, altitude, battery, tempC, weatherTemp, weatherCond,
 *     ecgPhase }: the SIMULATED live values drawn by widgets; the sliders in Tab 1 and incoming BLE frames
 *     write here.
 *   - widgets[]: the layer stack, bottom → top. A layer = { id, type, name, x, y, scale, opacity, visible,
 *     locked, color, accent, text, fwId }. selectedWidgetId + drag offsets support the pointer editor.
 *
 * PROVIDES (globals)
 *   const canvas, const ctx, let screenConfig, let bgTheme, let customBgImage, let loadedTemplateBin, const
 *   sensors, let widgets, let selectedWidgetId, let isDragging, let dragOffsetX, let dragOffsetY
 *
 * DOM IDS TOUCHED
 *   #watchCanvas
 *
 * LOAD ORDER
 *   #7 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/ui/helpers.js   before: js/editor/widget-registry.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
const canvas = document.getElementById('watchCanvas');

const ctx = canvas.getContext('2d');

let screenConfig = { width: 360, height: 360, isRect: false, previewWidth: 220, previewHeight: 220 };

let bgTheme = 'tactical', customBgImage = null, loadedTemplateBin = null;

const sensors = { heading: 42, hr: 76, steps: 6840, stepGoal: 10000, baro: 1013, altitude: 148, battery: 50, charging: false, tempC: 36.6, weatherTemp: 22, weatherCond: ' Cloudy (05/02)', ecgPhase: 0 };

let widgets = [], selectedWidgetId = null, isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
