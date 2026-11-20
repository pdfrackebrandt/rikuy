// Rikuy's own git proxy (src/gitproxy.js, run by functions/git/[[path]].js on Cloudflare Pages):
// git's smart HTTP to public https hosts goes through, Authorization to that host alone; every
// other method, path, query, host form, site and redirect is refused, and a body has a ceiling.
import assert from 'assert';
import { handle, gitTarget, publicHost, allowedHosts, MAX_BODY, HOSTS, DOWN_HEADERS } from '../src/gitproxy.js';

const SITE = 'https://rikuy.example';
let n = 0;
const ok = async (name, fn) => { await fn(); n++; };
// a fetch that records what went up and answers as a git host would
function upstream(answer) {
  const seen = [];
  const f = async (url, init) => {
    seen.push({ url, method: init.method, headers: Object.fromEntries(init.headers), body: init.body ? new Uint8Array(init.body) : null, redirect: init.redirect });
    return answer ? answer(url, init) : new Response('001e# service=git-upload-pack\n', { status: 200, headers: { 'Content-Type': 'application/x-git-upload-pack-advertisement', 'Set-Cookie': 'a=b', 'WWW-Authenticate': 'Basic realm="x"' } });
  };
  f.seen = seen;
  return f;
}
// a request as the page's git client sends it: its mark (src/git.js), and as Chromium adds, a
// script's fetch from this same site; bare() leaves either out
const req = (path, o = {}) => new Request(SITE + path, { ...o, headers: { 'X-Rikuy-Git': '1', 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty', ...(o.headers || {}) } });
const bare = (path, headers = {}, o = {}) => new Request(SITE + path, { ...o, headers });
// every answer: no page, no script, this site alone, not sniffed or kept
const inert = (r) => Object.entries(DOWN_HEADERS).every(([k, v]) => r.headers.get(k) === v);

await ok('info/refs for both services goes to the host over https, with the token and nothing of the site', async () => {
  for (const svc of ['git-upload-pack', 'git-receive-pack']) {
    const up = upstream();
    const r = await handle(req('/git/github.com/ana/paper.git/info/refs?service=' + svc, { headers: { Authorization: 'Basic eDp5', Cookie: 'session=1', Origin: SITE, 'Git-Protocol': 'version=2', Referer: SITE + '/' } }), up);
    assert.equal(r.status, 200);
    assert.equal(up.seen.length, 1);
    assert.equal(up.seen[0].url, 'https://github.com/ana/paper.git/info/refs?service=' + svc);
    assert.equal(up.seen[0].headers.authorization, 'Basic eDp5');
    assert.equal(up.seen[0].headers['git-protocol'], 'version=2');
    assert.ok(!('cookie' in up.seen[0].headers) && !('origin' in up.seen[0].headers) && !('referer' in up.seen[0].headers), JSON.stringify(up.seen[0].headers));
    assert.equal(up.seen[0].redirect, 'manual');
    assert.equal(r.headers.get('Set-Cookie'), null, 'no cookie comes back');
    assert.equal(r.headers.get('WWW-Authenticate'), null, 'no question for a password: the browser\'s login box would come up under Rikuy\'s address');
    assert.ok(inert(r), JSON.stringify(Object.fromEntries(r.headers)));
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), null, 'no other site may read it');
  }
});

await ok('a push and a fetch: POST with git\'s content type and its length, the body as it was', async () => {
  for (const svc of ['git-upload-pack', 'git-receive-pack']) {
    const up = upstream();
    const body = new Uint8Array([48, 48, 48, 48, 1, 2, 3]);
    const r = await handle(req('/git/gitlab.com/a/b/c.git/' + svc, { method: 'POST', body, headers: { 'Content-Type': 'application/x-' + svc + '-request', 'Content-Length': String(body.length) } }), up);
    assert.equal(r.status, 200);
    assert.equal(up.seen[0].url, 'https://gitlab.com/a/b/c.git/' + svc);
    assert.equal(r.headers.get('Content-Type'), 'application/octet-stream', 'the host\'s answer was not git\'s own type: bytes');
    assert.deepEqual([...up.seen[0].body], [...body]);
    assert.equal(up.seen[0].headers['content-type'], 'application/x-' + svc + '-request');
  }
});

await ok('nothing but git\'s requests: other methods, paths, queries and content types are refused before any request goes out', async () => {
  const cases = [
    ['/git/github.com/a/b.git/info/refs?service=git-upload-pack', { method: 'PUT', body: 'x' }, 405],
    ['/git/github.com/a/b.git/info/refs?service=git-upload-pack', { method: 'DELETE' }, 405],
    ['/git/github.com/a/b.git/info/refs?service=git-upload-archive', {}, 403],
    ['/git/github.com/a/b.git/info/refs?service=git-upload-pack&x=1', {}, 403],
    ['/git/github.com/a/b.git/info/refs', {}, 403],
    ['/git/github.com/a/b.git/HEAD', {}, 403],
    ['/git/github.com/login', {}, 403],
    ['/git/github.com/', {}, 403],
    ['/git/api.github.com/user', {}, 403],
    ['/git/github.com/a/b.git/git-upload-pack', {}, 403],
    ['/git/github.com/a/b.git/git-upload-pack?x=1', { method: 'POST', body: 'x', headers: { 'Content-Type': 'application/x-git-upload-pack-request' } }, 403],
    ['/git/github.com/a/b.git/info/refs', { method: 'POST', body: 'x', headers: { 'Content-Type': 'application/x-git-upload-pack-request' } }, 403],
    ['/git/github.com/a/b.git/git-upload-pack', { method: 'POST', body: 'x', headers: { 'Content-Type': 'text/plain' } }, 415],
    ['/git/github.com/a/b.git/git-receive-pack', { method: 'POST', body: 'x', headers: { 'Content-Type': 'application/x-git-upload-pack-request' } }, 415],
    ['/elsewhere/github.com/a/b.git/info/refs?service=git-upload-pack', {}, 404]
  ];
  for (const [p, o, status] of cases) {
    const up = upstream();
    const r = await handle(req(p, o), up);
    assert.equal(r.status, status, p + ' ' + (o.method || 'GET'));
    assert.equal(up.seen.length, 0, 'nothing went out for ' + p);
  }
});

await ok('only a public host by name, over https: no IP address in any form, no port, no private name', async () => {
  for (const h of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '2130706433', '0x7f.1', '0177.0.0.1', '[::1]', '[fd00::1]', 'localhost', 'a.localhost', 'printer.local', 'git.internal',
    'nas.lan', 'host.home.arpa', 'github.com:22', 'github.com:8443', 'github.com:443', 'user@github.com', 'user:pw@github.com', 'intranet', 'github.com.', 'x.onion', 'git.test', '%67ithub.com'])
    assert.equal(publicHost(h), null, h);
  for (const h of ['github.com', 'gitlab.com', 'codeberg.org', 'git.overleaf.com', 'gitea.example-host.eu']) assert.equal(publicHost(h), h, h);
  assert.equal(publicHost('GitHub.com'), 'github.com', 'a name in capitals is the same host');
  const up = upstream();
  for (const p of ['/git/127.0.0.1/a.git/info/refs?service=git-upload-pack', '/git/169.254.169.254/latest/info/refs?service=git-upload-pack', '/git/localhost/a.git/info/refs?service=git-upload-pack'])
    assert.equal((await handle(req(p), up)).status, 403, p);
  assert.equal(up.seen.length, 0);
});

