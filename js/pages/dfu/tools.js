/**
 * @file     js/pages/dfu/tools.js
 * @layer    UI mount
 * @summary  Tab 3 toolbox: flash trigger, FFB1 probes, config TLV tools, progress.
 *
 * ROLE
 *   - Adds a second ⚡ Flash button (#btnFlashWatchTab3) that clicks the header #btnFlashWatch, and adopts
 *     #secDfuEngineBody (service-9966 triggers, opcode/scope/endianness/chunk-size selectors, base template,
 *     progress bar).
 *
 * REGISTERS
 *   - ui.registerMount(id:dfu.tools, page:dfu, order:300)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: ctx
 *   - js/core/log.js: log
 *   - js/dfu/ffb1-probe.js: triggerWhiteArrowFfb1
 *
 * DOM IDS TOUCHED
 *   #btnDiscoverTrigger #btnFlashWatch #btnFlashWatchTab3 #dfuProgressWrap #dfuToolboxWindow #secDfuEngineBody
 *   #toolCard_0_dfu #toolCard_1_dfu #toolCard_2_dfu #toolCard_flash_primary
 *
 * LOAD ORDER
 *   #55 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/pages/alerts/tool-3-weather-and-dial-slots.js   before: js/pages/logs/tools.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerMount({
  id: 'dfu.tools',
  page: 'dfu',
  order: 300,
  title: 'DFU toolbox: 0. Flashing Handshake & Triggers, 1. Config TLVs & Dial Tools, 2. Flashing Progress & Status',
  run(ctx) {
    const { header, getCard, makeToolCard, dfuLeft } = ctx;
    let dfuToolbox = document.getElementById('dfuToolboxWindow');
    if (!dfuToolbox) {
      dfuToolbox = document.createElement('div');
      dfuToolbox.id = 'dfuToolboxWindow';
      dfuToolbox.className = 'unified-toolbox-window';
      dfuLeft.appendChild(dfuToolbox);
    }
    const dfuBody = document.getElementById('secDfuEngineBody');
    const dfuCard = getCard('secDfuEngineBody');
    if (dfuBody) {
      const dfuButtons = Array.from(dfuBody.querySelectorAll('button'));

      // Tool 0: Flashing Handshake & Upload Triggers
              // TOOL 0: ⚡ Flash to Watch Action Card (Linked to Hardware Pipeline)
      if (!document.getElementById('toolCard_flash_primary')) {
        const bodyFlash = document.createElement('div');
        bodyFlash.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin:0; padding:0; width:100%; box-sizing:border-box;';

        const flashBtnTab3 = document.createElement('button');
        flashBtnTab3.id = 'btnFlashWatchTab3';
        flashBtnTab3.className = 'success';
        flashBtnTab3.innerHTML = '⚡ 3. Flash to Watch';
        flashBtnTab3.style.cssText = 'width:100% !important; height:38px !important; margin:0 !important; font-size:13px !important; font-weight:700 !important; background:#10b981 !important; color:#ffffff !important; border:1px solid #059669 !important; border-radius:0 !important; box-shadow:0 0 12px rgba(16,185,129,0.4) !important; cursor:pointer !important; transition:all 0.15s ease !important;';
        flashBtnTab3.onclick = () => {
          const topFlash = document.getElementById('btnFlashWatch');
          if (topFlash) topFlash.click();
        };

        const tipText = document.createElement('div');
        tipText.style.cssText = 'font-size:10px; color:#94a3b8; line-height:1.4;';
        tipText.innerHTML = 'Flashes the currently compiled watchface binary directly to the watch using the verified <strong>IC_568X OTA protocol (START/HEAD/DATA/END)</strong>.';

                  bodyFlash.appendChild(flashBtnTab3);
        bodyFlash.appendChild(tipText);

        const discBtn = document.createElement('button');
        discBtn.id = 'btnDiscoverTrigger';
        discBtn.className = 'warn';
        discBtn.innerHTML = '🔬 2. Discover Trigger (Safe)';
        discBtn.title = 'Tests the newly discovered 0x7C/0xAD/0xB0/0x88/0xE0 Dial & Flash keys + bumped 53B OTA header';
        discBtn.style.cssText = 'width:100% !important; height:32px !important; margin:6px 0 0 0 !important; font-size:12px !important; font-weight:700 !important; background:#f59e0b !important; color:#030712 !important; border:1px solid #d97706 !important; border-radius:0 !important; cursor:pointer !important; transition:all 0.15s ease !important;';
        discBtn.onclick = async () => {
          if (typeof log === 'function') log('--- [🔬 2. Discover Trigger (Safe) -> Sending FFB1 Wake & Slot Packet] ---', 'tx');
          if (typeof triggerWhiteArrowFfb1 === 'function') await triggerWhiteArrowFfb1();
        };

        const discTip = document.createElement('div');
        discTip.style.cssText = 'font-size:10px; color:#94a3b8; line-height:1.4;';
        discTip.innerHTML = 'Sends FFB1 wake & slot packet to discover OTA dial triggers safely.';

        bodyFlash.appendChild(discBtn);
        bodyFlash.appendChild(discTip);

        const cardFlash = makeToolCard('0', '⚡ Flash to Watch', bodyFlash);
        cardFlash.id = 'toolCard_flash_primary';
        if (cardFlash) dfuToolbox.appendChild(cardFlash);
      }

      // Tool 1: Flashing Handshake & Upload Triggers
      if (!document.getElementById('toolCard_0_dfu')) {
        const body0D = document.createElement('div');
        body0D.style.cssText = 'display:flex; flex-direction:column; gap:6px;';
        dfuButtons.filter(b => {
          const t = b.textContent;
          return t.includes('White Arrow') || t.includes('Probe FFB1');
        }).forEach(b => {
          b.style.width = '100%';
          b.style.margin = '0';
          b.style.padding = '6px 8px';
          b.style.fontSize = '11px';
          body0D.appendChild(b);
        });
        const card0D = makeToolCard('0', 'Flashing Handshake & Triggers', body0D);
        card0D.id = 'toolCard_0_dfu';
        if (card0D) dfuToolbox.appendChild(card0D);
      }

      // Tool 1: Config TLVs & Firmware Tools
      if (!document.getElementById('toolCard_1_dfu')) {
        const body1D = document.createElement('div');
        body1D.style.cssText = 'display:flex; flex-direction:column; gap:6px;';
          
        dfuButtons.filter(b => b.textContent.includes('Clean Config TLVs')).forEach(b => {
          b.style.width = '100%';
          b.style.margin = '0';
          b.style.padding = '6px 8px';
          b.style.fontSize = '11px';
          body1D.appendChild(b);
        });

        // Fetch HT37 Template button (moved from alerts)
        const templateBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Fetch HT37 Template'));
        if (templateBtn) {
          templateBtn.style.width = '100%';
          templateBtn.style.margin = '0';
          templateBtn.style.padding = '6px 8px';
          templateBtn.style.fontSize = '11px';
          body1D.appendChild(templateBtn);
        }

        const card1D = makeToolCard('1', 'Config TLVs & Dial Tools', body1D);
        card1D.id = 'toolCard_1_dfu';
        if (card1D) dfuToolbox.appendChild(card1D);
      }

      // Tool 2: Flashing Progress & Status
      if (!document.getElementById('toolCard_2_dfu')) {
        const body2D = document.createElement('div');
        body2D.style.cssText = 'display:flex; flex-direction:column; gap:6px;';

        const progWrap = document.getElementById('dfuProgressWrap');
        if (progWrap) body2D.appendChild(progWrap);

        const clearBtn = dfuButtons.find(b => b.textContent.includes('Clear All'));
        if (clearBtn) {
          clearBtn.style.width = '100%';
          clearBtn.style.margin = '0';
          clearBtn.style.padding = '5px 8px';
          clearBtn.style.fontSize = '11px';
          body2D.appendChild(clearBtn);
        }

        const card2D = makeToolCard('2', 'Flashing Progress & Status', body2D);
        card2D.id = 'toolCard_2_dfu';
        if (card2D) dfuToolbox.appendChild(card2D);
      }

      // Hide original card wrapper so it never leaks
              if (dfuCard && dfuCard !== dfuBody) {
        dfuCard.style.display = 'none';
      }
    }
  }
});
