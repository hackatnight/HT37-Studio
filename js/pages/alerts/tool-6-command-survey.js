/**
 * @file     js/pages/alerts/tool-6-command-survey.js
 * @layer    UI mount + survey runner
 * @summary  Tab 2 tool 6 "Command Survey": steps through candidate commands (SDK requests, predicted reads, unused keys, setters), records
 *           what the watch answers, listens passively while you use the watch, and keeps a table of results you can save as CSV.
 *
 * ROLE
 *   - Goal: find out what unknown or unused commands do. Data comes from js/protocol/command-catalog.js (mined from the vendor SDK, see
 *     docs/PROTOCOL_MAP.md). Every probe is one frame: cmd, key, a payload (empty unless the catalog has a hint or you type one).
 *   - AUTO run: only tiers "SDK request" (and optionally "purpose unknown" and "predicted read"). Queries only, one every ~3 seconds.
 *   - STEP mode: unused keys, setters, unnamed ones, one at a time. The exact bytes are shown first and nothing is sent until you press Send.
 *   - LISTEN mode: sends nothing. Records every frame the watch pushes, tagged with the label you type ("opened compass app").
 *   - Answers are judged against the expected reply key (request + 1): answered / other frames / silent. The usual pushes (05/22, 02/1C,
 *     02/E5, 05/24) are ignored unless they are the expected reply.
 *   - Never sends while disconnected, charging or while a live health scan runs. The page firewall (isDangerousResetFrame) still applies, and
 *     the catalog's "blocked" tier is never sent.
 *
 * REGISTERS
 *   - ui.registerMount(id:alerts.tool6, page:alerts, order:270); HT37.survey = { probe, results, startListen, stopListen }
 *   - results are kept in localStorage 'ht37SurveyResults' (last outcome per cmd/key)
 *
 * USES: HT37.catalog, HT37.onFrame, buildFitCloudFrame, enqueueBleWrite, isDangerousResetFrame, cmdChar, bleServer, log
 *
 * DOM IDS TOUCHED
 *   #toolCard_6_alerts #svStatus #svTable #svStep #svListen
 *
 * See docs/PROTOCOL_MAP.md and docs/UNKNOWNS.md.
 */
