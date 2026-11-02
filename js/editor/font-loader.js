/**
 * @file     js/editor/font-loader.js
 * @layer    EDITOR art (number fonts for widgets)
 * @summary  Open-source number fonts (SIL Open Font License, from Google Fonts, loaded on first use, needs internet) plus "System sans" (the font
 *           of this computer, not open source). Widgets bake the glyphs into the face as sprites, so the font is only needed while designing.
 * API  HT37.fonts = { LIST, css(font, weight, px), load(font) -> Promise<boolean>, ready(font), resolve(font) -> usable font id }
 */
(function () {
  window.HT37 = window.HT37 || {};
  const LIST = [['system', 'System sans (this computer)'],
    ['Roboto', 'Roboto'], ['Inter', 'Inter'], ['Open Sans', 'Open Sans'], ['Lato', 'Lato'], ['Montserrat', 'Montserrat'], ['Poppins', 'Poppins'], ['Nunito', 'Nunito'], ['Rubik', 'Rubik'], ['Barlow', 'Barlow'],
    ['Roboto Condensed', 'Roboto Condensed'], ['Barlow Condensed', 'Barlow Condensed'], ['Oswald', 'Oswald (condensed)'], ['Anton', 'Anton (heavy condensed)'], ['Bebas Neue', 'Bebas Neue (tall caps)'], ['Fjalla One', 'Fjalla One'], ['Teko', 'Teko'], ['Staatliches', 'Staatliches'],
    ['Roboto Mono', 'Roboto Mono'], ['JetBrains Mono', 'JetBrains Mono'], ['IBM Plex Mono', 'IBM Plex Mono'], ['Space Mono', 'Space Mono'], ['DM Mono', 'DM Mono'], ['Share Tech Mono', 'Share Tech Mono'], ['VT323', 'VT323 (terminal)'], ['Press Start 2P', 'Press Start 2P (pixel)'],
    ['Orbitron', 'Orbitron (techno)'], ['Rajdhani', 'Rajdhani (narrow techno)'], ['Exo 2', 'Exo 2'], ['Saira', 'Saira'], ['Saira Condensed', 'Saira Condensed'], ['Chakra Petch', 'Chakra Petch'], ['Oxanium', 'Oxanium'], ['Quantico', 'Quantico'], ['Electrolize', 'Electrolize'], ['Aldrich', 'Aldrich'], ['Audiowide', 'Audiowide (wide)'], ['Michroma', 'Michroma (wide)'], ['Syncopate', 'Syncopate (wide)'], ['Iceland', 'Iceland'],
    ['Russo One', 'Russo One'], ['Righteous', 'Righteous'], ['Bungee', 'Bungee'], ['Black Ops One', 'Black Ops One (stencil)'], ['Roboto Slab', 'Roboto Slab (serif)'], ['Playfair Display', 'Playfair Display (serif)'], ['Lobster', 'Lobster (script)']];
  const state = {}, promises = {};
  const SYSTEM = '"Segoe UI", Arial, sans-serif';
  const ready = (f) => f === 'system' || state[f] === 2;
  function load(f) {
    if (ready(f)) return Promise.resolve(true);
    if (promises[f]) return promises[f];
    state[f] = 1;
    promises[f] = new Promise((res) => {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(f).replace(/%20/g, '+') + '&display=block';
      l.onerror = () => { state[f] = -1; delete promises[f]; res(false); };
      const fail = () => { state[f] = -1; delete promises[f]; res(false); }; // allow a retry later (offline, blocked, slow)
      l.onload = () => document.fonts.load('16px "' + f + '"', '0123456789').then((faces) => { if (faces && faces.length) { state[f] = 2; res(true); } else fail(); }, fail);
      document.head.appendChild(l);
    });
    return promises[f];
  }
  const resolve = (f) => (ready(f) ? f : 'system');
  const css = (f, weight, px) => weight + ' ' + px + 'px ' + (resolve(f) === 'system' ? SYSTEM : '"' + f + '", sans-serif');
  HT37.fonts = { LIST, css, load, ready, resolve };
})();
