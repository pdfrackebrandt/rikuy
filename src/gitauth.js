// Which remote a git access token belongs to. Tokens are kept per remote (its scheme and host)
// and handed only to that remote. One token for every remote let a project from someone else
// (a .zip or folder with its .git) name a remote of its own in .git/config and receive the
// token saved for the user's GitHub or Overleaf on Pull or Push. Used by the editor (src/app.js,
// which keeps the tokens) and by the Git panel's isomorphic-git calls (src/git.js).

// "https://github.com" for https://github.com/you/paper.git; '' for anything not http(s)
export function remoteKey(url) {
  try {
    const u = new URL(String(url || '').trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : '';
  } catch (e) { return ''; }
}

// A remote's address as the browser will request it, or '' for one Rikuy does not use. The token
// is matched against the host the URL parser reads, but isomorphic-git requests the address as
// written, through the CORS proxy as proxy/<host>/<path>, and the browser collapses dot segments
// in that path: https://github.com/a/%2e%2e/%2e%2e/evil.example/x matched github.com and was
// sent, token and all, to evil.example. So every remote is used in its parsed form (no dot
// segments left, host lowercased), and one with a user name, a query or a fragment is refused:
// none is needed to name a repository, and each lets the address mean two things.
export function canonicalRemote(url) {
  try {
    const u = new URL(String(url || '').trim());
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || u.search || u.hash || u.href.includes('?') || u.href.includes('#')) return '';
    return u.href;
  } catch (e) { return ''; }
}

// the host a remote names, for notes that tell the user whose remote it is
export function remoteHost(url) {
  const c = canonicalRemote(url);
  return c ? new URL(c).host : String(url || '').replace(/^https?:\/\//, '').split(/[/?#]/)[0];
}

// The host a token of earlier versions (one token for every remote) was made for, where its
// prefix says: GitHub's, GitLab's and Overleaf's tokens say whose they are. '' when it does not.
const PREFIXES = [[/^(ghp|gho|ghu|ghs|ghr)_|^github_pat_/, 'https://github.com'], [/^glpat-/, 'https://gitlab.com'], [/^olp_/, 'https://git.overleaf.com']];
export function tokenHost(token) {
  for (const [re, k] of PREFIXES) if (re.test(token || '')) return k;
  return '';
}

// The token of earlier versions, when it may be offered for this remote only on the user's
// click: it names no host, or not this one but the remote is not one of the hosts tokens are
// recognised for (a GitHub Enterprise or self-hosted git). '' otherwise.
export function legacyChoice(prefs, url) {
  const k = remoteKey(canonicalRemote(url)), t = prefs.gitToken;
  if (!k || !t || (prefs.gitTokens && prefs.gitTokens[k])) return '';
  const h = tokenHost(t);
  return !h || !PREFIXES.some(([, p]) => p === k) ? t : '';
}

// Overleaf's git server takes the user name "git" with a token from the account settings
const userFor = (url, o) => o.username || (/(^|\/\/)git\.overleaf\.com\//.test(url || '') ? 'git' : 'x-access-token');

// isomorphic-git's onAuth: the token only for a request to the remote it was given for
// (o.remote); any other address gets nothing
export function authFor(url, o) {
  const k = remoteKey(o && o.remote);
  if (!o || !o.token || !k || remoteKey(url) !== k) return undefined;
  return { username: userFor(url, o), password: o.token };
}

// The token the Git panel fills in for a remote: the one kept for its host, else the single
// token of earlier versions (prefs.gitToken) when its prefix names this host. Only for a remote
// the user set up or one whose origin is not recorded (offer); never for one that came with an
// opened project. The old token used to be filled in for any host typed, so a stranger's address
// pasted into the clone form, which answers 401 and then 200, received it; a token whose prefix
// names no host is now offered only on a click that names the host (legacyChoice).
export function savedToken(prefs, url, offer) {
  const k = remoteKey(canonicalRemote(url));
  if (!k || !offer) return '';
  if (prefs.gitTokens && prefs.gitTokens[k]) return prefs.gitTokens[k];
  return prefs.gitToken && tokenHost(prefs.gitToken) === k ? prefs.gitToken : '';
}

// Before a push, pull or clone: once the user replaces or empties the field the old single token
// filled, it is gone, so no other host is offered it.
export function dropReplaced(prefs, token, shown) {
  if (prefs.gitToken && shown === prefs.gitToken && token !== shown) delete prefs.gitToken;
}

// After one worked: what the field held is kept for that host (emptying a filled field forgets
// it). The old single token moves only to a host that asked for it and accepted it (accepted:
// isomorphic-git's onAuthSuccess), so a first pull from another host does not take it.
export function keepToken(prefs, url, token, shown, accepted) {
  const k = remoteKey(canonicalRemote(url));
  if (!k) return;
  if (token && token === prefs.gitToken) {
    if (!accepted) return;
    delete prefs.gitToken;
  }
  const all = Object.assign({}, prefs.gitTokens);
  if (token) all[k] = token; else if (shown) delete all[k];
  prefs.gitTokens = all;
}
