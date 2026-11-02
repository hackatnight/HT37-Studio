# HT37 / FitCloud protocol map: the layout of the land

Written Nov 1 2026 from: the vendor SDK v3.0.2.7 (decompiled with jadx, every command it can send), the FitCloudPro 2.6.6 app, `PROTOCOL.md`, `APP_COMMANDS.md`, `UNKNOWNS.md`, and what we have actually seen this watch do. Status words: **seen** = observed on this watch, **SDK** = defined by the vendor SDK but not tried here, **predicted** = inferred from the rules below, untested.

The short version: the firmware is not random. It follows a small number of rules, and the watch hands us a capability bitmap that says which parts of the SDK it implements. Brute forcing the key space is not needed. Most of the unknowns can be read from the SDK and then checked with one safe read-only request.

---

## 1. The five rules that make it predictable

**Rule 1: Replies are request + 1.** Of the 83 request/reply pairs in the SDK, 82 have the reply key exactly one above the request key (the exception is 02/B0 to 02/B7, a long-running operation). Odd and even request keys both occur (45 odd, 38 even), so it is not a parity trick. Examples: 02/1B to 1C battery, 02/20 to 21 dump, 05/21 to 22 today totals, 05/42 to 43 latest health, 05/48 to 49 sport status, 08/1A to 1B device ID. Consequence: if a command is known, its reply key is known. If a key is a reply, the request is the key below it.

**Rule 2: Settings live in triples (write, read, report).** For the older settings the firmware reserves three keys in a row: write key W, read request W+1, report W+2, and the settings dump (02/20 to 02/21) labels each block with **type = W+2**. Evidence: alarms are 02/02 (write), 02/03 (request), 02/04 (reply); schedules 02/6A, 6B, 6C; contacts 02/54, 55, 56; weather 02/36 with an SDK pair at 02/37 and 02/38 (purpose unnamed); and every settings block type in the dump equals its write key plus 2 (see section 4). The one exception is screen vibrate (type 122, write key 123). Consequence: the keys in the gaps next to each settings write key (for example 02/13 and 02/14 beside the notification whitelist at 02/12) are almost certainly that setting's individual read request and report. We never used them because the dump reads everything at once.

**Rule 3: Key number is roughly feature age.** In group 02, low keys (0x01 to 0x6C) are the original core (time, alarms, settings, weather, find, reset, UI info, contacts, schedules). 0x70 to 0x77 are dial slots, schedule permission and games. 0x7D to 0xB0 are LCD, sport UI, audio, notifications, exercise goal, language, QR codes and power save. 0xB9 to 0xFB are the newest (medals, schedule types, albums, serial numbers, sport state, lyric color, charging light, laser). New features were appended at the end, so a high key means a late addition and is more likely to be gated off on this watch.

**Rule 4: Capability flags predict what is missing.** Block 17 of the settings dump is a bitmap of 174 named feature flags (section 3). The SDK checks a flag before using a command, and the firmware follows the same flags: block lengths change with them and blocks for unsupported features disappear (section 4). Flags are a good guide to absence (every missing block has its flag OFF). They are not proof of presence, because two blocks (blood pressure and do-not-disturb) are still reported with their flags OFF. A feature with its flag ON is worth testing; one with its flag OFF is a long shot.

**Rule 5: Stored data uses one pipe.** All stored history (steps, sport, heart rate, sleep, GPS and more) comes through the same transfer: write 05/01 [type], the watch answers 05/07 (total size), streams 05/30 frames, then 05/08 (end). Data type ids follow a pattern too: base types 1 to 7, then 10 (GPS), 16 (sport) and up; manual-measurement variants are the base id plus 128 (3 to 131, 4 to 132, 5 to 133, 6 to 134, 17 to 145, 18 to 146); 253 to 255 are special summaries.

---

## 2. Command groups

