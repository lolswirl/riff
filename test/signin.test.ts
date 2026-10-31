import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { authorizeUrl, base64url, challengeFor, parseRedirect, REDIRECT_URI, sha256 } from '../src/signin.ts';

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

test('sha256 matches the standard test vector and node for lengths around a block', () => {
    assert.equal(hex(sha256(new TextEncoder().encode('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    for (const length of [0, 1, 55, 56, 63, 64, 65, 119, 120, 200]) {
        const data = randomBytes(length);
        assert.equal(hex(sha256(data)), createHash('sha256').update(data).digest('hex'), `${length} bytes`);
    }
});

test('the code challenge matches the example in the pkce spec', () => {
    assert.equal(challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('base64url has no padding or characters that need escaping in an address', () => {
    assert.equal(base64url(Uint8Array.of(251, 255, 254)), '-__-');
    assert.equal(base64url(Uint8Array.of(1)), 'AQ');
});

test('the authorize address carries the client, the redirect, the scopes and the challenge', () => {
    const url = new URL(authorizeUrl('client123', 'verifier', 'state456'));
    assert.equal(url.origin + url.pathname, 'https://accounts.spotify.com/authorize');
    assert.equal(url.searchParams.get('client_id'), 'client123');
    assert.equal(url.searchParams.get('redirect_uri'), REDIRECT_URI);
    assert.equal(url.searchParams.get('state'), 'state456');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('code_challenge'), challengeFor('verifier'));
    assert.match(url.searchParams.get('scope') ?? '', /user-modify-playback-state/);
});

test('the code is found in a whole address, a bare query, or on its own', () => {
    assert.equal(parseRedirect(`${REDIRECT_URI}?code=abc123&state=s1`, 's1'), 'abc123');
    assert.equal(parseRedirect('  127.0.0.1:8899/callback?state=s1&code=abc123  ', 's1'), 'abc123');
    assert.equal(parseRedirect('code=abc123&state=s1', 's1'), 'abc123');
    const bare = 'A'.repeat(60);
    assert.equal(parseRedirect(bare, 's1'), bare);
});

test('a refusal, a missing code and a different sign-in each get their own message', () => {
    assert.throws(() => parseRedirect(`${REDIRECT_URI}?error=access_denied&state=s1`, 's1'), /access_denied/);
    assert.throws(() => parseRedirect(`${REDIRECT_URI}?state=s1`, 's1'), /doesn't have a sign-in code/);
    assert.throws(() => parseRedirect('hello', 's1'), /doesn't have a sign-in code/);
    assert.throws(() => parseRedirect(`${REDIRECT_URI}?code=abc&state=other`, 's1'), /different sign-in/);
});
