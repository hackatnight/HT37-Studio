/**
 * @file     js/pages/alerts/tool-5-watch-audio.js
 * @layer    UI mount + protocol helpers
 * @summary  Tab 2 tool 5 "Watch Microphone & Speaker": record from the watch mic and play sound on the watch speaker through the Windows Bluetooth headset (Hands-Free) pairing; the old vendor-BLE-Opus test is kept under Advanced.
 *
 * HEADSET ROUTE (Nov 1 2026): after the watch is paired in Windows Bluetooth settings as an audio device, Chrome lists it as
 *   "Headset (HT37 Hands-Free AG Audio) (Bluetooth)" for both audioinput and audiooutput. getUserMedia({deviceId}) records the watch
 *   mic and HTMLMediaElement.setSinkId plays to the watch speaker. Needs the mic permission prompt allowed once. Not yet verified with speech.
 *
 * ROLE
 *   - The vendor SDK (FcOpusFeature) streams audio over its own BLE service
 *     0000aa55-3c17-d293-8e48-14fe2e4da212: write characteristic 0000ab02 (control + audio to the watch) and
 *     notify characteristic 0000aa02 (audio from the watch). Frames are `55 AA 01 [len hi][len lo][opus bytes]`.
 *   - Record flow copied from the SDK: subscribe to aa02, write 01 to ab02 (start), collect frames, write 02 (stop).
 *     The app decodes 16 kHz mono Opus in 80-byte packets (20 ms each); this tool does the same with WebCodecs.
 *   - UNVERIFIED on hardware. The watch's feature flags say PLAY_OPUS and SPEECH_SCO are supported but not the
 *     voice-assistant flags, so it may ignore the start byte. The tool logs everything the watch sends.
 *   - Sending audio TO the watch is not built: in the SDK the watch asks for it by sending 0x03 on aa02 (this
 *     tool logs that if it happens) and we do not know what makes the watch ask yet.
 *
 * REGISTERS
 *   - ui.registerMount(id:alerts.tool5, page:alerts, order:260); HT37.watchAudio = { probe, record, findHeadset, recordHeadset, playToWatch }
 *
 * USES: HT37, bleServer (top-level let), log, OPTIONAL_SERVICES (the page must be paired AFTER the aa55 service was
 *   added there, so re-pair once after updating).
 *
 * DOM IDS TOUCHED
 *   #toolCard_5_alerts #wsAudioStatus #wsAudioPlayer
 *
 * See AI_GUIDE.md and docs/APP_COMMANDS.md.
 */
