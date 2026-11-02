/**
 * @file     js/protocol/explorer-runtime.js
 * @layer    Commands
 * @summary  Command Explorer helpers: send a free-form cmd/key/payload and step through presets.
 *
 * ROLE
 *   - sendExplorerCommand(): reads #explorerCmd/#explorerKey/#explorerPayload (hex) and sends via
 *     buildFitCloudFrame.
 *   - loadExplorerPreset(value) fills those fields from a "cmd|key|payload|title|desc" option value;
 *     advanceExplorerNext() selects the next option of #explorerPresetSelect.
 *
 * PROVIDES (globals)
 *   window. sendExplorerCommand, window. advanceExplorerNext, window. loadExplorerPreset
 *
 * USES (defined in other files)
 *   - js/ble/state.js: bleServer, cmdChar
 *   - js/core/log.js: log
 *   - js/ble/frames.js: buildFitCloudFrame
 *   - js/ble/transport.js: enqueueBleWrite
 *
 * DOM IDS TOUCHED
 *   #explorerCmd #explorerKey #explorerPayload #explorerPrediction #explorerPresetSelect
 *
 * LOAD ORDER
 *   #35 of 62, section "6. WATCH COMMANDS  (alerts, weather, dial slots, explorer console)"
 *   after: js/commands/dial-slots.js   before: js/dfu/ffb1-probe.js
 *
 * NOTES
 *   - The legacy Command Explorer card is hidden by pages/alerts/tool-3; the Master Command Station (tool 0) is
 *     the visible equivalent.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
(function (window) {
  'use strict';
  // --- COMMAND EXPLORER RUNTIME HELPERS ---
  window.sendExplorerCommand = async function() {
    if (!cmdChar || !bleServer || !bleServer.connected) {
      return log('ERROR: Connect & Bind to the watch first!', 'err');
    }
    const cmdStr = (document.getElementById('explorerCmd')?.value || '').trim();
    const keyStr = (document.getElementById('explorerKey')?.value || '').trim();
    const payloadStr = (document.getElementById('explorerPayload')?.value || '').trim();

    const cmd = parseInt(cmdStr, 16);
    const key = parseInt(keyStr, 16);
    if (isNaN(cmd) || isNaN(key)) return log('ERROR: Invalid Cmd or Key hex.', 'err');

    let payload = [];
    if (payloadStr.length > 0) {
      payload = payloadStr.split(/[\s,]+/).map(h => parseInt(h, 16)).filter(n => !isNaN(n));
    }

    const cmdHex = '0x' + cmd.toString(16).padStart(2, '0').toUpperCase();
    const keyHex = '0x' + key.toString(16).padStart(2, '0').toUpperCase();
    const sel = document.getElementById('explorerPresetSelect');
    const label = sel ? sel.options[sel.selectedIndex].text : 'Explorer Probe';

    log(`🧪 [Explorer]: Probing ${cmdHex}/${keyHex} [${payload.map(b=>b.toString(16).padStart(2,'0').toUpperCase()).join(' ')}] (${label})...`, 'ok');
    const { frame, seq } = buildFitCloudFrame(cmd, key, payload, 0x00);
    await enqueueBleWrite(cmdChar, frame, `Explorer(${cmdHex}/${keyHex}) seq=${seq}`);
  };

  window.advanceExplorerNext = function() {
    const sel = document.getElementById('explorerPresetSelect');
    if (!sel) return;
    if (sel.selectedIndex < sel.options.length - 1) {
      sel.selectedIndex++;
    } else {
      sel.selectedIndex = 0;
    }
    window.loadExplorerPreset(sel.value);
  };

  window.loadExplorerPreset = function(val) {
    if (!val) return;
    const parts = val.split('|');
    if (parts.length >= 3) {
      const cInput = document.getElementById('explorerCmd');
      const kInput = document.getElementById('explorerKey');
      const pInput = document.getElementById('explorerPayload');
      const descEl = document.getElementById('explorerPrediction');
      if (cInput) cInput.value = parts[0];
      if (kInput) kInput.value = parts[1];
      if (pInput) pInput.value = parts[2] || '';
      const desc = parts[4] || parts[3] || 'Predicted watch response';
      if (descEl) descEl.innerHTML = `💡 <b>Prediction:</b> ${desc}`;
    }
  };
})(typeof window !== 'undefined' ? window : this);
