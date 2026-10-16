# HomeView design kit (frame/hv/)

Every frame screen follows Apple's HomeView idiom. This file is the contract: if a page and this file
disagree, fix the page. Same font, same look, Apple minimalist, and screens should carry real, useful
information rather than decoration.

## The two frames

| | 10-inch | 15-inch |
|---|---|---|
| Size | 1280x800 | 1920x1080 |
| Browser | Android 6, WebView 106, 1 GB RAM, weak CPU | Android, ~1 GB RAM |
| Viewed from | 1-4 m, standing, often cooking | same |

Size everything in `vh`/`vw` (or `clamp()` with vh) so one page fits both. Check both sizes.

## Hard limits (the 10-inch's WebView)

- ES5 JavaScript: `var`, `function`. No arrow functions, template literals, `let`/`const`, `?.`, `??`, classes.
- No `backdrop-filter`, no `filter: blur()`, no 8-digit hex, `rgba()` only.
- Animate only `opacity` and `transform`. No layout animation, no infinite animations except a done-timer pulse.
- No text smaller than 15 px on the 10-inch (about 1.9vh). Touch targets at least 64 px (8vh).
- Keep the DOM small; no libraries, no frameworks. Poll JSON with `HVJson` (ETag/304) from `/frame/shared/cond.js`.
- All times in the home time zone (config.json `timezone`) through `HV.local()` / `HV.hm()`; never `new Date().getHours()`.

## Look

- **Type:** SF Pro (`var(--sf)`) for text, SF Rounded (`var(--sfr)`) for numbers, clocks and big display
  type. Weights 400/600/700 (300 only for one hero number per screen). Tight letter-spacing on large type
  (-0.03em). Tabular numbers (`.tnum`) wherever digits change.
- **Type scale (vh):** hero 18-40, title 6.5, headline 4.4, body 3.4, caption 2.6 (min 1.9).
- **Color:** light grouped background `--bg` with white `--card`s for daytime information screens;
  black/`--night-2` for clocks, timers, Standby and night; photos full-bleed. One accent per screen.
  System colors only (`--orange --red --yellow --green --blue --lav`). Calendar colors come from
  config.json (`HV.calColor(key)`).
- **Shape:** continuous big corners (`--r-lg` cards, `--r-xl` sheets, pills for buttons). No borders on
  cards; a hairline shadow at most. No gradients except photos, weather skies and the thermostat tile.
- **Glass:** faked: `rgba(255,255,255,.2)` fill + 1px `rgba(255,255,255,.28)` border over photos.
- **Icons:** simple inline SVG line icons, 2px stroke, round caps. Never emoji.
- **Words:** short, sentence case, American English.

## Layout and navigation

- No permanent top bar. Every screen gets `HV.chrome()`: a clock chip and a Standby chip top-right,
  running-timer pills at the bottom. Screens below the Home launcher add a **Back chip top-left**
  (`HV.back(label)`, goes to `/frame/hv/` unless given a URL).
- **`/frame/hv/` is the Home launcher:** a grid of live widgets (Today, Weather, Smart Home or Outside; Tonight,
  Timer, Shopping, Photos or Music; a This week strip of events and dinners). Tap a widget
  to open its full screen. Standby is the chip next to the clock, and returns here on tap.
- **Information density:** every screen answers its question at a glance from 3 m in the hero, then gives
  the details people actually use in a second row. An empty area larger than a quarter of the screen is a
  bug. If data is missing, say what is missing in one line; never show a blank card.
- Sheets (detail, pickers) slide up from the bottom, white, `--r-xl` top corners, with a Close pill.

## Building blocks (in hv.css)

`.hv-screen` (padded page), `.hv-title` / `.hv-sub`, `.hv-grid` (2-4 columns), `.hv-card`,
`.hv-card.dark`, `.hv-row` (list row: color bar, title, trailing value), `.hv-pill` / `.hv-pill.primary`,
`.hv-chip`, `.hv-stat` (big number + label), `.hv-sheet`, `.hv-empty`. Use them; add page CSS only for
what is unique to the page.

## Data you can use (GET, all through HVJson)

- `/frame/hv/config.js` — `window.HV_CONFIG` (`HV.cfg`): home name, time zone, place, units, calendars, timers
- `/api/frame` — weather (now, hourly `hours24`, 7-day `days`), `aqi`, `calendar_events`, `calendars`
- `/api/meals/plan`, `/api/meals/recipe?id=`, `/api/meals/search?q=`, `/api/meals/browse?category=`,
  `/api/meals/categories`, `/api/meals/random`, `/api/meals/shopping?days=` (see meals_api.py)
- `/api/frame/music` (Sonos), `/api/frame/spotify/*`, `/api/frame/photos`, `/api/hv/state` (timers), `/api/hv/wallpapers`

Writes: `/api/hv/timer`, `/api/hv/command`, `/api/meals/plan`, `/api/meals/shopping`, `/api/frame/music`,
`/api/frame/spotify/play|control`. Every POST needs a same-origin `Origin` header; on an error show
`HV.toast()` with the message and revert.

## Checking a page

Headless Chrome (or Playwright) against `http://<server>:8806/...` at 1280x800 and 1920x1080; look at
the PNGs. Then check: no JS errors, every .js parses as ES5 (acorn with `ecmaVersion: 5`), and every
number on screen matches the API it came from.
