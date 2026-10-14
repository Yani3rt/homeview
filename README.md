# HomeView

HomeView is a kitchen-wall dashboard for cheap Android photo frames. A small Python server on your
home network serves a set of web pages; each frame shows them full screen in its browser. The pages
look like Apple's HomeView: a Home screen of live tiles, a Standby mode with photo and clock faces,
weather, your calendars, kitchen timers, a dinner planner with a shopping list, and music controls
for Sonos and Spotify.

It has no accounts, no cloud service of its own and no database. Everything that is specific to your
house lives in one file, `config.json`.

## Screens

| Screen | Path | What it shows |
|---|---|---|
| Home | `/frame/hv/` | Tiles: Today, Tonight's dinner, Weather, Calendar, Timer, Shopping, Meals, Music (or Standby), Photos, Outside (air quality, sunset) |
| Standby | `/frame/hv/standby/` | One face at a time: photos (date bottom left, time bottom right), Info, Today, This week, Weather, Coming up, Analog, Numerals, Minimal, Month, and Now Playing while music plays |
| Today | `/frame/hv/today/` | The date, weather and hourly forecast, the next events, tonight's dinner, timers and the shopping count |
| Calendar | `/frame/hv/calendar/` | The next seven days with events, forecast and dinners, and a month grid |
| Weather | `/frame/hv/weather/` | Now, hourly, 7-day range bars, sunrise and sunset, wind, air quality |
| Meals | `/frame/hv/meals/` | Browse and search recipes, plan dinners for the next 7 days |
| Tonight | `/frame/hv/dinner/` | Tonight's recipe with ingredients, one-tap timers and a step-by-step cook view |
| Shopping | `/frame/hv/shopping/` | Every ingredient for the planned dinners, merged, with check boxes |
| Timer | `/frame/hv/timer/` | Kitchen timers, shared by every frame |
| Music | `/frame/hv/music/` | Sonos rooms, grouping, queue, favorites; Spotify search and Spotify Connect |
| Photos | `/frame/hv/photos/` | The photos in your photo folder, full screen |
| Night | `/frame/hv/night/` | A dim clock from 11 PM to 5 AM |
| Settings | `/frame/hv/settings/` | When to go to Standby, the look (Light or Glass), background, Standby faces |

The pages poll the server every few seconds with ETags, so an unchanged answer costs no download.
Timers, the meal plan and checked-off shopping items are kept on the server, so every frame shows
the same thing.

## Hardware notes

- It was built for two frames: a 10-inch at 1280x800 and a 15-inch at 1920x1080. Sizes are in
  `vh`/`vw`, so one page fits both. Any tablet or browser works too.
- The 10-inch frame runs Android 6 with an old WebView (version 106), 1 GB of RAM and a slow CPU.
  For that reason all page code is ES5 (`var` and `function`; no arrow functions, `let`, template
  strings or classes), there are no libraries or frameworks, and only `opacity` and `transform` are
  animated. Read `frame/hv/DESIGN.md` before changing a page.
- Use a kiosk browser app on the frame (any app that opens one URL full screen and keeps the screen
  on). Point it at `http://<server address>:8806/frame/hv/`.
- The server runs anywhere Python 3.10 or newer runs (it was tested on Python 3.14): a Raspberry Pi, a Mac mini, a NAS. It needs to be
  on the same network as the frames, and on the same network as your Sonos speakers if you use them.

## Setup

```sh
git clone <this repository> homeview
cd homeview
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp config.example.json config.json      # then edit config.json
.venv/bin/python server.py
```

Open `http://<server address>:8806/frame/hv/` on the frame. The server prints the address it is
listening on. Stop it with Control-C.

Python packages (`requirements.txt`): Pillow (photo resizing), icalendar and recurring-ical-events
(calendars), soco (Sonos), segno (the QR code on the Music screen). The server starts without the
optional ones; the screen that needs a missing package says so.

To start the server when the computer starts, use your system's service manager (systemd on Linux,
launchd on a Mac). Run `server.py` from the project folder.

