import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wantedMode, type Timing, type View } from '../src/visibility.ts';

const view = (over: Partial<View>): View => ({
    mode: 'full',
    stealth: false,
    now: 100_000,
    lastActivity: 100_000,
    cornerSince: 100_000,
    revealUntil: 0,
    scrubbing: false,
    ...over,
});
const timing = (over: Partial<Timing> = {}): Timing => ({ idleSeconds: 20, hideSeconds: 10, ...over });

test('full stays full until the idle time has passed', () => {
    assert.equal(wantedMode(view({ now: 119_999 }), timing()), null);
    assert.equal(wantedMode(view({ now: 120_001 }), timing()), 'corner');
});

test('an idle time of 0 never leaves full', () => {
    assert.equal(wantedMode(view({ now: 9_999_999 }), timing({ idleSeconds: 0 })), null);
});

test('scrubbing blocks every change', () => {
    assert.equal(wantedMode(view({ now: 9_999_999, scrubbing: true }), timing()), null);
});

test('the corner stays forever when hiding is off', () => {
    assert.equal(wantedMode(view({ mode: 'corner', now: 9_999_999 }), timing({ hideSeconds: 0 })), null);
});

test('the corner hides after the hide time', () => {
    assert.equal(wantedMode(view({ mode: 'corner', now: 109_999 }), timing()), null);
    assert.equal(wantedMode(view({ mode: 'corner', now: 110_001 }), timing()), 'hidden');
});

test('hidden stays hidden by itself', () => {
    assert.equal(wantedMode(view({ mode: 'hidden', stealth: true, now: 500_000 }), timing()), null);
});

test('a reveal brings the corner back, and it hides again when the reveal runs out', () => {
    const hidden = view({ mode: 'hidden', stealth: true, now: 200_000, revealUntil: 204_000 });
    assert.equal(wantedMode(hidden, timing()), 'corner');
    const shown = view({ mode: 'corner', stealth: true, now: 203_999, revealUntil: 204_000 });
    assert.equal(wantedMode(shown, timing()), null);
    assert.equal(wantedMode({ ...shown, now: 204_000 }, timing()), 'hidden');
});

test('a revealed corner is not hidden by the ordinary hide timer', () => {
    // the strip appeared long ago, but it is a brief reveal that is still running
    const shown = view({ mode: 'corner', stealth: true, now: 300_000, cornerSince: 100_000, revealUntil: 305_000 });
    assert.equal(wantedMode(shown, timing()), null);
});
