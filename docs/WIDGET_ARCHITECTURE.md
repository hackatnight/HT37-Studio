# Widget architecture: every discovery becomes a widget in the editor

Goal (from the user): the point of decoding the watch is to build a custom face. Every tool we build must be a WIDGET the user can add
to a face in the editor, with its options in the inspector, not a stray panel or test face.

## Where things are today (the problem)
- The editor's "Add Widget Layer" cards (js/editor/widgets/*.js) are canvas-only mock widgets (compass, steps ring...). They are not
  written into a .bin; they only draw on the stage.
- Real watch widgets only exist inside decompiled vendor faces. rebuildActiveBin() can only move them / re-encode sprites; it cannot ADD a widget.
- The forecast widget, live weather sync and test faces were added as separate panels (decompiler card, Alerts tab). That is the wrong place.

## Target design
1. Hardware widget registry: HT37.hwWidgets.register({ id, label, icon, group, options (schema), build(opts, add, ox, oy) -> {widgets, fonts, drawStatic, size} }).
   The forecast widget (js/editor/forecast-face.js build()) is already shaped like this; it becomes the first entry. Next entries: today weather icon,
   today high/low, motion (3/61), time, date, steps, heart rate, battery %, humidity (when found).
2. "Add Widget Layer" card lists hardware widgets first. Clicking one adds a layer to the face project; its options (days, layout, colors, size)
   appear in the Inspector; drag on the stage to place it.
3. Face project = background + list of placed hardware widgets. Export / Flash builds the .bin with HT37.faceBuilder (from scratch).
   Phase 2: convert a decompiled vendor face to a project (sprites + widgets + fonts) so widgets can be added to existing faces too.
4. Data/commands that feed a widget live WITH the widget: the forecast widget shows a "Sync weather" control in its inspector (live-weather.js),
   not in the Alerts tab. The Alerts tab keeps only generic command tools.
5. Test/probe faces (diagnostic-face.js) stay in a clearly labeled "Developer test faces" group.

## Order of work
1. hwWidgets registry + project model + Add Widget cards + inspector options + build/export (new faces).
2. Move forecast widget + live weather sync into it. Add today-weather and motion widgets.
3. Vendor face -> project conversion (add widgets to existing faces).


## Status (Nov 1 2026)
DONE (first version, new faces only):
- Widget type `forecast` (js/editor/widgets/forecast.js) is a card in Add Widget Layer; options (days, layout, spacing, icon/number size, icon style, icon/high/low colors) show in the Selected Layer Inspector (js/editor/widget-options.js; any widget type can opt in with `controls`).
- A widget type with `hw: { build, sizeOf }` is a REAL watch widget. js/editor/face-project.js builds the .bin from those layers (HT37.faceBuilder) when you Flash or Export; preview-only widgets are skipped with a log line. "New blank face" button starts a project; adding a real widget auto-starts one over a built-in test face.
- Icon styles (js/editor/weather-icons.js): Line and Solid (drawn by this tool), Material Symbols (Apache 2.0, loaded from Google Fonts), System emoji (not open source). No art is copied from other watch faces.
- The weather sync tool stays in the Diagnostics tab for testing.
TODO: today-weather and motion widgets; adding real widgets to a loaded vendor face; day-name label; preview with the user's real forecast; move the test faces to a developer group.

## Design rule: every widget has options (user request, Nov 1 2026)
Every widget type in Add Widget Layer must define `controls` (see js/editor/widget-options.js) so its look is editable in the inspector, not hard-coded. Standard set where it applies:
- font family (47 open-source Google fonts + "any Google font" name + system font), bold, number size, colors
- icon style (Line / Solid / Material Symbols / emoji), icon size and color
- spacing (0 = 1 px between neighbours), layout variants (column / strip ...), how many items
- widget-specific options (days, digits reserved, units, label on/off, ...)
Real watch widgets ignore Scale and Opacity (the watch cannot scale or fade them), so those inspector rows are hidden for them.
TODO: give the preview-only widgets (compass, steps ring, heart rate, battery, date, time ...) the same kind of options and make them real watch widgets one by one.

- Real from-scratch hardware widgets now: `forecast` and `bluetooth` (type 6 sub 0, two-state link icon).
