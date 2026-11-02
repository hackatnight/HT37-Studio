/**
 * @file     js/editor/widget-registry.js
 * @layer    Editor framework
 * @summary  HT37.widgets: registry of widget (layer) types; each type is one file in js/editor/widgets/.
 *
 * ROLE
 *   - register(def) validates the required fields (see REQUIRED in this file) and throws a descriptive error if
 *     one is missing or the type is duplicated.
 *   - get(type) and list() are used by the renderer, hit-testing, addWidget(), the card generator and the
 *     firmware-id dropdown.
 *
 * REGISTERS
 *   - HT37.widgets
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *
 * LOAD ORDER
 *   #8 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/editor/state.js   before: js/editor/widgets/compass.js
 *
 * HOW TO EXTEND
 *   - Adding a widget never requires editing this file: create js/editor/widgets/<type>.js and add its <script>
 *     tag to index.html (see AI_GUIDE.md).
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.widgets = (function () {
  const list = [];            // in registration order == order of the "Add Widget Layer" cards
  const byType = new Map();   // type -> definition (hot path: called for every layer on every animation frame)

  // Fields every widget definition must provide. A clear error here beats a blank canvas later.
  const REQUIRED = {
    type: 'string — unique id, also used as layer.type',
    icon: 'string — emoji shown on the Add-Widget card',
    label: 'string — card title',
    desc: 'string — card subtitle',
    cardSpan: 'number — 1 or 2 grid columns for the card',
    quickAdd: '{ label, order } — entry in the Widget Layers quick-add dropdown',
    fw: '{ id, label } — firmware widget id (hex string) + its label for the inspector dropdown',
    size: '{ w, h } — hit-box at scale 1.0, in watch pixels',
    defaults: '{ name, color, accent, text, fwId } — values of a newly added layer',
    draw: 'function (c, w, now) — canvas renderer, origin at the layer center',
  };

  /** Register a widget type. See any file in js/editor/widgets/ for a complete example. */
  function register(def) {
    const missing = Object.keys(REQUIRED).filter((k) => def == null || def[k] === undefined);
    if (missing.length) {
      throw new Error('HT37.widgets.register(' + (def && def.type) + '): missing ' +
        missing.map((k) => k + ' (' + REQUIRED[k] + ')').join('; '));
    }
    if (byType.has(def.type)) throw new Error('HT37.widgets.register: duplicate widget type "' + def.type + '"');
    list.push(def);
    byType.set(def.type, def);
  }

  return {
    register,
    get: (type) => byType.get(type),
    list: () => list.slice(),
  };
})();
