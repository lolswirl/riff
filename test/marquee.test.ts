import assert from 'node:assert/strict';
import { test } from 'node:test';
import { marquee, STEP_MS } from '../src/marquee.ts';

const TEXT = 'A Very Long Song Title Indeed'; // 29 characters

test('text that fits is left alone', () => {
    assert.equal(marquee('Short', 16, 0), 'Short');
    assert.equal(marquee('Exactly sixteen!', 16, 99_999), 'Exactly sixteen!');
});

test('it rests at the start for the first two seconds', () => {
    assert.equal(marquee(TEXT, 16, 0), 'A Very Long Song');
    assert.equal(marquee(TEXT, 16, 4 * STEP_MS - 1), 'A Very Long Song');
});

test('then it moves one character per step', () => {
    assert.equal(marquee(TEXT, 16, 4 * STEP_MS), 'A Very Long Song');
    assert.equal(marquee(TEXT, 16, 5 * STEP_MS), ' Very Long Song ');
    assert.equal(marquee(TEXT, 16, 6 * STEP_MS), 'Very Long Song T');
});

test('the window is always exactly as wide as asked', () => {
    for (let t = 0; t < 120 * STEP_MS; t += STEP_MS) assert.equal(marquee(TEXT, 16, t).length, 16);
});

test('it wraps around with a gap and comes back to the start', () => {
    const lap = (TEXT.length + 3 + 4) * STEP_MS; // text, gap, and the rest at the start
    assert.equal(marquee(TEXT, 16, lap), marquee(TEXT, 16, 0));
    // near the end of the lap the window shows the end of the title, the gap, then the start again
    const wrapped = marquee(TEXT, 16, (4 + TEXT.length - 8) * STEP_MS);
    assert.ok(wrapped.includes('   A'), wrapped);
});

test('negative time is treated as zero', () => {
    assert.equal(marquee(TEXT, 16, -500), marquee(TEXT, 16, 0));
});

test('with a measure the window fills the width with narrow letters too', () => {
    const measure = (s: string) => [...s].reduce((n, c) => n + (c === 'i' ? 0.5 : 1), 0);
    const long = 'iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii';
    const shown = marquee(long, 8, 0, measure);
    assert.equal(measure(shown), 8);
    assert.equal(shown.length, 16);
});
