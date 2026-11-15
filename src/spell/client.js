// The page's side of the spell worker (src/spell/worker.js): started the first time a word is
// asked, by a blob that loads the worker's script from beside the page (as the TeX and Word
// workers start), so it runs under the page's own policy. A job that takes more than 20 seconds
// stops the worker: spelling is off for the rest of the session and the page says so once.

export class SpellClient {
  constructor(base, spec) { this.base = base; this.spec = spec; this.w = null; this.seq = 0; this.jobs = new Map(); this.dead = ''; }
  start() {
    if (this.w || this.dead) return;
    const url = new URL(this.spec.worker, this.base).href;
    const boot = 'importScripts(' + JSON.stringify(url) + ');';
    let w;
    try { w = new Worker(URL.createObjectURL(new Blob([boot], { type: 'text/javascript' }))); } catch (e) { this.dead = 'no worker'; return; }
    this.w = w;
    w.onmessage = ({ data }) => {
      const j = this.jobs.get(data && data.id);
      if (!j) return;
      this.jobs.delete(data.id);
      clearTimeout(j.timer);
      if (data.error) j.reject(new Error(data.error)); else j.resolve(data.result);
    };
    w.onerror = (e) => { if (e.preventDefault) e.preventDefault(); this.fail('the spell worker stopped'); };
    w.postMessage({ id: 0, op: 'init', base: this.base, spec: this.spec });
  }
  fail(msg) {
    this.dead = msg;
    for (const j of this.jobs.values()) { clearTimeout(j.timer); j.reject(new Error(msg)); }
    this.jobs.clear();
    if (this.w) this.w.terminate();
    this.w = null;
  }
  run(op, payload) {
    this.start();
    if (this.dead) return Promise.reject(new Error(this.dead));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail('spelling took more than 20 seconds and was stopped'), 20000);
      this.jobs.set(id, { resolve, reject, timer });
      this.w.postMessage({ id, op, ...payload });
    });
  }
  check(dict, words) { return this.run('check', { dict, words }); }
  suggest(dict, word) { return this.run('suggest', { dict, word }); }
}