### Tests

```sh
.venv/bin/python -m unittest discover -p 'test_*.py'
```

The tests do not use the network: Open-Meteo, TheMealDB, Spotify and Sonos are replaced with fakes.

## Configuration (`config.json`)

Copy `config.example.json` to `config.json`. Every key is optional; a missing key falls back to the
default in `config.py`. Most changes apply without a restart (the file is re-read when it changes);
`server.bind` and `server.port` need a restart.

| Key | Example | Meaning |
|---|---|---|
| `home_name` | `"Home"` | Shown in Settings |
| `timezone` | `"America/Chicago"` | IANA time zone. Every clock and "today" uses it, whatever the frame's own clock says |
| `location` | `{"name": "Home", "latitude": 41.88, "longitude": -87.63}` | Where the weather is for; `name` is the label on the weather screens |
| `units` | `{"temperature": "fahrenheit", "wind": "mph"}` | `celsius` or `fahrenheit`; wind `mph`, `kmh`, `ms` or `kn` |
| `server` | `{"bind": "0.0.0.0", "port": 8806}` | Address and port to listen on. `0.0.0.0` means every network interface |
| `data_dir` | `"data"` | Where the server keeps its state: the meal plan, timers, caches, the Spotify token |
| `photos_dir` | `"samples/photos"` | A folder of JPEG, PNG or WebP photos (subfolders are included; folders starting with a dot are skipped) |
| `wallpapers_dir` | `"wallpapers"` | Images offered under Settings > Background for the Glass look |
| `fonts_dir` | `"fonts"` | Optional `sf-pro.woff2` and `sf-rounded.woff2` (see Fonts below) |
| `calendars` | see below | ICS calendar links |
| `sonos` | `{"enabled": false, "hosts": []}` | Turn Sonos on; optionally list speaker IP addresses |
| `spotify` | `{"client_id": "", "client_secret": "", "redirect_uri": "..."}` | Your own Spotify app keys |
| `meals` | `{"api_key": "1", "cache_hours": 168}` | TheMealDB key and how long to keep cached lists |
| `timers` | `[{"label": "Pasta", "seconds": 600}]` | One-tap timers on the Tonight screen (up to four are shown) |

Relative paths are relative to the project folder. `~` is expanded.

### Calendars

```json
"calendars": [
  {"name": "Family",   "color": "#ff9f0a", "url": "https://calendar.google.com/calendar/ical/.../basic.ics"},
  {"name": "Holidays", "color": "#34c759", "holidays": true,
   "url": "https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics"}
]
```

- `url` is an ICS (iCalendar) link, or a path to a local `.ics` file. In Google Calendar it is under
  Settings > your calendar > "Secret address in iCal format". In iCloud, share the calendar publicly
  and change `webcal://` to `https://`. Outlook calls it "Publish a calendar" (ICS link).
- A private ICS link is a password: anyone with it can read the calendar. It stays in `config.json`
  on the server; it is never sent to the frames or put in an error message.
- `holidays: true` shows that calendar's events as day labels ("Halloween in 17 days") rather than as
  events.
- When the same event is on two calendars, it is shown once, in the color of the first one listed.
- Calendars are re-read every 15 minutes. The example config uses `samples/sample-calendar.ics`, a
  made-up calendar with weekly events, so a fresh copy has something to show.

### Weather

