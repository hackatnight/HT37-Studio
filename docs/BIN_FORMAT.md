# TOPSTEP / TBUI watch-face .bin — observed format reference

Status: **observed**, not vendor-documented. Based on 6 faces (the repo template + 5 faces downloaded
through the FitCloudPro app, all 360×360). Everything marked UNKNOWN has not been worked out.
Decoder under test: `js/decompiler/vault.js` (`parseTopstepBin`, `decodePA`).

## 1. Files in the phone's app folder (com.topstep.fitcloudpro)

| Location | What it is |
|---|---|
| `files/Download/<md5>.bin` | Downloaded watch faces (TOPSTEP container, item name `gui_dial`). These are the files to analyze. |
| `files/Download/<md5>.pgl` | UNKNOWN. 4–24 KB files starting `01 00 6a e5 d4 ef 12`. Not a watch face; not analyzed. |
| `cache/_YYYYMMDD_hhmmss.bin` | ~70 KB TOPSTEP containers whose item name is `GPS` (GPS/AGPS data pushed to the watch). Not faces. |
| `cache/*.jpg`, `files/Pictures/*.jpg` | Photos/pictures cached by the app. |
| `files/log/*.xlog` | App logs (binary). Not read. |

Mapping used: app size → file → dial id (the dial id in the header equals the number in the app's name).

| App name | App size | Bytes | Dial id | md5 file |
|---|---|---|---|---|
| animated analog + digital (F1) | 460.1 KB | 471224 | 1004080 | 0e3f0ee1…bin |
| 360z_1004189 (F2) | 332.3 KB | 340284 | 1004189 | 3d0ea69e…bin |
| icon launcher (F3) | 370.9 KB | 379852 | 1004410 | 86984779…bin |
| 360z_1004412 tiger (F4) | 252.6 KB | 258680 | 1004412 | e93dc1df…bin |
| 360z_1004504 gears (F5) | 558.7 KB | 572172 | 1004504 | a8c615b7…bin |
| 360z_1004018 green analog (A) | 105.7 KB | 108276 | 1004018 | 7435cac3…bin (upload) |
| 360z_1004025 spade/heart analog (B) | 93.4 KB | 95740 | 1004025 | 9a325b81…bin (upload) |
| repo template | 340 KB | 348456 | 1004380 | 80287ac5…bin |

## 2. Container (all 6 files identical in structure)

- `0x00` "TOPSTEP" 0x01; `0x0C` u32 total file size (== file length in all 6); `0x10` u16 header CRC.
- Header CRC = **CRC-16/BUYPASS (poly 0x8005, init 0, no reflection) over bytes 0x400..EOF**. Verified on all 6.
- `0x24` u32 = offset of the TBUI block (0x400 in all 6). Item table at 0x20+, item name `gui_dial` (faces) or `GPS`.
- Last 4 bytes of a face file are the ASCII footer `TBUI`.
- TBUI block (at B): `B+0x08` dial id; `B+0x20/0x22` u16 width/height (360×360 everywhere seen);
  directories at `B+0x40` widgets, `B+0x48` sprites, `B+0x50` fonts, each `{u32 off, u16 count, u16 entrySize}`.
- Widget entry (`entrySize` bytes): `+0 id, +1 type, +2 flag, +3 sub, +4 x u16, +6 y u16, +0x0C a u16, +0x0E b u16`.
- Sprite entry: `+0 id u16, +2 fmt (always 14), +3 flag, +4 w, +6 h, +8 offset u32` (offset relative to B).
- **Round-trip:** parse → `rebuildActiveBin()` with no edits returns a byte-identical file for all 5 new faces (0 differing bytes).

## 3. Sprite flags (byte `+3` of the sprite entry)

| flag | Meaning (observed) | Typical sprites |
|---|---|---|
| 1 | Opaque full-bleed RGB565 image | 360×360 backgrounds, 240×240 preview thumbnail |
| 2 | Alpha sprite | digit glyphs, icons, indexed sets, animation frames |
| 4 | **Hand sprite** (clock hand). Header byte 8 = 0x1E here, 0x00 on every other sprite | tall narrow images, e.g. 26×138 hour, 26×191 minute |

## 4. Widget types seen

| type | Role (observed) | Examples |
|---|---|---|
| 0 | Background sprite (a = sprite id). F3 has three (tap cycles through them) | 360×360 |
| 1 | **Analog hand**. sub 6 = hour, 7 = minute, 8 = second (shortest→longest sprite). x,y = top-left of an upright hand; pivot is the face center (180,180) | 26×138 / 26×191 / 18×209 |
| 2 | Number/time text via font list (a = font index, b = alignment) | F1 time, F3 top time, F5 date |
| 3 | Number text, centered/aligned (sensor value) | steps, kcal, BPM, temperature |
| 4 | **Indexed sprite set** (value → frame): weekday names (14 = 7×2 languages), weather icons, battery levels, ring gauges | 41×15 ×14, 26×22 ×13, 84×84 ×14 |
| 5 | Static/indexed sprite (F2) | UNKNOWN difference from 4 |
| 6 | Preview/overlay at 0,0 using the 240×240 thumbnail sprite | not drawn on the watch face itself |
| 7 | **Frame animation**: a = first frame of a consecutive sprite run; b = timing/flags (2048 = full-screen, 1280 = small) | F1 120×120 ×10; F5 360×360 ×3 (gears); F1 colon blink 18×15 ×2 |
| 8 | **App shortcut icon** hotspot (a = 0). sub = which built-in app (F3 uses subs 16,0,1,4,14,7,8,6,15,22,20) | F3 launcher grid |
| 9 | **Background switcher** (b = 929 in F3) | F3 |

Type 2 sub 1 (1004018, 1004189) appears to be the 2-digit day of month (INFERRED from the app preview showing "06").

`sub` is NOT a global data-source id: its meaning depends on the type (e.g. type 2 sub 0 is the clock, type 3 sub 0 is steps).
Fixed: the tool now treats type 2 sub 0 as the clock (HH:MM, 12-hour when the face has an AM/PM label) and type 3 sub 0 as steps.

## 5. Fonts (FontList)

Per font: list of `{char u16, sprite u16}` pairs. Fonts seen: digits only, plus `:` `/` `_` `%` `-` `.` `C` `F`.
Face sizes: F1 3 fonts, F2 5, F3 3, F4 0, F5 1, template 4. Fonts are bitmap glyph sprites (alpha, 8–34 px wide), not TrueType.

## 6. PA sprite codec — what is proven and what is not

- PROVEN (every non-hand sprite in the 5 new faces decodes and renders correctly; checked visually in the tool): header `"PA" 00 alpha w16 h16 b8 es b10..11 …`, row index
  `(h+1)*es` bytes, then token stream: `0x00-0x7F` 7-bit RGB delta, `0x80-0xBF` run (alpha? + RGB565), `0xC0-0xFF` literal run. Runs end at row end.
- **HAND SPRITES (flag 4) — SOLVED for width <= 31** (header byte 8 = 0x1E). Layout:
  - Index table has `ceil(h/30)+1` u16 entries (one per band), NOT `h+1`. Entry values are band offsets, scrambled by the header bias; not needed to decode.
  - Pixel stream (same token set as above) is a sequence of `ceil(h/30)` bands, each **31 rows x 31 px** = 961 px, i.e. the image is stored with a
    fixed **31-px row stride** (the real `w` x `h` is the top-left corner; the rest is transparent padding). Runs DO span row ends here.
  - Verified: 16 hand sprites across 7 faces (incl. plain bar, teardrop, hollow, counter-weight-and-hub hands) decode correctly; the two
    360z_1004018 / 1004025 hands match the app's screenshots. Implemented in `decodePA` (`d.hand === true`).
  - Found because the earlier decoder treated hands as ordinary rows and produced garbled images (and threw on one).
  - NOT understood: hands with w > 31 (the two gold hands in 1004504, 32x145 and 32x195). They probably use several 31-px tile columns per band
    (their stream is 9504 / 13364 px, not 9610 / 13454); they still fall through to the generic path and look scrambled.
  - Still needed for *writing* hands: the exact index-table values (a hand encoder cannot be built until these are decoded).
  - Widget placement: a type-1 widget entry stores x,y = top-left of the upright hand AND the rotation center at `+8/+0xA` (u16,u16) = (180,180) on every face seen.
    The center is a fixed screen point; moving a hand only changes where the sprite hangs relative to it.
  - Hand art can extend below the header height (second-hand hub: header h=148, art to row 150; the watch draws it). The decoder keeps those rows.
  - Vendor preview thumbnails (the 240x240 sprite) are rendered at **10:10:00** (hands at 10:10, second hand at 12) in every face checked.
  - Editor option `chkHandBasePivot` (default on): for hands with a rounded back end (bottom width >= 14 px) the rotation center is moved to the center of
    that base (1.5-4.5 px from the stored pivot row; guard |shift| <= 6). It scored closer to the vendor preview than the exact file row on 3 of 3 faces. Display only; saved x/y are unchanged.
  - Editor: selecting a hand shows its rotated outline, the rotation center (crosshair) and the pointing axis with its angle; clicks hit-test in the rotated
    frame (`getHandFrame` / `getWidgetOutline` / `hitTestWidget` in vault.js, used by render.js and canvas-input.js).
  - Editor clock: ONE shared clock for all dials (`window.simClock`, `getSimClockParts()`). Default LIVE = real local time. **STOP TIME** freezes it
    (hands and digital time) and unlocks the HH:MM[:SS] box so any time can be typed; **START TIME** returns to live. A selected hand's label shows the time it
    points at (e.g. `hour 104.3\u00b0 = 3:28`).
  - Rotation center editing: each hand entry stores its own center (`+8/+0xA`). The editor shows one draggable handle per set of hands sharing a center.
    Drag = move the whole dial (all hands' x,y and center together); Shift+drag = move only the center (hands stay, base auto-centring turns off). Saving writes
    x, y, px, py for every hand. NOT YET FLASH-TESTED: that the watch honors a changed center (test with a small move on 1004025).
  - Template: everything about the hand lives in `js/editor/face-widgets/analog-hand.js` (`HT37.faceWidgets.analogHand`: createFromEntry, createNew, writeEntry,
    getFrame/draw/getOutline/hitTest, center handle). Use it as the pattern for other rotating widgets (a compass needle: the sub code for heading is unknown).
  - OPEN QUESTION (hub centring): in 1004025 the second-hand hub center is at sprite row 144, but file y=40 puts row 140 on the rotation center, so the
    hub sits 4 px off-center when drawn exactly as the file says. The vendor's own 240x240 preview of that face shows the hub exactly centered (it fits
    best with y=36). Needs a look at the real watch (does the hub stay over the hour/minute pivot when the second hand points left/right?).

## 7. What the tool renders today (see `samples/five-faces-in-tool.png`)

Backgrounds, digit fonts, weather/weekday/icon sprite sets and static icons render well. Analog hands are now rendered (type 1, rotated about 180,180 from a simulated clock). Not rendered:
frame animations (F1 shows a black circle where the 120×120 animation goes), type-8 shortcut hotspots, background switching.
F4 (tiger) loads 0 widgets because its only non-background widgets are hands (hands now render; the tiger face has them).

## 8. Next steps (proposed)

1. Work out w > 31 hand tiling and the hand index table (needed before hands can be written).
2. Add renderers for types 1 (rotate about 180,180), 7 (play frames), 8 (hotspot overlay), 9 (cycle backgrounds).
3. Make `sub` handling depend on type.
4. Editor: per-widget inspector (font, color, size) with size-aware repack, using the round-trip test as the regression gate.

## 9. Writing edited glyph sprites (number-widget font editor)

- Resized/recolored glyphs are re-encoded with `encodePA` (alpha, es=2) and the sprite table is repacked: each sprite entry gets a new offset, edited ones a new w/h;
  all later data shifts; the 'TBUI' footer is re-appended; u32 @0x0C, @0x28 and @B+0x0C and the header CRC are recomputed.
- Headless checks on all 8 faces: encodePA -> decodePA round-trips 368/368 non-hand sprites; after an edit every untouched sprite is byte-identical, the widget
  table is unchanged, the CRC verifies. Flash-tested OK by the user (date font scaled + moved, shown correctly on the watch).
- Number widgets: x,y is an alignment anchor (b=0 left, 1 center, 2 right); the anchor is kept when glyph widths change.

## 10. TBUI header and table layout (verified by writing a new file; see js/dfu/face-builder.js)
- `B+0x40/0x48/0x50` directories `{u32 offset, u16 count, u16 size}` for widgets (32-byte entries), sprites (12-byte entries) and fonts (`size` field 96 = 384-byte entries: `u32 count` + up to 95 `(u16 char, u16 sprite id)` pairs).
- `B+0x5C` = offset of the first sprite's pixel data; `B+0x60` = id of the preview (240x240) sprite; `B+0x58` = 4 (unknown). All gaps between tables are zero padding.
- Sample faces reserve room for 100 widgets (table at B+0xA0, sprite table at B+0xD20). A face written with that layout parses and decodes in the tool; hardware acceptance is the open question.

## 11. Touch zones and animations (found by comparing faces 1004080, 1004410, 1004504; hardware not yet tested)

Widget entries are 32 bytes: `id, type, flag, sub, x(u16), y(u16), ...`.

- **Type 8 = touch zone (no picture).** Bytes 4-11 are `x, y, w, h` (u16 each), `a`/`b` are 0. `sub` looks like the id of the built-in app the tap opens. The icons drawn on the face are part of the background image, not separate sprites. Example: face 1004410 has 15 type-8 zones of 40x40 px in a 5-column grid.
- **Type 7 = animation.** `a` (bytes 12-13) = first sprite, byte 16 = frame count (10, 2 and 3 seen), `b` (bytes 14-15) = 0x0800 / 0x0500 (probably the frame timing). Frames are consecutive sprites. Each animated part has its own entry, so parts animate independently.
- **Type 9 = full-screen entry** (360x360 at 0,0) with extra fields set; purpose unknown (gesture or page area?).

### 11b. Widget vocabulary seen in 24 vendor faces (1004018 ... 1004532)
- type 2 (number) subs: 0-9, 13, 16, 19, 20, 23, 24. Faces that use 2/6, 2/7, 2/8, 2/9 place them left to right (x 95, 137, 192, 235), so they are probably the separate digits of HH:MM. 2/23 and 2/24 sit side by side at the bottom (probably two more digits).
- type 3 (number) subs: 0-8, 11, 15, 25-28. 3/1 to 3/5 sit left to right 31 px apart (probably the five separate digits of steps). 3/25 to 3/28 sit 10 px apart vertically (unknown).
- 3/9, 3/10, 3/12, 3/13, 3/14 (SpO2, blood pressure candidates) are used by none of the 24 faces.
- type 4 subs 0-3, 6, 7; type 5 subs 0, 1, 3, 32; type 6 subs 0, 1, 2; type 7 sub 0 (animation); type 8 subs 0, 1, 3-8, 13-22 (touch zones); type 9 sub 1.
- Face 1004270: type 8 zones at (239,36) sub 3 = blood-oxygen icon, (254,99) sub 0x10 = phone, (31,196) sub 7 = moon, (49,254) sub 6 = messages, (242,254) sub 0x11 = symbol at bottom right; each 76x76. Matches the icons drawn in the background (checked against the app preview).

### 11c. Number widgets decoded on hardware (probe face 2 + vendor faces flashed unmodified; all 351 faces of the vendor catalog for hardwareInfo 000000008545 were scanned)
Confirmed by flashing and reading the watch (time was 00:18:51, then 00:21:42, date 2026-11-01):
- 2/10, 2/11 = seconds tens digit, seconds units digit (each is its own widget).
- 2/12 = date DD/MM ("01/11").
- 2/25, 2/26 = previous day, next day; 2/28, 2/29 = previous hour, next hour; 2/30, 2/31 = previous minute, next minute (a scrolling "drum" time picker). 2/27 = current minute with a leading colon (":18").
- 2/48 = full clock HH:MM:SS with live seconds in one widget ("00:18:51").
- 3/41 = sleep duration as one formatted string "00H00M" (face 1004508, next to a SLEEP label).
- 3/46, 3/47 = sleep hours, sleep minutes (face 1004491, next to "H" and "M" labels and a moon icon).
- 3/25, 3/26, 3/27, 3/28 = calories as four zero-padded digit widgets ("0005"; faces 1004492, 1004527); the same value as 3/7.
- 3/31 = shows a small number that rises like calories (2, then 3); format not confirmed (face 1004409, right edge, fire icon).
- 3/22, 3/23, 3/24, 3/76: probably distance with one decimal ("000.0" on face 1004409, map-pin icon; 3/22-24 side by side on 1004464). Not confirmed, distance was still 0.
- Not yet decoded: 3/13, 3/14, 5/x gauges beyond 0-3, 7/2, type 9 sub 1 (four faces: 1004005, 1004089, 1004410, 1004438; zero-size entries).
Vendor faces can be flashed unmodified by loading the raw bytes into window.decompiledBinData.u and replacing window.rebuildActiveBin with a no-op (the flash button reads only .u).

### 11d. Sweep results (probe pages 1-4, flashed and photographed; time 00:55-01:12, 2026-11-01, steps 32, weather 84F pushed earlier)
Type 2 (all confirmed by reading the watch):
- 2/14 = DD/MM; 2/15 and 2/18 = DD/MM/YYYY; 2/17 = MM/DD/YYYY (US order).
- 2/21, 2/22 = single digit "1" (day or weekday number, not separated yet).
- 2/32, 2/33 = seconds -1, +1; 2/38, 2/39 = seconds -2, +2; 2/36, 2/37 = minutes -2, +2; 2/34, 2/35 = hours at an offset (showed 21 and 02 at 00:xx; recheck after 01:00).
- 2/40 = two-digit year (26); 2/44..2/47 = the four year digits 2,0,2,6.
- 2/49 and 2/51 = HH:MM (2/51 has a blinking colon); 2/50 = a blinking colon only (separator widget).
- 2/41, 2/42, 2/43 blank. 2/52..2/60 show single digits (3,1,0,2,1,0,1,2,0), meaning not decoded.
Type 3:
- 3/12 = temperature "32F" when no data. 3/13, 3/14, 3/17, 3/18, 3/21 = 0 or blank; 3/19, 3/20 blank.
- 3/29..3/45 = single-character widgets (digits, ".", "%", "F"); they print one glyph each and overlap when stacked at one x, so lay them out side by side.
- 3/48..3/68 = temperature slots in F: 3/48 = 78F, 3/49 = 60F, 3/55 = 37F, 3/67 = 24F, others 32F (= 0C, no data). Probably forecast/other-day temperatures; source of the 78/60/37/24 values unknown.
- 3/69 = "-209" (signed number, unknown); 3/71 = "0%"; 3/72..3/74 = single digits; 3/75 = "%".
The built-in watch weather app shows only current weather, date and icon, so these extra slots are not visible anywhere else on the watch.

## 11e. Weather widgets decoded on hardware (Nov 2026)

The watch uses the EXTENDED 0x02/0x36 weather frame (layout from the phone app's code):
`[cur][low][high][code][cityLen][city][timestamp 4B][forecast count][count x (low, high, code)][pressure 4B big-endian][wind][visKm][0][visMeters hi, lo][0][0][last byte]`
Timestamp is a packed date: yy-2000 (6 bits), month (4), day (5), hour (5), minute (6), second (6), MSB first.

Number widgets (type 3), all shown as Fahrenheit (F = trunc(1.8 x C + 32), stored as a signed byte, so 128F and up wrap negative):
- 3/48 = today's high, 3/49 = today's low.
- 3/50..3/55 = forecast LOW for days 1..6.
- 3/62..3/67 = forecast HIGH for days 1..6.
Test frame: lows 1..6 C, highs 11..16 C gave 33,35,37,39,41,42 F and 51,53,55,57,59,60 F.
Not found yet: forecast codes, pressure, wind, visibility, the last byte, humidity.

Other findings: 3/46 and 3/47 look like sleep hours and minutes ("00"); 3/45 shows "F"; 3/61 is the COMPASS HEADING in degrees 0-359, 0 = north (user-confirmed Nov 1 2026; first read as a motion/accelerometer intensity) (0 at rest, up to ~220 when moving; confirmed by shaking); 3/71 reacts to movement but also drifts by itself; 3/29-3/41 draw as one shared vertical stream ignoring x/y (probably not real widgets).


### 11f. Weather icon widgets decoded on hardware (type 6, probe13, Nov 2026)

Type 6 sub 2, 4, 5, 6, 7, 8, 9 are weather icons. The frame shown is a lookup of the sky code, NOT the code itself.

Slots (which forecast day each sub shows):
| sub | shows |
|---|---|
| 2 | today |
| 4, 5, 6 | forecast days 1, 2, 3 |
| 7, 8, 9 | forecast days 4, 5, 6 |
| 0, 3 | not weather-driven (0 stays on frame 0, 3 draws nothing) |

Sky code (0x02/0x36 frame) -> frame index the watch draws (same table in every slot, verified with an all-5 packet that put frame 11 in all 7 cells):
| code | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| frame | 12 | 1 | 0 | 5 | 8 | 11 | 10 | 3 | 9 | 2 | 4 | 7 | 6 | 12 |

Inverse (frame -> code): W0=2, W1=1, W2=9, W3=7, W4=10, W5=3, W6=12, W7=11, W8=4, W9=8, W10=6, W11=5, W12=0 or 13; W13-W15 not reached by codes 0-13.
Implication for faces: a face's weather sprite must be drawn in this frame order, not in the app's code order. A 6-day forecast widget = six type 6 widgets with subs 4-9 plus one with sub 2 for today.

### 11g. Where the app's weather comes from, and our replacement (Nov 2026)
- The FitCloud Pro app's background WeatherWorker calls the vendor server (api.hetangsmart.com /v2/weather/getWeather: lat_lon, forecast, device_id, source). Its JSON fields (time, code, text, temp, pressure, vis, windScale; days tempMin/tempMax) look like a QWeather-style feed, so the wind byte in the 0x36 frame is probably the Beaufort scale and vis is km. The upstream provider is not visible in the decompiled code.
- js/commands/live-weather.js replaces it: ZIP (zippopotam.us) / city (Open-Meteo geocoding) / phone location -> Open-Meteo forecast -> the extended 0x36 frame. WMO codes map to sky codes (0 unknown, 1 sunny, 2 cloudy, 3 overcast, 4 shower, 5 thunder, 6 light rain, 7 moderate rain, 8 sleet, 9 light snow, 10 moderate snow, 12 foggy). Not yet checked on hardware against the real sky.

### 11h. Bluetooth link icon (type 6 sub 0), found Nov 1 2026
- Found on the user's own watch face (photo: chain-link icon left of a battery icon at the top center). Library match: face 1004458, widget `6/0` at (149,15) with sprite `a` = 49; the battery next to it is `5/0` at (186,18) = 11 frames (0%..100%), 26x12.
- `6/0` = TWO consecutive alpha sprites (20x19 there): frame 0 = chain link (phone linked), frame 1 = broken/crossed link (not linked). The watch switches frames itself from the Bluetooth state. Proven: frame 0 shows while linked. Inferred: frame 1 = not linked (confirm by disconnecting).
- Also on the 7 vendor faces that use `6/0`: 1004043, 1004458, 1004508 (and others). Earlier probes showed frame 0 because the probe tool was linked.
- Editor: widget type `bluetooth` (js/editor/widgets/bluetooth.js), a REAL watch widget; art is drawn by this tool (link, Bluetooth symbol or dot), with size, colors and not-linked marker options.
