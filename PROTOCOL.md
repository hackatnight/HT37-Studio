# HT37 / FitCloud (TopStep) protocol — as implemented in this app

Source of truth is the code: `js/ble/frames.js` (framing), `js/protocol/*` (data), `js/dfu/ota.js` (flashing). The tables in §5-§7
are generated from `js/protocol/command-registry.js` and `js/protocol/explorer-presets.js`. Vendor references:
FitCloudPro Android SDK (`htangsmart/FitCloudPro-SDK-Android`) and https://topstep-sdk-doc.htangsmart.com/docs/.

## 1. Transport
- GATT service with the **command characteristic** (`ff02` / a `…01ff` service) → `cmdChar`; notifications arrive on every notify characteristic.
- **OTA service** `00009966-3c17-d293-8e48-14fe2e4da212`: data characteristic `ffb1` (write) → `dfuPacketChar`, replies on `ffb2`.
- Writes go through `enqueueBleWrite` (serialized, ≤512 B per write, firewall-checked).

## 2. Frames
**L1 envelope** (`buildRawL1Frame`), 8-byte header then the L2 bytes:

| byte | meaning |
|---|---|
| 0 | `0xAB` magic |
| 1 | flags: `0x00` data frame; bit `0x10` = ACK |
| 2-3 | L2 length, big-endian |
| 4-5 | CRC-16/ARC (poly 0xA001, init 0) of the L2 bytes, big-endian |
| 6-7 | sequence number, big-endian (`l1SeqId`, wraps at 0xFFFF) |

An ACK is just the 8-byte header (flag 0x10, length 0) echoing the sequence. The app ACKs every complete inbound frame; `waitForAck(seq)` waits for the watch's ACK of an outbound one.

**L2 command frame** (`buildFitCloudFrame(cmd, key, value, ver=0)`):

| byte | meaning |
|---|---|
| 0 | `cmd` (command family) |
| 1 | L2 version (0) |
| 2 | `key` (register / sub-command) |
| 3-4 | value length (bit 8 in byte 3, low 8 bits in byte 4) |
| 5… | value bytes |

Inbound frames larger than one notification are reassembled (`rxReassembler`) from the L1 length.
Command families seen in this app: 0x01 query/OTA pre-check, 0x02 settings & device queries, 0x03 bind/health sync, 0x04 notifications/alerts, 0x05 sensor/summary data, 0x06 live-stream probes, 0x07 media/camera remote.
Replies usually come on the same cmd with a related key (e.g. query 0x02/0x1B → reply 0x02/0x1C).

## 3. Session flow
1. Pair (`requestDevice`, `OPTIONAL_SERVICES`), connect GATT, subscribe to notifications, choose `cmdChar`/`dfuPacketChar`.
2. **Bind**: send `0x03/0x11` (32-byte padded user id). The user taps ✓ on the watch; the watch replies `0x03/0x12 = [00]` → `bindConfirmed`.
3. **Post-bind sync**: `0x02/0x12 = FF FF FF FF` (enable all notification types), then reads `0x02/0x20` (config dump, TLV list → reply 0x02/0x21), `0x1B` (battery), `0x60` (sport UI), `0xC8` (dial slots).

## 4. Payload formats implemented
- **Notification (cmd 0x04)**: key = app icon. Call ring (key 0x01): `[senderLen, sender…, 00×8]`; end/mute (0x02/0x03): `[00]`; others depend on the "Text Encoding" selector: `ht37struct` `[senderLen, sender, msgLenHi, msgLenLo, msg, 00×8]` (default), `singlelen`, `typeprefix`, `nullsep`, `plain`.
- **Weather (0x02/0x36)**: `[cur, min, max, sky, sky, 01, 01]`; temperatures are 1 byte, bit 7 = negative; sky 0x01 sunny … 0x0C foggy (`HT37_SKY_MAP`). Variants: sky in byte 3 or byte 4 only; with city name appended.
- **Time (0x02/0x01)**: `[yy-2000, mm, dd, hh, mi, ss]`. **Units (0x02/0x18)**: `03 EB` 24H°C, `03 EF` 12H°C, `03 FF` 12H°F, `03 FB` 24H°F.
- **Dial slot (0x02/0x70)**: `[slot]`. **Find watch (0x02/0x3B)**: `[01]`. **PPG LEDs (0x05/0x23)**: `[01 00]` start green, `[00 00]` stop.

