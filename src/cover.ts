// album art -> the portfolio's dithered cover, sized for an image container
import { ditherGrid, scaleInk } from './dither.ts';
import { grayToCanvas } from './png.ts';

// full size: 48 dots across, each a 3 x 3 block, fills the largest image container height (144)
export const COVER_GRID = 48;
export const COVER_SCALE = 3;
export const COVER_SIZE = COVER_GRID * COVER_SCALE;

// the small corner version: 28 dots of 2 x 2 pixels
export const MINI_GRID = 28;
export const MINI_SCALE = 2;
export const MINI_SIZE = MINI_GRID * MINI_SCALE;

async function fetchBitmap(url: string): Promise<ImageBitmap> {
    // fetched as a blob rather than through an <img>, so the canvas is never tainted and the
    // request goes through the same network whitelist as the api calls
    const res = await fetch(url);
    if (!res.ok) throw new Error(`cover fetch failed: ${res.status}`);
    return createImageBitmap(await res.blob());
}

// the two pictures the full cover dissolves between
export interface CoverArt {
    plain: Uint8Array; // COVER_SIZE x COVER_SIZE greyscale, with no dithering
    ink: Uint8Array; // COVER_GRID x COVER_GRID dots
}

export async function loadCoverArt(url: string): Promise<CoverArt> {
    const bitmap = await fetchBitmap(url);
    const context = (size: number) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(bitmap, 0, 0, size, size);
        return ctx.getImageData(0, 0, size, size).data;
    };
    const colors = context(COVER_SIZE);
    const small = context(COVER_GRID);
    bitmap.close();

    return { plain: toGray(colors), ink: ditherGrid(small, COVER_GRID, { lightInk: true }) };
}

// RGBA to one grey level per pixel
function toGray(colors: ArrayLike<number>): Uint8Array {
    const gray = new Uint8Array(colors.length / 4);
    for (let p = 0; p < gray.length; p++) gray[p] = 0.299 * colors[p * 4] + 0.587 * colors[p * 4 + 1] + 0.114 * colors[p * 4 + 2];
    return gray;
}

// the cover as a canvas, so the pause symbol can be drawn over the small one before it is sent. dithered into dots, or
// plain greyscale when dither is off
export async function renderCoverCanvas(url: string, grid = COVER_GRID, scale = COVER_SCALE, dither = true): Promise<HTMLCanvasElement> {
    const bitmap = await fetchBitmap(url);
    if (!dither) {
        const size = grid * scale;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(bitmap, 0, 0, size, size);
        bitmap.close();
        return grayToCanvas(toGray(ctx.getImageData(0, 0, size, size).data), size, size);
    }

    const small = document.createElement('canvas');
    small.width = small.height = grid;
    const ctx = small.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, grid, grid);
    bitmap.close();

    const ink = ditherGrid(ctx.getImageData(0, 0, grid, grid).data, grid, { lightInk: true });
    const gray = scaleInk(ink, grid, scale);
    return grayToCanvas(gray, grid * scale, grid * scale);
}
