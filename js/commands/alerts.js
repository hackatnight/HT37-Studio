/**
 * @file     js/commands/alerts.js
 * @layer    Commands
 * @summary  Outbound alert / action commands.
 *
 * ROLE
 *   - sendWatchAlert(idOrKey, label): builds the 0x04/<key> payload from #alertSender, #alertMsg and
 *     #alertFormat (5 encodings; calls use [00], ring = [senderLen, sender, 8×00]).
 *   - sendWatchChime(idOrKey): 0x02/0x3B=[01]. enableAllWatchAlerts(): 0x02/0x12=[FF FF FF FF] then 0x02/0x20.
 *     triggerFactoryResetPrompt(): confirm() then 0x02/0x40 with allowManualReset.
 *   - sendCustomRawL2(): sends #rawCmd/#rawKey/#rawPayload (hex, or text with #rawAsAscii).
 *
 * PROVIDES (globals)
 *   function triggerFactoryResetPrompt, function sendWatchChime, function enableAllWatchAlerts, function
 *   sendWatchAlert, function sendCustomRawL2
 *
 * USES (defined in other files)
 *   - js/ble/state.js: abortBleOperation, allowManualReset, bleServer, cmdChar
 *   - js/core/log.js: log
 *   - js/ble/frames.js: buildFitCloudFrame
 *   - js/ble/transport.js: enqueueBleWrite, waitForAck
 *   - js/core/namespace.js: HT37
 *
 * DOM IDS TOUCHED
 *   #alertFormat #alertMsg #alertSender #rawAsAscii #rawCmd #rawKey #rawPayload
 *
 * LOAD ORDER
 *   #32 of 62, section "6. WATCH COMMANDS  (alerts, weather, dial slots, explorer console)"
 *   after: js/ble/notifications.js   before: js/commands/weather.js
 *
 * NOTES
 *   - All functions return early with an ERROR log unless connected and bound (cmdChar set).
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
/* ============================================================================
 * WATCH ALERT SENDER + CONFIRMED FACTORY RESET (02/40)
 * ============================================================================ */
async function triggerFactoryResetPrompt() {
  if (!cmdChar || !bleServer || !bleServer.connected) {
    return log('ERROR: Pair & Bind to the watch first!', 'err');
  }
  if (!confirm('⚠️ Are you sure you want to send 0x02/0x40 (Audible Beep + Factory Reset / Unbind)?')) return;
  abortBleOperation = false;
  allowManualReset = true;
  log('⚠️ Sending Confirmed Factory Reset / Unbind Alert (Cmd=0x02, Key=0x40)...', 'err');
  const { frame, seq } = buildFitCloudFrame(0x02, 0x40, [], 0x00);
  await enqueueBleWrite(cmdChar, frame, `FactoryReset(0x02/0x40) seq=${seq}`);
  allowManualReset = false;
}

async function sendWatchChime(keyId, label) {
  if (!cmdChar || !bleServer || !bleServer.connected) {
    return log('ERROR: Pair & Bind to the watch first!', 'err');
  }
  abortBleOperation = false;
  
    // Resolve chime from registry if string ID passed
    if (typeof keyId === 'string' && typeof HT37 !== 'undefined') {
      const def = HT37.getCommand(keyId);
      if (def) { keyId = def.key; label = def.name; }
    }
log(`🔊 Sending ${label} (Cmd=0x02, Key=0x${keyId.toString(16).toUpperCase()}, Val=[01])...`, 'ok');
  const { frame, seq } = buildFitCloudFrame(0x02, keyId, [0x01], 0x00);
  await enqueueBleWrite(cmdChar, frame, `${label.replace(/\s+/g,'_')}(0x02/0x${keyId.toString(16).toUpperCase()}) seq=${seq}`);
}

async function enableAllWatchAlerts() {
  if (!cmdChar || !bleServer || !bleServer.connected) {
    return log('ERROR: Pair & Bind to the watch first!', 'err');
  }
  abortBleOperation = false;
  log('🔓 Writing Notification Switch Bitmask (Cmd=0x02, Key=0x12 = [FF FF FF FF])...', 'ok');
  const { frame, seq } = buildFitCloudFrame(0x02, 0x12, [0xff, 0xff, 0xff, 0xff], 0x00);
  await enqueueBleWrite(cmdChar, frame, `EnableAlerts(0x02/0x12) seq=${seq}`);
  await waitForAck(seq, 400);
  const r = buildFitCloudFrame(0x02, 0x20, [0x01], 0x00);
  await enqueueBleWrite(cmdChar, r.frame, `VerifyConfig(0x02/0x20) seq=${r.seq}`);
}

