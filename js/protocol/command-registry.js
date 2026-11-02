/**
 * @file     js/protocol/command-registry.js
 * @layer    Protocol data (no DOM)
 * @summary  Single source of truth for outbound watch commands, inbound watch events and reserved alert keys.
 *
 * ROLE
 *   - HT37_COMMAND_REGISTRY = [{ id, cmd, key, name, cat, desc, defaultPayload?, isDangerous?, ui? }]. `cmd`
 *     and `key` are the two header bytes of the L2 frame (see PROTOCOL.md). cat = system | action | dial |
 *     query | sensor | alert.
 *   - A 0x04 entry that carries `ui` = { icon, btn, cls, optIcon, opt, selected? } AUTO-GENERATES its Tab-2
 *     alert button and its "Send Icon" dropdown row (see ui/pool-generators.js).
 *   - HT37_RESERVED_ALERT_KEYS = notification keys known to exist but unassigned on HT37 firmware (0x14,
 *     0x16-0x1C). They appear only in the "Send Icon" dropdown.
 *   - HT37_EVENT_REGISTRY = { "0xCMD_0xKEY": { name, desc, actionMap? } } describing inbound (watch→app)
 *     frames, with upper-case hex.
 *   - Lookup helpers: HT37.getCommand(id), HT37.getEvent(cmd,key), HT37.formatEvent(cmd,key,valBytes).
 *
 * PROVIDES (globals)
 *   window. HT37_COMMAND_REGISTRY, window. HT37_EVENT_REGISTRY, window. HT37_RESERVED_ALERT_KEYS, window. HT37
 *
 * LOAD ORDER
 *   #2 of 62, section "1. NAMESPACE + PROTOCOL DATA  (pure data, no DOM access)"
 *   after: js/core/namespace.js   before: js/protocol/explorer-presets.js
 *
 * NOTES
 *   - HT37_EVENT_REGISTRY / getEvent / formatEvent are DEFINED BUT NOT CALLED anywhere (true of the original
 *     monolith too). The RX path (ble/notifications.js) logs raw frames and decodes a few keys by hand. To get
 *     labeled inbound frames, call HT37.formatEvent(cmdId, keyId, valBytes) inside checkReassemblyComplete().
 *   - commands/alerts.js accepts either a registry id string ('ALERT_SMS') or a numeric key and resolves
 *     strings with HT37.getCommand().
 *
 * HOW TO EXTEND
 *   - New outbound command: add one row to HT37_COMMAND_REGISTRY.
 *   - New notification icon (cmd 0x04): add a row WITH a `ui` block; the button and dropdown entry appear
 *     automatically.
 *   - New inbound frame label: add a "0xCMD_0xKEY" entry to HT37_EVENT_REGISTRY.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
/**
 * ============================================================================
 * 📋 HT37 MASTER PROTOCOL REGISTRY (ht37-commands.js)
 * ============================================================================
 * Single Source of Truth for all Outbound Commands and Inbound Watch Events.
 *
 * 🛠️ HOW TO ADD NEW COMMANDS & EVENTS AS THEY ARE DISCOVERED:
 * ----------------------------------------------------------------------------
 * 1. OUTBOUND COMMAND (App -> Watch):
 *    Add an entry to `HT37_COMMAND_REGISTRY` below:
 *    {
 *      id: 'MY_COMMAND_ID', // Unique string ID
 *      cmd: 0x02,           // Topstep Cmd (0x01=GET, 0x02=SET, 0x04=ALERT, 0x05=DATA, 0x07=MEDIA)
 *      key: 0xXX,           // Register key byte
 *      name: 'Human Name',
 *      cat: 'system' | 'alert' | 'sensor' | 'dial' | 'query',
 *      desc: 'What this command does',
 *      defaultPayload: [...] // Default byte array (optional)
 *    }
 *
 * 2. INBOUND EVENT (Watch -> App):
 *    Add an entry to `HT37_EVENT_REGISTRY` below:
 *    '0xCMD_0xKEY': {
 *      name: 'Event Title',
 *      desc: 'What user action or hardware state occurred',
 *      actionMap: { 1: 'Action A', 2: 'Action B' } // Optional byte-to-label map
 *    }
 * ============================================================================
 */

