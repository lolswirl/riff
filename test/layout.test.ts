import assert from 'node:assert/strict';
import { test } from 'node:test';
import { page } from '../src/glasses.ts';

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

const boxes = (p: ReturnType<typeof page>) =>
    [...p.textObject, ...p.imageObject].map((c) => ({
        name: c.containerName as string,
        x: c.xPosition as number,
        y: c.yPosition as number,
        w: c.width as number,
        h: c.height as number,
    }));

const overlaps = (a: ReturnType<typeof boxes>[number], b: ReturnType<typeof boxes>[number]) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

for (const [mode, corner] of [
    ['full', 'top-right'],
    ...CORNERS.map((c) => ['corner', c] as const),
    ...CORNERS.map((c) => ['hidden', c] as const),
] as const) {
    test(`${mode} layout${mode !== 'full' ? ` (${corner})` : ''} fits the display with no overlaps`, () => {
        const p = page(mode, corner, undefined, mode === 'corner');
        const all = boxes(p);
        assert.equal(p.total, all.length);
        for (const b of all) {
            assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 576 && b.y + b.h <= 288, `${b.name} is off screen`);
        }
        for (let i = 0; i < all.length; i++) {
            for (let j = i + 1; j < all.length; j++) assert.ok(!overlaps(all[i], all[j]), `${all[i].name} overlaps ${all[j].name}`);
        }
    });

    test(`${mode} layout${mode !== 'full' ? ` (${corner})` : ''} has one gesture container and legal image sizes`, () => {
        const p = page(mode, corner, undefined, mode === 'corner');
        assert.equal(p.textObject.filter((t) => t.isEventCapture === 1).length, 1);
        assert.ok(p.imageObject.length <= 4 && p.textObject.length <= 8);
        for (const i of p.imageObject) {
            assert.ok((i.width as number) >= 20 && (i.width as number) <= 288, 'image width out of range');
            assert.ok((i.height as number) >= 20 && (i.height as number) <= 144, 'image height out of range');
        }
    });
}

test('hidden is one blank gesture container and no images', () => {
    const p = page('hidden', 'top-right');
    assert.equal(p.total, 1);
    assert.equal(p.imageObject.length, 0);
    assert.equal(p.textObject[0].content, ' ');
});

for (const corner of ['top-right', 'bottom-right'] as const) {
    for (const widths of [
        { title: 40, artist: 24 },
        { title: 200, artist: 96 },
    ]) {
        test(`right corner with per-line boxes (${corner}, ${widths.title}/${widths.artist}) ends both lines at the progress bar`, () => {
            const p = page('corner', corner, widths, true);
            const all = boxes(p);
            const cover = all.find((b) => b.name === 'cover')!;
            const info = all.find((b) => b.name === 'info')!;
            const line2 = all.find((b) => b.name === 'line2')!;
            const bar = all.find((b) => b.name === 'scope')!;
            assert.equal(p.total, 5);
            assert.equal(bar.x + bar.w, cover.x);
            assert.equal(info.x + info.w, bar.x);
            assert.equal(line2.x + line2.w, bar.x);
            assert.equal(info.w, widths.title);
            assert.equal(line2.w, widths.artist);
            assert.equal(p.textObject.filter((t) => t.isEventCapture === 1).length, 1);
            for (const b of all) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 576 && b.y + b.h <= 288, `${b.name} is off screen`);
            for (let i = 0; i < all.length; i++) {
                for (let j = i + 1; j < all.length; j++) assert.ok(!overlaps(all[i], all[j]), `${all[i].name} overlaps ${all[j].name}`);
            }
        });
    }
}

test('left corners ignore the widths and keep one text box plus the gesture catcher', () => {
    const p = page('corner', 'top-left', { title: 40, artist: 40 });
    assert.equal(p.total, 3);
    assert.equal(page('corner', 'top-left', undefined, true).total, 4);
});

test('the corner strip really sits against the chosen corner', () => {
    const tr = boxes(page('corner', 'top-right'));
    const bl = boxes(page('corner', 'bottom-left'));
    const cover = (b: typeof tr) => b.find((c) => c.name === 'cover')!;
    assert.ok(cover(tr).x > 288 && cover(tr).y < 144);
    assert.ok(cover(bl).x < 288 && cover(bl).y > 144);
});

test('in the corner the gesture container is a blank one, never a text box that can scroll', () => {
    for (const corner of CORNERS) {
        const p = page('corner', corner, { title: 80, artist: 80 }, true);
        const capture = p.textObject.filter((t) => t.isEventCapture === 1);
        assert.equal(capture.length, 1);
        assert.equal(capture[0].containerName, 'capture');
        assert.equal(capture[0].content, ' ');
    }
});

test('the full display also uses a blank container for gestures', () => {
    const p = page('full', 'top-right');
    const capture = p.textObject.filter((t) => t.isEventCapture === 1);
    assert.equal(capture.length, 1);
    assert.equal(capture[0].containerName, 'capture');
    assert.equal(capture[0].content, ' ');
});
