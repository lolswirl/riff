// rough text widths for the glasses' font, used to size the corner text boxes. the font is proportional
// and the SDK doesn't publish metrics, so these are guesses, calibrated against the simulator's rendering
// of "Crankdat" (about 76 display units wide) and "Redo" (about 43).

// roughly half an average character wide
const NARROW = new Set("iIl1j.,;:'‘’!|[]/ r");
// parentheses and the letters f and t come out a little wider than half in the glasses' font
const MID = new Set("()ft");
// roughly one and a half
const WIDE = new Set('mwMW@');

// width of an average character, in display units (the glasses canvas is 576 wide)
export const UNIT = 10.5;

// width in average characters
export function textWidth(text: string): number {
    let w = 0;
    for (const ch of text) {
        if (NARROW.has(ch)) w += 0.5;
        else if (MID.has(ch)) w += 0.65;
        else if (WIDE.has(ch)) w += 1.5;
        else if (ch >= 'A' && ch <= 'Z') w += 1.1;
        else if (ch.charCodeAt(0) >= 0x2e80) w += 2; // CJK and other full-width characters
        else w += 1;
    }
    return w;
}

// the box width, in display units, that a line needs: its estimated width plus a little spare so a bit of
// error doesn't wrap the last word. the glasses draw text from the left of its box, so this spare is also
// the gap left between the text and the cover
export const SPARE = 8;
// a proportional margin on top of the spare, where 1 means none. a margin made long lines sit further from the cover
// than short ones, which is the one thing the right-justified corner text is there to avoid
export const MARGIN = 1;
export function boxWidth(text: string, max: number): number {
    const wanted = Math.ceil(textWidth(text) * UNIT * MARGIN + SPARE);
    return Math.max(24, Math.min(max, wanted));
}

// a space in the glasses' font, in average characters. a little under half, measured from the simulator
const SPACE = 0.47;

// pads a line on the left so it sits in the middle of a box that is `units` average characters wide. the glasses
// can't centre text, so this leans on the same width estimate as the corner boxes
export function center(text: string, units: number): string {
    return ' '.repeat(Math.max(0, Math.round((units - textWidth(text)) / (2 * SPACE)))) + text;
}
