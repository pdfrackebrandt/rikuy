// Rikuy's own git proxy (src/gitproxy.js, run by functions/git/[[path]].js on Cloudflare Pages):
// git's smart HTTP to public https hosts goes through, Authorization to that host alone; every
// other method, path, query, host form, site and redirect is refused, and a body has a ceiling.
import assert from 'assert';
import { handle, gitTarget, publicHost, MAX_BODY } from '../src/gitproxy.js';

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
const req = (path, o = {}) => new Request(SITE + path, o);

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
    assert.equal(r.headers.get('WWW-Authenticate'), 'Basic realm="x"', 'a host asking for credentials is heard (isomorphic-git onAuth)');
    assert.equal(r.headers.get('Cache-Control'), 'no-store');
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
  const r = await handle({ url: SITE + P, method: 'POST', headers: new Headers({ ...T, 'Content-Length': '2' }), arrayBuffer: async () => new ArrayBuffer(5) }, up);
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

console.log('gitproxy: ' + n + ' groups of checks passed');
