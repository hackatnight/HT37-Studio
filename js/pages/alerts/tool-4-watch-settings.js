/**
 * @file     js/pages/alerts/tool-4-watch-settings.js
 * @layer    UI mount + protocol helpers
 * @summary  Tab 2 tool 4 "Watch Settings": settings the watch keeps itself (alarms now; reminders next).
 *
 * ROLE
 *   - Alarms: read (02/03 -> reply 02/04), edit up to 5 alarms, write the whole list (02/02), clear all.
 *   - Layouts come from the vendor SDK (docs/APP_COMMANDS.md section 4). Alarm write was verified on a real
 *     watch on Nov 1 2026 (one-time alarm rang at the set minute and cleared itself).
 *   - HT37.onFrame: list of functions (cmdId, keyId, valBytes) called for every complete watch reply.
 *     js/ble/notifications.js calls it; other tools can register here instead of editing notifications.js.
 *
 * REGISTERS
 *   - ui.registerMount(id:alerts.tool4, page:alerts, order:250)
 *   - HT37.watchSettings = { alarms, encodeAlarm, decodeAlarms, readAlarms, sendAlarms, clearAlarms }
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/ble/state.js + transport.js: bleServer, cmdChar, buildFitCloudFrame, enqueueBleWrite
 *   - js/core/log.js: log
 *
 * DOM IDS TOUCHED
 *   #toolCard_4_alerts #wsAlarmList
 *
 * LOAD ORDER
 *   after: js/pages/alerts/tool-3-weather-and-dial-slots.js
 *
 * HOW TO EXTEND
 *   - A new setting (sedentary, drink water, raise-to-wake...) goes in this card as another section.
 *     Layouts are in docs/APP_COMMANDS.md. Read the block first (02/20 dump), change only the fields shown,
 *     write the whole block back. Add a new row to the command registry once it is verified on the watch.
 *
 * See AI_GUIDE.md (architecture, recipes) and docs/APP_COMMANDS.md (byte layouts).
 */
