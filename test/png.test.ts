import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { test } from 'node:test';
import { pngFromGray } from '../src/png.ts';

// reads back what pngFromGray wrote: checks the chunk layout, and undoes the sub filter
function decode(png: number[]) {
    const bytes = Uint8Array.from(png);
    const view = new DataView(bytes.buffer);
    assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    assert.equal(bytes[24], 8);
    assert.equal(bytes[25], 0);
    const length = view.getUint32(33);
    assert.equal(String.fromCharCode(...bytes.slice(37, 41)), 'IDAT');
    const raw = inflateSync(bytes.slice(41, 41 + length));
    assert.equal(raw.length, height * (width + 1));
    const gray = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        assert.equal(raw[y * (width + 1)], 1);
        let left = 0;
        for (let x = 0; x < width; x++) gray[y * width + x] = left = (left + raw[y * (width + 1) + 1 + x]) & 0xff;
    }
    return { width, height, gray };
}

test('a greyscale png reads back at the nearest of 16 levels', () => {
    const width = 20;
    const height = 6;
    const input = new Uint8Array(width * height).map((_, i) => (i * 37) % 256);
    return pngFromGray(input, width, height).then((png) => {
        const out = decode(png);
        assert.equal(out.width, width);
        assert.equal(out.height, height);
        assert.deepEqual(out.gray, input.map((v) => Math.round(v / 17) * 17));
    });
});

test('a smooth picture comes out much smaller than its raw size', async () => {
    const size = 144;
    const input = new Uint8Array(size * size).map((_, i) => ((i % size) + Math.floor(i / size)) % 256);
    const png = await pngFromGray(input, size, size);
    assert.ok(png.length < (size * size) / 4, `${png.length} bytes`);
});
