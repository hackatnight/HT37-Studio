/**
 * @file     js/ui/shell.js
 * @layer    UI framework
 * @summary  HT37.ui: page registry + mount-unit registry + the bootstrap that builds tabs and toolboxes.
 *
 * ROLE
 *   - registerPage({ id, tabId, navLabel, order, layout: "grid-3col"|"2col", columns, centerHTML? }) → a tab
 *     button and a pane with left/center(/right) columns.
 *   - registerMount({ id, page?, order, title, run(ctx) }) → one toolbox card / stage / dock. Runs once at
 *     DOMContentLoaded, sorted by `order`; a unit whose page is not registered is skipped; each unit is
 *     try/catch-isolated.
 *   - ctx = { nav, header, container, getCard, makeToolCard, shared, pages:{id:{left,center,right}},
 *     studioLeft… aliases }. ctx.shared passes values between units of the same page.
 *   - makeToolCard(num, title, bodyElement) wraps a pooled element in a collapsible "toolbox-tool-card";
 *     getCard(id) finds the section that contains an element id.
 *   - start() (called by ui/start.js) runs setupStudio at DOMContentLoaded.
 *
 * REGISTERS
 *   - HT37.ui
 *
 * PROVIDES (globals)
 *   window. HT37
 *
 * USES (defined in other files)
 *   - js/editor/state.js: ctx
 *
 * DOM IDS TOUCHED
 *   #alertsLeftCol #dfuLeftCol #logsLeftCol #studioCenterCol #studioLeftCol #studioMainContainer
 *   #studioRightCol #studioTabNav #toolCard_
 *
 * LOAD ORDER
 *   #40 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/ui/pool-generators.js   before: js/pages/studio/page.js
 *
 * NOTES
 *   - Order bands in use: studio 100-140, alerts 200-240, dfu 300, logs 400, studio stage 500, dock 600,
 *     cleanup 610, tabs 620.
 *
 * HOW TO EXTEND
 *   - New tab: add js/pages/<id>/page.js (registerPage) + mount files, then <script> tags before ui/start.js.
 *   - New toolbox card: add a mount file with a free `order` inside its page's band.
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
window.HT37 = window.HT37 || {};
HT37.ui = (function () {
  const pages = [];    // tab pages registered via registerPage()
  const mounts = [];   // toolbox/stage "mount units" registered via registerMount()

  /** Register a tab page. See js/pages/<id>/page.js for the full field list. */
  function registerPage(def) {
    if (!def || !def.id) throw new Error('registerPage: id required');
    if (pages.some((p) => p.id === def.id)) throw new Error('registerPage: duplicate page id ' + def.id);
    pages.push(def);
  }

  /**
   * Register a mount unit: a function that builds one toolbox card / stage / dock.
   *   { id, page?, order, title, run(ctx) }
   * Units run once, at DOMContentLoaded, sorted by `order` (ascending). A unit whose `page` is not registered is skipped,
   * so removing a page's <script> tags removes it cleanly. Errors are caught per unit (one bad card never blanks the app).
   * ctx = { nav, header, container, getCard, makeToolCard, shared, pages:{<id>:{left,center,right}}, + legacy aliases
   *         studioLeft/studioCenter/studioRight/alertsLeft/dfuLeft/logsLeft }.  ctx.shared hands values between units.
   */
  function registerMount(def) {
    if (!def || !def.id || typeof def.run !== 'function') throw new Error('registerMount: {id, run} required');
    mounts.push(def);
  }

  function getCard(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    let card = el.closest('.section-card, .card, section, details, .panel');
    if (card && card !== document.body && card.tagName !== 'MAIN') return card;
    if (el.parentElement && el.parentElement !== document.body && el.parentElement.tagName !== 'MAIN') {
      return el.parentElement;
    }
    return el;
  }

  function makeToolCard(num, title, bodyElement) {
    if (!bodyElement) return null;
    const card = document.createElement('div');
    card.className = 'toolbox-tool-card';
    card.id = 'toolCard_' + num.replace(/[^a-zA-Z0-9]/g, '_');
      
    const header = document.createElement('div');
    header.className = 'toolbox-tool-header';
    header.innerHTML = `<span>${num}. ${title}</span><span class="tool-chevron">▾</span>`;
      
    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'toolbox-tool-body';
    bodyWrap.appendChild(bodyElement);
    bodyElement.style.display = 'block';

    const chev = header.querySelector('.tool-chevron');
    header.addEventListener('click', () => {
      const isNowCollapsed = bodyWrap.classList.toggle('is-collapsed');
      chev.textContent = isNowCollapsed ? '▸' : '▾';
    });

    card.appendChild(header);
    card.appendChild(bodyWrap);
    return card;
  }

  const byOrder = (a, b) => (a.order || 0) - (b.order || 0);

  function paneHTML(p, first) {
    const active = first ? ' active' : '';
    const c = p.columns;
    if (p.layout === 'grid-3col') {
      return '<div id="' + p.tabId + '" class="studio-tab-pane' + active + '"><div class="studio-grid-3col">' +
        '<div class="studio-col-left" id="' + c.left + '"></div>' +
        '<div class="studio-col-center" id="' + c.center + '"></div>' +
        '<div class="studio-col-right" id="' + c.right + '"></div></div></div>';
    }
    return '<div id="' + p.tabId + '" class="studio-tab-pane' + active + '"><div class="studio-2col-layout">' +
      '<div class="studio-col-left" id="' + c.left + '"></div>' +
      '<div class="studio-col-center">' + (p.centerHTML || '') + '</div></div></div>';
  }

  function setupStudio() {
    const nav = document.getElementById('studioTabNav');
    if (!nav) return;
    const header = document.querySelector('header');
    const sorted = pages.slice().sort(byOrder);

    // 1. Tab buttons are generated from the page registry
    if (!nav.children.length) {
      nav.innerHTML = sorted.map((p, i) =>
        '<button type="button" class="studio-tab-btn' + (i === 0 ? ' active' : '') + '" data-tab="' + p.tabId + '">' + p.navLabel + '</button>').join('\n');
    }

    // 2. Viewport panes (one per page) are generated from the page registry
    let container = document.getElementById('studioMainContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'studioMainContainer';
      container.className = 'studio-tab-container';
      container.innerHTML = sorted.map((p, i) => paneHTML(p, i === 0)).join('\n');
      nav.parentNode.insertBefore(container, nav.nextSibling);
    }

    // 3. Mount context
    const ctx = { nav, header, container, getCard, makeToolCard, shared: {}, pages: {} };
    sorted.forEach((p) => {
      const col = (k) => (p.columns[k] ? document.getElementById(p.columns[k]) : null);
      ctx.pages[p.id] = { left: col('left'), center: col('center'), right: col('right') };
    });
    ctx.studioLeft = document.getElementById('studioLeftCol');
    ctx.studioCenter = document.getElementById('studioCenterCol');
    ctx.studioRight = document.getElementById('studioRightCol');
    ctx.alertsLeft = document.getElementById('alertsLeftCol');
    ctx.dfuLeft = document.getElementById('dfuLeftCol');
    ctx.logsLeft = document.getElementById('logsLeftCol');

    // 4. Run mount units in order
    const known = new Set(pages.map((p) => p.id));
    mounts.slice().sort(byOrder).forEach((m) => {
      if (m.page && !known.has(m.page)) return;
      try { m.run(ctx); } catch (err) { console.warn('[HT37.ui] mount "' + m.id + '" failed:', err); }
    });
  }

  /** Called once by js/ui/start.js after every script has registered itself. */
  function start() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupStudio);
    else setupStudio();
  }

  return { pages, mounts, registerPage, registerMount, getCard, makeToolCard, start };
})();
