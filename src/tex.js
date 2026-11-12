// Real TeX for Rikuy. The engines run in a worker (tex/engine.js): TeX Live 2026's pdfTeX,
// XeTeX and LuaHBTeX compiled to WebAssembly, reading a TeX Live tree that arrives in packs as
// the document asks for files. The first PDF downloads the engine (about 13 MB) and the core
// of LaTeX (about 6 MB); both stay in the browser afterwards.

export class TeXEngine {
  constructor(base, mirror, scripts) {
    this.base = base; // URL of the folder holding the packs (tex/)
    // URL of the folder holding engine.js, its scripts and tree.wasm: the same folder, but the
    // installed app asks for them under its version (src/pwa.js asset()), so its service worker
    // answers this page's version of them and never a newer one's
    this.scripts = scripts || base;
    this.mirror = mirror || null; // URL of a full TeX Live mirror (build_tree.py mirror), if any
    this.worker = null;
    this.readyP = null;
    this.rejectReady = null;
    this.info = null;
    this.jobs = new Map();
    this.seq = 0;
    this.onStatus = () => {};
  }

  start() {
    if (this.readyP) return this.readyP;
    this.readyP = new Promise((resolve, reject) => {
      this.rejectReady = reject;
      let w;
      try {
        // a blob bootstrap: it runs under the page's policy (which allows WebAssembly) and
        // loads the engine from its real address
        const boot = 'self.__galleyBase=' + JSON.stringify(this.scripts) + ';importScripts(' + JSON.stringify(new URL('engine.js', this.scripts).href) + ');';
        w = new Worker(URL.createObjectURL(new Blob([boot], { type: 'text/javascript' })));
      } catch (e) { reject(e); return; }
      this.worker = w;
      w.onmessage = ({ data }) => {
        if (w !== this.worker) return;
        if (data.status === 'keep') { if (this.keeping) this.keeping.progress(data); return; }
        if (data.kept) {
          const k = this.keeping;
          this.keeping = null;
          if (k) { if (data.kept.error) k.reject(new Error(data.kept.error)); else k.resolve(data.kept); }
          return;
        }
        if (data.status) { this.onStatus(data); return; }
        if (data.ready) { this.info = data; this.rejectReady = null; resolve(data); return; }
        if (data.result) {
          const j = this.jobs.get(data.result.id);
          if (j) { this.jobs.delete(data.result.id); j.resolve(data.result); }
          return;
        }
        if (data.error) {
          const j = data.id != null && this.jobs.get(data.id);
          if (j) { this.jobs.delete(data.id); j.reject(new Error(data.error)); }
          else if (!this.info) reject(new Error(data.error));
          else this.crash(data.error);
        }
      };
      w.onerror = (e) => {
        if (w !== this.worker) return;
        e.preventDefault && e.preventDefault();
        const msg = e.message || 'The TeX engine stopped';
        if (!this.info) reject(new Error(msg)); else this.crash(msg);
      };
      w.postMessage({ init: true, base: this.base, mirror: this.mirror });
    });
    this.readyP.catch(() => { this.reset(); });
    return this.readyP;
  }

  // files: [{path, data: string | Uint8Array}]
  async compile({ project, files, main, clean, prefetch, bibSig, engine, shellEscape, untrusted }) {
    // A document that came in a link (untrusted) can still write anywhere in the worker's files
    // (LuaTeX's Lua, the shell's own commands), which later compiles of other projects read. So
    // the worker that compiled one is let go before it compiles anything else.
    const p = project || 'doc';
    if (this.tainted && (this.tainted !== p || !untrusted)) { for (const j of this.jobs.values()) j.reject(new Error('stopped')); this.jobs.clear(); this.reset(); }
    await this.start();
    if (untrusted) this.tainted = p;
    const id = ++this.seq;
    // (prefetch may be a function of what the worker said when it was ready: pack numbers mean
    // something only for one build of the TeX tree, and which one is known only now)
    const job = { id: p + '#' + id, project: p, files, main, clean: !!clean, prefetch: (typeof prefetch === 'function' ? prefetch(this.info) : prefetch) || [], bibSig: bibSig || '', engine: engine || 'auto', shellEscape: shellEscape !== false, untrusted: !!untrusted };
    return new Promise((resolve, reject) => {
      this.jobs.set(job.id, { resolve, reject });
      this.worker.postMessage({ compile: job });
    });
  }

  // Keep the packs holding the given folders of the tree (and the core packs and the engine) in
  // the worker's cache, for working offline (src/pwa.js). progress gets {got, total} in bytes.
  async keep(folders, progress) {
    // one at a time: a keep begun before (the warm up's, below) ends first
    for (;;) {
      await this.start();
      if (!this.keeping) break;
      await this.keeping.done;
    }
    const p = new Promise((resolve, reject) => {
      this.keeping = { resolve, reject, progress: progress || (() => {}) };
      this.worker.postMessage({ keep: { folders } });
    });
    this.keeping.done = p.then(() => {}, () => {});
    return p;
  }

