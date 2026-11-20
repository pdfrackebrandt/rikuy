// Rikuy's own git proxy: what functions/git/[[path]].js runs on Cloudflare Pages beside the hosted
// copy, at /git/<host>/<path> (isomorphic-git's corsProxy form). A browser cannot speak git to
// GitHub or GitLab itself (they send no CORS headers), so the Git panel's push, pull and clone go
// through this; it is on the page's own site, so the page's policy keeps connect-src 'self' and
// no third party sees a token.
//
// It forwards git's smart HTTP and nothing else, over https to the git hosts it knows (HOSTS, and
// those Pedro lists in the Pages variable RIKUY_GIT_HOSTS):
//   GET  /git/<host>/<repo path>/info/refs?service=git-upload-pack | git-receive-pack
//   POST /git/<host>/<repo path>/git-upload-pack | git-receive-pack, with git's own content type,
//        a Content-Length and at most MAX_BODY bytes
// and only for the page's own git client: a request must carry X-Rikuy-Git (which another site's
// page cannot send without a preflight, and the preflight is refused), and one that says it is a
// navigation, is for anything but a script's fetch, or comes from another site (Sec-Fetch-*,
// Origin) is refused. It refuses every other method, path, query and host form (an IP address, a
// port, userinfo, localhost and other private names), and a redirect to anything it would refuse
// or to another host. What it answers is never a page: git's own content type or
// application/octet-stream, as an attachment, sandboxed, with no script, readable by this site
// alone, never sniffed or cached (DOWN_HEADERS), the refusals too: Pages applies no _headers to a
// Function's answers, and a link to /git/<a host of anyone's>/... must not show that host's
// HTML as Rikuy. Answers are capped in time (TIMEOUT_MS) and, when the host gives their length,
// in bytes (MAX_ANSWER). It passes Authorization to that host alone and keeps no record of it;
// cookies go neither way, nor does a host's question for a password (WWW-Authenticate would
// bring up the browser's own login box under Rikuy's address; isomorphic-git asks for
// credentials on the 401 alone).
// Pure: the fetch it forwards with is given (the function passes the platform's; the tests a
// stand in), so test/gitproxy.test.mjs and test/git.py run this same code.

export const MAX_BODY = 32 * 1024 * 1024;
export const MAX_ANSWER = 256 * 1024 * 1024;
// (five minutes: a 50 MB clone over a phone's 1.5 Mbit/s line fits)
export const TIMEOUT_MS = 300000;
// the git hosts a browser reaches through this (dev.azure.com's git is under .../_git/...; Overleaf
// is the Git panel's own case, src/git.js gitUrlOf)
export const HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org', 'gitea.com', 'git.sr.ht', 'huggingface.co', 'dev.azure.com', 'git.overleaf.com'];
// the header the page's git client sends (src/git.js) and every request must carry
export const MARK = 'X-Rikuy-Git';
// on every answer: no page, no script, no other site's reading, no sniffing, no keeping
export const DOWN_HEADERS = { 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': 'attachment', 'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const SERVICES = new Set(['git-upload-pack', 'git-receive-pack']);
const TYPES = { 'git-upload-pack': 'application/x-git-upload-pack-request', 'git-receive-pack': 'application/x-git-receive-pack-request' };
// what goes up with a request, and what comes back (the length and the encoding are the
// platform's to set: a fetch hands the body back decoded)
const UP = ['authorization', 'content-type', 'accept', 'git-protocol'];
// (git's own answer types, for the service asked)
const ANSWER = { GET: (s) => 'application/x-' + s + '-advertisement', POST: (s) => 'application/x-' + s + '-result' };
// names that reach a private network, or nothing, wherever they are resolved
const PRIVATE_NAME = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|private|test|invalid|example|onion|home\.arpa)$/;

const refuse = (status, why) => new Response(why + '\n', { status, headers: { ...DOWN_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } });

