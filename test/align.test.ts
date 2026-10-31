import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boxWidth, center, MARGIN, SPARE, textWidth, UNIT } from '../src/align.ts';

test('narrow and wide characters count for less and more', () => {
    assert.ok(textWidth('iiii') < textWidth('nnnn'));
    assert.ok(textWidth('mmmm') > textWidth('nnnn'));
    assert.equal(textWidth('abcd'), 4);
});

test('the estimate matches what the simulator drew for two real words', () => {
    // measured from a simulator screenshot: Crankdat about 76 units wide, Redo about 43
    assert.ok(Math.abs(textWidth('Crankdat') * UNIT - 76) < 6);
    assert.ok(Math.abs(textWidth('Redo') * UNIT - 43) < 6);
});

test('a box is a little wider than its text', () => {
    for (const s of ['Redo', 'Crankdat', 'Hello there']) {
        const w = boxWidth(s, 200);
        assert.ok(w >= textWidth(s) * UNIT * MARGIN + SPARE - 0.001, s);
        assert.ok(w <= textWidth(s) * UNIT * MARGIN + SPARE + 1, s);
    }
});

test('a short line gets a narrower box than a long one', () => {
    assert.ok(boxWidth('Redo', 200) < boxWidth('Crankdat', 200));
});

test('boxes are capped at the maximum and never tiny', () => {
    assert.equal(boxWidth('a very very very long title indeed, much too long', 200), 200);
    assert.equal(boxWidth('', 200), 24);
});

test('a title that wrapped in the simulator now gets a box wide enough', () => {
    // "gomf (feat." measured about 96 units wide, so the whole title is at least about 96 * 19 / 11 = 165
    assert.ok(boxWidth('gomf (feat. bridge)', 200) >= 168);
});

test('a curly apostrophe is as narrow as a straight one', () => {
    assert.equal(textWidth('i’m the cake'), textWidth("i'm the cake"));
});

test('center pads a line to the middle of the box, and leaves a line that fills it alone', () => {
    const line = 'tove lo';
    const pad = center(line, 50).length - line.length;
    // the padding is as wide as half the free space
    assert.ok(Math.abs(pad * 0.47 - (50 - textWidth(line)) / 2) < 0.5);
    assert.equal(center('x'.repeat(60), 50), 'x'.repeat(60));
});
