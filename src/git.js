// Git for Rikuy: a real repository per project, kept in this browser (isomorphic-git over
// LightningFS, which stores files in IndexedDB). It is the same format git uses on disk, so a
// repository opened from a .zip keeps its history, and a .zip saved from here is a clone that
// `git push` works from. Push and pull speak git's smart HTTP protocol to any host that answers
// the browser (GitHub, GitLab, Gitea ... through a CORS proxy); the claude.ai sandbox lets a
// page talk only to its own server, so there the .zip is the way in and out.
//
// Loaded on first use (dist/git.js), so the editor does not carry it until it is needed.

import './git-shim.js';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';
import { authFor } from './gitauth.js';

const lfs = new LightningFS('galley-git');
const fs = lfs;
const pfs = lfs.promises;
const enc = new TextEncoder();

export function dirFor(project) { return '/' + String(project || 'paper').replace(/[^\w.-]+/g, '_').slice(0, 80); }

async function exists(p) { try { await pfs.stat(p); return true; } catch (e) { return false; } }
async function mkdirp(d) {
  let cur = '';
  for (const seg of d.split('/').filter(Boolean)) {
    cur += '/' + seg;
    if (!(await exists(cur))) { try { await pfs.mkdir(cur); } catch (e) { if (!(await exists(cur))) throw e; } }
  }
}
async function rmrf(p) {
  let st;
  try { st = await pfs.lstat(p); } catch (e) { return; }
  if (st.isDirectory()) {
    for (const n of await pfs.readdir(p)) await rmrf(p + '/' + n);
    await pfs.rmdir(p);
  } else await pfs.unlink(p);
}
const bytesOf = (x) => (typeof x === 'string' ? enc.encode(x) : x instanceof Uint8Array ? x : new Uint8Array(x));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export async function isRepo(dir) { return exists(dir + '/.git/HEAD'); }

export async function init(dir) {
  await mkdirp(dir);
  if (!(await isRepo(dir))) await git.init({ fs, dir, defaultBranch: 'main' });
}

// every file of the working tree (not .git), path -> bytes
export async function workingFiles(dir) {
  const out = new Map();
  const walk = async (d, rel) => {
    for (const n of await pfs.readdir(d)) {
      if (!rel && n === '.git') continue;
      const p = d + '/' + n;
      const st = await pfs.stat(p);
      if (st.isDirectory()) await walk(p, rel + n + '/');
      else out.set(rel + n, await pfs.readFile(p));
    }
  };
  if (await exists(dir)) await walk(dir, '');
  return out;
}

// Make the working tree hold exactly these files (the editor's project): write what differs,
// delete what is gone. .git is never touched.
export async function writeTree(dir, files) {
  await mkdirp(dir);
  const have = await workingFiles(dir);
  for (const [path, data] of files) {
    const b = bytesOf(await data);
    const old = have.get(path);
    if (old && same(old, b)) continue;
    await mkdirp(dir + '/' + path.split('/').slice(0, -1).join('/'));
    await pfs.writeFile(dir + '/' + path, b);
  }
  for (const path of have.keys()) if (!files.has(path)) await pfs.unlink(dir + '/' + path);
}

// [{path, change}] with change one of added, modified, deleted, against HEAD
export async function status(dir) {
  const rows = await git.statusMatrix({ fs, dir });
  const out = [];
  for (const [path, head, work] of rows) {
    if (head === 0 && work === 2) out.push({ path, change: 'added' });
    else if (head === 1 && work === 0) out.push({ path, change: 'deleted' });
    else if (head === 1 && work === 2) out.push({ path, change: 'modified' });
  }
  return out;
}

export async function commitAll(dir, message, author) {
  const rows = await git.statusMatrix({ fs, dir });
  for (const [path, head, work, stage] of rows) {
    if (work === 0) { if (head || stage) await git.remove({ fs, dir, filepath: path }); }
    else if (work !== stage || head !== work) await git.add({ fs, dir, filepath: path });
  }
  return git.commit({ fs, dir, message, author: { name: author.name, email: author.email } });
}

export async function log(dir, ref = 'HEAD', depth = 300) {
  try { return await git.log({ fs, dir, ref, depth }); } catch (e) { return []; }
}

