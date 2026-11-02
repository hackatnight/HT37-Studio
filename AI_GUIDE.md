# HT37 Studio — AI guide

Read this first. It tells you how the app is organized, where things live, and how to change it without breaking
real-hardware code. Wire-protocol details are in [PROTOCOL.md](PROTOCOL.md).

## 1. What this is
A static, **no-build** web app (plain `<script>` tags, GitHub-Pages friendly) that pairs with an HT37 smart watch over
**Web Bluetooth**, lets you design a watch face on a canvas (WYSIWYG), decompiles/edits TOPSTEP `.bin` dial files, sends
commands/notifications/weather, and flashes a `.bin` to the watch over the IC_568X OTA service.
Run it from `https://` or `http://localhost` (Web Bluetooth needs a secure context), e.g. `python3 -m http.server` then open
Chrome/Edge. Chrome/Edge only.

## 2. Mental model (3 ideas)
1. **Registries hold the data.** Commands, events, presets and widget types are *data* in `HT37.*` registries; UI lists are generated from them.
2. **The HTML "pool".** `index.html` contains hand-written controls grouped in sections with ids (`secAddWidgetBody`,
   `secAlertTesterBody`, `secDfuEngineBody`, …). Nothing in the pool is visible by itself.
3. **Pages + mounts.** `HT37.ui.registerPage` declares a tab; `HT37.ui.registerMount` declares a toolbox card that *adopts* a pool
   section (moves it into a collapsible card). At DOMContentLoaded the shell builds tabs, runs mounts in `order`, then
   `ui/cleanup.js` hides whatever was not adopted.

Everything else (BLE, editor, DFU, commands) is **plain global functions/variables** — all scripts are classic scripts sharing
one global scope, and inline `onclick="…"` attributes call them by bare name. Do not convert files to ES modules without
rewriting every inline handler.

## 3. Runtime layout (what the user sees)
Header (always visible): brand, BLE status pill, **Pair & Bind**, **Flash to Watch**, **Export .BIN**, **Stop**.
Tabs: **1 Watch Studio** (toolbox | canvas stage | layers/inspector/decompiler vault) · **2 Diagnostics** · **3 Flash to Watch** · **4 Logs**.
Bottom: collapsible log dock (`#persistentLogDock`).

