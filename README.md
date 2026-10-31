# Riff

Spotify now playing, and a remote, for the Even Realities G2. An Even Hub plugin: a web app that runs in the Even
Realities phone app and draws to the glasses over Bluetooth.

## On the glasses

**Full display:** the cover, centred, as plain greyscale first and then dissolving into dots. Under it, centred: title,
artist, and album and year. At the bottom: a play or pause button (it shows what a tap does), elapsed time, a progress
line with a dot, and total time. The third text line also shows messages: the controls after the app starts or wakes,
swipe feedback, and the position while scrubbing. When a song changes, the old text stays until the new cover is in.

**Corner display:** after an idle time the player shrinks into a corner: a small cover (with a pause symbol while
paused), title, artist and a progress bar. It can hide completely and reappear on a song change or any gesture.

## Controls

| Gesture (temple or R1 ring) | Normal | Scrub mode |
| --- | --- | --- |
| Tap | Play / pause (while hidden, the first tap shows the corner) | Commit the seek |
| Swipe down | Next track | Forward 5s (10s, then 30s on quick repeats) |
| Swipe up | Previous track | Back, same steps |
| Long press | Scrub mode (from the corner: full display) | Cancel |
| Double tap | Exit (confirmation) | Exit |

The on-glasses hint uses `•` for a tap, `↓` `↑` for swipes and `─` for a long press. Scrub mode cancels after 6 seconds
idle, playback keeps going meanwhile, and nothing is sent to Spotify until you tap.

## Settings

Open the app on your phone, change things, tap Save. **Set up Spotify** holds the sign-in steps and folds away once
you're connected. The rest: lowercase text, dither on or off, swap swipe directions, how often the progress line checks
for movement, when to shrink into a corner and which one, a progress bar in the corner, when to hide the corner, and
how long it reappears for.

## Setup

You need Spotify Premium for playback controls.

1. `npm install`
2. `npm run dev`, then `npm run simulate`. For real glasses, put the phone and computer on one network, run
   `npx evenhub qr --url "http://<your LAN IP>:5173"` and scan it in the Even Realities app (developer mode).
3. In the app's settings, open **Set up Spotify** and follow the steps: make an app in the
   [developer dashboard](https://developer.spotify.com/dashboard) with `https://lolswirl.github.io/riff/callback/` as
   its redirect URI, paste the client ID, sign in, copy the code from the page you land on, and paste it back. It uses
   PKCE, so there is no client secret.

That landing page is `docs/callback/index.html`, served by GitHub Pages from `/docs`. It only shows the code from its own
address. If you fork this, host it yourself and change `REDIRECT_URI` in `src/signin.ts`.

To get a token from a computer instead, add `http://127.0.0.1:8899/callback` as a second redirect URI, run
`npm run auth -- <client id>`, and paste the client ID and token into the settings.

## Installing without a dev server

1. `npm run pack` builds, raises the patch version (in `app.json`, `package.json` and the lockfile) and writes
   `riff.ehpk`.
2. Upload it on the Builds tab of your project at [hub.evenrealities.com](https://hub.evenrealities.com).
3. In the Even Realities app: Even Hub, Me, Apps, Private builds, Install.
4. Launch it from the phone and sign in again. The installed app keeps its own settings.

Private builds launch from the phone, not the glasses menu, and only survive backgrounding briefly. Every change needs a
fresh pack and upload.

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run simulate` | Opens the Even Hub simulator on the dev server |
| `npm run auth -- <client id>` | Gets a Spotify refresh token |
| `npm test` | Unit tests |
| `npm run build` | Type-check and build |
| `npm run pack` | Build, bump the version, package as `riff.ehpk` |

## Notes

- The glasses have one text size and no alignment, so corner text is right-justified by giving each line a box that ends
  at the progress bar, and the full display centres with spaces. Both lean on a width estimate in `src/align.ts`. If
  lines sit too far from the bar, lower `SPARE`; if one wraps, raise it.
- A page holds at most 4 images: the full display uses 3 (cover, progress line, button), the corner 2. Gestures go to a
  blank container in every layout, because a text box whose text overflows scrolls instead of passing swipes on.
- Image updates are the slow part of the link. Each cover frame waits for the last to go out, and the dissolve follows a
  clock (`DITHER_DELAY_MS`, `DISSOLVE_MS` in `src/main.ts`), skipping steps on a slow link. Frames are 16-level greyscale
  PNGs (`src/png.ts`) to keep them small.
- `description.md` is the store listing text, which has a 2,000 character limit.
