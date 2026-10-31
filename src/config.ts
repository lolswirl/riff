// settings live in the bridge's local storage, with the webview's own storage as a fallback
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface Config {
    clientId: string;
    refreshToken: string;
    // what a sign-in in progress needs to be finished once its address is pasted back. null when none is
    signIn: { verifier: string; state: string } | null;
    // flips which swipe direction means next
    invertSwipe: boolean;
    // how often per second the progress line checks whether to redraw. it only sends when the dot has moved, so
    // this just sets how quickly a move shows up. 0 checks twice a second
    scopeFps: number;
    // seconds without a gesture before the display shrinks into a corner. 0 never does
    idleSeconds: number;
    corner: Corner;
    // a thin progress bar beside the corner cover
    cornerBar: boolean;
    // shows every word on the glasses in lowercase
    lowercase: boolean;
    // turns album art into dots. off shows it as plain greyscale, in the corner and on the full display
    dither: boolean;
    // seconds in the corner before it disappears completely. 0 never hides it
    hideSeconds: number;
    // how long the corner shows again when the song changes or you use the glasses while it is hidden
    revealSeconds: number;
}

const KEY = 'riff.config';
const DEFAULTS: Config = {
    clientId: '',
    refreshToken: '',
    signIn: null,
    invertSwipe: false,
    scopeFps: 4,
    idleSeconds: 20,
    corner: 'top-right',
    cornerBar: true,
    lowercase: false,
    dither: true,
    hideSeconds: 0,
    revealSeconds: 4,
};

export async function loadConfig(bridge: EvenAppBridge): Promise<Config> {
    let raw = '';
    try {
        raw = await bridge.getLocalStorage(KEY);
    } catch {
        // fall through to the webview's storage
    }
    if (!raw) {
        try {
            raw = localStorage.getItem(KEY) ?? '';
        } catch {
            // storage can be unavailable
        }
    }
    try {
        return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
        return { ...DEFAULTS };
    }
}

export async function saveConfig(bridge: EvenAppBridge, config: Config): Promise<void> {
    const raw = JSON.stringify(config);
    try {
        localStorage.setItem(KEY, raw);
    } catch {
        // storage can be unavailable
    }
    try {
        await bridge.setLocalStorage(KEY, raw);
    } catch {
        // the webview copy above still holds it
    }
}
