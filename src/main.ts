import { OsEventTypeList, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk';
import { boxWidth, center, textWidth } from './align.ts';
import { loadConfig, saveConfig, type Config, type Corner } from './config.ts';
import { COVER_GRID, COVER_SCALE, COVER_SIZE, loadCoverArt, MINI_GRID, MINI_SCALE, renderCoverCanvas, type CoverArt } from './cover.ts';
import { dissolveFrame } from './dither.ts';
import { BAR_H, BAR_W, createLayout, ICON_SIZE, ImageSender, rebuildLayout, resetTextCache, withTimeout, setText, SCOPE_H, SCOPE_W, ELAPSED_W, type CornerWidths, type Mode } from './glasses.ts';
import { marquee } from './marquee.ts';
import { pngFromCanvas, pngFromGray } from './png.ts';
import { Scrubber } from './scrub.ts';
import { authorizeUrl, exchangeCode, parseRedirect, randomString, REDIRECT_URI } from './signin.ts';
import { Spotify, SpotifyError, type PlayerState } from './spotify.ts';
import { wantedMode } from './visibility.ts';

const bridge = await waitForEvenAppBridge();
let config: Config = await loadConfig(bridge);

// the settings page below has to keep working even if the glasses page fails to build
try {
    const layout = await createLayout(bridge, 'full', config.corner);
    if (layout !== 0) {
        // 1 invalid, 2 oversize, 3 out of memory. a reloaded page also lands here when the glasses still show the
        // previous run's page, so take over by rebuilding it
        console.error('createStartUpPageContainer failed:', layout);
        const taken = await rebuildLayout(bridge, 'full', config.corner);
        console.warn(taken ? 'took over the existing page' : 'could not rebuild the page either');
    }
} catch (e) {
    console.error('createStartUpPageContainer threw:', e);
}

const sender = new ImageSender(bridge);
const scopeCanvas = document.createElement('canvas');
scopeCanvas.width = SCOPE_W;
scopeCanvas.height = SCOPE_H;
const scopeCtx = scopeCanvas.getContext('2d')!;
const scrub = new Scrubber();

let spotify: Spotify | null = null;
let state: PlayerState | null = null;
let notice: { text: string; until: number } | null = null;
let lastNotice = ''; // kept for the phone page, since the glasses message disappears after a few seconds
let foreground = true;
let mode: Mode = 'full';
let switching = false; // true while the page is being rebuilt
let lastActivity = performance.now();
let cornerEnteredAt = 0; // when the corner last appeared by itself, for the hide timer
let playHold: { playing: boolean; until: number } | null = null; // the play state a tap just set, until spotify catches up
let lastToggleAt = 0;
let stealth = false; // true once the display has gone hidden: the corner only shows briefly from then on
let revealUntil = 0;
let cornerKey = ''; // which track and play state the corner marquee is scrolling, so it restarts when they change
let cornerSince = 0;
let coverTrack: string | null = null; // the track whose cover is on the glasses, or being rendered
const covers: Record<string, number[] | undefined> = {}; // rendered covers by variant: mini, miniPaused, and full:<step>
const DITHER_DELAY_MS = 1500; // how long the full display shows the plain cover before it dissolves into dots
// the dissolve follows this clock, but a frame is only sent once the one before it has gone out. a slow link
// skips steps instead of running late, so the dots are always finished in time
const DISSOLVE_MS = 3000;
const COVER_WAIT_MS = 5000; // the longest the full display holds everything back for the cover
let dissolve = 16; // the bayer step of the cover on the glasses or on its way there: 16 is plain, 0 is all dots
let dissolveFrom = 0; // when the plain cover reached the glasses, which the delay counts from
let fullSince = 0; // when the full display started waiting for this track's cover
let coverShown = ''; // the variant the glasses have confirmed receiving
let coverUp = false; // the full display has shown a cover since its page was built
let coverShownTrack: string | null = null; // the track whose cover the full display last confirmed
let polled = false; // true once spotify has answered at least once
let art: Promise<CoverArt> | undefined; // the plain and dotted pictures of the current track's cover
let miniBase: HTMLCanvasElement | undefined; // the small cover before anything is drawn over it
let coverSent = ''; // which cover variant (full:<step>, mini, miniPaused) is on the glasses
let coverPending = ''; // the variant being rendered
let pollTimer: number | undefined;
let scrubTimer: number | undefined;
let scopeTimer: number | undefined;
let ignoreClickUntil = 0;
let lastScrollAt = 0;
let lastMarkerKey = '';

const SCRUB_IDLE_MS = 6000;
const SCROLL_GAP_MS = 120;
// characters of title or artist shown at once in the corner strip before it scrolls. the font isn't
// monospaced and the docs give no metrics, so this is a guess to tune on the glasses
const CORNER_UNITS = 18.4; // average-character widths shown at once in a corner line (about 193 of the 200 units)
const FULL_UNITS = 50; // average-character widths shown at once across the full display's text box (560 units wide)
const BOX_UNITS = 53.3; // the whole box, which is what centring works against
const HINT_MS = 8000; // how long the controls line stays up after start or waking
let hintUntil = performance.now() + HINT_MS;
let infoKey = ''; // the track whose title is scrolling in the full display
let infoSince = 0;
const CORNER_MAX_W = 200; // widest a corner text box gets
let layoutWidths: CornerWidths | undefined; // box widths the current corner page was built with

function connect(): void {
    spotify =
        config.clientId && config.refreshToken
            ? new Spotify({ clientId: config.clientId, refreshToken: config.refreshToken }, (refreshToken) => {
                  config = { ...config, refreshToken };
                  void saveConfig(bridge, config);
              })
            : null;
}

// ---- helpers ------------------------------------------------------------------------------------

function positionMs(now: number): number {
    if (!state) return 0;
    const moved = state.isPlaying ? now - state.fetchedAt : 0;
    return Math.min(state.durationMs, Math.max(0, state.progressMs + moved));
}

function clock(ms: number): string {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// the lowercase setting, applied to everything the glasses show as text
const cased = (text: string): string => (config.lowercase ? text.toLowerCase() : text);

function trim(text: string, max: number): string {
    return text.length > max ? text.slice(0, max - 1) + '...' : text;
}

// shows a message on the glasses' third text line, under the artist, for a few seconds. remember keeps it on the phone page too
function flash(text: string, ms = 4000, remember = true): void {
    notice = { text, until: performance.now() + ms };
    if (remember) lastNotice = text;
}

function describe(e: unknown): string {
    if (e instanceof SpotifyError) {
        if (e.status === 401) return 'Spotify rejected the token. Run npm run auth again.';
        if (e.status === 403) {
            if (e.reason === 'PREMIUM_REQUIRED') return 'Spotify Premium is needed for playback controls.';
            return `Spotify refused: ${trim(e.detail || e.reason || 'forbidden', 60)}`;
        }
        if (e.status === 404) return 'No active Spotify device. Start playback on one.';
        if (e.status === 429) return 'Spotify is rate limiting. Slowing down.';
        return `Spotify error ${e.status}.`;
    }
    return 'Offline. Retrying.';
}

// ---- polling ------------------------------------------------------------------------------------

function schedule(ms: number): void {
    window.clearTimeout(pollTimer);
    pollTimer = window.setTimeout(poll, ms);
}

async function poll(): Promise<void> {
    if (!spotify || !foreground) return schedule(3000);
    try {
        const previous = state?.trackId ?? null;
        state = await spotify.getState();
        polled = true;
        // spotify takes a moment to report a play or pause, so for a couple of seconds after a tap the answer we
        // just got may still show the old state. keep what the tap set instead of flipping back
        if (state && playHold && performance.now() < playHold.until) state = { ...state, isPlaying: playHold.playing };
        // a new song brings the corner back for a moment when it has been hidden
        if (stealth && state && state.trackId !== previous) reveal();
        syncCover();
    } catch (e) {
        polled = true;
        flash(describe(e));
    }
    schedule(state?.isPlaying ? 3000 : 8000);
}

// a pause symbol over the middle of the small cover, shown while paused
function withPauseSymbol(base: HTMLCanvasElement): HTMLCanvasElement {
    const out = document.createElement('canvas');
    out.width = base.width;
    out.height = base.height;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(base, 0, 0);
    const n = base.width;
    const box = Math.round(n * 0.52);
    const x0 = Math.round((n - box) / 2);
    ctx.fillStyle = '#000';
    ctx.fillRect(x0, x0, box, box);
    ctx.fillStyle = '#fff';
    const barW = Math.round(box * 0.24);
    const barH = Math.round(box * 0.6);
    const y = Math.round((n - barH) / 2);
    ctx.fillRect(Math.round(n / 2 - barW * 1.3), y, barW, barH);
    ctx.fillRect(Math.round(n / 2 + barW * 0.3), y, barW, barH);
    return out;
}

async function renderMini(url: string, paused: boolean, id: string | null): Promise<number[]> {
    const base = miniBase ?? (await renderCoverCanvas(url, MINI_GRID, MINI_SCALE, config.dither));
    if (coverTrack === id) miniBase = base;
    // both versions are made at once, so pausing or resuming swaps the image without waiting to draw one
    const [playing, pausedPng] = await Promise.all([pngFromCanvas(base), pngFromCanvas(withPauseSymbol(base))]);
    if (coverTrack === id) {
        covers.mini = playing;
        covers.miniPaused = pausedPng;
    }
    return paused ? pausedPng : playing;
}

// starts the full display's cover over: plain first, then the dissolve into dots
function restartDissolve(): void {
    fullSince = performance.now();
    dissolveFrom = 0;
    dissolve = 16;
    coverShown = '';
}

// after a new song starts, the old text, times and line stay up until its cover is in, and then all change together
function holdingForCover(now: number): boolean {
    if (mode !== 'full' || !coverUp || scrub.active || now >= fullSince + COVER_WAIT_MS) return false;
    return !!state?.imageUrl && coverShownTrack !== state.trackId;
}

// the full display shows only the cover until it is on the glasses, so the rest doesn't appear piece by piece
function waitingForCover(now: number): boolean {
    if (mode !== 'full' || now >= fullSince + COVER_WAIT_MS) return false;
    return !polled || (!!state?.imageUrl && !coverUp);
}

async function renderFull(url: string, step: number): Promise<number[]> {
    art ??= loadCoverArt(url);
    try {
        const { plain, ink } = await art;
        return pngFromGray(dissolveFrame(plain, ink, COVER_GRID, COVER_SCALE, step), COVER_SIZE, COVER_SIZE);
    } catch (e) {
        art = undefined;
        throw e;
    }
}

function sendCover(key: string, png: number[], id: string | null, forMode: Mode): void {
    coverSent = key;
    void sender.send('cover', png).then(() => {
        // a page change in the meantime dropped the frame, and the cover has to be sent again
        if (coverTrack !== id || mode !== forMode || coverSent !== key) return;
        coverShown = key;
        if (forMode === 'full') {
            if (key === 'full:16') dissolveFrom = performance.now();
            coverUp = true;
            coverShownTrack = id;
            refreshText();
        }
        syncCover(); // asks for the next step of the dissolve straight away
    });
}

// puts the current track's cover on the glasses, in the size the current page needs, and with a pause symbol
// over the small one while paused. force resends it even when nothing changed, which is needed after a page rebuild
function syncCover(force = false): void {
    if (!state?.imageUrl || switching || mode === 'hidden') return; // hidden has no cover container
    if (state.trackId !== coverTrack) {
        coverTrack = state.trackId;
        for (const k of Object.keys(covers)) delete covers[k];
        art = undefined;
        miniBase = undefined;
        coverSent = coverPending = '';
        restartDissolve();
    }
    // the next step is wanted once the glasses have the current one, and is however far the clock has got
    if (mode === 'full' && config.dither && dissolve > 0 && coverShown === `full:${dissolve}` && dissolveFrom) {
        const late = performance.now() - dissolveFrom - DITHER_DELAY_MS;
        if (late >= 0) dissolve = Math.min(dissolve, Math.max(0, 16 - Math.floor((late / DISSOLVE_MS) * 16)));
    }
    const key = mode === 'full' ? `full:${dissolve}` : state.isPlaying ? 'mini' : 'miniPaused';
    if (!force && (coverSent === key || coverPending === key)) return;
    const forMode = mode;
    const id = coverTrack;
    const cached = covers[key];
    if (cached) return sendCover(key, cached, id, forMode);

    coverPending = key;
    const render = mode === 'full' ? renderFull(state.imageUrl, Number(key.slice(5))) : renderMini(state.imageUrl, key === 'miniPaused', id);
    render
        .then((png) => {
            covers[key] = png;
            if (coverPending === key) coverPending = '';
            if (coverTrack === id && mode === forMode && !switching) sendCover(key, png, id, forMode);
        })
        .catch((e) => {
            console.warn(e);
            coverPending = '';
            if (coverTrack === id) coverTrack = null; // try again on the next poll
        });
}

// ---- screen -------------------------------------------------------------------------------------

// the full display's text, centred: title, artist, then a line that is a message when there is one (a notice,
// the scrub position, the controls just after waking) and the album and year otherwise.
// a line too wide for the box scrolls like the corner's
function infoText(now: number): string {
    const message = (...lines: string[]) => lines.map((l) => center(cased(l), BOX_UNITS)).join('\n');
    if (!spotify) return message('Riff', 'setup needed', 'open the app on your phone to connect');
    if (!state) return message('Riff', 'nothing playing', 'start a song on any Spotify device');
    const key = `${state.trackId}`;
    if (key !== infoKey) {
        infoKey = key;
        infoSince = now;
    }
    const elapsed = now - infoSince;
    const line = (text: string) => center(marquee(text, FULL_UNITS, elapsed, textWidth), BOX_UNITS);
    return [cased(state.title), cased(state.artist), detailText(now)].map(line).join('\n');
}

function detailText(now: number): string {
    if (!state) return ' ';
    if (notice && now < notice.until) return cased(notice.text);
    if (scrub.active) {
        const delta = scrub.position - positionMs(now);
        return cased(`SCRUB  ${delta < 0 ? '-' : '+'}${clock(Math.abs(delta))}  ↕ ${scrub.stepMs / 1000}s  • go  ─ cancel`);
    }
    // the arrows follow the sdk's names for the two swipe events (SCROLL_TOP is up, SCROLL_BOTTOM is down). the glasses'
    // font has these four arrows but no pause or media symbols. a tap is a bullet and a hold is a thin line, like morse. ● and ━ were too large, and · too small. if the bullet isn't in the font it just doesn't draw, and ° is the fallback
    const [forward, back] = config.invertSwipe ? ['↑', '↓'] : ['↓', '↑'];
    if (now < hintUntil) return `• play/pause  ${forward} next  ${back} prev  ─ scrub`;
    // a single usually has the song's own name as its album, which just repeats the title
    const sameAsTitle = state.album.trim().toLowerCase() === state.title.trim().toLowerCase();
    return cased([sameAsTitle ? '' : state.album, state.year].filter(Boolean).join(' · ')) || ' ';
}

// two lines for the corner. either one scrolls when it is too long to fit
function cornerText(now: number): string {
    if (!spotify || !state) return cornerLines().join('\n'); // the lines the box widths came from, with the lowercase setting
    const key = `${state.trackId}`;
    if (key !== cornerKey) {
        cornerKey = key;
        cornerSince = now;
    }
    const elapsed = now - cornerSince;
    const [title, artist] = cornerLines();
    return `${marquee(title, CORNER_UNITS, elapsed, textWidth)}\n${marquee(artist, CORNER_UNITS, elapsed, textWidth)}`;
}

// the two corner lines before any scrolling
function cornerLines(): [string, string] {
    if (!spotify) return [cased('Riff'), 'setup needed'];
    if (!state) return [cased('Nothing playing'), ' '];
    return [cased(state.title), cased(state.artist)];
}

// box widths for the right hand corners: as wide as each line, or the full strip if it scrolls
function cornerWidths(): CornerWidths | undefined {
    if (!config.corner.endsWith('right')) return undefined;
    const [title, artist] = cornerLines();
    const w = (line: string) => (textWidth(line) > CORNER_UNITS ? CORNER_MAX_W : boxWidth(line, CORNER_MAX_W));
    return { title: w(title), artist: w(artist) };
}

function sameWidths(a?: CornerWidths, b?: CornerWidths): boolean {
    return a?.title === b?.title && a?.artist === b?.artist;
}

function refreshText(): void {
    if (switching || mode === 'hidden') return;
    if (mode === 'corner') {
        if (!foreground) return;
        syncCover(); // swaps the pause symbol on the small cover when play state changes
        // a different song needs different box widths, which means a new page
        if (!sameWidths(cornerWidths(), layoutWidths)) return void setMode('corner', true);
        const [title, artist] = cornerText(performance.now()).split('\n');
        if (layoutWidths) {
            setText(bridge, 'info', title);
            setText(bridge, 'line2', artist || ' ');
        } else {
            setText(bridge, 'info', `${title}\n${artist}`);
        }
        return;
    }
    const now = performance.now();
    if (waitingForCover(now)) {
        for (const key of ['info', 'elapsed', 'total'] as const) setText(bridge, key, ' ');
        return;
    }
    if (holdingForCover(now)) return;
    const duration = state?.durationMs ?? 0;
    setText(bridge, 'info', infoText(now));
    // no times until there is a song, so the row doesn't show a stray 0:00
    setText(bridge, 'elapsed', state ? center(clock(scrub.active ? scrub.position : positionMs(now)), ELAPSED_W / 10.5) : ' ');
    setText(bridge, 'total', duration ? clock(duration) : ' ');
    drawIcon();
}

// the button at the start of the scrubber row shows what a tap does: pause while playing, play while paused
const iconCanvas = document.createElement('canvas');
iconCanvas.width = ICON_SIZE;
iconCanvas.height = ICON_SIZE;
const iconCtx = iconCanvas.getContext('2d')!;
let lastIconKey = '';
let lastIconAt = 0;

function drawIcon(): void {
    if (waitingForCover(performance.now())) return;
    const key = state ? (state.isPlaying ? 'pause' : 'play') : 'none';
    // sent again every 5 seconds even when unchanged, in case the glasses dropped an update
    const now = performance.now();
    if (key === lastIconKey && now - lastIconAt < 5000) return;
    if (key !== lastIconKey) console.info('play/pause button now shows', key);
    lastIconKey = key;
    lastIconAt = now;
    const n = ICON_SIZE;
    iconCtx.fillStyle = '#000';
    iconCtx.fillRect(0, 0, n, n);
    iconCtx.fillStyle = '#fff';
    if (key === 'pause') {
        iconCtx.fillRect(n * 0.2, n * 0.12, n * 0.2, n * 0.76);
        iconCtx.fillRect(n * 0.6, n * 0.12, n * 0.2, n * 0.76);
    } else if (key === 'play') {
        iconCtx.beginPath();
        iconCtx.moveTo(n * 0.24, n * 0.1);
        iconCtx.lineTo(n * 0.24, n * 0.9);
        iconCtx.lineTo(n * 0.86, n * 0.5);
        iconCtx.closePath();
        iconCtx.fill();
    }
    pngFromCanvas(iconCanvas)
        .then((png) => {
            if (mode === 'full' && !switching) sender.send('icon', png);
        })
        .catch((e) => console.warn(e));
}

// the corner's progress bar: a vertical line that fills from the bottom up
const barCanvas = document.createElement('canvas');
barCanvas.width = BAR_W;
barCanvas.height = BAR_H;
const barCtx = barCanvas.getContext('2d')!;

function drawBar(): void {
    if (!foreground || mode !== 'corner' || switching || !config.cornerBar) return;
    const duration = state?.durationMs ?? 0;
    const track = BAR_H - 8; // leave a little room at both ends
    const filled = duration ? Math.round((positionMs(performance.now()) / duration) * track) : 0;
    const key = `bar:${filled}:${duration > 0}`;
    if (key === lastMarkerKey) return; // only redraw when the fill moves a pixel
    lastMarkerKey = key;
    barCtx.fillStyle = '#000';
    barCtx.fillRect(0, 0, BAR_W, BAR_H);
    const x = (BAR_W - 4) / 2;
    const top = 4;
    barCtx.fillStyle = '#555';
    barCtx.fillRect(x + 1, top, 2, track); // the empty track
    if (duration) {
        barCtx.fillStyle = '#fff';
        barCtx.fillRect(x, top + track - filled, 4, filled); // grows upward
        barCtx.fillRect(x - 3, top + track - filled - 1, 10, 2); // a small cap at the position
    }
    pngFromCanvas(barCanvas)
        .then((png) => {
            if (mode === 'corner' && !switching) sender.send('scope', png);
        })
        .catch((e) => console.warn(e));
}

// the full display's progress line: a thin track that fills as the song plays, with a dot at the position.
// while scrubbing, a tall tick shows where a tap would jump to
function drawScope(): void {
    if (mode === 'corner') return drawBar();
    const now = performance.now();
    if (!foreground || mode !== 'full' || switching || waitingForCover(now) || holdingForCover(now)) return;

    const duration = state?.durationMs ?? 0;
    const progress = duration ? positionMs(now) / duration : 0;
    const preview = scrub.active && duration ? scrub.position / duration : null;

    // only redraw when the dot or the tick moves a pixel
    const pad = 5; // room for the dot at either end
    const track = SCOPE_W - 2 * pad;
    const x = Math.round(pad + progress * track);
    const tick = preview === null ? -1 : Math.round(pad + preview * track);
    const key = `${x}:${tick}:${duration > 0}:${!!state}`;
    if (key === lastMarkerKey) return;
    lastMarkerKey = key;

    const mid = SCOPE_H / 2;
    scopeCtx.fillStyle = '#000';
    scopeCtx.fillRect(0, 0, SCOPE_W, SCOPE_H);
    // nothing is drawn until there is a song
    if (state) {
        scopeCtx.fillStyle = '#666';
        scopeCtx.fillRect(pad, mid - 1, track, 2);
    }
    if (duration) {
        scopeCtx.fillStyle = '#fff';
        scopeCtx.fillRect(pad, mid - 1, x - pad, 2);
        scopeCtx.beginPath();
        scopeCtx.arc(x, mid, 5, 0, Math.PI * 2);
        scopeCtx.fill();
        if (tick >= 0) scopeCtx.fillRect(tick - 1, 2, 2, SCOPE_H - 4);
    }
    pngFromCanvas(scopeCanvas)
        .then((png) => {
            if (mode === 'full' && !switching) void sender.send('scope', png);
        })
        .catch((e) => console.warn(e));
}

function restartScopeTimer(): void {
    window.clearInterval(scopeTimer);
    scopeTimer = window.setInterval(drawScope, config.scopeFps > 0 ? 1000 / config.scopeFps : 500);
}

// ---- idle: shrink into a corner, and wake on any gesture ---------------------------------------

async function setMode(next: Mode, force = false): Promise<void> {
    if (switching || (mode === next && !force)) return;
    switching = true;
    let changed = false;
    const reentering = mode === next;
    try {
        const widths = next === 'corner' ? cornerWidths() : undefined;
        // a rebuild that never answers must not leave switching stuck, which would freeze the whole display
        if (await withTimeout(rebuildLayout(bridge, next, config.corner, widths, next === 'corner' && config.cornerBar), 5000, false)) {
            mode = next;
            layoutWidths = widths;
            changed = true;
            // the old page's text and any queued frames no longer match what is on the glasses
            resetTextCache();
            sender.clear();
            lastMarkerKey = '';
            lastIconKey = '';
            coverSent = coverPending = '';
            cornerKey = ''; // start the marquee from the beginning
            if (next === 'corner' && !stealth && !reentering) cornerEnteredAt = performance.now();
            if (next === 'full') {
                restartDissolve(); // show the plain cover again before dithering
                coverUp = false;
            }
        } else {
            console.warn('rebuildPageContainer was refused');
            flash('The glasses refused a page change.');
        }
    } catch (e) {
        console.warn('page switch failed', e);
    } finally {
        switching = false;
    }
    if (changed) {
        syncCover(true); // pixels may not survive a rebuild, so always send the cover again
        refreshText();
    }
}

// brings the corner back for a moment while hidden
function reveal(): void {
    revealUntil = performance.now() + config.revealSeconds * 1000;
    if (mode === 'hidden') void setMode('corner');
}

// back to the full display, and out of stealth
function wakeFull(): void {
    stealth = false;
    hintUntil = performance.now() + HINT_MS;
    lastActivity = performance.now();
    void setMode('full');
}

// checked every second, so a reveal that was missed while a page switch was running gets picked up too
window.setInterval(() => {
    if (switching || !foreground) return;
    const next = wantedMode(
        { mode, stealth, now: performance.now(), lastActivity, cornerSince: cornerEnteredAt, revealUntil, scrubbing: scrub.active },
        config,
    );
    if (!next) return;
    if (mode === 'corner' && next === 'hidden') stealth = true;
    void setMode(next);
}, 1000);

// ---- controls -----------------------------------------------------------------------------------

async function command(run: (s: Spotify) => Promise<void>, refreshInMs = 500): Promise<void> {
    if (!spotify) return;
    try {
        await run(spotify);
    } catch (e) {
        console.warn(e);
        flash(describe(e));
    }
    schedule(refreshInMs);
}

const TOGGLE_GAP_MS = 400; // a second tap sooner than this is taken as the same tap reported twice
const PLAY_HOLD_MS = 2500;

function togglePlayback(): void {
    const now = performance.now();
    if (now - lastToggleAt < TOGGLE_GAP_MS) return;
    lastToggleAt = now;
    if (!state) return void command((s) => s.play());
    const play = !state.isPlaying;
    // show the change right away and keep it that way until spotify reports the same
    playHold = { playing: play, until: now + PLAY_HOLD_MS };
    state = { ...state, progressMs: positionMs(now), fetchedAt: now, isPlaying: play };
    void command((s) => (play ? s.play() : s.pause()), 900);
}

function beginScrub(): void {
    if (!state) return;
    scrub.begin(positionMs(performance.now()), state.durationMs);
    armScrubTimeout();
}

function armScrubTimeout(): void {
    window.clearTimeout(scrubTimer);
    scrubTimer = window.setTimeout(cancelScrub, SCRUB_IDLE_MS);
}

function cancelScrub(): void {
    window.clearTimeout(scrubTimer);
    scrub.end();
    refreshText();
}

function commitScrub(): void {
    window.clearTimeout(scrubTimer);
    const target = scrub.end();
    if (state) state = { ...state, progressMs: target, fetchedAt: performance.now() };
    void command((s) => s.seek(target), 600);
    refreshText();
}

// the sdk drops the event type when it is zero (a tap), so a present envelope with no type means click.
// checking per envelope matters: a missing envelope must not read as a tap
function typeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
    if (!envelope) return null;
    return envelope.eventType ?? OsEventTypeList.CLICK_EVENT;
}

function swipe(type: OsEventTypeList): 1 | -1 | null {
    if (type !== OsEventTypeList.SCROLL_TOP_EVENT && type !== OsEventTypeList.SCROLL_BOTTOM_EVENT) return null;
    const forward = config.invertSwipe ? OsEventTypeList.SCROLL_TOP_EVENT : OsEventTypeList.SCROLL_BOTTOM_EVENT;
    return type === forward ? 1 : -1;
}

// things the user does, as opposed to lifecycle and sensor events
function isGesture(type: OsEventTypeList): boolean {
    return (
        type === OsEventTypeList.CLICK_EVENT ||
        type === OsEventTypeList.SCROLL_TOP_EVENT ||
        type === OsEventTypeList.SCROLL_BOTTOM_EVENT ||
        type === OsEventTypeList.LONG_PRESS_EVENT ||
        type === OsEventTypeList.LONG_PRESS_RELEASE_EVENT
    );
}

bridge.onEvenHubEvent((event) => {
    // taps, long presses and lifecycle arrive on sysEvent, swipes on textEvent
    const type = typeOf(event.sysEvent) ?? typeOf(event.textEvent);
    if (type === null) return;
    const now = performance.now();

    // double tap always exits, so there is never a trap. the root page needs the confirmation dialog (mode 1)
    if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        void bridge.shutDownPageContainer(1);
        return;
    }
    if (type === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
        console.info('app went to the background');
        foreground = false;
    }
    if (type === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
        console.info('app is back in front');
        foreground = true;
        schedule(200);
        return;
    }
    if (!isGesture(type) || switching) return;

    // you can only be using the glasses if the app is in front, so a missed enter event can't leave it stuck
    if (!foreground) {
        console.warn('gesture while marked as in the background, treating the app as in front again');
        foreground = true;
    }
    lastActivity = now;
    // once hidden, the corner pops up for a moment as feedback
    if ((stealth || mode === 'corner') && type === OsEventTypeList.LONG_PRESS_EVENT) {
        ignoreClickUntil = now + 800;
        wakeFull();
        return;
    }
    // in the corner (visible or not) gestures work as usual. a long press is the way back to the full display, and
    // anything you do holds off the hide timer
    if (mode === 'corner' && !stealth) cornerEnteredAt = now;

    // a long press may also report a tap when released
    if (type === OsEventTypeList.LONG_PRESS_EVENT) {
        ignoreClickUntil = now + 800;
        if (scrub.active) cancelScrub();
        else beginScrub();
        refreshText();
        return;
    }
    if (type === OsEventTypeList.LONG_PRESS_RELEASE_EVENT) {
        ignoreClickUntil = now + 500;
        return;
    }

    if (type === OsEventTypeList.CLICK_EVENT) {
        if (now < ignoreClickUntil) return;
        // while the screen is hidden the first tap only brings the corner back. the next one toggles playback
        if (mode === 'hidden') return reveal();
        if (scrub.active) commitScrub();
        else togglePlayback();
        if (stealth) reveal();
        refreshText();
        return;
    }

    const direction = swipe(type);
    if (direction === null || now - lastScrollAt < SCROLL_GAP_MS) return;
    lastScrollAt = now;
    if (stealth) reveal();
    if (scrub.active) {
        scrub.nudge(direction, now);
        armScrubTimeout();
        flash(`${direction === 1 ? '+' : '-'}${scrub.stepMs / 1000}s`, 1200, false);
    } else if (direction === 1) {
        flash('next >>', 1500, false);
        void command((s) => s.next());
    } else {
        flash('<< previous', 1500, false);
        void command((s) => s.previous());
    }
    refreshText();
});

