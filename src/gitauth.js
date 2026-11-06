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
// token of earlier versions (prefs.gitToken). Only for a remote the user set up or one whose
// origin is not recorded (offer); never for one that came with an opened project.
export function savedToken(prefs, url, offer) {
  const k = remoteKey(url);
  if (!k || !offer) return '';
  return (prefs.gitTokens && prefs.gitTokens[k]) || prefs.gitToken || '';
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
  const k = remoteKey(url);
  if (!k) return;
  if (token && token === prefs.gitToken) {
    if (!accepted) return;
    delete prefs.gitToken;
  }
  const all = Object.assign({}, prefs.gitTokens);
  if (token) all[k] = token; else if (shown) delete all[k];
  prefs.gitTokens = all;
}
