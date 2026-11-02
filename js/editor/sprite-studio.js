/**
 * @file     js/editor/sprite-studio.js
 * @layer    EDITOR UI
 * @summary  "Sprite Studio": ribbon docked under the watch for styling the glyph set (TBUI font) behind a number widget.
 *           Tabs: TEXT (typeface, size, spacing) / COLOR (color layers or fill) / EFFECTS (outline, glow, shadow, presets).
 *           Header: which font set is edited, undo / redo, file-size meter, match-all, reset. Every control has a tooltip, and the
 *           hover text is mirrored in the help line so nothing has to be guessed. Engine: js/editor/face-widgets/number-font.js.
 *
 * BEHAVIOR
 *   - Follows the canvas selection (wraps syncInspector); the "Editing" dropdown switches font set without selecting a widget.
 *   - Controls edit the live style object (M.studio[fontIdx]); the style is re-applied once per animation frame, the watch canvas,
 *     the live preview box and the vault thumbnails update at once, and the edit is committed to the undo history (js/editor/history.js).
 *   - Glyphs always keep the footprint of the original sprites x Size%, so numbers never move or overflow; the typeface is fitted inside.
 */
(function () {
  window.HT37 = window.HT37 || {};
  const NF = () => HT37.faceWidgets.numberFont;
  const GOOGLE = ['Orbitron', 'Rajdhani', 'Audiowide', 'Share Tech Mono', 'Chakra Petch', 'Teko', 'Oswald', 'Bebas Neue', 'Roboto', 'Roboto Mono', 'Major Mono Display', 'Press Start 2P', 'VT323', 'Silkscreen'];
  const SYSTEM = ['Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Segoe UI', 'Calibri', 'Consolas', 'Courier New', 'Georgia', 'Times New Roman', 'Impact', 'DejaVu Sans', 'monospace'];
  const HELP0 = '💡 Hover any control to see what it does.';

  let ribbon = null, curKey = '', pending = 0, collapsed = false, tab = 'layer', scope = 'selected';
  const pendingProps = new Set(), SG = () => HT37.spriteGroups;
  const $ = (id) => document.getElementById(id);
  const M = () => window.decompiledBinData;
  const style = () => (M() && curKey ? SG().getStyle(M(), curKey) : null);

  const CSS = `
  #spriteStudio{position:relative;flex:0 0 auto;width:100%;box-sizing:border-box;z-index:12;background:#0f1522;border-top:2px solid #f59e0b;color:#cbd5e1;font-size:11px;box-shadow:0 -8px 24px rgba(0,0,0,.45)}
  #spriteStudio *{box-sizing:border-box}
  #spriteStudio .ss-head{display:flex;align-items:center;gap:8px;padding:4px 8px;background:#161f32;border-bottom:1px solid #26334d;white-space:nowrap}
  #spriteStudio .ss-title{font-weight:800;color:#f59e0b;letter-spacing:.5px}
  #spriteStudio select,#spriteStudio input[type=number]{background:#0b1020;color:#e2e8f0;border:1px solid #334155;height:24px;font-size:11px}
  #spriteStudio button{background:#1b2740;color:#e2e8f0;border:1px solid #334155;height:24px;min-width:26px;padding:0 8px;font-size:11px;cursor:pointer;border-radius:3px}
  #spriteStudio button:hover:not(:disabled){border-color:#f59e0b}
  #spriteStudio button.on{background:#f59e0b;color:#111827;border-color:#f59e0b}
  #spriteStudio .ss-tabs{display:flex;align-items:flex-end;gap:2px;padding:4px 8px 0;background:#0f1522;border-bottom:1px solid #26334d}
  #spriteStudio .ss-tab{height:24px;border-radius:4px 4px 0 0;border-bottom:none;background:#131b2c;color:#94a3b8;font-weight:700}
  #spriteStudio .ss-tab.on{background:#1b2740;color:#f59e0b;border-color:#f59e0b}
  #spriteStudio #ssHelp{margin-left:auto;align-self:center;color:#94a3b8;font-style:italic;overflow:hidden;text-overflow:ellipsis;max-width:62%}
  #spriteStudio .ss-panel{display:none;gap:8px;padding:8px;align-items:stretch;overflow-x:auto;min-height:74px}
  #spriteStudio .ss-panel.on{display:flex}
  #spriteStudio .ss-card{display:flex;flex-direction:column;gap:5px;padding:6px 9px;background:#121a2b;border:1px solid #26334d;border-radius:5px;min-width:150px}
  #spriteStudio .ss-card>b{font-size:10px;color:#f59e0b;letter-spacing:.4px;text-transform:uppercase}
  #spriteStudio .ss-row{display:flex;align-items:center;gap:6px}
  #spriteStudio .ss-ctl{display:flex;align-items:center;gap:6px}
  #spriteStudio .ss-ctl>span{width:54px;color:#94a3b8}
  #spriteStudio .ss-ctl output{width:34px;text-align:right;font-family:var(--font-mono);color:#e2e8f0}
  #spriteStudio input[type=range]{width:96px;height:14px}
  #spriteStudio input[type=color]{width:28px;height:24px;padding:0;border:1px solid #334155;background:none;cursor:pointer}
  #spriteStudio .ss-sw{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:9px;color:#64748b}
  #spriteStudio .ss-sw input[type=color]{width:34px;height:30px}
  #spriteStudio .ss-sw input[type=number]{width:44px;height:18px;font-size:10px;padding:0 2px}
  #spriteStudio .ss-strip{display:flex;align-items:center;gap:12px;padding:4px 8px;background:#0a0f1a;border-top:1px solid #26334d}
  #spriteStudio canvas.ss-prev{background:repeating-conic-gradient(#1a2233 0% 25%,#222c42 0% 50%) 0 0/12px 12px;border:1px solid #334155;image-rendering:pixelated;height:40px;max-width:46%}
  #wysiwygBinPreviewBox{bottom:calc(var(--ss-h,0px) + 12px) !important}
  #spriteStudio .ss-muted{color:#64748b}
  #ssLayerPanel #inspectorBody{display:flex !important;flex-direction:row !important;flex-wrap:wrap;align-items:center;gap:6px 18px;width:100%;padding:0;margin:0;max-height:none;overflow:visible}
  #ssLayerPanel #inspectorBody .field-row{margin:0;display:inline-flex;align-items:center;gap:6px;width:auto;flex:0 0 auto}
  #ssLayerPanel #inspectorBody label{font-size:10px;color:#94a3b8;white-space:nowrap;margin:0}
  #ssLayerPanel #inspectorBody .field-row input[type=range]{width:96px}
  #ssLayerPanel #inspectorBody .field-row input[type=text]{width:120px}
  #ssLayerPanel #inspectorBody .field-row select{width:auto;max-width:170px}
  #ssLayerPanel #inspectorBody .field-row input[type=color]{width:34px;padding:0}
  #spriteStudio .ss-warn{color:#f59e0b;padding:2px 8px;background:#1c1608;display:none}
  `;

  // tiny HTML builders -------------------------------------------------------------------------------------------------
  const tip = (t) => ' data-tip="' + t.replace(/"/g, '&quot;') + '"';
  const slider = (id, label, min, max, step, t) => '<label class="ss-ctl"' + tip(t) + '><span>' + label + '</span><input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + (step || 1) + '"><output id="' + id + 'V"></output></label>';
  const check = (id, label, t) => '<label class="ss-row"' + tip(t) + '><input type="checkbox" id="' + id + '"> ' + label + '</label>';
  const color = (id, t) => '<input type="color" id="' + id + '"' + tip(t) + '>';
  const opt = (list) => list.map((f) => '<option value="' + f + '">' + f + '</option>').join('');

  function build() {
    const stage = document.getElementById('studioWysiwygViewport'); // flex column: zoom bar, watch (flex 1), ribbon
    if (ribbon || !stage) return !!ribbon;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    ribbon = document.createElement('div'); ribbon.id = 'spriteStudio';
    ribbon.innerHTML =
      '<div class="ss-head"><span class="ss-title" id="ssTitle">🎛️ EDITOR</span>' +
      '<label class="ss-row"' + tip('Which set of digit sprites (font) you are editing. Selecting a number on the watch switches to its font automatically.') + '>Editing <select id="ssFont" style="max-width:260px"></select></label>' +
      '<label class="ss-row"' + tip('Which sprite sets your edits reach. "This widget only" changes just the selected one. Pick "All numbers", "All dynamic", "All static" etc. to restyle a whole group at once, or tick layers in the Layers list and choose "Layers I ticked". Hue shifts keep the differences between sprites, so the face does not turn one flat color.') + '>Apply to <select id="ssScope" style="max-width:200px">' + SG().SCOPES.map((x) => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select></label><span id="ssScopeN" class="ss-muted"></span>' +
      '<span id="ssUse" class="ss-muted" style="overflow:hidden;text-overflow:ellipsis"></span><span style="flex:1"></span>' +
      '<button id="ssUndo"' + tip('Undo the last style edit or move (Ctrl+Z)') + '>↶ Undo</button><button id="ssRedo"' + tip('Redo (Ctrl+Y)') + '>↷ Redo</button>' +
      '<span id="ssMeter" class="ss-muted" style="font-family:var(--font-mono)"' + tip('Size of the edited sprites after re-encoding, and the resulting .bin size. The watch has limited space, so keep an eye on it (glows and gradients cost the most).') + '></span>' +
      '<button id="ssReset"' + tip('Throw away all edits of the sprite sets in the current scope and restore the originals.') + '>↺ Reset</button>' +
      '<button id="ssToggle"' + tip('Collapse or expand Sprite Studio') + '>▾</button></div>' +
      '<div id="ssWarn" class="ss-warn"></div>' +
      '<div id="ssBody"><div class="ss-tabs">' +
      '<button class="ss-tab on" data-tab="layer"' + tip('Position, size and visibility of the selected layer') + '>📐 Layer</button>' +
      '<button class="ss-tab" data-tab="text"' + tip('Typeface, size and spacing of the digits') + '>🔤 Text</button>' +
      '<button class="ss-tab" data-tab="color"' + tip('Change the colors of the digits') + '>🎨 Color</button>' +
      '<button class="ss-tab" data-tab="fx"' + tip('Outline, glow and drop shadow, plus one-click presets') + '>✨ Effects</button>' +
      '<span id="ssHelp">' + HELP0 + '</span></div>' +
      // ---- TEXT
      '<div class="ss-panel on" data-panel="layer" id="ssLayerPanel"></div>' +
      '<div class="ss-panel" data-panel="text">' +
      '<div class="ss-card"><b>Typeface</b><div class="ss-row"><select id="ssFamily" style="width:150px"' + tip('Draw the digits from a typeface instead of the vendor sprites. "Original sprites" keeps the vendor look. Google fonts need an internet connection.') + '><option value="">Original sprites</option>' +
      '<optgroup label="System">' + opt(SYSTEM) + '</optgroup><optgroup label="Google (needs internet)">' + opt(GOOGLE) + '</optgroup><optgroup label="Your fonts" id="ssUserFonts"></optgroup></select>' +
      '<button id="ssFile"' + tip('Load your own font file (.ttf .otf .woff .woff2)') + '>📂</button><button id="ssLocal"' + tip('List the fonts installed on this PC (Chrome asks for permission once)') + '>💻</button><input type="file" id="ssFileIn" accept=".ttf,.otf,.woff,.woff2" style="display:none"></div>' +
      '<div class="ss-row" id="ssStyleRow"><button id="ssB" style="font-weight:800"' + tip('Bold') + '>B</button><button id="ssI" style="font-style:italic"' + tip('Italic') + '>I</button>' + check('ssTab', 'equal-width digits', 'Give every digit the same width so the number does not jiggle when digits change (recommended for clocks)') + '</div></div>' +
      '<div class="ss-card"><b>Size &amp; spacing</b>' + slider('ssScale', 'Size', 50, 200, 5, 'Scales every digit cell. 100% = exactly the footprint of the original numbers. The text is fitted inside its cell, so it can never overflow or overlap.') +
      slider('ssSp', 'Spacing', -6, 12, 1, 'Extra space between digits in pixels (negative = tighter). Changes the width of every glyph.') + '</div></div>' +
      // ---- COLOR
      '<div class="ss-panel" data-panel="color">' +
      '<div class="ss-card" id="ssCardLayers"><b>Color layers of the original digits</b><div class="ss-row" id="ssPalette"></div><span class="ss-muted" style="max-width:360px">Each swatch is one color layer found in the original sprites: pick a new color, or set its opacity to 0 to hide it. Faint layers are usually the unlit segments.</span></div>' +
      '<div class="ss-card" id="ssCardFill"><b>Fill</b><div class="ss-row">' + color('ssF1', 'Digit color (top color when gradient is on)') + check('ssGrad', 'gradient', 'Blend from the first color at the top of the digits to the second at the bottom') + color('ssF2', 'Bottom color of the gradient') + '</div></div>' +
      '<div class="ss-card" id="ssCardTint"><b>Tint (whole scope)</b><div class="ss-row"><button data-tint="none"' + tip('No tint') + '>None</button><button data-tint="shift"' + tip('Relative: turns every color around the color wheel and changes saturation and brightness. Keeps the differences between sprites, so the face does not turn one flat color.') + '>Shift</button><button data-tint="colorize"' + tip('Absolute: every pixel takes this color; its light and dark parts stay light and dark.') + '>Set color</button>' + color('ssTCol', 'The color used by "Set color" (typeface digits use their own Fill color)') + '</div>' +
      slider('ssTHue', 'Hue', -180, 180, 5, 'Rotate all colors around the color wheel, in degrees') + slider('ssTSat', 'Saturation', -100, 100, 5, 'Less or more vivid') + slider('ssTLight', 'Brightness', -100, 100, 5, 'Darker or lighter') + '</div></div>' +
      // ---- EFFECTS
      '<div class="ss-panel" data-panel="fx">' +
      '<div class="ss-card"><b>Outline</b><div class="ss-row">' + check('ssOutOn', 'on', 'Draw a solid outline around the digits') + color('ssOutC', 'Outline color') + '</div>' + slider('ssOutW', 'Width', 1, 5, 1, 'Outline thickness in pixels') + '</div>' +
      '<div class="ss-card"><b>Glow</b><div class="ss-row">' + check('ssGlowOn', 'on', 'Soft light around the digits') + color('ssGlowC', 'Glow color') + '</div>' + slider('ssGlowR', 'Radius', 1, 12, 1, 'How far the glow spreads (pixels)') + slider('ssGlowS', 'Power', 1, 4, 1, 'How strong the glow is') + '</div>' +
      '<div class="ss-card"><b>Shadow</b><div class="ss-row">' + check('ssShOn', 'on', 'Drop shadow behind the digits') + color('ssShC', 'Shadow color') + '</div>' +
      '<div class="ss-row">' + slider('ssShX', 'Left/Right', -6, 6, 1, 'Horizontal shadow offset') + slider('ssShY', 'Up/Down', -6, 6, 1, 'Vertical shadow offset') + '</div>' +
      '<div class="ss-row">' + slider('ssShB', 'Blur', 0, 8, 1, 'Edge softness') + slider('ssShO', 'Opacity', 10, 100, 5, 'Shadow strength (%)') + '</div></div>' +
      '<div class="ss-card"><b>Presets</b><div class="ss-row"><button data-preset="neon"' + tip('Glow in the main color') + '>Neon</button><button data-preset="outline"' + tip('Black 2px outline') + '>Outlined</button></div><div class="ss-row"><button data-preset="shadow"' + tip('Soft black drop shadow') + '>Shadow</button><button data-preset="clean"' + tip('Turn all effects off') + '>No effects</button></div></div></div>' +
      '<div class="ss-strip" id="ssStrip"><span class="ss-muted"' + tip('The selected number exactly as it will look on the watch (3x)') + '>On watch (3×)</span><canvas class="ss-prev" id="ssSample"' + tip('The selected number as it will look on the watch (3x)') + '></canvas>' +
      '<span class="ss-muted">All glyphs (2×)</span><canvas class="ss-prev" id="ssPrev"' + tip('Every glyph sprite of this font (2x)') + '></canvas><span id="ssDims" class="ss-muted"></span></div></div>';
    stage.appendChild(ribbon);
    moveInspector();
    ribbon.querySelectorAll('[data-tip]').forEach((e) => { e.title = e.dataset.tip; });
    ribbon.addEventListener('mouseover', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); $('ssHelp').textContent = t ? '💡 ' + t.dataset.tip : HELP0; });
    ribbon.addEventListener('mouseleave', () => { $('ssHelp').textContent = HELP0; });
    wire();
    layout();
    return true;
  }

  /** The old right-dock "Layer Inspector" lives inside the ribbon's Layer tab now (same element ids, so inspector.js keeps working). */
  function moveInspector() {
    const insp = $('inspectorBody'), host = $('ssLayerPanel'); if (!insp || !host || insp.parentElement === host) return;
    let card = insp.parentElement, hide = null;
    for (let i = 0; i < 5 && card && card !== document.body; i++, card = card.parentElement) { if (/Layer Inspector/i.test(card.textContent)) { hide = card; break; } }
    host.appendChild(insp); insp.classList.remove('collapsed'); insp.style.display = '';
    if (hide && !hide.contains(ribbon)) hide.style.display = 'none';
  }

  function layout() { // let the watch area shrink instead of being covered by the ribbon
    const sc = $('wysiwygScrollStage'); if (sc) sc.style.minHeight = '0';
    const vp = $('studioWysiwygViewport'); if (vp && ribbon) vp.style.setProperty('--ss-h', (ribbon.style.display === 'none' ? 0 : ribbon.offsetHeight) + 'px');
  }

  function showTab(t) { tab = t; ribbon.querySelectorAll('.ss-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t)); ribbon.querySelectorAll('.ss-panel').forEach((p) => p.classList.toggle('on', p.dataset.panel === t)); layout(); }

  /** props = which properties this edit changed (they are copied to the other sprite sets in the scope). No props = only this set (e.g. one color layer). */
  function schedule(props) {
    (props || []).forEach((p) => pendingProps.add(p));
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0; const s = style(), pr = [...pendingProps]; pendingProps.clear();
      if (s && M()) { SG().apply(M(), curKey, s); if (pr.length) SG().propagate(M(), curKey, scope, pr); update(false); if (HT37.history) HT37.history.commitSoon(); }
    });
  }
  const propsFor = (id) => {
    if (!id) return [];
    if (id === 'ssScale') return ['scale']; if (id === 'ssSp') return ['spacing']; if (id === 'ssB') return ['bold']; if (id === 'ssI') return ['italic']; if (id === 'ssTab') return ['tabular'];
    if (/^ss(F1|F2|Grad)$/.test(id)) return ['fill']; if (/^ss(Out|Glow|Sh)/.test(id)) return ['effects']; if (/^ssT(Col|Hue|Sat|Light)$/.test(id)) return ['tint'];
    return [];
  };

  /** Make sure a typeface is really available before glyphs are drawn. Returns false when it could not be loaded (offline / blocked / unknown). */
  async function ensureFamily(fam) {
    if (!fam) return true;
    if (GOOGLE.includes(fam) && !document.querySelector('link[data-ssfont="' + fam + '"]')) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.ssfont = fam;
      // no weight list: several of these families only have a 400 weight and the whole request would fail with "wght@400;700"
      l.href = 'https://fonts.googleapis.com/css2?family=' + fam.replace(/ /g, '+') + '&display=swap';
      const ready = new Promise((res) => { l.onload = () => res(true); l.onerror = () => res(false); setTimeout(() => res(false), 6000); });
      document.head.appendChild(l);
      if (!(await ready)) { l.remove(); return false; }
    }
    try { await Promise.race([document.fonts.load('16px "' + fam + '"', '0123456789'), new Promise((r) => setTimeout(r, 5000))]); } catch (e) { return false; }
    return !GOOGLE.includes(fam) || [...document.fonts].some((f) => f.family.replace(/["']/g, '') === fam && f.status === 'loaded');
  }

  function wire() {
    const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
    const edit = (fn) => (e) => { const s = style(); if (!s) return; fn(s); outputs(); schedule(propsFor(e && e.target && e.target.id)); };
    ribbon.querySelectorAll('.ss-tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    on('ssFont', 'change', () => { curKey = $('ssFont').value; update(true); });
    on('ssScope', 'change', () => { scope = $('ssScope').value; update(false); });
    on('ssFamily', 'change', async () => {
      const s = style(); if (!s) return; const fam = $('ssFamily').value;
      if (!fam) s.source = 'original';
      else {
        $('ssHelp').textContent = '\u23F3 Loading font "' + fam + '"\u2026';
        const ok = await ensureFamily(fam);
        s.source = 'font'; s.family = fam;
        if (!ok) { $('ssHelp').textContent = '\u26A0 "' + fam + '" could not be loaded (offline, blocked or not installed) - showing a fallback font.'; if (typeof log === 'function') log('Typeface "' + fam + '" could not be loaded; using a fallback.', 'warn'); }
        else $('ssHelp').textContent = HELP0;
      }
      schedule(['source', 'family']); update(true);
    });
    on('ssScale', 'input', edit((s) => { s.scale = Number($('ssScale').value); }));
    on('ssB', 'click', edit((s) => { s.bold = !s.bold; $('ssB').classList.toggle('on', s.bold); }));
    on('ssI', 'click', edit((s) => { s.italic = !s.italic; $('ssI').classList.toggle('on', s.italic); }));
    on('ssTab', 'change', edit((s) => { s.tabular = $('ssTab').checked; }));
    on('ssF1', 'input', edit((s) => { s.fill.c1 = $('ssF1').value; }));
    on('ssF2', 'input', edit((s) => { s.fill.c2 = $('ssF2').value; s.fill.grad = true; $('ssGrad').checked = true; }));
    on('ssGrad', 'change', edit((s) => { s.fill.grad = $('ssGrad').checked; }));
    const fx = (grp, id, onId) => { const f = (s) => { s[grp].on = true; $(onId).checked = true; }; return f; };
    on('ssOutOn', 'change', edit((s) => { s.outline.on = $('ssOutOn').checked; }));
    on('ssOutC', 'input', edit((s) => { s.outline.color = $('ssOutC').value; fx('outline', 0, 'ssOutOn')(s); }));
    on('ssOutW', 'input', edit((s) => { s.outline.width = Number($('ssOutW').value); fx('outline', 0, 'ssOutOn')(s); }));
    on('ssGlowOn', 'change', edit((s) => { s.glow.on = $('ssGlowOn').checked; }));
    on('ssGlowC', 'input', edit((s) => { s.glow.color = $('ssGlowC').value; fx('glow', 0, 'ssGlowOn')(s); }));
    on('ssGlowR', 'input', edit((s) => { s.glow.radius = Number($('ssGlowR').value); fx('glow', 0, 'ssGlowOn')(s); }));
    on('ssGlowS', 'input', edit((s) => { s.glow.strength = Number($('ssGlowS').value); fx('glow', 0, 'ssGlowOn')(s); }));
    on('ssShOn', 'change', edit((s) => { s.shadow.on = $('ssShOn').checked; }));
    on('ssShC', 'input', edit((s) => { s.shadow.color = $('ssShC').value; fx('shadow', 0, 'ssShOn')(s); }));
    [['X', 'dx'], ['Y', 'dy'], ['B', 'blur'], ['O', 'opacity']].forEach(([k, f]) => on('ssSh' + k, 'input', edit((s) => { s.shadow[f] = Number($('ssSh' + k).value); fx('shadow', 0, 'ssShOn')(s); })));
    on('ssSp', 'input', edit((s) => { s.spacing = Number($('ssSp').value); }));
    ribbon.querySelectorAll('[data-tint]').forEach((b) => b.addEventListener('click', () => {
      const s = style(); if (!s) return; s.tint.mode = b.dataset.tint; if (s.tint.mode === 'none') { s.tint.hue = s.tint.sat = s.tint.light = 0; }
      update(true); schedule(['tint']);
    }));
    on('ssTHue', 'input', edit((s) => { s.tint.hue = Number($('ssTHue').value); s.tint.mode = 'shift'; }));
    on('ssTSat', 'input', edit((s) => { s.tint.sat = Number($('ssTSat').value); s.tint.mode = 'shift'; }));
    on('ssTLight', 'input', edit((s) => { s.tint.light = Number($('ssTLight').value); s.tint.mode = 'shift'; }));
    on('ssTCol', 'input', edit((s) => { s.tint.color = $('ssTCol').value; s.tint.mode = 'colorize'; }));
    ribbon.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      const s = style(); if (!s) return; const k = b.dataset.preset, main = s.source === 'font' ? s.fill.c1 : ((s.palette && s.palette[0]) ? s.palette[0].color : '#00e5ff');
      s.outline.on = s.glow.on = s.shadow.on = false;
      if (k === 'neon') s.glow = { on: true, color: main, radius: 4, strength: 2 };
      if (k === 'outline') s.outline = { on: true, color: '#000000', width: 2 };
      if (k === 'shadow') s.shadow = { on: true, color: '#000000', dx: 2, dy: 2, blur: 2, opacity: 80 };
      schedule(['effects']); update(true);
    }));
    on('ssReset', 'click', () => { if (M() && curKey) { SG().targets(M(), scope, curKey).forEach((g) => SG().reset(M(), g.key)); update(true); if (HT37.history) HT37.history.commitSoon(); } });
    on('ssUndo', 'click', () => HT37.history && HT37.history.undo());
    on('ssRedo', 'click', () => HT37.history && HT37.history.redo());
    on('ssToggle', 'click', () => { collapsed = !collapsed; $('ssBody').style.display = collapsed ? 'none' : ''; $('ssToggle').textContent = collapsed ? '▴' : '▾'; layout(); });
    on('ssFile', 'click', () => $('ssFileIn').click());
    on('ssFileIn', 'change', async () => {
      const f = $('ssFileIn').files[0]; if (!f) return; const name = f.name.replace(/\.[^.]+$/, '');
      try { const ff = new FontFace(name, await f.arrayBuffer()); await ff.load(); document.fonts.add(ff); addUserFont(name); $('ssFamily').value = name; $('ssFamily').dispatchEvent(new Event('change')); }
      catch (e) { if (typeof log === 'function') log('Font file could not be loaded: ' + e.message, 'err'); }
    });
    on('ssLocal', 'click', async () => {
      if (!window.queryLocalFonts) { if (typeof log === 'function') log('This browser cannot list installed fonts - use the 📂 font file button instead.', 'warn'); return; }
      try { const list = await window.queryLocalFonts(); [...new Set(list.map((x) => x.family))].sort().forEach(addUserFont); if (typeof log === 'function') log('Installed fonts are listed under "Your fonts".', 'ok'); }
      catch (e) { if (typeof log === 'function') log('Installed fonts: ' + e.message, 'warn'); }
    });
  }

  function addUserFont(name) {
    const g = $('ssUserFonts'); if (!g || [...g.children].some((o) => o.value === name)) return;
    const o = document.createElement('option'); o.value = name; o.textContent = name; g.appendChild(o);
  }

  function outputs() {
    const s = style(); if (!s) return;
    const set = (id, t) => { const e = $(id + 'V'); if (e) e.textContent = t; };
    set('ssScale', s.scale + '%'); set('ssSp', s.spacing + 'px'); set('ssOutW', s.outline.width + 'px'); set('ssGlowR', s.glow.radius + 'px'); set('ssGlowS', s.glow.strength);
    if (s.tint) { set('ssTHue', s.tint.hue + '°'); set('ssTSat', s.tint.sat); set('ssTLight', s.tint.light); ribbon.querySelectorAll('[data-tint]').forEach((b) => b.classList.toggle('on', b.dataset.tint === s.tint.mode)); }
    set('ssShX', s.shadow.dx); set('ssShY', s.shadow.dy); set('ssShB', s.shadow.blur); set('ssShO', s.shadow.opacity + '%');
  }

  /** Write the style into the controls (full = rebuild every control, otherwise only the readouts). */
  function update(full) {
    const m = M(), s = style(); if (!m || !s) return;
    const nf = NF(), g = SG().get(m, curKey), $v = (id, v) => { const e = $(id); if (e) e.value = v; };
    if (!g) return;
    const font = g.kind === 'number' && s.source === 'font';
    if (full) fillFontList();
    if (full) {
      $v('ssFamily', font ? s.family : ''); if (font && $('ssFamily').value !== s.family) { addUserFont(s.family); $v('ssFamily', s.family); }
      $v('ssTHue', s.tint.hue); $v('ssTSat', s.tint.sat); $v('ssTLight', s.tint.light); $v('ssTCol', s.tint.color);
      $v('ssScale', s.scale); $v('ssSp', s.spacing); $v('ssF1', s.fill.c1); $v('ssF2', s.fill.c2);
      $('ssGrad').checked = s.fill.grad; $('ssTab').checked = s.tabular; $('ssB').classList.toggle('on', s.bold); $('ssI').classList.toggle('on', s.italic);
      $('ssOutOn').checked = s.outline.on; $v('ssOutC', s.outline.color); $v('ssOutW', s.outline.width);
      $('ssGlowOn').checked = s.glow.on; $v('ssGlowC', s.glow.color); $v('ssGlowR', s.glow.radius); $v('ssGlowS', s.glow.strength);
      $('ssShOn').checked = s.shadow.on; $v('ssShC', s.shadow.color); $v('ssShX', s.shadow.dx); $v('ssShY', s.shadow.dy); $v('ssShB', s.shadow.blur); $v('ssShO', s.shadow.opacity);
      const pal = $('ssPalette'); pal.innerHTML = '';
      (s.palette || []).forEach((p, i) => {
        const a = Math.round(p.orig[3] / 2.55), d = document.createElement('div'); d.className = 'ss-sw';
        d.dataset.tip = 'Color layer ' + (i + 1) + ' (' + a + '% opaque in the original). Pick a new color; set opacity to 0 to hide this layer.'; d.title = d.dataset.tip;
        const c = document.createElement('input'); c.type = 'color'; c.value = p.color;
        const o = document.createElement('input'); o.type = 'number'; o.min = 0; o.max = 100; o.value = p.opacity;
        c.oninput = () => { p.color = c.value; schedule(); }; o.oninput = () => { p.opacity = Math.max(0, Math.min(100, Number(o.value) || 0)); schedule(); };
        const cap = document.createElement('span'); cap.textContent = 'layer ' + (i + 1) + ' · ' + a + '%';
        d.append(c, o, cap); pal.appendChild(d);
      });
    }
    outputs();
    $('ssCardLayers').style.display = font ? 'none' : ''; $('ssCardFill').style.display = font ? '' : 'none';
    $('ssStyleRow').style.display = font ? '' : 'none';
    $('ssUse').textContent = g.ids.length + ' sprites · ' + (g.dynamic ? 'dynamic' : 'static') + ' · ' + g.widgets.length + (g.widgets.length === 1 ? ' widget' : ' widgets');
    const warn = [];
    if (g.kind === 'number') { const u = nf.usage(m, Number(curKey.slice(1))); if (u.fontsSharing.length) warn.push('These glyph sprites are also listed by font #' + u.fontsSharing.join(', #') + '.'); }
    if (g.widgets.length > 1) warn.push('Shared set: changes apply to all ' + g.widgets.length + ' widgets using it.');
    $('ssWarn').style.display = warn.length ? 'block' : 'none'; $('ssWarn').textContent = '⚠ ' + warn.join(' ');
    $('ssScopeN').textContent = scope === 'selected' ? '' : '→ ' + SG().targets(m, scope, curKey).length + ' sprite sets';
    const r = nf.sizeReport(m), d = r.bytesAfter - r.bytesBefore, baseLen = (m.origU || m.u).length;
    $('ssMeter').textContent = r.editedSprites ? r.editedSprites + ' edited · ' + (d >= 0 ? '+' : '') + (d / 1024).toFixed(1) + ' KB → ' + ((baseLen + d) / 1024).toFixed(1) + ' KB' : 'no edits · ' + (baseLen / 1024).toFixed(1) + ' KB';
    drawStrips(g);
    if (HT37.history) HT37.history.buttons();
    layout();
  }

  function drawStrips(g) {
    const m = M(), cv = $('ssPrev'); if (!cv || !g) return;
    const sp = g.ids.map((id) => m.sprites.find((x) => x.id === id)).filter((x) => x && x.canvas && !x.blank);
    const maxH = Math.max(8, ...sp.map((x) => x.h)), k = Math.max(0.2, Math.min(2, 38 / maxH));
    const W = sp.reduce((a, x) => a + Math.round(x.w * k) + 6, 6), H = Math.round(maxH * k) + 4;
    cv.width = Math.max(8, W); cv.height = H; const c = cv.getContext('2d'); c.imageSmoothingEnabled = k < 1; let x0 = 4;
    sp.forEach((x) => { c.drawImage(x.canvas, 0, 0, x.w, x.h, x0, 2, Math.round(x.w * k), Math.round(x.h * k)); x0 += Math.round(x.w * k) + 6; });
    $('ssDims').textContent = sp.length ? 'largest ' + Math.max(...sp.map((x) => x.w)) + '×' + Math.max(...sp.map((x) => x.h)) + ' px (original ' + Math.max(...sp.map((x) => x.origW || x.w)) + '×' + Math.max(...sp.map((x) => x.origH || x.h)) + ')' : '';
    const sm = $('ssSample'), ws = (typeof widgets !== 'undefined' ? widgets : []).filter((w) => w.hwMeta && g.widgets.some((h) => h.i === w.hwMeta.i)), w = ws.find((x) => x.id === selectedWidgetId) || ws[0];
    if (sm && w && w.spriteCanvas) { const z = Math.max(1, Math.min(3, 300 / w.spriteCanvas.width)); sm.width = Math.round(w.spriteCanvas.width * z); sm.height = Math.round(w.spriteCanvas.height * z); const sc = sm.getContext('2d'); sc.imageSmoothingEnabled = z < 1; sc.drawImage(w.spriteCanvas, 0, 0, sm.width, sm.height); }
  }

  const KIND_TITLES = [['number', 'Numbers'], ['label', 'Labels'], ['gauge', 'Gauges'], ['icon', 'Icons'], ['static', 'Static art']];
  function fillFontList() {
    const m = M(), sel = $('ssFont'); if (!m || !sel) return;
    const groups = SG().list(m).filter((g) => !g.locked);
    sel.innerHTML = KIND_TITLES.map(([k, t]) => { const gs = groups.filter((g) => g.kind === k); return gs.length ? '<optgroup label="' + t + '">' + gs.map((g) => '<option value="' + g.key + '">' + g.title.replace(/</g, '&lt;') + (SG().isEdited(m, g.key) ? ' ●' : '') + '</option>').join('') + '</optgroup>' : ''; }).join('');
    if (!groups.some((g) => g.key === curKey)) curKey = groups.length ? groups[0].key : '';
    sel.value = curKey;
  }

  /** Show only the tools that fit the selection: Text for number fonts, Color/Effects for any editable sprite set, Layer for everything. */
  function toolsUi(text, styleTools) {
    const vis = { text, color: styleTools, fx: styleTools };
    Object.keys(vis).forEach((t) => { const b = ribbon.querySelector('.ss-tab[data-tab="' + t + '"]'); if (b) b.style.display = vis[t] ? '' : 'none'; });
    [$('ssFont') && $('ssFont').closest('label'), $('ssScope') && $('ssScope').closest('label'), $('ssScopeN'), $('ssUse'), $('ssMeter'), $('ssReset')].forEach((e) => { if (e) e.style.display = styleTools ? '' : 'none'; });
    $('ssStrip').style.display = styleTools ? '' : 'none';
  }

  /** Called on selection changes and when a face loads. */
  function follow() {
    if (!build()) return;
    const m = M(), w = typeof widgets !== 'undefined' ? widgets.find((x) => x.id === selectedWidgetId) : null;
    const groups = m ? SG().list(m).filter((g) => !g.locked) : [];
    ribbon.style.display = (w || groups.length) ? '' : 'none';
    const d = (w && HT37.layerView) ? HT37.layerView.describe(w) : null, key = (m && w) ? SG().keyOfWidget(m, w) : null, g = key ? SG().get(m, key) : null;
    const editable = !!(g && !g.locked), isNum = !!(g && g.kind === 'number');
    $('ssTitle').textContent = d ? '🎛️ ' + d.title.toUpperCase() : '🎛️ EDITOR';
    toolsUi(isNum, editable || (!w && groups.length > 0));
    ribbon.querySelectorAll('#inspectorBody .field-row').forEach((r) => { // vendor sprites have no vector color / label / firmware id
      if (r.querySelector('#propColor, #propText, #propFwId')) r.style.display = (w && w.hwMeta) ? 'none' : '';
    });
    if (g && g.locked) { $('ssWarn').style.display = 'block'; $('ssWarn').textContent = 'ℹ Hand sprites use the flag-4 format. The tool can read it but not write it yet, so colors and effects for hands cannot reach the file. Position, scale and the dial center still work.'; }
    const kind = g ? g.kind : (d ? d.kind : '');
    if (kind !== follow._k) { follow._k = kind; showTab(isNum ? 'text' : editable ? 'color' : 'layer'); }
    if (!(editable || !w) && tab !== 'layer') showTab('layer');
    if (m && m !== follow._m) { follow._m = m; curKey = ''; fillFontList(); if (HT37.history) HT37.history.reset(); }
    if (key && editable && key !== curKey) { curKey = key; update(true); layout(); return; }
    if ((editable || !w) && curKey) { if (!$('ssFont').options.length) fillFontList(); update(true); }
    layout();
  }

  function hook() {
    if (typeof window.syncInspector !== 'function' || window.syncInspector._ssHooked) return false;
    const orig = window.syncInspector;
    window.syncInspector = function () { const r = orig.apply(this, arguments); try { follow(); } catch (e) { console.warn('sprite studio', e); } return r; };
    window.syncInspector._ssHooked = true; return true;
  }
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { const st = style(); if (st && st.source === 'font') schedule(); });
  let tries = 0;
  (function wait() { if (!hook() && tries++ < 100) setTimeout(wait, 100); })();
  HT37.spriteStudio = { follow, update, setFont: (i) => { curKey = /^[fg]/.test(String(i)) ? String(i) : 'f' + i; update(true); }, getScope: () => scope };
})();
