/**
 * @file     js/pages/alerts/tool-0-master-command.js
 * @layer    UI mount
 * @summary  Tab 2 tool 0 "Master Command Station": preset dropdown, CMD/KEY/PAYLOAD fields, Send, quick actions.
 *
 * ROLE
 *   - Dropdown options come from HT37.presets.toOptionsHTML(); selecting one splits
 *     "cmd|key|payload|title|desc" into the three inputs and the prediction box.
 *   - Send: cmd 04 → sendWatchAlert(key, text); anything else → buildFitCloudFrame + enqueueBleWrite. Also
 *     Enable All Alerts, Find Watch Chime, ALL TEST (excludes Reset) and an isolated ⚠️ Reset (02/40).
 *
 * REGISTERS
 *   - ui.registerMount(id:alerts.tool0, page:alerts, order:210)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: ctx
 *   - js/commands/alerts.js: sendWatchAlert
 *   - js/ble/frames.js: buildFitCloudFrame
 *   - js/ble/transport.js: enqueueBleWrite
 *   - js/ble/state.js: abortBleOperation, cmdChar
 *   - js/core/log.js: log
 *
 * DOM IDS TOUCHED
 *   #btnAdvanceMasterNext #btnSendMasterCmd #masterCmdId #masterCmdPayload #masterCmdPrediction #masterKeyId
 *   #selAllKnownCommands #toolCard_0_alerts
 *
 * LOAD ORDER
 *   #51 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/pages/alerts/toolbox.js   before: js/pages/alerts/tool-1-telephony.js
 *
 * NOTES
 *   - The cmd 02 / key 36|37 branch calls sendWeather(), which is not defined anywhere, so it is a silent no-op
 *     behind a typeof guard (the weather tool 3 uses pushWeatherToWatch instead).
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerMount({
  id: 'alerts.tool0',
  page: 'alerts',
  order: 210,
  title: '0. Master Command Station (preset dropdown + CMD/KEY/PAYLOAD + Send + Enable All / Chime / ALL TEST / Reset)',
  run(ctx) {
    const { makeToolCard } = ctx;
    const { alertsToolbox, allButtons, alertBody } = ctx.shared;   // handed over by an earlier unit of this page
    if (!alertBody) return;               // same condition the old monolith wrapped around this block
    // TOOL 0: Master Command Station (With 3 Custom Command Fields: CMD, KEY, PAYLOAD)
    if (!document.getElementById('toolCard_0_alerts')) {
      const body0A = document.createElement('div');
      body0A.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin:0; padding:0;';

      // 1. Label
      const lbl = document.createElement('label');
      lbl.style.cssText = 'font-size:10px; font-weight:700; color:#38bdf8; text-transform:uppercase; margin:0; display:block;';
      lbl.textContent = 'KNOWN COMMANDS (MASTER REGISTRY)';
      body0A.appendChild(lbl);

      // 2. Master Dropdown (All 43 Verified Commands)
      const cmdSelect = document.createElement('select');
      cmdSelect.id = 'selAllKnownCommands';
      cmdSelect.style.cssText = 'width:100% !important; height:28px !important; background:#111827 !important; color:#e2e8f0 !important; border:1px solid #334155 !important; font-size:11px !important; padding:4px 6px !important; margin:0 !important; box-sizing:border-box !important;';
      cmdSelect.innerHTML = HT37.presets.toOptionsHTML();
      body0A.appendChild(cmdSelect);

      // 3. The 3 Custom Command Fields: CMD, KEY, PAYLOAD
      const fieldsRow = document.createElement('div');
      fieldsRow.style.cssText = 'display:flex; gap:6px; width:100%; box-sizing:border-box; margin:0;';

      // Field 1: CMD
      const colCmd = document.createElement('div');
      colCmd.style.cssText = 'width:62px; display:flex; flex-direction:column; gap:2px;';
      colCmd.innerHTML = '<label style="font-size:9px; color:#94a3b8; font-weight:700;">CMD (0x)</label>';
      const inputCmd = document.createElement('input');
      inputCmd.type = 'text';
      inputCmd.id = 'masterCmdId';
      inputCmd.value = '04';
      inputCmd.maxLength = 4;
      inputCmd.style.cssText = 'width:100%; height:26px; font-family:monospace; font-size:11px; font-weight:700; text-align:center; background:#111827; color:#38bdf8; border:1px solid #334155; padding:2px; box-sizing:border-box;';
      colCmd.appendChild(inputCmd);
      fieldsRow.appendChild(colCmd);

      // Field 2: KEY
      const colKey = document.createElement('div');
      colKey.style.cssText = 'width:62px; display:flex; flex-direction:column; gap:2px;';
      colKey.innerHTML = '<label style="font-size:9px; color:#94a3b8; font-weight:700;">KEY (0x)</label>';
      const inputKey = document.createElement('input');
      inputKey.type = 'text';
      inputKey.id = 'masterKeyId';
      inputKey.value = '0D';
      inputKey.maxLength = 4;
      inputKey.style.cssText = 'width:100%; height:26px; font-family:monospace; font-size:11px; font-weight:700; text-align:center; background:#111827; color:#38bdf8; border:1px solid #334155; padding:2px; box-sizing:border-box;';
      colKey.appendChild(inputKey);
      fieldsRow.appendChild(colKey);

      // Field 3: PAYLOAD
      const colPayload = document.createElement('div');
      colPayload.style.cssText = 'flex:1; display:flex; flex-direction:column; gap:2px;';
      colPayload.innerHTML = '<label style="font-size:9px; color:#94a3b8; font-weight:700;">PAYLOAD (HEX / TEXT)</label>';
      const inputPayload = document.createElement('input');
      inputPayload.type = 'text';
      inputPayload.id = 'masterCmdPayload';
      inputPayload.value = 'Watch link ok!';
      inputPayload.placeholder = 'e.g. 01 or message';
      inputPayload.style.cssText = 'width:100%; height:26px; font-family:monospace; font-size:11px; background:#111827; color:#fff; border:1px solid #334155; padding:2px 6px; box-sizing:border-box;';
      colPayload.appendChild(inputPayload);
      fieldsRow.appendChild(colPayload);

      body0A.appendChild(fieldsRow);

      // 4. Full-Width Green Send Command Button
      const sendBtn = document.createElement('button');
      sendBtn.id = 'btnSendMasterCmd';
      sendBtn.innerHTML = '⚡ Send Command';
      sendBtn.style.cssText = 'width:100%; height:28px; font-size:11px; font-weight:700; background:#10b981; color:#fff; border:none; border-radius:0; cursor:pointer; margin:0; box-sizing:border-box;';
      body0A.appendChild(sendBtn);

      // 5. Quick Action Row: Advance Next | SIG Battery
      const actionRow = document.createElement('div');
      actionRow.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:6px; margin:0; width:100%; box-sizing:border-box;';

      const nextBtn = document.createElement('button');
      nextBtn.id = 'btnAdvanceMasterNext';
      nextBtn.innerHTML = '⏭️ Next Command';
      nextBtn.className = 'dock-btn';
      nextBtn.style.cssText = 'width:100% !important; height:28px !important; margin:0 !important; font-size:11px !important;';
      actionRow.appendChild(nextBtn);

      body0A.appendChild(actionRow);

      // 6. Dynamic Prediction Callout Box
      const predictionBox = document.createElement('div');
      predictionBox.id = 'masterCmdPrediction';
      predictionBox.style.cssText = 'font-size:10px; color:#94a3b8; line-height:1.3; padding:5px 7px; background:#05080f; border:1px solid #1e293b; margin:0; box-sizing:border-box;';
      predictionBox.innerHTML = '💡 <b>[0x04/0x0D]:</b> Fires LINE notification popup on watch.';
      body0A.appendChild(predictionBox);

      // Dynamic Selection Handler: Auto-populates all 3 text fields
      cmdSelect.onchange = () => {
        const val = cmdSelect.value;
        const parts = val.split('|');
        const cmd = (parts[0] || '').replace('0x', '').toUpperCase();
        const key = (parts[1] || '').replace('0x', '').toUpperCase();
        const defaultPayload = parts[2] || '';
        const title = parts[3] || '';
        const desc = parts[4] || title;

        inputCmd.value = cmd;
        inputKey.value = key;
        inputPayload.value = defaultPayload || (cmd === '04' ? 'Watch link ok!' : '');
        predictionBox.innerHTML = `💡 <b>[0x${cmd}/0x${key}]:</b> ${desc || 'Ready to dispatch.'}`;
      };

      nextBtn.onclick = () => {
        const nextIdx = (cmdSelect.selectedIndex + 1) % cmdSelect.options.length;
        cmdSelect.selectedIndex = nextIdx;
        cmdSelect.onchange();
      };

      // Universal Dispatch Trigger (Reads from the 3 text fields)
      sendBtn.onclick = async () => {
        const cmdHex = inputCmd.value.trim();
        const keyHex = inputKey.value.trim();
        const payloadVal = inputPayload.value.trim();

        if (cmdHex === '04' || cmdHex === '4') {
          const appCode = parseInt(keyHex, 16);
          if (typeof sendWatchAlert === 'function') {
            sendWatchAlert(appCode, payloadVal || 'Watch link ok!');
          }
        } else if (cmdHex === '02' && (keyHex === '36' || keyHex === '37')) {
          if (typeof sendWeather === 'function') sendWeather(1);
        } else if (typeof buildFitCloudFrame === 'function' && typeof enqueueBleWrite === 'function') {
          const cmd = parseInt(cmdHex, 16);
          const key = parseInt(keyHex, 16);
          const payloadBytes = payloadVal ? payloadVal.split(/\s+/).map(b => parseInt(b, 16)).filter(n => !isNaN(n)) : [];
          const { frame, seq } = buildFitCloudFrame(cmd, key, payloadBytes, 0x00);
          await enqueueBleWrite(cmdChar, frame, `CustomCmd(0x${cmdHex}/0x${keyHex}) seq=${seq}`);
        }
      };

      // 7. 🔓 Enable All Alerts
      allButtons.filter(b => b.textContent.includes('Enable All Alerts')).forEach(b => {
        b.style.cssText = 'width:100% !important; height:28px !important; margin:0 !important; padding:5px 8px !important; font-size:11px !important; box-sizing:border-box !important;';
        body0A.appendChild(b);
      });

      // 8. 🔊 Find Watch Chime
      allButtons.filter(b => b.textContent.includes('Find Watch Chime')).forEach(b => {
        b.className = 'dock-btn';
        b.style.cssText = 'width:100% !important; height:28px !important; margin:0 !important; padding:5px 8px !important; font-size:11px !important; background:#1e293b !important; color:#e2e8f0 !important; border:1px solid #334155 !important; box-sizing:border-box !important;';
        body0A.appendChild(b);
      });

      // 9. 🎞️ ALL TEST
      const allTestBtn = allButtons.find(b => b.textContent.includes('ALL TEST')) || document.createElement('button');
      allTestBtn.innerHTML = '🎞️ ALL TEST';
      allTestBtn.className = 'warn';
      allTestBtn.style.cssText = 'width:100% !important; height:28px !important; margin:0 !important; padding:5px 8px !important; font-size:11px !important; background:#f59e0b !important; color:#111 !important; font-weight:700 !important; border:none !important; border-radius:0 !important; box-sizing:border-box !important; cursor:pointer !important;';
          
      allTestBtn.onclick = async () => {
        if (typeof abortBleOperation !== 'undefined') abortBleOperation = false;
        if (typeof log === 'function') log('🚀 Starting Comprehensive ALL TEST (Excluding Reset)...', 'ok');

        const testSequence = [
          { name: '🔊 Find Watch Chime', fn: () => { const cb = allButtons.find(b => b.textContent.includes('Find Watch Chime')); if (cb) cb.click(); } },
          { name: '🔋 02/1B Read Battery %', val: '0x02|0x1b||🔋 Query Watch Battery %|' },
          { name: '📱 01/01 Query Firmware OTA', val: '0x01|0x01||📱 01/01 Query Firmware OTA|' },
          { name: '📄 01/15 Read Screen Pages', val: '0x01|0x15||📄 01/15 Read Screen Pages|' },
          { name: '🏃 03/01 Sync Live Steps', val: '0x03|0x01||🏃 03/01 Sync Live Steps|' },
          { name: '❤️ 03/04 Sync Heart Rate', val: '0x03|0x04||❤️ 03/04 Sync Heart Rate|' },
          { name: '🩸 03/06 Sync SpO2', val: '0x03|0x06||🩸 03/06 Sync SpO2|' },
          { name: '📞 04/01 Incoming Call Ring', fn: () => sendWatchAlert(0x01, 'Call Ring Test') },
          { name: '☎️ 04/02 End Call', fn: () => sendWatchAlert(0x02, 'End Call') },
          { name: '💬 04/04 SMS Alert', fn: () => sendWatchAlert(0x04, 'SMS Test') },
          { name: '🟢 04/06 WeChat Alert', fn: () => sendWatchAlert(0x06, 'WeChat Test') },
          { name: '📘 04/07 Facebook Alert', fn: () => sendWatchAlert(0x07, 'FB Test') },
          { name: '𝕏 04/08 Twitter/X Alert', fn: () => sendWatchAlert(0x08, 'X Test') },
          { name: '📲 04/0C WhatsApp Alert', fn: () => sendWatchAlert(0x0C, 'WhatsApp Test') },
          { name: '🟢 04/0D LINE Alert', fn: () => sendWatchAlert(0x0D, 'LINE Test') },
          { name: '✈️ 04/12 Telegram Alert', fn: () => sendWatchAlert(0x12, 'Telegram Test') },
          { name: '🎨 02/70=[01] Switch Dial Slot 1', val: '0x02|0x70|01|🎨 02/70=[01] Switch Dial 1|' },
          { name: '🎨 02/70=[00] Switch Dial Slot 0 (Default)', val: '0x02|0x70|00|🎨 02/70=[00] Switch Dial 0|' }
        ];

        for (let i = 0; i < testSequence.length; i++) {
          if (typeof abortBleOperation !== 'undefined' && abortBleOperation) {
            if (typeof log === 'function') log('🛑 ALL TEST aborted by user.', 'warn');
            break;
          }
          const item = testSequence[i];
          if (typeof log === 'function') log(`[ALL TEST ${i+1}/${testSequence.length}] Running: ${item.name}`, 'ok');

          try {
            if (item.fn) {
              await item.fn();
            } else if (item.val) {
              cmdSelect.value = item.val;
              cmdSelect.onchange();
              sendBtn.click();
            }
          } catch (err) {
            console.warn('ALL TEST item error:', err);
          }
          await new Promise(r => setTimeout(r, 1600));
        }
        if (typeof log === 'function') log('🏁 ALL TEST completed successfully!', 'ok');
      };
      body0A.appendChild(allTestBtn);

      // 10. ⚠️ Reset (Safely isolated at bottom)
      allButtons.filter(b => b.textContent.includes('Reset')).forEach(b => {
        b.className = 'danger';
        b.style.cssText = 'width:100% !important; height:28px !important; margin:0 !important; padding:5px 8px !important; font-size:11px !important; background:#ef4444 !important; color:#fff !important; border:none !important; border-radius:0 !important; box-sizing:border-box !important; cursor:pointer !important; font-weight:700 !important;';
        body0A.appendChild(b);
      });

      const card0A = makeToolCard('0', 'Master Command Station', body0A);
      card0A.id = 'toolCard_0_alerts';
      if (card0A) alertsToolbox.appendChild(card0A);
    }
  }
});
