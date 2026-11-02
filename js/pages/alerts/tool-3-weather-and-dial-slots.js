/**
 * @file     js/pages/alerts/tool-3-weather-and-dial-slots.js
 * @layer    UI mount
 * @summary  Tab 2 tools 3 & 4: "Weather & Sky Dispatch" and "Dial Slot Switcher (02/70)".
 *
 * ROLE
 *   - Moves the weather inputs, unit selector (#watchTimeUnitSelect), format selector, live 0x36 hex monitor,
 *     12 sky-code buttons, Push Weather / Send All, and the WF 0-5 grid.
 *   - Also hides the legacy #commandExplorer card.
 *
 * REGISTERS
 *   - ui.registerMount(id:alerts.tool3, page:alerts, order:240)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: ctx
 *
 * DOM IDS TOUCHED
 *   #btnReceiveWeatherWatch #commandExplorer #dialSlotSelect #liveSensorHex #liveTempCur #liveTempMax
 *   #liveTempMin #secSensorWeatherBody #toolCard_3_alerts #toolCard_4_dial_alerts #watchTimeUnitSelect
 *   #weatherFmtSelect
 *
 * LOAD ORDER
 *   #54 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/pages/alerts/tool-2-social-notifications.js   before: js/pages/dfu/tools.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerMount({
  id: 'alerts.tool3',
  page: 'alerts',
  order: 240,
  title: '3. Weather & Sky Dispatch + 4. Dial Slot Switcher (02/70); also hides the legacy Command Explorer card',
  run(ctx) {
    const { container, makeToolCard } = ctx;
    const { alertsToolbox } = ctx.shared;   // handed over by an earlier unit of this page
    // TOOL 3: Weather & Sky Dispatch (Push Weather Top Full-Width, Presets Middle, Send All Bottom)
    if (!document.getElementById('toolCard_3_alerts')) {
      const bodyWeather = document.createElement('div');
      bodyWeather.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin:0; padding:0;';

      // A. Sky Condition Control (at top if present)
      const secSensors = document.getElementById('secSensorWeatherBody');
      if (secSensors) {
        const skyLeaf = secSensors.querySelector('input[id*="sky" i], select[id*="sky" i]');
        if (skyLeaf) {
          const skyRow = (skyLeaf.parentElement && skyLeaf.parentElement !== secSensors) ? skyLeaf.parentElement : skyLeaf;
          skyRow.style.margin = '0';
          bodyWeather.appendChild(skyRow);
        }
      }

      // B. 🌤️ Push Weather Button (Stretched 100% full-width on top)
      const pushBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Push Weather')) || document.createElement('button');
      pushBtn.innerHTML = '🌤️ Push Weather';
      pushBtn.style.cssText = 'width:100% !important; height:28px !important; margin:0 !important; padding:5px 8px !important; font-size:11px !important; font-weight:700; background:#1e293b; color:#38bdf8; border:1px solid #334155; border-radius:0; cursor:pointer;';
      // Relocate liveSensorHex directly above Push Weather with a clean label
      const hexInput = document.getElementById('liveSensorHex');
      if (hexInput) {
        // Clean up leftover orphaned label / container in Tab 1
        const oldParentRow = hexInput.closest('.field-row, .compact-slider-row') || hexInput.parentElement;
        if (oldParentRow && oldParentRow.id !== 'weatherDispatchBody') {
          const oldLabel = oldParentRow.querySelector('label') || Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes('Weather Hex') || l.textContent.includes('Sensor Hex'));
          if (oldLabel) oldLabel.remove();
        }
      }
      if (hexInput) {
        const hexWrap = document.createElement('div');
        hexWrap.style.cssText = 'display:flex; flex-direction:column; gap:2px; width:100%; box-sizing:border-box; margin:0;';
        hexWrap.innerHTML = '<label style="font-size:9px; color:#94a3b8; font-weight:700; text-transform:uppercase;">LIVE 0x36 PACKET TELEMETRY</label>';
          
        hexInput.style.cssText = 'width:100% !important; height:28px !important; font-family:monospace !important; font-size:11px !important; font-weight:700 !important; background:#111827 !important; color:#38bdf8 !important; border:1px solid #334155 !important; border-radius:0 !important; padding:4px 8px !important; box-sizing:border-box !important; text-align:center !important;';
        hexInput.readOnly = true;
        hexWrap.appendChild(hexInput);
        bodyWeather.appendChild(hexWrap);
      }

      bodyWeather.appendChild(pushBtn);

      // Move Cur/Min/Max row from Tab 1 directly underneath Push Weather
      const tempInput = document.getElementById('liveTempCur');
      if (tempInput) {
        const tempRow = tempInput.closest('.field-row') || tempInput.parentElement;
        if (tempRow) {
          tempRow.style.cssText = 'display:flex; align-items:center; justify-content:center; gap:3px; margin:0 auto; padding:2px 0; width:100%; box-sizing:border-box; font-size:11px;';
          const inCur = document.getElementById('liveTempCur');
          const inMin = document.getElementById('liveTempMin');
          const inMax = document.getElementById('liveTempMax');
          if (inCur && inMin && inMax) {
            tempRow.innerHTML = `
                <span style="font-size:12px; line-height:1; margin-right:3px;">🌡️</span>
                <span style="color:#94a3b8; font-size:10px; font-weight:700;">Cur:</span>
              `;
            tempRow.appendChild(inCur);
            tempRow.insertAdjacentHTML('beforeend', '<span style="color:#94a3b8; font-size:10px; font-weight:700; margin-left:3px;">Min:</span>');
            tempRow.appendChild(inMin);
            tempRow.insertAdjacentHTML('beforeend', '<span style="color:#94a3b8; font-size:10px; font-weight:700; margin-left:3px;">Max:</span>');
            tempRow.appendChild(inMax);
            tempRow.insertAdjacentHTML('beforeend', '<span style="color:#38bdf8; font-size:11px; font-weight:700; margin-left:1px;">°C</span>');
            [inCur, inMin, inMax].forEach(inp => {
              inp.style.cssText = 'width:36px; height:24px; font-size:11px; font-weight:600; text-align:center; background:#111827; color:#fff; border:1px solid #334155; padding:2px; box-sizing:border-box;';
            });
          }
          // Relocate Unit Mode & Weather Format dropdowns directly above Cur/Min/Max
          const unitSel = document.getElementById('watchTimeUnitSelect');
          const fmtSel = document.getElementById('weatherFmtSelect');
          if (unitSel && fmtSel) {
            const cfgRow = unitSel.closest('.field-row, div') || unitSel.parentElement;
            if (cfgRow) {
              cfgRow.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:6px; margin:0; width:100%; box-sizing:border-box;';
              cfgRow.innerHTML = '';

              // Column 1: Time & Temp Unit Mode
              const colUnit = document.createElement('div');
              colUnit.style.cssText = 'display:flex; flex-direction:column; gap:2px;';
              colUnit.innerHTML = '<label style="font-size:9px; color:#94a3b8; font-weight:700; text-transform:uppercase;">TIME & TEMP UNIT</label>';
              colUnit.appendChild(unitSel);

              // Column 2: 0x36 Weather Packet Format
              const colFmt = document.createElement('div');
              colFmt.style.cssText = 'display:flex; flex-direction:column; gap:2px;';
              colFmt.innerHTML = '<label style="font-size:9px; color:#94a3b8; font-weight:700; text-transform:uppercase;">WEATHER PKT FORMAT</label>';
              colFmt.appendChild(fmtSel);

              cfgRow.appendChild(colUnit);
              cfgRow.appendChild(colFmt);

              [unitSel, fmtSel].forEach(s => {
                s.style.cssText = 'width:100% !important; height:28px !important; font-size:11px !important; background:#111827 !important; color:#e2e8f0 !important; border:1px solid #334155 !important; border-radius:0 !important; padding:3px 4px !important; box-sizing:border-box !important;';
              });
              bodyWeather.appendChild(cfgRow);
            }

            // Dynamic C <-> F Unit and Value Conversion Hook
            let lastUnitMode = unitSel.value;
            const origUnitChange = unitSel.onchange;
            unitSel.onchange = function(e) {
              if (typeof origUnitChange === 'function') origUnitChange.call(this, e);
              const curMode = this.value;
              const isF = curMode.endsWith('_F');
              const wasF = lastUnitMode.endsWith('_F');
              lastUnitMode = curMode;

              // 1. Update Unit Badge
              const unitBadge = tempRow.querySelector('span[style*="#38bdf8"]');
              if (unitBadge) unitBadge.textContent = isF ? '°F' : '°C';

              // 2. Convert Cur, Min, Max values if scale flipped
              if (isF !== wasF) {
                const inCur = document.getElementById('liveTempCur');
                const inMin = document.getElementById('liveTempMin');
                const inMax = document.getElementById('liveTempMax');
                [inCur, inMin, inMax].forEach(inp => {
                  if (inp && inp.value !== '') {
                    const v = Number(inp.value);
                    if (!isNaN(v)) {
                      inp.value = isF ? Math.round((v * 9/5) + 32) : Math.round((v - 32) * 5/9);
                    }
                  }
                });
              }
            };
          }

          bodyWeather.appendChild(tempRow);
        }
      }

      // C. 12 Weather Preset Buttons (Clean 2-Column Grid in the middle)
      const weatherGrid = document.createElement('div');
      weatherGrid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:6px; margin:0; width:100%; box-sizing:border-box;';

      const weatherKeywords = ['Sunny', 'Cloudy', 'Overcast', 'Shower', 'Thunder', 'LtRain', 'ModRain', 'Sleet', 'LtSnow', 'ModSnow', 'Sand', 'Foggy'];
      Array.from(document.querySelectorAll('button')).filter(b => weatherKeywords.some(kw => b.textContent.includes(kw))).forEach(b => {
        b.className = 'dock-btn';
        b.style.cssText = 'width:100% !important; height:28px !important; margin:0 !important; padding:5px 6px !important; font-size:11px !important; background:#1e293b !important; color:#e2e8f0 !important; border:1px solid #334155 !important; border-radius:0 !important; cursor:pointer !important; white-space:nowrap !important; overflow:hidden !important; text-overflow:ellipsis !important; box-sizing:border-box !important; text-align:center !important;';
        weatherGrid.appendChild(b);
      });
      bodyWeather.appendChild(weatherGrid);

      // D. ⚡ Send All Button (Yellow Accent at bottom of preset buttons)
      const skyBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent.includes('Send All') || b.textContent.includes('Sky')) && b !== pushBtn) || document.createElement('button');
      skyBtn.innerHTML = '⚡ Send All';
      skyBtn.className = 'warn';
      skyBtn.style.cssText = 'width:100% !important; height:28px !important; margin:0 !important; padding:5px 8px !important; font-size:11px !important; font-weight:700 !important; background:#f59e0b !important; color:#111 !important; border:none !important; border-radius:0 !important; cursor:pointer !important;';
      bodyWeather.appendChild(skyBtn);

      // E. Receive State Button
      const receiveBtn = document.createElement('button');
      receiveBtn.type = 'button';
      receiveBtn.id = 'btnReceiveWeatherWatch';
      receiveBtn.className = 'dock-btn';
      receiveBtn.style.cssText = 'width:100% !important; height:28px !important; margin:0 !important; padding:5px 6px !important; background:#1e293b !important; color:#94a3b8 !important; border:1px dashed #475569 !important; font-weight:600 !important; font-size:11px !important;';
      receiveBtn.textContent = '📥 Receive State from Watch (Planned)';
      bodyWeather.appendChild(receiveBtn);

      const card3A = makeToolCard('3', 'Weather & Sky Dispatch', bodyWeather);
      card3A.id = 'toolCard_3_alerts';
      if (card3A) alertsToolbox.appendChild(card3A);

      // TOOL 4: Dial Slot Switcher (02/70) - Moved from Tab 1, Tool 2
      if (!document.getElementById('toolCard_4_dial_alerts')) {
        const bodyDial = document.createElement('div');
        bodyDial.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin:0; padding:0; width:100%; box-sizing:border-box;';

        // 1. Move Watchface (02/70) Dropdown & Switch Button Row
        const dialSel = document.getElementById('dialSlotSelect');
        if (dialSel) {
          const dialRow = dialSel.closest('.field-row') || dialSel.parentElement;
          if (dialRow) {
            dialRow.style.cssText = 'display:flex; flex-direction:column; gap:4px; margin:0; width:100%; box-sizing:border-box;';
            const lbl = dialRow.querySelector('label');
            if (lbl) lbl.style.cssText = 'font-size:9px; color:#94a3b8; font-weight:700; text-transform:uppercase; margin:0;';
              
            const innerFlex = dialSel.parentElement;
            if (innerFlex && innerFlex !== dialRow) {
              innerFlex.style.cssText = 'display:flex; gap:6px; width:100%; box-sizing:border-box;';
            }
            dialSel.style.cssText = 'flex:1 !important; height:28px !important; font-size:11px !important; background:#111827 !important; color:#e2e8f0 !important; border:1px solid #334155 !important; padding:4px 6px !important; box-sizing:border-box !important;';
              
            const switchBtn = dialRow.querySelector('button');
            if (switchBtn) {
              switchBtn.className = 'dock-btn';
              switchBtn.style.cssText = 'width:auto !important; padding:0 12px !important; height:28px !important; font-size:11px !important; font-weight:700 !important; background:#1e293b !important; color:#38bdf8 !important; border:1px solid #334155 !important; cursor:pointer !important;';
            }
            bodyDial.appendChild(dialRow);
          }
        }

        // 2. Move the 6 WF Buttons into a Standardized 2-Column Grid
        const wfBtns = Array.from(document.querySelectorAll('button')).filter(b => {
          const oc = b.getAttribute('onclick') || '';
          return oc.includes('switchWatchfaceByIndex');
        });
        if (wfBtns.length > 0) {
          const oldGrid = wfBtns[0].parentElement;
          const wfGrid = document.createElement('div');
          wfGrid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:6px; margin:0; width:100%; box-sizing:border-box;';
            
          wfBtns.forEach((b, idx) => {
            b.className = 'dock-btn';
            b.removeAttribute('style');
            const hexIdx = idx.toString(16).padStart(2, '0').toUpperCase();
            b.innerHTML = `⌚ WF ${idx} (02/70=${hexIdx})`;
            b.style.cssText = 'width:100% !important; height:28px !important; margin:0 !important; padding:5px 6px !important; font-size:11px !important; font-weight:600 !important; background:#1e293b !important; color:#e2e8f0 !important; border:1px solid #334155 !important; border-radius:0 !important; cursor:pointer !important; box-sizing:border-box !important; text-align:center !important;';
            wfGrid.appendChild(b);
          });
          bodyDial.appendChild(wfGrid);
          if (oldGrid && oldGrid.children.length === 0) oldGrid.remove();
        }

        const card4A = makeToolCard('4', 'Dial Slot Switcher (02/70)', bodyDial);
        card4A.id = 'toolCard_4_dial_alerts';
        if (card4A) alertsToolbox.appendChild(card4A);
      }

      // TOOL 4: Dial Slot Switcher (02/70) - Moved from Tab 1, Tool 2
      if (!document.getElementById('toolCard_4_dial_alerts')) {
        const bodyDial = document.createElement('div');
        bodyDial.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin:0; padding:0; width:100%; box-sizing:border-box;';

        // 1. Move Watchface (02/70) Dropdown & Switch Button Row
        const dialSel = document.getElementById('dialSlotSelect');
        if (dialSel) {
          const dialRow = dialSel.closest('.field-row') || dialSel.parentElement;
          if (dialRow) {
            dialRow.style.cssText = 'display:flex; flex-direction:column; gap:4px; margin:0; width:100%; box-sizing:border-box;';
            const lbl = dialRow.querySelector('label');
            if (lbl) lbl.style.cssText = 'font-size:9px; color:#94a3b8; font-weight:700; text-transform:uppercase; margin:0;';
              
            const innerFlex = dialSel.parentElement;
            if (innerFlex && innerFlex !== dialRow) {
              innerFlex.style.cssText = 'display:flex; gap:6px; width:100%; box-sizing:border-box;';
            }
            dialSel.style.cssText = 'flex:1 !important; height:28px !important; font-size:11px !important; background:#111827 !important; color:#e2e8f0 !important; border:1px solid #334155 !important; padding:4px 6px !important; box-sizing:border-box !important;';
              
            const switchBtn = dialRow.querySelector('button');
            if (switchBtn) {
              switchBtn.className = 'dock-btn';
              switchBtn.style.cssText = 'width:auto !important; padding:0 12px !important; height:28px !important; font-size:11px !important; font-weight:700 !important; background:#1e293b !important; color:#38bdf8 !important; border:1px solid #334155 !important; cursor:pointer !important;';
            }
            bodyDial.appendChild(dialRow);
          }
        }

        // 2. Move the 6 WF Buttons into a Standardized 2-Column Grid
        const wfBtns = Array.from(document.querySelectorAll('button')).filter(b => {
          const oc = b.getAttribute('onclick') || '';
          return oc.includes('switchWatchfaceByIndex');
        });
        if (wfBtns.length > 0) {
          const oldGrid = wfBtns[0].parentElement;
          const wfGrid = document.createElement('div');
          wfGrid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:6px; margin:0; width:100%; box-sizing:border-box;';
            
          wfBtns.forEach((b, idx) => {
            b.className = 'dock-btn';
            b.removeAttribute('style');
            const hexIdx = idx.toString(16).padStart(2, '0').toUpperCase();
            b.innerHTML = `⌚ WF ${idx} (02/70=${hexIdx})`;
            b.style.cssText = 'width:100% !important; height:28px !important; margin:0 !important; padding:5px 6px !important; font-size:11px !important; font-weight:600 !important; background:#1e293b !important; color:#e2e8f0 !important; border:1px solid #334155 !important; border-radius:0 !important; cursor:pointer !important; box-sizing:border-box !important; text-align:center !important;';
            wfGrid.appendChild(b);
          });
          bodyDial.appendChild(wfGrid);
          if (oldGrid && oldGrid.children.length === 0) oldGrid.remove();
        }

        const card4A = makeToolCard('4', 'Dial Slot Switcher (02/70)', bodyDial);
        card4A.id = 'toolCard_4_dial_alerts';
        if (card4A) alertsToolbox.appendChild(card4A);
      }
    }
    // Hide original raw command explorer in DOM so it never leaks
    const cmdExplorerOriginal = document.getElementById('commandExplorer');
    if (cmdExplorerOriginal) {
      cmdExplorerOriginal.style.display = 'none';
    }
  }
});