  // TeX before anyone asked for it (src/pwa.js, warmTeX): the worker started, which fetches the
  // engine and the packs every document reads and keeps them, then the packs of the given
  // folders kept too. A compile asked for meanwhile simply finds the worker further along.
  // Gives what keep() gives, or null when it did not go through; it never rejects.
  warm(folders) {
    if (!this.warmP) this.warmP = this.start().then(() => this.keep(folders)).catch(() => null);
    return this.warmP;
  }

  // the worker died after it was ready: everything waiting on it fails, and the next
  // compile starts a fresh one
  crash(msg) {
    for (const j of this.jobs.values()) j.reject(new Error('The TeX engine stopped (' + msg + ')'));
    this.jobs.clear();
    this.reset();
  }

  reset() {
    if (this.keeping) { this.keeping.reject(new Error('The TeX engine stopped')); this.keeping = null; }
    if (this.worker) this.worker.terminate();
    this.worker = null; this.readyP = null; this.info = null; this.rejectReady = null; this.tainted = null; this.warmP = null;
  }

  stop() {
    const rr = this.rejectReady;
    for (const j of this.jobs.values()) j.reject(new Error('stopped'));
    this.jobs.clear();
    this.reset();
    if (rr) rr(new Error('stopped'));
  }
}

// TeX's log, read the way Overleaf's parser does. TeX wraps its log at 79 characters, so a
// line of exactly that length is joined to the next. It prints "(./file.tex" when it opens a
// file and ")" when it closes it, which tells which file a warning belongs to. Errors (from
// --file-line-error) carry their own file and line; an error inside a TeX Live file has no
// line the author can use, so it gets none.
export function parseTeXLog(log) {
  const out = [];
  if (!log) return out;
  const raw = log.split('\n');
  const lines = [];
  for (let i = 0; i < raw.length; i++) {
    let l = raw[i];
    while (raw[i].length === 79 && i + 1 < raw.length) { i++; l += raw[i]; }
    lines.push(l);
  }
  const stack = [];
  const track = (l) => {
    // parentheses that hold words, as in "(natbib)" or "(see the transcript)", are not files
    const t = l.replace(/\((?!\.{0,2}\/)[^()]*\)/g, '');
    const re = /\((\.{0,2}\/[^\s()]+)|\)/g;
    let m;
    while ((m = re.exec(t))) { if (m[1]) stack.push(m[1]); else stack.pop(); }
  };
  const here = () => { for (let k = stack.length - 1; k >= 0; k--) if (/^\.\//.test(stack[k])) return stack[k].slice(2); return null; };
  const fileLine = /^(?:\.\/)?([^\s:()][^:()]*?\.[A-Za-z0-9]+):(\d+): (.*)$/;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m = fileLine.exec(l);
    if (m) {
      let msg = m[3];
      // the context lines after an error show where TeX stopped
      let ctx = '';
      for (let k = i + 1; k < Math.min(lines.length, i + 8); k++) {
        const c = /^l\.(\d+) (.*)$/.exec(lines[k]);
        if (c) { ctx = c[2] + (lines[k + 1] ? lines[k + 1].trim() : ''); break; }
      }
      if (/^(LaTeX|Package \S+) Error: /.test(msg) && !/\.$/.test(msg) && lines[i + 1] && /^\S/.test(lines[i + 1]) && !fileLine.test(lines[i + 1])) msg += ' ' + lines[i + 1].trim();
      const inTree = m[1].startsWith('/');
      out.push({ sev: 'error', file: inTree ? here() : m[1], line: inTree ? null : +m[2], msg: msg.replace(/\s+/g, ' ').trim(), ctx: inTree ? '' : ctx });
      continue;
    }
    if (/^!/.test(l)) {
      const c = lines.slice(i + 1, i + 10).map((x) => /^l\.(\d+)/.exec(x)).find(Boolean);
      const f = here();
      out.push({ sev: 'error', file: f, line: c && f ? +c[1] : null, msg: l.replace(/^!\s*/, '').trim() });
      continue;
    }
    m = /^(?:LaTeX|Package (\S+)) Warning: (.*)$/.exec(l);
    if (m) {
      let msg = m[2];
      for (let k = i + 1; k < lines.length && /^\(\S+\)\s/.test(lines[k]); k++) msg += ' ' + lines[k].replace(/^\(\S+\)\s+/, '');
      const ln = /on input line (\d+)/.exec(msg);
      const sev = /undefined|Citation|Reference|not found|Rerun/i.test(msg) ? 'warn' : 'info';
      out.push({ sev, file: here(), line: ln ? +ln[1] : null, msg: (m[1] ? m[1] + ': ' : '') + msg.replace(/\s+/g, ' ').trim() });
      track(l);
      continue;
    }
    m = /^(Overfull|Underfull) \\[hv]box \(([^)]*)\).*?lines? (\d+)/.exec(l);
    if (m && m[1] === 'Overfull') out.push({ sev: 'info', file: here(), line: +m[3], msg: 'Overfull line (' + m[2] + ')' });
    track(l);
  }
  return dedupe(out);
}
function dedupe(list) {
  const seen = new Set();
  return list.filter((x) => { const k = x.sev + x.file + x.line + x.msg; if (seen.has(k)) return false; seen.add(k); return true; });
}
