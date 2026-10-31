// the host takes png bytes (or raw greyscale) for an image container and converts them to 4-bit itself

export function grayToCanvas(gray: Uint8Array, width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
        const v = gray[i];
        image.data[i * 4] = v;
        image.data[i * 4 + 1] = v;
        image.data[i * 4 + 2] = v;
        image.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
}

export function pngFromCanvas(canvas: HTMLCanvasElement): Promise<number[]> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
            if (!blob) return reject(new Error('png encode failed'));
            resolve(Array.from(new Uint8Array(await blob.arrayBuffer())));
        }, 'image/png');
    });
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

function chunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    let crc = 0xffffffff;
    for (let i = 4; i < 8 + data.length; i++) crc = CRC_TABLE[(crc ^ out[i]) & 0xff] ^ (crc >>> 8);
    view.setUint32(8 + data.length, (crc ^ 0xffffffff) >>> 0);
    return out;
}

// a greyscale png at 16 levels, which is all the glasses show. a canvas writes every pixel as 8-bit RGBA, which comes
// out several times bigger for the same picture, and every byte has to cross the bridge as a number in a list
export async function pngFromGray(gray: Uint8Array, width: number, height: number): Promise<number[]> {
    const raw = new Uint8Array(height * (width + 1));
    for (let y = 0; y < height; y++) {
        const row = y * (width + 1);
        raw[row] = 1; // each byte is stored as the difference from the one to its left, which packs smooth areas better
        let left = 0;
        for (let x = 0; x < width; x++) {
            const v = Math.round(gray[y * width + x] / 17) * 17;
            raw[row + 1 + x] = (v - left) & 0xff;
            left = v;
        }
    }
    const packed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, width);
    view.setUint32(4, height);
    header[8] = 8; // bit depth
    header[9] = 0; // greyscale
    const parts = [Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', header), chunk('IDAT', packed), chunk('IEND', new Uint8Array(0))];
    const out: number[] = [];
    for (const part of parts) for (const b of part) out.push(b);
    return out;
}
