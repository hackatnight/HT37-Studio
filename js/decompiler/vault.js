/**
 * @file     js/decompiler/vault.js
 * @layer    Decompiler / .bin
 * @summary  TOPSTEP/TBUI .bin decompiler and "Sprite Vault" (Tab 1 right dock): decode, browse, edit, re-pack.
 *
 * ROLE
 *   - PA codec: decodePA(u,start,w,h) / encodePA(rgba,w,h,alpha) — RLE + 2-3-2 signed RGB565 delta format:
 *     0xC0-0xFF literal run of opaque px; 0x80-0xBF run [alpha?,lo,hi]; 0x00-0x7F single-pixel 7-bit delta.
 *   - parseTopstepBin(buf,name): validates "TOPSTEP" container and "TBUI" block, reads the sprite table, widget
 *     table (M.widgets) and font lists (M.fonts) into window.decompiledBinData (M).
 *   - rebuildActiveBin(): re-packs M with current widget positions/background into a valid .bin (used by Export
 *     and Flash).
 *   - hookCanvasRenderer(): wraps window.drawWidget / getWidgetBounds so layers with spriteCanvas draw sprites.
 *   - setupRightDecompilerDock(): builds the right dock (Load .bin / Load Template, locale
 *     EN_IMPERIAL|EN_METRIC|CN_METRIC, ✨ Auto-Load BG & Layout, filterable sprite gallery in folders, "Active
 *     Widget Layers", "Layer Inspector"), loadBinBuffer(), and live sensor binding via
 *     window.syncBinWidgetsWithSensors / buildBinFontCanvas.
 *   - Widget types in M.widgets: 0,4,5,6 sprite widgets (a = sprite id; #69 = 360×360 background, #70 = 240×240
 *     preview); 2,3 dynamic number/font widgets (a = font index, b = alignment 0 left/1 center/2 right).
 *     Sub-types: 0 steps, 2 hour, 3 minute, 6 distance, 7 kcal, 8 BPM, 11 temperature, 13 date.
 *
 * PROVIDES (globals)
 *   window. decompiledBinData, window. decodePA, window. encodePA, window. parseTopstepBin, window.
 *   rebuildActiveBin, window. drawWidget, window. getWidgetBounds, window. userUploadedCustomBg, window.
 *   buildBinFontCanvas, window. syncBinWidgetsWithSensors, window. updateLiveSensorReadout
 *
 * USES (defined in other files)
 *   - js/editor/state.js: bgTheme, ctx, customBgImage, loadedTemplateBin, selectedWidgetId, sensors, widgets
 *   - js/core/log.js: log
 *   - js/dfu/ota.js: crc16Header568x
 *   - js/editor/layers.js: renderLayerList
 *   - js/editor/inspector.js: syncInspector
 *
 * DOM IDS TOUCHED
 *   #btnDecompAutoAssemble #btnDecompOpenFile #btnDecompUseTemplate #btnDeleteBg #chkShowGuides
 *   #decompBinFileInput #decompLocaleSelect #decompSearchInput #decompSpriteGallery #decompStatusInfo
 *   #decompTypeSelect #inspectorBody #rightDockCard_ #secSensorWeatherBody #secWidgetLayersBody #simClockTime
 *   #simDateInput #simHrBin #simWeekdaySelect #studioRightCol #studioRightToolbox #studioWysiwygViewport
 *   #valHrBin #wysiwygBinPreviewBox #wysiwygBinPreviewCanvasWrap #wysiwygBinPreviewLabel
 *
 * LOAD ORDER
 *   #61 of 62, section "10. .BIN DECOMPILER / SPRITE VAULT  (wraps drawWidget, getWidgetBounds, updateLiveSensorReadout)"
 *   after: js/ui/tabs.js   before: js/ui/start.js
 *
 * NOTES
 *   - Single closure (~1100 lines). Internal order: codec → parseTopstepBin → rebuildActiveBin → renderer hooks
 *     → setupRightDecompilerDock (card builder, gallery folders, preview box, loadBinBuffer, sensor sync).
 *   - Spec notes come from the repository's "NEW SESSION PROMPTS.txt".
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
/* ==========================================================================
   [TAB-1 / RIGHT DOCK]: TOPSTEP / TBUI .BIN DECOMPILER & SPRITE VAULT
   - Decodes RGB565 & ARGB8565 (.PA RLE format) sprites & widget coordinate tables.
   - Integrates directly with 360x360 WYSIWYG Background & Widget Layers.
   ========================================================================== */