## 5. Safety firewall
`isDangerousResetFrame` blocks: 0x02 keys 0x40-0x45 (factory reset / unbind / power-off), 0x02/0x3A (language), 0x02/0x65 (restart/unbind), and unless `allowUploadTriggerTest`: 0x02/0x88 and any cmd 0x07 other than key 0x03.

## 6. OTA flash (service 9966) — `js/dfu/ota.js`
12-byte packet header: `[op, 0,0,0, offset u32 LE, crc16 u16 LE (ARC of payload), len u16 LE]` + payload.

| step | app → watch | watch → app |
|---|---|---|
| START | `01 <fileType> 00×10` | `0x81`: size, crc, resume offset, mtu, maxChunk |
| HEAD | `02`, offset 0, first 1024 B of file | `0x82`, status @resp[12] (0 = OK) |
| DATA | `03`, offset, chunk ≤ maxChunk | `0x83`, status (0x16 = resend) |
| END | `04` | `0x84` |
| (error) | `05` ABORT | `0xA0` error |

Writes are fragmented to `mtu - mtu%10` bytes. Status names are in `OTA_ACK_NAMES`.
Pre-flight checks: file size field @0x0C equals file length; header CRC @0x10 (u16 LE) equals CRC-16/BUYPASS (poly 0x8005, MSB-first, init 0) of `file[0x400..]`; file type from the header item table (count @0x13, entries from 0x20, all must share one type).
"White arrow" upload mode is entered by writing a fixed packet to `ffb1` (`triggerWhiteArrowFfb1`).

## 7. TOPSTEP / TBUI `.bin` (as decoded by `js/decompiler/vault.js`)
Container magic `TOPSTEP 01`; TBUI block at the offset stored at 0x24 (normally 0x400). Sprites use the **PA** format (RLE + 7-bit signed RGB565 delta); widget table entries: types 0/4/5/6 sprite widgets, 2/3 dynamic number widgets (font index + alignment); sub-types 0 steps, 2 hour, 3 minute, 6 distance, 7 kcal, 8 BPM, 11 temperature, 13 date. Details in the `vault.js` header.

