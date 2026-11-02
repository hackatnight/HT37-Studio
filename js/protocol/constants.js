/**
 * @file     js/protocol/constants.js
 * @layer    Protocol data (no DOM)
 * @summary  Protocol constants: BLE service UUIDs to request, weather sky codes, OTA opcodes and ACK names.
 *
 * ROLE
 *   - OPTIONAL_SERVICES: UUID list handed to navigator.bluetooth.requestDevice (Web Bluetooth only exposes
 *     services listed here). Includes the HT37 custom services (…01ff, …9966 OTA) plus every 16-bit
 *     0xfd00-0xffff.
 *   - HT37_SKY_MAP: weather sky name → code 0x00-0x0C (UNKNOWN…FOGGY); payload byte of key 0x02/0x36.
 *   - OTA / OTA_ACK_NAMES: opcodes of the IC_568X OTA protocol on service 00009966 and the status-byte names
 *     (the state machine is documented in the block comment inside this file and in PROTOCOL.md).
 *
 * PROVIDES (globals)
 *   const OPTIONAL_SERVICES, const HT37_SKY_MAP, function skyCodeFromCond, const OTA, const OTA_ACK_NAMES
 *
 * LOAD ORDER
 *   #4 of 62, section "1. NAMESPACE + PROTOCOL DATA  (pure data, no DOM access)"
 *   after: js/protocol/explorer-presets.js   before: js/core/log.js
 *
 * NOTES
 *   - Pure data. Loaded early because later files read these constants at call time.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
const OPTIONAL_SERVICES = [
  '00009966-3c17-d293-8e48-14fe2e4da212',
  '0000aa55-3c17-d293-8e48-14fe2e4da212',   // Opus audio service (chars ab02 write, aa02 notify); see js/pages/alerts/tool-5-watch-audio.js
  '000001ff-3c17-d293-8e48-14fe2e4da212',
  '000002ff-3c17-d293-8e48-14fe2e4da212',
  '000003ff-3c17-d293-8e48-14fe2e4da212',
  '00006287-3c17-d293-8e48-14fe2e4da212',
  '0000d0ff-3c17-d293-8e48-14fe2e4da212',
  '0000e0ff-3c17-d293-8e48-14fe2e4da212',
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  0x1800, 0x1801, 0x180a, 0x180d, 0x180f,
  0xff00, 0xfe00, 0xfd00, 0xf002, 0xae00, 0xfae0
];

for (let u = 0xfd00; u <= 0xffff; u++) OPTIONAL_SERVICES.push(u);

const HT37_SKY_MAP = {
  UNKNOWN: 0x00, SUNNY: 0x01, CLOUDY: 0x02, OVERCAST: 0x03, SHOWER: 0x04,
  THUNDER: 0x05, LIGHTRAIN: 0x06, MODRAIN: 0x07, SLEET: 0x08, LIGHTSNOW: 0x09,
  MODSNOW: 0x0a, SANDSTORM: 0x0b, FOGGY: 0x0c
};
/** Sky code (0x00-0x0C) for whatever the weather selector holds: a key ("LIGHTRAIN") or a label like " Cloudy (05/02)". Unknown text -> 0x01 (sunny). */
function skyCodeFromCond(c) {
  if (c == null) return 0x01;
  const s = String(c), key = s.trim().toUpperCase();
  if (HT37_SKY_MAP[key] !== undefined) return HT37_SKY_MAP[key];
  const m = s.match(/\(05\/([0-9A-Fa-f]{2})\)/);
  if (m) return parseInt(m[1], 16);
  const k = Object.keys(HT37_SKY_MAP).find((n) => key.indexOf(n) >= 0);
  return k !== undefined ? HT37_SKY_MAP[k] : 0x01;
}

/* ============================================================================
 * HT37 / IC_568X OTA flash — follows the FitCloud SDK's own state machine
 * (com.topstep.fitcloud.sdk.v2.ota.j$b, service 00009966-...).  Replaces the
 * old btnFlashWatch handler.
 *
 *   app -> START      01 <fileType> 00*10                      (12 B, no crc/len)
 *   watch -> 0x81     START_ACK  payload: [4..7]=size [8..9]=crc16 [12..15]=resumeOffset
 *                                         [16..17]=mtu [18..19]=maxChunk   (offsets rel. to payload)
 *   app -> HEAD_SYNC  02 000000 | off=0 | crc16arc(head) | 0x0400 | file[0..1023]   (1036 B)
 *   watch -> 0x82     status byte @ resp[12]  (0 = OK)
 *   app -> DATA_SYNC  03 000000 | off | crc16arc(chunk) | len | chunk   (len <= maxChunk)
 *   watch -> 0x83     status @ resp[12]  (0 OK, 0x16 = resend)
 *   app -> END        04 00 00 00 + 8 x 00                     (12 B)
 *   watch -> 0x84     END_ACK
 *
 * A logical packet is written as consecutive BLE writes of <= (mtu - mtu%10) bytes.
 * ========================================================================== */
const OTA = { START: 1, HEAD: 2, DATA: 3, END: 4, ABORT: 5, START_ACK: 0x81, HEAD_ACK: 0x82, DATA_ACK: 0x83, END_ACK: 0x84, ERR: 0xa0 };

const OTA_ACK_NAMES = { 0: 'OK', 1: 'CMD_INVALID', 2: 'OFFSET_ERROR', 3: 'CRC_ERROR', 4: 'LENGTH_ERROR', 5: 'TAG_ERROR', 6: 'PROJECT_ERROR', 7: 'PROTOCOL_VERSION_ERROR', 8: 'FILE_ITEM_ERROR', 9: 'FILE_TYPE_ERROR', 10: 'PACK_TYPE_ERROR', 11: 'FILE_SIZE_ERROR', 12: 'FILE_OFFSET_ERROR', 13: 'FILE_ADDR_ERROR', 14: 'FILE_NAME_ERROR', 15: 'FILE_ITEM_LEN_ERROR', 17: 'UNKNOWN', 20: 'TIMEOUT', 21: 'LOW_BATTERY', 22: 'PACKAGE_RESEND', 128: 'OTHER_ERROR' };
