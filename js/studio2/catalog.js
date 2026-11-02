/**
 * @file     js/studio2/catalog.js
 * @layer    Studio 2 knowledge (no DOM)
 * @summary  Everything we know about the watch's widgets, in one table: a plain-English name, what it shows, whether it can be resized, and how
 *           to print a sample value in the editor. Findings come from docs/BIN_FORMAT.md and docs/UNKNOWNS.md (hardware-tested unless marked guess).
 *           A widget is identified by (type, sub). Unknown pairs get a generic name, so any vendor face still opens.
 * API  HT37S.catalog = { describe(type, sub) -> {name, group, help, status}, text(type, sub, sim) -> string, defaultSim(), FRAME_FOR_CODE, TYPE_NAMES }
 *      status: 'known' (tested on the watch), 'guess' (inferred), 'unknown'
 */
(function () {
  const S = (window.HT37S = window.HT37S || {});
  const TYPE_NAMES = { 0: 'Background', 1: 'Clock hand', 2: 'Number (time/date)', 3: 'Number (data)', 4: 'Picture set', 5: 'Progress bar', 6: 'Icon', 7: 'Animation', 8: 'Touch area', 9: 'Full-screen entry' };
  // sky code (what the phone sends) -> frame the watch draws in the forecast icon slots (measured, docs/BIN_FORMAT.md 11f)
  const FRAME_FOR_CODE = [12, 1, 0, 5, 8, 11, 10, 3, 9, 2, 4, 7, 6, 12];
  const K = 'known', G = 'guess', U = 'unknown';
  const T = {}; // key 't/s' -> [name, group, help, status]
  const def = (t, s, name, group, help, status) => { T[t + '/' + s] = [name, group, help, status || K]; };

  def(0, 0, 'Background picture', 'Face', 'The full-screen background. Not movable.');
  def(2, 0, 'Clock (HH:MM)', 'Time', 'Hours and minutes. 12-hour when the face has an AM/PM label.');
  def(2, 1, 'Day of month', 'Date', 'Two-digit day number.', G);
  def(2, 2, 'Hour', 'Time', 'Hours only.');
  def(2, 3, 'Minute', 'Time', 'Minutes only.');
  def(2, 4, 'Seconds', 'Time', 'Seconds, updates every second.');
  def(2, 10, 'Seconds (tens digit)', 'Time', 'First digit of the seconds.');
  def(2, 11, 'Seconds (ones digit)', 'Time', 'Second digit of the seconds.');
  def(2, 12, 'Date (DD/MM)', 'Date', 'Day then month.');
  def(2, 13, 'Date (MM/DD)', 'Date', 'Month then day.');
  def(2, 14, 'Date (DD/MM)', 'Date', 'Day then month.');
  def(2, 15, 'Date (DD/MM/YYYY)', 'Date', 'Day, month, year.');
  def(2, 16, 'Date (YYYY-MM-DD)', 'Date', 'Year, month, day with dashes (seen on the user\'s own face, Nov 1 2026).', G);
  def(2, 17, 'Date (MM/DD/YYYY)', 'Date', 'US order: month, day, year.');
  def(2, 18, 'Date (DD/MM/YYYY)', 'Date', 'Day, month, year.');
  def(2, 19, 'Year', 'Date', 'Four-digit year.');
  def(2, 27, 'Minutes with colon', 'Time', 'Shows ":MM". Used for split clocks.');
  def(2, 40, 'Year (2 digits)', 'Date', 'Last two digits of the year.');
  def(2, 48, 'Clock (HH:MM:SS)', 'Time', 'Hours, minutes and live seconds in one widget.');
  def(2, 49, 'Clock (HH:MM)', 'Time', 'Hours and minutes.');
  def(2, 50, 'Blinking colon', 'Time', 'Just the ":" that blinks.');
  def(2, 51, 'Clock (HH:MM, blinking colon)', 'Time', 'Hours and minutes with a blinking colon.');
  def(3, 0, 'Steps', 'Activity', 'Steps today.');
  def(3, 6, 'Distance', 'Activity', 'Distance today in the watch units (miles with one decimal in English/US).');
  def(3, 7, 'Calories', 'Activity', 'Active calories today (kcal).');
  def(3, 8, 'Heart rate', 'Health', 'Last heart rate in BPM.');
  def(3, 9, 'Blood pressure', 'Health', 'Shows 0/0 until a reading exists. This watch has no real BP sensor (estimate).', G);
  def(3, 10, 'Blood oxygen', 'Health', 'SpO2 with a percent sign, "--" with no data.');
  def(3, 11, 'Temperature', 'Weather', 'Current temperature with C or F.');
  def(3, 12, 'Temperature', 'Weather', 'Current temperature with C or F.');
  def(3, 15, 'Battery %', 'Watch', 'Battery percent.');
  def(3, 41, 'Sleep time (00H00M)', 'Health', 'Last sleep as hours and minutes in one widget.');
  def(3, 46, 'Sleep hours', 'Health', 'Hours of sleep.');
  def(3, 47, 'Sleep minutes', 'Health', 'Minutes of sleep.');
  def(3, 48, 'Today high', 'Weather', 'Today\'s high temperature.');
  def(3, 49, 'Today low', 'Weather', 'Today\'s low temperature.');
  def(3, 61, 'Compass heading', 'Watch', 'Direction in degrees, 0 = north, up to 359. Found Nov 1 2026.');
  for (let i = 1; i <= 5; i++) def(3, i, 'Steps digit ' + i, 'Activity', 'One digit of the five-digit step count.', G);
  for (let i = 0; i < 4; i++) def(3, 25 + i, 'Calories digit ' + (i + 1), 'Activity', 'One digit of the four-digit calorie count.');
  for (let d = 0; d < 6; d++) { def(3, 50 + d, 'Forecast low, day ' + (d + 1), 'Weather', 'Low temperature for forecast day ' + (d + 1) + '.'); def(3, 62 + d, 'Forecast high, day ' + (d + 1), 'Weather', 'High temperature for forecast day ' + (d + 1) + '.'); }
  def(4, 0, 'Weekday name', 'Date', 'MON, TUE, ... The picture set holds 7 days (two languages interleaved).');
  def(4, 6, 'AM / PM', 'Time', 'Shows AM or PM in 12-hour mode.');
  def(4, 1, 'Label picture', 'Face', 'A picture set that switches with a setting (not decoded).', U);
  def(4, 2, 'Label picture', 'Face', 'A picture set that switches with a setting (not decoded).', U);
  def(4, 3, 'Label picture', 'Face', 'A picture set that switches with a setting (not decoded).', U);
  def(4, 7, 'Label picture', 'Face', 'A picture set that switches with a setting (not decoded).', U);
  def(5, 0, 'Battery bar', 'Watch', 'Progress bar, one picture per 10% of battery.');
  def(5, 1, 'Steps goal bar', 'Activity', 'Progress bar, one picture per 10% of the daily step goal.');
  def(5, 2, 'Bar (distance?)', 'Activity', 'Progress bar. Probably distance goal (guess from vendor faces).', G);
  def(5, 3, 'Bar (calories?)', 'Activity', 'Progress bar. Probably calorie goal (guess from vendor faces).', G);
  def(5, 32, 'Two-state icon', 'Watch', 'Icon with two pictures (on/off). What it follows is not known.', U);
  def(6, 0, 'Bluetooth link', 'Watch', 'Two pictures: phone linked, not linked. Found Nov 1 2026.');
  def(6, 1, 'Preview picture', 'Face', 'The thumbnail shown in the face list. Not drawn on the watch.');
  def(6, 2, 'Weather icon', 'Weather', 'Icon for the sky now (13 pictures, one per sky code).');
  for (let d = 0; d < 6; d++) def(6, 4 + d, 'Forecast icon, day ' + (d + 1), 'Weather', 'Sky icon for forecast day ' + (d + 1) + '.');
  def(6, 3, 'Icon (blank)', 'Face', 'Draws nothing in tests.', U);
  def(7, 0, 'Animation', 'Face', 'Loops its pictures. Speed is set by a timing value.');
  const APPS = { 0: 'App', 1: 'App', 3: 'Blood oxygen app', 4: 'App', 5: 'App', 6: 'Messages app', 7: 'Sleep app', 13: 'App', 15: 'App', 16: 'Phone app', 17: 'App', 19: 'App' };
  for (let s = 0; s < 25; s++) def(8, s, (APPS[s] || 'App ' + s) + ' (tap)', 'Touch', 'Opens a watch app when tapped. No picture of its own: the icon is part of the background.', APPS[s] ? G : U);
  def(1, 6, 'Hour hand', 'Clock', 'Rotates around the face center.'); def(1, 7, 'Minute hand', 'Clock', 'Rotates around the face center.'); def(1, 8, 'Second hand', 'Clock', 'Rotates around the face center.');
  def(9, 1, 'Full-screen entry', 'Face', 'Not decoded.', U);

  function describe(type, sub) {
    const e = T[type + '/' + sub];
    if (e) return { name: e[0], group: e[1], help: e[2], status: e[3], key: type + '/' + sub };
    return { name: (TYPE_NAMES[type] || 'Widget') + ' ' + sub, group: 'Other', help: 'Not decoded yet (type ' + type + ', sub ' + sub + ').', status: U, key: type + '/' + sub };
  }

  const p2 = (n) => String(n).padStart(2, '0');
  function defaultSim() {
    return { live: true, h: 10, m: 9, s: 30, dow: 2, mon: 11, day: 4, year: 2026, twelve: true, fahrenheit: true,
      steps: 6840, hr: 72, batt: 82, kcal: 412, distMi: 4.8, spo2: 98, bpSys: 120, bpDia: 80, tempF: 73, hiF: 78, loF: 64,
      heading: 214, sky: 2, linked: true, sleepH: 7, sleepM: 42, stepGoal: 10000, distGoalMi: 5, kcalGoal: 600 };
  }
  function clock(sim) { if (!sim.live) return { h: sim.h, m: sim.m, s: sim.s, dow: sim.dow, mon: sim.mon, day: sim.day, year: sim.year }; const n = new Date(); return { h: n.getHours(), m: n.getMinutes(), s: n.getSeconds(), dow: (n.getDay() + 6) % 7, mon: n.getMonth() + 1, day: n.getDate(), year: n.getFullYear() }; }

  /** Printed value of a number widget (type 2 or 3). */
  function text(type, sub, sim, hasAmPm) {
    const c = clock(sim), tw = sim.twelve || hasAmPm, hh = tw ? p2(c.h % 12 || 12) : p2(c.h), mm = p2(c.m);
    const F = (v) => Math.round(v) + 'F', date = { 12: p2(c.day) + '/' + p2(c.mon), 13: p2(c.mon) + '/' + p2(c.day), 14: p2(c.day) + '/' + p2(c.mon), 15: p2(c.day) + '/' + p2(c.mon) + '/' + c.year, 16: c.year + '-' + p2(c.mon) + '-' + p2(c.day), 17: p2(c.mon) + '/' + p2(c.day) + '/' + c.year, 18: p2(c.day) + '/' + p2(c.mon) + '/' + c.year };
    if (type === 2) {
      if (sub === 0 || sub === 49 || sub === 51) return hh + ':' + mm;
      if (sub === 48) return hh + ':' + mm + ':' + p2(c.s);
      if (sub === 1) return p2(c.day); if (sub === 2) return hh; if (sub === 3) return mm; if (sub === 4) return p2(c.s);
      if (sub === 10) return String(p2(c.s))[0]; if (sub === 11) return String(p2(c.s))[1];
      if (sub === 19) return String(c.year); if (sub === 40) return String(c.year).slice(2); if (sub === 27) return ':' + mm; if (sub === 50) return ':';
      if (date[sub]) return date[sub];
      return '88';
    }
    if (sub === 0) return String(sim.steps);
    if (sub >= 1 && sub <= 5) return String(sim.steps).padStart(5, '0')[sub - 1];
    if (sub === 6) return sim.distMi.toFixed(1);
    if (sub === 7) return String(sim.kcal);
    if (sub >= 25 && sub <= 28) return String(sim.kcal).padStart(4, '0')[sub - 25];
    if (sub === 8) return String(sim.hr);
    if (sub === 9) return sim.bpSys + '/' + sim.bpDia;
    if (sub === 10) return sim.spo2 + '%';
    if (sub === 11 || sub === 12) return F(sim.tempF);
    if (sub === 15) return String(sim.batt);
    if (sub === 41) return p2(sim.sleepH) + 'H' + p2(sim.sleepM) + 'M';
    if (sub === 46) return p2(sim.sleepH); if (sub === 47) return p2(sim.sleepM);
    if (sub === 48) return F(sim.hiF); if (sub === 49) return F(sim.loF);
    if (sub >= 50 && sub <= 55) return F(sim.loF - (sub - 50)); if (sub >= 62 && sub <= 67) return F(sim.hiF + (sub - 62));
    if (sub === 61) return String(sim.heading);
    return '00';
  }
  S.catalog = { describe, text, defaultSim, clock, FRAME_FOR_CODE, TYPE_NAMES };
})();
