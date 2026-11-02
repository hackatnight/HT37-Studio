# HT37 Studio

> **Experimental hobby project. Use at your own risk.** This tool sends commands to a real watch and can write watch faces to it. It was built and tested on one watch only (HT37 / FitCloud IC_568X, 360x360 round screen). It may not work, or may behave unexpectedly, on other models, and flashing a face can in rare cases leave the watch needing a reset. No firmware is flashed, but there is no warranty of any kind. Back up anything you care about first.
>
> Works in Chrome or Edge (desktop or Android) because it needs Web Bluetooth. Not supported in Safari or Firefox.

A static, no-build web tool (Web Bluetooth) for the HT37 / FitCloud IC_568X smart watch: pair and bind, send alerts and weather, read health data, and edit or build watch faces (.bin, TopStep/TBUI format).

Open `index.html` in Chrome through a local web server (for example `python -m http.server 9090`), then use "Pair & Bind".

- `AI_GUIDE.md` architecture and how to add widgets and commands
- `PROTOCOL.md` Bluetooth frame format and command catalog
- `docs/` file-format notes (`BIN_FORMAT.md`), findings (`UNKNOWNS.md`), protocol map

Vendor watch faces are not included. This is an unofficial hobby project and is not affiliated with the watch maker.
