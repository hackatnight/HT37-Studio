/**
 * @file     js/boot.js
 * @layer    Boot
 * @summary  Initial layout, first animation frame, startup log lines.
 *
 * ROLE
 *   - createDefaultWidgets(); requestAnimationFrame(animateLoop); two log() lines.
 *
 * USES (defined in other files)
 *   - js/editor/layers.js: createDefaultWidgets
 *   - js/editor/render.js: animateLoop
 *   - js/core/log.js: log
 *
 * LOAD ORDER
 *   #38 of 62, section "8. BOOT  (initial layout, first frame, startup log lines)"
 *   after: js/dfu/ota.js   before: js/ui/pool-generators.js
 *
 * NOTES
 *   - Runs while the page loads, before the UI shell builds the tabs (that happens at DOMContentLoaded).
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
createDefaultWidgets();

requestAnimationFrame(animateLoop);

log('HT37 Web Bluetooth WYSIWYG Watchface Studio Initialized.', 'ok');

log('👉 Pair & Bind, then click "🔬 2. Discover Trigger (Safe)" with Scope 1 ("Test 0x7C/0xAD/0xB0 Dial Keys + Bumped OTA")!', 'rx');
