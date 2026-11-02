/**
 * @file     js/ble/state.js
 * @layer    Bluetooth
 * @summary  Shared BLE / transfer state as globals.
 *
 * ROLE
 *   - bleDevice, bleServer: Web Bluetooth device and GATT server. cmdChar: write characteristic for L2 command
 *     frames (ff02, or in a …01ff service). dfuPacketChar: OTA data characteristic (ffb1 / service 9966); both
 *     are chosen in discoverServicesAndSubscribe().
 *   - l1SeqId: next L1 sequence number. lastAckedSeq: last seq the watch ACKed. bindConfirmed: user tapped ✓ on
 *     the watch.
 *   - otaAccepted / otaLastResponse: last OTA/L2 reply (polled by waitForL2Response and otaExchange).
 *   - abortBleOperation: cooperative cancel flag (set by Stop and on disconnect; loops check it).
 *     isTransferRunning: an OTA/probe is active.
 *   - allowManualReset: temporarily true while a confirmed factory reset is sent (bypasses the firewall).
 *     allowUploadTriggerTest: unlocks 0x02/0x88 and non-media cmd 0x07 for upload-trigger probes.
 *   - writeChain: promise chain that serializes BLE writes. rxReassembler: partial inbound L1 frame.
 *     watchDeviceInfo53B: last 53-byte DeviceInfo block (defaults until 0x02/0x20 is read).
 *
 * PROVIDES (globals)
 *   let bleDevice, let bleServer, let cmdChar, let dfuPacketChar, let allWritableChars, let l1SeqId, let
 *   lastAckedSeq, let bindConfirmed, let otaAccepted, let otaLastResponse, let abortBleOperation, let
 *   isTransferRunning, let allowManualReset, let allowUploadTriggerTest, let writeChain, let rxReassembler, let
 *   watchDeviceInfo53B
 *
 * LOAD ORDER
 *   #27 of 62, section "5. BLUETOOTH  (state, frame codec, write queue, connect/bind, notifications)"
 *   after: js/dfu/bin-compiler.js   before: js/ble/frames.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
/* ============================================================================
 * 5. WEB BLUETOOTH ENGINE & SAFETY FIREWALL (BLOCKS 02/40..45 & 07/08)
 * ============================================================================ */
let bleDevice = null, bleServer = null;

let cmdChar = null, dfuPacketChar = null;

let allWritableChars = [];

let l1SeqId = 1, lastAckedSeq = -1, bindConfirmed = false;

let otaAccepted = false, otaLastResponse = null;

let abortBleOperation = false, isTransferRunning = false;

let allowManualReset = false;

let allowUploadTriggerTest = false;

let writeChain = Promise.resolve();

let rxReassembler = { active: false, seqId: 0, expectedLen: 0, expectedCrc: 0, buf: new Uint8Array(0) };

let watchDeviceInfo53B = [
  0x00,0x00,0x00,0x00,0x85,0x45,0x0b,0x49,0x0b,0xd3,0x00,0x00,0x27,0xf3,0x00,0x00,
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x07,0x00,0x00,0x00,0x00,
  0x00,0x58,0x70,0x58,0x9a,0xdf,0x0a,0x08,0x03,0x46,0x00,0x21,0x10,0x00,0x00,0x00,
  0xc0,0x34,0xc9,0x77,0x20
];
