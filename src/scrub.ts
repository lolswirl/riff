// scrub mode: each swipe moves the preview position, and quick repeated swipes take bigger steps.
// nothing is sent to spotify until the user commits, so the song keeps playing while they aim.

export const STEPS_MS = [5000, 10000, 30000];
// swipes closer together than this count as one run and speed up
export const REPEAT_WINDOW_MS = 450;
// leave the last second so a seek to the very end doesn't skip the song
const END_MARGIN_MS = 1000;

export class Scrubber {
    active = false;
    position = 0;
    stepMs = STEPS_MS[0];
    private duration = 0;
    private level = 0;
    private lastNudge = -Infinity;

    begin(position: number, duration: number): void {
        this.active = true;
        this.position = position;
        this.duration = duration;
        this.level = 0;
        this.stepMs = STEPS_MS[0];
        this.lastNudge = -Infinity;
    }

    // direction is 1 for forward and -1 for back. returns the new preview position
    nudge(direction: 1 | -1, now: number): number {
        this.level = now - this.lastNudge <= REPEAT_WINDOW_MS ? Math.min(this.level + 1, STEPS_MS.length - 1) : 0;
        this.lastNudge = now;
        this.stepMs = STEPS_MS[this.level];
        const limit = Math.max(0, this.duration - END_MARGIN_MS);
        this.position = Math.min(limit, Math.max(0, this.position + direction * this.stepMs));
        return this.position;
    }

    // leaves scrub mode and returns where it ended up
    end(): number {
        this.active = false;
        return this.position;
    }
}
