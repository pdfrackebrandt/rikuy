// Rikuy's own git proxy: what functions/git/[[path]].js runs on Cloudflare Pages beside the hosted
// copy, at /git/<host>/<path> (isomorphic-git's corsProxy form). A browser cannot speak git to
// GitHub or GitLab itself (they send no CORS headers), so the Git panel's push, pull and clone go
// through this; it is on the page's own site, so the page's policy keeps connect-src 'self' and
// no third party sees a token.
//
// It forwards git's smart HTTP and nothing else, to https hosts on the public internet:
//   GET  /git/<host>/<repo path>/info/refs?service=git-upload-pack | git-receive-pack
//   POST /git/<host>/<repo path>/git-upload-pack | git-receive-pack, with git's own content type,
//        a Content-Length and at most MAX_BODY bytes
// and refuses every other method, path, query, host form (an IP address, a port, localhost and
// names only a private network resolves), a request another site's page sent (Origin), and a
// redirect to anything it would refuse. It passes Authorization through to that host alone and
// keeps no record of it; cookies go neither way, and its answers are never cached.
// Pure: the fetch it forwards with is given (the function passes the platform's; the tests a
// stand in), so test/gitproxy.test.mjs and test/git.py run this same code.

export const MAX_BODY = 32 * 1024 * 1024;
const SERVICES = new Set(['git-upload-pack', 'git-receive-pack']);
const TYPES = { 'git-upload-pack': 'application/x-git-upload-pack-request', 'git-receive-pack': 'application/x-git-receive-pack-request' };
// what goes up with a request, and what comes back (the length and the encoding are the
// platform's to set: a fetch hands the body back decoded)
const UP = ['authorization', 'content-type', 'accept', 'git-protocol'];
const DOWN = ['content-type', 'www-authenticate'];
// names that reach a private network, or nothing, wherever they are resolved
const PRIVATE_NAME = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|private|test|invalid|example|onion|home\.arpa)$/;

const refuse = (status, why) => new Response(why + '\n', { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

// The host a request may go to, or null: a name with a dot, no IP address in any form the URL
// parser reads as one (it turns 2130706433 or 0x7f.1 into 127.0.0.1), no port but https's own
export function publicHost(h) {
  let u;
  try { u = new URL('https://' + h + '/'); } catch (e) { return null; }
  const name = u.hostname;
  if (u.username || u.password || u.port || u.host !== h.toLowerCase()) return null;
  if (!name.includes('.') || name.endsWith('.') || name.startsWith('[') || /^[\d.]+$/.test(name) || PRIVATE_NAME.test(name)) return null;
  return name;
}

// What git asks of a remote, from the path after /git/ and the query: { url, service, post } or
// the reason it is refused
export function gitTarget(method, rest, search) {
  const segs = rest.split('/');
  // (a dot segment, written or encoded, could climb out of the host it names)
  if (segs.some((s) => { let d; try { d = decodeURIComponent(s); } catch (e) { return true; } return d === '.' || d === '..' || d.includes('/') || d.includes('\\'); })) return { why: 'no dot segments' };
  const host = publicHost(segs[0] || '');
  if (!host) return { why: 'only a public https host by name' };
  const path = segs.slice(1).join('/');
  if (!path) return { why: 'no repository' };
  const q = new URLSearchParams(search);
  if (method === 'GET') {
    if (!/\/info\/refs$/.test('/' + path) || [...q.keys()].join() !== 'service' || !SERVICES.has(q.get('service'))) return { why: 'GET only for info/refs?service=git-upload-pack or git-receive-pack' };
    return { url: 'https://' + host + '/' + path + '?service=' + q.get('service'), service: q.get('service'), post: false };
  }
  if (method === 'POST') {
    const m = /\/(git-upload-pack|git-receive-pack)$/.exec('/' + path);
    if (!m || search) return { why: 'POST only to git-upload-pack or git-receive-pack' };
    return { url: 'https://' + host + '/' + path, service: m[1], post: true };
  }
  return { why: 'GET and POST only' };
}

// request: the browser's Request to <origin>/git/<host>/<path>; fetchUp: fetch to the host
export async function handle(request, fetchUp) {
  const url = new URL(request.url);
  const at = url.pathname.indexOf('/git/');
  if (at < 0) return refuse(404, 'not a git request');
  // a page of another site may not use it (it gets no CORS answer either way)
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return refuse(403, 'not from this site');
  const t = gitTarget(request.method, url.pathname.slice(at + 5), url.search);
  if (!t.url) return refuse(t.why.startsWith('GET and POST') ? 405 : 403, t.why);
  const headers = new Headers();
  for (const k of UP) { const v = request.headers.get(k); if (v != null) headers.set(k, v); }
  headers.set('User-Agent', 'git/2 (Rikuy)');
  let body;
  if (t.post) {
    if (!(request.headers.get('Content-Type') || '').startsWith(TYPES[t.service])) return refuse(415, 'git\'s own content type only');
    const n = Number(request.headers.get('Content-Length'));
    if (!request.headers.has('Content-Length') || !Number.isInteger(n) || n < 0) return refuse(411, 'a Content-Length first');
    if (n > MAX_BODY) return refuse(413, 'at most ' + MAX_BODY + ' bytes');
    body = await request.arrayBuffer();
    if (body.byteLength !== n) return refuse(400, 'the body is not its Content-Length');
  }
  // redirects followed here, each checked as a request is (a host may move a repository)
  let target = t.url, res;
  for (let hop = 0; ; hop++) {
    res = await fetchUp(target, { method: request.method, headers, body, redirect: 'manual' });
    if (res.status < 300 || res.status > 399 || res.status === 304) break;
    const loc = res.headers.get('Location');
    let next;
    try { next = loc && new URL(loc, target); } catch (e) { next = null; }
    if (hop >= 3 || !next || next.protocol !== 'https:' || !publicHost(next.host) || next.username || next.password) return refuse(502, 'a redirect that is refused');
    // (only to the same host: a token for one host goes to no other)
    if (next.host !== new URL(target).host) return refuse(502, 'a redirect to another host');
    target = next.href;
  }
  const out = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  for (const k of DOWN) { const v = res.headers.get(k); if (v != null) out.set(k, v); }
  return new Response(res.body, { status: res.status, headers: out });
}
