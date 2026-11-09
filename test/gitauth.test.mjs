// Git access tokens kept per remote host and handed only to it (src/gitauth.js).
import assert from 'node:assert/strict';
import { remoteKey, authFor, savedToken, keepToken, dropReplaced, canonicalRemote, remoteHost, tokenHost, legacyChoice } from '../src/gitauth.js';

let n = 0;
const ok = (name, f) => { try { f(); n++; } catch (e) { console.error('FAIL', name); throw e; } };

ok('a remote is its scheme and host', () => {
  assert.equal(remoteKey('https://github.com/you/paper.git'), 'https://github.com');
  assert.equal(remoteKey(' https://GitHub.com/you/paper.git '), 'https://github.com');
  assert.equal(remoteKey('http://127.0.0.1:8811/paper.git'), 'http://127.0.0.1:8811');
  assert.equal(remoteKey('https://git.overleaf.com/0123456789abcdef01234567'), 'https://git.overleaf.com');
  // the host is what the URL parser says, not what the address seems to say
  assert.equal(remoteKey('https://github.com@evil.example/you/paper.git'), 'https://evil.example');
  assert.equal(remoteKey('https://x-access-token:t@github.com/you/paper.git'), 'https://github.com');
  for (const bad of ['', null, undefined, 'git@github.com:you/paper.git', 'ssh://github.com/x', 'file:///tmp/x', 'not a url', 7]) assert.equal(remoteKey(bad), '', String(bad));
});

ok('onAuth answers only the remote the token was given for', () => {
  const o = { token: 'T', remote: 'https://github.com/you/paper.git' };
  assert.deepEqual(authFor('https://github.com/you/paper.git', o), { username: 'x-access-token', password: 'T' });
  assert.deepEqual(authFor('https://github.com/someone/else.git', o), { username: 'x-access-token', password: 'T' }, 'the same host');
  for (const other of ['https://evil.example/paper.git', 'http://github.com/you/paper.git', 'https://github.com:8443/you/paper.git', 'https://github.com.evil.example/x', 'https://github.com@evil.example/x', '', undefined]) {
    assert.equal(authFor(other, o), undefined, String(other));
  }
  assert.equal(authFor('https://github.com/you/paper.git', { token: 'T' }), undefined, 'no remote named, no token');
  assert.equal(authFor('https://github.com/you/paper.git', { token: '', remote: o.remote }), undefined);
  assert.deepEqual(authFor('https://git.overleaf.com/0123456789abcdef01234567', { token: 'T', remote: 'https://git.overleaf.com/0123456789abcdef01234567' }), { username: 'git', password: 'T' });
});

ok('the token filled in is the one kept for the host, and only for a remote of the user\'s', () => {
  const prefs = { gitTokens: { 'https://github.com': 'GH', 'https://git.overleaf.com': 'OL' } };
  assert.equal(savedToken(prefs, 'https://github.com/you/paper.git', true), 'GH');
  assert.equal(savedToken(prefs, 'https://git.overleaf.com/0123456789abcdef01234567', true), 'OL');
  assert.equal(savedToken(prefs, 'https://evil.example/paper.git', true), '');
  assert.equal(savedToken(prefs, 'https://github.com/you/paper.git', false), '', 'a remote that came with an opened project');
  assert.equal(savedToken(prefs, '', true), '');
});

ok('a remote is used as the browser will request it; one that can mean two things is refused', () => {
  assert.equal(canonicalRemote(' https://GitHub.com/you/paper.git '), 'https://github.com/you/paper.git');
  // dot segments, encoded or not, are resolved: through a CORS proxy the browser resolves them in
  // proxy/<host>/<path>, so the host the token is matched against must be the one requested
  assert.equal(canonicalRemote('https://github.com/alice/%2e%2e/%2e%2e/evil.example/paper.git'), 'https://github.com/evil.example/paper.git');
  assert.equal(canonicalRemote('https://github.com/a/.%2E/./b\\c.git'), 'https://github.com/b/c.git');
  for (const bad of ['https://x-access-token:t@github.com/you/paper.git', 'https://github.com@evil.example/x', 'https://github.com/you/paper.git?x=1', 'https://github.com/you/paper.git?',
    'https://github.com/you/paper.git#main', 'git@github.com:you/paper.git', 'ssh://github.com/x', 'file:///tmp/x', '', null, 'not a url']) assert.equal(canonicalRemote(bad), '', String(bad));
  assert.equal(remoteHost('https://GitHub.com/a/%2e%2e/%2e%2e/evil.example/x'), 'github.com');
  assert.equal(remoteHost('http://127.0.0.1:8812/paper.git'), '127.0.0.1:8812');
});