await ok('no dot segment, written or encoded, to climb from the host it names to another', async () => {
  for (const rest of ['github.com/%2e%2e/evil.com/a.git/info/refs', 'github.com/a/%2E/b.git/info/refs', 'github.com/a%2fb.git/info/refs', 'github.com/a%5cb.git/info/refs', 'github.com/%zz/info/refs'])
    assert.ok(!gitTarget('GET', rest, '?service=git-upload-pack').url, rest);
  // (a URL parser takes written dot segments out before the function sees the path)
  assert.equal(new URL(SITE + '/git/github.com/../evil.com/a.git/info/refs').pathname, '/git/evil.com/a.git/info/refs');
});

await ok('another site\'s page may not use it', async () => {
  const up = upstream();
  const r = await handle(req('/git/github.com/a/b.git/info/refs?service=git-upload-pack', { headers: { Origin: 'https://evil.example' } }), up);
  assert.equal(r.status, 403);
  assert.equal(up.seen.length, 0);
});

await ok('a body has a ceiling and must say its length', async () => {
  const P = '/git/github.com/a/b.git/git-receive-pack', T = { 'Content-Type': 'application/x-git-receive-pack-request' };
  let up = upstream();
  assert.equal((await handle(req(P, { method: 'POST', body: 'x', headers: { ...T, 'Content-Length': String(MAX_BODY + 1) } }), up)).status, 413);
  assert.equal(up.seen.length, 0);
  // (a stream with no length)
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(4)); c.close(); } });
  up = upstream();
  assert.equal((await handle(req(P, { method: 'POST', body: stream, duplex: 'half', headers: T }), up)).status, 411);
  assert.equal(up.seen.length, 0);
  // (a length that is not the body's)
  up = upstream();
  const r = await handle({ url: SITE + P, method: 'POST', headers: new Headers({ ...T, 'Content-Length': '2', 'X-Rikuy-Git': '1' }), arrayBuffer: async () => new ArrayBuffer(5) }, up);
  assert.equal(r.status, 400);
  assert.equal(up.seen.length, 0);
});

