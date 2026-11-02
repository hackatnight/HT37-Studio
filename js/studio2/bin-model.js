/**
 * @file     js/studio2/bin-model.js
 * @layer    Studio 2 core
 * @summary  Reads a TOPSTEP/TBUI watch-face .bin into a small model (widgets, sprites, fonts) and writes edits back.
 *           Sprites are decoded on demand (a vendor face can hold 300+). Edits are written IN PLACE (widget x/y), so everything else in the
 *           file stays byte-identical, then the header checksum is recomputed. Layout facts: docs/BIN_FORMAT.md sections 1-2 and 10.
 * API  HT37S.bin = { parse(arrayBuffer, name) -> model }
 *      model = { name, u8, B, size, dialId, widgets[], sprites[], fonts[], previewId,
 *                sprite(id) -> HTMLCanvasElement|null, runLength(id) -> number of consecutive same-size sprites from id,
 *                bytes() -> Uint8Array (with edited widget positions), dirty() -> boolean }
 *      widget = { i, type, sub, flag, x, y, w, h, a, b, n, off, orig:{x,y} }   (w,h = bytes 8-11, the size for touch areas)
 */
(function () {
  const S = (window.HT37S = window.HT37S || {});
  const ascii = (u, o, n) => { let s = ''; for (let i = 0; i < n && o + i < u.length; i++) s += String.fromCharCode(u[o + i]); return s; };

  function parse(buf, name) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    if (u8.length < 0x500 || ascii(u8, 0, 7) !== 'TOPSTEP') throw new Error('This is not a TOPSTEP watch-face file.');
    const B = dv.getUint32(0x24, true);
    if (B >= u8.length - 0x70 || ascii(u8, B, 4) !== 'TBUI') throw new Error('The face data block (TBUI) was not found.');
    const U32 = (o) => dv.getUint32(o, true), U16 = (o) => dv.getUint16(o, true);
    const dirW = { off: U32(B + 0x40), count: U16(B + 0x44), size: U16(B + 0x46) }, dirS = { off: U32(B + 0x48), count: U16(B + 0x4c), size: U16(B + 0x4e) }, dirF = { off: U32(B + 0x50), count: U16(B + 0x54), size: U16(B + 0x56) };
    const widgets = [];
    for (let i = 0; i < dirW.count; i++) {
      const o = B + dirW.off + i * dirW.size; if (o + dirW.size > u8.length) break;
      const w = { i, type: u8[o + 1], flag: u8[o + 2], sub: u8[o + 3], x: U16(o + 4), y: U16(o + 6), w: U16(o + 8), h: U16(o + 10), a: U16(o + 12), b: U16(o + 14), n: u8[o + 16], off: o };
      w.orig = { x: w.x, y: w.y }; widgets.push(w);
    }
    const fonts = [], stride = dirF.size * 4;
    for (let i = 0; i < dirF.count; i++) {
      const o = B + dirF.off + i * stride; if (o + 4 > u8.length) break;
      const cnt = U32(o), map = {};
      for (let k = 0; k < cnt && k < (stride - 4) / 4; k++) map[U16(o + 4 + k * 4)] = U16(o + 6 + k * 4);
      fonts.push(map);
    }
    const sprites = [];
    for (let i = 0; i < dirS.count; i++) {
      const o = B + dirS.off + i * dirS.size; if (o + dirS.size > u8.length) break;
      sprites.push({ index: i, id: U16(o), flag: u8[o + 3], w: U16(o + 4), h: U16(o + 6), abs: B + U32(o + 8) });
    }
    const cache = new Map();
    const model = {
      name: name || 'face.bin', u8, B, size: u8.length, dialId: U32(B + 8) & 0xffffff, widgets, sprites, fonts, previewId: U32(B + 0x60),
      sprite(id) {
        if (cache.has(id)) return cache.get(id);
        const s = sprites[id]; let cv = null;
        if (s) { try { const d = window.decodePA(u8, s.abs, s.w, s.h), h = d.h || s.h; cv = document.createElement('canvas'); cv.width = s.w; cv.height = h; cv.getContext('2d').putImageData(new ImageData(d.rgba, s.w, h), 0, 0); } catch (e) { cv = null; } }
        cache.set(id, cv); return cv;
      },
      runLength(id) { const s = sprites[id]; if (!s) return 0; let n = 1; while (sprites[id + n] && sprites[id + n].w === s.w && sprites[id + n].h === s.h) n++; return n; },
      dirty() { return widgets.some((w) => w.x !== w.orig.x || w.y !== w.orig.y); },
      bytes() {
        const out = new Uint8Array(u8), o = new DataView(out.buffer);
        widgets.forEach((w) => { o.setUint16(w.off + 4, Math.max(0, Math.round(w.x)), true); o.setUint16(w.off + 6, Math.max(0, Math.round(w.y)), true); });
        o.setUint16(0x10, window.crc16Header568x(out.subarray(1024)), true);
        return out;
      }
    };
    return model;
  }
  S.bin = { parse };
})();