// the hosts this deployment forwards to: HOSTS and a list in the variable (names, by commas or
// spaces), each still a public host by name
export function allowedHosts(extra) {
  const out = new Set(HOSTS);
  for (const h of String(extra || '').toLowerCase().split(/[\s,]+/)) if (h && publicHost(h) === h) out.add(h);
  return out;
}

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
export function gitTarget(method, rest, search, hosts = new Set(HOSTS)) {
  const segs = rest.split('/');
  // (a dot segment, written or encoded, could climb out of the host it names)
  if (segs.some((s) => { let d; try { d = decodeURIComponent(s); } catch (e) { return true; } return d === '.' || d === '..' || d.includes('/') || d.includes('\\'); })) return { why: 'no dot segments' };
  const host = publicHost(segs[0] || '');
  if (!host) return { why: 'only a public https host by name' };
  if (!hosts.has(host)) return { why: 'not a git host this site knows' };
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

// request: the browser's Request to <origin>/git/<host>/<path>; fetchUp: fetch to the host;
// o.hosts: the variable's list of more hosts; o.maxAnswer, o.timeout: the caps (tests)
export async function handle(request, fetchUp, o = {}) {
  const url = new URL(request.url);
  const at = url.pathname.indexOf('/git/');
  if (at < 0) return refuse(404, 'not a git request');
  const h = (k) => request.headers.get(k);
  // the page's git client alone: its mark, a script's fetch from this site (a browser that sends
  // no Sec-Fetch headers, Safari before 16.4, still needs the mark, which no other site's page
  // can send), never a navigation
  if (h(MARK) !== '1') return refuse(403, 'only Rikuy\'s git client');
  if ((h('Sec-Fetch-Mode') || 'cors') === 'navigate' || (h('Sec-Fetch-Dest') || 'empty') !== 'empty' || (h('Sec-Fetch-Site') || 'same-origin') !== 'same-origin') return refuse(403, 'not a request of this site\'s page');
  const origin = h('Origin');
  if (origin && origin !== url.origin) return refuse(403, 'not from this site');
  const t = gitTarget(request.method, url.pathname.slice(at + 5), url.search, allowedHosts(o.hosts));
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
  // redirects followed here, each checked as a request is (a host may move a repository); the
  // whole exchange, answer included, within TIMEOUT_MS
  const signal = AbortSignal.timeout(o.timeout || TIMEOUT_MS);
  let target = t.url, res;
  for (let hop = 0; ; hop++) {
    try { res = await fetchUp(target, { method: request.method, headers, body, redirect: 'manual', signal }); } catch (e) { return refuse(504, 'the host did not answer in time'); }
    if (res.status < 300 || res.status > 399 || res.status === 304) break;
    const loc = res.headers.get('Location');
    let next;
    try { next = loc && new URL(loc, target); } catch (e) { next = null; }
    if (hop >= 3 || !next || next.protocol !== 'https:' || !publicHost(next.host) || next.username || next.password) return refuse(502, 'a redirect that is refused');
    // (only to the same host: a token for one host goes to no other)
    if (next.host !== new URL(target).host) return refuse(502, 'a redirect to another host');
    target = next.href;
  }
  // git's own type when the host answered with it, else bytes; nothing else of the host's headers
  const want = ANSWER[request.method](t.service);
  const type = (res.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const out = new Headers({ ...DOWN_HEADERS, 'Content-Type': type === want ? want : 'application/octet-stream' });
  // The ceiling in bytes, with no script on the stream: a body piped through a transform runs
  // JavaScript per chunk, which is Worker CPU time (about 80 ms per 100 MiB, against the free
  // plan's 10 ms a request), so the platform would cut a big clone off (review SECURITY-2, L6).
  // A host that gives a length past MAX_ANSWER, or one that is not a number, is refused before a
  // byte is sent on; one that streams without a length is bounded by TIMEOUT_MS, as the whole
  // exchange is, and goes only to the hosts this proxy knows.
  const max = o.maxAnswer || MAX_ANSWER;
  const len = res.headers.get('Content-Length');
  if (len !== null && !(/^\d{1,15}$/.test(len.trim()) && Number(len) <= max)) {
    if (res.body) res.body.cancel().catch(() => {});
    return refuse(502, 'an answer larger than ' + max + ' bytes');
  }
  return new Response(res.body, { status: res.status, headers: out });
}
