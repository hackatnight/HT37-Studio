# App command reference (from the vendor SDK, static analysis only)

Source: the FitCloud SDK library (sdk-fitcloud-v3.0.2.7.aar from the vendor's open FitCloudPro-SDK-Android repo), decompiled with jadx. Nothing here was sent to the watch. Everything is UNTESTED on hardware until a line says otherwise. Packet builders live in `v2/protocol/a.java` (most commands), `v2/features/g.java` (settings), `v2/features/j.java` (alerts). Frame notation: cmd/key, hex. Times are minutes since midnight (0-1439) as big-endian u16. Multi-byte values are big-endian.

## 1. How the watch settings work
- Reading: send 02/20 (our "Master Config Dump"). The reply 02/21 is a stream of blocks `[type u8][len u8][data]`, starting with type 17 (device info) and then the config blocks below. So a read-only Settings panel needs no new command; it only needs to parse the dump we already request.
- Writing: send cmd 02, key = type - 2 (type 122 is the exception: key 123), payload = the whole config block (full size, so read first and change only the fields you mean to change).
- Some settings are only accepted if the watch reports the feature (device info feature flags); unsupported ones return an error in the app.

## 2. Config blocks (dump type -> write key, size, layout)
| Setting | dump type | write 02/key | bytes | layout |
|---|---|---|---|---|
| Notification whitelist | 20 (0x14) | 02/12 | varies | bit flags per app, see section 3 (our "Master Alert Whitelist" writes FF FF FF FF) |
| Page (screens shown) | 23 (0x17) | 02/15 | 2 | bit flags, section 3 |
| Function switches | 26 (0x1A) | 02/18 | 2 | bit flags, section 3 (our "Units" presets write [03 EB] / [03 EF] here) |
| Health monitor | 36 (0x24) | 02/22 | 7 | [on][start u16][end u16][interval u16] |
| Sedentary reminder | 39 (0x27) | 02/25 | 7 | [flags: bit0 on, bit1 DND-in-period][start u16][end u16][interval u16] |
| Drink water | 42 (0x2A) | 02/28 | 9 | [on][interval u16][start u16][end u16][2 more bytes unknown] |
| Raise-to-wake (turn wrist lighting) | 45 (0x2D) | 02/2B | 9 | [on][start u16][end u16][4 more bytes unknown] |
| Blood pressure | 48 (0x30) | 02/2E | 10 | not decoded yet |
| Heart-rate alarm | 72 (0x48) | 02/46 | 6 | [static on][static high][dynamic on][dynamic high][static low][dynamic low] |
| Blood-pressure alarm | 75 (0x4B) | 02/49 | 5 | [on][SBP high][SBP low][DBP high][DBP low] |
| Do not disturb | 78 (0x4E) | 02/4C | 6 | [all-day on][period on][start u16][end u16] |
| Women's health | 89 (0x59) | 02/57 | 10 | not decoded yet |
| Protection reminder | 92 (0x5C) | 02/5A | 7 | [on][interval u16][start u16][end u16] (decompiler shows setEnd writing bytes 3-4; check) |
| Hand-washing reminder | 100 (0x64) | 02/62 | 7 | same layout as protection reminder (same check) |
| Screen vibrate | 122 (0x7A) | 02/7B | 38 | not decoded yet |

Also in the SDK but not decoded: HRV, mood, isolate monitor, extension config.

## 3. Bit flags (bit index from the end of the block)
- Function config (2 bytes): 0 wear way (left/right wrist), 1 enhanced measurement, 2 time format (12/24h), 3 length unit (km/mi), 4 temperature unit (C/F), 5 weather display, 6 disconnect reminder, 7 exercise goal display, 8 weight unit, 9 apparent temperature unit. Our presets only ever set 03 EB / 03 EF, which write the whole 2-byte block; this table gives the individual bits so we can offer real switches (US default: 12 h, miles, F).
- Page config (2 bytes): 0 time, 1 steps, 2 distance, 3 calories, 4 sleep, 5 heart rate, 6 oxygen, 7 blood pressure, 8 weather, 9 find phone, 10 ID, 13 stopwatch.
- Notification config: 0 telephony, 1 SMS, 2 QQ, 3 WeChat, 4 Facebook, 5 Twitter, 6 LinkedIn, 7 Instagram, 8 Pinterest, 9 WhatsApp, 10 LINE, 11 Messenger, 12 Kakao, 13 Skype, 14 Email, 15 Telegram, 16 Viber, 17 Calendar, 18 Snapchat, 19 Hike, 20 YouTube, 21 Apple Music, 22 Zoom, 23 TikTok, 24 Gmail, 25 Outlook, 26 WhatsApp Business, 27 Fastrack, 28 Titan, 29 GPay, 30 Amazon, 31 other apps, 32 PhonePe, 33 Hinge, 34 Flipkart, 35 MyNtra.

## 4. Alarms, contacts, alerts
- Alarms: write 02/02, payload is the alarms back to back, each `[len=labelLen+5][b1][b2][b3][b4][b5][label up to 32 bytes]`. Fields are bit-packed: year-2000 (6 bits), month 1-12 (4), day (5), hour (5), minute (6), alarm id (3), then byte 5 = enabled (bit 7) | repeat mask (low bits). Exact packing is in `protocol/a.java` `a(FcAlarm)`. Read alarms: 02/03 -> reply 02/04.
- Schedules (calendar events): write 02/6A, read 02/6B -> 02/6C.
- Contacts: write 02/54 in chunks of up to 277 bytes: first byte = total contact count, then per contact `[index][numLen][number max 20][nameLen][name max 32]`. Read: 02/55.
- Alerts (cmd 04): payload for devices that report feature 267 (the "new protocol", which our tool sends and the watch accepts) is `[nameLen][name max 64][contentLen u16][content up to 240-nameLen]`. Older devices use `[name 20 bytes space padded][contentLen u16][content up to 221]`. Our Snapchat test used the new format with the sender "HT37 Studio" and the watch showed the icon and text but not the sender. The format matches the SDK, so the difference is probably how the watch UI treats the name for non-call alert types. Tested Nov 1 2026: the same payload as SMS (04/04) displayed 'HT37 Studio: COOL' and vibrated, so the watch shows the name for SMS but not for Snapchat (04/15) or WhatsApp (04/0C). Other types still to test.

## 5. Corrections to our own registry
- `PUSH_WEATHER_DIRECT` (02/4C, "Direct Weather Register ... paired with read 0x4E") looks wrong: in the SDK 02/4C writes the do-not-disturb config (dump type 0x4E). Weather is 02/36 only. Do not send 02/4C until the label is fixed and the payload is a valid DND block.
- `ENABLE_ALERTS` (02/12, FF FF FF FF) writes the notification whitelist: fine, but it enables every app at once.
- The 02/70 dial-slot command and the watch-originated events in HT37_EVENT_REGISTRY are not in the SDK's list; they came from our own probing.

## 6. All commands the SDK sends with a fixed cmd/key
(`yes` = the same cmd/key already exists somewhere in our tool.)
Names come from the SDK method that builds the packet; config writes (section 2) and alerts (cmd 04) use computed keys, so they are not in this table.

| cmd/key | SDK method | in our tool |
|---|---|---|
| 01/01 | requestEnterDfu | yes |
| 01/02 | requestEnterDfu | yes |
| 01/03 | setSubProjectNum | yes |
| 01/04 | setSubProjectNum | yes |
| 02/01 | c | yes |
| 02/02 | a |  |
| 02/03 | requestAlarms | yes |
| 02/04 | requestAlarms |  |
| 02/05 | a |  |
| 02/06 | a |  |
| 02/1B | requestBattery | yes |
| 02/1C | requestBattery | yes |
| 02/20 | getSend | yes |
| 02/21 | getReceive | yes |
| 02/36 | a | yes |
| 02/37 | a |  |
| 02/38 | a |  |
| 02/39 | syncData |  |
| 02/3A | setLanguage |  |
| 02/3B | findDevice | yes |
| 02/40 | deviceReset | yes |
| 02/41 | deviceShutdown |  |
| 02/42 | deviceReboot |  |
| 02/43 | requestUiInfo |  |
| 02/44 | requestUiInfo |  |
| 02/50 | b |  |
| 02/52 | requestDialPushInfo |  |
| 02/53 | requestDialPushInfo |  |
| 02/54 | a |  |
| 02/55 | protectedRun |  |
| 02/5E | setDeviceAddress |  |
| 02/5F | setDeviceAddress |  |
| 02/60 | requestAssistInfo |  |
| 02/61 | requestAssistInfo |  |
| 02/65 | setDeviceName |  |
| 02/66 | setDeviceName |  |
| 02/68 | setLockScreen |  |
| 02/69 | setLockScreen |  |
| 02/6A | b |  |
| 02/6B | requestSchedules |  |
| 02/6C | requestSchedules |  |
| 02/71 | setAllowDeviceModifySchedule |  |
| 02/72 | requestSupportGameTypes |  |
| 02/73 | requestSupportGameTypes |  |
| 02/74 | requestHighestGameRecords |  |
| 02/75 | requestHighestGameRecords |  |
| 02/76 | requestGamePushInfo |  |
| 02/77 | requestGamePushInfo |  |
| 02/7D | requestLcdShape | yes |
| 02/7E | requestLcdShape | yes |
| 03/07 | a |  |
| 03/15 | unbindUser |  |
| 03/16 | unbindUser |  |
| 05/01 | protectedRun |  |
| 05/05 | d |  |
| 05/06 | d | yes |
| 05/20 | b |  |
| 05/21 | a | yes |
| 05/22 | a |  |
| 05/23 | a | yes |
| 05/31 | protectedRun |  |
| 05/32 | b |  |
| 05/41 | a |  |
| 05/42 | requestLatestHealthData |  |
| 05/43 | requestLatestHealthData |  |
| 05/45 | a |  |
| 05/48 | requestSportRealTimeStatus |  |
| 05/49 | requestSportRealTimeStatus |  |
| 05/50 | protectedRun |  |
| 05/58 | protectedRun |  |
| 05/5B | b |  |
| 07/02 | setCameraStatus |  |
| 07/09 | setPeripheralResponse |  |
| 07/0A | setPeripheralData |  |
| 08/01 | setGgUserInfo |  |
| 08/02 | setGgUserInfo |  |
| 08/03 | a |  |
| 08/05 | b |  |
| 08/06 | b |  |
| 08/09 | setTaskInfo |  |
| 08/0A | getTaskInfo |  |
| 08/0B | getTaskInfo |  |
| 08/1A | getDeviceEUID |  |
| 08/1B | getDeviceEUID |  |
| 08/1C | setPageTurningPresetIndex |  |
| 08/1D | getPageTurningPresetInfo |  |
| 08/1E | getPageTurningPresetInfo |  |
| 08/1F | getUsageCountInfo |  |
| 08/20 | getUsageCountInfo |  |
| 08/22 | getParentModeInfo |  |
| 08/23 | getParentModeInfo |  |
| 08/2A | resetUsageCount |  |
| 08/2C | sendErrorMsgToDevice |  |
| 08/32 | setPrayerTimes |  |
| 08/34 | getPrayerSwitch |  |
| 08/35 | getPrayerSwitch |  |
| 08/39 | setWorldClockList |  |
| 08/3A | requestWorldClockList |  |
| 08/3B | requestWorldClockList |  |
| 08/3C | requestSupportLanguageList |  |
| 08/3D | requestSupportLanguageList |  |
| 08/3E | getGameplayTimesInfo |  |
| 08/3F | getGameplayTimesInfo |  |
| 08/46 | setFestivalBlessingTimes |  |
| 08/48 | getMoodConfig |  |
| 08/49 | getMoodConfig |  |
| 08/4B | getClassRoomModeInfo |  |
| 08/4C | getClassRoomModeInfo |  |
| 08/4D | c |  |
| 08/4F | setContactsImage |  |
| 08/50 | setContactsImage |  |
| 08/51 | b |  |
| 08/52 | b |  |
| 08/53 | getEQCode |  |
| 08/54 | getEQCode |  |
| 08/55 | setEQCode |  |
| 08/56 | setEQCode |  |
| 08/58 | getNoiseReductionMode |  |
| 08/59 | getNoiseReductionMode |  |
| 08/5A | setNoiseReductionMode |  |
| 08/5B | setNoiseReductionMode |  |
| 08/5D | getLowDelayMode |  |
| 08/5E | getLowDelayMode |  |
| 08/5F | setLowDelayMode |  |
| 08/60 | setLowDelayMode |  |
| 08/62 | getEarphoneInfo |  |
| 08/63 | getEarphoneInfo |  |
| 08/65 | getEarphoneVersionInfo |  |
| 08/66 | getEarphoneVersionInfo |  |
| 08/67 | getFindEarphoneState |  |
| 08/68 | getFindEarphoneState |  |
| 08/69 | findEarphone |  |
| 08/6A | findEarphone |  |
| 08/6F | b |  |
| 08/70 | b |  |
| 08/76 | requestAmulet |  |

## 7. Suggested home for each feature (see AI_GUIDE.md placement rule)
- Watch Settings panel in Tab 2 Diagnostics, built from the dump: units and 12/24h switches, raise-to-wake, do not disturb, sedentary, drink water, hand washing, protection, heart-rate and blood-pressure alarms, health monitor, page list, notification whitelist, alarms, contacts, schedules. Read first, show current values, write only the changed block, keep a copy of the old block to restore.
- Health history (05/xx): a viewer tool, later.
- Face editor: nothing here; the face tools live in the dial/DialPush code (separate analysis).
- Leave alone: 01/xx (DFU / firmware), 02/40 reset, 02/41 shutdown, 02/42 reboot, 02/5E device address, 02/65 device name, 03/15 unbind.

## 8. Verified on the real watch (Nov 1 2026)
- Config dump 02/20 -> 02/21: layout above confirmed; this watch reports types 17, 20, 23, 26, 36, 39, 42, 48, 45, 72, 78, 89 and 201 (0xC9). Hand washing (100), protection (92), BP alarm (75) and screen vibrate (122) are NOT reported, so they are probably unsupported. Health monitor reports 5 bytes here (no interval).
- Current function config read as [03 FF]: 12 h, miles, F (bit 2 = 12 h, bit 4 = F per our earlier presets).
- Alarms: 02/03 -> 02/04 (empty list = one 00 byte). Write 02/02 `09 6A C2 45 40 80 54 45 53 54` = one-time alarm "TEST" 4:21 AM Nov 1: rang at the minute and cleared itself. Tool: Tab 2 > Watch Settings. Max 5 alarms (ids 0-4); repeat bits Mon=1 ... Sun=64.
- Sedentary reminder 02/25: `01 00 F0 04 EC 00 0A` (on, 04:00-21:00, 10 min). Watch kept those values on readback, ignored interval 1 (kept 60), and ~10 minutes later showed a chair icon and vibrated. Tool: Tab 2 > Watch Settings.
- Drink water 02/28: `01 00 1E 01 15 04 EC 00 00` (on, every 30 min, from 04:37 to 21:00) accepted and read back. NOT yet seen to fire (expected 04:37 if it starts at the From time). SDK interval limit is 30-180 min.
- 02/12 notification whitelist reads FF FF FF FF; page config (02/15) reads FF FF.
- Opus audio service 0000aa55-... : NOT present on this watch. Nov 1 2026: after Pair & Bind with the UUID in OPTIONAL_SERVICES, the watch exposed only two GATT services (00009966 OTA and 000001ff commands). Feature flags say PLAY_OPUS (610) and SPEECH_SCO (590) but not SPEECH_AI/RECOGNITION, so the voice assistant button most likely uses classic Bluetooth call audio (SCO/HFP), which Web Bluetooth cannot reach. js/pages/alerts/tool-5-watch-audio.js is kept (it reports the service as unavailable) in case another watch has it.

## 9. Audio over classic Bluetooth (verified Nov 1 2026)
The watch has no BLE audio service (aa55). Pair it in Windows Bluetooth settings: it appears as 'HT37 Hands-Free AG Audio' (headset, mic + speaker). Chrome getUserMedia with that deviceId records the watch microphone (verified by ear). Playing to the watch speaker uses audio.setSinkId on the headset output (not yet verified).