(function (window) {
  'use strict';
  const HT37 = window.HT37;
  const SVC = '0000aa55-3c17-d293-8e48-14fe2e4da212', WR = '0000ab02-0000-1000-8000-00805f9b34fb', RD = '0000aa02-0000-1000-8000-00805f9b34fb';
  const A = HT37.watchAudio = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const hex = (a, n) => Array.from(a.subarray(0, n || a.length)).map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  const status = (t) => { const e = document.getElementById('wsAudioStatus'); if (e) e.textContent = t; };

  async function getChars() {
    let connected = false; try { connected = !!(bleServer && bleServer.connected); } catch (e) { /* not defined yet */ }
    if (!connected) throw new Error('Pair & Bind to the watch first.');
    let svc;
    try { svc = await bleServer.getPrimaryService(SVC); }
    catch (e) { throw new Error('The audio service is not available (' + e.name + '). Hard-refresh the page and Pair & Bind again so Chrome can ask for it, or this watch does not have it.'); }
    return { svc, wr: await svc.getCharacteristic(WR), rd: await svc.getCharacteristic(RD) };
  }

  A.probe = async () => {
    try {
      const { svc } = await getChars();
      const cs = await svc.getCharacteristics();
      const lines = cs.map((c) => c.uuid.slice(4, 8) + ' [' + Object.keys(c.properties).filter((k) => c.properties[k]).join(',') + ']');
      log('Audio service found. Characteristics: ' + lines.join('; '), 'ok'); status('Audio service found: ' + lines.join('; '));
    } catch (e) { log('Audio probe: ' + e.message, 'err'); status(e.message); }
  };

  // frames `55 AA 01 LL LL data` may be split across notifications, so keep a buffer
  function parseFrames(buf, out) {
    let i = 0;
    while (i + 5 <= buf.length) {
      if (buf[i] !== 0x55 || buf[i + 1] !== 0xAA || buf[i + 2] !== 0x01) { i++; continue; }
      const len = (buf[i + 3] << 8) | buf[i + 4];
      if (i + 5 + len > buf.length) break;
      out.push(buf.slice(i + 5, i + 5 + len)); i += 5 + len;
    }
    return buf.slice(i);
  }
  function wav16(f32, rate) {
    const n = f32.length, b = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, s) => { for (let k = 0; k < s.length; k++) b.setUint8(o + k, s.charCodeAt(k)); };
    w(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
    b.setUint32(24, rate, true); b.setUint32(28, rate * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, n * 2, true);
    for (let k = 0; k < n; k++) b.setInt16(44 + k * 2, Math.max(-1, Math.min(1, f32[k])) * 32767, true);
    return new Blob([b.buffer], { type: 'audio/wav' });
  }

  A.record = async (seconds) => {
    seconds = Math.max(1, Math.min(30, seconds | 0 || 5));
    try {
      const { wr, rd } = await getChars();
      const notes = []; let buf = new Uint8Array(0); const payloads = []; let first = [];
      const onN = (e) => {
        const v = new Uint8Array(e.target.value.buffer.slice(e.target.value.byteOffset, e.target.value.byteOffset + e.target.value.byteLength));
        notes.push(v.length); if (first.length < 4) first.push(hex(v, 24));
        if (v.length && v[0] === 0x03 && v.length < 5) log('Watch sent 0x03 on the audio channel (it is asking for audio).', 'ok');
        const merged = new Uint8Array(buf.length + v.length); merged.set(buf); merged.set(v, buf.length); buf = parseFrames(merged, payloads);
      };
      // connection.js already subscribed every notify characteristic to the command-frame handler: detach it while recording so audio is not parsed as command frames
      try { rd.removeEventListener('characteristicvaluechanged', handleBleNotification); } catch (e) { /* ignore */ }
      rd.addEventListener('characteristicvaluechanged', onN);
      await rd.startNotifications();
      status('Listening… speak near the watch (' + seconds + ' s)'); log('Audio: sent start (01) to ab02, listening ' + seconds + ' s…', 'ok');
      await wr.writeValue(Uint8Array.of(0x01));
      await sleep(seconds * 1000);
      await wr.writeValue(Uint8Array.of(0x02)); await sleep(400);
      rd.removeEventListener('characteristicvaluechanged', onN); try { rd.addEventListener('characteristicvaluechanged', handleBleNotification); } catch (e) { /* ignore */ }
      const total = notes.reduce((a, b) => a + b, 0);
      log('Audio: ' + notes.length + ' notifications, ' + total + ' bytes, ' + payloads.length + ' frames. First: ' + (first.join(' | ') || 'none'), notes.length ? 'ok' : 'err');
      if (!payloads.length) { status('The watch sent no audio frames (' + notes.length + ' notifications). It may not start the mic from this command.'); return; }
      // 80-byte packets (the app splits the stream into 80-byte Opus packets)
      const packets = []; payloads.forEach((p) => { if (p.length % 80 === 0) for (let k = 0; k < p.length; k += 80) packets.push(p.slice(k, k + 80)); else packets.push(p); });
      if (typeof AudioDecoder === 'undefined') { status('Got ' + packets.length + ' packets but this browser has no WebCodecs AudioDecoder.'); return; }
      let rate = 16000; const pcm = []; const dec = new AudioDecoder({ output: (ad) => { rate = ad.sampleRate; const f = new Float32Array(ad.numberOfFrames); ad.copyTo(f, { planeIndex: 0 }); pcm.push(f); ad.close(); }, error: (e) => log('Opus decode error: ' + e.message, 'err') });
      dec.configure({ codec: 'opus', sampleRate: 16000, numberOfChannels: 1 });
      packets.forEach((p, i) => dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: i * 20000, data: p })));
      await dec.flush(); dec.close();
      const n = pcm.reduce((a, b) => a + b.length, 0), all = new Float32Array(n); let o = 0; pcm.forEach((f) => { all.set(f, o); o += f.length; });
      const url = URL.createObjectURL(wav16(all, rate));   // Chrome may output 48 kHz even when configured for 16 kHz: use the real rate
      let pl = document.getElementById('wsAudioPlayer'); if (pl) { pl.src = url; pl.style.display = 'block'; }
      status('Recorded ' + (n / rate).toFixed(1) + ' s from ' + packets.length + ' packets. Press play below.'); log('Audio decoded: ' + (n / rate).toFixed(1) + ' s (' + rate + ' Hz mono).', 'ok');
    } catch (e) { log('Audio record: ' + e.message, 'err'); status(e.message); }
  };

  // ---- Windows Bluetooth headset route (Hands-Free profile) ----
  let lastRec = null;   // { url, blob } of the last headset recording
  async function ensurePerm() { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); }
  A.findHeadset = async () => {
    if (!navigator.mediaDevices) throw new Error('This browser has no microphone access (needs localhost or https).');
    await ensurePerm();
    const d = await navigator.mediaDevices.enumerateDevices();
    const pick = (kind) => d.find((x) => x.kind === kind && /HT37|Hands-?Free/i.test(x.label) && !/^(Default|Communications) - /.test(x.label)) || d.find((x) => x.kind === kind && /HT37|Hands-?Free/i.test(x.label));
    const mic = pick('audioinput'), spk = pick('audiooutput');
    if (!mic) throw new Error('The watch is not listed as a microphone. In Windows: Settings > Bluetooth & devices, add the watch as a Bluetooth device, and make sure it says Connected.');
    return { mic, spk };
  };
  A.recordHeadset = async (seconds) => {
    seconds = Math.max(1, Math.min(30, seconds | 0 || 5));
    try {
      const { mic } = await A.findHeadset();
      status('Opening the watch microphone… (Windows may take a few seconds to open the call link)');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: mic.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = new (window.AudioContext || window.webkitAudioContext)(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
      const chunks = [], rec = new MediaRecorder(stream), buf = new Float32Array(an.fftSize); let peak = 0;
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const tick = setInterval(() => { an.getFloatTimeDomainData(buf); let m = 0; for (let k = 0; k < buf.length; k++) m = Math.max(m, Math.abs(buf[k])); peak = Math.max(peak, m); }, 50);
      const done = new Promise((r) => { rec.onstop = r; });
      rec.start(); status('Recording ' + seconds + ' s: speak close to the watch now.'); log('Watch mic: recording ' + seconds + ' s from "' + mic.label + '" (' + ctx.sampleRate + ' Hz context).', 'ok');
      await sleep(seconds * 1000); rec.stop(); await done; clearInterval(tick);
      stream.getTracks().forEach((t) => t.stop()); ctx.close();
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' }); const url = URL.createObjectURL(blob); lastRec = { url, blob };
      const pl = document.getElementById('wsAudioPlayer'); if (pl) { pl.src = url; pl.style.display = 'block'; }
      const msg = peak < 0.003 ? 'Recorded, but it is silent (peak ' + peak.toFixed(4) + '). The watch mic may not have opened. Try speaking closer, or open the voice assistant on the watch first.' : 'Recorded ' + seconds + ' s, loudest point ' + Math.round(peak * 100) + '%. Press play below.';
      status(msg); log('Watch mic: ' + msg, peak < 0.003 ? 'err' : 'ok');
    } catch (e) { log('Watch mic: ' + e.message, 'err'); status(e.message); }
  };
  // plays a short two-note tone (or the last recording) through the watch speaker
  function tone() {
    const rate = 16000, n = rate * 1.2, f = new Float32Array(n);
    for (let k = 0; k < n; k++) { const t = k / rate, hz = t < 0.6 ? 523 : 784, env = Math.min(1, (t % 0.6) * 40, (0.6 - (t % 0.6)) * 40); f[k] = 0.5 * env * Math.sin(2 * Math.PI * hz * t); }
    return URL.createObjectURL(wav16(f, rate));
  }
  A.playToWatch = async (useRecording) => {
    try {
      const { spk } = await A.findHeadset();
      if (!spk) throw new Error('The watch is not listed as a speaker.');
      const a = new Audio(useRecording && lastRec ? lastRec.url : tone());
      if (!a.setSinkId) throw new Error('This browser cannot choose an output device.');
      await a.setSinkId(spk.deviceId); await a.play();
      status('Playing ' + (useRecording && lastRec ? 'the last recording' : 'a test tone') + ' to "' + spk.label + '". Listen at the watch (the volume is low on watches).'); log('Watch speaker: playing to "' + spk.label + '".', 'ok');
    } catch (e) { log('Watch speaker: ' + e.message, 'err'); status(e.message); }
  };

  const el = (tag, style, text) => { const e = document.createElement(tag); if (style) e.style.cssText = style; if (text != null) e.textContent = text; return e; };
  const btnCss = 'width:100%;height:28px;font-size:11px;font-weight:600;background:#1e293b;color:#e2e8f0;border:1px solid #334155;cursor:pointer;';
  HT37.ui.registerMount({
    id: 'alerts.tool5', page: 'alerts', order: 260, title: '5. Watch Microphone & Speaker',
    run(ctx) {
      const { makeToolCard } = ctx; const { alertsToolbox } = ctx.shared;
      if (!alertsToolbox || document.getElementById('toolCard_5_alerts')) return;
      const body = el('div', 'display:flex;flex-direction:column;gap:6px;');
      const hint = 'font-size:10px;color:#94a3b8;line-height:1.3;';
      body.appendChild(el('div', hint, 'Uses the watch as a Bluetooth headset. First add the watch in Windows (Settings > Bluetooth & devices) so it shows as "HT37 Hands-Free". Chrome asks for microphone permission once: click Allow. Experimental, not yet verified with speech.'));
      const row = el('div', 'display:flex;gap:6px;align-items:center;');
      const sec = el('input', 'width:52px !important;height:26px;font-size:11px;background:#111827;color:#e2e8f0;border:1px solid #334155;text-align:center;'); sec.type = 'number'; sec.min = 1; sec.max = 30; sec.value = 5; sec.title = 'Seconds to record';
      const b2 = el('button', btnCss + 'background:#10b981;color:#fff;border:none;', '🎙 Record from watch mic'); b2.type = 'button'; b2.onclick = () => A.recordHeadset(+sec.value);
      row.append(sec, b2); body.appendChild(row);
      const b3 = el('button', btnCss, '🔊 Play test tone on watch'); b3.type = 'button'; b3.title = 'Sends a short two-note tone to the watch speaker through the Bluetooth headset'; b3.onclick = () => A.playToWatch(false); body.appendChild(b3);
      const b4 = el('button', btnCss, '🔁 Play last recording on watch'); b4.type = 'button'; b4.onclick = () => A.playToWatch(true); body.appendChild(b4);
      const st = el('div', hint, ''); st.id = 'wsAudioStatus'; body.appendChild(st);
      const pl = el('audio', 'width:100%;display:none;'); pl.id = 'wsAudioPlayer'; pl.controls = true; body.appendChild(pl);
      const adv = el('details', hint); adv.appendChild(el('summary', 'cursor:pointer;', 'Advanced: vendor Bluetooth audio service (this watch does not have it)'));
      const b1 = el('button', btnCss + 'margin-top:4px;', '🔎 Check audio service'); b1.type = 'button'; b1.onclick = () => A.probe();
      const b5 = el('button', btnCss + 'margin-top:4px;', '🎙 Record over Bluetooth service'); b5.type = 'button'; b5.onclick = () => A.record(+sec.value);
      adv.append(b1, b5); body.appendChild(adv);
      const card = makeToolCard('5', 'Watch Microphone & Speaker', body);
      if (card) { card.id = 'toolCard_5_alerts'; alertsToolbox.appendChild(card); }
    },
  });
})(typeof window !== 'undefined' ? window : this);