// the files of a commit, path -> bytes
export async function filesAt(dir, oid) {
  const out = new Map();
  await git.walk({
    fs, dir, trees: [git.TREE({ ref: oid })],
    map: async (path, [e]) => {
      if (path === '.' || !e) return;
      if ((await e.type()) === 'blob') out.set(path, await e.content());
      return true;
    }
  });
  return out;
}

export async function branches(dir) {
  const list = await git.listBranches({ fs, dir });
  let current = null;
  try { current = await git.currentBranch({ fs, dir, fullname: false }); } catch (e) { /* detached */ }
  return { current, list };
}
export async function createBranch(dir, name) { await git.branch({ fs, dir, ref: name, checkout: true }); }
export async function switchBranch(dir, name) {
  await git.checkout({ fs, dir, ref: name, force: true });
  return workingFiles(dir);
}

// a repository from a .zip or folder: its .git files (path under .git -> bytes) are written
// as they are, and the working tree is then checked out from HEAD
export async function importGit(dir, gitFiles) {
  await rmrf(dir);
  await mkdirp(dir);
  for (const [path, data] of gitFiles) {
    await mkdirp(dir + '/' + path.split('/').slice(0, -1).join('/'));
    await pfs.writeFile(dir + '/' + path, bytesOf(await data));
  }
  return isRepo(dir);
}

// everything, .git included, for a .zip that is a clone
export async function exportAll(dir) {
  const out = new Map();
  const walk = async (d, rel) => {
    for (const n of await pfs.readdir(d)) {
      const p = d + '/' + n;
      const st = await pfs.stat(p);
      if (st.isDirectory()) await walk(p, rel + n + '/');
      else out.set(rel + n, await pfs.readFile(p));
    }
  };
  if (await exists(dir)) await walk(dir, '');
  return out;
}

export async function remoteUrl(dir) {
  try { return await git.getConfig({ fs, dir, path: 'remote.origin.url' }); } catch (e) { return null; }
}
export async function setRemote(dir, url) {
  await git.setConfig({ fs, dir, path: 'remote.origin.url', value: url });
  await git.setConfig({ fs, dir, path: 'remote.origin.fetch', value: '+refs/heads/*:refs/remotes/origin/*' });
}

// A repository opened from a .zip or folder brings someone else's .git/config, and isomorphic-git
// reads that file for whatever a call leaves out: remote.origin.pushurl for where to push,
// http.corsProxy when no proxy is given. So every call names the address (o.remote, the one the
// panel shows) and the proxy ('' for none), and the token answers only for o.remote's host: a
// call that does not say which remote its token is for sends none. o.onAccepted hears when the
// remote asked for the token and took it.
const net = (o) => ({ fs, http, corsProxy: o.corsProxy || '', onAuth: o.token ? (url) => authFor(url, o) : undefined, onAuthSuccess: o.onAccepted ? () => { o.onAccepted(); } : undefined });
async function target(dir, o) {
  const url = o.remote || (await remoteUrl(dir));
  if (!url) throw new Error('Set the remote URL first.');
  return url;
}

// an Overleaf project's address in the browser, as its git address (Overleaf's Git integration)
export function gitUrlOf(u) {
  const m = /^https?:\/\/(?:www\.)?overleaf\.com\/project\/([0-9a-f]{24})\b/i.exec(String(u).trim());
  return m ? 'https://git.overleaf.com/' + m[1] : String(u).trim();
}

export async function push(dir, o) {
  const { current } = await branches(dir);
  const url = await target(dir, o);
  return git.push({ ...net(o), dir, remote: 'origin', url, ref: current || 'main', force: !!o.force });
}

// fetch and merge (fast-forward or a real merge commit); conflicts are reported, not written
export async function pull(dir, o, author) {
  const { current } = await branches(dir);
  const url = await target(dir, o);
  return git.pull({ ...net(o), dir, remote: 'origin', url, ref: current || 'main', singleBranch: true, fastForward: true, author: { name: author.name, email: author.email } });
}

export async function clone(dir, url, o) {
  await rmrf(dir);
  await mkdirp(dir);
  await git.clone({ ...net({ ...o, remote: o.remote || url }), dir, url, singleBranch: true, depth: o.depth || undefined });
  return workingFiles(dir);
}

export const version = git.version();
