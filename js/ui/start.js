/**
 * @file     js/ui/start.js
 * @layer    UI framework
 * @summary  Calls HT37.ui.start().
 *
 * ROLE
 *   - Must be the LAST script: by then every page and mount has registered itself.
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *
 * LOAD ORDER
 *   #62 of 62, section "12. START  (must be last: schedules the page/mount run at DOMContentLoaded)"
 *   after: js/decompiler/vault.js   before: (last)
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.start();