// ---- phone side settings ------------------------------------------------------------------------

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const clientIdInput = $<HTMLInputElement>('client-id');
const tokenInput = $<HTMLInputElement>('refresh-token');
const invertInput = $<HTMLInputElement>('invert');
const fpsInput = $<HTMLSelectElement>('fps');
const idleInput = $<HTMLSelectElement>('idle');
const cornerInput = $<HTMLSelectElement>('corner');
const barInput = $<HTMLInputElement>('cornerbar');
const lowerInput = $<HTMLInputElement>('lowercase');
const ditherInput = $<HTMLInputElement>('dither');
const hideInput = $<HTMLSelectElement>('hide');
const revealInput = $<HTMLSelectElement>('reveal');
const statusLine = $<HTMLElement>('status');
const setupDetails = $<HTMLDetailsElement>('setup');
const redirectInput = $<HTMLInputElement>('redirect');
const signinLink = $<HTMLAnchorElement>('signin-link');
const signinStatus = $<HTMLElement>('signin-status');
$('redirect-uri').textContent = REDIRECT_URI;

clientIdInput.value = config.clientId;
tokenInput.value = config.refreshToken ? '(saved)' : '';
invertInput.checked = config.invertSwipe;
fpsInput.value = String(config.scopeFps);
idleInput.value = String(config.idleSeconds);
cornerInput.value = config.corner;
barInput.checked = config.cornerBar;
lowerInput.checked = config.lowercase;
ditherInput.checked = config.dither;
hideInput.value = String(config.hideSeconds);
revealInput.value = String(config.revealSeconds);
// the steps stay out of the way once Spotify is connected, and can be opened again from the page
setupDetails.open = !(config.clientId && config.refreshToken);