(function initHt37DecompilerVault() {
  window.decompiledBinData = null;

  function decompAscii(u, o, n) {
    let s = '';
    for (let i = 0; i < n && o + i < u.length; i++) {
      const c = u[o + i];
      s += (c >= 32 && c < 127) ? String.fromCharCode(c) : '.';
    }
    return s;
  }
  function decompHex(n, w = 4) { return '0x' + (n >>> 0).toString(16).padStart(w, '0'); }

  // PA RLE + 7-Bit (2-3-2) RGB565 Delta Decoder
  window.decodePA = function(u, start, expW, expH) {
    if (u[start] !== 0x50 || u[start + 1] !== 0x41) throw new Error('Missing PA magic at ' + decompHex(start));
    const dv = new DataView(u.buffer, u.byteOffset);
    const alpha = u[start + 3], w = dv.getUint16(start + 4, true), h = dv.getUint16(start + 6, true), es = u[start + 9], bias = dv.getUint16(start + 10, true);
    if (es !== 1 && es !== 2) throw new Error('Unsupported row-table width ' + es);
    // HAND sprites (sprite flag 4, header byte 8 = 0x1E): stored as bands of 31 rows x 31-px stride, index table has
    // ceil(h/30)+1 entries (not h+1). Real image = top-left w x h of that 31-wide stream. Proven for w <= 31 on 15 hands in 7 faces;
    // w > 31 (two gold hands in the 1004504 face) is NOT understood yet and still falls through to the generic path below.
    if (u[start + 8] === 0x1e && w <= 31) {
      const bands = Math.ceil(h / 30), total = bands * 31 * 31;
      let q = start + 16 + (bands + 1) * es, n = 0, hr5 = 0, hg6 = 0, hb5 = 0, hA = 255, hR = 0, hG = 0, hB = 0;
      const full = new Uint8ClampedArray(total * 4);
      const emit = () => { if (n < total) { const i = n * 4; full[i] = hR; full[i + 1] = hG; full[i + 2] = hB; full[i + 3] = hA; } n++; };
      while (n < total && q < u.length) {
        const c = u[q++], k = c & 0x3f;
        if (c < 0x80) {
          hr5 = (hr5 + (((c >> 5) & 3) - 2)) & 31; hg6 = (hg6 + (((c >> 2) & 7) - 4)) & 63; hb5 = (hb5 + ((c & 3) - 2)) & 31;
          hR = (hr5 * 255 / 31) | 0; hG = (hg6 * 255 / 63) | 0; hB = (hb5 * 255 / 31) | 0; emit();
        } else if (c < 0xc0) {
          let a = 255, lo, hi;
          if (alpha) { a = u[q]; lo = u[q + 1]; hi = u[q + 2]; q += 3; } else { lo = u[q]; hi = u[q + 1]; q += 2; }
          const v = lo | (hi << 8);
          hr5 = (v >> 11) & 31; hg6 = (v >> 5) & 63; hb5 = v & 31; hA = a;
          hR = (hr5 * 255 / 31) | 0; hG = (hg6 * 255 / 63) | 0; hB = (hb5 * 255 / 31) | 0;
          for (let j = 0; j < k; j++) emit();
        } else {
          for (let j = 0; j < k; j++) {
            const v = u[q] | (u[q + 1] << 8); q += 2;
            hr5 = (v >> 11) & 31; hg6 = (v >> 5) & 63; hb5 = v & 31; hA = 255;
            hR = (hr5 * 255 / 31) | 0; hG = (hg6 * 255 / 63) | 0; hB = (hb5 * 255 / 31) | 0; emit();
          }
        }
      }
      if (n < total) throw new Error('EOF in hand sprite (' + n + '/' + total + ' px)');
      // Real hand art can extend a few rows BELOW the header height (e.g. a second-hand hub ring: header h=148, art to row 150).
      // The watch draws those rows, so keep them: trim only trailing fully-transparent rows of the 31-wide stream.
      let lastRow = h - 1;
      for (let y = bands * 31 - 1; y >= h; y--) {
        let any = false;
        for (let x = 0; x < w && !any; x++) if (full[(y * 31 + x) * 4 + 3]) any = true;
        if (any) { lastRow = y; break; }
      }
      const outH = lastRow + 1;
      const crop = new Uint8ClampedArray(w * outH * 4);
      for (let y = 0; y < outH; y++) crop.set(full.subarray(y * 31 * 4, (y * 31 + w) * 4), y * w * 4);
      return { w, h: outH, hdrH: h, alpha, es, bias, rgba: crop, len: q - start, hand: true };
    }
    const tab = start + 16, data0 = tab + (h + 1) * es;
    const rgba = new Uint8ClampedArray(w * h * 4);
    let p = data0, r5 = 0, g6 = 0, b5 = 0, lastA = 255;
    let lastR = 0, lastG = 0, lastB = 0;
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        if (p >= u.length) throw new Error('EOF in row ' + y);
        const c = u[p++], n = c & 0x3f;
        if (c < 0x80) {
          // 7-bit (2-3-2) signed RGB565 delta token: dr(2b)=bits 6..5 - 2, dg(3b)=bits 4..2 - 4, db(2b)=bits 1..0 - 2
          r5 = (r5 + (((c >> 5) & 3) - 2)) & 31;
          g6 = (g6 + (((c >> 2) & 7) - 4)) & 63;
          b5 = (b5 + ((c & 3) - 2)) & 31;
          lastR = (r5 * 255 / 31) | 0;
          lastG = (g6 * 255 / 63) | 0;
          lastB = (b5 * 255 / 31) | 0;
          const i = (y * w + x++) * 4;
          rgba[i] = lastR; rgba[i + 1] = lastG; rgba[i + 2] = lastB; rgba[i + 3] = lastA;
        } else if (c < 0xc0) {
          let a = 255, lo, hi;
          if (alpha) { a = u[p]; lo = u[p + 1]; hi = u[p + 2]; p += 3; }
          else { lo = u[p]; hi = u[p + 1]; p += 2; }
          const v = lo | (hi << 8);
          r5 = (v >> 11) & 31; g6 = (v >> 5) & 63; b5 = v & 31; lastA = a;
          lastR = (r5 * 255 / 31) | 0; lastG = (g6 * 255 / 63) | 0; lastB = (b5 * 255 / 31) | 0;
          for (let k = 0; k < n; k++) {
            const i = (y * w + x++) * 4;
            rgba[i] = lastR; rgba[i + 1] = lastG; rgba[i + 2] = lastB; rgba[i + 3] = lastA;
          }
        } else {
          for (let k = 0; k < n; k++) {
            const v = u[p] | (u[p + 1] << 8); p += 2;
            r5 = (v >> 11) & 31; g6 = (v >> 5) & 63; b5 = v & 31; lastA = 255;
            lastR = (r5 * 255 / 31) | 0; lastG = (g6 * 255 / 63) | 0; lastB = (b5 * 255 / 31) | 0;
            const i = (y * w + x++) * 4;
            rgba[i] = lastR; rgba[i + 1] = lastG; rgba[i + 2] = lastB; rgba[i + 3] = 255;
          }
        }
      }
    }
    return { w, h, alpha, es, bias, rgba, len: p - start };
  };

  // Lossless PA Encoder
  window.encodePA = function(rgba, w, h, alpha, es = 2) {
    const q = new Uint16Array(w * h), al = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
      q[i] = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
      al[i] = alpha ? rgba[i * 4 + 3] : 255;
    }
    const rows = [];
    for (let y = 0; y < h; y++) {
      const out = []; let x = 0; const o = y * w;
      while (x < w) {
        let n = 1;
        while (x + n < w && n < 63 && q[o + x + n] === q[o + x] && al[o + x + n] === al[o + x]) n++;
        const same = (a, b) => q[o + a] === q[o + b] && al[o + a] === al[o + b];
        if (alpha) {
          if (al[o + x] === 255 && n < 2) {
            let m = 0, k = x;
            while (k < w && m < 63 && al[o + k] === 255) { if (k + 1 < w && same(k, k + 1) && k + 2 < w && same(k, k + 2)) break; m++; k++; }
            if (m === 0) m = 1;
            out.push(0xc0 | m);
            for (let i = 0; i < m; i++) { const v = q[o + x + i]; out.push(v & 255, v >> 8); }
            x += m; continue;
          }
          if (al[o + x] === 255 && n >= 2) { out.push(0x80 | n, 255, q[o + x] & 255, q[o + x] >> 8); x += n; continue; }
          out.push(0x80 | n, al[o + x], q[o + x] & 255, q[o + x] >> 8); x += n;
        } else {
          if (n >= 3) { out.push(0x80 | n, q[o + x] & 255, q[o + x] >> 8); x += n; continue; }
          let m = 0, k = x;
          while (k < w && m < 63) { if (k + 2 < w && same(k, k + 1) && same(k, k + 2)) break; m++; k++; }
          if (m === 0) m = 1;
          out.push(0xc0 | m);
          for (let i = 0; i < m; i++) { const v = q[o + x + i]; out.push(v & 255, v >> 8); }
          x += m;
        }
      }
      rows.push(out);
    }
    let total = 0; const starts = [];
    for (const r of rows) { starts.push(total); total += r.length; }
    starts.push(total);
    if (es === 1 && total > 255) es = 2;
    const bias = Math.round(total / h) & 0xffff, m2 = es === 1 ? 255 : 65535;
    const buf = new Uint8Array(16 + (h + 1) * es + total), dv = new DataView(buf.buffer);
    buf[0] = 0x50; buf[1] = 0x41; buf[3] = alpha ? 1 : 0;
    dv.setUint16(4, w, true); dv.setUint16(6, h, true); buf[9] = es; dv.setUint16(10, bias, true);
    for (let i = 0; i <= h; i++) {
      const v = (starts[i] - bias * i) & m2;
      if (es === 1) buf[16 + i] = v; else dv.setUint16(16 + i * 2, v, true);
    }
    let p = 16 + (h + 1) * es;
    for (const r of rows) { buf.set(r, p); p += r.length; }
    return buf;
  };

  // TOPSTEP / TBUI Container Parser
  window.parseTopstepBin = function(buf, name = 'watchface.bin') {
    const u = new Uint8Array(buf), dv = new DataView(buf);
    if (u.length < 0x500) throw new Error('File too small (' + u.length + ' B)');
    if (decompAscii(u, 0, 7) !== 'TOPSTEP') throw new Error('Not a TOPSTEP .bin container');
    const U32 = o => dv.getUint32(o, true), U16 = o => dv.getUint16(o, true);
    const B = U32(0x24);
    if (B >= u.length - 0x70 || decompAscii(u, B, 4) !== 'TBUI') throw new Error('TBUI header not found');
    const T = { dialId: U32(B + 8) & 0xffffff, w: U16(B + 0x20), h: U16(B + 0x22) };
    const dir = [
      { name: 'widgets', o: B + 0x40 },
      { name: 'sprites', o: B + 0x48 },
      { name: 'fonts',   o: B + 0x50 }
    ].map(d => ({ name: d.name, off: U32(d.o), count: U16(d.o + 4), size: U16(d.o + 6) }));
    const [dw, ds, dl] = dir;

    const widgets = [];
    for (let i = 0; i < dw.count; i++) {
      const o = B + dw.off + i * dw.size;
      if (o + dw.size > u.length) break;
      widgets.push({ i, id: u[o], type: u[o + 1], flag: u[o + 2], sub: u[o + 3], x: U16(o + 4), y: U16(o + 6), px: U16(o + 8), py: U16(o + 0x0a), a: U16(o + 0x0c), b: U16(o + 0x0e) });
    }

    const fonts = [];
    const stride = dl.size * 4;
    for (let i = 0; i < dl.count; i++) {
      const o = B + dl.off + i * stride;
      if (o + 4 > u.length) break;
      const cnt = U32(o), pairs = [];
      for (let k = 0; k < cnt && k < (stride - 4) / 4; k++) {
        pairs.push({ ch: U16(o + 4 + k * 4), sprite: U16(o + 6 + k * 4) });
      }
      fonts.push({ i, count: cnt, pairs });
    }
    const sprites = [];
    for (let i = 0; i < ds.count; i++) {
      const o = B + ds.off + i * ds.size;
      if (o + ds.size > u.length) break;
      const d = { index: i, id: U16(o), fmt: u[o + 2], flag: u[o + 3], w: U16(o + 4), h: U16(o + 6), offset: U32(o + 8) };
      d.absOff = B + d.offset;
      try {
        d.dec = window.decodePA(u, d.absOff, d.w, d.h);
        if ((d.id === 69 || d.id === 70) && typeof log === 'function') {
          const dv2 = new DataView(u.buffer, u.byteOffset);
          const es = u[d.absOff + 9], bias = dv2.getUint16(d.absOff + 10, true), tab = d.absOff + 16, data0 = tab + (d.h + 1) * es;
          const tEnd = es === 1 ? u[tab + d.h] : dv2.getUint16(tab + d.h * 2, true);
          log(`🔬 Sprite #${d.id} (${d.w}x${d.h}): alpha=${d.dec.alpha} es=${es} bias=${bias} decodedLen=${d.dec.len} tableEnd=${(tEnd + bias * d.h) & (es===1?255:65535)}`, 'warn');
        }
        const cv = document.createElement('canvas'), dh = d.dec.h || d.h; // hand sprites may be taller than the header height
        cv.width = d.w; cv.height = dh;
        cv.getContext('2d').putImageData(new ImageData(d.dec.rgba, d.w, dh), 0, 0);
        d.canvas = cv;
      } catch (e) { d.error = e.message; }
      sprites.push(d);
    }

    return { fileName: name, fileSize: u.length, u: u, buffer: buf, tbui: T, widgets, fonts, sprites };
  };

  // WYSIWYG Active Binary Repacker (In-Place Widget Moves + 4-Byte Aligned Custom BG)
  window.rebuildActiveBin = function() {
    const M = window.decompiledBinData;
    if (!M || !M.u) return null;
    try {
      if (!M.origU) M.origU = new Uint8Array(M.u);
      const origU = M.origU;
      const origDv = new DataView(origU.buffer, origU.byteOffset, origU.byteLength);
      const B = origDv.getUint32(0x24, true); // TBUI offset (0x400 = 1024)
      if (B >= origU.length - 0x70) throw new Error('Invalid TBUI offset');

      const dirWidgets = { off: origDv.getUint32(B + 0x40, true), count: origDv.getUint16(B + 0x44, true), size: origDv.getUint16(B + 0x46, true) };
      const dirSprites = { off: origDv.getUint32(B + 0x48, true), count: origDv.getUint16(B + 0x4C, true), size: origDv.getUint16(B + 0x4E, true) };

      if (!M.sprites || !M.sprites.length) throw new Error('No sprites found in decompiled data');

      // Render 360x360 BG & 240x240 Preview canvases (for stage preview & optional custom BG encode)
      const bgCv = document.createElement('canvas'); bgCv.width = 360; bgCv.height = 360;
      const bgCtx = bgCv.getContext('2d');
      if (typeof customBgImage !== 'undefined' && customBgImage) {
        const ratio = Math.max(360 / (customBgImage.width || 360), 360 / (customBgImage.height || 360));
        const nw = (customBgImage.width || 360) * ratio, nh = (customBgImage.height || 360) * ratio;
        bgCtx.drawImage(customBgImage, (360 - nw) / 2, (360 - nh) / 2, nw, nh);
      } else {
        bgCtx.fillStyle = '#000000'; bgCtx.fillRect(0, 0, 360, 360);
      }

      const prevCv = document.createElement('canvas'); prevCv.width = 240; prevCv.height = 240;
      const prevCtx = prevCv.getContext('2d');
      prevCtx.drawImage(bgCv, 0, 0, 240, 240);
      const scale240 = 240 / 360;
      if (typeof widgets !== 'undefined' && Array.isArray(widgets)) {
        widgets.forEach(w => {
          if (w.visible && w.spriteCanvas) {
            const sw = (w.spriteCanvas.width || 20) * (w.scale || 1) * scale240;
            const sh = (w.spriteCanvas.height || 20) * (w.scale || 1) * scale240;
            prevCtx.drawImage(w.spriteCanvas, (w.x * scale240) - sw / 2, (w.y * scale240) - sh / 2, sw, sh);
          }
        });
      }

      // (The floating preview box is now a live render owned by updateStagePreviewBox; rebuilding must not touch its canvas.)

      // Helper to apply updated widget top-left coordinates into a DataView of the binary
      let movedCount = 0;
      const patchWidgetCoords = (targetDv, maxByteLen) => {
        if (typeof widgets !== 'undefined' && Array.isArray(widgets)) {
          widgets.forEach(w => {
            const hm = w.hwMeta;
            if (!hm || hm.i === undefined) return;
            const sprW = (w.spriteCanvas && w.spriteCanvas.width) ? w.spriteCanvas.width : 0;
            const sprH = (w.spriteCanvas && w.spriteCanvas.height) ? w.spriteCanvas.height : 0;
            
            // On canvas, w.x & w.y are the center of w.spriteCanvas.
            // Hardware anchor (nx, ny) in TBUI is the top-left corner:
            // Number/font widgets (types 2,3) store an ALIGNMENT anchor, not the top-left: b=0 left edge, b=1 center, b=2 right edge.
            // (Layout in syncBinWidgetsWithSensors: cx = anchor + w/2 | anchor | anchor - w/2.) Invert exactly that here.
            const isNum = hm.type === 2 || hm.type === 3;
            let nx = Math.round(isNum && hm.b === 1 ? w.x : isNum && hm.b === 2 ? w.x + sprW / 2 : w.x - sprW / 2);
            let ny = Math.round(w.y - sprH / 2);
            
            // Clamp to valid 360x360 coordinates
            nx = Math.max(0, Math.min(360, nx));
            ny = Math.max(0, Math.min(360, ny));

            const entryOff = B + dirWidgets.off + hm.i * dirWidgets.size;
            if (entryOff + 8 <= maxByteLen) {
              const oldX = origDv.getUint16(entryOff + 4, true);
              const oldY = origDv.getUint16(entryOff + 6, true);
              if (nx !== oldX || ny !== oldY) {
                movedCount++;
                if (typeof log === 'function') {
                  log(`📍 W[${hm.i}] ${w.name || 'Widget'}: (${oldX}, ${oldY}) -> (${nx}, ${ny}) [w=${sprW}, h=${sprH}]`, 'ok');
                }
              }
              targetDv.setUint16(entryOff + 4, nx, true);
              targetDv.setUint16(entryOff + 6, ny, true);
              // Analog hands also store their rotation center (px,py at +8/+0xA); the template writes x, y and the center together.
              if (hm.type === 1 && w.handKind) HT37.faceWidgets.analogHand.writeEntry(targetDv, entryOff, w, maxByteLen);
              hm.anchorX = nx;
              hm.anchorY = ny;
              hm.lastCalcX = w.x;
              hm.lastCalcY = w.y;
            }
          });
        }
      };

      const bgSpr = M.sprites.find(s => s.id === 69 || (s.w === 360 && s.h === 360));
      const hasCustomBg = Boolean(window.userUploadedCustomBg && typeof customBgImage !== 'undefined' && customBgImage && (!bgSpr || customBgImage !== bgSpr.canvas));

      // Sprites edited in the editor (number-widget font editor: color / size / spacing) force a repack with re-encoded sprites.
      const anyEdited = M.sprites.some(s => s.edited);

      // PATH 1: In-place widget coordinate update (100% original sprites & offsets preserved!)
      if (!hasCustomBg && !anyEdited) {
        const finalBin = new Uint8Array(origU);
        const finalDv = new DataView(finalBin.buffer);
        patchWidgetCoords(finalDv, finalBin.byteLength);

        const newCrc = crc16Header568x(finalBin.subarray(1024));
        finalDv.setUint16(0x10, newCrc, true);

        M.u = finalBin;
        M.buffer = finalBin.buffer;
        M.fileSize = finalBin.byteLength;
        window.decompiledBinData = M;

        if (typeof log === 'function') {
          log(`✨ Synced WYSIWYG coordinates in-place (${movedCount} widget(s) moved, sprites untouched): ${finalBin.byteLength.toLocaleString()} B (CRC: 0x${newCrc.toString(16).toUpperCase().padStart(4, '0')})`, 'ok');
        }
        return finalBin;
      }

      // PATH 2: Custom Background uploaded -> Re-encode #69 & #70 with strict 4-byte word alignment
      const firstSpriteRelOff = M.sprites[0].offset;
      const baseHeaderLen = B + firstSpriteRelOff;
      const baseHeader = new Uint8Array(origU.subarray(0, baseHeaderLen));
      const baseDv = new DataView(baseHeader.buffer);

      patchWidgetCoords(baseDv, baseHeader.byteLength);

      // Background/preview are re-encoded only for a custom background (a font edit alone must keep the original art).
      const newBgPA = hasCustomBg ? window.encodePA(bgCtx.getImageData(0, 0, 360, 360).data, 360, 360, false, 2) : null;
      const newPrevPA = hasCustomBg ? window.encodePA(prevCtx.getImageData(0, 0, 240, 240).data, 240, 240, false, 2) : null;

      const pad4 = (arr) => {
        const aligned = (arr.byteLength + 3) & ~3;
        if (aligned === arr.byteLength) return arr;
        const out = new Uint8Array(aligned);
        out.set(arr, 0);
        return out;
      };

      // 4-byte ASCII footer 'TBUI' follows the last sprite: keep it OUT of the last sprite's chunk and re-append it after repacking.
      const hasFooter = origU.length >= 4 && decompAscii(origU, origU.length - 4, 4) === 'TBUI';
      const dataEnd = origU.length - (hasFooter ? 4 : 0);
      const spriteChunks = [];
      let curRelOff = firstSpriteRelOff;
      for (let i = 0; i < dirSprites.count && i < M.sprites.length; i++) {
        const s = M.sprites[i];
        let sBytes = null;
        if (s.id === 69 && newBgPA) {
          sBytes = pad4(newBgPA);
        } else if (s.id === 70 && newPrevPA) {
          sBytes = pad4(newPrevPA);
        } else if (s.edited && s.canvas) {
          sBytes = pad4(HT37.faceWidgets.numberFont.encodeSprite(s));
        } else {
          const rawLen = (i + 1 < M.sprites.length) ? (M.sprites[i + 1].absOff - s.absOff) : (dataEnd - s.absOff);
          sBytes = pad4(origU.subarray(s.absOff, s.absOff + rawLen));
        }

        const sprEntryOff = B + dirSprites.off + i * dirSprites.size;
        if (sprEntryOff + 12 <= baseHeader.byteLength) {
          baseDv.setUint32(sprEntryOff + 8, curRelOff, true);
          if (s.edited && s.canvas) { baseDv.setUint16(sprEntryOff + 4, s.canvas.width, true); baseDv.setUint16(sprEntryOff + 6, s.canvas.height, true); }
        }
        spriteChunks.push(sBytes);
        curRelOff += sBytes.byteLength;
      }

      const totalLen = baseHeader.byteLength + (curRelOff - firstSpriteRelOff) + (hasFooter ? 4 : 0);
      const finalBin = new Uint8Array(totalLen);
      finalBin.set(baseHeader, 0);
      let writePtr = baseHeader.byteLength;
      for (const chunk of spriteChunks) {
        finalBin.set(chunk, writePtr);
        writePtr += chunk.byteLength;
      }
      if (hasFooter) finalBin.set(origU.subarray(origU.length - 4), writePtr);

      // Update exact TOPSTEP + TBUI size fields (0x0C, 0x28, and B+0x0C) & BUYPASS CRC at 0x10
      const finalDv = new DataView(finalBin.buffer);
      finalDv.setUint32(0x0C, totalLen, true);
      finalDv.setUint32(0x28, totalLen - 1024, true);
      finalDv.setUint32(B + 0x0C, totalLen - 1028, true);

      const newCrc = crc16Header568x(finalBin.subarray(1024));
      finalDv.setUint16(0x10, newCrc, true);

      M.u = finalBin;
      M.buffer = finalBin.buffer;
      M.fileSize = finalBin.byteLength;
      window.decompiledBinData = M;

      if (typeof log === 'function') {
        log(`✨ Repacked ${hasCustomBg ? 'Custom BG + ' : ''}${M.sprites.filter(s => s.edited).length} edited sprite(s) + ${movedCount} moved widget(s) (4B-aligned): ${totalLen.toLocaleString()} B (CRC: 0x${newCrc.toString(16).toUpperCase().padStart(4, '0')})`, 'ok');
      }
      return finalBin;
    } catch (err) {
      if (typeof log === 'function') log('⚠️ Repack warning: ' + (err.message || err), 'warn');
      return null;
    }
  };

  // Hook drawWidget & getWidgetBounds so any widget with w.spriteCanvas renders its decoded .BIN sprite
  function hookCanvasRenderer() {
    if (typeof window.drawWidget === 'function' && !window.drawWidget._decompHooked) {
      const origDrawWidget = window.drawWidget;
      window.drawWidget = function(c, w) {
        if (HT37.faceWidgets.analogHand.draw(c, w)) return; // analog hand: rotated about its fixed pivot (template)
        if (w && w.spriteCanvas) {
          c.drawImage(w.spriteCanvas, -w.spriteCanvas.width / 2, -w.spriteCanvas.height / 2);
          return;
        }
        return origDrawWidget.apply(this, arguments);
      };
      window.drawWidget._decompHooked = true;
    }

    if (typeof window.getWidgetBounds === 'function' && !window.getWidgetBounds._decompHooked) {
      const origBounds = window.getWidgetBounds;
      window.getWidgetBounds = function(w) {
        if (w && w.spriteCanvas) {
          return { w: w.spriteCanvas.width * (w.scale || 1), h: w.spriteCanvas.height * (w.scale || 1) };
        }
        return origBounds.apply(this, arguments);
      };
      window.getWidgetBounds._decompHooked = true;
    }
  }

  // Analog-hand geometry/outline/hit-test/base-centring now live in js/editor/face-widgets/analog-hand.js (HT37.faceWidgets.analogHand).

  // ONE shared clock for every dial (hands + digital time). window.simClock.live = true: real local time (what the watch shows).
  // live = false (STOP TIME): frozen at the HH:MM[:SS] typed in #simClockTime (default 09:40:00) - hands do not move.
  window.simClock = { live: true };
  window.getSimClockParts = function() {
    if (window.simClock.live) { const n = new Date(); return { h: n.getHours(), m: n.getMinutes(), s: n.getSeconds() + n.getMilliseconds() / 1000 }; }
    const el = document.getElementById('simClockTime'), mt = el && /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(el.value || '');
    return mt ? { h: (+mt[1]) % 24, m: Math.min(59, +mt[2]), s: Math.min(59, +(mt[3] || 0)) } : { h: 9, m: 40, s: 0 };
  };

  function setupRightDecompilerDock() {
    hookCanvasRenderer();
    const rightCol = document.getElementById('studioRightCol');
    if (!rightCol || document.getElementById('studioRightToolbox')) return;

    const rightToolbox = document.createElement('div');
    rightToolbox.id = 'studioRightToolbox';
    rightToolbox.className = 'unified-toolbox-window';

    function makeRightCard(num, title, bodyEl, startCollapsed = false) {
      const card = document.createElement('div');
      card.className = 'toolbox-tool-card';
      card.id = 'rightDockCard_' + num;
      const header = document.createElement('div');
      header.className = 'toolbox-tool-header';
      header.innerHTML = `<span>${num}. ${title}</span><span class="tool-chevron">${startCollapsed ? '▸' : '▾'}</span>`;
      const bodyWrap = document.createElement('div');
      bodyWrap.className = 'toolbox-tool-body' + (startCollapsed ? ' is-collapsed' : '');
      bodyWrap.appendChild(bodyEl);
      const chev = header.querySelector('.tool-chevron');
      header.addEventListener('click', () => {
        const isClosed = bodyWrap.classList.toggle('is-collapsed');
        chev.textContent = isClosed ? '▸' : '▾';
      });
      card.appendChild(header);
      card.appendChild(bodyWrap);
      return card;
    }

    // TOOL 0 (Right): .BIN Decompiler & Sprite Vault (Starts Open)
    const decompBody = document.createElement('div');
    decompBody.style.cssText = 'display:flex; flex-direction:column; gap:8px; width:100%; box-sizing:border-box;';
    decompBody.innerHTML = `
      <input type="file" id="decompBinFileInput" accept=".bin,application/octet-stream" style="display:none;" />
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; width:100%;">
        <button type="button" id="btnDecompOpenFile" class="dock-btn">📂 Load .BIN File</button>
        <button type="button" id="btnDecompUseTemplate" class="dock-btn">☁️ Load Template</button>
      </div>
      <div style="display:flex; align-items:center; gap:6px; width:100%;">
        <label style="font-size:9px; color:#94a3b8; font-weight:700; text-transform:uppercase; white-space:nowrap;">LOCALE / UNITS:</label>
        <select id="decompLocaleSelect" style="flex:1; height:26px; background:#111827; color:#e2e8f0; border:1px solid #334155; font-size:11px; padding:2px 4px;">
          <option value="EN_IMPERIAL" selected>🇺🇸 English (Mi / °F)</option>
          <option value="EN_METRIC">🇬🇧 English (KM / °C)</option>
          <option value="CN_METRIC">🇨🇳 Chinese (KM / °C)</option>
        </select>
      </div>
      <button type="button" id="btnDecompAutoAssemble" class="dock-btn" style="width:100% !important; color:#38bdf8 !important;">✨ Auto-Load BG & Layout to Canvas</button>
      <label style="display:flex; align-items:center; gap:6px; font-size:10px; color:#94a3b8; margin-top:4px;"><input type="checkbox" id="chkHandBasePivot" checked /> Hands: rotate about the center of the rounded base (matches vendor preview; uncheck = exact file pivot row)</label>
      <div style="display:grid; grid-template-columns:1fr 95px; gap:6px; width:100%;">
        <input type="text" id="decompSearchInput" placeholder="Filter ID or WxH (e.g. 360x360)" style="width:100%; height:28px; background:#111827; color:#e2e8f0; border:1px solid #334155; font-size:11px; padding:4px 6px; box-sizing:border-box;" />
        <select id="decompTypeSelect" style="width:100%; height:28px; background:#111827; color:#e2e8f0; border:1px solid #334155; font-size:11px; padding:2px 4px; box-sizing:border-box;">
          <option value="">All Types</option>
          <option value="alpha">ARGB8565</option>
          <option value="opaque">RGB565</option>
        </select>
      </div>
      <div id="decompStatusInfo" style="font-size:10px; color:#94a3b8; font-family:monospace; padding:4px 6px; background:#05080f; border:1px solid #1e293b;">
        Ready. Load a TOPSTEP .bin file to extract sprites.
      </div>
      <div id="decompSpriteGallery"></div>
    `;

    const cardDecomp = makeRightCard('0', '.BIN Decompiler & Sprite Vault', decompBody, false);
    rightToolbox.appendChild(cardDecomp);

    // Move Active Widget Layers (Tool 1) & Layer Inspector (Tool 2) into Right Dock (Start Collapsed = true)
    const secLayers = document.getElementById('secWidgetLayersBody');
    const secInsp = document.getElementById('inspectorBody');
    const oldCardLayers = secLayers ? secLayers.closest('.section-card, .card') : null;
    const oldCardInsp = secInsp ? secInsp.closest('.section-card, .card') : null;

    if (secLayers) {
      // The layer list is the main navigation of the editor, so it lives at the top of the LEFT column (above "Add Widget Layer", which starts collapsed).
      const card1R = makeRightCard('', 'Layers (everything on the watch)', secLayers, false);
      card1R.querySelector('.toolbox-tool-header span').textContent = 'Layers (everything on the watch)';
      const addCardL = document.getElementById('toolCard_1_studio');
      if (addCardL && addCardL.parentElement) {
        addCardL.parentElement.insertBefore(card1R, addCardL);
        const addBody = addCardL.querySelector('.toolbox-tool-body'), addChev = addCardL.querySelector('.tool-chevron');
        if (addBody) { addBody.classList.add('is-collapsed'); if (addChev) addChev.textContent = '▸'; }
      } else rightToolbox.appendChild(card1R);
      if (oldCardLayers && oldCardLayers.parentElement) oldCardLayers.style.display = 'none';
    }
    if (secInsp) {
      const card2R = makeRightCard('2', 'Layer Inspector & Properties', secInsp, true);
      rightToolbox.appendChild(card2R);
      if (oldCardInsp && oldCardInsp.parentElement) oldCardInsp.style.display = 'none';
    }

    rightCol.insertBefore(rightToolbox, rightCol.firstChild);

    // Render Gallery Function
    const gallery = decompBody.querySelector('#decompSpriteGallery');
    const statusBox = decompBody.querySelector('#decompStatusInfo');
    const searchIn = decompBody.querySelector('#decompSearchInput');
    const typeSel = decompBody.querySelector('#decompTypeSelect');

    function clearDefaultPlaceholders() {
      // Remove the 7 startup vector placeholder widgets & turn off tick guides when assigning .bin assets
      for (let i = widgets.length - 1; i >= 0; i--) {
        if (String(widgets[i].id).startsWith('layer_')) {
          widgets.splice(i, 1);
        }
      }
      selectedWidgetId = widgets.length ? widgets[widgets.length - 1].id : null;
      const guidesChk = document.getElementById('chkShowGuides');
      if (guidesChk) guidesChk.checked = false;
    }

    function renderGallery() {
      const M = window.decompiledBinData;
      if (!M) return;
      const q = searchIn.value.trim().toLowerCase();
      const ft = typeSel.value;

      const keepScroll = gallery.scrollTop;
      window._decompOpen = window._decompOpen || new Set(); // folders the user opened (keyed by first sprite id) survive re-renders
      // Switch gallery container to vertical folder stack
      gallery.style.cssText = 'display:flex; flex-direction:column; gap:5px; max-height:430px; overflow-y:auto; padding:2px; scrollbar-width:thin; scrollbar-color:#38bdf8 #090d16;';
      gallery.innerHTML = '';

      let allDecoded = M.sprites.filter(s => s.dec && s.canvas);
      if (q) allDecoded = allDecoded.filter(s => String(s.id).includes(q) || `${s.w}x${s.h}`.includes(q));
      if (ft === 'alpha') allDecoded = allDecoded.filter(s => s.dec.alpha === 1);
      if (ft === 'opaque') allDecoded = allDecoded.filter(s => s.dec.alpha === 0);

      const allowedIds = new Set(allDecoded.map(s => s.id));
      const claimedIds = new Set();
      const roleLabels = {};
      const folders = [];

      function addFolder(title, spriteIds, defaultOpen = false) {
        const validSprites = [];
        spriteIds.forEach(id => {
          if (allowedIds.has(id) && !claimedIds.has(id)) {
            const sp = M.sprites.find(s => s.id === id);
            if (sp) {
              validSprites.push(sp);
              claimedIds.add(id);
            }
          }
        });
        if (validSprites.length > 0) {
          folders.push({ title, sprites: validSprites, defaultOpen: defaultOpen || q.length > 0 || window._decompOpen.has(validSprites[0].id) });
        }
      }

      // 1. Background & Preview Folder
      const bgAndPreviewIds = [];
      M.sprites.forEach(s => {
        if (s.w >= 300 && s.h >= 300) {
          roleLabels[s.id] = 'MAIN BG';
          bgAndPreviewIds.push(s.id);
        } else if (s.id === 70 || (s.w === 240 && s.h === 240) || (s.w === 220 && s.h === 220)) {
          roleLabels[s.id] = 'PREVIEW';
          bgAndPreviewIds.push(s.id);
        }
      });
      addFolder('🖼️ Background & Preview', bgAndPreviewIds, true);

      // 2. Font Folders (Built dynamically from M.fonts + M.widgets usage)
      const subNameMap = { 0: 'Steps', 2: 'Hour', 3: 'Min', 6: 'Dist', 7: 'Kcal', 8: 'BPM', 11: 'Temp', 13: 'Date' };
      if (M.fonts && M.fonts.length > 0) {
        M.fonts.forEach(f => {
          const usedBy = [];
          (M.widgets || []).forEach(w => {
            if ((w.type === 2 || w.type === 3) && w.a === f.i) {
              const nm = subNameMap[w.sub] || `W#${w.id}`;
              if (!usedBy.includes(nm)) usedBy.push(nm);
            }
          });
          const fSprites = (f.pairs || []).map(p => {
            const chStr = p.ch >= 32 && p.ch < 127 ? String.fromCharCode(p.ch) : `0x${p.ch.toString(16)}`;
            roleLabels[p.sprite] = `"${chStr}"`;
            return p.sprite;
          });
          const sampleSp = fSprites.map(id => M.sprites.find(s => s.id === id)).filter(Boolean);
          const maxW = sampleSp.length ? Math.max(...sampleSp.map(s => s.w)) : 0;
          const maxH = sampleSp.length ? Math.max(...sampleSp.map(s => s.h)) : 0;
          const usageStr = usedBy.length ? usedBy.join(' & ') : `List #${f.i}`;
          addFolder(`🔤 Font #${f.i}: ${usageStr} (${maxW}×${maxH})`, fSprites, false);
        });
      }

      // 3. Progress Gauges & Activity Bars (Type 5 widgets: 11 frames each, 0%..100%)
      (M.widgets || []).filter(w => w.type === 5).forEach((w, idx) => {
        const frameIds = [];
        for (let k = 0; k <= 10; k++) {
          const sid = w.a + k;
          roleLabels[sid] = `${k * 10}%`;
          frameIds.push(sid);
        }
        const barTitle = (w.sub === 1) ? '📊 Steps Goal Bar' : `📊 Battery Gauge #${idx + 1}`;
        addFolder(`${barTitle} (#${w.a}–#${w.a + 10})`, frameIds, false);
      });

      // 4. Weather Condition Icons (Type 6, sub 2 or #94..#106)
      const weatherNames = ['Sunny', 'Cloudy', 'Overcast', 'Shower', 'Thunder', 'LtRain', 'ModRain', 'Sleet', 'LtSnow', 'ModSnow', 'Sand', 'Foggy', 'Windy'];
      const weatherWidget = (M.widgets || []).find(w => w.type === 6 && w.sub === 2);
      const weatherBase = weatherWidget ? weatherWidget.a : 94;
      const weatherIds = [];
      for (let k = 0; k < 13; k++) {
        const sid = weatherBase + k;
        if (M.sprites.some(s => s.id === sid && s.w < 200)) {
          roleLabels[sid] = weatherNames[k] || `Cond_${k}`;
          weatherIds.push(sid);
        }
      }
      addFolder(`🌤️ Weather Icons (#${weatherBase}–#${weatherBase + weatherIds.length - 1})`, weatherIds, false);

      // 5. Weekday Labels MON-SUN (Type 4, sub 0 or #107..#120)
      const dayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
      const dayWidget = (M.widgets || []).find(w => w.type === 4 && w.sub === 0);
      const dayBase = dayWidget ? dayWidget.a : 107;
      const dayIds = [];
      for (let d = 0; d < 7; d++) {
        const cnId = dayBase + d * 2, enId = dayBase + d * 2 + 1;
        roleLabels[cnId] = `${dayNames[d]} (CN)`;
        roleLabels[enId] = `${dayNames[d]} (EN)`;
        dayIds.push(cnId, enId);
      }
      addFolder(`📅 Weekday Labels MON–SUN (#${dayBase}–#${dayBase + 13})`, dayIds, false);

      // 6. Unit & Field Labels (CN / EN Pairs #82..#93)
      const unitKnownNames = {
        82: 'BPM (CN)', 83: 'BPM (EN)',
        84: 'KCAL (CN)', 85: 'KCAL (EN)',
        86: 'KM (CN)', 87: 'KM (EN)',
        88: 'Mi (CN)', 89: 'Mi (EN)',
        90: 'STEP (CN)', 91: 'STEP (EN)',
        92: 'TEMP (CN)', 93: 'TEMP (EN)'
      };
      const unitIds = [];
      Object.keys(unitKnownNames).forEach(k => {
        const sid = Number(k);
        roleLabels[sid] = unitKnownNames[k];
        unitIds.push(sid);
      });
      (M.widgets || []).filter(w => w.type === 4 && w.sub !== 0).forEach(w => {
        if (!unitIds.includes(w.a)) unitIds.push(w.a, w.a + 1);
      });
      addFolder('🏷️ Unit & Field Labels (CN / EN)', unitIds, false);

      // 7. Catch-all for any remaining uncategorized sprites
      const remainingIds = allDecoded.filter(s => !claimedIds.has(s.id)).map(s => s.id);
      addFolder('🧩 Other / Uncategorized Sprites', remainingIds, false);

      // Expand All / Collapse All Quick Bar
      if (folders.length > 1) {
        const ctrlRow = document.createElement('div');
        ctrlRow.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:2px;';
        const btnExpAll = document.createElement('button');
        btnExpAll.className = 'dock-btn';
        btnExpAll.style.cssText = 'height:22px !important; font-size:10px !important;';
        btnExpAll.textContent = '▾ Expand All Folders';
        const btnColAll = document.createElement('button');
        btnColAll.className = 'dock-btn';
        btnColAll.style.cssText = 'height:22px !important; font-size:10px !important;';
        btnColAll.textContent = '▸ Collapse All Folders';
        btnExpAll.onclick = () => {
          folders.forEach(f => window._decompOpen.add(f.sprites[0].id));
          gallery.querySelectorAll('.decomp-folder-body').forEach(b => b.classList.remove('folder-closed'));
          gallery.querySelectorAll('.decomp-folder-chev').forEach(c => c.textContent = '▾');
        };
        btnColAll.onclick = () => {
          window._decompOpen.clear();
          gallery.querySelectorAll('.decomp-folder-body').forEach(b => b.classList.add('folder-closed'));
          gallery.querySelectorAll('.decomp-folder-chev').forEach(c => c.textContent = '▸');
        };
        ctrlRow.append(btnExpAll, btnColAll);
        gallery.appendChild(ctrlRow);
      }

      // Render Each Folder Accordion
      folders.forEach(folder => {
        const fWrap = document.createElement('div');
        fWrap.style.cssText = 'border:1px solid #1e293b; background:#0d131f; display:flex; flex-direction:column; width:100%; box-sizing:border-box;';

        const fHead = document.createElement('div');
        fHead.style.cssText = 'padding:6px 8px; background:#151f32; color:#e2e8f0; font-size:11px; font-weight:700; display:flex; justify-content:space-between; align-items:center; cursor:pointer; user-select:none; border-bottom:1px solid #1e293b;';
        fHead.innerHTML = `
          <span>${folder.title}</span>
          <span style="display:flex; align-items:center; gap:6px;">
            ${folder.sprites.some(s => s.edited) ? `<span style="font-size:9px; padding:1px 5px; background:#f59e0b; color:#111827; font-weight:800;" title="Some sprites in this folder were edited in Sprite Studio">EDITED ${folder.sprites.filter(s => s.edited).length}/${folder.sprites.length}</span>` : ''}
            <span style="font-size:9px; padding:1px 5px; background:#0b0f19; color:#38bdf8; border:1px solid #334155;">${folder.sprites.length}</span>
            <span class="decomp-folder-chev" style="font-size:10px; color:#38bdf8;">${folder.defaultOpen ? '▾' : '▸'}</span>
          </span>
        `;

        const fBody = document.createElement('div');
        fBody.className = 'decomp-folder-body' + (folder.defaultOpen ? '' : ' folder-closed');

        fHead.onclick = () => {
          const isNowClosed = fBody.classList.toggle('folder-closed');
          if (isNowClosed) window._decompOpen.delete(folder.sprites[0].id); else window._decompOpen.add(folder.sprites[0].id);
          const chev = fHead.querySelector('.decomp-folder-chev');
          if (chev) chev.textContent = isNowClosed ? '▸' : '▾';
        };

        folder.sprites.forEach(s => {
          const card = document.createElement('div');
          card.className = 'decomp-card';
          if (s.edited) card.style.cssText = 'border-color:#f59e0b; box-shadow:0 0 0 1px #f59e0b inset;';

          const pic = document.createElement('div');
          pic.className = 'decomp-pic';
          pic.style.cursor = 'zoom-in';
          pic.title = 'Click image to toggle large view';
          const previewCv = document.createElement('canvas');
          previewCv.width = s.w; previewCv.height = s.h;
          previewCv.getContext('2d').drawImage(s.canvas, 0, 0);
          const scale = Math.min(1, 130 / s.w, 96 / s.h);
          previewCv.style.width = Math.max(1, Math.round(s.w * scale)) + 'px';
          previewCv.style.height = Math.max(1, Math.round(s.h * scale)) + 'px';
          pic.appendChild(previewCv);

          pic.onclick = () => {
            const isExpanded = card.dataset.expanded === '1';
            card.dataset.expanded = isExpanded ? '0' : '1';
            card.style.gridColumn = isExpanded ? '' : 'span 2';
            pic.style.height = isExpanded ? '104px' : '220px';
            const newScale = isExpanded ? Math.min(1, 130 / s.w, 96 / s.h) : Math.min(1.5, 280 / s.w, 210 / s.h);
            previewCv.style.width = Math.max(1, Math.round(s.w * newScale)) + 'px';
            previewCv.style.height = Math.max(1, Math.round(s.h * newScale)) + 'px';
          };

          const meta = document.createElement('div');
          meta.className = 'decomp-meta';
          const roleTxt = roleLabels[s.id] ? `<span style="color:#f59e0b; font-weight:700;">${roleLabels[s.id]}</span> • ` : '';
          meta.innerHTML = `<b>${roleTxt}#${s.id} <span style="color:#64748b;font-weight:400;">${s.w}×${s.h}</span></b><span class="decomp-tag">${s.dec.alpha ? 'ARGB' : 'RGB'}</span>${s.edited ? `<span class="decomp-tag" style="background:#f59e0b;color:#111827;font-weight:800;" title="was ${s.origW}×${s.origH}">EDITED</span>` : ''}`;

          const actions = document.createElement('div');
          actions.className = 'decomp-actions';

          const btnBg = document.createElement('button');
          btnBg.textContent = '🖼️ BG';
          btnBg.title = 'Clear default widgets and set this sprite as the 360x360 Watch Background';
          btnBg.onclick = () => {
            clearDefaultPlaceholders();
            customBgImage = s.canvas;
            bgTheme = 'image';
            const delBtn = document.getElementById('btnDeleteBg');
            if (delBtn) delBtn.disabled = false;
            if (typeof renderLayerList === 'function') renderLayerList();
            if (typeof syncInspector === 'function') syncInspector();
            if (typeof log === 'function') log(`🖼️ Cleared default widgets & set Sprite #${s.id} (${s.w}×${s.h}) as Watch Background.`, 'ok');
          };

          const btnAdd = document.createElement('button');
          btnAdd.textContent = '➕ Layer';
          btnAdd.title = 'Add this sprite onto the 360x360 canvas as a draggable widget layer';
          btnAdd.onclick = () => {
            const newW = {
              id: 'sprite_' + s.id + '_' + Date.now(),
              type: 'customText',
              name: `🧩 Sprite #${s.id} ${roleLabels[s.id] || ''} (${s.w}×${s.h})`,
              x: 180, y: 180,
              scale: 1.0, opacity: 1.0, visible: true, locked: false,
              color: '#00e5ff', accent: '#ffffff', text: `SPR_${s.id}`,
              fwId: '0x20', spriteId: s.id, spriteCanvas: s.canvas
            };
            widgets.push(newW);
            selectedWidgetId = newW.id;
            if (typeof renderLayerList === 'function') renderLayerList();
            if (typeof syncInspector === 'function') syncInspector();
            if (typeof log === 'function') log(`➕ Added Sprite #${s.id} (${s.w}×${s.h}) as a canvas layer.`, 'ok');
          };

          const btnMap = document.createElement('button');
          btnMap.textContent = '🔗 Map';
          btnMap.title = 'Attach this sprite to the currently selected widget layer';
          btnMap.onclick = () => {
            const w = widgets.find(x => x.id === selectedWidgetId);
            if (!w) {
              if (typeof log === 'function') log('⚠️ Select a widget layer first to map this sprite to it.', 'warn');
              return;
            }
            w.spriteCanvas = s.canvas;
            w.spriteId = s.id;
            w.name = `${w.name.split(' [')[0]} [Spr #${s.id}]`;
            if (typeof renderLayerList === 'function') renderLayerList();
            if (typeof syncInspector === 'function') syncInspector();
            if (typeof log === 'function') log(`🔗 Mapped Sprite #${s.id} (${s.w}×${s.h}) to layer "${w.name}".`, 'ok');
          };

          actions.append(btnBg, btnAdd, btnMap);
          card.append(pic, meta, actions);
          fBody.appendChild(card);
        });

        fWrap.append(fHead, fBody);
        gallery.appendChild(fWrap);
      });
      gallery.scrollTop = keepScroll;
    }

    // Sprite Studio calls this after every edit so the vault thumbnails / EDITED badges stay in step (coalesced per frame).
    let galleryTimer = 0;
    window.refreshDecompGallery = function () {
      if (galleryTimer) return;
      galleryTimer = setTimeout(() => { galleryTimer = 0; try { renderGallery(); } catch (e) { console.warn('gallery refresh', e); } }, 120);
    };

    function updateStagePreviewBox(M) {
      const wysiwygStage = document.getElementById('studioWysiwygViewport');
      if (!wysiwygStage || !M || !M.sprites) return;
      let prevBox = document.getElementById('wysiwygBinPreviewBox');
      if (prevBox) prevBox.remove();

      prevBox = document.createElement('div');
      prevBox.id = 'wysiwygBinPreviewBox';
      prevBox.style.cssText = 'position:absolute; bottom:12px; right:12px; z-index:90; background:rgba(13,19,31,0.96); border:1px solid #38bdf8; padding:6px; display:flex; flex-direction:column; align-items:center; gap:4px; box-shadow:0 6px 20px rgba(0,0,0,0.8); cursor:pointer; user-select:none;';
      prevBox.title = 'Click to toggle size (150x150 <-> 240x240)';
      prevBox.innerHTML = `
        <span id="wysiwygBinPreviewLabel" style="font-size:10px; font-weight:700; color:#38bdf8; text-transform:uppercase; letter-spacing:0.5px;">LIVE PREVIEW (CLICK TO ENLARGE)</span>
        <div id="wysiwygBinPreviewCanvasWrap" style="width:150px; height:150px; background:#05080f; border:1px solid #1e293b; display:flex; align-items:center; justify-content:center; overflow:hidden; transition:width 0.15s ease, height 0.15s ease;"></div>
      `;
      wysiwygStage.appendChild(prevBox);

      // LIVE preview: the same render as the editor canvas (no selection UI), refreshed 5x/s, so every edit shows here too.
      // (The vendor thumbnail sprite inside the .bin is NOT regenerated by edits.)
      const wrap = prevBox.querySelector('#wysiwygBinPreviewCanvasWrap');
      const lbl = prevBox.querySelector('#wysiwygBinPreviewLabel');
      if (window._binPrevTimer) clearInterval(window._binPrevTimer);
      const live = document.createElement('canvas');
      live.width = 360; live.height = 360;
      live.style.cssText = 'width:100%; height:100%; object-fit:contain; pointer-events:none;';
      wrap.appendChild(live);
      const lc = live.getContext('2d');
      window._binPrevTimer = setInterval(() => {
        if (!document.body.contains(live)) { clearInterval(window._binPrevTimer); return; }
        lc.clearRect(0, 0, 360, 360);
        try { drawWatchface(lc, 360, 360, { showUI: false }); } catch (e) { /* editor not ready */ }
      }, 200);

      prevBox.onclick = (e) => {
        e.stopPropagation();
        const isLarge = prevBox.dataset.large === '1';
        prevBox.dataset.large = isLarge ? '0' : '1';
        wrap.style.width = isLarge ? '150px' : '240px';
        wrap.style.height = isLarge ? '150px' : '240px';
        if (lbl) lbl.textContent = isLarge ? 'LIVE PREVIEW (CLICK TO ENLARGE)' : 'LIVE PREVIEW (240×240)';
      };
    }

    function loadBinBuffer(buf, name) {
      try {
        const M = window.parseTopstepBin(buf, name);
        M.u = new Uint8Array(buf); M.buffer = buf; window.decompiledBinData = M;
        const okCount = M.sprites.filter(s => s.dec).length;
        statusBox.innerHTML = `<span style="color:#10b981;">✓ ${M.fileName}</span> • <b>${okCount}</b> sprites • <b>${M.widgets.length}</b> widgets • ID: 0x${M.tbui.dialId.toString(16).toUpperCase()}`;
        renderGallery();
        updateStagePreviewBox(M);
        if (typeof log === 'function') log(`📦 Decompiled ${name}: ${okCount} sprites, ${M.widgets.length} hardware widgets.`, 'ok');
      } catch (err) {
        statusBox.innerHTML = `<span style="color:#ef4444;">✗ Error: ${err.message}</span>`;
        if (typeof log === 'function') log(`✗ .BIN Decompile failed: ${err.message}`, 'err');
      }
    }

    // Wire File Input
    const fileIn = decompBody.querySelector('#decompBinFileInput');
    decompBody.querySelector('#btnDecompOpenFile').onclick = () => fileIn.click();
    fileIn.onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      loadBinBuffer(await f.arrayBuffer(), f.name);
    };

    // Wire Template Load
    decompBody.querySelector('#btnDecompUseTemplate').onclick = async () => {
      if (typeof loadedTemplateBin !== 'undefined' && loadedTemplateBin) {
        loadBinBuffer(loadedTemplateBin.buffer || loadedTemplateBin, 'HT37_Template.bin');
      } else {
        try {
          statusBox.textContent = 'Fetching HT37_Template.bin...';
          const resp = await fetch('HT37_Template.bin');
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const buf = await resp.arrayBuffer();
          loadBinBuffer(buf, 'HT37_Template.bin');
        } catch (err) {
          statusBox.innerHTML = `<span style="color:#f59e0b;">Click "📂 Load .BIN File" to select a local .bin file.</span>`;
        }
      }
    };

    // Wire Auto-Assemble BG & Layout (Wipes old widgets & background first!)
    decompBody.querySelector('#btnDecompAutoAssemble').onclick = () => {
      const M = window.decompiledBinData;
      if (!M) {
        if (typeof log === 'function') log('⚠️ Load a .BIN file first before auto-assembling.', 'warn');
        return;
      }
      // 1. Wipe all existing widgets & turn off default background/guides so watchface starts blank
      widgets.length = 0;
      selectedWidgetId = null;
      customBgImage = null;
      bgTheme = 'none';
      const guidesChk = document.getElementById('chkShowGuides');
      if (guidesChk) guidesChk.checked = false;

      // 2. Find 360x360 background sprite and assign it
      const bgSpr = M.sprites.find(s => s.dec && s.w >= 300 && s.h >= 300);
      if (bgSpr && bgSpr.canvas) {
        customBgImage = bgSpr.canvas; window.userUploadedCustomBg = false;
        bgTheme = 'image';
        const delBtn = document.getElementById('btnDeleteBg');
        if (delBtn) delBtn.disabled = false;
      }

      // 3. Load authentic .bin sprite widgets with live reactive sensor binding
      let added = 0;

      // Helper: Compose a number/text string using a TBUI FontList (M.fonts[fontIdx])
      window.buildBinFontCanvas = function(M, fontIdx, strText) {
        if (!M || !M.fonts || !M.fonts.length) return null;
        const fl = M.fonts[fontIdx] || M.fonts[0];
        if (!fl || !fl.pairs || !fl.pairs.length) return null;
        const digitSprites = Array.from(String(strText)).map(ch => {
          const asciiCode = ch.charCodeAt(0);
          const pair = fl.pairs.find(p => p.ch === asciiCode) || fl.pairs[0];
          return pair ? M.sprites.find(s => s.id === pair.sprite && s.dec && s.canvas) : null;
        }).filter(Boolean);
        if (!digitSprites.length) return null;
        const totalW = digitSprites.reduce((sum, s) => sum + s.w, 0);
        const maxH = Math.max(...digitSprites.map(s => s.h));
        const compCv = document.createElement('canvas');
        compCv.width = totalW; compCv.height = maxH;
        const ctx = compCv.getContext('2d');
        let dx = 0;
        digitSprites.forEach(s => { ctx.drawImage(s.canvas, dx, 0); dx += s.w; });
        return { canvas: compCv, w: totalW, h: maxH, firstSpriteId: digitSprites[0].id };
      };

      // Helper: Synchronize all loaded .BIN hardware widgets with current Tab 1 Tool 3 sensor values
      window.syncBinWidgetsWithSensors = function() {
        const M = window.decompiledBinData;
        if (!M || !widgets || !widgets.length) return;

        const localeMode = (document.getElementById('decompLocaleSelect') || {}).value || 'EN_IMPERIAL';
        const isEnglish = localeMode.startsWith('EN_');
        const isImperial = localeMode === 'EN_IMPERIAL';

        // With a watch connected, a value the watch has not reported yet shows as 00 instead of a made-up test number.
        const LD = HT37.liveData, ldLive = !!(LD && LD.isLive()), kn = (k) => !ldLive || LD.known[k];
        const curSteps = !kn('steps') ? 0 : (typeof sensors !== 'undefined' && sensors.steps != null) ? Number(sensors.steps) : 6840;
        const curHr    = !kn('hr') ? 0 : (typeof sensors !== 'undefined' && sensors.hr != null) ? Number(sensors.hr) : 86;
        const curBat   = (typeof sensors !== 'undefined' && sensors.battery != null) ? Number(sensors.battery) : 50;
        const curTempC = (typeof sensors !== 'undefined' && sensors.weatherTemp != null) ? Number(sensors.weatherTemp) : 22;
        const curCond  = (typeof sensors !== 'undefined' && sensors.weatherCond) ? String(sensors.weatherCond).toUpperCase() : 'SUNNY';

        const simTimeEl = document.getElementById('simClockTime');
        const timeParts = (simTimeEl && simTimeEl.value) ? simTimeEl.value.split(':') : ['09', '40'];
        const curHour   = (timeParts[0] || '09').padStart(2, '0');
        const curMin    = (timeParts[1] || '40').padStart(2, '0');
        const simDayEl  = document.getElementById('simWeekdaySelect');
        const dayIdx    = simDayEl ? Number(simDayEl.value) : 0; // 0=MON .. 6=SUN
        const simDateEl = document.getElementById('simDateInput');
        const curDate   = (simDateEl && simDateEl.value) ? simDateEl.value : '06/28';

        // With a watch connected, distance and calories are the watch's own totals (0x05/0x22): km or miles with one decimal, whole kcal (as the watch prints them).
        const wDist = ldLive && typeof sensors !== 'undefined' && sensors.distanceM != null, wCal = ldLive && typeof sensors !== 'undefined' && sensors.calories != null;
        const kcalStr = wCal ? String(Math.round(sensors.calories / 1000)) : (ldLive ? '0' : (curSteps * 0.015117).toFixed(1));
        const distStr = wDist ? (isImperial ? sensors.distanceM / 1609.344 : sensors.distanceM / 1000).toFixed(1) : (ldLive ? '--' : (isImperial ? (curSteps * 0.000475).toFixed(2) : (curSteps * 0.000764).toFixed(2)));
        const tempVal = isImperial ? Math.round(curTempC * 9 / 5 + 32) : Math.round(curTempC);
        const tempStr = `${tempVal}${isImperial ? 'F' : 'C'}`;

        // Weather icon sets have 13 frames: frame 0 = unknown, then the sky codes 0x01 (sunny) .. 0x0C (foggy). Frame index = sky code (checked on a real watch).
        const condOff = typeof skyCodeFromCond === 'function' ? skyCodeFromCond(sensors.weatherCond) : 1;

        widgets.forEach(w => {
          const hm = w.hwMeta;
          if (!hm) return;

          // Detect if user manually dragged the widget on the canvas and update its anchor
          if (hm.lastCalcX !== undefined && (Math.abs(w.x - hm.lastCalcX) > 1 || Math.abs(w.y - hm.lastCalcY) > 1)) {
            hm.anchorX += (w.x - hm.lastCalcX);
            hm.anchorY += (w.y - hm.lastCalcY);
            if (hm.type === 1) { hm.lastCalcX = w.x; hm.lastCalcY = w.y; } // hands have no recompute branch below
          }

          // A. Type 5: Progress Bars (Steps Bar sub=1 @ #71..81, Battery Bars sub=0 @ #47..57 & #58..68)
          if (hm.type === 5) {
            const ratio = (hm.sub === 1) ? Math.min(1, Math.max(0, curSteps / 10000)) : Math.min(1, Math.max(0, curBat / 100));
            const frameIdx = Math.round(ratio * 10);
            const sp = M.sprites.find(s => s.id === (hm.a + frameIdx) && s.dec && s.canvas);
            if (sp) {
              w.spriteId = sp.id;
              w.spriteCanvas = sp.canvas;
              w.x = hm.anchorX + sp.w / 2;
              w.y = hm.anchorY + sp.h / 2;
              hm.lastCalcX = w.x; hm.lastCalcY = w.y;
            }
          }
          // B. Type 6: Weather Condition Icon (sub=2, base #94)
          else if (hm.type === 6 && hm.sub === 2) {
            const sp = M.sprites.find(s => s.id === (hm.a + condOff) && s.dec && s.canvas) || M.sprites.find(s => s.id === hm.a && s.dec);
            if (sp) {
              w.spriteId = sp.id;
              w.spriteCanvas = sp.canvas;
              w.x = hm.anchorX + sp.w / 2;
              w.y = hm.anchorY + sp.h / 2;
              hm.lastCalcX = w.x; hm.lastCalcY = w.y;
            }
          }
          // C. Type 4: indexed sprite sets. Language pairs are stored INTERLEAVED, Chinese first then English:
          //    weekday (sub 0): a + 2*day + lang | AM/PM (sub 6): a + 2*pm + lang | km/mi units (a=86): a + 2*imperial + lang | other labels: a + lang
          //    (verified on 5 faces; lang = 1 for English). 1004504's 84x84 weekday dials follow the same rule.
          else if (hm.type === 4) {
            const lang = isEnglish ? 1 : 0, pm = Number(curHour) >= 12 ? 1 : 0;
            if (hm.sub === 6 && (window.HT37_watchIs12 === true || window.HT37_watchIs12 === false)) { // the watch hides the AM/PM label in 24-hour mode
              if (!window.HT37_watchIs12 && w.visible !== false) { w.visible = false; w._ampmAutoHidden = true; } else if (window.HT37_watchIs12 && w._ampmAutoHidden) { w.visible = true; w._ampmAutoHidden = false; }
            }
            let targetId = hm.a + lang;
            if (hm.sub === 0) targetId = hm.a + dayIdx * 2 + lang;
            else if (hm.sub === 6) targetId = hm.a + pm * 2 + lang;
            else if (hm.a === 86) targetId = hm.a + (isImperial ? 2 : 0) + lang;
            const sp = M.sprites.find(s => s.id === targetId && s.dec && s.canvas) || M.sprites.find(s => s.id === hm.a && s.dec && s.canvas);
            if (sp) {
              w.spriteId = sp.id;
              w.spriteCanvas = sp.canvas;
              w.x = hm.anchorX + sp.w / 2;
              w.y = hm.anchorY + sp.h / 2;
              hm.lastCalcX = w.x; hm.lastCalcY = w.y;
            }
          }
          // D. Types 2 & 3: Dynamic Font Numbers
          else if (hm.type === 2 || hm.type === 3) {
            const valMap = {
              0:  { str: String(Math.round(curSteps)).padStart(5, '0'), label: 'Steps' },
              // INFERRED (not vendor-documented): type 2 sub 1 on faces 1004018/1004189 is the 2-digit day of month ("06" in the app preview).
              1:  { str: (curDate.split('/')[1] || '01').padStart(2, '0'), label: 'Day' },
              2:  { str: curHour,  label: 'Hour' },
              3:  { str: curMin,   label: 'Minute' },
              6:  { str: distStr,  label: 'Distance' },
              7:  { str: kcalStr,  label: 'Kcal' },
              8:  { str: kn('hr') ? String(Math.round(curHr)) : '00', label: 'BPM' },
              15: { str: String(Math.round(curBat)), label: 'Battery %' },
              19: { str: String(new Date().getFullYear()), label: 'Year' },
              11: { str: tempStr,  label: 'Temp' },
              // found on hardware (probe face): type 3 sub 9 prints "0/0" with no reading = blood pressure as sys/dia
              // CONFIRMED on hardware: type 3 sub 10 = blood oxygen, printed with a percent sign ("97%") after the watch's own SpO2 test; `--` with no data
              10: { str: (typeof sensors !== 'undefined' && sensors.spo2 > 0) ? (sensors.spo2 + '%') : '--', label: 'Blood oxygen' },
              9:  { str: (typeof sensors !== 'undefined' && sensors.bpSys != null && sensors.bpSys > 0) ? (sensors.bpSys + '/' + sensors.bpDia) : '0/0', label: 'Blood pressure' },
              13: { str: curDate,  label: 'Date' }
            };
            let info = valMap[hm.sub] || { str: '80', label: `Sub_${hm.sub}` };
            // Type 2 sub 0 is the CLOCK ("HH:MM", its font has a ':' glyph); type 3 sub 0 is the step count (docs/BIN_FORMAT.md section 4).
            // Faces that have an AM/PM label (type 4 sub 6) show a 12-hour clock.
            const twelve = (window.HT37_watchIs12 === true || window.HT37_watchIs12 === false) ? window.HT37_watchIs12 : M.widgets.some(x => x.type === 4 && x.sub === 6), hh = twelve ? String((Number(curHour) % 12) || 12).padStart(2, '0') : curHour;
            if (hm.type === 2 && hm.sub === 0) info = { str: hh + ':' + curMin, label: 'Time' };
            else if (hm.sub === 2) info = { str: hh, label: 'Hour' };
            else if (hm.type === 2 && hm.sub === 4) info = { str: String(new Date().getSeconds()).padStart(2, '0'), label: 'Seconds (guess)' };
            const built = window.buildBinFontCanvas(M, hm.a, info.str);
            if (built) {
              w.spriteCanvas = built.canvas;
              w.spriteId = built.firstSpriteId;
              w.text = info.str;
              w.name = `🔢 ${info.label} "${info.str}" (b=${hm.b})`;
              let cx = hm.anchorX + built.w / 2;
              if (hm.b === 2) cx = hm.anchorX - built.w / 2;
              else if (hm.b === 1) cx = hm.anchorX;
              w.x = cx;
              w.y = hm.anchorY + built.h / 2;
              hm.lastCalcX = w.x; hm.lastCalcY = w.y;
            }
          }
        });
      };

      M.widgets.forEach(hw => {
        // Type 1 = analog hand (sub 6 hour / 7 minute / 8 second): built by the template in js/editor/face-widgets/analog-hand.js.
        if (hw.type === 1) {
          const sp = M.sprites.find(s => s.id === hw.a && s.dec);
          if (sp && sp.canvas) { widgets.push(HT37.faceWidgets.analogHand.createFromEntry(hw, sp, added)); added++; }
        } else if ([0, 4, 5, 6].includes(hw.type)) {
          const sp = M.sprites.find(s => s.id === hw.a && s.dec);
          if (sp && sp.canvas && !(sp.w >= 350 && sp.h >= 350) && !(sp.w === 240 && sp.h === 240)) {
            const cx = hw.x + sp.w / 2, cy = hw.y + sp.h / 2;
            widgets.push({
              id: 'hw_widget_' + hw.i + '_' + Date.now() + '_' + added,
              type: 'customText',
              name: `🖼️ HW #${hw.id} (Spr #${sp.id})`,
              x: cx, y: cy,
              scale: 1.0, opacity: 1.0, visible: true, locked: false,
              color: '#00e5ff', accent: '#ffffff', text: `W_${hw.id}`,
              fwId: '0x' + hw.type.toString(16).padStart(2, '0'),
              spriteId: sp.id, spriteCanvas: sp.canvas,
              hwMeta: { i: hw.i, id: hw.id, type: hw.type, sub: hw.sub, a: hw.a, b: hw.b, anchorX: hw.x, anchorY: hw.y, lastCalcX: cx, lastCalcY: cy }
            });
            added++;
          }
        } else if ((hw.type === 2 || hw.type === 3) && M.fonts && M.fonts.length > 0) {
          const built = window.buildBinFontCanvas(M, hw.a, '0');
          if (built) {
            const cx = hw.x + built.w / 2, cy = hw.y + built.h / 2;
            widgets.push({
              id: 'hw_font_' + hw.i + '_' + Date.now() + '_' + added,
              type: 'customText',
              name: `🔢 HW #${hw.id}`,
              x: cx, y: cy,
              scale: 1.0, opacity: 1.0, visible: true, locked: false,
              color: '#f59e0b', accent: '#ffffff', text: '0',
              fwId: '0x' + hw.type.toString(16).padStart(2, '0'),
              spriteId: built.firstSpriteId, spriteCanvas: built.canvas,
              hwMeta: { i: hw.i, id: hw.id, type: hw.type, sub: hw.sub, a: hw.a, b: hw.b, anchorX: hw.x, anchorY: hw.y, lastCalcX: cx, lastCalcY: cy }
            });
            added++;
          }
        }
      });

      window.syncBinWidgetsWithSensors();
      if (typeof renderLayerList === 'function') renderLayerList();
      if (typeof syncInspector === 'function') syncInspector();
      if (typeof log === 'function') log(`✨ Cleared old widgets & auto-assembled .BIN background + ${added} sprite layers!`, 'ok');
    };

    searchIn.oninput = renderGallery;

    // Hook native updateLiveSensorReadout so any slider drag immediately updates .BIN widgets
    if (typeof window.updateLiveSensorReadout === 'function' && !window.updateLiveSensorReadout._binHooked) {
      const origUpdateReadout = window.updateLiveSensorReadout;
      window.updateLiveSensorReadout = function() {
        const res = origUpdateReadout.apply(this, arguments);
        if (typeof window.syncBinWidgetsWithSensors === 'function') window.syncBinWidgetsWithSensors();
        return res;
      };
      window.updateLiveSensorReadout._binHooked = true;
    }

    const locSel = document.getElementById('decompLocaleSelect');
    if (locSel) locSel.addEventListener('change', () => { if (window.syncBinWidgetsWithSensors) window.syncBinWidgetsWithSensors(); });

    const secSim = document.getElementById('secSensorWeatherBody');
    if (secSim && !document.getElementById('simClockTime')) {
      const extraSim = document.createElement('div');
      extraSim.style.cssText = 'display:flex; flex-direction:column; gap:6px; margin-top:4px; padding-top:6px; border-top:1px solid #1e293b;';
      extraSim.innerHTML = `
        <div class="compact-slider-row" style="display:flex; align-items:center; gap:6px;">
          <label style="width:75px; font-size:11px;">❤️ Heart BPM</label>
          <input type="range" id="simHrBin" min="40" max="200" value="86" style="flex:1;" />
          <span id="valHrBin" style="width:36px; text-align:right; font-size:11px; font-family:monospace;">86</span>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; width:100%;">
          <div style="display:flex; flex-direction:column; gap:2px;">
            <label style="font-size:9px; color:#94a3b8; font-weight:700;">🕓 TIME (HH:MM)</label>
            <input type="text" id="simClockTime" value="09:40" maxlength="5" style="width:100%; height:26px; background:#111827; color:#38bdf8; border:1px solid #334155; text-align:center; font-family:monospace; font-size:11px;" />
          </div>
          <div style="display:flex; flex-direction:column; gap:2px;">
            <label style="font-size:9px; color:#94a3b8; font-weight:700;">📆 DATE (MM/DD)</label>
            <input type="text" id="simDateInput" value="06/28" maxlength="5" style="width:100%; height:26px; background:#111827; color:#38bdf8; border:1px solid #334155; text-align:center; font-family:monospace; font-size:11px;" />
          </div>
          <div style="display:flex; flex-direction:column; gap:2px;">
            <label style="font-size:9px; color:#94a3b8; font-weight:700;">📅 WEEKDAY</label>
            <select id="simWeekdaySelect" style="width:100%; height:26px; background:#111827; color:#e2e8f0; border:1px solid #334155; font-size:11px; padding:2px;">
              <option value="0" selected>MON</option>
              <option value="1">TUE</option>
              <option value="2">WED</option>
              <option value="3">THU</option>
              <option value="4">FRI</option>
              <option value="5">SAT</option>
              <option value="6">SUN</option>
            </select>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
          <button type="button" id="btnSimClockStop" class="dock-btn" style="flex:1; height:26px; font-size:11px;">&#9208; STOP TIME</button>
          <button type="button" id="btnSimClockStart" class="dock-btn" style="flex:1; height:26px; font-size:11px;">&#9654; START TIME</button>
        </div>
        <div id="simClockReadout" style="font-family:monospace; font-size:11px; color:#fbbf24; text-align:center;"></div>
      `;
      secSim.appendChild(extraSim);

      // STOP TIME freezes ONE shared clock (all hands + digital time) at the current moment; type HH:MM or HH:MM:SS to place the hands.
      // START TIME returns to the live local time (what the watch shows). window.getSimClockParts() is the single source for every dial.
      const clockIn = extraSim.querySelector('#simClockTime'), readout = extraSim.querySelector('#simClockReadout');
      const stopBtn = extraSim.querySelector('#btnSimClockStop'), startBtn = extraSim.querySelector('#btnSimClockStart');
      const pad2 = n => String(n).padStart(2, '0');
      const refreshClockUi = () => {
        const live = window.simClock.live, t = window.getSimClockParts();
        stopBtn.disabled = !live; startBtn.disabled = live;
        stopBtn.style.opacity = live ? '1' : '0.45'; startBtn.style.opacity = live ? '0.45' : '1';
        startBtn.style.color = live ? '' : '#10b981'; stopBtn.style.color = live ? '#f87171' : '';
        clockIn.disabled = live; clockIn.style.opacity = live ? '0.55' : '1';
        readout.textContent = (live ? 'LIVE  ' : 'STOPPED  ') + pad2(t.h) + ':' + pad2(t.m) + ':' + pad2(Math.floor(t.s));
      };
      stopBtn.addEventListener('click', () => {
        const t = window.getSimClockParts();
        window.simClock.live = false;
        clockIn.value = pad2(t.h) + ':' + pad2(t.m) + ':' + pad2(Math.floor(t.s));
        clockIn.dispatchEvent(new Event('input')); refreshClockUi();
      });
      startBtn.addEventListener('click', () => { window.simClock.live = true; refreshClockUi(); });
      clockIn.addEventListener('input', refreshClockUi);
      setInterval(() => {
        const t = window.getSimClockParts(), hhmm = pad2(t.h) + ':' + pad2(t.m);
        if (window.simClock.live && clockIn.value !== hhmm) { clockIn.value = hhmm; clockIn.dispatchEvent(new Event('input')); }
        refreshClockUi();
      }, 250);
      clockIn.maxLength = 8; refreshClockUi();

      const hrSlider = extraSim.querySelector('#simHrBin');
      const hrVal = extraSim.querySelector('#valHrBin');
      hrSlider.addEventListener('input', () => {
        if (typeof sensors !== 'undefined') sensors.hr = Number(hrSlider.value);
        hrVal.textContent = hrSlider.value;
        if (typeof updateLiveSensorReadout === 'function') updateLiveSensorReadout();
        if (window.syncBinWidgetsWithSensors) window.syncBinWidgetsWithSensors();
      });
    }

    ['simSteps', 'simBat', 'simBaro', 'simWeatherTemp', 'simWeatherCond', 'simClockTime', 'simDateInput', 'simWeekdaySelect'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => { if (window.syncBinWidgetsWithSensors) window.syncBinWidgetsWithSensors(); });
        el.addEventListener('change', () => { if (window.syncBinWidgetsWithSensors) window.syncBinWidgetsWithSensors(); });
      }
    });
    typeSel.onchange = renderGallery;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(setupRightDecompilerDock, 50));
  } else {
    setTimeout(setupRightDecompilerDock, 50);
  }
})();
