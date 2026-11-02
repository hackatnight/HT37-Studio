/**
 * @file     js/studio2/pa-codec.js
 * @layer    Studio 2 core (no DOM)
 * @summary  The watch's picture format ("PA" sprites: RLE + 7-bit delta RGB565) and the header checksum. Copied from js/decompiler/vault.js and
 *           js/dfu/ota.js so editor2.html does not need the old editor. Round trip (encode -> decode) was proven in docs/BIN_FORMAT.md section 6.
 * API  window.decodePA(u8, start, w, h) -> {w,h,alpha,rgba,len}; window.encodePA(rgba, w, h, alpha, es) -> Uint8Array; window.crc16Header568x(bytes)
 */
(function () {
  const decompHex = (n, w = 4) => '0x' + (n >>> 0).toString(16).padStart(w, '0');
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
  window.crc16Header568x = function (bytes) {
    let crc = 0;
    for (let i = 0; i < bytes.length; i++) { crc ^= bytes[i] << 8; for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x8005) & 0xffff : (crc << 1) & 0xffff; }
    return crc;
  };
})();