| cmd | purpose | keys the SDK uses | notes |
|---|---|---|---|
| 01 | OTA pre-check and DFU entry | 01 to 04 | 01/01 to 02 firmware state, 01/03 to 04 sub-project. Never write the DFU entry. |
| 02 | Device, settings, UI, utilities (the big one) | 106 keys, 0x01 to 0xFB | Core settings and queries. Also carries watch-pushed events (battery, wake, sport, music, find phone). |
| 03 | Binding and user | 03/07, 03/15 to 16, plus our 03/11 to 12 | 03/11 bind (user taps check on the watch), 03/12 reply. 03/15 unbinds: dangerous. |
| 04 | Phone to watch notifications | key = app icon id (computed, not in the SDK list) | 04/20 = watch tells us the user declined a call. |
| 05 | Health data and sensors | 18 keys, 0x01 to 0x5B | Live measure (23 to 24), today totals (21 to 22), stored data sync (01 with 07, 30, 08), sleep (50 with 51 to 57), latest health (42 to 43), sport status (48 to 49). |
| 06 | nothing in the SDK | none | Reserved or unused. Do not probe. |
| 07 | Camera and peripheral remote | 07/02, 07/09, 07/0A, plus events 07/01, 03, 04, 05 | Camera viewfinder/shutter/close and media keys come FROM the watch. |
| 08 | Product-line extensions | 103 keys, 0x01 to 0xBF | Kids/parent mode, earphones, prayer times, EQ, tasks, HRV, mood, AI chat, taxi info. Almost all flag-gated. Mostly request/reply pairs. This watch is unlikely to support most of it. |

Group 02 and group 08 together are 209 of the 237 commands. Group 08 looks like an overflow group added when group 02 was filling up, for product variants (earphones, kids watches, prayer watches). Expect most of it to be silent on this watch.

---

## 3. What this watch says it supports (capability bitmap, block 17)

The bitmap is read from the 53-byte block 17 of the settings dump. The bit test is `byte[start - index/8] & (1 << index%8)`, reading backward from the start offset (9 for flags 0 to 31, 37 for 256 to 303, and an extended list from byte 39 for 512 and up, length in byte 38). Decoded for this watch (Nov 1 2026): project `000000008545`, IC_568X, firmware app field `00000107`.

**ON (48 flags).** Heart rate, blood oxygen, weather, sport, WeChat sport, dynamic heart rate, women's health, silent DFU, custom dial, sport push, **measure data syncable**, sleep, **GPS**, 568X platform, extended notification support (email, Viber/Telegram, extra), step extra, heart-rate alarm, **request latest health**, new notification protocol, **new sleep protocol**, contacts, sedentary interval, weather forecast, device name setting, dial push, multiple dials, dial component, GUI, collection code (payment QR), business card, **GPS hot start**, function-config high bits, **navigation**, sport data config, TopStep OTA, **GNSS GPS**, hide strengthened measurement, **air pressure (barometer)**, time format, **speech SCO (Bluetooth voice)**, find device, notification, music info state, XMLY (audio), take-photo control.

**OFF (the ones that explain what we saw).** Blood pressure and blood-pressure alarm, ECG (all three kinds), temperature, respiratory rate, stress/pressure, games, screen vibrate, protection reminder, hand washing reminder, health-monitor interval field, DND flag, HRV, AI chat/recording, albums, e-books, medals, vitality, sleep score, resting heart rate, G-sensor data, earphone commands, offline maps, and about 100 more.

What this explains:
- **No ECG response** (flags off: ECG, mock ECG, TI ECG). The watch has no ECG hardware.
- **Blood pressure is only an estimate** (flag off). The numbers we show come from the heart rate, as we suspected.
- **Empty history for types 5, 6, 7, 17, 18**: those sensors do not exist on this watch.
- **Types 3 and 4 (heart rate, oxygen) are supported but empty**, because automatic monitoring is off (section 4).
- **Compass is not a vendor flag.** None of the 174 named SDK feature flags is a compass. Barometer (AIR_PRESSURE), GPS, GNSS and NAVIGATION are, so the compass chip is probably only used by the watch's own app.

---

## 4. The settings dump (02/20 to 02/21) decoded for this watch

Read Nov 1 2026, 164 bytes, 13 blocks in the form [type][length][value]. This is the table of contents of the watch's configuration.

