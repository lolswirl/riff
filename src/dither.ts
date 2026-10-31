// ordered dither ported from the portfolio's static/js/dither.js: same 4x4 bayer matrix and the same
// 2nd to 98th percentile contrast stretch. pure functions with no DOM, so they can be tested in node.

export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export interface DitherOptions {
    // true: dots mark the bright areas (the portfolio's dark theme, and the right choice on glasses,
    // where a lit pixel is the only thing you can draw). false: dots mark the dark areas
    lightInk: boolean;
}

// colors is the RGBA data of a grid x grid image. returns 1 where a dot is drawn and 0 elsewhere
export function ditherGrid(colors: ArrayLike<number>, grid: number, opts: DitherOptions): Uint8Array {
    const count = grid * grid;
    const light = new Float32Array(count);
    for (let p = 0; p < count; p++) {
        const i = p * 4;
        light[p] = (0.299 * colors[i] + 0.587 * colors[i + 1] + 0.114 * colors[i + 2]) / 255;
    }

    // stretch contrast between percentiles, so small bright text can't flatten the rest
    const sorted = light.slice().sort();
    const min = sorted[Math.floor(count * 0.02)];
    const max = sorted[Math.floor(count * 0.98)];

    const ink = new Uint8Array(count);
    for (let y = 0; y < grid; y++) {
        for (let x = 0; x < grid; x++) {
            const q = y * grid + x;
            let level = (light[q] - min) / (max - min || 1);
            if (opts.lightInk) level = 1 - level;
            if (level < (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16) ink[q] = 1;
        }
    }
    return ink;
}

// blows each dot up into a scale x scale block of greyscale pixels (lit or off)
export function scaleInk(ink: Uint8Array, grid: number, scale: number, lit = 255, off = 0): Uint8Array {
    const size = grid * scale;
    const out = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
        const row = Math.floor(y / scale) * grid;
        for (let x = 0; x < size; x++) {
            out[y * size + x] = ink[row + Math.floor(x / scale)] ? lit : off;
        }
    }
    return out;
}

// one frame of the dissolve between the plain picture and its dots, as in the portfolio: dots whose bayer slot is
// below the step show the plain picture, the rest show the dot. step 0 is all dots, 16 is all plain.
// plain is size x size greyscale, ink is grid x grid, and size is grid * scale
export function dissolveFrame(plain: Uint8Array, ink: Uint8Array, grid: number, scale: number, step: number): Uint8Array {
    const size = grid * scale;
    const out = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
        const gy = Math.floor(y / scale);
        for (let x = 0; x < size; x++) {
            const gx = Math.floor(x / scale);
            const i = y * size + x;
            out[i] = BAYER[(gy % 4) * 4 + (gx % 4)] < step ? plain[i] : ink[gy * grid + gx] ? 255 : 0;
        }
    }
    return out;
}