## 8. Outbound command registry (generated)
| id | cmd | key | cat | name | default payload | description |
|---|---|---|---|---|---|---|
| `SYNC_TIME_6B` | 0x02 | 0x01 | system | Sync Time RTC (6B) |  | Sets watch RTC clock and resets midnight step counter |
| `ENABLE_ALERTS` | 0x02 | 0x12 | system | Master Alert Whitelist | FF FF FF FF | Writes [FF FF FF FF] mask so all notifications display |
| `SET_UNITS_24H_C` | 0x02 | 0x18 | system | Units: 24H + °C | 03 EB | Function switch bank 0x03=0xEB |
| `SET_UNITS_12H_C` | 0x02 | 0x18 | system | Units: 12H + °C | 03 EF | Function switch bank 0x03=0xEF |
| `PUSH_WEATHER_7B` | 0x02 | 0x36 | system | Push Weather (7B) |  | Pushes sky code and temperatures to complications |
| `PUSH_WEATHER_DIRECT` | 0x02 | 0x4C | system | Direct Weather Register |  | Direct write key for weather complication (paired with read 0x4E) |
| `FIND_WATCH_CHIME` | 0x02 | 0x3B | action | Find Watch Chime | 01 | Fires speaker chime and lights display |
| `FACTORY_RESET` | 0x02 | 0x40 | system | Factory Reset |  | Beeps and erases user flash (DANGEROUS) **(DANGEROUS)** |
| `SWITCH_DIAL_SLOT` | 0x02 | 0x70 | dial | Switch Dial Slot |  | Swaps active watchface index [slotId] |
| `SET_STEP_GOAL_10K` | 0x02 | 0x03 | system | Set Step Goal (10,000) | 10 27 00 00 | Writes 10,000 daily step target (little-endian) |
| `MASTER_CONFIG_DUMP` | 0x02 | 0x20 | query | Master Config Dump | 01 | Triggers 164B hardware register table dump; watch replies on 0x02/0x21 |
| `QUERY_BATTERY_STATE` | 0x02 | 0x1B | query | Query Battery State |  | Queries charging, bars, and battery percent; watch replies on 0x02/0x1C |
| `QUERY_LCD_SPEC` | 0x02 | 0x7D | query | Query LCD Panel Spec | 01 | Queries 360x360 resolution and LCD type 3; watch replies on 0x02/0x7E |
| `QUERY_FLASH_SPACE` | 0x02 | 0xAE | query | Query Dial Flash Boundary | 01 | Queries dial flash base and 524KB max size; watch replies on 0x02/0xAF |
| `QUERY_STEP_GOAL_STAT` | 0x01 | 0x03 | query | Query Step Goal Status |  | Queries active step goal; watch replies on 0x01/0x04 |
| `QUERY_OTA_PRECHECK` | 0x01 | 0x01 | query | Query OTA / Firmware State |  | Queries bootloader/firmware state; watch replies on 0x01/0x02 |
| `PPG_LEDS_START` | 0x05 | 0x23 | sensor | Start Optical PPG LEDs | 01 00 | Activates green optical PPG LEDs on back of watch |
| `PPG_LEDS_STOP` | 0x05 | 0x23 | sensor | Stop Optical PPG LEDs | 00 00 | Deactivates green optical PPG LEDs on back of watch |
| `SYNC_TODAY_SUMMARY` | 0x05 | 0x06 | sensor | Sync Today Summary | 00 | Requests today total steps, active kcal, and distance |
| `ALERT_CALL` | 0x04 | 0x01 | alert | Incoming Call Alert |  | Continuous vibration + caller prompt |
| `ALERT_CALL_END` | 0x04 | 0x02 | alert | End / Dismiss Call |  | Dismisses incoming call vibration |
| `ALERT_CALL_MUTE` | 0x04 | 0x03 | alert | Mute Ringing Call |  | Mutes call vibration without rejecting |
| `ALERT_SMS` | 0x04 | 0x04 | alert | SMS Text Message |  | SMS icon + sender & body struct |
| `ALERT_QQ` | 0x04 | 0x05 | alert | QQ Notice |  | QQ icon notification |
| `ALERT_WECHAT` | 0x04 | 0x06 | alert | WeChat Notice |  | WeChat green icon notification |
| `ALERT_FACEBOOK` | 0x04 | 0x07 | alert | Facebook Notice |  | Facebook blue icon notification |
| `ALERT_TWITTER` | 0x04 | 0x08 | alert | X / Twitter Notice |  | X / Twitter icon notification |
| `ALERT_LINKEDIN` | 0x04 | 0x09 | alert | LinkedIn Notice |  | LinkedIn icon notification |
| `ALERT_INSTAGRAM` | 0x04 | 0x0A | alert | Instagram Notice |  | Instagram icon notification |
| `ALERT_GENERIC` | 0x04 | 0x0B | alert | General App Notice |  | Generic bell notice icon |
| `ALERT_WHATSAPP` | 0x04 | 0x0C | alert | WhatsApp Notice |  | WhatsApp icon notification |
| `ALERT_LINE` | 0x04 | 0x0D | alert | LINE Notice |  | LINE icon notification |
| `ALERT_MESSENGER` | 0x04 | 0x0E | alert | FB Messenger Notice |  | Messenger icon notification |
| `ALERT_KAKAOTALK` | 0x04 | 0x0F | alert | KakaoTalk Notice |  | KakaoTalk icon notification |
| `ALERT_SKYPE` | 0x04 | 0x10 | alert | Skype Notice |  | Skype icon notification |
| `ALERT_EMAIL` | 0x04 | 0x11 | alert | Email Notice |  | Email letter envelope icon |
| `ALERT_TELEGRAM` | 0x04 | 0x12 | alert | Telegram Notice |  | Telegram paper airplane icon |
| `ALERT_VIBER` | 0x04 | 0x13 | alert | Viber Notice |  | Viber purple phone icon |
| `ALERT_SNAPCHAT` | 0x04 | 0x15 | alert | Snapchat Notice |  | Snapchat ghost icon |