ok('the old single token is filled in only for the host its prefix names', () => {
  assert.equal(tokenHost('ghp_abc'), 'https://github.com');
  assert.equal(tokenHost('github_pat_11AB'), 'https://github.com');
  assert.equal(tokenHost('glpat-xyz'), 'https://gitlab.com');
  assert.equal(tokenHost('olp_123'), 'https://git.overleaf.com');
  assert.equal(tokenHost('OLD'), '');
  const gh = { gitToken: 'ghp_OLD' };
  assert.equal(savedToken(gh, 'https://github.com/you/paper.git', true), 'ghp_OLD');
  // a stranger's address pasted into the clone form, which answers 401 and then 200, got it before
  assert.equal(savedToken(gh, 'https://evil.example/paper.git', true), '');
  assert.equal(savedToken(gh, 'https://gitlab.com/you/paper.git', true), '');
  assert.equal(legacyChoice(gh, 'https://github.com/you/paper.git'), '', 'filled in already');
  assert.equal(legacyChoice(gh, 'https://gitlab.com/you/paper.git'), '', 'a GitHub token is not offered to GitLab');
  assert.equal(legacyChoice(gh, 'https://github.example.com/you/paper.git'), 'ghp_OLD', 'a GitHub Enterprise host: on a click that names it');
  const plain = { gitToken: 'OLD' };
  assert.equal(savedToken(plain, 'https://github.com/you/paper.git', true), '', 'a token that names no host is never filled in by itself');
  assert.equal(legacyChoice(plain, 'https://evil.example/paper.git'), 'OLD', 'but can be picked, for the host the button names');
  assert.equal(legacyChoice(plain, 'https://evil.example/paper.git?x'), '', 'not for an address Rikuy refuses');
  assert.equal(legacyChoice({ gitToken: 'OLD', gitTokens: { 'https://github.com': 'GH' } }, 'https://github.com/x.git'), '', 'not where the host has its own');
  assert.equal(legacyChoice({}, 'https://github.com/x.git'), '');
});

ok('the old single token moves to the first host that asks for it and takes it, then is gone', () => {
  const prefs = { gitToken: 'ghp_OLD' };
  assert.equal(savedToken(prefs, 'https://github.com/you/paper.git', true), 'ghp_OLD');
  assert.equal(savedToken(prefs, 'https://evil.example/paper.git', false), '', 'never for a remote from an opened project');
  // a pull from a host that never asked for a token (a public repository elsewhere) leaves it
  keepToken(prefs, 'https://gitlab.com/someone/public.git', 'ghp_OLD', 'ghp_OLD', false);
  assert.deepEqual(prefs, { gitToken: 'ghp_OLD' });
  keepToken(prefs, 'https://github.com/you/paper.git', 'ghp_OLD', 'ghp_OLD', true);
  assert.deepEqual(prefs, { gitTokens: { 'https://github.com': 'ghp_OLD' } });
  assert.equal(savedToken(prefs, 'https://gitlab.com/you/paper.git', true), '', 'not offered to a second host');
});

ok('replacing or emptying the field the old token filled drops it at once', () => {
  let prefs = { gitToken: 'OLD' };
  dropReplaced(prefs, 'NEW', 'OLD');
  assert.deepEqual(prefs, {}, 'replaced: no other host is offered the old one');
  keepToken(prefs, 'https://github.com/you/paper.git', 'NEW', 'OLD', false);
  assert.deepEqual(prefs, { gitTokens: { 'https://github.com': 'NEW' } }, 'the new one is kept once the pull or push worked');
  prefs = { gitToken: 'OLD' };
  dropReplaced(prefs, '', 'OLD');
  assert.deepEqual(prefs, {});
  prefs = { gitToken: 'OLD', gitTokens: { 'https://github.com': 'GH' } };
  dropReplaced(prefs, 'OLD', 'OLD');
  dropReplaced(prefs, 'X', 'GH');
  dropReplaced(prefs, 'X', '');
  assert.deepEqual(prefs, { gitToken: 'OLD', gitTokens: { 'https://github.com': 'GH' } }, 'kept while it is what the field shows, or it never filled the field');
});

ok('a token typed for one host leaves the others alone', () => {
  const prefs = { gitToken: 'OLD', gitTokens: { 'https://github.com': 'GH' } };
  keepToken(prefs, 'https://gitlab.com/you/paper.git', 'GL', '', false);
  assert.deepEqual(prefs, { gitToken: 'OLD', gitTokens: { 'https://github.com': 'GH', 'https://gitlab.com': 'GL' } });
  keepToken(prefs, 'https://github.com/you/paper.git', '', 'GH', false);
  assert.deepEqual(prefs, { gitToken: 'OLD', gitTokens: { 'https://gitlab.com': 'GL' } }, 'emptying the field forgets that host\'s token');
  keepToken(prefs, 'https://bitbucket.org/you/paper.git', '', '', false);
  assert.deepEqual(prefs.gitTokens, { 'https://gitlab.com': 'GL' }, 'an empty field that showed nothing changes nothing');
  keepToken(prefs, 'git@github.com:you/paper.git', 'X', '', true);
  assert.deepEqual(prefs.gitTokens, { 'https://gitlab.com': 'GL' }, 'nothing kept for an address that is not http(s)');
});

console.log(n + '/' + n + ' passed');