| type | write key (type minus 2) | setting | length here | value on this watch | decoded |
|---|---|---|---|---|---|
| 17 | none | device info and capability bitmap | 53 | see section 3 | project, IC type, flags |
| 20 | 02/12 | notification whitelist | 4 | `ff ff ff ff` | all apps enabled |
| 23 | 02/15 | screens shown (page config) | 2 | `ff ff` | all screens |
| 26 | 02/18 | function switches | 2 | `03 ff` | 12-hour, Fahrenheit (US settings) |
| 36 | 02/22 | **health monitor (automatic heart rate)** | **5** | `00 01e0 04ec` | **OFF**, 8:00 AM to 9:00 PM |
| 39 | 02/25 | sedentary reminder | 7 | `00 01e0 04ec 003c` | off, 8:00 AM to 9:00 PM, every 60 min |
| 42 | 02/28 | drink water reminder | 9 | `01 001e 0115 04ec 0000` | on, every 30 min |
| 45 | 02/2B | raise to wake | 9 | `01 0000 0000 0000 0000` | on, all day |
| 48 | 02/2E | blood pressure (not decoded) | 10 | all zero | unused (no BP sensor) |
| 72 | 02/46 | heart-rate alarm | 6 | `00 78 00 96 28 3c` | off, limits 120 / 150 high, 40 / 60 low |
| 78 | 02/4C | do not disturb | 6 | all zero | off |
| 89 | 02/57 | women's health | 10 | all zero | unused |
| 201 | none in SDK list | voice/Opus audio config | 15 | `01 02 00 02 00 05 03 00 00 04 00 0a 05 00 0d` | five entries; used by the SDK's Opus audio feature: the watch has a microphone/voice path |

Validation of rules 2 and 4 against this dump:
- **Every type equals its write key plus 2** (20 vs 02/12, 23 vs 02/15, 26 vs 02/18, 36 vs 02/22, 39 vs 02/25, 42 vs 02/28, 45 vs 02/2B, 48 vs 02/2E, 72 vs 02/46, 78 vs 02/4C, 89 vs 02/57).
- **Four blocks are missing, and each one's flag is OFF (flags predict absence):** blood-pressure alarm (type 75, flag 261 off), protection reminder (type 92, flag 273 off), hand washing (type 100, flag 277 off), screen vibrate (type 122, flag 17 off).
- **Not proof of presence:** the blood-pressure block (48) and do-not-disturb block (78) are reported even though their flags (2 and 264) are OFF.
- **Block length follows flags.** The health monitor block is 5 bytes here and 7 in the SDK; the 2 missing bytes are the interval field, whose flag (274) is OFF. The sedentary block is 7 bytes and its interval flag (275) is ON. This is the strongest check that the capability bitmap is read correctly.

**The most useful finding for the Health tab:** block 36 byte 0 is `00`, so the watch's automatic heart-rate monitoring is off. That is why the stored heart-rate history is empty. Turning it on should start filling types 3 and 4.

---

## 5. What the watch pushes by itself (events)

| key | payload | meaning | status |
|---|---|---|---|
| 02/1C | `[charging][bars][percent]` | battery report, about every 20 s while charging, also on wake | seen |
| 02/E5 | empty | screen woke | seen (with every wake) |
| 05/22 | 30 bytes | today totals (steps, meters, calories) | seen (about every 21 s, also on wake) |
| 05/24 | 11 bytes | live measurement stream, only during a 05/23 scan | seen |
| 02/CA | `06 03 [state] [..] [..]` | workout lifecycle: `06 03 01 d1 01` start, `... d1 02` later, `06 03 00 01 00` end | seen (Nov 1) |
| 02/92 | 1 byte, `01` then `02` | music widget handshake (per our registry) | seen twice during the workout, consistent with swiping to the music screen |
| 02/3C and 02/7C | | find phone started and finished | registry |
| 02/51 | | do-not-disturb toggled on the watch | registry |
| 04/20 | | call declined on the watch | registry |
| 07/01, 03, 04, 05 | | camera shutter, media keys, viewfinder open and close | registry |