$('save').addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    config = {
        ...config,
        clientId: clientIdInput.value.trim(),
        refreshToken: token && token !== '(saved)' ? token : config.refreshToken,
        invertSwipe: invertInput.checked,
        scopeFps: Number(fpsInput.value),
        idleSeconds: Number(idleInput.value),
        corner: cornerInput.value as Corner,
        cornerBar: barInput.checked,
        lowercase: lowerInput.checked,
        dither: ditherInput.checked,
        hideSeconds: Number(hideInput.value),
        revealSeconds: Number(revealInput.value),
    };
    await saveConfig(bridge, config);
    tokenInput.value = config.refreshToken ? '(saved)' : '';
    connect();
    restartScopeTimer();
    lastMarkerKey = '';
    // covers made under the old dither setting are no longer the right ones
    for (const k of Object.keys(covers)) delete covers[k];
    miniBase = undefined;
    coverSent = coverPending = '';
    restartDissolve();
    // back to the full display, which also picks up a new corner the next time it goes idle
    wakeFull();
    schedule(0);
});

// signing in without a computer: the browser is sent to spotify, and the address it ends on is pasted back here
$('signin').addEventListener('click', () => {
    const clientId = clientIdInput.value.trim();
    if (!clientId) {
        signinStatus.textContent = 'Paste your client ID into the field below first.';
        return;
    }
    const verifier = randomString(64);
    const state = randomString(16);
    const url = authorizeUrl(clientId, verifier, state);
    // opened before anything is awaited, because browsers only allow a new tab straight after a tap
    window.open(url, '_blank');
    signinLink.href = url;
    signinLink.hidden = false;
    signinStatus.textContent = 'Approve in the page that opened, tap Copy there, then paste the code into the box above.';
    config = { ...config, clientId, signIn: { verifier, state } };
    void saveConfig(bridge, config);
});

