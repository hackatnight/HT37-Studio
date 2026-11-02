/**
 * @file     js/ble/frames.js
 * @layer    Bluetooth
 * @summary  Frame codec: CRC-16, L1 envelope, L2 command frame, and the safety firewall predicate.
 *
 * ROLE
 *   - computeCRC16(bytes, init=0): CRC-16/ARC (poly 0xA001 reflected) — used for L1 headers and OTA payload
 *     checks.
 *   - buildRawL1Frame(l2): [0xAB, 0x00, len_hi, len_lo, crc_hi, crc_lo, seq_hi, seq_lo] + L2; consumes l1SeqId;
 *     returns { frame, seq }.
 *   - buildFitCloudFrame(cmd, key, value, l2Ver=0): L2 = [cmd, ver, key, (len>>8)&1, len&0xFF] + value, wrapped
 *     in L1. This is THE way to build any command.
 *   - isDangerousResetFrame(frame): returns a reason string (or null). Blocks 0x02/0x40-0x45
 *     (reset/unbind/power-off), 0x02/0x3A (language), 0x02/0x65, and — unless allowUploadTriggerTest —
 *     0x02/0x88 and any cmd 0x07 other than key 0x03.
 *
 * PROVIDES (globals)
 *   function computeCRC16, function buildRawL1Frame, function buildFitCloudFrame, function
 *   isDangerousResetFrame
 *
 * USES (defined in other files)
 *   - js/ble/state.js: allowManualReset, allowUploadTriggerTest, l1SeqId
 *
 * LOAD ORDER
 *   #28 of 62, section "5. BLUETOOTH  (state, frame codec, write queue, connect/bind, notifications)"
 *   after: js/ble/state.js   before: js/ble/transport.js
 *
 * NOTES
 *   - SAFETY: enqueueBleWrite() consults isDangerousResetFrame() for every write. Do not bypass it; the one
 *     sanctioned override is allowManualReset in triggerFactoryResetPrompt().
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
function computeCRC16(bytes, initVal = 0x0000) {
  let crc = initVal;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) crc = (crc & 1) ? (crc >> 1) ^ 0xa001 : crc >> 1;
  }
  return crc & 0xffff;
}

function buildRawL1Frame(l2Bytes) {
  const crc = computeCRC16(l2Bytes, 0x0000);
  const seq = l1SeqId++ & 0xffff;
  const frame = new Uint8Array(8 + l2Bytes.length);
  frame[0] = 0xab; frame[1] = 0x00;
  frame[2] = (l2Bytes.length >> 8) & 0xff; frame[3] = l2Bytes.length & 0xff;
  frame[4] = (crc >> 8) & 0xff; frame[5] = crc & 0xff;
  frame[6] = (seq >> 8) & 0xff; frame[7] = seq & 0xff;
  frame.set(l2Bytes, 8);
  return { frame, seq };
}

function buildFitCloudFrame(cmdId, keyId, valueBytes = [], l2Ver = 0x00) {
  const valLen = valueBytes.length;
  const l2 = new Uint8Array(5 + valLen);
  l2[0] = cmdId; l2[1] = l2Ver; l2[2] = keyId;
  l2[3] = (valLen >> 8) & 0x01; l2[4] = valLen & 0xff;
  l2.set(valueBytes, 5);
  return buildRawL1Frame(l2);
}

function isDangerousResetFrame(frame) {
  if (allowManualReset) return null;
  if (frame.length >= 13 && frame[0] === 0xab && frame[1] === 0x00) {
    const cmd = frame[8], key = frame[10];
    // Block Cmd 0x02 Key 0x40..0x45 (Factory Reset / Unbind / PowerOff) & Cmd 0x07 (System Reboot)
    if (cmd === 0x02 && (key >= 0x40 && key <= 0x45)) return `Blocked Factory Reset / PowerOff key (0x02/0x${key.toString(16)})`;
    if (cmd === 0x02 && key === 0x3a) return `Blocked Language key (0x02/0x3A) to keep watch in English`;
    if (cmd === 0x02 && key === 0x65) return `Blocked Restart/Unbind key (0x02/0x65)`;
    if (!allowUploadTriggerTest) {
      if (cmd === 0x02 && key === 0x88) return `Blocked 0x02/0x88`;
      if (cmd === 0x07 && key !== 0x03) return `Blocked Cmd 0x07 (Non-Media)`;
    }
  }
  return null;
}
