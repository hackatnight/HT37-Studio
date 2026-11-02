/**
 * @file     js/ble/transport.js
 * @layer    Bluetooth
 * @summary  Serialized BLE write queue and ACK / reply waiters.
 *
 * ROLE
 *   - enqueueBleWrite(ch, frame, label, silent): appends a write to writeChain (one write at a time), applies
 *     the firewall, logs "TX [label]: hex", splits at 512 bytes, uses writeValueWithoutResponse when supported
 *     else writeValue (3 s timeout). Skipped when disconnected or aborted (except labels starting "L1-ACK8").
 *   - waitForAck(seq, ms=300): polls lastAckedSeq. waitForL2Response(ms=75): polls otaLastResponse.
 *
 * PROVIDES (globals)
 *   function enqueueBleWrite, function waitForAck, function waitForL2Response
 *
 * USES (defined in other files)
 *   - js/ble/state.js: abortBleOperation, bleServer, lastAckedSeq, otaLastResponse, writeChain
 *   - js/ble/frames.js: isDangerousResetFrame
 *   - js/core/log.js: log, withTimeout
 *
 * LOAD ORDER
 *   #29 of 62, section "5. BLUETOOTH  (state, frame codec, write queue, connect/bind, notifications)"
 *   after: js/ble/frames.js   before: js/ble/connection.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
function enqueueBleWrite(ch, frame, label = 'CMD', silent = false) {
  const task = async () => {
    if (!ch || !bleServer || !bleServer.connected) return;
    if (abortBleOperation && !label.startsWith('L1-ACK8')) return;
    const blockReason = isDangerousResetFrame(frame);
    if (blockReason) {
      log(`🛡️ SAFETY FIREWALL: ${blockReason}`, 'err');
      return;
    }
    if (!silent) {
      const preview = frame.length > 48
        ? Array.from(frame.slice(0, 48)).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ') + ` ... (${frame.length}B)`
        : Array.from(frame).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      log(`TX [${label}]: ${preview}`, 'tx');
    }
    const maxMtu = 512;
    for (let off = 0; off < frame.length; off += maxMtu) {
      const slice = frame.subarray(off, Math.min(frame.length, off + maxMtu));
      if (ch.properties.writeWithoutResponse) {
        await withTimeout(ch.writeValueWithoutResponse(slice), 3000, label);
      } else {
        await withTimeout(ch.writeValue(slice), 3000, label);
      }
    }
  };
  writeChain = writeChain.then(task, task);
  return writeChain;
}

async function waitForAck(seq, timeoutMs = 300) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (abortBleOperation || lastAckedSeq === seq) return true;
    await new Promise((r) => setTimeout(r, 8));
  }
  return false;
}

async function waitForL2Response(timeoutMs = 75) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (abortBleOperation || otaLastResponse !== null) return otaLastResponse;
    await new Promise((r) => setTimeout(r, 8));
  }
  return null;
}
