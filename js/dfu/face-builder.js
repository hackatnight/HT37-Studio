/**
 * @file     js/dfu/face-builder.js
 * @layer    FILE BUILDER (writes a brand-new TOPSTEP/TBUI watch-face .bin from a description)
 * @summary  build(spec) -> Uint8Array. Nothing is copied from an existing face except the fixed 1184-byte header (container header,
 *           TBUI header, directory headers), which is embedded below. Widgets, sprites, fonts and pixel data are written fresh.
 *
 * LAYOUT (all offsets relative to B = 0x400, the TBUI block; matches the sample faces, which pad every gap with zeros):
 *   B+0x000 .. 0x0A0  TBUI header: dial id @8, size @0x0C, width/height @0x20/0x22, directories {u32 off, u16 count, u16 size} @0x40 widgets,
 *                     @0x48 sprites, @0x50 fonts; @0x5C = offset of the first sprite's pixel data; @0x60 = preview sprite id
 *   B+0x0A0           widget table: 32-byte entries (room for 100)
 *   B+0xD20           sprite table: 12-byte entries {u16 id, u8 fmt=14, u8 flag (1 opaque, 2 alpha), u16 w, u16 h, u32 offset}
 *   then              font table: entries of 384 bytes {u32 count, count x (u16 char, u16 sprite id)} (directory "size" field holds 96 = 384/4)
 *   then              sprite pixel data (PA codec, each sprite padded to 4 bytes), then the ASCII footer "TBUI"
 * SPEC  { dialId?, widgets:[{type, sub, x, y, a, b, flag?, px?, py?, n?}] (n = frame count of a type 7 animation), sprites:[{w, h, alpha, rgba}], fonts:[[{ch, sprite}]], previewSprite }
 *       Sprite ids are array indexes. Widget ids are array indexes (draw order = array order).
 * NOT VERIFIED ON HARDWARE until the file has been flashed; the parser round trip (parseTopstepBin + CRC) is checked in the tool.
 * API   HT37.faceBuilder = { build, HEADER_B64 }
 */
(function () {
  window.HT37 = window.HT37 || {};
  const HEADER_B64 = 'VE9QU1RFUAEAAAAAPDEFAHQaAAEAAAAAAAAAAAAAAABMBQIAAAQAADwtBQAAAAAAAQA0AAAAAABndWlfZGlhbF9iaW5maWxlX3dhdGNoXzEwMDQxODlfMV8yMDI0MDgxOV9vdGEuYmluAKHkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFRCVUkBAAAAnVIPATgtBQBAAAAACgAAAAAAAAAAAAMAaAFoAQIAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAEQAgACANAABlAAwAIBkAAAUAYAAEAAAAIEkAAE8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAmP///wAAAAAAAAAAAAAAAAAAAAA=';
  const B = 0x400, WIDGET_TAB = 0xA0, WIDGET_CAP = 100, WIDGET_SIZE = 32, SPRITE_TAB = WIDGET_TAB + WIDGET_CAP * WIDGET_SIZE, SPRITE_SIZE = 12, FONT_STRIDE = 384;

  const b64ToBytes = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const pad4 = (a) => { const n = (a.byteLength + 3) & ~3; if (n === a.byteLength) return a; const o = new Uint8Array(n); o.set(a); return o; };
  const up = (n, m) => Math.ceil(n / m) * m;

  function build(spec) {
    if (typeof window.encodePA !== 'function' || typeof window.crc16Header568x !== 'function' && typeof crc16Header568x !== 'function') throw new Error('PA encoder / CRC helper not loaded');
    const crc = typeof crc16Header568x === 'function' ? crc16Header568x : window.crc16Header568x;
    const W = spec.widgets, S = spec.sprites, F = spec.fonts || [];
    if (W.length > WIDGET_CAP) throw new Error('too many widgets (' + W.length + ' > ' + WIDGET_CAP + ')');
    F.forEach((f, i) => { if (f.length > (FONT_STRIDE - 4) / 4) throw new Error('font ' + i + ' has too many glyphs'); });

    const spriteTabEnd = SPRITE_TAB + S.length * SPRITE_SIZE;
    const fontTab = up(spriteTabEnd, 32), fontTabEnd = fontTab + F.length * FONT_STRIDE;
    const dataStart = up(fontTabEnd, 0x100) + 0x20;

    const chunks = S.map((s) => pad4(window.encodePA(s.rgba, s.w, s.h, !!s.alpha, 2)));
    const offs = []; let cur = dataStart; chunks.forEach((c) => { offs.push(cur); cur += c.byteLength; });
    const total = B + cur + 4;
    const out = new Uint8Array(total), dv = new DataView(out.buffer);
    out.set(b64ToBytes(HEADER_B64), 0);

    // TBUI header patches
    if (spec.dialId) dv.setUint32(B + 8, (dv.getUint32(B + 8, true) & 0xff000000) | (spec.dialId & 0xffffff), true);
    dv.setUint32(B + 0x40, WIDGET_TAB, true); dv.setUint16(B + 0x44, W.length, true); dv.setUint16(B + 0x46, WIDGET_SIZE, true);
    dv.setUint32(B + 0x48, SPRITE_TAB, true); dv.setUint16(B + 0x4C, S.length, true); dv.setUint16(B + 0x4E, SPRITE_SIZE, true);
    dv.setUint32(B + 0x50, fontTab, true); dv.setUint16(B + 0x54, F.length, true); dv.setUint16(B + 0x56, FONT_STRIDE / 4, true);
    dv.setUint32(B + 0x5C, dataStart, true);
    dv.setUint32(B + 0x60, spec.previewSprite == null ? 0 : spec.previewSprite, true);

    W.forEach((w, i) => {
      const o = B + WIDGET_TAB + i * WIDGET_SIZE;
      out[o] = i; out[o + 1] = w.type; out[o + 2] = w.flag == null ? 1 : w.flag; out[o + 3] = w.sub || 0;
      dv.setUint16(o + 4, w.x || 0, true); dv.setUint16(o + 6, w.y || 0, true);
      dv.setUint16(o + 8, w.px || 0, true); dv.setUint16(o + 10, w.py || 0, true);
      dv.setUint16(o + 12, w.a || 0, true); dv.setUint16(o + 14, w.b || 0, true);
      if (w.n) out[o + 16] = w.n; // type 7 (frame animation): number of consecutive frame sprites starting at a; b = timing (high byte)
    });
    S.forEach((s, i) => {
      const o = B + SPRITE_TAB + i * SPRITE_SIZE;
      dv.setUint16(o, i, true); out[o + 2] = 14; out[o + 3] = s.flag != null ? s.flag : (s.alpha ? 2 : 1);
      dv.setUint16(o + 4, s.w, true); dv.setUint16(o + 6, s.h, true); dv.setUint32(o + 8, offs[i], true);
    });
    F.forEach((f, i) => {
      const o = B + fontTab + i * FONT_STRIDE;
      dv.setUint32(o, f.length, true);
      f.forEach((g, k) => { dv.setUint16(o + 4 + k * 4, g.ch, true); dv.setUint16(o + 6 + k * 4, g.sprite, true); });
    });
    chunks.forEach((c, i) => out.set(c, B + offs[i]));
    out.set([0x54, 0x42, 0x55, 0x49], total - 4); // "TBUI" footer

    dv.setUint32(0x0C, total, true); dv.setUint32(0x28, total - 1024, true); dv.setUint32(B + 0x0C, total - 1028, true);
    dv.setUint16(0x10, crc(out.subarray(1024)), true);
    return out;
  }

  HT37.faceBuilder = { build, HEADER_B64 };
})();
