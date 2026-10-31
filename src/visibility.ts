// decides which page the glasses should be showing, from how long it has been quiet.
//
//   full  --(idle)-->  corner  --(hide timer)-->  hidden
//
// once it has gone hidden it stays in "stealth": the corner strip only comes back for a few seconds
// when the song changes or you use the glasses, then it disappears again. waking the full display
// (a long press) leaves stealth.
import type { Mode } from './glasses.ts';

export interface View {
    mode: Mode;
    stealth: boolean;
    now: number; // ms, all times on the same clock
    lastActivity: number; // last gesture on the glasses
    cornerSince: number; // when the corner strip last appeared on its own (not as a brief reveal)
    revealUntil: number; // while stealthy, the corner strip stays up until then
    scrubbing: boolean;
}

export interface Timing {
    idleSeconds: number; // full -> corner. 0 never
    hideSeconds: number; // corner -> hidden. 0 never
}

// the mode to switch to right now, or null to stay put
export function wantedMode(v: View, t: Timing): Mode | null {
    if (v.scrubbing) return null;
    switch (v.mode) {
        case 'full':
            return t.idleSeconds > 0 && v.now - v.lastActivity > t.idleSeconds * 1000 ? 'corner' : null;
        case 'corner':
            if (v.stealth) return v.now >= v.revealUntil ? 'hidden' : null;
            return t.hideSeconds > 0 && v.now - v.cornerSince > t.hideSeconds * 1000 ? 'hidden' : null;
        case 'hidden':
            return v.stealth && v.now < v.revealUntil ? 'corner' : null;
    }
}