await ok('a redirect is followed only to the same public host over https, three times at most', async () => {
  const hop = (to) => upstream((url) => url.includes('moved') ? new Response('ok', { status: 200 }) : new Response('', { status: 301, headers: { Location: to } }));
  let up = hop('https://github.com/ana/moved.git/info/refs?service=git-upload-pack');
  let r = await handle(req('/git/github.com/ana/paper.git/info/refs?service=git-upload-pack', { headers: { Authorization: 'Basic eDp5' } }), up);
  assert.equal(r.status, 200);
  assert.deepEqual(up.seen.map((s) => s.url), ['https://github.com/ana/paper.git/info/refs?service=git-upload-pack', 'https://github.com/ana/moved.git/info/refs?service=git-upload-pack']);
  for (const to of ['https://evil.example/a.git/info/refs?service=git-upload-pack', 'http://github.com/ana/moved.git', 'https://127.0.0.1/moved', 'https://u:p@github.com/moved', 'https://169.254.169.254/latest']) {
    up = hop(to);
    r = await handle(req('/git/github.com/ana/paper.git/info/refs?service=git-upload-pack', { headers: { Authorization: 'Basic eDp5' } }), up);
    assert.equal(r.status, 502, to);
    assert.equal(up.seen.length, 1, 'the token went nowhere else: ' + to);
  }
  up = upstream(() => new Response('', { status: 302, headers: { Location: 'https://github.com/loop' } }));
  r = await handle(req('/git/github.com/ana/paper.git/info/refs?service=git-upload-pack'), up);
  assert.equal(r.status, 502);
  assert.equal(up.seen.length, 4);
});

await ok('the host\'s own answer comes back: 401 and its question for credentials, 404, 500', async () => {
  for (const s of [401, 403, 404, 500]) {
    const r = await handle(req('/git/github.com/a/b.git/info/refs?service=git-receive-pack'), upstream(() => new Response('no', { status: s, headers: { 'WWW-Authenticate': 'Basic realm="GitHub"' } })));
    assert.equal(r.status, s);
    assert.equal(await r.text(), 'no');
  }
});

