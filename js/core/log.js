/**
 * @file     js/core/log.js
 * @layer    Core
 * @summary  Logging: log() writes to the bottom dock AND the Tab-4 terminal; plus timeout and clipboard helpers.
 *
 * ROLE
 *   - log(msg, type): type is "" | ok | err | warn | tx | rx (CSS class on .log-entry). Prefixes a [time]
 *     stamp, appends to logHistory[] and window.structuredLogHistory[{line,type}], and renders into
 *     #logTerminal (dock) and #tab4LogTerminal (Tab 4, honoring window.currentLogFilter and
 *     #tab4LogSearchInput).
 *   - Global "error" and "unhandledrejection" events are routed into log(…, "err").
 *   - withTimeout(promise, ms, label) rejects after ms — every BLE operation uses it.
 *   - copyAllLogs() copies logHistory; clearLogs() empties both terminals.
 *
 * PROVIDES (globals)
 *   let logHistory, function renderTab4Entries, function log, function withTimeout, function copyAllLogs,
 *   function clearLogs, window. structuredLogHistory
 *
 * DOM IDS TOUCHED
 *   #logTerminal #tab4LogSearchInput #tab4LogTerminal
 *
 * LOAD ORDER
 *   #5 of 62, section "2. CORE  (logging, small UI helpers)"
 *   after: js/protocol/constants.js   before: js/ui/helpers.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
let logHistory = [];

window.structuredLogHistory = [];

function renderTab4Entries() {
  const t4 = document.getElementById('tab4LogTerminal');
  if (!t4) return;
  t4.innerHTML = '';
  const searchInput = document.getElementById('tab4LogSearchInput');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const mode = window.currentLogFilter || 'all';

  window.structuredLogHistory.forEach(item => {
    if (mode === 'err' && !(item.type === 'err' || item.type === 'warn')) return;
    if (mode !== 'all' && mode !== 'err' && item.type !== mode) return;
    if (query && !item.line.toLowerCase().includes(query)) return;

    const div = document.createElement('div');
    div.className = 'log-entry ' + (item.type || '');
    div.textContent = item.line;
    t4.appendChild(div);
  });
  t4.scrollTop = t4.scrollHeight;
}

function log(msg, type = '') {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logHistory.push(line);
  if (!window.structuredLogHistory) window.structuredLogHistory = [];
  window.structuredLogHistory.push({ line, type });

  // Update bottom persistent dock
  const bDock = document.getElementById('logTerminal');
  if (bDock) {
    const divB = document.createElement('div');
    divB.className = 'log-entry ' + type;
    divB.textContent = line;
    bDock.appendChild(divB);
    bDock.scrollTop = bDock.scrollHeight;
  }

  // Update Tab 4 full-screen terminal if it matches current filter
  const t4 = document.getElementById('tab4LogTerminal');
  if (t4) {
    const mode = window.currentLogFilter || 'all';
    let match = (mode === 'all') || (mode === 'err' && (type === 'err' || type === 'warn')) || (mode === type);
    const searchInput = document.getElementById('tab4LogSearchInput');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (query && !line.toLowerCase().includes(query)) match = false;
    if (match) {
      const div4 = document.createElement('div');
      div4.className = 'log-entry ' + type;
      div4.textContent = line;
      t4.appendChild(div4);
      t4.scrollTop = t4.scrollHeight;
    }
  }
}

window.addEventListener('error', (ev) => log(`JS Error: ${ev.message} (line ${ev.lineno})`, 'err'));

window.addEventListener('unhandledrejection', (ev) => log(`Async Error: ${ev.reason?.message || ev.reason}`, 'err'));

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function copyAllLogs() {
  const text = logHistory.join('\n');
  try { await navigator.clipboard.writeText(text); log('Copied all terminal logs to clipboard!', 'ok'); }
  catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    log('Copied all terminal logs to clipboard (fallback)!', 'ok');
  }
}

function clearLogs() {
  logHistory = [];
  window.structuredLogHistory = [];
  const bDock = document.getElementById('logTerminal');
  if (bDock) bDock.innerHTML = '';
  const t4 = document.getElementById('tab4LogTerminal');
  if (t4) t4.innerHTML = '';
  log('Logs cleared.', 'rx');
}
