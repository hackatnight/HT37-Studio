/**
 * @file     js/protocol/explorer-presets.js
 * @layer    Protocol data (no DOM)
 * @summary  The 43 preset commands behind the "KNOWN COMMANDS" dropdown of the Master Command Station (Tab 2, tool 0).
 *
 * ROLE
 *   - GROUPS = [{ group, items: [{ cmd, key, payload, title, desc, label, selected? }] }]; cmd/key are "0x.."
 *     strings, payload is space-separated hex ("" = none).
 *   - toOptionsHTML() emits <optgroup>/<option> markup. Each option value is the string
 *     cmd|key|payload|title|desc — consumers split it on "|".
 *   - Consumers: pages/alerts/tool-0-master-command.js (fills #…cmdSelect via toOptionsHTML and splits the
 *     value into the CMD/KEY/PAYLOAD fields) and protocol/explorer-runtime.js (loadExplorerPreset).
 *
 * REGISTERS
 *   - HT37.presets
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *
 * LOAD ORDER
 *   #3 of 62, section "1. NAMESPACE + PROTOCOL DATA  (pure data, no DOM access)"
 *   after: js/protocol/command-registry.js   before: js/protocol/constants.js
 *
 * HOW TO EXTEND
 *   - New preset: add an item to the right group (or a new group). Do not put "|" inside any field.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
// Each preset is one <option> of the "KNOWN COMMANDS" dropdown in Tab 2 / Master Command Station.
//   cmd / key   : Topstep command + register key bytes (hex strings, '0x' prefixed)
//   payload     : default payload as space-separated hex ('' = none)
//   title       : long label shown in the prediction box title
//   desc        : what the watch is expected to do (shown in the prediction box)
//   label       : text shown in the dropdown
//   selected    : true on the entry that is preselected
// The dropdown value is  cmd|key|payload|title|desc  (the master station splits it on '|').
HT37.presets = (function () {
  const GROUPS = [
  {
    group: '⌚ Dial Slots & Watch Faces (0x02/0x70)',
    items: [
      { cmd: '0x02', key: '0x70', payload: '00', title: '🎨 02/70=[00] Switch to Dial Slot 0', desc: 'Swaps active watch face to Slot 0 (Default).', label: '🎨 02/70=[00] WF 0 (Default Slot)' },
      { cmd: '0x02', key: '0x70', payload: '01', title: '🎨 02/70=[01] Switch to Dial Slot 1', desc: 'Swaps active watch face to Slot 1.', label: '🎨 02/70=[01] WF 1' },
      { cmd: '0x02', key: '0x70', payload: '02', title: '🎨 02/70=[02] Switch to Dial Slot 2', desc: 'Swaps active watch face to Slot 2.', label: '🎨 02/70=[02] WF 2' },
      { cmd: '0x02', key: '0x70', payload: '03', title: '🎨 02/70=[03] Switch to Dial Slot 3', desc: 'Swaps active watch face to Slot 3.', label: '🎨 02/70=[03] WF 3' },
      { cmd: '0x02', key: '0x70', payload: '04', title: '🎨 02/70=[04] Switch to Dial Slot 4', desc: 'Swaps active watch face to Slot 4.', label: '🎨 02/70=[04] WF 4' },
      { cmd: '0x02', key: '0x70', payload: '05', title: '🎨 02/70=[05] Switch to Dial Slot 5', desc: 'Swaps active watch face to Slot 5.', label: '🎨 02/70=[05] WF 5' },
      { cmd: '0x02', key: '0xC8', payload: '', title: '🗂️ 02/C8 Query All Dial Slots', desc: 'Reads active and installed dial slot map.', label: '🗂️ 02/C8 Query Dial Slots' },
    ]
  },
  {
    group: '🏃 Health & Activity Records (Cmd 0x03)',
    items: [
      { cmd: '0x03', key: '0x01', payload: '', title: '🏃 03/01 Sync Live Steps & Activity', desc: 'Asks watch to dump current live step counter, calories, and distance.', label: '🏃 03/01 Sync Live Steps & Activity' },
      { cmd: '0x03', key: '0x02', payload: '', title: '📊 03/02 Sync Hourly Steps Data', desc: 'Requests hourly activity records stored in watch flash.', label: '📊 03/02 Sync Hourly Steps Data' },
      { cmd: '0x03', key: '0x03', payload: '', title: '💤 03/03 Sync Sleep Analysis', desc: 'Requests deep/light sleep duration records.', label: '💤 03/03 Sync Sleep Analysis' },
      { cmd: '0x03', key: '0x04', payload: '', title: '❤️ 03/04 Sync Heart Rate Records', desc: 'Requests recent heart rate measurement logs from watch.', label: '❤️ 03/04 Sync Heart Rate Records' },
      { cmd: '0x03', key: '0x06', payload: '', title: '🩸 03/06 Sync SpO2 Records', desc: 'Requests blood oxygen spot checks stored on watch.', label: '🩸 03/06 Sync SpO2 Records' },
    ]
  },
  {
    group: '📞 Telephony Commands (Cmd 0x04)',
    items: [
      { cmd: '0x04', key: '0x01', payload: '', title: '📞 04/01 Incoming Call Ring', desc: 'Fires incoming call ringing popup with contact name.', label: '📞 04/01 Incoming Call Ring' },
      { cmd: '0x04', key: '0x02', payload: '', title: '☎️ 04/02 End Call / Hangup', desc: 'Dismisses active call popup on watch screen.', label: '☎️ 04/02 End Call (Hangup)' },
      { cmd: '0x04', key: '0x03', payload: '', title: '🔇 04/03 Mute Call', desc: 'Mutes vibration / audio ring on watch.', label: '🔇 04/03 Mute Call' },
    ]
  },
  {
    group: '💬 Social & App Notifications (Cmd 0x04)',
    items: [
      { cmd: '0x04', key: '0x04', payload: '', title: '💬 04/04 SMS Alert', desc: 'Fires SMS notification popup with text payload.', label: '💬 04/04 SMS' },
      { cmd: '0x04', key: '0x05', payload: '', title: '🐧 04/05 QQ Alert', desc: 'Fires QQ app notification.', label: '🐧 04/05 QQ' },
      { cmd: '0x04', key: '0x06', payload: '', title: '🟢 04/06 WeChat Alert', desc: 'Fires WeChat notification.', label: '🟢 04/06 WeChat' },
      { cmd: '0x04', key: '0x07', payload: '', title: '📘 04/07 Facebook Alert', desc: 'Fires Facebook notification.', label: '📘 04/07 Facebook' },
      { cmd: '0x04', key: '0x08', payload: '', title: '𝕏 04/08 Twitter / X Alert', desc: 'Fires Twitter/X notification.', label: '𝕏 04/08 Twitter / X' },
      { cmd: '0x04', key: '0x09', payload: '', title: '💼 04/09 LinkedIn Alert', desc: 'Fires LinkedIn notification.', label: '💼 04/09 LinkedIn' },
      { cmd: '0x04', key: '0x0A', payload: '', title: '📸 04/0A Instagram Alert', desc: 'Fires Instagram notification.', label: '📸 04/0A Instagram' },
      { cmd: '0x04', key: '0x0B', payload: '', title: '🔔 04/0B System Notice Alert', desc: 'Fires generic system notice popup.', label: '🔔 04/0B System Notice' },
      { cmd: '0x04', key: '0x0C', payload: '', title: '📲 04/0C WhatsApp Alert', desc: 'Fires WhatsApp notification.', label: '📲 04/0C WhatsApp' },
      { cmd: '0x04', key: '0x0D', payload: '', title: '🟢 04/0D LINE Alert', desc: 'Fires LINE notification.', label: '🟢 04/0D LINE (Default)', selected: true },
      { cmd: '0x04', key: '0x0E', payload: '', title: '💬 04/0E Messenger Alert', desc: 'Fires Facebook Messenger notification.', label: '💬 04/0E Messenger' },
      { cmd: '0x04', key: '0x0F', payload: '', title: '💛 04/0F KakaoTalk Alert', desc: 'Fires KakaoTalk notification.', label: '💛 04/0F KakaoTalk' },
      { cmd: '0x04', key: '0x10', payload: '', title: '🌐 04/10 Skype Alert', desc: 'Fires Skype notification.', label: '🌐 04/10 Skype' },
      { cmd: '0x04', key: '0x11', payload: '', title: '✉️ 04/11 Email Alert', desc: 'Fires Email notification.', label: '✉️ 04/11 Email' },
      { cmd: '0x04', key: '0x12', payload: '', title: '✈️ 04/12 Telegram Alert', desc: 'Fires Telegram notification.', label: '✈️ 04/12 Telegram' },
      { cmd: '0x04', key: '0x13', payload: '', title: '💜 04/13 Viber Alert', desc: 'Fires Viber notification.', label: '💜 04/13 Viber' },
      { cmd: '0x04', key: '0x15', payload: '', title: '👻 04/15 Snapchat Alert', desc: 'Fires Snapchat notification.', label: '👻 04/15 Snapchat' },
    ]
  },
  {
    group: '⚙️ Device Registers & Settings (Cmd 0x01 / 0x02)',
    items: [
      { cmd: '0x02', key: '0x20', payload: '01', title: '📋 02/20=[01] Master Config & Register Dump', desc: 'Triggers the full 164B hardware register dump (SoC, FW, MAC, Dials).', label: '📋 02/20 Master Config & Register Dump' },
      { cmd: '0x02', key: '0x3B', payload: '01', title: '🔊 02/3B=[01] Find Watch Chime & Screen Alert', desc: 'Fires the internal audio amplifier chime and lights screen.', label: '🔊 02/3B Find Watch Chime' },
      { cmd: '0x02', key: '0x18', payload: '03 EB', title: '🕒 02/18=[03 EB] Set 24H Clock + °C Units', desc: 'Writes unit mode to 24-hour time and Celsius.', label: '🕒 02/18 Set 24H + °C Units' },
      { cmd: '0x02', key: '0x18', payload: '03 EF', title: '🕒 02/18=[03 EF] Set 12H Clock + °C Units', desc: 'Writes unit mode to 12-hour time and Celsius.', label: '🕒 02/18 Set 12H + °C Units' },
      { cmd: '0x02', key: '0x03', payload: '10 27 00 00', title: '🎯 02/03=[10 27 00 00] Set Step Goal (10,000)', desc: 'Writes 10k daily step target; watch returns Key=0x04 ACK.', label: '🎯 02/03 Set Step Goal (10k)' },
      { cmd: '0x01', key: '0x03', payload: '', title: '🎯 01/03 Query Step Goal Status', desc: 'Queries step target; verified to return Key=0x04=[01].', label: '🎯 01/03 Query Step Goal Status' },
      { cmd: '0x01', key: '0x01', payload: '', title: '📱 01/01 Query Firmware / OTA Status', desc: 'Queries firmware state; verified to return Key=0x02=[00 00].', label: '📱 01/01 Query Firmware / OTA Status' },
      { cmd: '0x01', key: '0x15', payload: '', title: '📄 01/15 Read Screen / Page Display List', desc: 'Reads the active page bitmask (Write=0x15).', label: '📄 01/15 Read Active Screen Pages' },
    ]
  },
  {
    group: '📡 Telemetry Streaming & Optical Probes (Cmd 0x06)',
    items: [
      { cmd: '0x06', key: '0x01', payload: '01', title: '📡 06/01=[01] Live PPG Stream (Cmd=0x06)', desc: 'Probes the dedicated live telemetry stream bus.', label: '📡 06/01=[01] Live Stream Bus' },
      { cmd: '0x06', key: '0x02', payload: '01', title: '📡 06/02=[01] Live Sensor Stream (Cmd=0x06)', desc: 'Probes secondary sensor stream channel.', label: '📡 06/02=[01] Live Sensor Channel' },
    ]
  },
  {
    group: '🌤️ Weather Telemetry Presets (Cmd 0x02)',
    items: [
      { cmd: '0x02', key: '0x36', payload: '16 10 1A 01 01 01 01', title: '🌤️ 02/36 Push Weather 22°C Sunny', desc: 'Broadcasts full current weather telemetry payload.', label: '🌤️ 02/36 Push Weather 22°C Sunny' },
    ]
  },
  ];
  // Builds the <optgroup>/<option> markup for the dropdown. Values are intentionally NOT escaped (they never contain
  // quotes/angle brackets; the legacy markup relied on the browser's tolerant parsing of '&').
  function toOptionsHTML() {
    return GROUPS.map((g) =>
      '<optgroup label="' + g.group + '">' +
      g.items.map((i) => '<option value="' + [i.cmd, i.key, i.payload, i.title, i.desc].join('|') + '"' + (i.selected ? ' selected' : '') + '>' + i.label + '</option>').join('') +
      '</optgroup>').join('');
  }
  return { groups: GROUPS, toOptionsHTML };
})();
