/**
 * @file     js/dfu/bin-compiler.js
 * @layer    Flashing / .bin
 * @summary  Template download, canvas → RGB565 conversion, FFB1 envelope builder, .bin inspector, DFU progress bar.
 *
 * ROLE
 *   - fetchCloudTemplate(): POSTs lcd=3&toolVersion=4.6&platform=gui-5681 to the FitCloud template server
 *     through a public CORS proxy and keeps the result in loadedTemplateBin.
 *   - canvasToRGB565(canvas, littleEndian): packs RGBA into RGB565 (5-6-5).
 *   - buildFfb1Envelope(op, offset, payload, flags24): 12-byte header [op, flags×3, offset u32 LE, CRC16 u16
 *     LE, len u16 LE] + payload.
 *   - compileWatchfaceBin(): builds a TOPSTEP/TBUI .bin from the canvas (patches loadedTemplateBin if present)
 *     and recomputes the header CRC. NOT CALLED by anything today.
 *   - inspectBinBuffer(buf, meta): writes a hex/CRC summary into #hexInspector.
 *   - setDfuProgress(pct, done, total): drives the Tab-3 progress bar; null hides it.
 *   - Click handlers: #templateBinInput change (load a template file) and #btnCompileBin (export).
 *
 * PROVIDES (globals)
 *   function fetchCloudTemplate, function canvasToRGB565, function buildFfb1Envelope, function
 *   compileWatchfaceBin, function inspectBinBuffer, function setDfuProgress
 *
 * USES (defined in other files)
 *   - js/editor/state.js: loadedTemplateBin, screenConfig, widgets
 *   - js/core/log.js: log
 *   - js/ble/frames.js: computeCRC16
 *   - js/editor/render.js: drawWatchface
 *   - js/dfu/ota.js: crc16Header568x
 *
 * DOM IDS TOUCHED
 *   #btnCompileBin #dfuProgressBar #dfuProgressLabel #dfuProgressWrap #hexInspector #rgbEndian
 *   #templateBinInput
 *
 * LOAD ORDER
 *   #26 of 62, section "4. .BIN BUILDER  (canvas -> RGB565 -> FitCloud .bin)"
 *   after: js/editor/sensors-sim.js   before: js/ble/state.js
 *
 * NOTES
 *   - "📦 Export .BIN" does NOT use compileWatchfaceBin(): it exports window.rebuildActiveBin() (the loaded
 *     .bin edited in the Decompiler Vault), and refuses if no .bin is loaded.
 *   - setDfuProgress lives here for historical reasons; it is UI, used by ble/connection.js and dfu/ota.js.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
document.getElementById('templateBinInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  loadedTemplateBin = new Uint8Array(await file.arrayBuffer());
  log(`Loaded FitCloud template.bin (${loadedTemplateBin.byteLength} bytes).`, 'ok');
  inspectBinBuffer(loadedTemplateBin);
});

async function fetchCloudTemplate() {
  log('Querying FitCloud CustomGUI Template Server (lcd=3, toolVersion=4.6 / 1.5, platform=gui-5681)...', 'tx');
  const targetUrl = 'http://fitcloud.hetangsmart.com/public/dial/customgui';
  const proxies = [
    'https://api.allorigins.win/raw?url=' + encodeURIComponent(targetUrl)
  ];
  for (const proxyUrl of proxies) {
    try {
      const resp = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'lcd=3&toolVersion=4.6&platform=gui-5681'
      });
      const json = await resp.json();
      log(`Server response: ${JSON.stringify(json).slice(0, 180)}`, 'rx');
      const binUrl = json?.data?.binUrl;
      if (binUrl) {
        log(`Downloading official gui-5681 template binary from ${binUrl}...`, 'tx');
        const binResp = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(binUrl));
        loadedTemplateBin = new Uint8Array(await binResp.arrayBuffer());
        log(`✓ Downloaded official HT37 gui-5681 template.bin (${loadedTemplateBin.byteLength} bytes)!`, 'ok');
        inspectBinBuffer(loadedTemplateBin);
        return;
      }
    } catch (err) {
      log(`Template fetch note: ${err.message} (Using built-in gui-5681 generator)`, 'tx');
    }
  }
}

function canvasToRGB565(sourceCanvas, littleEndian = false) {
  const w = sourceCanvas.width, h = sourceCanvas.height;
  const imgData = sourceCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h * 2);
  const view = new DataView(out.buffer);
  let ptr = 0;
  for (let i = 0; i < imgData.length; i += 4) {
    const rgb565 = ((imgData[i] >> 3) << 11) | ((imgData[i + 1] >> 2) << 5) | (imgData[i + 2] >> 3);
    view.setUint16(ptr, rgb565, littleEndian);
    ptr += 2;
  }
  return out;
}

function buildFfb1Envelope(opCode, offset, payloadBytes, flags24 = 0) {
  const payload = payloadBytes instanceof Uint8Array ? payloadBytes : new Uint8Array(payloadBytes);
  const crc = computeCRC16(payload, 0x0000);
  const frame = new Uint8Array(12 + payload.length);
  const view = new DataView(frame.buffer);
  frame[0] = opCode & 0xff;
  frame[1] = flags24 & 0xff;
  frame[2] = (flags24 >> 8) & 0xff;
  frame[3] = (flags24 >> 16) & 0xff;
  view.setUint32(4, offset >>> 0, true);       // Offset (uint32 LE)
  view.setUint16(8, crc & 0xffff, true);       // CRC16-ARC of payload (uint16 LE)
  view.setUint16(10, payload.length, true);    // Payload length (uint16 LE)
  frame.set(payload, 12);
  return frame;
}

function compileWatchfaceBin() {
  const { width: W, height: H, previewWidth: PW, previewHeight: PH } = screenConfig;
  const isLE = document.getElementById('rgbEndian').value === 'le';
  const visibleWidgets = widgets.filter((w) => w.visible);
  const offBg = document.createElement('canvas'); offBg.width = W; offBg.height = H;
  drawWatchface(offBg.getContext('2d'), W, H, { showUI: false, onlyStatic: true });
  const offPrev = document.createElement('canvas'); offPrev.width = PW; offPrev.height = PH;
  drawWatchface(offPrev.getContext('2d'), PW, PH, { showUI: false, onlyStatic: false });
  const bgRgb565 = canvasToRGB565(offBg, isLE), prevRgb565 = canvasToRGB565(offPrev, isLE);

  // If user uploaded an official template.bin, patch its RGB565 buffers AND recalculate the TOPSTEP 01 CRC16 at 0x10..0x11!
  if (loadedTemplateBin && loadedTemplateBin.byteLength > 1024) {
    const finalBin = new Uint8Array(loadedTemplateBin);
    const bgOffset = Math.max(1024, finalBin.byteLength - bgRgb565.byteLength);
    const prevOffset = Math.max(1024, bgOffset - prevRgb565.byteLength);
    if (bgOffset + bgRgb565.byteLength <= finalBin.byteLength) finalBin.set(bgRgb565, bgOffset);
    if (prevOffset + prevRgb565.byteLength <= bgOffset) finalBin.set(prevRgb565, prevOffset);
    // Recalculate check_crc16_568x from offset 1024 (0x400) to end of file and store at 0x10..0x11 (LE)
    const bodyCrc = crc16Header568x(finalBin.subarray(1024));
    const hdrView = new DataView(finalBin.buffer);
    hdrView.setUint16(0x10, bodyCrc, true);
    inspectBinBuffer(finalBin, { bgOffset, prevOffset, visibleCount: visibleWidgets.length });
    return finalBin;
  }

  // Otherwise build the exact 1,024-byte (0x400) TOPSTEP 01 header + TBUI descriptor + RGB565 stream
  const tbuiHeader = new Uint8Array(64);
  const tbuiView = new DataView(tbuiHeader.buffer);
  // "TBUI" magic at 0x400
  tbuiHeader.set([0x54, 0x42, 0x55, 0x49], 0);
  tbuiView.setUint16(4, W, true);
  tbuiView.setUint16(6, H, true);
  tbuiView.setUint16(8, PW, true);
  tbuiView.setUint16(10, PH, true);
  tbuiView.setUint32(12, 64, true); // Preview offset relative to TBUI
  tbuiView.setUint32(16, prevRgb565.byteLength, true);
  tbuiView.setUint32(20, 64 + prevRgb565.byteLength, true); // BG offset relative to TBUI
  tbuiView.setUint32(24, bgRgb565.byteLength, true);

  const bodyLen = tbuiHeader.byteLength + prevRgb565.byteLength + bgRgb565.byteLength;
  const totalSize = 1024 + bodyLen;
  const finalBin = new Uint8Array(totalSize);
  const hdr = new DataView(finalBin.buffer);

  // Offset 0x00..0x09: "TOPSTEP 01"
  finalBin.set([0x54, 0x4f, 0x50, 0x53, 0x54, 0x45, 0x50, 0x20, 0x30, 0x31], 0x00);
  // Project 8545 / UI 6009 metadata
  hdr.setUint16(0x0c, 0x8545, true);
  hdr.setUint16(0x0e, 6009, true);
  hdr.setUint32(0x14, bodyLen, true);
  hdr.setUint32(0x18, totalSize, true);
  // Offset 0x24..0x27: 00 04 00 00 (points to 0x400 where TBUI block starts)
  hdr.setUint32(0x24, 0x00000400, true);

  // Offset 1024 (0x400): TBUI block + Preview RGB565 + Full BG RGB565
  finalBin.set(tbuiHeader, 1024);
  const prevOffset = 1024 + tbuiHeader.byteLength;
  const bgOffset = prevOffset + prevRgb565.byteLength;
  finalBin.set(prevRgb565, prevOffset);
  finalBin.set(bgRgb565, bgOffset);

  // Offset 0x10..0x11: CRC-16/BUYPASS (poly 0x8005, MSB-first, init 0x0000) starting from byte 1024 to end
  const crc568x = crc16Header568x(finalBin.subarray(1024));
  hdr.setUint16(0x10, crc568x, true);

  inspectBinBuffer(finalBin, { bgOffset, prevOffset, visibleCount: visibleWidgets.length });
  return finalBin;
}

function inspectBinBuffer(buf, meta = {}) {
  const crc16 = computeCRC16(buf, 0x0000);
  const hexHead = Array.from(buf.slice(0, 48)).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  document.getElementById('hexInspector').innerHTML = `<strong>[FitCloud Binary Inspector — ${buf.byteLength.toLocaleString()} bytes | CRC16: 0x${crc16.toString(16).padStart(4,'0').toUpperCase()}]</strong><br/>• Screen RGB565 Payload: ${(screenConfig.width * screenConfig.height * 2).toLocaleString()} B @ 0x${(meta.bgOffset || 64).toString(16).toUpperCase()}<br/>• Preview RGB565 Payload: ${(screenConfig.previewWidth * screenConfig.previewHeight * 2).toLocaleString()} B @ 0x${(meta.prevOffset || 0).toString(16).toUpperCase()}<br/>• Active Widget Layers Compiled: ${meta.visibleCount ?? widgets.filter((w) => w.visible).length} / ${widgets.length} total<br/>• Header Hex (0x00..0x2F): <span style="color:#9cdcfe">${hexHead}</span>`;
}

document.getElementById('btnCompileBin').addEventListener('click', () => {
  let bin = null;
  if (typeof window.rebuildActiveBin === 'function') { bin = window.rebuildActiveBin(); }
  if (!bin && window.decompiledBinData && window.decompiledBinData.u) {
      bin = window.decompiledBinData.u;
      log(`📦 Using Loaded Testing .BIN: ${window.decompiledBinData.fileName} (${bin.byteLength.toLocaleString()} bytes)`, 'ok');
    } else {
      return log('⚠️ Please load your testing .bin file in Tab 1 (Decompiler Vault) first before flashing!', 'err');
    }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bin], { type: 'application/octet-stream' }));
  a.download = `ht37_watchface_${screenConfig.width}x${screenConfig.height}.bin`;
  a.click();
  log(`Exported compiled watchface binary (${bin.byteLength} bytes).`, 'ok');
});

function setDfuProgress(pct, transferredBytes, totalBytes) {
  const wrap = document.getElementById('dfuProgressWrap');
  const bar = document.getElementById('dfuProgressBar');
  const lbl = document.getElementById('dfuProgressLabel');
  if (pct === null) {
    wrap.style.display = 'none';
    lbl.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  lbl.style.display = 'block';
  bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  lbl.textContent = `${pct.toFixed(1)}% (${(transferredBytes / 1024).toFixed(1)} / ${(totalBytes / 1024).toFixed(1)} KB)`;
}
