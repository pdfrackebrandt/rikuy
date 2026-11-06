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

// The token the Git panel fills in for a remote: the one kept for its host. The single token of
// earlier versions (prefs.gitToken) is offered only for a remote the user set up (own), never
// for one that came with an opened project.
export function savedToken(prefs, url, own) {
  const k = remoteKey(url);
  if (!k || !own) return '';
  return (prefs.gitTokens && prefs.gitTokens[k]) || prefs.gitToken || '';
}

// Keep what the token field holds for this remote's host (an empty field forgets it). The old
// single token is gone once it is kept for a host, or once the user empties the field it filled.
export function keepToken(prefs, url, token, shown) {
  const k = remoteKey(url);
  if (!k) return;
  const all = Object.assign({}, prefs.gitTokens);
  if (token) all[k] = token; else delete all[k];
  prefs.gitTokens = all;
  if (prefs.gitToken && (token ? token === prefs.gitToken : shown === prefs.gitToken)) delete prefs.gitToken;
}