(function (window) {
  'use strict';
  const HT37 = window.HT37;
  HT37.onFrame = HT37.onFrame || [];

  const MAX_ALARMS = 5;                       // alarm ids 0..4
  const DAYS = [['M', 1], ['T', 2], ['W', 4], ['T', 8], ['F', 16], ['S', 32], ['S', 64]];   // Mon..Sun (FcRepeatFlag)
  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const S = HT37.watchSettings = { alarms: [], loaded: false };

  const hex = (a) => Array.from(a).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  const connected = () => { try { return !!(cmdChar && bleServer && bleServer.connected); } catch (e) { return false; } };   // cmdChar/bleServer are top-level lets (not window props)

  async function send(cmd, key, payload, label) {
    if (!connected()) { log('ERROR: Pair & Bind to the watch first!', 'err'); return false; }
    const fr = buildFitCloudFrame(cmd, key, payload, 0x00);
    log('TX ' + label + ' [' + hex(payload) + ']', 'ok');
    await enqueueBleWrite(cmdChar, fr.frame, label);
    return true;
  }

  // ---- alarm packing (SDK protocol/a.java a(FcAlarm)): [len][y6 m4 d5 h5 mi6 id3][enabled|repeat][label] ----
  function encodeAlarm(a, now) {
    const d = new Date(now || Date.now());
    if (a.enabled && !a.repeat && a.hour * 60 + a.minute <= d.getHours() * 60 + d.getMinutes()) d.setDate(d.getDate() + 1);   // one-time alarm: next occurrence (SDK adjust())
    const y = d.getFullYear() - 2000, mo = d.getMonth() + 1, day = d.getDate();
    const lab = Array.from(new TextEncoder().encode(a.label || '')).slice(0, 32);
    return [lab.length + 5,
      ((y << 2) | (mo >> 2)) & 255,
      (((mo << 6) & 255) | (day << 1) | (a.hour >> 4)) & 255,
      (((a.hour << 4) & 255) | (a.minute >> 2)) & 255,
      ((a.minute << 6) & 255) | ((a.id & 7) << 3),
      (a.enabled ? 0x80 : 0) | (a.repeat & 0x7F)].concat(lab);
  }
  function decodeAlarms(v) {
    const out = []; let i = 0;
    while (i < v.length) {
      const len = v[i]; if (len < 5 || i + 1 + len > v.length) break;
      const e = v.subarray(i + 1, i + 1 + len);
      out.push({
        id: (e[3] >> 3) & 7, enabled: ((e[4] >> 7) & 1) === 1, repeat: e[4] & 0x7F,
        hour: ((e[1] << 4) & 16) | ((e[2] >> 4) & 15), minute: ((e[2] << 2) & 63) | ((e[3] >> 6) & 3),
        label: new TextDecoder().decode(e.subarray(5)),
      });
      i += 1 + len;
    }
    return out;
  }
  S.encodeAlarm = encodeAlarm; S.decodeAlarms = decodeAlarms;

  S.readAlarms = () => send(0x02, 0x03, [], 'Read alarms 02/03');
  S.sendAlarms = async () => {
    const list = S.alarms.filter(Boolean);
    const payload = [].concat(...list.map((a) => encodeAlarm(a)));
    const ok = await send(0x02, 0x02, payload, 'Set alarms 02/02 (' + list.length + ')');
    if (ok) log('Alarms sent: ' + (list.map((a) => fmt(a)).join(', ') || 'none (list cleared)'), 'ok');
    return ok;
  };
  S.clearAlarms = async () => { S.alarms = []; render(); return S.sendAlarms(); };

  const two = (n) => String(n).padStart(2, '0');
  const fmt = (a) => { const h12 = a.hour % 12 || 12; return h12 + ':' + two(a.minute) + (a.hour < 12 ? ' AM' : ' PM') + (a.label ? ' "' + a.label + '"' : '') + (a.enabled ? '' : ' (off)'); };

  // watch replies
  HT37.onFrame.push((cmd, key, v) => {
    if (cmd === 0x02 && key === 0x04) {          // alarm list
      S.alarms = decodeAlarms(v); S.loaded = true; render();
      log('Alarms on watch: ' + (S.alarms.map(fmt).join(', ') || 'none'), 'ok');
    }
    if (cmd === 0x02 && key === 0x21) {          // master config dump: [type][len][data] blocks (docs/APP_COMMANDS.md section 1)
      for (let i = 0; i + 2 <= v.length;) {
        const type = v[i], len = v[i + 1]; if (!len || i + 2 + len > v.length) break;
        S.blocks[type] = Uint8Array.from(v.subarray(i + 2, i + 2 + len)); i += 2 + len;
      }
      S.dumpAt = Date.now(); renderBlocks();
    }
  });

  // ---- reminder blocks (config blocks from the 02/21 dump; written back whole with 02/<type-2>) ----
  S.blocks = {}; S.dumpAt = 0;
  S.readSettings = () => send(0x02, 0x20, [0x01], 'Master Config Dump 02/20');
  const getU16 = (b, i) => (b[i] << 8) | b[i + 1];
  const setU16 = (b, i, v) => { b[i] = (v >> 8) & 255; b[i + 1] = v & 255; };
  // Only settings verified on the real watch are listed here. Add a block after it is verified.
  const BLOCKS = [
    {
      type: 39, size: 7, title: '🪑 Sedentary reminder',
      hint: 'Shows a chair icon and vibrates when you have not moved for the interval, only between From and To. Verified Nov 1 2026. The watch accepts 10 minutes or more (1 minute is ignored).',
      defaults: [0, 0x01, 0xE0, 0x04, 0xEC, 0x00, 0x3C],
      fields: [
        { label: 'On', kind: 'bool', get: (b) => b[0] & 1, set: (b, v) => { b[0] = (b[0] & ~1) | (v ? 1 : 0); } },
        { label: 'From', kind: 'time', get: (b) => getU16(b, 1), set: (b, v) => setU16(b, 1, v) },
        { label: 'To', kind: 'time', get: (b) => getU16(b, 3), set: (b, v) => setU16(b, 3, v) },
        { label: 'Every (min)', kind: 'num', min: 10, max: 720, get: (b) => getU16(b, 5), set: (b, v) => setU16(b, 5, v) },
      ],
    },
    {
      type: 42, size: 9, title: '💧 Drink water reminder',
      hint: 'Shows a water reminder and vibrates every interval, only between From and To. Verified Nov 1 2026 (first reminder came about 30 minutes after it was set). The watch accepts 30 to 180 minutes.',
      defaults: [0, 0x00, 0x3C, 0x01, 0xE0, 0x04, 0xEC, 0x00, 0x00],
      fields: [
        { label: 'On', kind: 'bool', get: (b) => b[0] & 1, set: (b, v) => { b[0] = v ? 1 : 0; } },
        { label: 'From', kind: 'time', get: (b) => getU16(b, 3), set: (b, v) => setU16(b, 3, v) },
        { label: 'To', kind: 'time', get: (b) => getU16(b, 5), set: (b, v) => setU16(b, 5, v) },
        { label: 'Every (min)', kind: 'num', min: 30, max: 180, get: (b) => getU16(b, 1), set: (b, v) => setU16(b, 1, v) },
      ],
    },
  ];
  S.BLOCKS = BLOCKS;
  S.buildBlock = (def, edits) => {          // start from the block read from the watch (or defaults), change only the edited fields
    const b = S.blocks[def.type] ? Array.from(S.blocks[def.type]) : def.defaults.slice();
    while (b.length < def.size) b.push(0);
    def.fields.forEach((f, i) => { if (edits[i] !== undefined) f.set(b, edits[i]); });
    return b;
  };
  S.sendBlock = async (def, edits) => {
    const b = S.buildBlock(def, edits);
    const ok = await send(0x02, def.type - 2, b, def.title.replace(/^\S+\s/, '') + ' 02/' + (def.type - 2).toString(16).toUpperCase().padStart(2, '0'));
    if (ok) { S.blocks[def.type] = Uint8Array.from(b); log(def.title + ' sent. Press "Read settings" to confirm what the watch kept.', 'ok'); }
    return ok;
  };
  function renderBlocks() {
    const host = document.getElementById('wsBlockList'); if (!host) return;
    host.textContent = '';
    BLOCKS.forEach((def) => {
      const cur = S.blocks[def.type] || Uint8Array.from(def.defaults);
      const box = el('div', css.row); box.appendChild(el('div', 'font-size:11px;font-weight:700;color:#e2e8f0;', def.title));
      box.appendChild(el('div', css.hint, def.hint));
      const vals = []; const line = el('div', css.line + 'flex-wrap:wrap;');
      def.fields.forEach((f, i) => {
        const w = el('label', 'display:flex;align-items:center;gap:3px;font-size:10px;color:#94a3b8;'); w.appendChild(document.createTextNode(f.label));
        let inp; const v = f.get(cur);
        if (f.kind === 'bool') { inp = el('input', 'width:auto !important;margin:0;'); inp.type = 'checkbox'; inp.checked = !!v; vals[i] = () => (inp.checked ? 1 : 0); }
        else if (f.kind === 'time') { inp = el('input', css.inp + 'width:92px !important;'); inp.type = 'time'; inp.value = two(Math.floor(v / 60)) + ':' + two(v % 60); vals[i] = () => { const m = /^(\d\d):(\d\d)/.exec(inp.value); return m ? +m[1] * 60 + +m[2] : v; }; }
        else { inp = el('input', css.inp + 'width:56px !important;'); inp.type = 'number'; inp.min = f.min; inp.max = f.max; inp.value = v; vals[i] = () => Math.max(f.min, Math.min(f.max, parseInt(inp.value, 10) || f.min)); }
        w.appendChild(inp); line.appendChild(w);
      });
      box.appendChild(line);
      const go = el('button', css.btn + 'background:#10b981;color:#fff;border:none;', '📤 Send ' + def.title.replace(/^\S+\s/, '').toLowerCase());
      go.type = 'button'; go.title = 'Writes this setting to the watch (the other bytes of the block are kept as read)';
      go.onclick = () => S.sendBlock(def, vals.map((g) => g()));
      box.appendChild(go); host.appendChild(box);
    });
    const st = document.getElementById('wsDumpStatus');
    if (st) st.textContent = S.dumpAt ? 'Settings read from the watch at ' + new Date(S.dumpAt).toLocaleTimeString() + '.' : 'Not read yet: showing defaults. Press "Read settings" first.';
  }

  // ---- UI ----
  const css = {
    box: 'display:flex;flex-direction:column;gap:6px;',
    row: 'display:flex;flex-direction:column;gap:4px;background:#0b1220;border:1px solid #1e293b;padding:5px;',
    line: 'display:flex;align-items:center;gap:4px;',
    inp: 'height:24px;font-size:11px;background:#111827;color:#e2e8f0;border:1px solid #334155;box-sizing:border-box;padding:2px 4px;',
    btn: 'width:100%;height:28px;font-size:11px;font-weight:600;background:#1e293b;color:#e2e8f0;border:1px solid #334155;cursor:pointer;padding:3px 8px;',
    hint: 'font-size:10px;color:#94a3b8;line-height:1.3;',
  };
  function el(tag, style, text) { const e = document.createElement(tag); if (style) e.style.cssText = style; if (text != null) e.textContent = text; return e; }

  function render() {
    const host = document.getElementById('wsAlarmList'); if (!host) return;
    host.textContent = '';
    S.alarms.forEach((a, idx) => {
      const r = el('div', css.row), l1 = el('div', css.line), l2 = el('div', css.line);
      const on = el('input', 'width:auto !important;margin:0;flex:none;'); on.type = 'checkbox'; on.checked = a.enabled; on.title = 'Alarm on/off'; on.onchange = () => { a.enabled = on.checked; };
      const t = el('input', css.inp + 'flex:1 1 0;min-width:0;width:auto !important;'); t.type = 'time'; t.value = two(a.hour) + ':' + two(a.minute); t.title = 'Alarm time';
      t.onchange = () => { const m = /^(\d\d):(\d\d)/.exec(t.value); if (m) { a.hour = +m[1]; a.minute = +m[2]; } };
      const lab = el('input', css.inp + 'flex:1 1 0;min-width:0;width:auto !important;'); lab.type = 'text'; lab.maxLength = 16; lab.value = a.label || ''; lab.placeholder = 'Label'; lab.title = 'Label shown on the watch (up to 32 bytes)';
      lab.oninput = () => { a.label = lab.value; };
      l1.append(on, t, lab);
      const days = el('div', 'display:flex;gap:2px;flex:1;');
      DAYS.forEach(([ch, bit], di) => {
        const b = el('button', 'width:22px !important;height:22px !important;min-width:0;margin:0 !important;font-size:10px;padding:0 !important;border:1px solid #334155;cursor:pointer;', ch);
        const paint = () => { const s = (a.repeat & bit) > 0; b.style.background = s ? '#0ea5e9' : '#111827'; b.style.color = s ? '#fff' : '#94a3b8'; };
        b.type = 'button'; b.title = DAY_NAMES[di] + ' (none selected = one time)'; paint();
        b.onclick = () => { a.repeat ^= bit; paint(); };
        days.appendChild(b);
      });
      const del = el('button', css.btn + 'width:26px !important;height:22px !important;min-width:0;margin:0 !important;padding:0 !important;flex:none;', '✕'); del.type = 'button'; del.title = 'Remove from the list (press Send to apply)';
      del.onclick = () => { S.alarms.splice(idx, 1); render(); };
      l2.append(days, del); r.append(l1, l2); host.appendChild(r);
    });
    if (!S.alarms.length) host.appendChild(el('div', css.hint, S.loaded ? 'No alarms on the watch.' : 'Press "Read from watch" to see the alarms now on the watch.'));
  }

  HT37.ui.registerMount({
    id: 'alerts.tool4',
    page: 'alerts',
    order: 250,
    title: '4. Watch Settings (reminders, alarms)',
    run(ctx) {
      const { makeToolCard } = ctx;
      const { alertsToolbox } = ctx.shared;
      if (!alertsToolbox || document.getElementById('toolCard_4_alerts')) return;
      const body = el('div', css.box);

      body.appendChild(el('div', 'font-size:10px;color:#38bdf8;font-weight:700;text-transform:uppercase;', '🔔 Reminders'));
      const rd = el('button', css.btn, '📥 Read settings from watch'); rd.type = 'button'; rd.title = 'Asks the watch for its settings (02/20 config dump). Read first so you only change what you mean to.';
      rd.onclick = () => S.readSettings(); body.appendChild(rd);
      const stat = el('div', css.hint, ''); stat.id = 'wsDumpStatus'; body.appendChild(stat);
      const blocks = el('div', 'display:flex;flex-direction:column;gap:4px;'); blocks.id = 'wsBlockList'; body.appendChild(blocks);

      body.appendChild(el('div', 'font-size:10px;color:#38bdf8;font-weight:700;text-transform:uppercase;margin-top:6px;', '⏰ Alarms (up to 5)'));
      body.appendChild(el('div', css.hint, 'Send replaces ALL alarms on the watch with this list. Read first so you do not lose any. No day selected = rings once at the next matching time.'));
      const list = el('div', 'display:flex;flex-direction:column;gap:4px;'); list.id = 'wsAlarmList'; body.appendChild(list);

      const bar = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:6px;');
      const mk = (txt, title, fn) => { const b = el('button', css.btn, txt); b.type = 'button'; b.title = title; b.onclick = fn; bar.appendChild(b); return b; };
      mk('📥 Read from watch', 'Asks the watch for its alarms (02/03)', () => S.readAlarms());
      mk('➕ Add alarm', 'Adds a row; press Send to put it on the watch', () => {
        if (S.alarms.length >= MAX_ALARMS) return log('The watch holds at most ' + MAX_ALARMS + ' alarms.', 'err');
        const used = new Set(S.alarms.map((a) => a.id)); let id = 0; while (used.has(id)) id++;
        const n = new Date(Date.now() + 120000);   // default: two minutes from now
        S.alarms.push({ id, enabled: true, hour: n.getHours(), minute: n.getMinutes(), repeat: 0, label: '' }); render();
      });
      const send1 = mk('📤 Send to watch', 'Writes the list above to the watch (02/02)', () => S.sendAlarms());
      send1.style.cssText += ';background:#10b981;color:#fff;border:none;grid-column:1 / -1;';
      mk('🚫 Remove all alarms', 'Removes every alarm from the watch (sends an empty list)', () => S.clearAlarms());
      body.appendChild(bar);

      const card = makeToolCard('4', 'Watch Settings (reminders, alarms)', body);
      if (card) { card.id = 'toolCard_4_alerts'; alertsToolbox.appendChild(card); }
      render(); renderBlocks();
    },
  });
})(typeof window !== 'undefined' ? window : this);