(function (window) {
  'use strict';
  const HT37 = window.HT37; HT37.onFrame = HT37.onFrame || [];
  const S = HT37.survey = { cur: null, stop: false, running: false, listen: { on: false, label: '', rows: {} } };
  const KEY = 'ht37SurveyResults', NOISE = new Set(['05/22', '02/1c', '02/e5', '05/24']);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const h2 = (n) => ('0' + n.toString(16)).slice(-2);
  const hex = (a, n) => Array.from(n ? a.slice(0, n) : a).map((b) => h2(b)).join(' ');
  const bytesOf = (s) => (s.replace(/[^0-9a-fA-F]/g, '').match(/../g) || []).map((x) => parseInt(x, 16));
  const $ = (id) => document.getElementById(id);
  S.results = {}; try { S.results = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { S.results = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S.results)); } catch (e) { /* storage full or blocked */ } };
  const say = (t) => { const e = $('svStatus'); if (e) e.textContent = t; };

  HT37.onFrame = HT37.onFrame.filter((f) => !f.__svHandler);
  const onFrame = (cmd, key, v) => {
    const id = h2(cmd) + '/' + h2(key), rec = { id, hex: hex(v, 64), n: v.length };
    if (S.cur && (!NOISE.has(id) || id === S.cur.want)) S.cur.got.push(rec);
    if (S.listen.on && (!NOISE.has(id) || $('svNoise') && $('svNoise').checked)) {
      const k = S.listen.label + '|' + id, r = S.listen.rows[k] || (S.listen.rows[k] = { label: S.listen.label, id, count: 0, first: rec.hex, last: rec.hex, t: new Date().toLocaleTimeString('en-US') });
      r.count++; r.last = rec.hex; renderListen();
    }
  };
  onFrame.__svHandler = true; HT37.onFrame.push(onFrame);

  const guard = () => {
    let ok = false; try { ok = !!(cmdChar && bleServer && bleServer.connected); } catch (e) { ok = false; }
    if (!ok) return 'The watch is not connected.';
    const hs = HT37.health && HT37.health.state;
    if (hs && hs.charging) return 'The watch is charging. Nothing is sent while it charges.';
    if (hs && hs.scanning) return 'A live health scan is running. Stop it first.';
    if (HT37.watchSync && HT37.watchSync.busy) return 'A history read is running.';
    return '';
  };
  const frameFor = (row, payloadHex) => buildFitCloudFrame(parseInt(row[0], 16), parseInt(row[1], 16), new Uint8Array(bytesOf(payloadHex || '')), 0).frame;
  const frameHex = (f) => Array.from(f).map((b) => h2(b).toUpperCase()).join(' ');

  S.probe = async (row, payloadHex, waitMs) => {
    const id = row[0] + '/' + row[1], why = guard(); if (why) throw new Error(why);
    const frame = frameFor(row, payloadHex);
    const entry = { id, name: row[2], tier: row[3], payload: (payloadHex || '').trim(), t: Date.now() };
    if (typeof isDangerousResetFrame === 'function' && isDangerousResetFrame(frame)) { entry.status = 'blocked'; entry.replies = []; S.results[id] = entry; save(); return entry; }
    const want = row[4] ? row[0] + '/' + row[4] : '';
    const cur = S.cur = { got: [], want };
    await enqueueBleWrite(cmdChar, frame, 'SURVEY ' + id);
    await sleep(waitMs || 2500); S.cur = null;
    entry.replies = cur.got.map((g) => g.id + ' ' + g.hex);
    entry.status = want && cur.got.some((g) => g.id === want) ? 'answered' : cur.got.length ? 'other' : 'silent';
    S.results[id] = entry; save();
    log('SURVEY ' + id + ' ' + (row[2] || '') + ' → ' + entry.status + (entry.replies.length ? ': ' + entry.replies.slice(0, 3).join(' | ') : ''), entry.status === 'silent' ? 'warn' : 'ok');
    return entry;
  };

  // ---------- lists ----------
  const pick = (tier) => {
    const C = HT37.catalog; if (!C) return [];
    if (tier === 'triple') return C.triples.map((t) => ['02', t[0], 'read slot of 02/' + t[3], 'triple', t[1], '']);
    if (tier.indexOf('gap') === 0) return C.gaps(parseInt(tier.slice(3), 10));
    return C.commands.filter((r) => r[3] === tier);
  };
  const LISTS = [['read', 'SDK requests (named)'], ['triple', 'Predicted reads (settings triples)'], ['unnamed', 'SDK, purpose unknown'], ['gap2', 'Unused keys, group 02'], ['gap5', 'Unused keys, group 05'], ['gap8', 'Unused keys, group 08'], ['set', 'SDK setters (change watch state)']];

  S.runAuto = async (tiers) => {
    if (S.running) return; const why = guard(); if (why) return say(why);
    const rows = tiers.flatMap(pick).filter((r) => !(S.results[r[0] + '/' + r[1]] && $('svSkipDone') && $('svSkipDone').checked));
    S.running = true; S.stop = false; let n = 0, ans = 0;
    try {
      for (const r of rows) {
        if (S.stop) break; say('Asking ' + r[0] + '/' + r[1] + ' ' + r[2] + ' (' + (++n) + ' of ' + rows.length + ')…');
        const e = await S.probe(r, r[5], +($('svWait') ? $('svWait').value : 2.5) * 1000); if (e.status === 'answered') ans++; renderTable(); await sleep(400);
      }
      say((S.stop ? 'Stopped. ' : 'Done. ') + n + ' asked, ' + ans + ' answered with the expected reply. Nothing was written on purpose.');
    } catch (e) { say('Stopped: ' + e.message); }
    S.running = false; renderTable();
  };

  let stepList = [], stepIdx = 0;
  const renderStep = () => {
    const box = $('svStep'); if (!box) return; box.textContent = '';
    if (!stepList.length || stepIdx >= stepList.length) { box.appendChild(mk('div', hint, stepList.length ? 'End of the list.' : 'Pick a list and press Start.')); return; }
    const r = stepList[stepIdx], pl = $('svPay') ? $('svPay').value : r[5];
    const row = mk('div', 'display:flex;flex-direction:column;gap:4px;');
    row.appendChild(mk('div', 'font-size:11px;color:#e2e8f0;font-weight:700;', (stepIdx + 1) + ' of ' + stepList.length + ': ' + r[0] + '/' + r[1] + '  ' + r[2]));
    const p = mk('input', inCss); p.id = 'svPay'; p.placeholder = 'payload hex (empty is fine)'; p.value = pl == null ? '' : pl; p.oninput = () => { const b = $('svBytes'); if (b) b.textContent = frameHex(frameFor(r, p.value)); };
    const b = mk('div', 'font-family:monospace;font-size:10px;color:#38bdf8;word-break:break-all;', frameHex(frameFor(r, p.value))); b.id = 'svBytes';
    const warn = r[3] === 'set' ? mk('div', 'font-size:10px;color:#fbbf24;', 'This is a setter. It may change a setting on the watch.') : null;
    const bs = mk('div', 'display:flex;gap:6px;');
    const send = mk('button', btn + 'background:#10b981;color:#fff;border:none;', 'Send and next'); send.type = 'button';
    send.onclick = async () => { send.disabled = true; try { const e = await S.probe(r, p.value, 2500); say(r[0] + '/' + r[1] + ': ' + e.status + (e.replies.length ? ' · ' + e.replies.slice(0, 2).join(' | ') : '')); stepIdx++; } catch (er) { say('Not sent: ' + er.message); } renderTable(); renderStep(); };
    const skip = mk('button', btn, 'Skip'); skip.type = 'button'; skip.onclick = () => { stepIdx++; renderStep(); };
    bs.append(send, skip); row.append(p, b); if (warn) row.appendChild(warn); row.appendChild(bs); box.appendChild(row);
  };

  // ---------- listening ----------
  S.startListen = (label) => { S.listen.on = true; S.listen.label = label || 'untitled'; renderListen(); };
  S.stopListen = () => { S.listen.on = false; renderListen(); };
  const renderListen = () => {
    const e = $('svListen'); if (!e) return; const rows = Object.values(S.listen.rows);
    e.textContent = (S.listen.on ? 'Listening as "' + S.listen.label + '". ' : 'Not listening. ') + (rows.length ? rows.length + ' key/label combinations seen.' : 'Nothing recorded yet.');
    const t = $('svListenTable'); if (!t) return; t.textContent = '';
    rows.slice(-40).forEach((r) => t.appendChild(mk('div', 'font-size:10px;font-family:monospace;color:#cbd5e1;', r.label + ' · ' + r.id + ' ×' + r.count + ' · ' + r.first.slice(0, 40))));
  };

  // ---------- results table and CSV ----------
  const COL = { answered: '#4ade80', other: '#38bdf8', silent: '#94a3b8', blocked: '#f87171' };
  function renderTable() {
    const t = $('svTable'); if (!t) return; t.textContent = ''; const f = $('svFilter') ? $('svFilter').value : 'all';
    const rows = Object.values(S.results).filter((r) => f === 'all' || r.status === f).sort((a, b) => (a.id < b.id ? -1 : 1));
    const c = { answered: 0, other: 0, silent: 0, blocked: 0 }; Object.values(S.results).forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    const sum = $('svSummary'); if (sum) sum.textContent = Object.keys(S.results).length + ' tested: ' + c.answered + ' answered, ' + c.other + ' other frames, ' + c.silent + ' silent, ' + c.blocked + ' blocked.';
    rows.forEach((r) => t.appendChild(mk('div', 'font-size:10px;font-family:monospace;color:' + (COL[r.status] || '#cbd5e1') + ';line-height:1.35;word-break:break-all;', r.id + ' ' + r.status + (r.name ? ' ' + r.name : '') + (r.replies && r.replies.length ? ' → ' + r.replies[0].slice(0, 70) : ''))));
  }
  const dl = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
  const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  S.csv = () => {
    const d = new Date(), tag = d.getFullYear() + '-' + h2(d.getMonth() + 1) + '-' + h2(d.getDate());
    dl('ht37-survey-' + tag + '.csv', 'cmd_key,sdk_name,tier,payload_hex,status,time_local,replies\n' + Object.values(S.results).map((r) => [r.id, q(r.name), r.tier, q(r.payload), r.status, q(new Date(r.t).toLocaleString('en-US')), q((r.replies || []).join(' | '))].join(',')).join('\n') + '\n');
    const L = Object.values(S.listen.rows); if (L.length) dl('ht37-listen-' + tag + '.csv', 'label,cmd_key,count,first_seen,first_bytes,last_bytes\n' + L.map((r) => [q(r.label), r.id, r.count, r.t, q(r.first), q(r.last)].join(',')).join('\n') + '\n');
  };

  // ---------- UI ----------
  const mk = (tag, style, text) => { const e = document.createElement(tag); if (style) e.style.cssText = style; if (text != null) e.textContent = text; return e; };
  const hint = 'font-size:10px;color:#94a3b8;line-height:1.3;';
  const btn = 'height:28px;font-size:11px;font-weight:600;background:#1e293b;color:#e2e8f0;border:1px solid #334155;cursor:pointer;padding:0 8px;';
  const inCss = 'width:100% !important;height:26px;font-size:11px;background:#111827;color:#e2e8f0;border:1px solid #334155;box-sizing:border-box;';
  HT37.ui.registerMount({
    id: 'alerts.tool6', page: 'alerts', order: 270, title: '6. Command Survey',
    run(ctx) {
      const { makeToolCard } = ctx; const { alertsToolbox } = ctx.shared;
      if (!alertsToolbox || $('toolCard_6_alerts')) return;
      const body = mk('div', 'display:flex;flex-direction:column;gap:6px;');
      body.appendChild(mk('div', hint, 'Finds out what unknown and unused commands do. Every probe is one small frame; the watch\'s answers are recorded in the table below and can be saved as CSV. Dangerous commands (reset, shut down, reboot, unbind, name, address, language, firmware) are never sent.'));
      // 1. automatic queries
      body.appendChild(mk('div', 'font-size:11px;font-weight:700;color:#38bdf8;', '1. Ask the watch (queries only)'));
      const c1 = mk('label', hint + 'display:flex;gap:6px;align-items:flex-start;'); const k1 = mk('input'); k1.type = 'checkbox'; k1.id = 'svUnn'; c1.append(k1, mk('span', null, 'Also commands whose purpose the SDK hides'));
      const c2 = mk('label', hint + 'display:flex;gap:6px;align-items:flex-start;'); const k2 = mk('input'); k2.type = 'checkbox'; k2.id = 'svTri'; k2.checked = true; c2.append(k2, mk('span', null, 'Also the predicted per-setting reads (02/13, 02/16, ...)'));
      const c3 = mk('label', hint + 'display:flex;gap:6px;align-items:flex-start;'); const k3 = mk('input'); k3.type = 'checkbox'; k3.id = 'svSkipDone'; k3.checked = true; c3.append(k3, mk('span', null, 'Skip ones already tested'));
      const wr = mk('label', hint, 'Wait for a reply (seconds)'); const wi = mk('input', inCss); wi.type = 'number'; wi.id = 'svWait'; wi.min = 1; wi.max = 10; wi.step = 0.5; wi.value = 2.5; wr.appendChild(wi);
      const run = mk('button', btn + 'background:#10b981;color:#fff;border:none;', '▶ Run queries'); run.type = 'button';
      run.onclick = () => S.runAuto(['read'].concat(k1.checked ? ['unnamed'] : [], k2.checked ? ['triple'] : []));
      const stop = mk('button', btn + 'background:#ef4444;color:#fff;border:none;', '■ Stop'); stop.type = 'button'; stop.onclick = () => { S.stop = true; };
      const rr = mk('div', 'display:flex;gap:6px;'); rr.append(run, stop);
      body.append(c1, c2, c3, wr, rr);
      // 2. step mode
      body.appendChild(mk('div', 'font-size:11px;font-weight:700;color:#38bdf8;margin-top:4px;', '2. One at a time (you press Send each time)'));
      const sel = mk('select', inCss); sel.id = 'svList'; LISTS.forEach((l) => { const o = mk('option', null, l[1]); o.value = l[0]; sel.appendChild(o); });
      const st = mk('button', btn, 'Start this list'); st.type = 'button'; st.onclick = () => { stepList = pick(sel.value); stepIdx = 0; renderStep(); };
      body.append(sel, st); const sb = mk('div'); sb.id = 'svStep'; body.appendChild(sb);
      // 3. listening
      body.appendChild(mk('div', 'font-size:11px;font-weight:700;color:#38bdf8;margin-top:4px;', '3. Just listen (sends nothing)'));
      body.appendChild(mk('div', hint, 'Type what you are about to do on the watch, press Listen, then do it. Change the label and press Listen again for the next thing.'));
      const lb = mk('input', inCss); lb.id = 'svLabel'; lb.placeholder = 'e.g. opened the compass app';
      const nz = mk('label', hint + 'display:flex;gap:6px;'); const kn = mk('input'); kn.type = 'checkbox'; kn.id = 'svNoise'; nz.append(kn, mk('span', null, 'Also show the usual pushes (05/22, battery, wake)'));
      const lr = mk('div', 'display:flex;gap:6px;'); const l1 = mk('button', btn + 'background:#0369a1;color:#fff;border:none;', '👂 Listen'); l1.type = 'button'; l1.onclick = () => S.startListen(lb.value);
      const l2 = mk('button', btn, 'Stop listening'); l2.type = 'button'; l2.onclick = () => S.stopListen(); lr.append(l1, l2);
      const ls = mk('div', hint); ls.id = 'svListen'; const lt = mk('div', 'max-height:120px;overflow:auto;'); lt.id = 'svListenTable';
      body.append(lb, nz, lr, ls, lt);
      // results
      body.appendChild(mk('div', 'font-size:11px;font-weight:700;color:#38bdf8;margin-top:4px;', 'Results'));
      const sm = mk('div', hint); sm.id = 'svSummary'; const stt = mk('div', hint); stt.id = 'svStatus';
      const fl = mk('select', inCss); fl.id = 'svFilter'; [['all', 'Show all'], ['answered', 'Answered'], ['other', 'Other frames'], ['silent', 'Silent'], ['blocked', 'Blocked']].forEach((a) => { const o = mk('option', null, a[1]); o.value = a[0]; fl.appendChild(o); }); fl.onchange = renderTable;
      const tb = mk('div', 'max-height:260px;overflow:auto;border:1px solid #1e293b;padding:4px;background:#04080c;'); tb.id = 'svTable';
      const cv = mk('button', btn, '⬇ Save results as CSV'); cv.type = 'button'; cv.onclick = S.csv;
      const cl = mk('button', btn, 'Clear results'); cl.type = 'button'; cl.onclick = () => { S.results = {}; save(); renderTable(); };
      const br = mk('div', 'display:flex;gap:6px;'); br.append(cv, cl);
      body.append(stt, sm, fl, tb, br);
      const card = makeToolCard('6', 'Command Survey', body);
      if (card) { card.id = 'toolCard_6_alerts'; alertsToolbox.appendChild(card); }
      renderTable(); renderListen(); renderStep();
    },
  });
})(typeof window !== 'undefined' ? window : this);
