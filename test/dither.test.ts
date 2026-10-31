import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BAYER, dissolveFrame, ditherGrid, scaleInk } from '../src/dither.ts';

// RGBA grid where every pixel has the same grey level
const flat = (grid: number, v: number) => {
    const data = new Uint8ClampedArray(grid * grid * 4);
    for (let p = 0; p < grid * grid; p++) data.set([v, v, v, 255], p * 4);
    return data;
};

// left to right ramp from black to white
const ramp = (grid: number) => {
    const data = new Uint8ClampedArray(grid * grid * 4);
    for (let y = 0; y < grid; y++) {
        for (let x = 0; x < grid; x++) data.set([0, 0, 0, 255], (y * grid + x) * 4), data.fill(Math.round((x / (grid - 1)) * 255), (y * grid + x) * 4, (y * grid + x) * 4 + 3);
    }
    return data;
};

const density = (ink: Uint8Array, grid: number, x0: number, x1: number) => {
    let on = 0;
    for (let y = 0; y < grid; y++) for (let x = x0; x < x1; x++) on += ink[y * grid + x];
    return on / (grid * (x1 - x0));
};

test('the bayer matrix is the one from the portfolio', () => {
    assert.deepEqual(BAYER, [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
});

test('a flat image has no contrast to stretch, so it draws nothing', () => {
    assert.equal(ditherGrid(flat(16, 128), 16, { lightInk: true }).reduce((a, b) => a + b, 0), 0);
});

test('light ink puts more dots where the image is bright', () => {
    const ink = ditherGrid(ramp(48), 48, { lightInk: true });
    assert.ok(density(ink, 48, 40, 48) > density(ink, 48, 0, 8) + 0.5);
});

test('dark ink is the mirror image', () => {
    const ink = ditherGrid(ramp(48), 48, { lightInk: false });
    assert.ok(density(ink, 48, 0, 8) > density(ink, 48, 40, 48) + 0.5);
});

test('the same input always gives the same dots', () => {
    assert.deepEqual(ditherGrid(ramp(48), 48, { lightInk: true }), ditherGrid(ramp(48), 48, { lightInk: true }));
});

test('scaleInk makes solid blocks', () => {
    const out = scaleInk(Uint8Array.from([1, 0, 0, 1]), 2, 3);
    assert.equal(out.length, 36);
    assert.equal(out[0], 255);
    assert.equal(out[2 * 6 + 2], 255); // still inside the first block
    assert.equal(out[3], 0); // next block over is off
    assert.equal(out[35], 255); // last block is lit
});

test('the dissolve is all dots at step 0 and all plain at step 16', () => {
    const grid = 8;
    const scale = 2;
    const ink = ditherGrid(ramp(grid), grid, { lightInk: true });
    const plain = new Uint8Array(grid * scale * grid * scale).map((_, i) => (i * 7) % 256);
    assert.deepEqual(dissolveFrame(plain, ink, grid, scale, 0), scaleInk(ink, grid, scale));
    assert.deepEqual(dissolveFrame(plain, ink, grid, scale, 16), plain);
});
