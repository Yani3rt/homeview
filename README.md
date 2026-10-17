<p align="center"><img src="docs/images/launcher.jpg" alt="The HomeView Home launcher: a greeting and date, tiles for Today, Weather, Smart Home, Tonight, Timer, Shopping and Photos, and a week strip of events and dinners" width="100%"></p>

# HomeView

HomeView is a home screen in the style of Apple's HomeView, for inexpensive Android photo frames. A small Python server on your home network serves the pages, and each frame shows them full screen in its browser. There are no accounts, no cloud service of its own and no database. Everything specific to your house lives in one file, `config.json`.

The screenshots were taken from this repository with its sample data (a made-up calendar, drawn sample photos and a few TheMealDB recipes).

## Features

1. [**Home launcher**](#home-launcher): a greeting, live tiles and a week strip.
2. [**Standby faces**](#standby-faces-and-schedule): clock and information faces on a day-and-time schedule.
3. [**Kitty faces**](#kitty-faces-and-backpack-rules): a cat-themed day for the kids, with backpack reminders. Cat image changes per your rules.
4. [**Weather and calendars**](#today-weather-and-calendars): forecast, air quality, ICS calendars, tides, hurricane watch and weather alerts.
5. [**Meal planning**](#meal-planning): TheMealDB or **Paprika** recipes, a 7-day plan and a step-by-step cook view.
6. [**Shopping list**](#shopping-list-and-apple-reminders): every planned ingredient merged, with optional **Apple Reminders** sync. (Apple)
7. [**Kitchen timers**](#kitchen-timers): shared timers with one-tap quick timers.
8. [**Music**](#music-sonos-and-spotify): Sonos rooms and Spotify.
9. [**Smart Home and Sleep Mode**](#smart-home-and-sleep-mode): **Home Assistant** tiles, entities, automations, scenes.
10. [**Camera**](#camera): live RTSP cameras.
11. [**Settings**](#settings-and-this-house): per frame and per house, edited on the frame.
12. [**Remote commands**](#remote-commands): open a screen or start a timer from a phone or automation.

## Quick start

You need Python 3.10 or newer (tested on 3.14) and a device with a browser on the same network.

```sh
git clone https://github.com/Yani3rt/homeview.git
cd homeview
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp config.example.json config.json      # then edit config.json
.venv/bin/python server.py
```

The server prints the address it is listening on. Open `http://<server address>:8806/frame/hv/` in any browser to try it, then point the frame's kiosk browser at the same address. Stop it with Control-C. With [uv](https://docs.astral.sh/uv/) you can skip the venv: `uv run --with-requirements requirements.txt python3 server.py`.

The example config works as it is: a sample calendar and sample photos, TheMealDB's trial key `"1"`, and Sonos and Spotify off. Change `timezone`, `location` and `units` first (see [Configuration](#configuration-configjson)).

Python packages (`requirements.txt`): Pillow (photo resizing), icalendar and recurring-ical-events (calendars), soco (Sonos), segno (the QR code on the Music screen). The server starts without the optional ones; the screen that needs a missing package says so.

To start the server when the computer starts, use your system's service manager (systemd on Linux, launchd on a Mac; see [Running on a Mac](#running-on-a-mac)). Run `server.py` from the project folder.

## Home launcher

The launcher (`/frame/hv/`) is the screen the frame comes back to. From top to bottom:

![The Home launcher: a Rain chip, the Kids paw and Settings, the Today card with the next event, Weather, Smart Home, Tonight, Timer, Shopping and Photos tiles, and the week strip with backpack icons](docs/images/launcher.jpg)

- **Greeting and date line**, with the live time (there is no separate clock button).
- **Top buttons:** Camera (when a camera is set up), [Sleep Mode](#smart-home-and-sleep-mode) (9:30 PM to 3 AM), the Rain chip when rain is coming, the Kids button (a black button with an orange cat paw) and Settings. The Kids button opens Kitty today before 3 PM and Kitty tomorrow from 3 PM; the face goes back Home after a minute untouched, or at a tap.
- **Second row of chips**, right-aligned under the buttons, only when they apply: a [weather alert](#weather-alerts) and Cooler outside.
- **Tiles:** Today (two wide; today's remaining events, "+N more" when some are hidden; once today is over it becomes a Tomorrow card with rain chance, sunrise and tomorrow's first events), Weather (temperature with high and low), Smart Home (or Outside without Home Assistant), Tonight's dinner, Timer (a big timer icon, or the countdown while one runs), Shopping (the first items), and Photos (or Music when Sonos or Spotify is set up).
- **This week:** seven days starting tomorrow, with events, planned dinners and backpack icons.

## Standby faces and schedule

When nobody has touched the frame for a while it switches to Standby (`/frame/hv/standby/`) and cycles through faces: Photos, Info, Today, This week, Weather, Tomorrow, Kitty tomorrow, Kitty today, Today board, Coming up, Analog, Numerals, Minimal, Month and the Night clock. Tap to go back Home.

*This animation predates the launcher redesign and the Kitty faces, so its Home screen looks different from today's.*

Settings > Standby faces (`/frame/hv/faces/`) turns faces on and off and sets the schedule for this frame (it is kept in the frame's browser). The week is split into day groups, Weekdays and Weekend by default, and each group into time blocks; each block lists the faces it rotates through, in order. The default blocks are Morning (5 AM), Day (9 AM), Evening (3 PM) and Night (11 PM).

![Settings > Standby faces: the Weekdays Morning block with its faces numbered in order, Kitty today added](docs/images/standby-schedule.jpg)

- A block with the Night clock is a night block: when idle the frame shows a dim red clock and what's next (`/frame/hv/night/`) instead of Standby.
- **Now Playing** takes over while music plays, and **Severe weather** interrupts during a severe alert. Neither is scheduled.
- Each photo stays up for the Photo interval and each other face for the Face interval (15 seconds to 2 minutes, default 30 seconds). A Photos turn plays three photos in a row. Appearance shades Standby to make it dimmer.
- `?face=<id>` opens one face, and `&return=<seconds>` goes back Home when untouched.

## Kid styled faces and school backpack rules

![Kitty today on a Monday morning with library, PE and picture day stickers, and Kitty tomorrow with a blue dress-up cat and snack money](docs/images/kitty-faces.jpg)

Two Standby faces made for household kids. Neither is in the schedule by default; add them in Settings > Standby faces, or use the Kids button on the launcher.

- **Kitty tomorrow** (afternoon and evening): a speech bubble from the cat, tomorrow's name in rainbow letters, tomorrow's events as cards and the backpack items as stickers.
- **Kitty today** (mornings): a sunrise sky, today's remaining events, the backpack, and a rain heads-up in cat words. It warns about later rain only when the 2 to 4 PM school pickup window has a 50% or higher chance.
- On school days both show a Cell phone sticker.

**The picture cats.** Each face shows one cat chosen for the day: a cat for each backpack item (PE, library, art, music, snack, picture day, field trip), a dress-up cat in the color named in the event title, a raincoat cat for a plain rainy day, the school backpack cat, or the weekend yarn cat. PE, music, art and library give way to any other backpack item. On Kitty today, rain plus another item keeps that item's cat and adds an umbrella and puddle. The original images live in `data/cats/` (not in git); the faces use 640-pixel WebP copies in `frame/hv/standby/cats/`.

![The picture cats with what brings each one: school day, weekend, rain, rain plus library with the umbrella and puddle, no school, field trip, PE, library, art, music, snack, picture day and the six dress-up colors](docs/images/picture-cats.jpg)

**Backpack rules** turn calendar entries into backpack items. Each rule has the words to look for in an event title (any of several, separated by `|`, not case sensitive), the item, a short note, an icon, and whether it means a day off (no backpack that day; only "No school" is one by default). Rules match all-day entries and timed ones such as an 8 AM class; a matched class shows as a sticker instead of a calendar card. Edit them on any frame in Settings > This house > Backpack (up to 30 rules; "Back to the built-in list" restores the 10 built-in ones).

![Settings > This house > Backpack: the built-in rules, with the Gym clothes rule open for editing](docs/images/backpack-rules.jpg)

In `config.json`:

```json
"backpack": [
  {"match": "physical education|pe|gym", "item": "Gym clothes", "note": "PE day · sneakers", "icon": "shoe"},
  {"match": "no school|teacher workday", "item": "No school", "icon": "home", "off": true}
]
```

Without a `backpack` key the built-in list is used. The rules also feed the Tomorrow face and the backpack icons in the launcher's week strip.

## Today, weather and calendars

- **Today** (`/frame/hv/today/`): the date, weather and hourly forecast, the next events, tonight's dinner, timers and the shopping count.
- **Calendar** (`/frame/hv/calendar/`): the next seven days with events, forecast and dinners, and a month grid.
- **Weather** (`/frame/hv/weather/`): now, hourly, 7-day range bars, sunrise and sunset, wind, air quality; tides and hurricane watch when set up.

### Weather

Weather and air quality come from [Open-Meteo](https://open-meteo.com/), which needs no key. The forecast is fetched at most every 10 minutes and air quality every 30. The last good forecast is saved in `data_dir`, so a restart or a network outage still shows it, marked "saved forecast". Open-Meteo's free API is for non-commercial use, under 10,000 calls a day, and its data is licensed CC BY 4.0, so the Weather screen credits Open-Meteo (terms: https://open-meteo.com/en/terms). HomeView makes about 200 calls a day.

### Calendars

```json
"calendars": [
  {"name": "Family",   "color": "#ff9f0a", "url": "https://calendar.google.com/calendar/ical/.../basic.ics"},
  {"name": "Holidays", "color": "#34c759", "holidays": true,
   "url": "https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics"}
]
```

- `url` is an ICS (iCalendar) link, or a path to a local `.ics` file. In Google Calendar it is under Settings > your calendar > "Secret address in iCal format". In iCloud, share the calendar publicly and change `webcal://` to `https://`. Outlook calls it "Publish a calendar" (ICS link).
- A private ICS link is a password: anyone with it can read the calendar. It stays in `config.json` on the server; it is never sent to the frames or put in an error message.
- `holidays: true` shows that calendar's events as day labels ("Halloween in 17 days") rather than as events.
- When the same event is on two calendars, it is shown once, in the color of the first one listed.
- Calendars are re-read every 15 minutes. The example config uses `samples/sample-calendar.ics`, a made-up calendar with weekly events, so a fresh copy has something to show.

### Tides and hurricane watch

![The Weather screen with a hurricane tile, a coastal flood alert chip and the Tides tile with the next high tide and a 24-hour curve](docs/images/tides-hurricane.jpg)

Both are free and need no key.

- **Tides** come from NOAA CO-OPS. Set `"tides": {"station": "<station id>"}` (find yours at tidesandcurrents.noaa.gov). The Weather screen gets a Tides tile with the next high and low, a 24-hour curve and the water temperature. `king_ft` flags a very high tide at or above that height (feet above MLLW). Predictions are cached 6 hours.
- **Hurricane watch** reads active storms from the National Hurricane Center: `"storms": {"basins": ["AL"], "radius_mi": 1500, "near_mi": 400}`. `basins` are `AL` (Atlantic, Gulf and Caribbean), `EP` and `CP`; storms farther than `radius_mi` are left out, and one within `near_mi` (or a hurricane or storm surge alert from Home Assistant) counts as near and is checked every hour. Tap a storm for NHC's 5-day cone and a QR code to open it on a phone.

### Weather alerts

![A Coastal Flood Advisory chip on the launcher, tapped to show the alert's full text](docs/images/weather-alert.jpg)

With the Home Assistant NWS Alerts integration (see [Smart Home](#smart-home-and-sleep-mode)), set `"alerts_entity": "sensor.nws_alerts_alerts"` under `home_assistant`. While an alert is active a chip shows on the launcher's second chip row and in the top bar of other screens: orange for Moderate, red for Severe and Extreme; tap it for the full text. `"alerts_min_severity"` (default `"Moderate"`) hides anything below it. A **Severe weather** Standby face shows only while a Severe or Extreme alert is active: a new one jumps the queue, then it comes back every other slide.

## Meal planning

![Meals showing Usuals, the dinners planned most often, with how many times and when each is planned next](docs/images/meals-usuals.jpg)

![Meals week, a cook step and the shopping list](docs/images/meals.jpg)

*The second image predates the launcher redesign.*

- **Meals** (`/frame/hv/meals/`) opens on "Ideas", a different main-course category each day. Tap a category, search by name, or search a main ingredient ("salmon", "chickpeas"): when a name search finds nothing, the server tries it as an ingredient. "Surprise me" picks a random recipe.
- **Favorites and Usuals.** Heart a recipe to add it to Favorites. Usuals are the dinners you plan most often, worked out from the plan history. "Pick a dinner" opens on them.
- Tap a recipe to see its ingredients. "Plan for a day" opens a sheet with the next seven days.
- **Next 7 days** shows the plan. "Pick a dinner" on an empty day goes back to the recipes in picking mode, so one tap on Plan fills that day. The plan is stored in `data_dir/meal_plan.json`, one recipe per date.
- **Tonight** (`/frame/hv/dinner/`) shows tonight's recipe with ingredients, one-tap [quick timers](#kitchen-timers), and a cook view with one step per screen. With nothing planned, it suggests three recipes.

The plan, favorites, timers and checked-off items are kept on the server, so every frame shows the same thing.

### TheMealDB

Recipes come from [TheMealDB](https://www.themealdb.com), a free, crowd-sourced recipe database with ingredients, measures, instructions and photos. The `meals` key sets it up: `{"api_key": "1", "cache_hours": 168}`.

TheMealDB's terms, as written on their pages:

- https://www.themealdb.com/api.php: "You can use the test API key "1" during development of your app or for educational use ... However you must become a supporter if releasing publicly on an appstore." Supporters also get the full database "rather than limited to 100 items", a multiple-ingredient filter, and can add their own meals.
- https://www.themealdb.com/terms_of_use.php: "You cannot publish apps to an appstore unless you are a paid subscriber." "You can scrape, copy and modify any content returned from the API, as long as you use the official end points." "You can use our custom artwork in your projects but must mention us as the source of the data." "You cannot resell our API in any way without specific permission."

What this means for HomeView:

- The pages say "Recipes from TheMealDB" on the Meals and Shopping screens, as the terms ask.
- The test key `"1"` is meant for development and education. If you use HomeView every day, become a TheMealDB supporter and put your own key in `config.json` as `meals.api_key`. The key stays on the server; the frames never see it.
- The terms give no rate limit or caching rule. HomeView caches to be polite: category and search lists are kept for `meals.cache_hours` (default 168, one week), and each full recipe for 30 days, in `data_dir/meals_cache/`. If TheMealDB cannot be reached, an older cached copy is used.
- Do not publish a copy of the cache or a dump of TheMealDB data.
- Some recipe photos belong to third parties; TheMealDB marks the Creative Commons ones. Do not reuse the photos outside this app.

<details>
<summary>Why TheMealDB (other sources compared, terms read on 2026-10-14)</summary>

- **TheMealDB**: full recipes; works with the shared test key `"1"`; photos come in small, medium and large sizes. Chosen.
- **Spoonacular**: needs a key; the free plan is 50 points a day and requires a backlink; its terms allow caching for at most one hour (https://spoonacular.com/food-api/terms), which does not fit a weekly plan. Paid plans start at $29 a month.
- **Edamam Recipe Search**: needs a key; no free plan is listed now (plans start at $9 a month); caching is limited to some paid plans.
- **Open Food Facts**: a product and barcode database, not recipes.
- **USDA FoodData Central**: nutrition data, not recipes; needs a free api.data.gov key.

</details>

### Paprika

If you keep recipes in [Paprika 3](https://www.paprikaapp.com), HomeView can show them in Meals. Put your Paprika account under `paprika` (`email`, `password`, optional `sync_hours`, default 6). The server signs in with the sync API the Paprika apps use and only reads (nothing in your account is changed). It fetches new and changed recipes and their photos and keeps a copy in `data_dir/paprika/`, so Meals still works offline. The password stays in `config.json` on the server.

With Paprika set up, Meals gets a Paprika chip next to TheMealDB's categories. With `"meals": {"provider": "paprika"}` it uses only your Paprika recipes: TheMealDB is never called, and the chips are your most-used Paprika categories.

## Shopping list and Apple Reminders

![The Shopping screen: hand-added items with counts, and Buy again cards](docs/images/shopping.jpg)

Shopping (`/frame/hv/shopping/`) lists every ingredient of the dinners planned in the next 7 (or 14) days, plus anything you add by hand.

- **Merged ingredients.** The same ingredient in two recipes is one line: "2 cloves" plus "3 cloves" of garlic shows "5 cloves". Amounts are only added when the units match (tsp, tbsp, cup, g, kg, ml, l, oz, lb, cloves, cans and plain counts); other amounts such as "to taste" or "1 (12 oz.) can" are listed next to each other. Checked items are shared by every frame.
- **Your own items** (milk, paper towels) go in the box at the top; the newest is at the top of the list. An item you add that a recipe also needs ("Eggs" and the recipe's "egg") becomes one line. Hand-added items have − n + counts and an x to remove them. Up to 100 hand-added items. From a script or phone: `POST /api/meals/shopping {"add": "milk"}` (same origin as the frame).
- **Clear checked** unchecks the recipe ingredients and drops the hand-added items you checked off, since you bought them.
- **Buy again** cards hold the things you buy often: tap one to put it on the list (it fades out until it's bought). Edit the cards on the frame (Edit).

**Apple Reminders sync (optional, Mac server only).** The list can stay in sync with an Apple Reminders list, so Siri and your phone see it, through [remindctl](https://github.com/openclaw/remindctl) (`brew install steipete/tap/remindctl`):

```json
"reminders": {"enabled": true, "list": "Groceries", "days": 7, "interval": 30, "skip": ["water", "salt", "pepper"]}
```

Sync is optional: it runs only when `enabled` isn't `false`, a `list` is set and remindctl is installed. Otherwise (a Linux server, a Mac without remindctl, or `"enabled": false`) the Shopping list is a plain local list shared by the frames, with no errors.

Every unchecked item (hand-added ones and the planned dinners' ingredients) becomes a reminder; reminders added on a phone show up on the frames; checking off, counts (`Milk ×2`) and deletions sync both ways. The server needs Reminders access: run it through `install-mac-native.sh` (see [Running on a Mac](#running-on-a-mac)) and allow it when macOS asks. Status: `http://<server>:8806/api/reminders/status`.

## Kitchen timers

Timer (`/frame/hv/timer/`) has a column of quick timers (one tap starts one) next to the usual picker. Timers are shared by every frame. The quick timers (up to four) are set once for the house in Settings > This house, or in `config.json` as `"timers": [{"label": "Pasta", "seconds": 600}]`, and also show on the Tonight screen. A timer can also be started [remotely](#remote-commands).

## Music: Sonos and Spotify

Music (`/frame/hv/music/`) shows Sonos rooms with grouping, volume, queue, favorites, sleep timer and EQ, plus Spotify search, playlists and Spotify Connect. Without speakers you can preview it with `?demo=1` (made-up titles); the [screens overview](#screens-and-paths) uses that.

### Sonos

1. Set `"sonos": {"enabled": true}` in `config.json`.
2. The server finds speakers with Sonos discovery (multicast) when Music first loads, and again every 5 minutes. If your speakers are on a different network segment, or discovery is blocked, list their IP addresses instead: `"hosts": ["10.0.0.21", "10.0.0.22"]`. Give the speakers fixed addresses in your router so the list stays right.
3. Open Music. You can play, pause, skip, change volume per room or per group, group rooms, edit the queue, play Sonos favorites, set a sleep timer, and change EQ.

The Music screen also shows a QR code. Scan it with a phone on the same Wi-Fi, paste a Spotify link, and it plays on the room you choose (through Sonos, so no Spotify keys are needed for that).

A soundbar that is playing TV sound is protected: starting music or grouping it asks first, because it would cut the TV's sound.

### Spotify

Spotify is optional. With it, Music can search Spotify and show your playlists, saved albums and recently played, and play them on Sonos or on any Spotify Connect device. Playback on Connect devices needs Spotify Premium.

1. Go to https://developer.spotify.com/dashboard and create an app. Any name works.
2. Add the redirect URI `http://127.0.0.1:8890/callback` to the app.
3. Put the app's Client ID and Client secret in `config.json` under `spotify`.
4. On the server, run `.venv/bin/python scripts/spotify_auth.py listen`, and in another terminal `.venv/bin/python scripts/spotify_auth.py url`. Open the printed link in a browser on the server, sign in, and approve. If you approve on another computer, its browser ends on a page that does not load: copy that page's full address and run `.venv/bin/python scripts/spotify_auth.py code '<that address>'`.
5. The token is saved to `data_dir/spotify_token.json` (readable only by your user). Run the script again if Music says to sign in again.

New Spotify developer apps start in development mode, which only works for accounts you add under the app's "User Management" page. Add the account you will sign in with.

## Smart Home and Sleep Mode

Smart Home (`/frame/hv/ha/`) shows a hand-picked list of Home Assistant entities as tiles, and a launcher tile (in place of Outside) shows how many are on. The server talks to Home Assistant; the frames never see its address or token, and can only act on the entities you list.

1. In Home Assistant, open your profile > Security > Long-lived access tokens > Create token.
2. Add to `config.json` (`title` names the screen):

   ```json
   "home_assistant": {
     "url": "http://10.0.0.10:8123", "token": "<the token>", "title": "Devices",
     "entities": [
       {"section": "Kitchen"}, "light.kitchen", "switch.coffee_maker",
       {"section": "Living room"}, {"entity": "climate.living_room", "name": "AC"}, "scene.movie_night",
       {"section": "Other"}, "sensor.outside_temperature", "binary_sensor.front_door", "automation.night_lights"
     ]
   }
   ```

What each kind does: lights, switches, fans and input booleans toggle (dimmable lights also get a brightness button); climate shows the temperature, a setpoint with - and +, and a mode picker; scenes, scripts and buttons run; automations are enabled or disabled; sensors and binary sensors are shown. Locks, garage doors and alarms are not controllable from the frame.

Open it from the launcher tile, Settings > Open a screen, or the remote command `"screen": "ha"`.

**Sleep Mode.** In the evening (9:30 PM to 3 AM) a Sleep Mode button on the launcher turns on a Home Assistant switch that puts the house to sleep. Tap twice to confirm.

## Camera

An RTSP camera on your network (most IP cameras and NVRs) can be shown on the Camera screen (`/frame/hv/camera/`). A camera button appears left of the clock on every screen, Camera is listed in Settings > Open a screen, and the remote command `{"action": "open", "screen": "camera"}` opens it.

The frames' browser cannot play RTSP, and decoding H.264 would be too much for them, so the server runs `ffmpeg` to read the camera and send small JPEG frames (MJPEG) to every frame that is watching. Each camera has its own ffmpeg, which runs only while that camera is watched and stops 20 seconds after the last viewer closes it. The camera address and password stay in `config.json`.

1. Install ffmpeg on the server: `brew install ffmpeg` (Mac) or `sudo apt install ffmpeg`.
2. Add to `config.json` (use each camera's low-resolution sub-stream):

   ```json
   "cameras": [
     {"name": "Front door", "url": "rtsp://user:password@10.0.0.50:554/stream2",
      "fps": 10, "width": 640, "quality": 7, "default": true},
     {"name": "Backyard", "url": "rtsp://user:password@10.0.0.51:554/stream2"}
   ]
   ```

   - The screen opens on the camera marked `"default": true` (or the first one). Each camera gets a chip at the bottom left; tap one to switch. Entries without a `url` are ignored. The older single `"camera": {...}` still works.
   - `fps` (1-25) and `width` (never upscaled) set what is sent to the frames; `quality` is the JPEG quality, 2 (best) to 31 (smallest). 640 wide at 10 fps is about 150 KB/s per frame.
   - If ffmpeg is not on the PATH (launchd), add `"ffmpeg": "/opt/homebrew/bin/ffmpeg"`.
3. Open the Camera screen. Tap the picture to switch between the whole picture and filling the screen.

Check it from any browser: `http://<server>:8806/api/camera/status`, or `.../api/camera/snapshot.jpg`. Add `?cam=<id>` for another camera; the id is its name in lowercase letters and digits (`?cam=backyard`). `/frame/hv/camera/?cam=backyard` opens the screen on that camera.

## Settings and This house

**Settings** (`/frame/hv/settings/`) is for this frame only:

- When untouched: after how many minutes, and whether to switch to Standby or stay on.
- The look (Light or Glass) and the background. Glass backgrounds come from `wallpapers_dir`.
- Appearance: Standby's brightness.
- How long each photo and each other face stays up, which Standby faces are on, and the [Standby schedule](#standby-faces-and-schedule).
- Open a screen.

**Settings > This house** (`/frame/hv/house/`) edits what every frame shares: the home name and place name, `units`, quick `timers`, the calendars' names, colors and holiday flags, and the `backpack` rules. It writes them to `config.json` and keeps the previous version as `config.json.bak`. Calendar links, passwords, keys and tokens are never sent to the frames and cannot be changed from them; edit those in the file.

## Remote commands

Any device on the network can tell the frames to open a screen, for example from a phone shortcut or a home automation system:

```sh
curl -X POST http://<server>:8806/api/hv/command \
  -H 'Origin: http://<server>:8806' -H 'Content-Type: application/json' \
  -d '{"action": "open", "screen": "dinner"}'
```

Screens: `dinner`, `shopping`, `standby`, `today`, `timer`, `meals`, `weather`, `calendar`, `music`, `photos`, `camera`, `ha`. Timers start the same way at `/api/hv/timer` with `{"action": "start", "label": "Pasta", "seconds": 600}`.

## Hardware and why the pages are ES5

- It was built for two frames: a 10-inch at 1280x800 and a 15-inch at 1920x1080. Sizes are in `vh`/`vw`, so one page fits both. Any tablet or browser works too.
- The 10-inch frame runs Android 6 with an old WebView (version 106), 1 GB of RAM and a slow CPU. So all page code is ES5 (`var` and `function`; no arrow functions, `let`, template strings or classes), there are no libraries or frameworks, and only `opacity` and `transform` are animated. Read `frame/hv/DESIGN.md` before changing a page.
- On the frame, use a kiosk browser app (any app that opens one URL full screen and keeps the screen on) pointed at `http://<server address>:8806/frame/hv/`. On a Frameo frame, read the next section first.
- The server runs anywhere Python runs: a Raspberry Pi, a Mac mini, a NAS. It must be on the same network as the frames, and as your Sonos speakers if you use them.

## Setting up a Frameo frame

Cheap Frameo frames are locked down, and Frameo fights any other app for the screen. This is what worked on ours (a 10-inch Allwinner A33 on Android 6.0.1, and a 15-inch Pastigio FRAME156, Rockchip RK3326 on Android 8.1). Boards differ even under one product name, so check yours first.

- **Start with [wesbos/photo-frame-dashboard](https://github.com/wesbos/photo-frame-dashboard).** It lists many frames by board, with how each one gets adb and root, and it includes a small WebView kiosk app. Read its rules before writing anything to a frame.
- **adb:** there is no Play Store, so apps go on with `adb install`. On most Frameo builds adb is a switch in Frameo's own settings (Settings → About → Beta Program → ADB access). Both of our frames ship a working `su`.
- **Make the kiosk the Home app.** Android starts the Home app at boot and the Home button returns to it. On Android 8 and later: `adb shell cmd package set-home-activity <package>/<activity>`. On Android 6 that command does not exist: press Home on the frame and pick your kiosk with "Always".
- **Turn Frameo off.** Frameo puts its slideshow over your kiosk every time the screen wakes (17 seconds after waking on our 10-inch), and it runs its own sleep schedule. Once the kiosk is the Home app: `adb shell su 0 pm disable net.frameo.frame`. Plain `pm disable-user` worked on Android 8.1 and was refused on Android 6; through `su 0` it worked there too. It freed about 140 MB of RAM on one of our 1 GB frames and about 200 MB on the other. Undo: `adb shell su 0 pm enable net.frameo.frame`.
- **Turn off the vendor updater too.** It can install apps and reboot the frame. Look for a package with `fota` or `ota` in its name (`adb shell pm list packages | grep -i ota`), for example `com.adups.fota` or `com.muxintu.app.mxota`, and disable it the same way.
- **Keep a way back before you close one.** Check that adb still works without Frameo: network adb on our 10-inch comes from `persist.adb.tcp.port` and `persist.service.adb.enable` (`adb shell getprop | grep adb`), not from Frameo. A frame where Frameo was the only way in can lock you out.
- **Some Allwinner A33 frames run a vendor background killer** (`BackgroundManagerService`, "package not in whitelist" in logcat). It stops background services and the boot-completed broadcast for any app not on its list, and it killed our kiosk whenever Frameo came forward. A kiosk that is the Home app and starts no background service survives it. On our 10-inch, `adb shell settings put system kill_background_services 0` also turned it off (`1` to undo).
- **adb on these frames serves one computer at a time.** If a frame shows `offline` or `error: closed`, run `adb disconnect <ip>:5555` on the other computer. On our 10-inch adb also stopped answering once while the screen kept working; turning the frame off and on fixed it.
- These frames have old Android and a root `su` that asks no questions. Install nothing you do not trust, and keep them on a guest or IoT network.

## Running on a Mac

`install-mac.sh` sets up the virtualenv. `install-mac-native.sh` then runs the server inside a tiny compiled app (`~/Applications/HomeView.app`, from `macapp/main.c`) that starts at login and keeps the server running. A plain launchd service cannot reach devices on your network on recent macOS (Local Network privacy: "No route to host"), and cannot get Reminders access; an app can, after you allow it once. `restart-mac.sh` restarts the server; `uninstall-mac.sh` removes it.

## Configuration (`config.json`)

Copy `config.example.json` to `config.json`. Every key is optional; a missing key falls back to the default in `config.py`. Most changes apply without a restart (the file is re-read when it changes); `server.bind` and `server.port` need a restart. Relative paths are relative to the project folder, and `~` is expanded. Some keys can also be edited on the frame in [Settings > This house](#settings-and-this-house).

| Key | Example | Meaning |
|---|---|---|
| `home_name` | `"Home"` | Shown in Settings |
| `timezone` | `"America/Chicago"` | IANA time zone. Every clock and "today" uses it, whatever the frame's own clock says |
| `location` | `{"name": "Home", "latitude": 41.88, "longitude": -87.63}` | Where the weather is for; `name` is the label on the weather screens |
| `units` | `{"temperature": "fahrenheit", "wind": "mph"}` | `celsius` or `fahrenheit`; wind `mph`, `kmh`, `ms` or `kn` |
| `server` | `{"bind": "0.0.0.0", "port": 8806}` | Address and port to listen on. `0.0.0.0` means every network interface |
| `data_dir` | `"data"` | Where the server keeps its state: the meal plan, timers, caches, the Spotify token |
| `photos_dir` | `"samples/photos"` | A folder of JPEG, PNG or WebP photos (see [Photos](#photos)) |
| `wallpapers_dir` | `"wallpapers"` | Images offered under Settings > Background for the Glass look |
| `fonts_dir` | `"fonts"` | Optional `sf-pro.woff2` and `sf-rounded.woff2` (see [Fonts](#fonts)) |
| `calendars` | see [Calendars](#calendars) | ICS calendar links |
| `sonos` | `{"enabled": false, "hosts": []}` | Turn Sonos on; optionally list speaker IP addresses ([Sonos](#sonos)) |
| `spotify` | `{"client_id": "", "client_secret": "", "redirect_uri": "..."}` | Your own Spotify app keys ([Spotify](#spotify)) |
| `meals` | `{"api_key": "1", "cache_hours": 168}` | TheMealDB key and how long to keep cached lists; `"provider": "paprika"` uses only your Paprika recipes ([TheMealDB](#themealdb)) |
| `paprika` | `{"email": "", "password": "", "sync_hours": 6}` | Your Paprika 3 account, read-only ([Paprika](#paprika)) |
| `timers` | `[{"label": "Pasta", "seconds": 600}]` | Quick timers on the Timer and Tonight screens (up to four) |
| `backpack` | see [Kitty faces](#kitty-faces-and-backpack-rules) | Backpack rules for the Tomorrow and Kitty faces (up to 30) |
| `cameras` | see [Camera](#camera) | RTSP cameras for the Camera screen (older single `camera` still works) |
| `home_assistant` | see [Smart Home](#smart-home-and-sleep-mode) | Entities on the Smart Home screen, and [weather alerts](#weather-alerts) |
| `reminders` | see [Shopping list](#shopping-list-and-apple-reminders) | Optional two-way sync with an Apple Reminders list (Mac with remindctl only); `"enabled": false` turns it off |
| `tides` | `{"station": "", "king_ft": 2.4}` | NOAA tide station for the Tides tile ([Tides](#tides-and-hurricane-watch)) |
| `storms` | `{"basins": ["AL"], "radius_mi": 1500, "near_mi": 400}` | [Hurricane watch](#tides-and-hurricane-watch) |

### Photos

Put photos in the `photos_dir` folder; subfolders are included, and folders starting with a dot are skipped. Photos (`/frame/hv/photos/`) shows them full screen. The server resizes each one to the size the frame asks for and caches the copies in `data_dir/photo_cache/`; the resized copies have no EXIF data (no location, no camera details). The originals are never changed and never served directly. The sample photos in `samples/photos/` are drawings made by `scripts/make_sample_photos.py`.

### Fonts

The pages are designed for Apple's SF Pro and SF Rounded. They are not included, because Apple's font license does not allow redistributing them. If you are allowed to use them, put `sf-pro.woff2` and `sf-rounded.woff2` in `fonts_dir`. Without them, each device uses its own system font.

## Screens and paths

![Home, Today, Weather, Meals week, Tonight, Shopping, Music, Settings, Standby faces and This house](docs/images/screens.jpg)

| Screen | Path | See |
|---|---|---|
| Home | `/frame/hv/` | [Home launcher](#home-launcher) |
| Standby | `/frame/hv/standby/` | [Standby faces](#standby-faces-and-schedule) |
| Standby faces | `/frame/hv/faces/` | [Standby faces](#standby-faces-and-schedule) |
| Night | `/frame/hv/night/` | [Standby faces](#standby-faces-and-schedule) |
| Today | `/frame/hv/today/` | [Today, weather and calendars](#today-weather-and-calendars) |
| Calendar | `/frame/hv/calendar/` | [Today, weather and calendars](#today-weather-and-calendars) |
| Weather | `/frame/hv/weather/` | [Today, weather and calendars](#today-weather-and-calendars) |
| Meals | `/frame/hv/meals/` | [Meal planning](#meal-planning) |
| Tonight | `/frame/hv/dinner/` | [Meal planning](#meal-planning) |
| Shopping | `/frame/hv/shopping/` | [Shopping list](#shopping-list-and-apple-reminders) |
| Timer | `/frame/hv/timer/` | [Kitchen timers](#kitchen-timers) |
| Music | `/frame/hv/music/` | [Music](#music-sonos-and-spotify) |
| Photos | `/frame/hv/photos/` | [Photos](#photos) |
| Camera | `/frame/hv/camera/` | [Camera](#camera) |
| Smart Home | `/frame/hv/ha/` | [Smart Home](#smart-home-and-sleep-mode) |
| Settings | `/frame/hv/settings/` | [Settings](#settings-and-this-house) |
| This house | `/frame/hv/house/` | [Settings](#settings-and-this-house) |

## How it fits together

![Frames talk to the HomeView server, which talks to Open-Meteo, TheMealDB, ICS calendars, Sonos and Spotify](docs/images/architecture.svg)

The pages poll the server every few seconds with ETags, so an unchanged answer costs no download. The server is the only thing that talks to the outside services, so keys and private calendar links never reach the frames.

## Security

HomeView is meant for a home network. It has no login: anyone who can reach the port can see the screens, plan dinners and control the speakers. Do not expose the port to the internet. Every write must come with an `Origin` header that matches the server, so a web page on another site cannot drive the frames from your browser. Only files under `frame/` are served; `config.json`, `data/` and your photo folder are not.

## Project layout

```
server.py          the HTTP server; serves frame/ and routes the API
config.py          reads config.json
weather_api.py     Open-Meteo weather and air quality, ICS calendars  (/api/frame)
meals_api.py       TheMealDB, the meal plan, favorites, shopping list (/api/meals/*)
paprika_api.py     read-only sync of your Paprika recipes             (/api/meals/paprika)
settings_api.py    Settings > This house, writes config.json          (/api/settings)
storms_api.py      hurricane watch from the National Hurricane Center (/api/storms)
tides_api.py       NOAA tides and water temperature                   (/api/tides)
hv_api.py          shared timers, remote commands, wallpapers, fonts  (/api/hv/*)
camera_api.py      RTSP camera relayed as MJPEG through ffmpeg        (/api/camera/*)
ha_api.py          Home Assistant entities and actions, weather alerts (/api/ha/*)
reminders_sync.py  optional two-way sync with Apple Reminders  (/api/reminders/status)
frame_api.py       Sonos and the photo folder                         (/api/frame/music, /api/frame/photos)
spotify_api.py     Spotify Web API                                    (/api/frame/spotify/*)
frame_img.py       resized photo copies
frame/hv/          the pages (one folder per screen), hv.css, hv.js, DESIGN.md
frame/hv/launch/   the Home launcher
frame/hv/standby/  Standby and its faces; cats/ holds the Kitty faces' pictures
frame/hv/faces/    Standby faces picker and the schedule (sched.js)
frame/hv/house/    Settings > This house
frame/shared/      cond.js: JSON polling with ETags
scripts/           spotify_auth.py, make_sample_photos.py, make_face_thumbs.py
samples/           sample photos and a sample calendar
docs/images/       README images
test_*.py          unittest tests
```

## Tests

```sh
.venv/bin/python -m unittest discover -p 'test_*.py'
```

The tests do not use the network: Open-Meteo, TheMealDB, Paprika, NOAA, NHC, Spotify and Sonos are replaced with fakes.

## License and credits

MIT. See [LICENSE](LICENSE).

- Recipes, ingredients and recipe photos come from [TheMealDB](https://www.themealdb.com) under its own terms (see [TheMealDB](#themealdb)). HomeView says "Recipes from TheMealDB" on the Meals and Shopping screens.
- Weather and air quality come from [Open-Meteo](https://open-meteo.com/), licensed CC BY 4.0. The Weather screen credits Open-Meteo.
- Tides come from NOAA CO-OPS and storm data from the National Hurricane Center, both US government data.
- Paprika is a product of Hindsight Labs; HomeView only reads your own recipes from your own account.
- Sonos control uses [SoCo](https://github.com/SoCo/SoCo). The design follows Apple's HomeView, but Apple's fonts and artwork are not included.
- The sample photos are drawings made by `scripts/make_sample_photos.py`.