Reserved / unassigned alert keys (dropdown only): 0x14 (Unassigned (No Op)), 0x16 (TikTok / Unused), 0x17 (YouTube / Unused), 0x18 (Calendar / Unused), 0x19 (iOS Mail / Unused), 0x1a (DingTalk / Unused), 0x1b (Alipay / Unused), 0x1c (Taobao / Unused).

## 9. Inbound event registry (generated — defined but not yet wired to the RX path)
| key | name | description |
|---|---|---|
| `0x02_0x1C` | Battery: Status Report | Watch reported live battery percent, bars, and charging status |
| `0x02_0x7E` | LCD: Display Geometry Spec | Watch reported LCD Type 3, 360x360 resolution |
| `0x02_0xAF` | Flash: Storage Boundary Spec | Watch reported dial flash base sector and 524KB max boundary |
| `0x02_0x21` | System: Master Config Dump | Watch dumped 164B register table (SoC, FW, MAC, Dials) |
| `0x02_0x3C` | Find Phone: Triggered | User tapped Find Phone on watch; play alarm on host |
| `0x02_0x7C` | Find Phone: Finished | Find Phone timed out or was dismissed |
| `0x02_0x51` | DND: Toggle Notice | User toggled Do Not Disturb in watch quick settings |
| `0x02_0xE5` | Alert: Display Active | Watch screen woke up with active alert prompt |
| `0x02_0xCA` | Sport: Workout Session Event | Workout lifecycle state transition — 0=Stopped / Ended, 1=Running / Active, 2=Paused |
| `0x02_0x92` | Media: Widget Handshake Ping | Watch entered Music widget; requested current playback state |
| `0x07_0x04` | Camera: Viewfinder Opened | Watch entered camera mode; open viewfinder on host |
| `0x07_0x01` | Camera: Shutter Pressed | User tapped shutter on watch; capture photo! |
| `0x07_0x05` | Camera: Closed | Watch exited camera mode; close viewfinder on host |
| `0x07_0x03` | Media: Action Triggered | Watch sent media control button — 1=Pause, 2=Play, 3=Next Track, 4=Prev Track, 5=Vol Up, 6=Vol Down |
| `0x04_0x20` | Call: User Declined | User pressed End Call on watch touchscreen |

## 10. Master Command Station presets (generated)
43 presets. Option value = `cmd|key|payload|title|desc`.

| group | items |
|---|---|
| ⌚ Dial Slots & Watch Faces (0x02/0x70) | 7 |
| 🏃 Health & Activity Records (Cmd 0x03) | 5 |
| 📞 Telephony Commands (Cmd 0x04) | 3 |
| 💬 Social & App Notifications (Cmd 0x04) | 17 |
| ⚙️ Device Registers & Settings (Cmd 0x01 / 0x02) | 8 |
| 📡 Telemetry Streaming & Optical Probes (Cmd 0x06) | 2 |
| 🌤️ Weather Telemetry Presets (Cmd 0x02) | 1 |
