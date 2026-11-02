/**
 * @file     js/dfu/ffb1-probe.js
 * @layer    Flashing / .bin
 * @summary  Experimental FFB1 upload-mode probes (Tab 3 buttons).
 *
 * ROLE
 *   - triggerWhiteArrowFfb1(): writes the fixed FFB1 "wake & slot 5 (dial type 0x04)" packet; the watch shows
 *     the white upload arrow and answers on FFB2.
 *   - probeFfb1SecondStep(): needs a loaded .bin; triggers the arrow then tests OpCodes 0x20/0x02/0x03.
 *     waitForFfb2Reply(ms) polls otaLastResponse for an FFB2 frame.
 *   - testSingleUploadCandidate(which) / buildCandidatePayloads(bin, slot): write-tester for keys
 *     0x7C/0xAD/0xB0/0x88/0xE0, "clean_tlvs" and a bumped 53-byte DeviceInfo; sets allowUploadTriggerTest while
 *     running.
 *
 * PROVIDES (globals)
 *   function testSingleUploadCandidate, function triggerWhiteArrowFfb1, function buildCandidatePayloads, const
 *   _btnDisc, function waitForFfb2Reply, function probeFfb1SecondStep
 *
 * USES (defined in other files)
 *   - js/ble/state.js: abortBleOperation, allowUploadTriggerTest, bleServer, cmdChar, dfuPacketChar,
 *     otaLastResponse, watchDeviceInfo53B
 *   - js/core/log.js: log
 *   - js/ble/transport.js: enqueueBleWrite, waitForAck, waitForL2Response
 *   - js/ble/frames.js: buildFitCloudFrame, computeCRC16
 *   - js/dfu/bin-compiler.js: buildFfb1Envelope
 *
 * DOM IDS TOUCHED
 *   #btnDiscoverTrigger
 *
 * LOAD ORDER
 *   #36 of 62, section "7. FLASHING  (FFB1 upload-mode probes + IC_568X OTA engine)"
 *   after: js/protocol/explorer-runtime.js   before: js/dfu/ota.js
 *
 * NOTES
 *   - Probing code from reverse-engineering sessions. The production flashing path is dfu/ota.js.
 *   - Writes unverified keys to a real watch — read before running.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
async function testSingleUploadCandidate(which) {
  if (!cmdChar || !bleServer || !bleServer.connected) {
    return log('ERROR: Pair & Bind to the watch first!', 'err');
  }
  abortBleOperation = false;
  allowUploadTriggerTest = true;
  let bin = null;
    if (window.decompiledBinData && window.decompiledBinData.u) {
      bin = window.decompiledBinData.u;
      log(`📦 Using Loaded Testing .BIN: ${window.decompiledBinData.fileName} (${bin.byteLength.toLocaleString()} bytes)`, 'ok');
    } else {
      return log('⚠️ Please load your testing .bin file in Tab 1 (Decompiler Vault) first before flashing!', 'err');
    }
  const p = buildCandidatePayloads(bin, 5);
  const sz120kBE = [0x00, 0x01, 0xd4, 0xc0];
  const sz120kLE = [0xc0, 0xd4, 0x01, 0x00];

  try {
    log(`=== 🎯 Testing Upload Candidate [${which.toUpperCase()}] — Watch screen for White Up-Arrow! ===`, 'ok');
    const pkts = [];

    if (which === 'clean_tlvs') {
      pkts.push({ cmd: 0x02, key: 0x22, val: [0x00, 0x01, 0xe0, 0x04, 0xec, 0x07],                         note: 'Restore_DND_0x22(5B)' });
      pkts.push({ cmd: 0x02, key: 0x25, val: [0x00, 0x01, 0xe0, 0x04, 0xec, 0x00, 0x3c, 0x07],             note: 'Restore_DrinkWater_0x25(7B)' });
      pkts.push({ cmd: 0x02, key: 0x28, val: [0x00, 0x00, 0x3c, 0x01, 0xe0, 0x04, 0xec, 0x00, 0x00, 0x07], note: 'Restore_Sedentary_0x28(9B)' });
      pkts.push({ cmd: 0x02, key: 0x2b, val: [0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], note: 'Restore_TLV2D_0x2B(9B)' });
      pkts.push({ cmd: 0x02, key: 0x2e, val: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], note: 'Restore_TLV30_0x2E(10B)' });
      pkts.push({ cmd: 0x02, key: 0x46, val: [0x00, 0x78, 0x00, 0x96, 0x28, 0x3c],                   note: 'Restore_BP_0x46(6B)' });
      pkts.push({ cmd: 0x02, key: 0x4c, val: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00],                   note: 'Restore_TLV4E_0x4C(6B)' });
      pkts.push({ cmd: 0x02, key: 0x57, val: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], note: 'Restore_TLV59_0x57(10B)' });
      pkts.push({ cmd: 0x02, key: 0x20, val: [0x01],                                                 note: 'Verify_ReadAllConfig_0x20' });
    } else if (which === 'key88') {
      // Test 0x02/0x88 with [], [01], [01,00], and 8B descriptor
      pkts.push({ cmd: 0x02, key: 0x88, val: [],         note: 'Try_02/88_0B_[]' });
      pkts.push({ cmd: 0x02, key: 0x88, val: [0x01],     note: 'Try_02/88_1B_[01]' });
      pkts.push({ cmd: 0x02, key: 0x88, val: [0x01,0x00],note: 'Try_02/88_2B_[01,00]' });
      pkts.push({ cmd: 0x02, key: 0x88, val: p.desc8BE,  note: 'Try_02/88_8B_DescBE' });
    } else if (which === 'cmd07') {
      // Test Cmd=0x07 Keys 0x01..0x05
      for (let k = 1; k <= 5; k++) {
        pkts.push({ cmd: 0x07, key: k, val: [0x01],     note: `Try_07/0${k}_1B_[01]` });
        pkts.push({ cmd: 0x07, key: k, val: [0x01,0x00],note: `Try_07/0${k}_2B_[01,00]` });
      }
    } else if (which === 'cmd01_full') {
      // Test 0x01/0x01 -> 0x01/0x02 -> 0x01/0x03 -> 0x01/0x05 (with first 64B chunk of watchface)
      pkts.push({ cmd: 0x01, key: 0x01, val: p.bumped53B, note: 'Try_01/01_53B' });
      pkts.push({ cmd: 0x01, key: 0x02, val: [0x01, 0x00],note: 'Try_01/02_ForceAck_[01,00]' });
      pkts.push({ cmd: 0x01, key: 0x03, val: [0x01, 0x00],note: 'Try_01/03_Start_[01,00]' });
      pkts.push({ cmd: 0x01, key: 0x04, val: [0x00],      note: 'Try_01/04_ForceOk_[00]' });
      pkts.push({ cmd: 0x01, key: 0x05, val: [0x00, 0x00, ...Array.from(bin.slice(0, 64))], note: 'Try_01/05_FirstChunk64B' });
    } else if (which === 'l1_l2_flags') {
      // Test L2 Version byte = 0x01 or 0x02 (NewOTA protocol version!) on Cmd=0x01 and Cmd=0x02/0xB0
      for (const ver of [0x01, 0x02, 0x10]) {
        pkts.push({ cmd: 0x01, key: 0x01, val: p.bumped53B, ver, note: `Try_01/01_L2Ver0x${ver.toString(16)}` });
        pkts.push({ cmd: 0x01, key: 0x03, val: [0x01, 0x00],ver, note: `Try_01/03_L2Ver0x${ver.toString(16)}` });
        pkts.push({ cmd: 0x02, key: 0xb0, val: [0x01, ...sz120kBE], ver, note: `Try_02/B0_L2Ver0x${ver.toString(16)}` });
      }
    } else if (which === 'early_raw_dfu') {
      // Early-session raw DFU / Dial start frames (without 0xAB L1 wrapper or with direct DFU opcodes)
      const rawFrames = [
        new Uint8Array([0xfe, 0x01, ...sz120kLE, ...p.cLE]),
        new Uint8Array([0xff, 0x01, ...sz120kBE, ...p.cBE]),
        new Uint8Array([0x55, 0xaa, 0x01, ...sz120kLE]),
        new Uint8Array([0xab, 0x01, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0x00, 0x03, 0x00, 0x01, 0x01])
      ];
      for (let i = 0; i < rawFrames.length; i++) {
        await enqueueBleWrite(cmdChar, rawFrames[i], `EarlyRawDFU_${i}`);
        await new Promise(r => setTimeout(r, 450));
      }
    }

    for (const item of pkts) {
      if (abortBleOperation || !bleServer || !bleServer.connected) break;
      otaLastResponse = null;
      const { frame, seq } = buildFitCloudFrame(item.cmd, item.key, item.val, item.ver || 0x00);
      await enqueueBleWrite(cmdChar, frame, `${item.note} seq=${seq}`);
      await waitForAck(seq, 350);
      const resp = await waitForL2Response(300);
      if (resp) {
        log(`🎯 L2 REPLY on ${item.note}: Cmd=0x${resp.cmdId?.toString(16).padStart(2,'0')}, Key=0x${resp.keyId?.toString(16).padStart(2,'0')}, Val=[${resp.valHex}]`, 'ok');
      }
      await new Promise(r => setTimeout(r, 500));
    }
    log(`✅ Finished testing [${which.toUpperCase()}]! Did the watch screen react?`, 'ok');
  } finally {
    allowUploadTriggerTest = false;
  }
}

async function triggerWhiteArrowFfb1() {
  if (!bleServer || !bleServer.connected) {
    return log('ERROR: Pair & Bind to the watch first!', 'err');
  }
  const targetChar = dfuPacketChar || cmdChar;
  if (!targetChar) return log('ERROR: No writable characteristic found!', 'err');
  abortBleOperation = false;
  // Exact 13-byte Wake & Slot 5 (Custom Dial Type = 0x04) packet for Service 00009966 -> 0000ffb1:
  const wake13B = new Uint8Array([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0xc3, 0x01, 0x00, 0x04, 0x07]);
  log(`🚀 Sending 13-Byte IC_568X Wake & Slot 5 Packet to [${targetChar.uuid.slice(0, 8)}]: [01 00 00 00 00 00 00 00 01 C3 01 00 04]...`, 'ok');
  await enqueueBleWrite(targetChar, wake13B, 'FFB1_WakeAndSlot(13B)');
}

/* ============================================================================
 * 6. TARGETED WRITE TESTER FOR 0x7C (GUI), 0xAD (FLASH), 0xB0, 0x88, 0xE0 & BUMPED OTA
 * ============================================================================ */