| order | mount unit | page | builds |
|---|---|---|---|
| 100 | `studio.toolbox` | studio | Creates the empty left toolbox window (#studioToolboxWindow) that tools 0-3 fill |
| 110 | `studio.tool0` | studio | 0. Canvas & Layer Tools (Export .BIN + Center/Duplicate/Remove/Reset grid) |
| 120 | `studio.tool1` | studio | 1. Add Widget Layer (adopts pooled #secAddWidgetBody) |
| 130 | `studio.tool2` | studio | 2. Watch Screen & Background Layer (adopts pooled #secScreenBgBody) |
| 140 | `studio.tool3` | studio | 3. Live Sensors & Simulation (adopts pooled #secSensorWeatherBody) |
| 200 | `alerts.toolbox` | alerts | Creates #alertsToolboxWindow and snapshots the pooled alert-tester controls ONCE (before any tool moves them) |
| 210 | `alerts.tool0` | alerts | 0. Master Command Station (preset dropdown + CMD/KEY/PAYLOAD + Send + Enable All / Chime / ALL TEST / Reset) |
| 220 | `alerts.tool1` | alerts | 1. Call & Telephony Dispatcher |
| 230 | `alerts.tool2` | alerts | 2. Social & App Notifications (2-column grid of 04/04..04/15) + hides the emptied source card |
| 240 | `alerts.tool3` | alerts | 3. Weather & Sky Dispatch + 4. Dial Slot Switcher (02/70); also hides the legacy Command Explorer card |
| 300 | `dfu.tools` | dfu | DFU toolbox: 0. Flashing Handshake & Triggers, 1. Config TLVs & Dial Tools, 2. Flashing Progress & Status |
| 400 | `logs.tools` | logs | Logs toolbox: 0. Actions & Export, 1. Category Filters, 2. Search & Highlight |
| 500 | `studio.stage` | studio | Center stage (WYSIWYG canvas viewport + zoom + preview box) and right-hand inspector column |
| 600 | `shell.dock` | (all) | Persistent bottom log dock (#persistentLogDock) with minimize/expand |
| 610 | `shell.cleanup` | (all) | Hides every body-level element that is not header/nav/container/dock (the unadopted HTML "pool") |
| 620 | `shell.tabs` | (all) | Tab switching (click on nav) + restores the last active tab from localStorage |

Toolbox cards are numbered in their titles (`0.`, `1.` …). Page ids: `studio`, `alerts`, `dfu`, `logs`; tab pane ids: `tab-studio`, `tab-alerts`, `tab-dfu`, `tab-logs`.

## 4. File map (in load order — order matters)
Every JS file starts with a header block listing its role, provided globals, dependencies, DOM ids and load position. Headers
use fixed labels (`@file @layer @summary ROLE REGISTERS PROVIDES USES DOM IDS LOAD ORDER NOTES HOW TO EXTEND`) so you can `grep` them.

**1. NAMESPACE + PROTOCOL DATA (pure data, no DOM access)**
- `js/core/namespace.js` — Creates the single global namespace object `HT37` that every registry hangs off.
- `js/protocol/command-registry.js` — Single source of truth for outbound watch commands, inbound watch events and reserved alert keys.
- `js/protocol/explorer-presets.js` — The 43 preset commands behind the "KNOWN COMMANDS" dropdown of the Master Command Station (Tab 2, tool 0).
- `js/protocol/constants.js` — Protocol constants: BLE service UUIDs to request, weather sky codes, OTA opcodes and ACK names.

**2. CORE (logging, small UI helpers)**
- `js/core/log.js` — Logging: log() writes to the bottom dock AND the Tab-4 terminal; plus timeout and clipboard helpers.
- `js/ui/helpers.js` — toggleSectionCollapse(): collapses a legacy section (used by inline onclick in the pool markup).

**3. EDITOR (state, widget registry, widgets, renderer, layer/inspector logic)**
- `js/editor/state.js` — All shared editor state as plain globals: canvas, screen config, background, sensor simulation values, layer list.
- `js/editor/widget-registry.js` — HT37.widgets: registry of widget (layer) types; each type is one file in js/editor/widgets/.
- `js/editor/widgets/compass.js` — Widget type "compass": Rotating compass rose with heading degrees (reads sensors.heading).
- `js/editor/widgets/heartrate.js` — Widget type "heartrate": Heart-rate box with BPM and a scrolling ECG trace (reads sensors.hr, sensors.ecgPhase).
- `js/editor/widgets/barometer.js` — Widget type "barometer": Pressure (hPa) with estimated altitude (reads sensors.baro).
- `js/editor/widgets/steps.js` — Widget type "steps": Pedometer arc ring with step count (reads sensors.steps / stepGoal).
- `js/editor/widgets/date.js` — Widget type "date": Weekday + day-of-month badge from the current date.
- `js/editor/widgets/weather.js` — Widget type "weather": Weather icon + temperature + UV text (reads sensors.weatherTemp / weatherCond).
- `js/editor/widgets/battery.js` — Widget type "battery": Battery ring with percent (reads sensors.battery).
- `js/editor/widgets/temp.js` — Widget type "temp": Body / ambient temperature readout (reads sensors.tempC).
- `js/editor/widgets/digitalClock.js` — Widget type "digitalClock": HH:MM:SS digital time with seconds and 24H tag.
- `js/editor/widgets/analogClock.js` — Widget type "analogClock": Sweeping vector hour/minute/second hands.
- `js/editor/widgets/customText.js` — Widget type "customText": Static text label / badge placed anywhere on the dial.
- `js/editor/render.js` — Canvas rendering: background styles, per-layer drawing via the widget registry, selection box, 60 fps loop.
- `js/editor/layers.js` — Layer stack operations: default layout, add/duplicate/delete/reorder/lock/hide, and the layer list UI.
- `js/editor/canvas-input.js` — Pointer drag-and-drop of layers on the canvas and the Delete/Backspace shortcut.
- `js/editor/inspector.js` — Layer inspector panel: coordinate HUD, form ⇄ layer sync, center and reset.
- `js/editor/screen-background.js` — LCD resolution preset, background style, custom background image upload/delete.
- `js/editor/sensors-sim.js` — Live-sensor simulation sliders, device-orientation compass, and the sensor/weather hex readout.

**4. .BIN BUILDER (canvas -> RGB565 -> FitCloud .bin)**
- `js/dfu/bin-compiler.js` — Template download, canvas → RGB565 conversion, FFB1 envelope builder, .bin inspector, DFU progress bar.

**5. BLUETOOTH (state, frame codec, write queue, connect/bind, notifications)**
- `js/ble/state.js` — Shared BLE / transfer state as globals.
- `js/ble/frames.js` — Frame codec: CRC-16, L1 envelope, L2 command frame, and the safety firewall predicate.
- `js/ble/transport.js` — Serialized BLE write queue and ACK / reply waiters.
- `js/ble/connection.js` — Pair, discover, bind and post-bind sync; Stop button.
- `js/ble/notifications.js` — Inbound path: notification handler, L1 reassembly, L2 dispatch and TLV decoders.

**6. WATCH COMMANDS (alerts, weather, dial slots, explorer console)**
- `js/commands/alerts.js` — Outbound alert / action commands.
- `js/commands/weather.js` — Weather and time/unit commands.
- `js/commands/dial-slots.js` — Watch-face (dial) slot switching: 0x02/0x70=[slot].
- `js/protocol/explorer-runtime.js` — Command Explorer helpers: send a free-form cmd/key/payload and step through presets.

**7. FLASHING (FFB1 upload-mode probes + IC_568X OTA engine)**
- `js/dfu/ffb1-probe.js` — Experimental FFB1 upload-mode probes (Tab 3 buttons).
- `js/dfu/ota.js` — IC_568X OTA flash engine (service 00009966) — the "⚡ Flash to Watch" button.

**8. BOOT (initial layout, first frame, startup log lines)**
- `js/boot.js` — Initial layout, first animation frame, startup log lines.

**9. UI FRAMEWORK + PAGES (generators fill the HTML pool, then pages/mounts register themselves)**
- `js/ui/pool-generators.js` — Fills the placeholder containers in the HTML pool from the registries.
- `js/ui/shell.js` — HT37.ui: page registry + mount-unit registry + the bootstrap that builds tabs and toolboxes.
- `js/pages/studio/page.js` — Registers tab "Tab 1: 🎨 Watch Studio" — the watch face editor.
- `js/pages/alerts/page.js` — Registers tab "Tab 2: 🩺 Diagnostics" — alerts, weather, dial slots and the master command station.
- `js/pages/dfu/page.js` — Registers tab "Tab 3: ⚡ Flash to Watch" — OTA flashing controls.
- `js/pages/logs/page.js` — Registers tab "Tab 4: 📋 Logs" — filterable protocol log.
- `js/pages/studio/toolbox.js` — Creates the empty left toolbox window #studioToolboxWindow for Tab 1.
- `js/pages/studio/tool-0-canvas-layers.js` — Tab 1 tool 0 "Canvas & Layer Tools": Export .BIN + Center / Duplicate / Remove / Reset grid.
- `js/pages/studio/tool-1-add-widget.js` — Tab 1 tool 1 "Add Widget Layer": adopts the pooled #secAddWidgetBody (cards generated from HT37.widgets).
- `js/pages/studio/tool-2-screen-background.js` — Tab 1 tool 2 "Watch Screen & Background Layer": adopts #secScreenBgBody.
- `js/pages/studio/tool-3-live-sensors.js` — Tab 1 tool 3 "Live Sensors & Simulation": adopts #secSensorWeatherBody.
- `js/pages/alerts/toolbox.js` — Creates #alertsToolboxWindow and snapshots the pooled alert-tester controls once.
- `js/pages/alerts/tool-0-master-command.js` — Tab 2 tool 0 "Master Command Station": preset dropdown, CMD/KEY/PAYLOAD fields, Send, quick actions.
- `js/pages/alerts/tool-1-telephony.js` — Tab 2 tool 1 "Call & Telephony Dispatcher": sender/message/encoding inputs and call buttons.
- `js/pages/alerts/tool-2-social-notifications.js` — Tab 2 tool 2 "Social & App Notifications": 2-column grid of the generated 04/04–04/15 buttons.
- `js/pages/alerts/tool-3-weather-and-dial-slots.js` — Tab 2 tools 3 & 4: "Weather & Sky Dispatch" and "Dial Slot Switcher (02/70)".
- `js/pages/dfu/tools.js` — Tab 3 toolbox: flash trigger, FFB1 probes, config TLV tools, progress.
- `js/pages/logs/tools.js` — Tab 4 toolbox: copy / export / clear, category filters, text search.
- `js/pages/studio/stage.js` — Tab 1 center stage (zoomable WYSIWYG viewport + HUD) and the right column (layers + inspector).
- `js/ui/dock.js` — Persistent bottom log dock with minimize/expand.
- `js/ui/cleanup.js` — Hides every <body> child that is not header, nav, #studioMainContainer or the dock.
- `js/ui/tabs.js` — Tab switching and remembered tab.

**10. .BIN DECOMPILER / SPRITE VAULT (wraps drawWidget, getWidgetBounds, updateLiveSensorReadout)**
- `js/decompiler/vault.js` — TOPSTEP/TBUI .bin decompiler and "Sprite Vault" (Tab 1 right dock): decode, browse, edit, re-pack.

**12. START (must be last: schedules the page/mount run at DOMContentLoaded)**
- `js/ui/start.js` — Calls HT37.ui.start().

CSS (load order): `css/10-base.css` (header, buttons, panels, widget cards, terminal, raw-command boxes) →
`css/20-workspace.css` (tab system, 3-column/2-column grids, toolbox cards, bottom dock, the "universal button standard",
mostly `!important`) → `css/30-decompiler.css` (Sprite Vault cards/gallery).

## 5. Recipes
**Add a widget type** — copy any `js/editor/widgets/*.js`, change the fields, add its `<script>` in the editor block of `index.html`
(before `js/editor/render.js`). Card, quick-add entry, firmware-id option and renderer follow automatically.

**Add an outbound command** — add a row to `HT37_COMMAND_REGISTRY` (`js/protocol/command-registry.js`). To make it a notification button add a `ui` block (cmd 0x04). To make it selectable in the Master Command Station add an item to a group in `js/protocol/explorer-presets.js`.

**Send a command from new code** — `const {frame, seq} = buildFitCloudFrame(cmd, key, [payload…]); await enqueueBleWrite(cmdChar, frame, 'Label'); await waitForAck(seq);`. Never write to a characteristic directly: `enqueueBleWrite` serializes writes and applies the safety firewall.

**Handle a new inbound frame** — add a branch in `checkReassemblyComplete()` (`js/ble/notifications.js`).

**Add a toolbox card** — new `js/pages/<page>/tool-N-….js` with `HT37.ui.registerMount({ id, page, order, title, run(ctx) })`; adopt a pool section with `ctx.makeToolCard(num, title, element)`; add the `<script>` before `js/ui/start.js`.

**Add a tab** — `js/pages/<id>/page.js` with `HT37.ui.registerPage({...})` + its mounts. **Remove a tab/card** — delete its `<script>` tags.

## 6. Invariants — do not break
- Load order in `index.html` is significant (see §4). `js/ui/start.js` must be last; `js/core/namespace.js` first.
- **Safety firewall** (`isDangerousResetFrame` in `js/ble/frames.js`): blocks factory reset/unbind/power-off (0x02/0x40-0x45), language (0x02/0x3A), 0x02/0x65 and non-media cmd 0x07. Only `triggerFactoryResetPrompt()` may lift it, and only after `confirm()`.
- **OTA packet layouts** (`js/dfu/ota.js`) and CRCs are verified against the vendor SDK; change them only with a watch on the desk.
- Widget `draw()` and other canvas code use real colors — do not turn them into CSS variables.
- `js/ui/cleanup.js` hides every `<body>` child except header, nav, `#studioMainContainer`, `#persistentLogDock`. Always-visible UI must live in the header or inside a page.
- Some Diagnostics code locates pooled buttons by their **visible text** (e.g. "Find Watch Chime", "Push Weather", "Reset"). Renaming such a label can break its card.

## 7. Known gaps (found while documenting; none are regressions)
- `HT37_EVENT_REGISTRY`, `HT37.getEvent`, `HT37.formatEvent` are defined but never called (also true of the original monolith).
- `compileWatchfaceBin()` (`js/dfu/bin-compiler.js`) is never called; Export uses `rebuildActiveBin()`.
- `js/pages/alerts/tool-0-master-command.js` calls `sendWeather()`, which does not exist (guarded by `typeof`, so silently does nothing).
- `setDfuProgress` (UI) lives in `js/dfu/bin-compiler.js`.
- Inline styles and some JS-set styles hard-code a dark slate/cyan palette; there is no theme layer yet (Material 3 tokens, fonts and light/dark mode are not implemented).

## 8. Verifying a change
No test runner is included. Minimum check: load the page, confirm no console errors, switch through all 4 tabs, add and delete a layer, and open the Master Command Station dropdown. For protocol edits, compare the bytes of `buildFitCloudFrame(...)` before/after in the console.


## Dev test-face dropdown (temporary)
`js/dev/testbins-ui.js` + `js/dev/testbins/*.js` add a "TEST FACES" dropdown above "Load .BIN File" (8 sample faces, embedded base64,
loaded on demand so it works from file://). Remove when testing is done: delete the `js/dev/` folder and the one `<script src="js/dev/testbins-ui.js">`
line at the end of index.html. Nothing else references it.


## Face-widget templates (js/editor/face-widgets/)
Hardware widgets that exist inside a TOPSTEP/TBUI .bin are defined as self-contained templates here. `analog-hand.js` (HT37.faceWidgets.analogHand) owns the
.bin entry layout, editor widget object, rotation/draw/outline/hit-test, rounded-base centring, `createNew()` for from-scratch faces, `writeEntry()` for saving,
and the draggable dial-center handle. Load order: after js/editor/canvas-input.js, before js/decompiler/vault.js. vault.js and render.js/canvas-input.js call it
through window.getHandFrame / getWidgetOutline / hitTestWidget / drawWidgetOverlays / beginOverlayDrag.

## Sprite Studio (js/editor/sprite-studio.js) + style engine (js/editor/face-widgets/number-font.js)
Paint-style ribbon docked under the watch in #studioWysiwygViewport. Follows the selected number widget (wraps syncInspector) or the "Editing" dropdown.
Engine `HT37.faceWidgets.numberFont` styles the glyph set (M.fonts[hw.a]) non-destructively (sprite.origCanvas kept): source = original sprites
(palette recolor: detected color layers incl. opacity, so unlit/ghost segments can be recolored or hidden separately, + scale) or a typeface
(system / Google / installed / font file; size, bold, italic, equal-width digits, solid or gradient fill), then outline -> glow -> shadow -> letter spacing.
State: M.studio[fontIdx]; edited sprites carry `edited = true`; rebuildActiveBin() re-encodes them with encodePA and repacks offsets.
Vault gallery: window.refreshDecompGallery() re-renders thumbnails after each edit; EDITED badges on sprites and folders.
Flash-tested by the user: a moved + scaled glyph set (alpha sprites, changed w/h) displays correctly on the watch.

### Sprite Studio v2 notes
- Glyph cells keep the ORIGINAL sprite footprint x Size% (+ letter spacing); typefaces are fitted inside (one font size for the set, fitted to the "0" cell),
  effects are drawn inside the cell (inset by their margin) so layouts never move. Match-all therefore refits per font automatically.
- js/editor/history.js: undo/redo of style edits + widget moves (Ctrl+Z / Ctrl+Y, buttons in the zoom bar and the ribbon header).
- The floating preview box is a LIVE render of the editor canvas (vendor thumbnail sprite inside the .bin is not regenerated by edits).
- Ribbon tabs (Text / Color / Effects); every control has data-tip, mirrored in the help line.

## Editor layout (v3)
- `js/editor/layer-view.js` replaces `renderLayerList()`: thumbnail + plain-language title + what it shows + filter chips (Numbers / Labels / Gauges / Icons / Hands / Other). `HT37.layerView.describe(w)` maps a layer's `hwMeta` (type/sub/a) to `{kind, title, shows}`; add new widget kinds there. The list sits at the top of the LEFT column ("Layers"); "Add Widget Layer" starts collapsed.
- The ribbon under the watch (`js/editor/sprite-studio.js`) follows the selection: tab **Layer** holds the old Layer Inspector (`#inspectorBody` is moved into `#ssLayerPanel`, same ids); **Text / Color / Effects** appear only for number widgets (font editing). The right-dock "Layer Inspector" card is hidden.
- Language pairs (type 4): Chinese sprite first, English second, interleaved (weekday `a+2*day+lang`, AM/PM `a+2*pm+lang`, units `a+2*imperial+lang`, other labels `a+lang`). `js/editor/language-strip.js` can blank the Chinese halves to 1x1 (not flash-tested; off by default).
- Spelling: US English everywhere (color, center, catalog, serialize).

## Sprite groups and scope (v4)
- `js/editor/sprite-groups.js`: every sprite set the watch draws as one thing is a group (number font `f<i>`, label set, gauge, icon set, static picture; hands are listed but locked because flag-4 sprites cannot be written yet). `HT37.spriteGroups.list/get/getStyle/apply/reset/targets/propagate`. Non-number groups store their style in `M.studio['g:<kind>:<a>:<sub>']` (same style object as fonts, incl. `tint`).
- Sprite Studio edits any group and has an **Apply to** scope (this widget / all numbers / labels / gauges / icons / dynamic / static / everything / layers ticked in the Layers list). Each control declares which properties it changed; `propagate()` copies only those to the other groups in the scope, so a hue shift keeps the differences between sprites. Per-layer palette edits stay on the selected group.
- Tint (number-font.js `recolor`): `shift` = relative hue/saturation/brightness, `colorize` = one color with shading kept. Effects keep the original sprite size (content is fitted inside).
- `js/editor/live-data.js`: date and weekday follow the computer clock while the shared clock runs; steps and battery are requested from the connected watch every 20 s (0x05/0x21 today total -> reply 0x05/0x22 = steps, distance m, calories cal, big-endian u32s; 0x02/0x1B battery); values the watch pushes move the sliders. Verified on a real watch. Note: 0x05/0x06 is a small motion counter, NOT steps.

## Diagnostic face and the face builder (v5)
- `js/dfu/face-builder.js`: `HT37.faceBuilder.build(spec)` writes a brand-new TOPSTEP/TBUI .bin (widgets, sprites, fonts, PA pixel data, sizes, CRC) from a description. Only the fixed 1184-byte header (embedded, taken from face 1004189) is reused. Layout is in the file header comment. Round trip checked (parseTopstepBin decodes every sprite, CRC valid). Flash-tested on hardware: NOT YET.
- `js/editor/diagnostic-face.js`: builds the DIAGNOSTIC FACE (one numbered row per known value: time, date, year, day, hour, minute, seconds, weekday, AM/PM, weather, steps, heart rate, distance, calories, temperature, battery %). Labels and icons are baked into the background; values are real watch widgets. It is the default face at startup (set `window.HT37_noAutoFace = true` before load to disable) and has a "Diagnostic Face" button in the .BIN Decompiler card. Hands and gauges are not included yet.

## Rule: check the whole suite before adding anything (user instruction, Nov 1 2026)
Before building or offering any tool, button, command or widget:
1. Search the existing app for it (buttons, command registry, pages/mounts, widgets/*.js, docs/UNKNOWNS.md). Example: "Find Watch Chime (02/3B)" already exists in Tab 2 Diagnostics.
2. If it already exists, use it or extend it. Do not duplicate it.
3. If it is new, put it where it belongs by kind: watch commands and test tools -> Tab 2 Diagnostics; real watch-face widgets -> Add Widget Layer (js/editor/widgets/<type>.js with options); developer test faces -> the test-face list. If the right place is not obvious, suggest the location to the user instead of guessing.
4. Real widgets get options (fonts, colors, spacing, sizes, layout) per docs/WIDGET_ARCHITECTURE.md.

## Guiding principle: usable by a first-time user (user instruction, Nov 1 2026)
Anyone who has never seen this tool should be able to open it and use it without studying it or digging through its functions. For every change ask: could a newcomer find this without help?
- Clear names and places: plain-language names; each thing lives where a person would look for it (see the rule above).
- One home per thing: no duplicates; the layout follows what a person is trying to do (design a face, test the watch, flash a face).
- Built-in hints: short tips next to controls (data-tip, help line, one-line notes under sliders).
- Sensible defaults: things work with no setup (default icon style, one-click blank face, F/miles/12-hour defaults for US users).
A full first-time-user audit is on the to-do list in docs/UNKNOWNS.md.


## Studio 2 (editor2.html, new, separate from the classic editor)
A clean rewrite of the face editor in `js/studio2/` (classic scripts, namespace `HT37S`): `pa-codec.js` (picture format + checksum), `catalog.js` (what every watch widget is, in plain English, with tested/inferred/unknown status and sample values), `bin-model.js` (read a .bin, write moves in place), `renderer.js` (draws a face like the watch, incl. type 7 animations), `app.js` (page). It reuses only `face-builder.js`, `diagnostic-face.js` and `cyberpunk-face.js` (via `HT37_noMount`) to build our own faces. Not yet in Studio 2: pairing/flashing, adding widgets, sprite editing, vendor library (use `index.html`). Animation timing unit (`R.ANIM_UNIT_MS`) is a guess until measured on the watch.
