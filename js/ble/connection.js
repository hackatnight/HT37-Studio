/**
 * @file     js/ble/connection.js
 * @layer    Bluetooth
 * @summary  Pair, discover, bind and post-bind sync; Stop button.
 *
 * ROLE
 *   - #btnConnectBle: requestDevice({acceptAllDevices:true, optionalServices: OPTIONAL_SERVICES}) → GATT
 *     connect (8 s) → discoverServicesAndSubscribe() → runBindSequence().
 *   - discoverServicesAndSubscribe(): enumerates services/characteristics, starts notifications (handler:
 *     handleBleNotification) and picks cmdChar / dfuPacketChar.
 *   - runBindSequence(): sends UserBind 0x03/0x11 with a 32-byte padded id; the user must tap ✓ on the watch.
 *     The watch answers 0x03/0x12 = [00] which ble/notifications.js turns into bindConfirmed and
 *     onPostBindConnected().
 *   - onPostBindConnected(): writes 0x02/0x12 (alert whitelist FF FF FF FF), then reads 0x02/0x20 (config),
 *     0x1B (battery), 0x60 (sport UI), 0xC8 (dial slots), waiting for each ACK.
 *   - #btnStopBle: sets abortBleOperation; stops a running transfer, otherwise disconnects GATT.
 *
 * PROVIDES (globals)
 *   function discoverServicesAndSubscribe, function runBindSequence, function onPostBindConnected
 *
 * USES (defined in other files)
 *   - js/ble/state.js: abortBleOperation, allWritableChars, bindConfirmed, bleDevice, bleServer, cmdChar,
 *     dfuPacketChar, isTransferRunning
 *   - js/dfu/bin-compiler.js: setDfuProgress
 *   - js/core/log.js: log, withTimeout
 *   - js/protocol/constants.js: OPTIONAL_SERVICES
 *   - js/ble/notifications.js: handleBleNotification
 *   - js/ble/frames.js: buildFitCloudFrame
 *   - js/ble/transport.js: enqueueBleWrite, waitForAck
 *
 * DOM IDS TOUCHED
 *   #bleDot #bleStatusText #btnConnectBle #btnStopBle
 *
 * LOAD ORDER
 *   #30 of 62, section "5. BLUETOOTH  (state, frame codec, write queue, connect/bind, notifications)"
 *   after: js/ble/transport.js   before: js/ble/notifications.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
document.getElementById('btnStopBle').addEventListener('click', () => {
  if (isTransferRunning) {
    abortBleOperation = true; isTransferRunning = false;
    setDfuProgress(null);
    log('🛑 Stopped active BLE probe / stream loop!', 'err');
    return;
  }
  abortBleOperation = true;
  if (bleDevice && bleDevice.gatt.connected) {
    bleDevice.gatt.disconnect();
    log('🛑 Disconnected from HT37 watch GATT server.', 'err');
  } else log('Watch is already disconnected.', 'tx');
});

document.getElementById('btnConnectBle').addEventListener('click', async () => {
  log('--- [Pair & Bind Watch Clicked] ---', 'tx');
  abortBleOperation = false;
  if (!navigator.bluetooth) return log('ERROR: Web Bluetooth not available. Use Chrome/Edge over HTTPS or localhost.', 'err');
  try {
    if (!bleServer || !bleServer.connected) {
      log('Opening browser Bluetooth chooser (Select HT37)...');
      bleDevice = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: OPTIONAL_SERVICES });
      log(`Selected BLE Device: Name="${bleDevice.name || 'HT37'}", ID="${bleDevice.id}"`, 'ok');
      bleDevice.addEventListener('gattserverdisconnected', () => {
        abortBleOperation = true; isTransferRunning = false;
        setDfuProgress(null);
        document.getElementById('bleDot').classList.remove('connected', 'bound');
        document.getElementById('bleStatusText').textContent = 'BLE Disconnected';
        log('⚠️ Watch disconnected from GATT server.', 'err');
      });
      log('State: PRE_CONNECTING -> Connecting to GATT Server...');
      bleServer = await withTimeout(bleDevice.gatt.connect(), 8000, 'GATT Connect');
      document.getElementById('bleDot').classList.add('connected');
      document.getElementById('bleStatusText').textContent = `${bleDevice.name || 'HT37'} PRE_CONNECTING`;
      await discoverServicesAndSubscribe();
    }
    if (cmdChar) await runBindSequence();
  } catch (err) { log(`BLE Pair/Bind Error: ${err.message || err}`, 'err'); }
});

async function discoverServicesAndSubscribe() {
  abortBleOperation = false;          // a reconnect must not keep the old abort flag, or every write is silently dropped
  cmdChar = null; dfuPacketChar = null; allWritableChars = [];
  const services = await withTimeout(bleServer.getPrimaryServices(), 6000, 'getPrimaryServices');
  log(`Discovered ${services.length} primary service(s):`);
  for (const svc of services) {
    const sUuid = svc.uuid.toLowerCase();
    log(`  • Service: ${sUuid}`);
    const isGeneric = sUuid.startsWith('00001800') || sUuid.startsWith('00001801') || sUuid.startsWith('0000180a');
    if (isGeneric) continue;
    const chars = await withTimeout(svc.getCharacteristics(), 4000, 'getCharacteristics');
    for (const ch of chars) {
      const cUuid = ch.uuid.toLowerCase();
      const props = ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate'].filter((p) => ch.properties[p]);
      log(`    - Char: ${cUuid} [${props.join(', ').toUpperCase()}]`);
      if (ch.properties.notify || ch.properties.indicate) {
        try {
          await withTimeout(ch.startNotifications(), 3500, `startNotifications(${cUuid.slice(0, 8)})`);
          ch.addEventListener('characteristicvaluechanged', handleBleNotification);
          log(`      ✓ Subscribed to notifications on ${cUuid.slice(0, 8)}`, 'rx');
        } catch (e) { log(`      ! Notify subscribe skipped on ${cUuid.slice(0, 8)}: ${e.message}`, 'err'); }
      }
      if (ch.properties.write || ch.properties.writeWithoutResponse) {
        allWritableChars.push(ch);
        if (cUuid.includes('ff02') || (sUuid.includes('01ff') && !cmdChar)) cmdChar = ch;
        if (cUuid.includes('ffb1') || sUuid.includes('9966')) {
          dfuPacketChar = ch;
          log(`      ⭐ Bound IC_568X OTA Data Pipe TX Char: ${cUuid.slice(0, 8)} (Service 9966)`, 'ok');
        } else if (!cUuid.includes('ff02') && !dfuPacketChar) {
          dfuPacketChar = ch;
        }
      }
    }
  }
  if (!cmdChar && allWritableChars.length > 0) cmdChar = allWritableChars[0];
  if (!dfuPacketChar) dfuPacketChar = cmdChar;
  log(`Assigned Command Char: ${cmdChar?.uuid.slice(0, 8) || 'NONE'} | DFU Packet Char: ${dfuPacketChar?.uuid.slice(0, 8) || 'NONE'}`, 'ok');
}

async function runBindSequence() {
  if (!bleServer || !bleServer.connected || !cmdChar) return log('ERROR: Watch is not connected.', 'err');
  abortBleOperation = false; bindConfirmed = false;
  document.getElementById('bleStatusText').textContent = `${bleDevice?.name || 'HT37'} PRE_CONNECTED (Tap ✓ on Watch!)`;
  log('=== State: PRE_CONNECTED — Sending 32-Byte UserBind Request (Cmd=0x03, Key=0x11) ===', 'ok');
  const strUid = Array.from(new TextEncoder().encode('probe-user-01'));
  const padded32Uid = [...strUid, ...new Array(32 - strUid.length).fill(0)];
  const { frame, seq } = buildFitCloudFrame(0x03, 0x11, padded32Uid, 0x00);
  await enqueueBleWrite(cmdChar, frame, `BindUser(0x03/0x11-32B) seq=${seq}`);
  await waitForAck(seq, 600);
  log('👉 Look at your HT37 watch and tap the green ✓ Checkmark! Waiting for confirmation...', 'ok');
}

async function onPostBindConnected() {
  abortBleOperation = false;
  log('=== Running Post-Bind Sync: EnableAlerts (0x12), ReadAllConfig (0x20), Battery (0x1B), Sport/UI (0x60), DialSlots (0xC8) ===', 'ok');
  await new Promise((r) => setTimeout(r, 250));
  for (const item of [
    { key: 0x12, val: [0xff, 0xff, 0xff, 0xff], name: 'WriteAlertSwitch(0x02/0x12)' },
    { key: 0x20, val: [0x01], name: 'ReadAllConfig(0x02/0x20)' },
    { key: 0x1b, val: [], name: 'ReadBattery(0x02/0x1B)' },
    { key: 0x60, val: [], name: 'ReadSportUiConfig(0x02/0x60)' },
    { key: 0xc8, val: [], name: 'ReadDialSlots(0x02/0xC8)' }
  ]) {
    const { frame, seq } = buildFitCloudFrame(0x02, item.key, item.val, 0x00);
    await enqueueBleWrite(cmdChar, frame, `${item.name} seq=${seq}`);
    await waitForAck(seq, 500);
    await new Promise((r) => setTimeout(r, 150));
  }
  // After pairing: put the computer's date and time on the watch, then read the watch's own values (battery, steps, distance, calories)
  // so every readout in the tool starts from the real watch. Only the time is written; steps, heart rate and weather are never pushed from here.
  try {
    if (typeof syncWatchClockQuiet === 'function') { log('🕒 Setting the watch clock from this computer...', 'ok'); await syncWatchClockQuiet('after pairing'); }
    await new Promise((r) => setTimeout(r, 300));
    if (window.HT37 && HT37.liveData && typeof HT37.liveData.pullNow === 'function') { log('📥 Reading the watch values (battery, steps, distance, calories)...', 'ok'); await HT37.liveData.pullNow(); }
  } catch (e) { log('Post-pairing sync skipped: ' + (e.message || e), 'warn'); }
}