Observation: the watch-pushed keys sit in the **gaps** of the SDK key list (0xE5, 0xCA, 0x92, 0x3C, 0x7C, 0x51 are all unused by the SDK's own sends). So the unused key gaps are largely watch-originated events plus the reserved triple slots. That means passive listening while the user operates the watch is a better survey method than sending commands.

---

## 6. Gaps in the key space

Computed from the SDK send list, then removing the reserved triple slots and the events above.
- **02/07 to 02/11** (11 keys in a row, just above time and alarms): core-era, probably old health/sensor settings replaced later by the config blocks.
- **02/1D to 02/1F, 02/31 to 02/35, 02/3C to 02/3F, 02/6D to 02/6F, 02/78 to 02/7A, 02/7F to 02/80:** small clusters near known features.
- **02/C5 to 02/D1:** holds known items (02/C8 dial-slot query, the config block types 201 and 208 at 0xC9 and 0xD0, the workout event at 0xCA); the rest is unknown. **02/EB to 02/EE and 02/F4 to 02/F9:** high-key clusters, likely newer or product-specific.
- **05/09 to 05/1F (23 keys), 05/33 to 05/40, 05/4A to 05/4F:** unused. The structure of 05 looks like: 0x0x sync items, 0x2x live measurement, 0x3x bulk transfer machinery (30 data, 32 confirm, 33), 0x4x status and latest values, 0x5x sleep and newer additions.
- **08/0C to 08/19 (14 in a row), 08/6B to 08/6E, 08/71 to 08/75, 08/77 to 08/81:** unused; group 08 is mostly other product lines.
- **cmd 06 and cmd 09 and up:** nothing in the SDK. Treat as reserved.

---

## 7. Predictions, ranked

Safety: **R** = read-only request (a query), **W** = writes a setting. Nothing here was sent. Test one at a time and show exact bytes first.

| # | prediction | why | test | safety |
|---|---|---|---|---|
| 1 | **Turning on auto heart rate (block 36, 02/22) fills stored heart rate (type 3) and oxygen (type 4).** Write key 02/22 with the current block, byte 0 changed: `00 01 e0 04 ec` to `01 01 e0 04 ec` | Rule 4 and the dump: monitor is off; types 3 and 4 are supported but empty | write, wait a few hours, run "Check every data type". The 5-byte length (no interval field) is inferred from flag 274 being OFF. Expect more battery use from the periodic sensor lights | W, small, reversible (write the old block back) |
| 2 | **Sleep data exists.** Sleep (flag 23 ON, new sleep protocol 268 ON) is tracked without the heart-rate monitor | the SDK has two sleep paths: sync type 2 and 05/50 with replies 05/51 to 05/57 | request 05/01 [02] (our sync reader) and 05/50 | R |
| 3 | **05/42 returns the latest stored health values** (latest HR and SpO2) | flag 265 REQUEST_LATEST_HEALTH is ON; rule 1 gives reply 05/43 | request 05/42 | R |
| 4 | **05/48 returns live workout status** (type, time, distance, heart rate) while a workout runs | flag SPORT ON; rule 1 gives reply 05/49 | request 05/48 during a workout | R |
| 5 | **02/E9 returns the current sport state** | SDK `requestSportState`; reply 02/EA by rule 1 | request 02/E9 before and during a workout | R |
| 6 | **Stored measure types exist at 129, 130, 135, 138, 144, 147 to 150** and any other id equal to a base id plus 128 | rule 5; flag MEASURE_DATA_SYNCABLE ON | extend "Check every data type" to these ids | R |
| 7 | **Per-setting reads work:** 02/13, 16, 19, 23, 26, 29, 2C, 2F, 47, 4A, 4D, 58, 5B, 63 each return that one block | rule 2 (alarms, schedules, weather and contacts already follow it) | request 02/13, expect reply 02/14 containing the whitelist | R |
| 8 | **Navigation (flag 521) is the only feature that could carry a heading**; a compass value will not appear anywhere else | no compass flag; barometer and GNSS have flags | watch for pushes while a navigation is active (needs a phone-side nav feed) | R |
| 9 | **GPS tracks (type 10) appear only for outdoor workouts with a fix** | GPS flag ON; the indoor walk produced none | repeat outdoors, then read type 10 | R |
| 10 | **Unknown pushes can be found by passive survey:** one capture while you open each watch app in turn (stopwatch, timer, music, camera, alarm, flashlight, weather, breathing, compass) lists the push key for each | events live in gaps (section 5) | record all frames, annotate with the app you opened | none (listening only) |

Items 2, 3, 4, 5, 6, 7 and 9 are all read-only and cheap. Item 1 is the one with real benefit for the Health tab.

---

## 8. Cautions (do not touch)

02/40 factory reset, 02/41 shutdown, 02/42 reboot, 02/65 to 66 device name, 02/5E to 5F device address, 02/3A language, 03/15 to 16 unbind, 01/01 DFU entry, 08/2A reset usage count. The page's firewall already blocks most of these. Also do not send 05/32 [00] (the "sync OK" confirm) unless we find out whether it makes the watch erase what it just sent.

---

## 9. How this changes the way we explore

1. Read the capability bitmap first (block 17). If the flag is OFF, skip the feature.
2. For an ON feature, find its commands in the catalog (appendix). The reply is request + 1.
3. Send the read request only. Show the bytes, get a go, send once, record everything.
4. For unknown pushes, listen instead of sending.
5. Write notes in `UNKNOWNS.md` and update this map.

---

## Appendix A: every command the SDK can send

237 cmd/key pairs mined from the decompiled SDK (the 05/01 [type] sync, config writes with computed keys (02/12 and others) and the 04/xx notification keys are not literal pairs in the SDK and are described above). "seen" marks keys used or observed on this watch.

| cmd/key | SDK name | role (pair) | on this watch |
|---|---|---|---|
| 01/01 | requestEnterDfu | request -> 01/02 | seen DANGEROUS |
| 01/02 | requestEnterDfu | reply <- 01/01 | seen DANGEROUS |
| 01/03 | setSubProjectNum | request -> 01/04 | seen |
| 01/04 | setSubProjectNum | reply <- 01/03 | seen |
| 02/01 | getSend | single | seen |
| 02/02 | (unnamed) | single |  |
| 02/03 | requestAlarms | request -> 02/04 |  |
| 02/04 | requestAlarms | reply <- 02/03 |  |
| 02/05 | (unnamed) | single |  |
| 02/06 | (unnamed) | single |  |
| 02/1b | requestBattery | request -> 02/1c | seen |
| 02/1c | requestBattery | reply <- 02/1b | seen |
| 02/20 | getSend | single | seen |
| 02/21 | getReceive | single | seen |
| 02/36 | (unnamed) | single | seen |
| 02/37 | syncData | request -> 02/38 |  |
| 02/38 | syncData | reply <- 02/37 |  |
| 02/39 | syncData | single |  |
| 02/3a | setLanguage | single | DANGEROUS |
| 02/3b | findDevice | single | seen |
| 02/40 | deviceReset | single | DANGEROUS |
| 02/41 | deviceShutdown | single | DANGEROUS |
| 02/42 | deviceReboot | single | DANGEROUS |
| 02/43 | requestUiInfo | request -> 02/44 |  |
| 02/44 | requestUiInfo | reply <- 02/43 |  |
| 02/50 | (unnamed) | single |  |
| 02/52 | requestDialPushInfo | request -> 02/53 |  |
| 02/53 | requestDialPushInfo | reply <- 02/52 |  |
| 02/54 | (unnamed) | single |  |
| 02/55 | protectedRun | single |  |
| 02/5e | setDeviceAddress | request -> 02/5f | DANGEROUS |
| 02/5f | setDeviceAddress | reply <- 02/5e | DANGEROUS |
| 02/60 | requestAssistInfo | request -> 02/61 | seen |
| 02/61 | requestAssistInfo | reply <- 02/60 |  |
| 02/65 | setDeviceName | request -> 02/66 | DANGEROUS |
| 02/66 | setDeviceName | reply <- 02/65 | DANGEROUS |
| 02/68 | setLockScreen | request -> 02/69 |  |
| 02/69 | setLockScreen | reply <- 02/68 |  |
| 02/6a | (unnamed) | single |  |
| 02/6b | requestSchedules | request -> 02/6c |  |
| 02/6c | requestSchedules | reply <- 02/6b |  |
| 02/71 | setAllowDeviceModifySchedule | single |  |
| 02/72 | requestSupportGameTypes | request -> 02/73 |  |
| 02/73 | requestSupportGameTypes | reply <- 02/72 |  |
| 02/74 | requestHighestGameRecords | request -> 02/75 |  |
| 02/75 | requestHighestGameRecords | reply <- 02/74 |  |
| 02/76 | requestGamePushInfo | request -> 02/77 |  |
| 02/77 | requestGamePushInfo | reply <- 02/76 |  |
| 02/7d | requestLcdShape | request -> 02/7e | seen |
| 02/7e | requestLcdShape | reply <- 02/7d | seen |
| 02/81 | requestSupportSportUiTypes | single |  |
| 02/82 | requestSportPushInfo | request -> 02/83 |  |
| 02/83 | requestSportPushInfo | reply <- 02/82 |  |
| 02/86 | release | single |  |
| 02/88 | setAudioDeviceName | request -> 02/89 |  |
| 02/89 | setAudioDeviceName | reply <- 02/88 |  |
| 02/8c | dismissNotification | single |  |
| 02/8d | setLockGame | request -> 02/8e |  |
| 02/8e | setLockGame | reply <- 02/8d |  |
| 02/90 | requestHighestGameRecords | request -> 02/91 |  |
| 02/91 | requestHighestGameRecords | reply <- 02/90 |  |
| 02/96 | replayHangUpSms | single |  |
| 02/99 | requestExerciseGoal | request -> 02/9a |  |
| 02/9a | requestExerciseGoal | reply <- 02/99 |  |
| 02/9d | accept,setAliAgentData | single |  |
| 02/a0 | requestSupportQrCodes | request -> 02/a1 |  |
| 02/a1 | requestSupportQrCodes | reply <- 02/a0 |  |
| 02/a2 | (unnamed) | single |  |
| 02/a3 | protectedRun | single |  |
| 02/a5 | requestLanguage | request -> 02/a6 |  |
| 02/a6 | requestLanguage | reply <- 02/a5 |  |
| 02/a7 | requestPowerSaveMode | request -> 02/a8 |  |
| 02/a8 | requestPowerSaveMode | reply <- 02/a7 |  |
| 02/ab | (unnamed) | single |  |
| 02/ae | release | request -> 02/af | seen |
| 02/af | release | reply <- 02/ae | seen |
| 02/b0 | release | request -> 02/b7 |  |
| 02/b2 | (unnamed) | single |  |
| 02/b3 | (unnamed) | single |  |
| 02/b4 | (unnamed) | single |  |
| 02/b7 | release | reply <- 02/b0 |  |
| 02/b9 | requestMedals | request -> 02/ba |  |
| 02/ba | requestMedals | reply <- 02/b9 |  |
| 02/bc | requestSupportScheduleTypes | request -> 02/bd |  |
| 02/bd | requestSupportScheduleTypes | reply <- 02/bc |  |
| 02/c0 | observerExitNavi | single |  |
| 02/c2 | requestAlbumShape | request -> 02/c3 |  |
| 02/c3 | requestAlbumShape | reply <- 02/c2 |  |
| 02/c4 | protectedRun | single |  |
| 02/d2 | sendErrorMsgToDevice | single |  |
| 02/d5 | getLieShengVersion | request -> 02/d6 |  |
| 02/d6 | getLieShengVersion | reply <- 02/d5 |  |
| 02/d8 | requestContactsEmergency | request -> 02/d9 |  |
| 02/d9 | requestContactsEmergency | reply <- 02/d8 |  |
| 02/db | protectedRun | single |  |
| 02/dd | getDeviceSnInfo | request -> 02/de |  |
| 02/de | getDeviceSnInfo | reply <- 02/dd |  |
| 02/e0 | stopFindDevice | single |  |
| 02/e1 | syncData | request -> 02/e2 |  |
| 02/e2 | syncData | reply <- 02/e1 |  |
| 02/e7 | getSend | single |  |
| 02/e8 | getReceive | single |  |
| 02/e9 | requestSportState | request -> 02/ea |  |
| 02/ea | requestSportState | reply <- 02/e9 |  |
| 02/ef | requestLyricColor | request -> 02/f0 |  |
| 02/f0 | requestLyricColor | reply <- 02/ef |  |
| 02/f2 | requestChargingLight | request -> 02/f3 |  |
| 02/f3 | requestChargingLight | reply <- 02/f2 |  |
| 02/fa | requestLaserState | request -> 02/fb |  |
| 02/fb | requestLaserState | reply <- 02/fa |  |
| 03/07 | (unnamed) | single |  |
| 03/15 | unbindUser | request -> 03/16 | DANGEROUS |
| 03/16 | unbindUser | reply <- 03/15 | DANGEROUS |
| 05/01 | protectedRun | single | seen |
| 05/05 | syncItem | request -> 05/06 |  |
| 05/06 | syncItem | reply <- 05/05 | seen |
| 05/20 | (unnamed) | single |  |
| 05/21 | syncData | request -> 05/22 |  |
| 05/22 | syncData | reply <- 05/21 | seen |
| 05/23 | (unnamed) | single | seen |
| 05/31 | protectedRun | single |  |
| 05/32 | apply | single |  |
| 05/41 | protectedRun | single |  |
| 05/42 | requestLatestHealthData | request -> 05/43 |  |
| 05/43 | requestLatestHealthData | reply <- 05/42 |  |
| 05/45 | (unnamed) | single |  |
| 05/48 | requestSportRealTimeStatus | request -> 05/49 |  |
| 05/49 | requestSportRealTimeStatus | reply <- 05/48 |  |
| 05/50 | protectedRun | single |  |
| 05/58 | protectedRun | single |  |
| 05/5b | apply,protectedRun | single |  |
| 07/02 | setCameraStatus | single |  |
| 07/09 | setPeripheralResponse | single |  |
| 07/0a | setPeripheralData | single |  |
| 08/01 | setGgUserInfo | request -> 08/02 |  |
| 08/02 | sendHijriData,setGgUserInfo | reply <- 08/01 |  |
| 08/03 | protectedRun | single |  |
| 08/05 | protectedRun | single |  |
| 08/06 | protectedRun | single |  |
| 08/09 | setTaskInfo | single |  |
| 08/0a | getTaskInfo | request -> 08/0b |  |
| 08/0b | getTaskInfo | reply <- 08/0a |  |
| 08/1a | getDeviceEUID | request -> 08/1b |  |
| 08/1b | getDeviceEUID | reply <- 08/1a |  |
| 08/1c | setPageTurningPresetIndex | single |  |
| 08/1d | getPageTurningPresetInfo | request -> 08/1e |  |
| 08/1e | getPageTurningPresetInfo | reply <- 08/1d |  |
| 08/1f | getUsageCountInfo | request -> 08/20 |  |
| 08/20 | getUsageCountInfo | reply <- 08/1f |  |
| 08/22 | getParentModeInfo | request -> 08/23 |  |
| 08/23 | getParentModeInfo | reply <- 08/22 |  |
| 08/2a | resetUsageCount | single | DANGEROUS |
| 08/2c | sendErrorMsgToDevice | single |  |
| 08/32 | setPrayerTimes | single |  |
| 08/34 | getPrayerSwitch | request -> 08/35 |  |
| 08/35 | getPrayerSwitch | reply <- 08/34 |  |
| 08/39 | setWorldClockList | single |  |
| 08/3a | requestWorldClockList | request -> 08/3b |  |
| 08/3b | requestWorldClockList | reply <- 08/3a |  |
| 08/3c | requestSupportLanguageList | request -> 08/3d |  |
| 08/3d | requestSupportLanguageList | reply <- 08/3c |  |
| 08/3e | getGameplayTimesInfo | request -> 08/3f |  |
| 08/3f | getGameplayTimesInfo | reply <- 08/3e |  |
| 08/46 | setFestivalBlessingTimes | single |  |
| 08/48 | getMoodConfig | request -> 08/49 |  |
| 08/49 | getMoodConfig | reply <- 08/48 |  |
| 08/4b | getClassRoomModeInfo | request -> 08/4c |  |
| 08/4c | getClassRoomModeInfo | reply <- 08/4b |  |
| 08/4d | onError | single |  |
| 08/4f | setContactsImage | request -> 08/50 |  |
| 08/50 | setContactsImage | reply <- 08/4f |  |
| 08/51 | getContactsImageMaxNumber | request -> 08/52 |  |
| 08/52 | getContactsImageMaxNumber | reply <- 08/51 |  |
| 08/53 | getEQCode | request -> 08/54 |  |
| 08/54 | getEQCode | reply <- 08/53 |  |
| 08/55 | setEQCode | request -> 08/56 |  |
| 08/56 | setEQCode | reply <- 08/55 |  |
| 08/58 | getNoiseReductionMode | request -> 08/59 |  |
| 08/59 | getNoiseReductionMode | reply <- 08/58 |  |
| 08/5a | setNoiseReductionMode | request -> 08/5b |  |
| 08/5b | setNoiseReductionMode | reply <- 08/5a |  |
| 08/5d | getLowDelayMode | request -> 08/5e |  |
| 08/5e | getLowDelayMode | reply <- 08/5d |  |
| 08/5f | setLowDelayMode | request -> 08/60 |  |
| 08/60 | setLowDelayMode | reply <- 08/5f |  |
| 08/62 | getEarphoneInfo | request -> 08/63 |  |
| 08/63 | getEarphoneInfo | reply <- 08/62 |  |
| 08/65 | getEarphoneVersionInfo | request -> 08/66 |  |
| 08/66 | getEarphoneVersionInfo | reply <- 08/65 |  |
| 08/67 | getFindEarphoneState | request -> 08/68 |  |
| 08/68 | getFindEarphoneState | reply <- 08/67 |  |
| 08/69 | findEarphone | request -> 08/6a |  |
| 08/6a | findEarphone | reply <- 08/69 |  |
| 08/6f | isSupportFindCase,release | request -> 08/70 |  |
| 08/70 | isSupportFindCase,release | reply <- 08/6f |  |
| 08/76 | requestAmulet | single |  |
| 08/82 | requestTaskRewardExchange | request -> 08/83 |  |
| 08/83 | requestTaskRewardExchange | reply <- 08/82 |  |
| 08/84 | getLockScreenInfo | request -> 08/85 |  |
| 08/85 | getLockScreenInfo | reply <- 08/84 |  |
| 08/87 | (unnamed) | single |  |
| 08/88 | getDeviceSnInfo | request -> 08/89 |  |
| 08/89 | getDeviceSnInfo | reply <- 08/88 |  |
| 08/8b | getOfflineSpeechState | request -> 08/8c |  |
| 08/8c | getOfflineSpeechState | reply <- 08/8b |  |
| 08/8f | getEarphoneBluetoothInfo | request -> 08/90 |  |
| 08/90 | getEarphoneBluetoothInfo | reply <- 08/8f |  |
| 08/91 | setHRVConfig | single |  |
| 08/92 | getHRVConfig | request -> 08/93 |  |
| 08/93 | getHRVConfig | reply <- 08/92 |  |
| 08/94 | syncData | request -> 08/95 |  |
| 08/95 | syncData | reply <- 08/94 |  |
| 08/9c | setTaxiInfo | single |  |
| 08/9d | release | request -> 08/9e |  |
| 08/9e | release | reply <- 08/9d |  |
| 08/9f | protectedRun | single |  |
| 08/a0 | protectedRun | single |  |
| 08/a1 | release | request -> 08/a2 |  |
| 08/a2 | release | reply <- 08/a1 |  |
| 08/a7 | test | request -> 08/a8 |  |
| 08/a8 | test | reply <- 08/a7 |  |
| 08/a9 | test | request -> 08/aa |  |
| 08/aa | test | reply <- 08/a9 |  |
| 08/ad | test | request -> 08/ae |  |
| 08/ae | test | reply <- 08/ad |  |
| 08/af | test | request -> 08/b0 |  |
| 08/b0 | test | reply <- 08/af |  |
| 08/b2 | accept | single |  |
| 08/b3 | stopChatTranslate | single |  |
| 08/b6 | apply | request -> 08/b7 |  |
| 08/b7 | apply | reply <- 08/b6 |  |
| 08/b8 | clearUGreenDanMu | single |  |
| 08/b9 | addUGreenDanMu | single |  |
| 08/ba | setOpusRecordBitrate | single |  |
| 08/bb | release | single |  |
| 08/be | getUGreenConfig | request -> 08/bf |  |
| 08/bf | getUGreenConfig | reply <- 08/be |  |
