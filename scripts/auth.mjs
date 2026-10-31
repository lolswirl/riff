// one-time Spotify sign-in that prints a refresh token for the glasses app (authorization code with PKCE).
//
//   SPOTIFY_CLIENT_ID=<your client id> npm run auth
//
// before running it, add this redirect URI to your app in the Spotify developer dashboard:
//   http://127.0.0.1:8899/callback
// the token comes back through that loopback address, so no client secret is involved.

import crypto from 'node:crypto';
import http from 'node:http';

const clientId = process.env.SPOTIFY_CLIENT_ID || process.argv[2];
if (!clientId) {
    console.error('Set SPOTIFY_CLIENT_ID or pass the client id as the first argument.');
    process.exit(1);
}

const PORT = 8899;
const redirectUri = `http://127.0.0.1:${PORT}/callback`;
const scope = 'user-read-playback-state user-modify-playback-state';
const b64url = (buf) => buf.toString('base64url');
const verifier = b64url(crypto.randomBytes(64));
const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
const state = b64url(crypto.randomBytes(16));

const authorize = new URL('https://accounts.spotify.com/authorize');
authorize.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope,
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
}).toString();

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, redirectUri);
    if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
    }
    const finish = (status, message, code = 0) => {
        res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(message);
        server.close();
        setTimeout(() => process.exit(code), 100);
    };
    if (url.searchParams.get('state') !== state) return finish(400, 'State mismatch. Run the script again.', 1);
    if (url.searchParams.get('error')) return finish(400, `Spotify said: ${url.searchParams.get('error')}`, 1);

    const token = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: url.searchParams.get('code'),
            redirect_uri: redirectUri,
            client_id: clientId,
            code_verifier: verifier,
        }),
    });
    const data = await token.json();
    if (!token.ok || !data.refresh_token) return finish(500, `Token exchange failed: ${JSON.stringify(data)}`, 1);

    console.log('\nClient ID:     ', clientId);
    console.log('Refresh token: ', data.refresh_token);
    console.log('Scopes:        ', data.scope);
    console.log('\nPaste both into the Riff page on your phone.');
    finish(200, 'Done. You can close this tab and go back to the terminal.');
});

server.listen(PORT, '127.0.0.1', () => {
    console.log('Open this URL in your browser and approve access:\n');
    console.log(authorize.toString() + '\n');
});