$('finish').addEventListener('click', async () => {
    const pending = config.signIn;
    if (!pending) {
        signinStatus.textContent = 'Tap Sign in with Spotify first.';
        return;
    }
    signinStatus.textContent = 'Signing in...';
    try {
        const code = parseRedirect(redirectInput.value, pending.state);
        const refreshToken = await exchangeCode(config.clientId, pending.verifier, code);
        config = { ...config, refreshToken, signIn: null };
        await saveConfig(bridge, config);
        tokenInput.value = '(saved)';
        redirectInput.value = '';
        signinLink.hidden = true;
        signinStatus.textContent = 'Signed in.';
        flash('Signed in to Spotify.'); // the steps fold away, so this is where the phone page shows it worked
        setupDetails.open = false;
        connect();
        schedule(0);
    } catch (e) {
        signinStatus.textContent = e instanceof Error ? e.message : 'Sign-in failed.';
    }
});

window.setInterval(() => {
    statusLine.textContent = lastNotice ? `Last message: ${lastNotice}` : '';
}, 1000);

// ---- go -----------------------------------------------------------------------------------------

connect();
window.setInterval(refreshText, 500);
// starts the dissolve once the delay is up. after that each confirmed frame asks for the next
window.setInterval(() => mode === 'full' && syncCover(), 250);
restartScopeTimer();
refreshText();
void poll();