// --- VERIFIED MEDIA CONTROLS (Cmd=0x07, Key=0x03) ---

  async function sendWatchAlert(keyId, label) {
  if (!cmdChar || !bleServer || !bleServer.connected) {
    return log('ERROR: Pair & Bind to the watch first!', 'err');
  }
  abortBleOperation = false;
  
    // Resolve command ID string (e.g. 'ALERT_WHATSAPP') or numeric key from HT37 registry
    const cmdDef = (typeof HT37 !== 'undefined')
      ? (typeof keyId === 'string' ? HT37.getCommand(keyId) : HT37.commands.find(c => c.cmd === 0x04 && c.key === keyId))
      : null;
    if (cmdDef) {
      keyId = cmdDef.key;
      label = cmdDef.name;
    }

    const sender = (document.getElementById('alertSender').value || 'HT37').trim();
  const msg = (document.getElementById('alertMsg').value || 'Test').trim();
  const fmt = document.getElementById('alertFormat').value;
  const enc = new TextEncoder();

  const senderBytes = Array.from(enc.encode(sender));
  const msgBytes = Array.from(enc.encode(msg));
  const fullText = keyId === 0x01 ? sender : `${sender}: ${msg}`;
  const fullBytes = Array.from(enc.encode(fullText));
  const zeroPad = new Array(8).fill(0x00);

  let payload = [];
  if (keyId === 0x02 || keyId === 0x03) {
    payload = [0x00];
  } else if (keyId === 0x01) {
    payload = [senderBytes.length & 0xff, ...senderBytes, ...zeroPad];
  } else if (fmt === 'ht37struct') {
    payload = [
      senderBytes.length & 0xff,
      ...senderBytes,
      (msgBytes.length >> 8) & 0xff,
      msgBytes.length & 0xff,
      ...msgBytes,
      ...zeroPad
    ];
  } else if (fmt === 'singlelen') {
    payload = [fullBytes.length & 0xff, ...fullBytes, ...zeroPad];
  } else if (fmt === 'typeprefix') {
    payload = [0x01, ...fullBytes, ...zeroPad];
  } else if (fmt === 'nullsep') {
    payload = [senderBytes.length & 0xff, ...senderBytes, 0x00, ...msgBytes, ...zeroPad];
  } else {
    payload = [...fullBytes, ...zeroPad];
  }

  log(`🔔 Sending Watch Alert [${label}] (Cmd=0x04, Key=0x${keyId.toString(16).padStart(2, '0')}, Format=${fmt}, Sender="${sender}", Msg="${msg}")...`, 'ok');
  const { frame, seq } = buildFitCloudFrame(0x04, keyId, payload, 0x00);
  await enqueueBleWrite(cmdChar, frame, `Alert_${label}(0x04/0x${keyId.toString(16).padStart(2,'0')}) seq=${seq}`);
}

async function sendCustomRawL2() {
  if (!cmdChar || !bleServer || !bleServer.connected) {
    return log('ERROR: Pair & Bind to the watch first!', 'err');
  }
  abortBleOperation = false;
  const cmdId = parseInt(document.getElementById('rawCmd').value, 16) || 0x00;
  const keyId = parseInt(document.getElementById('rawKey').value, 16) || 0x00;
  const rawStr = document.getElementById('rawPayload').value.trim();
  const asAscii = document.getElementById('rawAsAscii').checked;

  let valBytes = [];
  if (rawStr.length > 0) {
    if (asAscii) {
      const tb = Array.from(new TextEncoder().encode(rawStr));
      valBytes = [tb.length & 0xff, ...tb, 0x00, 0x00];
    } else {
      valBytes = rawStr.split(/[\s,]+/).filter(Boolean).map((h) => parseInt(h.replace(/^0x/i, ''), 16) & 0xff);
    }
  }

  log(`🧪 Sending Custom Raw L2 Frame: Cmd=0x${cmdId.toString(16).padStart(2,'0')}, Key=0x${keyId.toString(16).padStart(2,'0')}, Len=${valBytes.length}B`, 'ok');
  const { frame, seq } = buildFitCloudFrame(cmdId, keyId, valBytes, 0x00);
  await enqueueBleWrite(cmdChar, frame, `RawL2(0x${cmdId.toString(16).padStart(2,'0')}/0x${keyId.toString(16).padStart(2,'0')}) seq=${seq}`);
}
