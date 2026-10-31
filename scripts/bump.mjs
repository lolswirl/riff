// raises the patch version in app.json, which is what the Even Hub portal reads, and keeps package.json and the
// lockfile on the same number. it starts from the higher of app.json and package.json, so a version raised by hand in
// either one is kept. run by `npm run pack`, after the build has passed
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');
const write = (name, text) => writeFileSync(new URL(name, root), text);

const VERSION = /("version": ")(\d+)\.(\d+)\.(\d+)(")/;

const current = ['app.json', 'package.json'].map((name) => VERSION.exec(read(name)).slice(2, 5).map(Number));
const [major, minor, patch] = current.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]).at(-1);
const next = `${major}.${minor}.${patch + 1}`;

// replaces the first `count` version fields near the top of a file, which are the project's own. the lockfile
// repeats it and then goes on to list every dependency's version
function setVersion(name, count) {
    let text = read(name);
    let done = 0;
    text = text.replace(new RegExp(VERSION.source, 'g'), (match, open, _a, _b, _c, close) => (done++ < count ? `${open}${next}${close}` : match));
    write(name, text);
}

setVersion('app.json', 1);
setVersion('package.json', 1);
setVersion('package-lock.json', 2);
console.log(`version ${major}.${minor}.${patch} -> ${next}`);
