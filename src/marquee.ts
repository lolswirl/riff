// scrolls text that is too long for its box. a window of `width` characters slides along the text one
// character per step, rests at the start for a couple of seconds so it can be read, and wraps around
// with a gap. text that already fits comes back unchanged.

// how often the window moves, ms
export const STEP_MS = 500;
// steps spent resting at the start of each lap
const HOLD_STEPS = 4;
const GAP = '   ';

// width is in characters, or, when a measure is given, in whatever the measure returns. a measure lets the
// window hold more narrow letters than wide ones, so it fills the box either way
export function marquee(text: string, width: number, elapsedMs: number, measure?: (s: string) => number): string {
    const size = measure ?? ((s: string) => s.length);
    if (size(text) <= width) return text;
    const loop = text + GAP;
    const step = Math.floor(Math.max(0, elapsedMs) / STEP_MS) % (loop.length + HOLD_STEPS);
    const offset = Math.max(0, step - HOLD_STEPS);
    const run = (loop + loop).slice(offset);
    let end = 1;
    while (end < run.length && size(run.slice(0, end + 1)) <= width) end++;
    return run.slice(0, end);
}
