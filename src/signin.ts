// signing in to spotify from the phone: authorization code with PKCE, the same flow as scripts/auth.mjs. there is no
// server to catch the redirect here, so it ends on a page that shows the code to copy (docs/callback, served by github
// pages), and the code is pasted back into the app

// has to be added to the app in the spotify developer dashboard. a phone's in-app browser won't open the loopback address
// the script uses, so this is a real https page. change it, and host docs/callback there, when forking
export const REDIRECT_URI = 'https://lolswirl.github.io/riff/callback/';
const SCOPE = 'user-read-playback-state user-modify-playback-state';

// sha-256 in plain code, because crypto.subtle only exists on secure pages and the dev server is plain http
const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const ror = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export function sha256(data: Uint8Array): Uint8Array {
    const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
    padded.set(data);
    padded[data.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor((data.length * 8) / 2 ** 32));
    view.setUint32(padded.length - 4, (data.length * 8) >>> 0);

    const w = new Uint32Array(64);
    for (let offset = 0; offset < padded.length; offset += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
        for (let i = 16; i < 64; i++) {
            const s0 = ror(w[i - 15], 7) ^ ror(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = ror(w[i - 2], 17) ^ ror(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
            const t1 = hh + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i];
            const t2 = (ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
            hh = g;
            g = f;
            f = e;
            e = d + t1;
            d = c;
            c = b;
            b = a;
            a = t1 + t2;
        }
        [a, b, c, d, e, f, g, hh].forEach((v, i) => (h[i] += v));
    }
    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    h.forEach((v, i) => outView.setUint32(i * 4, v));
    return out;
}

export function base64url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomString(byteCount: number): string {
    return base64url(crypto.getRandomValues(new Uint8Array(byteCount)));
}

export const challengeFor = (verifier: string): string => base64url(sha256(new TextEncoder().encode(verifier)));

export function authorizeUrl(clientId: string, verifier: string, state: string): string {
    const query = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: SCOPE,
        state,
        code_challenge_method: 'S256',
        code_challenge: challengeFor(verifier),
    });
    return `https://accounts.spotify.com/authorize?${query}`;
}

// the code out of what was pasted: the whole address the callback page shows, or just its query, or the bare code. throws a message that is
// fit to show
export function parseRedirect(pasted: string, state: string): string {
    const text = pasted.trim();
    if (/^[\w-]{40,}$/.test(text)) return text;
    const query = new URLSearchParams(text.includes('?') ? text.slice(text.indexOf('?') + 1) : text);
    if (query.get('error')) throw new Error(`Spotify said: ${query.get('error')}. Start the sign-in again.`);
    const code = query.get('code');
    if (!code) throw new Error("That doesn't have a sign-in code in it. Copy the code from the page Spotify sent you to.");
    if (query.get('state') !== state) throw new Error('That code is from a different sign-in. Tap Sign in with Spotify and try again.');
    return code;
}

// trades the code for a refresh token. no client secret is involved, only the verifier made for this sign-in
export async function exchangeCode(clientId: string, verifier: string, code: string): Promise<string> {
    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI,
            client_id: clientId,
            code_verifier: verifier,
        }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.refresh_token) {
        const why = data.error_description || data.error || `status ${res.status}`;
        throw new Error(`Spotify refused the sign-in: ${why}. Check the client ID and the redirect address, then start again.`);
    }
    return data.refresh_token;
}
