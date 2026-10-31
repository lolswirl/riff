// page layouts on the 576 x 288 canvas, and the helpers that push text and images to them
import {
    CreateStartUpPageContainer,
    ImageContainerProperty,
    ImageRawDataUpdate,
    ImageRawDataUpdateResult,
    RebuildPageContainer,
    TextContainerProperty,
    TextContainerUpgrade,
    type EvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import type { Corner } from './config.ts';
import { COVER_SIZE, MINI_SIZE } from './cover.ts';

export const SCOPE_W = 288;
export const SCOPE_H = 24; // a thin progress line with a dot
// the play or pause button at the start of the scrubber row
export const ICON_SIZE = 32;
// the vertical progress bar between the corner text and the cover (20 px is the smallest image the glasses take)
export const BAR_W = 20;
export const BAR_H = 64;

// line2 only exists in the right hand corners, where the artist gets its own box. capture is a blank container
// that takes the gestures in the corner (see page)
export const IDS = { cover: 1, info: 2, scope: 3, elapsed: 4, total: 5, line2: 7, capture: 8, icon: 9 } as const;
export type Key = keyof typeof IDS;

// full: everything. corner: a small cover and two lines of text tucked into one corner.
// hidden: nothing visible, just a blank container that keeps receiving gestures
export type Mode = 'full' | 'corner' | 'hidden';

const text = (key: Key, x: number, y: number, width: number, height: number, content: string, isEventCapture = 0, padding = 4) =>
    new TextContainerProperty({
        xPosition: x,
        yPosition: y,
        width,
        height,
        borderWidth: 0,
        borderColor: 5,
        paddingLength: padding,
        containerID: IDS[key],
        containerName: key,
        content,
        isEventCapture,
    });

const image = (key: Key, x: number, y: number, width: number, height: number) =>
    new ImageContainerProperty({ xPosition: x, yPosition: y, width, height, containerID: IDS[key], containerName: key });

const MARGIN = 8;
const ROW_X = 74; // centres the button, times and line (about 413 wide, to the end of the total's text) across the display
export const ELAPSED_W = 48; // just wide enough for 10:05, so the time sits close to the line. main.ts centres the text in it
const ROW_Y = 246; // the time boxes are 36 tall, and the button and line are centred on them
const ROW_MID = ROW_Y + 18;
const TEXT_Y = ROW_Y + 4; // the glasses draw text from the top of its box, which leaves it a little above the line
const BAND = 64; // height of the corner strip
const GAP = 8;
const CORNER_TEXT_W = 200;
// the blank container that takes gestures. it is tall enough for one line of text (about 28), because the
// glasses draw a scrollbar beside a box whose text overflows it, even when the text is a single space
const HIDDEN_SIZE = 16;
const CATCH_H = 36; // the same height that cleared the scrollbars on the time boxes
const LINE_H = 30; // one line of the glasses font is about 28 px tall

// widths (in display units) of the title and artist boxes in the right hand corners. the glasses
// can't align text, so each line gets a box just wide enough for it, with the boxes' right edges
// together against the cover. that is what makes the text right-justified
export interface CornerWidths {
    title: number;
    artist: number;
}

// full layout:
//   y   4 .. 148   cover (144 x 144), centred
//   y 150 .. 242   title, artist, and album and year (or a hint), as centred text
//   y 246 .. 282   play/pause button | elapsed | scrubber line (288 x 24) | total
// corner layout: the cover (56 x 56) and the text sit in a 64 px strip against the chosen corner
export function page(
    mode: Mode,
    corner: Corner,
    widths?: CornerWidths,
    bar = false,
): { total: number; textObject: TextContainerProperty[]; imageObject: ImageContainerProperty[] } {
    if (mode === 'hidden') {
        // a page needs one container that captures gestures, so a blank one stays in the chosen corner
        const x = corner.endsWith('right') ? 576 - MARGIN - HIDDEN_SIZE : MARGIN;
        const y = corner.startsWith('bottom') ? 288 - MARGIN - CATCH_H : MARGIN;
        return { total: 1, textObject: [text('info', x, y, HIDDEN_SIZE, CATCH_H, ' ', 1, 0)], imageObject: [] };
    }
    if (mode === 'full') {
        return {
            total: 7,
            // no padding on the one-line boxes: a line taller than the padded box overflows it, and the glasses
            // draw a scrollbar beside any box that overflows
            // a blank container takes the gestures, so long text in the info box can't scroll and swallow swipes
            textObject: [
                text('info', MARGIN, 150, 576 - 2 * MARGIN, 92, 'Riff', 0, 0),
                text('elapsed', ROW_X + 44, TEXT_Y, ELAPSED_W, 36, ' ', 0, 0),
                text('total', ROW_X + 386, TEXT_Y, 64, 36, ' ', 0, 0),
                text('capture', 576 - MARGIN - HIDDEN_SIZE, MARGIN, HIDDEN_SIZE, CATCH_H, ' ', 1, 0),
            ],
            imageObject: [
                image('cover', (576 - COVER_SIZE) / 2, 4, COVER_SIZE, COVER_SIZE),
                image('scope', ROW_X + 94, ROW_MID - SCOPE_H / 2, SCOPE_W, SCOPE_H),
                image('icon', ROW_X + 8, ROW_MID - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE),
            ],
        };
    }
    const right = corner.endsWith('right');
    const bottom = corner.startsWith('bottom');
    const bandY = bottom ? 288 - MARGIN - BAND : MARGIN;
    const coverX = right ? 576 - MARGIN - MINI_SIZE : MARGIN;
    const coverY = bandY + (BAND - MINI_SIZE) / 2;
    // the bar sits beside the cover, on the text side. the text ends (right) or starts (left) next to it
    const barX = right ? coverX - BAR_W : coverX + MINI_SIZE;
    const barImage = bar ? [image('scope', barX, bandY, BAR_W, BAR_H)] : [];
    const edge = bar ? barX : right ? coverX : coverX + MINI_SIZE; // where the text meets its neighbour
    // in the corner a blank container takes the gestures. if a text box did, any text that overflowed it would
    // scroll inside the box and swallow the swipes instead of sending them to us
    const catcher = text('capture', coverX, bottom ? bandY - 4 - CATCH_H : bandY + BAND + 4, HIDDEN_SIZE, CATCH_H, ' ', 1, 0);
    if (right && widths) {
        // the boxes end at the cover. each is a little wider than its text, which leaves the gap
        const title = Math.min(CORNER_TEXT_W, widths.title);
        const artist = Math.min(CORNER_TEXT_W, widths.artist);
        return {
            total: 4 + barImage.length,
            textObject: [
                text('info', edge - title, bandY + 2, title, LINE_H, ' ', 0, 0),
                catcher,
                text('line2', edge - artist, bandY + 2 + LINE_H, artist, LINE_H, ' ', 0, 0),
            ],
            imageObject: [image('cover', coverX, coverY, MINI_SIZE, MINI_SIZE), ...barImage],
        };
    }
    const textX = right ? edge - GAP - CORNER_TEXT_W : edge + (bar ? BAR_W : 0) + GAP;
    return {
        total: 3 + barImage.length,
        textObject: [text('info', textX, bandY, CORNER_TEXT_W, BAND, ' ', 0), catcher],
        imageObject: [image('cover', coverX, coverY, MINI_SIZE, MINI_SIZE), ...barImage],
    };
}

export function createLayout(bridge: EvenAppBridge, mode: Mode = 'full', corner: Corner = 'top-right'): Promise<number> {
    const p = page(mode, corner);
    return bridge.createStartUpPageContainer(
        new CreateStartUpPageContainer({
            containerTotalNum: p.total,
            textObject: p.textObject,
            ...(p.imageObject.length ? { imageObject: p.imageObject } : {}),
        }),
    );
}

// true when the glasses accepted the new page. images and text have to be sent again afterwards
export function rebuildLayout(bridge: EvenAppBridge, mode: Mode, corner: Corner, widths?: CornerWidths, bar = false): Promise<boolean> {
    const p = page(mode, corner, widths, bar);
    return bridge.rebuildPageContainer(
        new RebuildPageContainer({
            containerTotalNum: p.total,
            textObject: p.textObject,
            ...(p.imageObject.length ? { imageObject: p.imageObject } : {}),
        }),
    );
}

// resolves with the fallback if a call to the glasses never comes back
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            console.warn(`no answer from the glasses after ${ms} ms`);
            resolve(fallback);
        }, ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            () => {
                clearTimeout(timer);
                resolve(fallback);
            },
        );
    });
}

