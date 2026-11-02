/**
 * @file     js/ui/helpers.js
 * @layer    UI helper
 * @summary  toggleSectionCollapse(): collapses a legacy section (used by inline onclick in the pool markup).
 *
 * ROLE
 *   - Toggles class "collapsed" on the title element and "collapsed-body" on the body element with the given
 *     id.
 *
 * PROVIDES (globals)
 *   function toggleSectionCollapse
 *
 * LOAD ORDER
 *   #6 of 62, section "2. CORE  (logging, small UI helpers)"
 *   after: js/core/log.js   before: js/editor/state.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
function toggleSectionCollapse(titleEl, bodyId) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  titleEl.classList.toggle('collapsed');
  body.classList.toggle('collapsed-body');
}