Weather and air quality come from [Open-Meteo](https://open-meteo.com/), which needs no key. The
forecast is fetched at most every 10 minutes and air quality every 30. The last good forecast is
saved in `data_dir`, so a restart or a network outage still shows it, marked "saved forecast".
Open-Meteo's free API is for non-commercial use, under 10,000 calls a day, and its data is licensed
CC BY 4.0, so the Weather screen credits Open-Meteo (terms: https://open-meteo.com/en/terms). HomeView
makes about 200 calls a day.

### Photos

Put photos in the `photos_dir` folder. The server resizes each one to the size the frame asks for
and caches the copies in `data_dir/photo_cache/`; the resized copies have no EXIF data (no location,
no camera details). The originals are never changed and never served directly. The sample photos in
`samples/photos/` are drawings made by `scripts/make_sample_photos.py`.

### Fonts

The pages are designed for Apple's SF Pro and SF Rounded. They are not included, because Apple's
font license does not allow redistributing them. If you are allowed to use them, put `sf-pro.woff2`
and `sf-rounded.woff2` in `fonts_dir`. Without them, each device uses its own system font.

## Sonos

1. Set `"sonos": {"enabled": true}` in `config.json`.
2. The server finds speakers with Sonos discovery (multicast) when Music first loads, and again every
   5 minutes. If your speakers are on a different network segment, or discovery is blocked, list
   their IP addresses instead: `"hosts": ["10.0.0.21", "10.0.0.22"]`. Give the speakers fixed
   addresses in your router so the list stays right.
3. Open Music. You can play, pause, skip, change volume per room or per group, group rooms, edit the
   queue, play Sonos favorites, set a sleep timer, and change EQ.

The Music screen also shows a QR code. Scan it with a phone on the same Wi-Fi, paste a Spotify link,
and it plays on the room you choose (through Sonos, so no Spotify keys are needed for that).

A soundbar that is playing TV sound is protected: starting music or grouping it asks first, because
it would cut the TV's sound.

## Spotify

Spotify is optional. With it, the Music screen can search Spotify and show your playlists, saved
albums and recently played, and play them on Sonos or on any Spotify Connect device. Playback on
Connect devices needs a Spotify Premium account.

1. Go to https://developer.spotify.com/dashboard and create an app. Any name works.
2. Add the redirect URI `http://127.0.0.1:8890/callback` to the app.
3. Put the app's Client ID and Client secret in `config.json` under `spotify`.
4. On the server, run `.venv/bin/python scripts/spotify_auth.py listen`, and in another terminal
   `.venv/bin/python scripts/spotify_auth.py url`. Open the printed link in a browser on the server,
   sign in, and approve. If you approve on another computer, its browser ends on a page that does not
   load: copy that page's full address and run
   `.venv/bin/python scripts/spotify_auth.py code '<that address>'`.
5. The token is saved to `data_dir/spotify_token.json` (readable only by your user). Run the script
   again if Music says to sign in again.

New Spotify developer apps start in development mode, which only works for accounts you add under
the app's "User Management" page. Add the account you will sign in with.

## Meal planning

### The recipe source: TheMealDB

Recipes come from [TheMealDB](https://www.themealdb.com), a free, crowd-sourced recipe database with
ingredients, measures, instructions and photos.

Before choosing it, these were compared (terms read on 2026-10-14):

- **TheMealDB**: full recipes; works with the shared test key `"1"`; photos come in small, medium
  and large sizes. Chosen.
- **Spoonacular**: needs a key; the free plan is 50 points a day and requires a backlink; its terms
  allow caching for at most one hour (https://spoonacular.com/food-api/terms), which does not fit a
  weekly plan. Paid plans start at $29 a month.
- **Edamam Recipe Search**: needs a key; no free plan is listed now (plans start at $9 a month);
  caching is limited to some paid plans.
- **Open Food Facts**: a product and barcode database, not recipes.
- **USDA FoodData Central**: nutrition data, not recipes; needs a free api.data.gov key.

TheMealDB's terms, as written on their pages:

- https://www.themealdb.com/api.php: "You can use the test API key "1" during development of your
  app or for educational use ... However you must become a supporter if releasing publicly on an
  appstore." Supporters also get the full database "rather than limited to 100 items", a
  multiple-ingredient filter, and can add their own meals.
- https://www.themealdb.com/terms_of_use.php: "You cannot publish apps to an appstore unless you are a
  paid subscriber." "You can scrape, copy and modify any content returned from the API, as long as you
  use the official end points." "You can use our custom artwork in your projects but must mention us
  as the source of the data." "You cannot resell our API in any way without specific permission."

What this means for HomeView:

- The pages say "Recipes from TheMealDB" on the Meals and Shopping screens, as the terms ask.
- The test key `"1"` is meant for development and education. If you use HomeView every day, become a
  TheMealDB supporter and put your own key in `config.json` as `meals.api_key`. The key stays on the
  server; the frames never see it.
- The terms do not give a rate limit or a caching rule. HomeView caches to be polite: category and
  search lists are kept for `meals.cache_hours` (default 168, one week), and each full recipe for 30
  days, in `data_dir/meals_cache/`. If TheMealDB cannot be reached, an older cached copy is used.
- Do not publish a copy of the cache or a dump of TheMealDB data.
- Some recipe photos belong to third parties; TheMealDB marks the Creative Commons ones. Do not reuse
  the photos outside this app.

### How it works

- **Meals** opens on "Ideas", a different main-course category each day. Tap a category, search by
  name, or search a main ingredient ("salmon", "chickpeas"): when a name search finds nothing, the
  server tries it as an ingredient. "Surprise me" picks a random recipe.
- Tap a recipe to see its ingredients. "Plan for a day" opens a sheet with the next seven days.
- **Next 7 days** shows the plan. "Pick a dinner" on an empty day goes back to the recipes in picking
  mode, so one tap on Plan fills that day.
- **Tonight** shows tonight's recipe with ingredients, one-tap timers from `config.json`, and a cook
  view with one step per screen. With nothing planned, it suggests three recipes.
- **Shopping** lists every ingredient of the dinners in the next 7 (or 14) days. The same ingredient
  in two recipes is one line: "2 cloves" plus "3 cloves" of garlic shows "5 cloves". Amounts are only
  added when the units match (tsp, tbsp, cup, g, kg, ml, l, oz, lb, cloves, cans and plain counts);
  other amounts such as "to taste" or "1 (12 oz.) can" are listed next to each other. Checked items
  are shared by every frame; "Clear checked" unchecks them all.
- The plan is stored in `data_dir/meal_plan.json`, one recipe per date.

## Remote commands

Any device on the network can tell the frames to open a screen, for example from a phone shortcut or
a home automation system:

```sh
curl -X POST http://<server>:8806/api/hv/command \
  -H 'Origin: http://<server>:8806' -H 'Content-Type: application/json' \
  -d '{"action": "open", "screen": "dinner"}'
```

Screens: `dinner`, `shopping`, `standby`, `today`, `timer`, `meals`, `weather`, `calendar`, `music`,
`photos`. Timers start the same way at `/api/hv/timer` with
`{"action": "start", "label": "Pasta", "seconds": 600}`.

## Security

HomeView is meant for a home network. It has no login: anyone who can reach the port can see the
screens, plan dinners and control the speakers. Do not expose the port to the internet. Every write
must come with an `Origin` header that matches the server, so a web page on another site cannot drive
the frames from your browser. Only files under `frame/` are served; `config.json`, `data/` and your
photo folder are not.

## Project layout

```
server.py          the HTTP server; serves frame/ and routes the API
config.py          reads config.json
weather_api.py     Open-Meteo weather and air quality, ICS calendars  (/api/frame)
meals_api.py       TheMealDB, the meal plan, the shopping list        (/api/meals/*)
hv_api.py          shared timers, remote commands, wallpapers, fonts  (/api/hv/*)
frame_api.py       Sonos and the photo folder                         (/api/frame/music, /api/frame/photos)
spotify_api.py     Spotify Web API                                    (/api/frame/spotify/*)
frame_img.py       resized photo copies
frame/hv/          the pages (one folder per screen), hv.css, hv.js, DESIGN.md
frame/shared/      cond.js: JSON polling with ETags
scripts/           spotify_auth.py, make_sample_photos.py, make_face_thumbs.py
samples/           sample photos and a sample calendar
test_*.py          unittest tests
```