(function (window) {
  'use strict';

  // --- OUTBOUND COMMAND REGISTRY (App -> Watch) ---
  // Entries with an `ui` field also generate a button in Tab 2 (Social/Telephony) and an option in the "Send Icon"
  // dropdown (see js/ui/pool-generators.js). ui = { icon, btn (button text), cls (button style), optIcon, opt (dropdown text) }.
  const HT37_COMMAND_REGISTRY = [
    // === SYSTEM, TIME & SETTINGS (Cmd: 0x02) ===
    { id: 'SYNC_TIME_6B',        cmd: 0x02, key: 0x01, name: 'Sync Time RTC (6B)',        cat: 'system', desc: 'Sets watch RTC clock and resets midnight step counter' },
    { id: 'ENABLE_ALERTS',       cmd: 0x02, key: 0x12, name: 'Master Alert Whitelist',    cat: 'system', desc: 'Writes [FF FF FF FF] mask so all notifications display', defaultPayload: [0xFF, 0xFF, 0xFF, 0xFF] },
    { id: 'SET_UNITS_24H_C',     cmd: 0x02, key: 0x18, name: 'Units: 24H + °C',           cat: 'system', desc: 'Function switch bank 0x03=0xEB', defaultPayload: [0x03, 0xEB] },
    { id: 'SET_UNITS_12H_C',     cmd: 0x02, key: 0x18, name: 'Units: 12H + °C',           cat: 'system', desc: 'Function switch bank 0x03=0xEF', defaultPayload: [0x03, 0xEF] },
    { id: 'PUSH_WEATHER_7B',     cmd: 0x02, key: 0x36, name: 'Push Weather (7B)',         cat: 'system', desc: 'Pushes sky code and temperatures to complications' },
    { id: 'PUSH_WEATHER_DIRECT', cmd: 0x02, key: 0x4C, name: 'Direct Weather Register',   cat: 'system', desc: 'WARNING mislabeled: per the vendor SDK 02/4C writes the Do-Not-Disturb config (dump type 0x4E), not weather. Do not send. See docs/APP_COMMANDS.md.', isDangerous: true },
    { id: 'SET_ALARMS',          cmd: 0x02, key: 0x02, name: 'Set Alarms',                cat: 'system', desc: 'VERIFIED Nov 1 2026. Writes the whole alarm list (up to 5): [len][packed date/time/id][enabled|repeat][label]. Empty payload clears. Tool: Tab 2 > Watch Settings.' },
    { id: 'SET_DRINK_WATER',     cmd: 0x02, key: 0x28, name: 'Set Drink Water Reminder',  cat: 'system', desc: 'VERIFIED Nov 1 2026 (reminder fired, vibrated). 9 bytes: [on][interval u16 min, 30-180][start u16 min][end u16 min][2 unknown, 00 00]. Tool: Tab 2 > Watch Settings.' },
    { id: 'SET_SEDENTARY',      cmd: 0x02, key: 0x25, name: 'Set Sedentary Reminder',    cat: 'system', desc: 'VERIFIED Nov 1 2026 (chair icon + vibration). 7 bytes: [flags bit0 on][start u16 min][end u16 min][interval u16 min, 10 min or more]. Tool: Tab 2 > Watch Settings.' },
    { id: 'READ_ALARMS',        cmd: 0x02, key: 0x03, name: 'Read Alarms',               cat: 'query',  desc: 'VERIFIED Nov 1 2026. Watch replies on 0x02/0x04 with the alarm list (empty = 00). Tool: Tab 2 > Watch Settings.', defaultPayload: [] },
    { id: 'FIND_WATCH_CHIME',    cmd: 0x02, key: 0x3B, name: 'Find Watch Chime',          cat: 'action', desc: 'Fires speaker chime and lights display', defaultPayload: [0x01] },
    { id: 'FACTORY_RESET',       cmd: 0x02, key: 0x40, name: 'Factory Reset',             cat: 'system', desc: 'Beeps and erases user flash (DANGEROUS)', isDangerous: true },
    { id: 'SWITCH_DIAL_SLOT',    cmd: 0x02, key: 0x70, name: 'Switch Dial Slot',          cat: 'dial',   desc: 'Swaps active watchface index [slotId]' },
    { id: 'SET_STEP_GOAL_10K',   cmd: 0x02, key: 0x03, name: 'Set Step Goal (10,000)',    cat: 'system', desc: 'UNVERIFIED label: per the vendor SDK 02/03 is Request Alarms (reply 02/04); the step goal is 02/06. Kept for history.', defaultPayload: [0x10, 0x27, 0x00, 0x00] },

    // === VERIFIED HARDWARE & TELEMETRY QUERIES (Cmd: 0x02 / 0x01) ===
    { id: 'MASTER_CONFIG_DUMP',  cmd: 0x02, key: 0x20, name: 'Master Config Dump',        cat: 'query',  desc: 'Triggers 164B hardware register table dump; watch replies on 0x02/0x21', defaultPayload: [0x01] },
    { id: 'QUERY_BATTERY_STATE', cmd: 0x02, key: 0x1B, name: 'Query Battery State',       cat: 'query',  desc: 'Queries charging, bars, and battery percent; watch replies on 0x02/0x1C', defaultPayload: [] },
    { id: 'QUERY_LCD_SPEC',      cmd: 0x02, key: 0x7D, name: 'Query LCD Panel Spec',      cat: 'query',  desc: 'Queries 360x360 resolution and LCD type 3; watch replies on 0x02/0x7E', defaultPayload: [0x01] },
    { id: 'QUERY_FLASH_SPACE',   cmd: 0x02, key: 0xAE, name: 'Query Dial Flash Boundary',  cat: 'query',  desc: 'Queries dial flash base and 524KB max size; watch replies on 0x02/0xAF', defaultPayload: [0x01] },
    { id: 'QUERY_STEP_GOAL_STAT',cmd: 0x01, key: 0x03, name: 'Query Step Goal Status',    cat: 'query',  desc: 'Queries active step goal; watch replies on 0x01/0x04', defaultPayload: [] },
    { id: 'QUERY_OTA_PRECHECK',  cmd: 0x01, key: 0x01, name: 'Query OTA / Firmware State',cat: 'query',  desc: 'Queries bootloader/firmware state; watch replies on 0x01/0x02', defaultPayload: [] },

    // === SENSORS & OPTICAL PPG (Cmd: 0x05) ===
    { id: 'PPG_LEDS_START',      cmd: 0x05, key: 0x23, name: 'Start Optical PPG LEDs',    cat: 'sensor', desc: 'Activates green optical PPG LEDs on back of watch', defaultPayload: [0x01, 0x00] },
    { id: 'PPG_LEDS_STOP',       cmd: 0x05, key: 0x23, name: 'Stop Optical PPG LEDs',     cat: 'sensor', desc: 'Deactivates green optical PPG LEDs on back of watch', defaultPayload: [0x00, 0x00] },
    { id: 'SYNC_TODAY_SUMMARY',  cmd: 0x05, key: 0x06, name: 'Sync Today Summary',        cat: 'sensor', desc: 'Requests today total steps, active kcal, and distance', defaultPayload: [0x00] },

    // === NOTIFICATIONS & ALERTS (Cmd: 0x04) ===
    { id: 'ALERT_CALL',          cmd: 0x04, key: 0x01, name: 'Incoming Call Alert',       cat: 'alert',  desc: 'Continuous vibration + caller prompt', ui: { icon: '📞', btn: 'Call', cls: 'primary', optIcon: '📞', opt: 'Incoming Call' } },
    { id: 'ALERT_CALL_END',      cmd: 0x04, key: 0x02, name: 'End / Dismiss Call',        cat: 'alert',  desc: 'Dismisses incoming call vibration', ui: { icon: '☎️', btn: 'End Call', cls: 'danger', optIcon: '☎️', opt: 'Dismiss Call' } },
    { id: 'ALERT_CALL_MUTE',     cmd: 0x04, key: 0x03, name: 'Mute Ringing Call',         cat: 'alert',  desc: 'Mutes call vibration without rejecting', ui: { icon: '🔇', btn: 'Mute', cls: '', optIcon: '🔇', opt: 'Mute Call' } },
    { id: 'ALERT_SMS',           cmd: 0x04, key: 0x04, name: 'SMS Text Message',          cat: 'alert',  desc: 'SMS icon + sender & body struct', ui: { icon: '💬', btn: 'SMS', cls: 'success', optIcon: '💬', opt: 'SMS Text' } },
    { id: 'ALERT_QQ',            cmd: 0x04, key: 0x05, name: 'QQ Notice',                 cat: 'alert',  desc: 'QQ icon notification', ui: { icon: '🐧', btn: 'QQ', cls: '', optIcon: '🐧', opt: 'QQ Notice' } },
    { id: 'ALERT_WECHAT',        cmd: 0x04, key: 0x06, name: 'WeChat Notice',             cat: 'alert',  desc: 'WeChat green icon notification', ui: { icon: '🟢', btn: 'WeChat', cls: '', optIcon: '🟢', opt: 'WeChat Notice' } },
    { id: 'ALERT_FACEBOOK',      cmd: 0x04, key: 0x07, name: 'Facebook Notice',           cat: 'alert',  desc: 'Facebook blue icon notification', ui: { icon: '📘', btn: 'Facebook', cls: '', optIcon: '📘', opt: 'Facebook' } },
    { id: 'ALERT_TWITTER',       cmd: 0x04, key: 0x08, name: 'X / Twitter Notice',        cat: 'alert',  desc: 'X / Twitter icon notification', ui: { icon: '𝕏', btn: 'Twitter/X', cls: '', optIcon: '𝕏', opt: 'Twitter / X' } },
    { id: 'ALERT_LINKEDIN',      cmd: 0x04, key: 0x09, name: 'LinkedIn Notice',           cat: 'alert',  desc: 'LinkedIn icon notification', ui: { icon: '💼', btn: 'LinkedIn', cls: '', optIcon: '💼', opt: 'LinkedIn' } },
    { id: 'ALERT_INSTAGRAM',     cmd: 0x04, key: 0x0A, name: 'Instagram Notice',          cat: 'alert',  desc: 'Instagram icon notification', ui: { icon: '📸', btn: 'Instagram', cls: '', optIcon: '📸', opt: 'Instagram' } },
    { id: 'ALERT_GENERIC',       cmd: 0x04, key: 0x0B, name: 'General App Notice',        cat: 'alert',  desc: 'Generic bell notice icon', ui: { icon: '🔔', btn: 'Notice', cls: '', optIcon: '🔔', opt: 'App Notice' } },
    { id: 'ALERT_WHATSAPP',      cmd: 0x04, key: 0x0C, name: 'WhatsApp Notice',           cat: 'alert',  desc: 'WhatsApp icon notification', ui: { icon: '📲', btn: 'WhatsApp', cls: '', optIcon: '📲', opt: 'WhatsApp' } },
    { id: 'ALERT_LINE',          cmd: 0x04, key: 0x0D, name: 'LINE Notice',               cat: 'alert',  desc: 'LINE icon notification', ui: { icon: '🟢', btn: 'LINE', cls: '', optIcon: '🟢', opt: 'LINE', selected: true } },
    { id: 'ALERT_MESSENGER',     cmd: 0x04, key: 0x0E, name: 'FB Messenger Notice',    cat: 'alert',  desc: 'Messenger icon notification', ui: { icon: '💬', btn: 'Messenger', cls: '', optIcon: '💬', opt: 'FB Messenger' } },
    { id: 'ALERT_KAKAOTALK',     cmd: 0x04, key: 0x0F, name: 'KakaoTalk Notice',          cat: 'alert',  desc: 'KakaoTalk icon notification', ui: { icon: '💛', btn: 'KakaoTalk', cls: '', optIcon: '💛', opt: 'KakaoTalk (TALK)' } },
    { id: 'ALERT_SKYPE',         cmd: 0x04, key: 0x10, name: 'Skype Notice',              cat: 'alert',  desc: 'Skype icon notification', ui: { icon: '🌐', btn: 'Skype', cls: '', optIcon: '🌐', opt: 'Skype' } },
    { id: 'ALERT_EMAIL',         cmd: 0x04, key: 0x11, name: 'Email Notice',              cat: 'alert',  desc: 'Email letter envelope icon', ui: { icon: '✉️', btn: 'Email', cls: '', optIcon: '✉️', opt: 'Email' } },
    { id: 'ALERT_TELEGRAM',      cmd: 0x04, key: 0x12, name: 'Telegram Notice',           cat: 'alert',  desc: 'Telegram paper airplane icon', ui: { icon: '✈️', btn: 'Telegram', cls: '', optIcon: '✈️', opt: 'Telegram' } },
    { id: 'ALERT_VIBER',         cmd: 0x04, key: 0x13, name: 'Viber Notice',              cat: 'alert',  desc: 'Viber purple phone icon', ui: { icon: '💜', btn: 'Viber', cls: '', optIcon: '💜', opt: 'Viber' } },
    { id: 'ALERT_SNAPCHAT',      cmd: 0x04, key: 0x15, name: 'Snapchat Notice',           cat: 'alert',  desc: 'Snapchat ghost icon', ui: { icon: '👻', btn: 'Snapchat', cls: '', optIcon: '👻', opt: 'Snapchat' } }
    // ➕ ADD NEW OUTBOUND COMMANDS HERE
  ];

  // Notification keys that exist in the 0x04 range but have no verified icon (shown in the "Send Icon" dropdown only).
  const HT37_RESERVED_ALERT_KEYS = [
    { key: '0x14', icon: '🚫', label: 'Unassigned (No Op)' },
    { key: '0x16', icon: '🚫', label: 'TikTok / Unused' },
    { key: '0x17', icon: '🚫', label: 'YouTube / Unused' },
    { key: '0x18', icon: '🚫', label: 'Calendar / Unused' },
    { key: '0x19', icon: '🚫', label: 'iOS Mail / Unused' },
    { key: '0x1a', icon: '🚫', label: 'DingTalk / Unused' },
    { key: '0x1b', icon: '🚫', label: 'Alipay / Unused' },
    { key: '0x1c', icon: '🚫', label: 'Taobao / Unused' },
  ];

  // --- INBOUND EVENT REGISTRY (Watch -> App) ---
  const HT37_EVENT_REGISTRY = {
    // === SYSTEM & HARDWARE REPLIES (Cmd: 0x02) ===
    '0x02_0x1C': { name: 'Battery: Status Report',         desc: 'Watch reported live battery percent, bars, and charging status' },
    '0x02_0x7E': { name: 'LCD: Display Geometry Spec',      desc: 'Watch reported LCD Type 3, 360x360 resolution' },
    '0x02_0xAF': { name: 'Flash: Storage Boundary Spec',    desc: 'Watch reported dial flash base sector and 524KB max boundary' },
    '0x02_0x21': { name: 'System: Master Config Dump',      desc: 'Watch dumped 164B register table (SoC, FW, MAC, Dials)' },
    '0x02_0x3C': { name: 'Find Phone: Triggered',          desc: 'User tapped Find Phone on watch; play alarm on host' },
    '0x02_0x7C': { name: 'Find Phone: Finished',           desc: 'Find Phone timed out or was dismissed' },
    '0x02_0x51': { name: 'DND: Toggle Notice',             desc: 'User toggled Do Not Disturb in watch quick settings' },
    '0x02_0xE5': { name: 'Alert: Display Active',          desc: 'Watch screen woke up with active alert prompt' },

    // === SPORTS & WORKOUT ENGINE (Cmd: 0x02, Key: 0xCA) ===
    '0x02_0xCA': {
      name: 'Sport: Workout Session Event',
      desc: 'Workout lifecycle state transition',
      actionMap: { 0: 'Stopped / Ended', 1: 'Running / Active', 2: 'Paused' }
    },

    // === MEDIA & HOST REMOTE BUS (Cmd: 0x07 & 0x02) ===
    '0x02_0x92': { name: 'Media: Widget Handshake Ping',   desc: 'Watch entered Music widget; requested current playback state' },
    '0x07_0x04': { name: 'Camera: Viewfinder Opened',      desc: 'Watch entered camera mode; open viewfinder on host' },
    '0x07_0x01': { name: 'Camera: Shutter Pressed',        desc: 'User tapped shutter on watch; capture photo!' },
    '0x07_0x05': { name: 'Camera: Closed',                 desc: 'Watch exited camera mode; close viewfinder on host' },
    '0x07_0x03': {
      name: 'Media: Action Triggered',
      desc: 'Watch sent media control button',
      actionMap: { 1: 'Pause', 2: 'Play', 3: 'Next Track', 4: 'Prev Track', 5: 'Vol Up', 6: 'Vol Down' }
    },

    // === TELEPHONY & ALERTS (Cmd: 0x04) ===
    '0x04_0x20': { name: 'Call: User Declined',            desc: 'User pressed End Call on watch touchscreen' }
    // ➕ ADD NEW INCOMING WATCH EVENTS HERE
  };

  // --- HELPER LOOKUP FUNCTIONS ---
  function getWatchCommand(id) {
    return HT37_COMMAND_REGISTRY.find(cmd => cmd.id === id) || null;
  }

  function getWatchEvent(cmd, key) {
    const hexCmd = '0x' + (Number(cmd) || 0).toString(16).padStart(2, '0').toUpperCase();
    const hexKey = '0x' + (Number(key) || 0).toString(16).padStart(2, '0').toUpperCase();
    return HT37_EVENT_REGISTRY[`${hexCmd}_${hexKey}`] || null;
  }

  function formatWatchEvent(cmd, key, valBytes = []) {
    const evt = getWatchEvent(cmd, key);
    if (!evt) return null;
    let extra = '';
    const testByte = (key === 0xCA || key === '0xCA' || key === 'CA') && valBytes.length >= 5
      ? valBytes[valBytes.length - 1]
      : (valBytes.length > 0 ? valBytes[0] : null);

    if (evt.actionMap && testByte !== null && evt.actionMap[testByte] !== undefined) {
      extra = ` -> State: ${evt.actionMap[testByte]}`;
    }
    return `[${evt.name}] ${evt.desc}${extra}`;
  }

  window.HT37_COMMAND_REGISTRY = HT37_COMMAND_REGISTRY;
  window.HT37_EVENT_REGISTRY = HT37_EVENT_REGISTRY;
  window.HT37_RESERVED_ALERT_KEYS = HT37_RESERVED_ALERT_KEYS;
  window.HT37 = Object.assign(window.HT37 || {}, {
    commands: HT37_COMMAND_REGISTRY,
    events: HT37_EVENT_REGISTRY,
    reservedAlertKeys: HT37_RESERVED_ALERT_KEYS,
    getCommand: getWatchCommand,
    getEvent: getWatchEvent,
    formatEvent: formatWatchEvent
  });

})(typeof window !== 'undefined' ? window : this);
