// A stand in for the hosted copy's /git function (functions/git/[[path]].js), for test/git.py: the
// same code (src/gitproxy.js) behind a local HTTP server, with the requests it would send to a
// host sent to a local git server instead.
// Usage: node test/gitproxy_server.mjs PORT SITE HOST=LOCAL_ORIGIN...
//   SITE: the origin the page runs at (the function sees requests as that site's own)
//   HOST=LOCAL_ORIGIN: https://HOST/... goes to LOCAL_ORIGIN/... (e.g. github.com=http://127.0.0.1:8811)
import http from 'http';
import { handle } from '../src/gitproxy.js';

const [port, site, ...maps] = process.argv.slice(2);
const MAP = new Map(maps.map((m) => m.split('=')));
const fetchUp = (url, init) => {
  const u = new URL(url);
  const to = MAP.get(u.host);
  if (!to) return Promise.resolve(new Response('no such host here\n', { status: 502 }));
  return fetch(to + u.pathname + u.search, init);
};
http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (k !== 'host' && k !== 'connection') headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  const request = new Request(site + req.url, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body });
  try {
    const r = await handle(request, fetchUp);
    const out = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(out);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(String(e));
  }
}).listen(Number(port), '127.0.0.1', () => console.log('git proxy stand in on ' + port));