await ok('(review H1) a link to /git never shows a host\'s page as Rikuy: refused without the client\'s mark, as a navigation, from another site; any answer is bytes, sandboxed, an attachment', async () => {
  const P = '/git/github.com/attacker/x/info/refs?service=git-upload-pack';
  const html = () => new Response('<script>alert(document.domain)</script>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  for (const [name, r] of [
    ['a link clicked (a navigation, no mark)', bare(P, { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', Accept: 'text/html' })],
    ['a link from Rikuy itself', bare(P, { 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' })],
    ['a navigation even with the mark (it cannot have one, but)', req(P, { headers: { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' } })],
    ['a frame or an image', req(P, { headers: { 'Sec-Fetch-Dest': 'iframe' } })],
    ['another site\'s img (no-cors, no Origin)', bare(P, { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'no-cors', 'Sec-Fetch-Dest': 'image' })],
    ['another site\'s script with the mark (refused at its preflight in a browser)', req(P, { headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' } })],
    ['a command line client (no mark)', bare(P, { 'User-Agent': 'git/2.43' })],
    ['a browser that sends no Sec-Fetch headers, without the mark', bare(P)]]) {
    const up = upstream(html);
    const res = await handle(r, up);
    assert.equal(res.status, 403, name);
    assert.equal(up.seen.length, 0, 'nothing went out: ' + name);
    assert.ok(inert(res) && res.headers.get('Content-Type') === 'text/plain; charset=utf-8', name + ' ' + JSON.stringify(Object.fromEntries(res.headers)));
  }
  // the client's own fetch, from a host that answers HTML: bytes, inert
  const res = await handle(req(P), upstream(html));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'application/octet-stream');
  assert.ok(inert(res), JSON.stringify(Object.fromEntries(res.headers)));
  // git's own answer types pass, for the service asked
  const typed = (ct) => upstream(() => new Response('x', { headers: { 'Content-Type': ct } }));
  assert.equal((await handle(req(P), typed('application/x-git-upload-pack-advertisement; charset=x'))).headers.get('Content-Type'), 'application/x-git-upload-pack-advertisement');
  assert.equal((await handle(req(P), typed('application/x-git-receive-pack-advertisement'))).headers.get('Content-Type'), 'application/octet-stream', 'not the service asked');
  const post = (ct) => handle(req('/git/github.com/a/b.git/git-receive-pack', { method: 'POST', body: 'x', headers: { 'Content-Type': 'application/x-git-receive-pack-request', 'Content-Length': '1' } }), typed(ct));
  assert.equal((await post('application/x-git-receive-pack-result')).headers.get('Content-Type'), 'application/x-git-receive-pack-result');
  assert.equal((await post('text/html')).headers.get('Content-Type'), 'application/octet-stream');
});

await ok('(review M3) git hosts this site knows, and those the variable names, alone', async () => {
  for (const h of HOSTS) assert.ok(gitTarget('GET', h + '/a/b.git/info/refs', '?service=git-upload-pack').url, h);
  for (const h of ['evil.example.org', 'victim.org', 'github.io', 'raw.githubusercontent.com', 'gist.github.com', 'github.com.evil.org', 'api.github.com'])
    assert.equal(gitTarget('GET', h + '/a/b.git/info/refs', '?service=git-upload-pack').why, 'not a git host this site knows', h);
  const up = upstream();
  assert.equal((await handle(req('/git/victim.org/admin/delete/info/refs?service=git-upload-pack'), up)).status, 403);
  assert.equal(up.seen.length, 0);
  // the variable: names by commas or spaces, each still a public host by name
  const more = allowedHosts('git.uni-x.edu, gitlab.example-corp.com  127.0.0.1 localhost bad host:1');
  assert.ok(more.has('git.uni-x.edu') && more.has('gitlab.example-corp.com') && !more.has('127.0.0.1') && !more.has('localhost') && !more.has('host:1') && more.has('github.com'));
  const r = await handle(req('/git/git.uni-x.edu/a.git/info/refs?service=git-upload-pack'), up, { hosts: 'git.uni-x.edu' });
  assert.equal(r.status, 200);
  assert.equal(up.seen[0].url, 'https://git.uni-x.edu/a.git/info/refs?service=git-upload-pack');
});

await ok('(review M3) an answer has a ceiling in bytes and in time', async () => {
  const body = () => new ReadableStream({ start(c) { for (let i = 0; i < 5; i++) c.enqueue(new Uint8Array(1000)); c.close(); } });
  const sized = (len) => upstream(() => new Response(body(), { headers: { 'Content-Type': 'application/x-git-upload-pack-advertisement', ...(len === undefined ? {} : { 'Content-Length': len }) } }));
  const refs = () => req('/git/github.com/a/b.git/info/refs?service=git-upload-pack');
  // a length past the ceiling, or one that is not a number: refused before a byte, inert
  for (const len of ['5000', 'abc', '-1', '1e9', '99999999999999999999']) {
    const r = await handle(refs(), sized(len), { maxAnswer: 3000 });
    assert.equal(r.status, 502, len);
    assert.ok(inert(r), len);
  }
  // within it, or with no length (bounded by the time, as below): passed on whole, with no
  // script on the stream (review SECURITY-2 L6: a transform is Worker CPU per chunk)
  const ok2 = await handle(refs(), sized('5000'), { maxAnswer: 5000 });
  assert.equal(ok2.status, 200);
  assert.equal((await ok2.arrayBuffer()).byteLength, 5000);
  const ok3 = await handle(refs(), sized(undefined), { maxAnswer: 3000 });
  assert.equal((await ok3.arrayBuffer()).byteLength, 5000);
  // a host that never answers: given up after the time, said as such
  const never = async (url, init) => new Promise((res, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason)));
  const t0 = Date.now();
  // (node does not wait for AbortSignal.timeout's timer: this one keeps the test alive meanwhile)
  const alive = setTimeout(() => {}, 5000);
  const r2 = await handle(req('/git/github.com/a/b.git/info/refs?service=git-upload-pack'), never, { timeout: 200 });
  clearTimeout(alive);
  assert.equal(r2.status, 504);
  assert.ok(Date.now() - t0 < 2000 && inert(r2));
});

console.log('gitproxy: ' + n + ' groups of checks passed');
