/**
 * @file     js/commands/dial-slots.js
 * @layer    Commands
 * @summary  Watch-face (dial) slot switching: 0x02/0x70=[slot].
 *
 * ROLE
 *   - activateWatchDialSlot() reads #dialSlotSelect; switchWatchfaceByIndex(i) sets it then activates.
 *
 * PROVIDES (globals)
 *   function switchWatchfaceByIndex, function activateWatchDialSlot
 *
 * USES (defined in other files)
 *   - js/ble/state.js: abortBleOperation, bleServer, cmdChar
 *   - js/core/log.js: log
 *   - js/ble/frames.js: buildFitCloudFrame
 *   - js/ble/transport.js: enqueueBleWrite
 *
 * DOM IDS TOUCHED
 *   #dialSlotSelect
 *
 * LOAD ORDER
 *   #34 of 62, section "6. WATCH COMMANDS  (alerts, weather, dial slots, explorer console)"
 *   after: js/commands/weather.js   before: js/protocol/explorer-runtime.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
async function switchWatchfaceByIndex(slotIdx) {
  const sel = document.getElementById('dialSlotSelect');
  if (sel) sel.value = String(slotIdx);
  await activateWatchDialSlot();
}

async function activateWatchDialSlot() {
  if (!cmdChar || !bleServer || !bleServer.connected) return log('ERROR: Connect & Bind to the watch first.', 'err');
  abortBleOperation = false;
  const slot = Number(document.getElementById('dialSlotSelect').value);
  log(`🎨 Switching Active Watchface on HT37 to Watchface #${slot} (Verified Cmd=0x02, Key=0x70, Val=[0${slot}])...`, 'ok');
  const { frame, seq } = buildFitCloudFrame(0x02, 0x70, [slot & 0xff], 0x00);
  await enqueueBleWrite(cmdChar, frame, `SwitchWatchface(0x02/0x70=[0${slot}]) seq=${seq}`);
}
