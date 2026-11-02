/**
 * @file     js/editor/forecast-face.js
 * @layer    Developer test face
 * @summary  "Forecast widget test face" in the developer test-face list: the forecast widget (js/editor/widgets/forecast.js) with its default
 *           options, centered, plus a clock. Real faces are built in the editor: Add Widget Layer > Forecast, then Flash / Export.
 */
(function () {
  window.HT37 = window.HT37 || {};
  function buildSpec() {
    const H = HT37.diagFace.helpers, W = HT37.forecastWidget, sprites = [], add = (s) => { sprites.push(s); return sprites.length - 1; };
    const o = Object.assign({}, W.defaults), sz = W.sizeOf({ opts: o }), ox = Math.round(180 - sz.w / 2), oy = Math.round(190 - sz.h / 2);
    const comp = W.build(o, add, ox, oy);
    const bg = H.cv(360, 360), g = bg.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 360, 360); comp.drawStatic(g); H.stampVer(g);
    const bgId = add({ w: 360, h: 360, alpha: false, rgba: H.pixels(bg), flag: 1 });
    const pv = H.cv(240, 240); pv.getContext('2d').drawImage(bg, 0, 0, 240, 240);
    const pvId = add({ w: 240, h: 240, alpha: false, rgba: H.pixels(pv), flag: 1 });
    const widgets = [{ type: 0, sub: 0, x: 0, y: 0, a: bgId }, { type: 2, sub: 0, x: 180, y: 24, a: 1, b: 1 }].concat(comp.widgets, [{ type: 6, sub: 1, x: 0, y: 0, a: pvId }]);
    return { widgets, sprites, fonts: comp.fonts, previewSprite: pvId };
  }
  if (HT37.diagFace && HT37.diagFace.addFace) HT37.diagFace.addFace('forecast6', { name: 'HT37_Forecast6_Face.bin', label: '🌤️ Forecast widget test face', spec: buildSpec });
  HT37.forecastFace = { buildSpec };
})();