function buildCandidatePayloads(bin, slot) {
  const size = bin.byteLength;
  const crc = computeCRC16(bin, 0x0000);
  const sLE = [size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >> 24) & 0xff];
  const sBE = [(size >> 24) & 0xff, (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff];
  const cLE = [crc & 0xff, (crc >> 8) & 0xff];
  const cBE = [(crc >> 8) & 0xff, crc & 0xff];
  const bumped53B = [...watchDeviceInfo53B];
  bumped53B[26] = 0x01; bumped53B[27] = 0x08; // Bump FW v1.07 -> v1.08
  return {
    size, crc, sLE, sBE, cLE, cBE,
    desc8LE: [slot, 0x01, ...sLE, ...cLE],
    desc8BE: [slot, 0x01, ...sBE, ...cBE],
    gui7B: [0x03, 0x01, 0x01, 0x68, 0x01, 0x68, 0x01],
    flash8B: [0x00, 0x00, 0x08, 0x26, ...sBE],
    bumped53B
  };
}

const _btnDisc = document.getElementById('btnDiscoverTrigger');

if (_btnDisc) {
  _btnDisc.addEventListener('click', async () => {
    log('--- [🔬 2. Discover Trigger (Safe) -> Sending FFB1 Wake & Slot Packet] ---', 'tx');
    await triggerWhiteArrowFfb1();
  });
}

