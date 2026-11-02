/**
 * @file     js/dfu/ota.js
 * @layer    Flashing / .bin
 * @summary  IC_568X OTA flash engine (service 00009966) — the "⚡ Flash to Watch" button.
 *
 * ROLE
 *   - Handler on #btnFlashWatch: calls window.rebuildActiveBin(), requires window.decompiledBinData.u, checks
 *     size field @0x0C == file length and header CRC @0x10 == crc16Header568x(file[0x400..]), derives the file
 *     type with otaFileType().
 *   - State machine: START(01) → START_ACK(0x81: size, crc, resume offset, mtu, maxChunk) → HEAD(02, first 1024
 *     B) → DATA(03, chunks ≤ maxChunk, ACK 0x83, status 0x16 = resend) → END(04) → END_ACK(0x84). Fragments are
 *     mtu − mtu%10 bytes. Any failure sends ABORT(05).
 *   - Helpers: crc16Header568x (CRC-16/BUYPASS, poly 0x8005), otaFileType, otaPacket(op, offset, payload)
 *     (12-byte header + payload), otaWriteLogical, otaExchange (write then poll otaLastResponse for the
 *     expected opcode), otaStatus.
 *
 * PROVIDES (globals)
 *   function crc16Header568x, function otaFileType, function otaPacket, function otaWriteLogical, function
 *   otaExchange, function otaStatus
 *
 * USES (defined in other files)
 *   - js/ble/frames.js: computeCRC16
 *   - js/ble/state.js: abortBleOperation, bleServer, dfuPacketChar, isTransferRunning, otaAccepted,
 *     otaLastResponse
 *   - js/core/log.js: log, withTimeout
 *   - js/protocol/constants.js: OTA, OTA_ACK_NAMES
 *   - js/dfu/bin-compiler.js: setDfuProgress
 *
 * DOM IDS TOUCHED
 *   #btnFlashWatch
 *
 * LOAD ORDER
 *   #37 of 62, section "7. FLASHING  (FFB1 upload-mode probes + IC_568X OTA engine)"
 *   after: js/dfu/ffb1-probe.js   before: js/boot.js
 *
 * NOTES
 *   - REAL FLASH WRITE to the watch. Packet layouts are verified against the SDK; do not change field offsets
 *     without testing on hardware.
 *   - Progress: setDfuProgress() in dfu/bin-compiler.js.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
// CRC-16/BUYPASS (poly 0x8005, MSB-first, init 0) -- the header checksum stored LE at file+0x10,
// computed over file[0x400..end] (SDK GUIWriter.check_crc16_568x).
function crc16Header568x(bytes) {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x8005) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

// All items in the header table (count @0x13, entries from 0x20, [len,type,...]) must share one type.
function otaFileType(bin) {
  const count = bin[0x13];
  let p = 0x20, type = 0;
  for (let i = 0; i < count && p < 0x400; i++) {
    const len = bin[p], t = bin[p + 1];
    if (i === 0) type = t; else if (t !== type) return 0;
    p += len;
  }
  return type;
}

function otaPacket(op, offset, payload) {          // 12 B header + payload, same layout the SDK's d.a/d.b build
  const f = new Uint8Array(12 + payload.length), v = new DataView(f.buffer);
  f[0] = op;
  v.setUint32(4, offset >>> 0, true);
  v.setUint16(8, computeCRC16(payload, 0x0000) & 0xffff, true);
  v.setUint16(10, payload.length, true);
  f.set(payload, 12);
  return f;
}

async function otaWriteLogical(ch, frame, frag, label) {
  for (let off = 0; off < frame.length; off += frag) {
    if (abortBleOperation) throw new Error('aborted');
    const s = frame.subarray(off, Math.min(frame.length, off + frag));
    if (ch.writeValueWithResponse) await withTimeout(ch.writeValueWithResponse(s), 5000, label);
    else if (ch.properties.writeWithoutResponse) await withTimeout(ch.writeValueWithoutResponse(s), 5000, label);
    else await withTimeout(ch.writeValue(s), 5000, label);
  }
}

async function otaExchange(ch, frame, frag, expectOp, label, timeoutMs, quiet) {
  otaLastResponse = null;
  if (!quiet) log(`TX [${label}] ${frame.length}B (${Math.ceil(frame.length / frag)} BLE writes of <=${frag}B)`, 'tx');
  await otaWriteLogical(ch, frame, frag, label);
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (abortBleOperation) throw new Error('aborted');
    const r = otaLastResponse;
    if (r && r.raw && String(r.charUuid || '').includes('ffb2') && (r.raw[0] === expectOp || r.raw[0] === OTA.ERR)) return r.raw;
    await new Promise((res) => setTimeout(res, 5));
  }
  throw new Error(`timeout waiting for 0x${expectOp.toString(16)} after ${label}`);
}

function otaStatus(resp) {                          // 1-byte-payload acks carry status at resp[12]
  if (resp[0] === OTA.ERR) return resp.length > 12 ? resp[12] : 128;
  return resp.length > 12 ? resp[12] : 0;
}

/** Send the computer's current date and time to the watch (0x02/0x01) so a freshly flashed or reset watch shows the real date. Best effort. */
async function syncWatchClockQuiet(why) {
  try {
    if (typeof cmdChar === 'undefined' || !cmdChar || !bleServer || !bleServer.connected || typeof buildFitCloudTime4B !== 'function') return false;
    const tf = buildFitCloudFrame(0x02, 0x01, buildFitCloudTime4B(), 0x00);
    await enqueueBleWrite(cmdChar, tf.frame, 'SyncTime (' + why + ') seq=' + tf.seq, false);
    await waitForAck(tf.seq, 300);
    // also put the chosen clock format and units on the watch (default: 12-hour, °F)
    if (typeof getWatchUnitSwitchBytes === 'function') {
      const sw = getWatchUnitSwitchBytes(), sf = buildFitCloudFrame(0x02, 0x18, sw, 0x00);
      await enqueueBleWrite(cmdChar, sf.frame, 'SetUnits (' + why + ') seq=' + sf.seq, false);
      await waitForAck(sf.seq, 300);
      window.HT37_watchIs12 = (sw[1] & 0x04) !== 0;
    }
    return true;
  } catch (e) { return false; }
}

