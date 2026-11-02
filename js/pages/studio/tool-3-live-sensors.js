/**
 * @file     js/pages/studio/tool-3-live-sensors.js
 * @layer    UI mount
 * @summary  Tab 1 tool 3 "Live Sensors & Simulation": adopts #secSensorWeatherBody.
 *
 * ROLE
 *   - Sliders for the simulated sensors; canvas preview only — nothing is sent to the watch from here.
 *
 * REGISTERS
 *   - ui.registerMount(id:studio.tool3, page:studio, order:140)
 *
 * USES (defined in other files)
 *   - js/core/namespace.js: HT37
 *   - js/editor/state.js: ctx
 *
 * DOM IDS TOUCHED
 *   #secSensorWeatherBody #toolCard_3_studio
 *
 * LOAD ORDER
 *   #49 of 62, section "9. UI FRAMEWORK + PAGES  (generators fill the HTML pool, then pages/mounts register themselves)"
 *   after: js/pages/studio/tool-2-screen-background.js   before: js/pages/alerts/toolbox.js
 *
 * See AI_GUIDE.md (architecture, recipes) and PROTOCOL.md (wire format, command catalog).
 */
HT37.ui.registerMount({
  id: 'studio.tool3',
  page: 'studio',
  order: 140,
  title: '3. Live Sensors & Simulation (adopts pooled #secSensorWeatherBody)',
  run(ctx) {
    const { getCard, makeToolCard } = ctx;
    const { studioToolbox } = ctx.shared;   // handed over by an earlier unit of this page
    // Tool 3: Live Sensors & Simulation
    const cardSensorWeather = getCard('secSensorWeatherBody');
    const bodySensorWeather = document.getElementById('secSensorWeatherBody');
    if (bodySensorWeather && !studioToolbox.querySelector('#toolCard_3_studio')) {
      const card3 = makeToolCard('3', 'Live Sensors & Simulation', bodySensorWeather);
      card3.id = 'toolCard_3_studio';
      if (card3) studioToolbox.appendChild(card3);
      if (cardSensorWeather && cardSensorWeather !== card3 && cardSensorWeather.parentElement) cardSensorWeather.style.display = 'none';
    }
  }
});
