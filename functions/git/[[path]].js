// Cloudflare Pages Function: Rikuy's git proxy at /git/<host>/<path> on the hosted copy's own site
// (src/gitproxy.js says what it forwards and what it refuses; docs/HOSTING.md what it costs).
// wrangler pages deploy finds this folder beside dist/ and bundles it; only /git/* runs it.
// RIKUY_GIT_HOSTS, a variable of the Pages project (Settings, Variables and Secrets), names git
// hosts beyond the built in list, by commas or spaces.
import { handle } from '../../src/gitproxy.js';

export const onRequest = (context) => handle(context.request, (url, init) => fetch(url, init), { hosts: context.env && context.env.RIKUY_GIT_HOSTS });
