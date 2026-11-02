/**
 * @file     js/core/namespace.js
 * @layer    Core
 * @summary  Creates the single global namespace object `HT37` that every registry hangs off.
 *
 * ROLE
 *   - Must be the FIRST script. Other files do `HT37.<registry> = …` or `HT37.<registry>.register(…)`.
 *   - Registries: HT37.commands/events/reservedAlertKeys (protocol/command-registry.js), HT37.presets
 *     (protocol/explorer-presets.js), HT37.widgets (editor/widget-registry.js), HT37.ui (ui/shell.js).
 *
 * REGISTERS
 *   - HT37.version
 *
 * PROVIDES (globals)
 *   window. HT37
 *
 * LOAD ORDER
 *   #1 of 62, section "1. NAMESPACE + PROTOCOL DATA  (pure data, no DOM access)"
 *   after: (first)   before: js/protocol/command-registry.js
 *
 * NOTES
 *   - Application code (BLE, editor, DFU, commands) is NOT namespaced: it is plain global functions/variables
 *     shared by all classic scripts, because inline onclick="…" attributes in the HTML call them by bare name.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
// Creates the single shared namespace object. Every registry in the app hangs off it:
//   HT37.commands / HT37.events   -> js/protocol/command-registry.js
//   HT37.presets                  -> js/protocol/explorer-presets.js
//   HT37.widgets                  -> js/editor/widget-registry.js
//   HT37.ui                       -> js/ui/shell.js   (pages + mount units)
//   HT37.theme                    -> js/theme/theme.js
window.HT37 = window.HT37 || {};
HT37.version = '2.0.0';
