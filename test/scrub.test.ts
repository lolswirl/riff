import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REPEAT_WINDOW_MS, Scrubber, STEPS_MS } from '../src/scrub.ts';

test('a single swipe moves by the smallest step', () => {
    const s = new Scrubber();
    s.begin(60_000, 200_000);
    assert.equal(s.nudge(1, 1000), 60_000 + STEPS_MS[0]);
});

test('quick repeats speed up and cap at the largest step', () => {
    const s = new Scrubber();
    s.begin(0, 600_000);
    let t = 1000;
    const steps: number[] = [];
    let last = 0;
    for (let i = 0; i < 5; i++) {
        const pos = s.nudge(1, t);
        steps.push(pos - last);
        last = pos;
        t += REPEAT_WINDOW_MS - 50;
    }
    assert.deepEqual(steps, [5000, 10000, 30000, 30000, 30000]);
});

test('a pause resets the step size', () => {
    const s = new Scrubber();
    s.begin(100_000, 600_000);
    s.nudge(1, 1000);
    s.nudge(1, 1100);
    const before = s.position;
    assert.equal(s.nudge(1, 1100 + REPEAT_WINDOW_MS + 1) - before, STEPS_MS[0]);
});

test('the position stays inside the song and leaves a second at the end', () => {
    const s = new Scrubber();
    s.begin(3000, 100_000);
    assert.equal(s.nudge(-1, 0), 0);
    s.begin(98_000, 100_000);
    assert.equal(s.nudge(1, 0), 99_000);
});

test('end leaves scrub mode and returns the target', () => {
    const s = new Scrubber();
    s.begin(10_000, 100_000);
    s.nudge(1, 0);
    assert.equal(s.end(), 15_000);
    assert.equal(s.active, false);
});