const lastText = new Map<Key, string>();

// the page was rebuilt, so nothing we sent before can be assumed to be on screen
export function resetTextCache(): void {
    lastText.clear();
}

// only sends when the text changed
export function setText(bridge: EvenAppBridge, key: Key, content: string): void {
    if (lastText.get(key) === content) return;
    lastText.set(key, content);
    bridge
        .textContainerUpgrade(new TextContainerUpgrade({ containerID: IDS[key], containerName: key, content }))
        .catch((e) => console.warn('text update failed', key, e));
}

// image sends can't overlap, and each costs about 100 ms, so only the newest frame per container waits
export class ImageSender {
    private bridge: EvenAppBridge;
    private pending = new Map<Key, { png: number[]; done: () => void }>();
    private busy = false;

    constructor(bridge: EvenAppBridge) {
        this.bridge = bridge;
    }

    // resolves when the frame has gone out, or was dropped for a newer one or by clear()
    send(key: 'cover' | 'scope' | 'icon', png: number[]): Promise<void> {
        return new Promise((done) => {
            this.pending.get(key)?.done();
            this.pending.set(key, { png, done });
            void this.pump();
        });
    }

    // drops frames that are still waiting, for containers a page change removed
    clear(): void {
        for (const { done } of this.pending.values()) done();
        this.pending.clear();
    }

    private async pump(): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        try {
            while (this.pending.size) {
                const [key, { png: imageData, done }] = this.pending.entries().next().value as [Key, { png: number[]; done: () => void }];
                this.pending.delete(key);
                try {
                    // a send that never answers must not block every later image
                    const result = await withTimeout(
                        this.bridge.updateImageRawData(new ImageRawDataUpdate({ containerID: IDS[key], containerName: key, imageData })),
                        3000,
                        null,
                    );
                    if (result !== null && !ImageRawDataUpdateResult.isSuccess(result)) console.warn('image update rejected', key, result);
                } catch (e) {
                    console.warn('image update failed', key, e);
                }
                done();
            }
        } finally {
            this.busy = false;
        }
    }
}