document.getElementById('btnFlashWatch').addEventListener('click', async () => {
  log('--- [⚡ 3. Flash to Watch (SDK OTA protocol: START/HEAD/DATA/END)] ---', 'tx');
  if (typeof window.rebuildActiveBin === 'function') { window.rebuildActiveBin(); }
  if (!(window.decompiledBinData && window.decompiledBinData.u)) {
    return log('⚠️ Please load your testing .bin file in Tab 1 (Decompiler Vault) first before flashing!', 'err');
  }
  const bin = window.decompiledBinData.u;
  log(`📦 Using Loaded .BIN: ${window.decompiledBinData.fileName} (${bin.byteLength.toLocaleString()} bytes)`, 'ok');
  if (!bleServer || !bleServer.connected || !dfuPacketChar) return log('ERROR: Connect & Bind to the watch first.', 'err');
  if (isTransferRunning) return log('Operation already running! Click Stop first.', 'err');

  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const total = dv.getUint32(12, true), fileCrc = dv.getUint16(16, true), HEAD = 1024;
  if (total !== bin.byteLength) return log(`ERROR: size field @0x0C (${total}) != file length (${bin.byteLength}).`, 'err');
  const calc = crc16Header568x(bin.subarray(HEAD));
  if (calc !== fileCrc) {
    return log(`ERROR: header CRC @0x10 is 0x${fileCrc.toString(16)} but CRC-16/BUYPASS(file[0x400..]) = 0x${calc.toString(16)}. The watch will reject this file (CRC_ERROR). Fix the CRC before flashing.`, 'err');
  }
  const ftype = otaFileType(bin);
  if (!ftype) return log('ERROR: could not determine OTA file type from header table.', 'err');

  abortBleOperation = false; isTransferRunning = true; otaAccepted = false;
  const ch = dfuPacketChar;
  try {
    await syncWatchClockQuiet('before flash');
    // 1. START
    const start = new Uint8Array(12); start[0] = OTA.START; start[1] = ftype;
    let frag = 240;                                   // until the watch tells us its MTU
    let r = await otaExchange(ch, start, frag, OTA.START_ACK, 'OTA_START', 3000);
    if (r.length > 11 && (r[10] | (r[11] << 8)) === 1) throw new Error(`START rejected: ${OTA_ACK_NAMES[r[12]] || r[12]}`);
    const rv = new DataView(r.buffer, r.byteOffset, r.byteLength);
    const wSize = rv.getUint32(16, true), wCrc = rv.getUint16(20, true), wOff = rv.getUint32(24, true);
    const mtu = rv.getUint16(28, true), maxChunk = rv.getUint16(30, true);
    frag = Math.max(20, mtu - (mtu % 10)) || 240;
    log(`START_ACK: fileType=${ftype} watchSize=${wSize} watchCrc=0x${wCrc.toString(16)} resumeOffset=${wOff} mtu=${mtu} maxChunk=${maxChunk} -> fragment=${frag}B`, 'ok');
    if (!maxChunk) throw new Error('watch reported maxChunk=0');

    // 2. HEAD (skipped when the watch offers to resume the same file)
    let off = HEAD;
    const resume = wOff && wSize === total && wCrc === fileCrc;
    if (resume) { off = wOff; log(`Resuming at offset ${off}`, 'ok'); }
    else {
      const head = bin.subarray(0, HEAD);
      for (let tries = 0; ; tries++) {
        r = await otaExchange(ch, otaPacket(OTA.HEAD, 0, head), frag, OTA.HEAD_ACK, 'OTA_HEAD', 5000);
        const st = otaStatus(r);
        if (st === 0) break;
        if (st === 22 && tries < 3) continue;
        throw new Error(`HEAD_SYNC rejected: ${OTA_ACK_NAMES[st] || st} (0x${st.toString(16)})`);
      }
      log('HEAD_SYNC accepted.', 'ok');
    }

    // 3. DATA
    setDfuProgress(0, off, total);
    const t0 = Date.now();
    let n = 0;
    while (off < total) {
      const len = Math.min(maxChunk, total - off);
      const pkt = otaPacket(OTA.DATA, off, bin.subarray(off, off + len));
      let tries = 0;
      for (;;) {
        r = await otaExchange(ch, pkt, frag, OTA.DATA_ACK, `OTA_DATA#${n} off=${off}`, 10000, n % 5 !== 0);
        const st = otaStatus(r);
        if (st === 0) break;
        if (st === 22 && ++tries < 4) { log(`resend off=${off}`, 'rx'); continue; }
        throw new Error(`DATA_SYNC off=${off} rejected: ${OTA_ACK_NAMES[st] || st} (0x${st.toString(16)})`);
      }
      off += len; n++;
      setDfuProgress((off / total) * 100, off, total);
    }

    // 4. END
    const end = new Uint8Array(12); end[0] = OTA.END;
    r = await otaExchange(ch, end, frag, OTA.END_ACK, 'OTA_END', 15000);
    const st = otaStatus(r);
    if (st !== 0) throw new Error(`END rejected: ${OTA_ACK_NAMES[st] || st} (0x${st.toString(16)})`);
    log(`✅ OTA complete: ${total.toLocaleString()} B in ${((Date.now() - t0) / 1000).toFixed(1)}s. The watch will verify and apply the face.`, 'ok');
    setTimeout(() => syncWatchClockQuiet('after flash'), 4000);
  } catch (err) {
    log(`❌ Flash failed: ${err.message || err}`, 'err');
    try { const ab = new Uint8Array(12); ab[0] = OTA.ABORT; await dfuPacketChar.writeValue(ab); } catch (_) { /* best effort */ }
  } finally {
    isTransferRunning = false;
  }
});
