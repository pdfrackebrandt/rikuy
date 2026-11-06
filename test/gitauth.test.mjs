// Git access tokens kept per remote host and handed only to it (src/gitauth.js).
import assert from 'node:assert/strict';
import { remoteKey, authFor, savedToken, keepToken } from '../src/gitauth.js';

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

ok('the old single token goes to the first remote of the user\'s it is used with, then is gone', () => {
  const prefs = { gitToken: 'OLD' };
  assert.equal(savedToken(prefs, 'https://github.com/you/paper.git', true), 'OLD');
  assert.equal(savedToken(prefs, 'https://evil.example/paper.git', false), '', 'never for a remote from an opened project');
  keepToken(prefs, 'https://github.com/you/paper.git', 'OLD', 'OLD');
  assert.deepEqual(prefs, { gitTokens: { 'https://github.com': 'OLD' } });
  assert.equal(savedToken(prefs, 'https://gitlab.com/you/paper.git', true), '', 'not offered to a second host');
});

ok('a token typed for one host leaves the others, and the old token, alone', () => {
  const prefs = { gitToken: 'OLD', gitTokens: { 'https://github.com': 'GH' } };
  keepToken(prefs, 'https://gitlab.com/you/paper.git', 'GL', '');
  assert.deepEqual(prefs, { gitToken: 'OLD', gitTokens: { 'https://github.com': 'GH', 'https://gitlab.com': 'GL' } });
  keepToken(prefs, 'https://github.com/you/paper.git', '', 'GH');
  assert.deepEqual(prefs, { gitToken: 'OLD', gitTokens: { 'https://gitlab.com': 'GL' } }, 'emptying the field forgets that host\'s token');
  keepToken(prefs, 'https://github.com/you/paper.git', '', 'OLD');
  assert.deepEqual(prefs, { gitTokens: { 'https://gitlab.com': 'GL' } }, 'emptying the field the old token filled forgets it');
  keepToken(prefs, 'git@github.com:you/paper.git', 'X', '');
  assert.deepEqual(prefs, { gitTokens: { 'https://gitlab.com': 'GL' } }, 'nothing kept for an address that is not http(s)');
});

console.log(n + '/' + n + ' passed');
