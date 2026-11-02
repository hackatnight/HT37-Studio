/**
 * @file     js/ble/notifications.js
 * @layer    Bluetooth
 * @summary  Inbound path: notification handler, L1 reassembly, L2 dispatch and TLV decoders.
 *
 * ROLE
 *   - handleBleNotification(event): logs "RX [char]: hex"; recognises 8-byte L1 ACKs (flag 0x10 →
 *     lastAckedSeq), starts/continues L1 reassembly, and treats FFB2 / 0x80 / 0x81 data as OTA responses
 *     (otaLastResponse).
 *   - checkReassemblyComplete(): when the L2 payload is complete it ACKs the watch (8-byte L1 ACK), splits
 *     cmd/key/value and dispatches on (cmd,key): 0x03/0x12 bind confirm, 0x01/0x02 and 0x01/0x04 OTA pre-check,
 *     0x05/0x24 live BPM (byte 6), 0x02/0x1C battery, 0x02/0x21 config dump, 0x02/0x61 sport UI, any 0x05 sync.
 *   - Decoders: decodeDeviceConfigTlvs (0x02/0x21 → project, firmware, MAC, unit switches, dial slots, weather
 *     register), decodeSportUiConfigTlvs, decodeCmd05SyncData (steps).
 *
 * PROVIDES (globals)
 *   function handleBleNotification, function checkReassemblyComplete, function decodeSportUiConfigTlvs,
 *   function decodeCmd05SyncData, function decodeDeviceConfigTlvs
 *
 * USES (defined in other files)
 *   - js/core/log.js: log
 *   - js/ble/state.js: bindConfirmed, cmdChar, lastAckedSeq, otaAccepted, otaLastResponse, rxReassembler,
 *     watchDeviceInfo53B
 *   - js/ble/transport.js: enqueueBleWrite
 *   - js/ble/connection.js: onPostBindConnected
 *   - js/editor/state.js: sensors
 *   - js/editor/sensors-sim.js: updateLiveSensorReadout
 *
 * DOM IDS TOUCHED
 *   #bleDot #bleStatusText #simBat #simHr #simSteps #valBat #valHr #valSteps #watchTimeUnitSelect
 *
 * LOAD ORDER
 *   #31 of 62, section "5. BLUETOOTH  (state, frame codec, write queue, connect/bind, notifications)"
 *   after: js/ble/connection.js   before: js/commands/alerts.js
 *
 * NOTES
 *   - HT37_EVENT_REGISTRY is not consulted here (see protocol/command-registry.js).
 *
 * HOW TO EXTEND
 *   - To handle a new inbound (cmd,key): add a branch in checkReassemblyComplete().
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
async function handleBleNotification(event) {
  const data = new Uint8Array(event.target.value.buffer);
  const hex = Array.from(data).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  const charShort = event.target.uuid.slice(0, 8);
  log(`RX [${charShort}]: ${hex}`, 'rx');

  if (data.length === 8 && data[0] === 0xab && (data[1] & 0x10) !== 0) {
    const ackSeq = (data[6] << 8) | data[7];
    lastAckedSeq = ackSeq;
    log(`✓ Watch L1 ACK received for seq=${ackSeq}`, 'ok');
    return;
  }

  if (data.length >= 8 && data[0] === 0xab && (data[1] & 0x10) === 0) {
    const l2Len = (data[2] << 8) | data[3], l2Crc = (data[4] << 8) | data[5], seqId = (data[6] << 8) | data[7];
    rxReassembler = { active: true, seqId, expectedLen: l2Len, expectedCrc: l2Crc, buf: new Uint8Array(data.subarray(8)) };
    await checkReassemblyComplete();
    return;
  }

  if (rxReassembler.active) {
    const combined = new Uint8Array(rxReassembler.buf.length + data.length);
    combined.set(rxReassembler.buf, 0); combined.set(data, rxReassembler.buf.length);
    rxReassembler.buf = combined;
    await checkReassemblyComplete();
    return;
  }

  if (charShort.includes('ffb2') || data[0] === 0x81 || data[0] === 0x80) {
    log(`🚀 IC_568X FFB2 OTA RESPONSE (${data.length}B, Op=0x${data[0]?.toString(16).toUpperCase()}): [${hex}]`, 'ok');
    if (data[0] === 0x81) {
      otaAccepted = true;
      log(`🎉 BINGO! Watch illuminated White Arrow Upload Mode and replied 0x81 (${data.length}B) on FFB2!`, 'ok');
    }
  }
  otaLastResponse = { raw: data, charUuid: charShort };
}

async function checkReassemblyComplete() {
  if (!rxReassembler.active || rxReassembler.buf.length < rxReassembler.expectedLen) return;
  const l2Payload = rxReassembler.buf.subarray(0, rxReassembler.expectedLen);
  const seqId = rxReassembler.seqId;
  rxReassembler.active = false;

  if (cmdChar) {
    const ack8 = new Uint8Array([0xab, 0x10, 0x00, 0x00, 0x00, 0x00, (seqId >> 8) & 0xff, seqId & 0xff]);
    try { await enqueueBleWrite(cmdChar, ack8, `L1-ACK8(seq=${seqId})`, true); } catch (_) {}
  }

  const cmdId = l2Payload[0], keyId = l2Payload[2];
  const valLen = ((l2Payload[3] & 0x01) << 8) | l2Payload[4];
  const valBytes = l2Payload.subarray(5, 5 + valLen);
  const valHex = Array.from(valBytes).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

  log(`🎉 Reassembled L2 Frame (${l2Payload.length}B): Cmd=0x${cmdId.toString(16).padStart(2, '0')}, Key=0x${keyId.toString(16).padStart(2, '0')}, ValLen=${valLen}, Val=[${valHex}]`, 'ok');

  otaLastResponse = { cmdId, keyId, valBytes, valHex };
  // Other tools register in HT37.onFrame to see every complete watch reply (see js/pages/alerts/tool-4-watch-settings.js).
  if (window.HT37 && Array.isArray(HT37.onFrame)) HT37.onFrame.forEach((fn) => { try { fn(cmdId, keyId, valBytes); } catch (e) { log('onFrame handler error: ' + e.message, 'err'); } });

  if (cmdId === 0x03 && keyId === 0x12 && valBytes[0] === 0x00) {
    bindConfirmed = true;
    document.getElementById('bleDot').classList.add('bound');
    document.getElementById('bleStatusText').textContent = `HT37 • 360×360 • IC_568X • BOUND`;
    log(`✅ Watch Bind Confirmed by User! State -> CONNECTED`, 'ok');
    onPostBindConnected();
  }

  if (cmdId === 0x01 && keyId === 0x02) {
    if (valHex !== '00 00') {
      otaAccepted = true;
      log(`🚀 BINGO! 0x01/0x02 CHANGED TO Val=[${valHex}]!`, 'ok');
    } else {
      log(`ℹ️ Watch OTA Pre-Check Status (0x01/0x02): Val=[${valHex}]`, 'ok');
    }
  } else if (cmdId === 0x01 && keyId === 0x04) {
    if (valBytes[0] === 0x00) {
      otaAccepted = true;
      log(`🚀 BINGO! Watch Accepted Enter-OTA (0x01/0x04 Val=[${valHex}])!`, 'ok');
    } else {
      log(`⚠️ Watch replied to 0x01/0x03 with 0x01/0x04 Val=[${valHex}] (Code = 0x${valBytes[0].toString(16)})`, 'err');
    }
  } else if (cmdId !== 0x03) {
    log(`🚀 L2 RESPONSE: Cmd=0x${cmdId.toString(16).padStart(2,'0')}, Key=0x${keyId.toString(16).padStart(2,'0')}, Val=[${valHex}]`, 'ok');
  }

  if (cmdId === 0x05 && keyId === 0x24 && valBytes.length >= 6) {
    // Verified on a real watch: bytes 0-5 are a header (byte 5 = sample counter), then BPM, SpO2 %, diastolic, systolic (same order as FcHealthDataResult).
    const liveBpm = valBytes.length >= 7 ? valBytes[6] : 0;
    if (valBytes.length >= 10 && valBytes[7] > 50) { sensors.spo2 = valBytes[7]; sensors.bpDia = valBytes[8]; sensors.bpSys = valBytes[9]; }
    if (liveBpm > 30 && liveBpm < 220) {
      sensors.hr = liveBpm; if (window.HT37 && HT37.liveData) HT37.liveData.received('hr');
      document.getElementById('simHr').value = liveBpm;
      document.getElementById('valHr').textContent = liveBpm;
    }
    log(`❤️ Watch Live Sensor Stream (0x05/0x24): BPM=${liveBpm} | Raw=[${valHex}]`, 'ok');
    return;
  }

  if (cmdId === 0x02 && keyId === 0x1c && valBytes.length >= 3) {
    const charging = valBytes[0] !== 0, bars = valBytes[1], pct = Math.min(100, Math.max(0, valBytes[2]));
    sensors.battery = pct; sensors.charging = charging; if (window.HT37 && HT37.liveData) HT37.liveData.received('battery');
    document.getElementById('simBat').value = pct;
    document.getElementById('valBat').textContent = pct;
    const chgEl = document.getElementById('chgBat'); if (chgEl) chgEl.textContent = charging ? ' ⚡' : '';       // charging icon next to the battery number
          const sBadge = document.getElementById('bleStatusText');
      if (sBadge) {
        const batTxt = `🔋${pct}%${charging ? '⚡' : ''}`;
        if (!sBadge.textContent.includes('🔋')) {
          sBadge.textContent += ` • ${batTxt}`;
        } else {
          sBadge.textContent = sBadge.textContent.replace(/🔋\d+%⚡?/, batTxt);
        }
      }
    log(`🔋 Watch Battery (0x1C): ${pct}% (${bars} bars, ${charging ? 'Charging' : 'Discharging'})`, 'ok');
  }

  if (cmdId === 0x02 && keyId === 0x21) decodeDeviceConfigTlvs(valBytes);

  if (cmdId === 0x02 && keyId === 0x61 && valBytes.length >= 10) {
    decodeSportUiConfigTlvs(valBytes);
  }

  if (cmdId === 0x05) {
    decodeCmd05SyncData(keyId, valBytes, valHex);
  }
}

function decodeSportUiConfigTlvs(payload) {
  let pos = 0;
  const subSummary = [];
  while (pos + 2 <= payload.length) {
    const entryLen = payload[pos];
    const subKey = payload[pos + 1];
    if (entryLen < 1 || pos + 1 + entryLen > payload.length) break;
    const subVal = payload.subarray(pos + 2, pos + 1 + entryLen);
    const hex = Array.from(subVal).map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ');
    subSummary.push(`0x${subKey.toString(16).padStart(2,'0')}(${subVal.length}B)=[${hex}]`);
    pos += 1 + entryLen;
  }
  log(`📊 Parsed Watch Sport/UI Sub-TLVs (0x02/0x61): ${subSummary.slice(0, 8).join(' | ')}`, 'ok');
  updateLiveSensorReadout();
}

function decodeCmd05SyncData(keyId, valBytes, valHex) {
  // 0x05/0x22 = "today total" (the SDK's FcTodayTotalData, asked with 0x05/0x21). Big-endian u32s: steps, distance (m), calories (cal, not kcal),
  // deep sleep (min), light sleep (min), average heart rate. Verified on a real watch: steps matched the watch screen (83 = 0x53).
  if (keyId === 0x22 && valBytes.length >= 24) {
    const u32 = (o) => ((valBytes[o] << 24) | (valBytes[o + 1] << 16) | (valBytes[o + 2] << 8) | valBytes[o + 3]) >>> 0;
    const steps = u32(0), distM = u32(4), cal = u32(8), avgHr = u32(20);
    if (steps < 1000000) {
      sensors.steps = steps; sensors.distanceM = distM; sensors.calories = cal;
      if (window.HT37 && HT37.liveData) HT37.liveData.received('steps');
      const si = document.getElementById('simSteps'), sv = document.getElementById('valSteps');
      if (si) si.value = Math.min(15000, steps); if (sv) sv.textContent = steps;
      updateLiveSensorReadout();
      log(`👟 Watch Today Total (0x05/0x22): Steps=${steps}, Distance=${distM} m, Calories=${(cal / 1000).toFixed(1)} kcal, AvgHR=${avgHr} | Raw=[${valHex}]`, 'ok');
      return;
    }
  }
  // Other 0x05 replies: 0x24 = live heart rate stream (decoded elsewhere). 0x05/0x06 is a small motion counter, NOT steps (it did not match the watch screen).
  if (valBytes.length >= 12 && (keyId === 0x02 || keyId === 0x03 || keyId === 0x07)) {
    const stepsBE = (valBytes[0] << 24) | (valBytes[1] << 16) | (valBytes[2] << 8) | valBytes[3];
    const stepsLE = valBytes[0] | (valBytes[1] << 8) | (valBytes[2] << 16) | (valBytes[3] << 24);
    const candSteps = (stepsBE >= 0 && stepsBE < 100000) ? stepsBE : ((stepsLE >= 0 && stepsLE < 100000) ? stepsLE : null);
    if (candSteps !== null && candSteps > 0) {
      sensors.steps = candSteps; if (window.HT37 && HT37.liveData) HT37.liveData.received('steps');
      document.getElementById('simSteps').value = Math.min(15000, candSteps);
      document.getElementById('valSteps').textContent = candSteps;
      updateLiveSensorReadout();
      log(`👟 Watch Pedometer Sync (0x05/0x${keyId.toString(16).padStart(2,'0')}): Steps=${candSteps} | Raw=[${valHex}]`, 'ok');
      return;
    }
  }
  log(`📊 Watch Sensor/Health Reply (0x05/0x${keyId.toString(16).padStart(2,'0')}): Val=[${valHex}]`, 'ok');
  updateLiveSensorReadout();
}

function decodeDeviceConfigTlvs(payload) {
  let idx = 0;
  while (idx + 2 <= payload.length) {
    const subKey = payload[idx], subLen = payload[idx + 1];
    const subVal = payload.subarray(idx + 2, idx + 2 + subLen);
    const subHex = Array.from(subVal).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    if (subKey === 0x11 && subVal.length >= 45) {
      watchDeviceInfo53B = Array.from(subVal);
      const proj = Array.from(subVal.slice(0, 6)).map((b) => b.toString(16).padStart(2, '0')).join('');
      const fwVer = `${subVal[26]}.${String(subVal[27]).padStart(2, '0')}`;
      const mac = Array.from(subVal.slice(33, 39)).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
      window.HT37_deviceInfo = { project: String(proj), fw: String(fwVer), mac: String(mac) };
      log(`Parsed Watch DeviceInfo (0x11, ${subVal.length}B): Project=${proj}, FW=v${fwVer}, IC=IC_568X (gui-5681), LCD=360×360 Circle, MAC=${mac}`, 'ok');

        // Update status badge next to Pair & Bind button with 0x02/0x20 Master Config dump
        const cleanProj = proj.replace(/^0+/, '') || proj;
        const statusBadge = document.getElementById('bleStatusText');
        if (statusBadge) {
          statusBadge.textContent = `HT37 (IC_568X) • Proj: ${cleanProj} • FW: v${fwVer} • ${mac}`;
          statusBadge.title = `0x02/0x20 Master Config Dump: Project=${proj}, FW=v${fwVer}, IC=IC_568X (gui-5681), MAC=${mac}`;
        }
    } else if (subKey === 0x14) {
      log(`Parsed Watch Notification Switch Bitmask (0x14): [${subHex}]`, 'ok');
    } else if (subKey === 0x17) {
      log(`Parsed Watch Page/Screen Switch (0x17, Write=0x15): [${subHex}]`, 'ok');
    } else if (subKey === 0x1a) {
      const b1 = subVal.length >= 2 ? subVal[1] : 0;
      const is12H = (b1 & 0x04) !== 0;
      const isFah = (b1 & 0x10) !== 0;
      const unitMode = `${is12H ? '12' : '24'}_${isFah ? 'F' : 'C'}`;
      window.HT37_watchIs12 = is12H; if (typeof window.syncBinWidgetsWithSensors === 'function') setTimeout(window.syncBinWidgetsWithSensors, 0);
      const unitSel = document.getElementById('watchTimeUnitSelect');
      if (unitSel) unitSel.value = unitMode;
      log(`Parsed Watch Function/Weather Switch (0x1A, Write=0x18): [${subHex}] -> ${is12H ? '12-Hour' : '24-Hour'}, ${isFah ? 'Fahrenheit (°F)' : 'Celsius (°C)'}`, 'ok');
    } else if (subKey === 0x2a) {
      log(`Parsed Watch TLV 0x2A (9B): [${subHex}]`, 'ok');
    } else if (subKey === 0x4e && subVal.length >= 4) {
      log(`Parsed Watch Weather Register (0x4E, Write=0x4C): [${subHex}] -> Cur=${subVal[0]}°C, Min=${subVal[1]}°C, Max=${subVal[2]}°C, SkyCode=0x0${subVal[3]}`, 'ok');
    } else if (subKey === 0xc9) {
      log(`Parsed Watch Dial Slots (0xC9): ${subHex} (5 slots active)`, 'ok');
    } else {
      log(`Parsed Watch Config TLV 0x${subKey.toString(16).padStart(2,'0').toUpperCase()} (${subLen}B): [${subHex}]`, 'rx');
    }
    idx += 2 + subLen;
  }
}
