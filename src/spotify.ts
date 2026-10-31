// spotify web api client. auth is the PKCE refresh flow: only the public client id and a refresh token
// (made once by scripts/auth.mjs) are needed, so no client secret ever reaches the phone.

const API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

export interface PlayerState {
    trackId: string | null;
    title: string;
    artist: string;
    album: string;
    year: string;
    imageUrl: string | null;
    durationMs: number;
    progressMs: number;
    isPlaying: boolean;
    // performance.now() when progressMs was true, so the position can be interpolated
    fetchedAt: number;
}

export class SpotifyError extends Error {
    status: number;
    // spotify's own explanation of a refusal, when it sends one
    reason: string;
    detail: string;
    constructor(status: number, message: string, reason = '', detail = '') {
        super(message);
        this.status = status;
        this.reason = reason;
        this.detail = detail;
    }
}

export interface Credentials {
    clientId: string;
    refreshToken: string;
}

export class Spotify {
    private creds: Credentials;
    private onRefreshToken: (token: string) => void;
    private access: { token: string; expires: number } | null = null;

    constructor(creds: Credentials, onRefreshToken: (token: string) => void) {
        this.creds = creds;
        this.onRefreshToken = onRefreshToken;
    }

    private async token(force = false): Promise<string> {
        if (!force && this.access && Date.now() < this.access.expires - 30_000) return this.access.token;
        const res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: this.creds.refreshToken,
                client_id: this.creds.clientId,
            }),
        });
        if (!res.ok) throw new SpotifyError(401, `token refresh failed: ${res.status}`);
        const data = await res.json();
        this.access = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 };
        // spotify may rotate the refresh token, and the old one stops working when it does
        if (data.refresh_token && data.refresh_token !== this.creds.refreshToken) {
            this.creds = { ...this.creds, refreshToken: data.refresh_token };
            this.onRefreshToken(data.refresh_token);
        }
        return this.access.token;
    }

    private async call(method: string, path: string, query?: Record<string, string>): Promise<Response> {
        const url = API + path + (query ? '?' + new URLSearchParams(query) : '');
        const send = async (force: boolean) =>
            fetch(url, { method, headers: { Authorization: `Bearer ${await this.token(force)}` } });
        let res = await send(false);
        if (res.status === 401) res = await send(true);
        return res;
    }

    private async command(method: string, path: string, query?: Record<string, string>): Promise<void> {
        const res = await this.call(method, path, query);
        // 204 is the usual answer, and 202 means spotify accepted it
        if (res.ok) return;
        // refusals come with a body like {"error":{"status":403,"message":"...","reason":"PREMIUM_REQUIRED"}}
        let reason = '';
        let detail = '';
        try {
            const body = await res.json();
            reason = body?.error?.reason ?? '';
            detail = body?.error?.message ?? '';
        } catch {
            // no body
        }
        throw new SpotifyError(res.status, `${method} ${path} failed: ${res.status} ${reason} ${detail}`.trim(), reason, detail);
    }

    // null when nothing is playing, or when the item is not a song
    async getState(): Promise<PlayerState | null> {
        const res = await this.call('GET', '/me/player');
        if (res.status === 204) return null;
        if (!res.ok) throw new SpotifyError(res.status, `player failed: ${res.status}`);
        const data = await res.json();
        const item = data.item;
        if (!item || data.currently_playing_type !== 'track') return null;
        // images come largest first. the second is 300px, plenty for the 144px cover
        const images: { url: string }[] = item.album?.images ?? [];
        return {
            trackId: item.id ?? item.uri ?? null,
            title: item.name,
            artist: (item.artists as { name: string }[]).map((a) => a.name).join(', '),
            album: item.album?.name ?? '',
            year: String(item.album?.release_date ?? '').slice(0, 4),
            imageUrl: (images[1] ?? images[0])?.url ?? null,
            durationMs: item.duration_ms,
            progressMs: data.progress_ms ?? 0,
            isPlaying: !!data.is_playing,
            fetchedAt: performance.now(),
        };
    }

    play(): Promise<void> {
        return this.command('PUT', '/me/player/play');
    }
    pause(): Promise<void> {
        return this.command('PUT', '/me/player/pause');
    }
    next(): Promise<void> {
        return this.command('POST', '/me/player/next');
    }
    previous(): Promise<void> {
        return this.command('POST', '/me/player/previous');
    }
    seek(positionMs: number): Promise<void> {
        return this.command('PUT', '/me/player/seek', { position_ms: String(Math.round(positionMs)) });
    }
}