/* ============================================================================
 * 7. FLASH TO WATCH
 * ============================================================================ */

async function waitForFfb2Reply(timeoutMs = 1500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (abortBleOperation) return null;
    if (otaLastResponse && otaLastResponse.raw) return otaLastResponse.raw;
    await new Promise((r) => setTimeout(r, 10));
  }
  return null;
}

async function probeFfb1SecondStep() {
  if (!bleServer || !bleServer.connected || !dfuPacketChar) {
    return log('ERROR: Pair & Bind to the watch first!', 'err');
  }
  abortBleOperation = false;
  let bin = null;
    if (window.decompiledBinData && window.decompiledBinData.u) {
      bin = window.decompiledBinData.u;
      log(`📦 Using Loaded Testing .BIN: ${window.decompiledBinData.fileName} (${bin.byteLength.toLocaleString()} bytes)`, 'ok');
    } else {
      return log('⚠️ Please load your testing .bin file in Tab 1 (Decompiler Vault) first before flashing!', 'err');
    }
  const fSize = bin.byteLength;
  const bodyLen = fSize - 1024;
  const bodyCrc = computeCRC16(bin.subarray(1024), 0x0000);
  const fullCrc = computeCRC16(bin, 0x0000);
  const szLE = [fSize & 0xff, (fSize >> 8) & 0xff, (fSize >> 16) & 0xff, (fSize >> 24) & 0xff];
  const crcLE = [bodyCrc & 0xff, (bodyCrc >> 8) & 0xff];
  const fullCrcLE = [fullCrc & 0xff, (fullCrc >> 8) & 0xff];

  log('=== 🔬 Probing FFB1 Op=0x01 & Op=0x02 Header/Parameter Variations (Looking for 0x82 Status == 0x00!) ===', 'ok');

  // Group 1: What if Op=0x01 (Wake) needs the File Size in Bytes 4..7 or Payload [0x04, ...Size4LE, ...Crc2LE, 0x07]?
  const wakeVariants = [
    { off: fSize, pl: [0x04, 0x07],                       lbl: 'W1_Op01_Offset=FileSize_Pl=[04]' },
    { off: 0,     pl: [0x04, ...szLE, 0x07],              lbl: 'W2_Op01_Pl=[04,Size4LE](5B)' },
    { off: 0,     pl: [0x04, ...szLE, ...crcLE, 0x07],    lbl: 'W3_Op01_Pl=[04,Size4LE,Crc2LE](7B)' },
    { off: 0,     pl: [0x04, 0x07],                       lbl: 'W4_Standard_Op01_Pl=[04](1B)' }
  ];

  for (const wv of wakeVariants) {
    if (abortBleOperation) break;
    otaLastResponse = null;
    await enqueueBleWrite(dfuPacketChar, buildFfb1Envelope(0x01, wv.off, wv.pl), wv.lbl);
    const wr = await waitForFfb2Reply(1200);
    if (wr) {
      const rxHex = Array.from(wr).map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ');
      log(`  Wake Reply (${wv.lbl}): [${rxHex}]`, 'ok');
    }
  }

  // Group 2: Inside the active session, test Op=0x02 with different Header Flags (Bytes 1..3), Offset (Bytes 4..7), and Payloads!
  const chunk241 = Array.from(bin.subarray(0, 241)); // 241B + 12B = 253B (0x00FD max packet reported by 0x81!)
  const chunk128 = Array.from(bin.subarray(0, 128));
  const tbui128  = Array.from(bin.subarray(1024, 1152));

  // Also test "TOPSTEP\x01" (8B) header at 0x00..0x07 instead of "TOPSTEP 01" (10B)
  const altHeader128 = [...chunk128];
  altHeader128.splice(0, 10, 0x54, 0x4f, 0x50, 0x53, 0x54, 0x45, 0x50, 0x01, 0x00, 0x00);

  const op02Variants = [
    { op: 0x02, f24: 0x000000, off: 0,     pl: chunk241,                      lbl: 'V1_Op02_241B_Total253B(0xFD!)' },
    { op: 0x02, f24: 0x000004, off: 0,     pl: chunk128,                      lbl: 'V2_Op02_Byte1=04_Off0_128B' },
    { op: 0x02, f24: 0x040000, off: 0,     pl: chunk128,                      lbl: 'V3_Op02_Byte3=04_Off0_128B' },
    { op: 0x02, f24: 0x000000, off: fSize, pl: chunk128,                      lbl: 'V4_Op02_Offset=FileSize_128B' },
    { op: 0x02, f24: 0x000000, off: 0,     pl: altHeader128,                  lbl: 'V5_Op02_TOPSTEP01_8B_Magic_128B' },
    { op: 0x02, f24: 0x000000, off: 0,     pl: tbui128,                       lbl: 'V6_Op02_Direct_TBUI_128B' },
    { op: 0x02, f24: 0x000000, off: 0,     pl: [0x04, ...szLE, ...fullCrcLE, 0x07], lbl: 'V7_Op02_Pl=[04,Size4LE,FullCrc2LE]' },
    { op: 0x03, f24: 0x000000, off: fSize, pl: [...fullCrcLE],                lbl: 'V8_Op03_Offset=FileSize_Crc2LE' },
    { op: 0x03, f24: 0x000004, off: 0,     pl: chunk128,                      lbl: 'V9_Op03_Byte1=04_Off0_128B' }
  ];

  for (const v of op02Variants) {
    if (abortBleOperation) break;
    otaLastResponse = null;
    await enqueueBleWrite(dfuPacketChar, buildFfb1Envelope(v.op, v.off, v.pl, v.f24), v.lbl);
    const r = await waitForFfb2Reply(550);
    if (r) {
      const rxHex = Array.from(r).map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ');
      const st = r.length >= 13 ? r[12] : null;
      const highlight = (st !== 0x04 && st !== 0x0c) ? '🎯 CHANGED!' : '  ';
      log(`${highlight} Reply to ${v.lbl}: Op=0x${r[0].toString(16).toUpperCase()}, Status=0x${st?.toString(16).padStart(2,'0')}, Raw=[${rxHex}]`, (st !== 0x04 && st !== 0x0c) ? 'ok' : 'rx');
    }
  }

  log('✅ Finished FFB1 Header & Parameter Probe! Copy and paste the logs here!', 'ok');
}
