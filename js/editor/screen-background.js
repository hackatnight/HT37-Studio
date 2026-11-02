/**
 * @file     js/editor/screen-background.js
 * @layer    Editor logic
 * @summary  LCD resolution preset, background style, custom background image upload/delete.
 *
 * ROLE
 *   - updateScreenPreset(): parses #lcdPreset ("WxHxrect") into screenConfig, resizes the canvas and toggles
 *     the rect chassis class.
 *   - updateBgTheme(): copies #bgPreset into bgTheme. #bgFileInput change loads customBgImage and selects the
 *     "image" theme; deleteBackgroundImage() clears it.
 *
 * PROVIDES (globals)
 *   function updateScreenPreset, function updateBgTheme, function deleteBackgroundImage, window.
 *   userUploadedCustomBg
 *
 * USES (defined in other files)
 *   - js/editor/state.js: bgTheme, canvas, customBgImage, screenConfig
 *   - js/editor/layers.js: renderLayerList
 *   - js/core/log.js: log
 *
 * DOM IDS TOUCHED
 *   #bgFileInput #bgPreset #btnDeleteBg #lcdPreset #watchChassis
 *
 * LOAD ORDER
 *   #24 of 62, section "3. EDITOR  (state, widget registry, widgets, renderer, layer/inspector logic)"
 *   after: js/editor/inspector.js   before: js/editor/sensors-sim.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
function updateScreenPreset() {
  const [w, h, rectFlag] = document.getElementById('lcdPreset').value.split('x').map(Number);
  screenConfig = { width: w, height: h, isRect: rectFlag === 1, previewWidth: Math.round(w * 0.61), previewHeight: Math.round(h * 0.61) };
  canvas.width = w; canvas.height = h;
  document.getElementById('watchChassis').classList.toggle('rect-shape', screenConfig.isRect);
}

function updateBgTheme() { bgTheme = document.getElementById('bgPreset').value; renderLayerList(); }

document.getElementById('bgFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      // Auto-adapt, scale, and center-crop to exact 360x360 round watch display
      const cv360 = document.createElement('canvas');
      cv360.width = 360; cv360.height = 360;
      const ctx360 = cv360.getContext('2d');
      ctx360.imageSmoothingEnabled = true;
      ctx360.imageSmoothingQuality = 'high';

      const scale = Math.max(360 / img.width, 360 / img.height);
      const drawW = Math.round(img.width * scale);
      const drawH = Math.round(img.height * scale);
      const offX = Math.round((360 - drawW) / 2);
      const offY = Math.round((360 - drawH) / 2);

      ctx360.fillStyle = '#000000';
      ctx360.fillRect(0, 0, 360, 360);
      ctx360.drawImage(img, offX, offY, drawW, drawH);

      customBgImage = cv360;
      bgTheme = 'image';
      window.userUploadedCustomBg = true;

      document.getElementById('bgPreset').value = 'image';
      const delBtn = document.getElementById('btnDeleteBg');
      if (delBtn) delBtn.disabled = false;

      renderLayerList();
      log('Auto-adapted custom image: ' + img.width + 'x' + img.height + ' -> 360x360 center-crop.', 'ok');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

function deleteBackgroundImage() {
  customBgImage = null; window.userUploadedCustomBg = false; document.getElementById('bgFileInput').value = '';
  document.getElementById('btnDeleteBg').disabled = true;
  if (bgTheme === 'image') { bgTheme = 'tactical'; document.getElementById('bgPreset').value = 'tactical'; }
  renderLayerList(); log('Deleted custom background image.', 'err');
}
