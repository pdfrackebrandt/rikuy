// WebMCP: Rikuy's tools for the AI agent in the user's own browser. Browsers are adding a way
// for a page to hand its tools to that agent (the W3C draft at github.com/webmachinelearning/webmcp
// and Chrome's imperative API: document.modelContext.registerTool({ name, title, description,
// inputSchema, annotations, execute }, { signal }); older drafts and Chrome's first origin trial
// had navigator.modelContext, whose registerTool returned { unregister() } and whose execute got
// a client with requestUserInteraction). Both are detected; where neither exists nothing here is
// built or registered.
//
// The tools are rikuy.api's (src/app.js agentApi) and the command registry's (src/commands.js):
// reading the source, the outline, the selection, TeX's problems and the PDF's state; running a
// command by its id with its arguments; inserting text at a place, setting a range, inserting an
// interactive graph; compiling. Every edit goes through App.commit, as typing does: one Undo
// takes it back, and a copy someone shared (guest view) is read, never changed.
//
// What the agent reads of a document is the document's author's text, maybe a stranger's (a
// share link): the tools that return it say so (untrustedContentHint), and nothing in a document
// can call a tool or answer for the user. A tool that takes something away or sends the document
// out (a delete, Replace All, the whole source replaced, Share, a download, a link opened) asks
// the person in the page first, in a modal dialog whose Allow takes only a real press or key of
// theirs (event.isTrusted: a script cannot press it); Escape, Don't allow, two minutes or the
// agent cancelling refuse. test/agent.py (webmcp) checks all of it with a stand in for the
// browser's modelContext.

import { command, commands, enabled } from './commands.js';
import { buildModel } from './model.js';

// Arguments of the commands that take them (llms.txt says each): JSON schemas an agent reads in
// run_command's description and list_commands. A command may declare its own as `args` in the
// registry (src/commands.js); these are the ones written before that field.
const S = { str: { type: 'string' }, num: { type: 'number' }, bool: { type: 'boolean' }, int: { type: 'integer' } };
const obj = (props, req) => ({ type: 'object', properties: props, ...(req ? { required: req } : {}), additionalProperties: false });
const LEN = { type: 'string', description: 'A TeX length: "3cm", "12pt", "0.5\\linewidth"' };
export const ARGS = {
  table: obj({ rows: { type: 'integer', minimum: 1, maximum: 60 }, cols: { type: 'integer', minimum: 1, maximum: 30 }, fit: { enum: ['contents', 'window', 'fixed'] }, width: LEN }, ['rows', 'cols']),
  'table-sort': obj({ col: { type: 'integer', minimum: 1 }, desc: S.bool, header: S.bool }, ['col']),
  'table-to-text': obj({ sep: { type: 'string', description: 'a separator such as ", ", or "para" for one paragraph a row' } }),
  'text-to-table': obj({ sep: S.str }),
  'delete-cells': obj({ how: { enum: ['left', 'up', 'row', 'column'] } }, ['how']),
  'table-properties': obj({ full: S.bool, align: { enum: ['l', 'c', 'r'] }, stretch: S.num, fixed: S.bool, width: LEN, v: { enum: ['t', 'm', 'b'] } }),
  'cell-margins': obj({ side: LEN, top: LEN }),
  'table-shading': obj({ pick: { type: ['object', 'null'], properties: { name: S.str, html: { type: 'string', pattern: '^[0-9A-Fa-f]{6}$' } } } }, ['pick']),
  'table-borders': obj({ id: S.str }, ['id']),
  'pen-weight': obj({ w: LEN }, ['w']),
  'table-from-data': obj({ file: S.str, text: S.str }, ['file']),
  'picture-width': obj({ width: LEN, height: LEN, free: S.bool }),
  'picture-crop': obj({ l: S.num, b: S.num, r: S.num, t: S.num }),
  'picture-alt': obj({ text: S.str, decorative: S.bool }),
  'picture-size': obj({ width: LEN, height: LEN, free: S.bool, angle: S.num, crop: { type: 'object' }, place: { type: 'object' } }),
  'insert-shapes': obj({ shape: { enum: ['line', 'arrow', 'double-arrow', 'rectangle', 'rounded-rectangle', 'oval', 'circle', 'triangle', 'diamond', 'pentagon', 'hexagon', 'star'] } }, ['shape']),
  'insert-icons': obj({ icon: { type: 'string', description: 'a fontawesome5 name, such as "check"' } }, ['icon']),
  'insert-smartart': obj({ kind: S.str, items: { type: 'array', items: S.str, maxItems: 12 } }, ['kind']),
  'insert-chart': obj({ kind: { enum: ['column', 'bar', 'line'] }, cats: { type: 'array', items: S.str }, series: { type: 'array', items: obj({ name: S.str, values: { type: 'array', items: S.num } }) } }, ['kind']),
  'insert-textbox': obj({ kind: { enum: ['simple', 'shaded', 'beside'] } }),
  'insert-dropcap': obj({ mode: { enum: ['dropped', 'margin', 'none'] }, lines: { type: 'integer', minimum: 2, maximum: 10 } }),
  'rename-style': obj({ v: { type: 'string', description: '"env:name" or "char:name"' }, name: S.str }, ['v', 'name'])
};
const argsOf = (c) => c.args || ARGS[c.id] || null;

// Commands that take something away, put the document somewhere else, replace it, or open an
// address (a link in a document is its author's): the person says yes first
const ASKS = /(^|-)(delete|remove|clear|reset|reject|accept|discard|push)(-|$)|^(new-document|new-blank|new-template|load-sample|recent|open|share|export-as|download-(pdf|word|latex|menu)|print|replace|rename-style|link-open|help-report|ask-grok|help-agents)$/;
export const asks = (id) => ASKS.test(id);
// a range set by replace_range that removes more than this many characters asks too
const BIG = 200;
const MAX_TEXT = 1000000;

// ---- the tools ----------------------------------------------------------------------------------
function tools(app) {
  const api = app.api;
  const flush = () => { if (app.srcRebuild && app.srcRebuild.pending()) app.srcRebuild.flush(); };
  const guest = () => document.body.classList.contains('guest');
  const mine = () => { if (guest()) throw new Error('This document is open in guest view (a copy someone shared): it can be read, not changed.'); };
  const fileOf = (f) => {
    const name = f == null || f === '' ? app.main : String(f);
    if (!app.files.has(name)) throw new Error('No text file "' + name.slice(0, 200) + '" in this project: list_files lists them.');
    return name;
  };
  const range = (name, start, end) => {
    const n = app.files.get(name).length;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > n) throw new Error('start and end must be whole numbers with 0 <= start <= end <= ' + n + ' (the length of ' + name + ').');
  };
  const text = (t) => { if (typeof t !== 'string') throw new TypeError('text must be a string.'); if (t.length > MAX_TEXT) throw new RangeError('text is longer than ' + MAX_TEXT + ' characters.'); return t; };
  // one edit, as typing makes it: one undo step; refused, changing nothing, when the page could
  // not read the main file afterwards (as rikuy.api.setSource refuses)
  const edit = (f, s, e, t, caretAfter) => {
    flush();
    if (f === app.main || /\.tex$/i.test(f)) {
      const cur = app.files.get(f);
      const next = cur.slice(0, s) + t + cur.slice(e);
      try { buildModel({ files: new Map([...app.files, [f, next]]), main: app.main }); } catch (err) { throw new Error('The page cannot read the source after this edit (' + err.message + '). Nothing was changed.'); }
    }
    app.closePop(true, true);
    app.closeGroup();
    app.commit([{ f, s, e, t }], caretAfter ? { f, p: s + t.length } : null, 'api');
    app.closeGroup();
  };
  const readOnly = { readOnlyHint: true, untrustedContentHint: true, destructiveHint: false, consequentialHint: false };
  const editing = { readOnlyHint: false, untrustedContentHint: false, destructiveHint: false, consequentialHint: false };
  const runnable = () => commands().filter((c) => c.run && c.searchable !== false);

  return [
    { name: 'get_source', title: 'Read the LaTeX source',
      description: 'The LaTeX source of a file of the open project (the main .tex file when file is left out), with its length in characters. Offsets in other tools count characters (UTF-16 code units) of this text.',
      inputSchema: obj({ file: { type: 'string', description: 'a file name from list_files; default the main file' } }), annotations: readOnly,
      run: ({ file } = {}) => { flush(); const f = fileOf(file); const t = app.files.get(f); return { file: f, main: f === app.main, length: t.length, text: t }; } },
    { name: 'list_files', title: 'List the project\'s files',
      description: 'Every file of the open project: text files with their length, pictures and other binary files with their size in bytes. The main file is marked.',
      inputSchema: obj({}), annotations: readOnly,
      run: () => ({ main: app.main, files: api.getFiles().map((x) => (x.text != null ? { name: x.name, text: true, length: x.text.length } : { name: x.name, text: false, bytes: x.bytes })) }) },
    { name: 'get_outline', title: 'Read the outline',
      description: 'The document\'s headings in order: level (1 is a section, or a chapter in a report or book), number, title, and where each starts in the source (file and character offset).',
      inputSchema: obj({}), annotations: readOnly,
      run: () => { flush(); return { headings: ((app.model && app.model.headings) || []).filter((h) => h.s >= 0).slice(0, 2000).map((h) => ({ level: h.level, number: h.num || null, title: String(h.text || '').slice(0, 500), starred: !!h.star, file: h.f, offset: h.s })) }; } },
    { name: 'get_selection', title: 'Read the selection',
      description: 'Where the caret or the selection is on the typeset page: the file, the start and end offsets in its source, and the selected source text (empty for a caret). null when the page has no caret.',
      inputSchema: obj({}), annotations: readOnly,
      run: () => {
        flush();
        const c = app.caretNow && app.caretNow();
        if (!c || c.f == null) return { selection: null };
        if (c.ghost) return { selection: { file: c.f, start: c.p, end: c.p, text: '', newParagraph: true } };
        const t = app.files.get(c.f) || '';
        return { selection: { file: c.f, start: c.a, end: c.b, text: t.slice(c.a, Math.min(c.b, c.a + 100000)) } };
      } },
    { name: 'get_problems', title: 'Read TeX\'s problems',
      description: 'The errors and warnings of TeX\'s last run, each with its severity, message, file and line. Empty when TeX has not run yet; compile runs it.',
      inputSchema: obj({}), annotations: readOnly,
      run: () => ({ ran: !!app.lastCompile, problems: (app.texIssues || []).slice(0, 500).map((x) => ({ severity: x.sev === 'warn' ? 'warning' : x.sev, message: String(x.msg || '').slice(0, 2000), file: x.f || null, line: x.line || null })) }) },
    { name: 'get_pdf_state', title: 'Read the PDF\'s state',
      description: 'Whether TeX has made a PDF, whether it is the PDF of the source as it is now, its pages and engine, whether TeX is running, and whether the PDF pane is open.',
      inputSchema: obj({}), annotations: readOnly,
      run: () => { flush(); const c = app.lastCompile; return { hasPdf: !!app.lastPdf, current: !!app.lastPdf && app.lastPdfSig === app.textSigNow(), compiling: !!app.compiling, ok: c ? !!c.ok : null, pages: c && c.ok ? c.pages || 0 : 0, engine: (c && c.engine) || null, failed: (c && c.failed) || null, paneOpen: document.body.classList.contains('pdf-on') }; } },
    { name: 'list_commands', title: 'List the commands',
      description: 'Every command of Rikuy\'s interface, as its ribbon, keys and search box have them: id, name, tab and group, keys, whether it can run where the caret is now, the JSON schema of its arguments where it takes any, and whether it asks the person first. run_command runs one. Filter by words in the name with query.',
      inputSchema: obj({ query: { type: 'string', description: 'words of the command\'s name or id' } }), annotations: { ...readOnly, untrustedContentHint: false },
      run: ({ query } = {}) => {
        flush();
        const at = app.ribbonAt(); if (at) at.memo = {};
        const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
        return { commands: runnable().filter((c) => words.every((w) => (c.id + ' ' + c.name).toLowerCase().includes(w))).map((c) => ({ id: c.id, name: c.name, tab: c.tab || null, group: c.group || null, keys: [...(c.keys || []), ...(c.keysElsewhere || [])], enabled: enabled(app, c, at), ...(argsOf(c) ? { args: argsOf(c) } : {}), ...(asks(c.id) ? { asksFirst: true } : {}) })) };
      } },
    { name: 'run_command', title: 'Run a command',
      description: 'Runs one command of the interface by its id where the caret is, as its button does (for "bold", the selection becomes bold); one Undo takes it back. Returns ran: false when it cannot run there (list_commands says which can). Commands with a dialog take its fields in args (list_commands gives each one\'s schema), e.g. {"id": "table", "args": {"rows": 3, "cols": 4}}. A command that deletes, replaces all, shares, downloads or opens a link asks the person first.',
      inputSchema: obj({ id: { type: 'string', enum: runnable().map((c) => c.id) }, args: { type: 'object', description: 'the command\'s arguments, where it takes any' } }, ['id']),
      annotations: { ...editing, destructiveHint: true, consequentialHint: true },
      check: () => mine(),
      asks: ({ id }) => typeof id === 'string' && asks(id) && 'run "' + (command(id) ? command(id).name : id) + '"',
      run: async ({ id, args }) => {
        mine();
        if (typeof id !== 'string' || !command(id) || !command(id).run || command(id).searchable === false) throw new TypeError('No command "' + String(id).slice(0, 80) + '": list_commands lists them.');
        if (args != null && (typeof args !== 'object' || Array.isArray(args))) throw new TypeError('args must be an object.');
        const ran = await api.run(id, args || undefined);
        return { ran, command: id };
      } },
    { name: 'insert_text', title: 'Insert LaTeX',
      description: 'Inserts LaTeX source text into a file at a character offset, or at the caret on the page when offset is left out, as one edit (one Undo). Returns where it went.',
      inputSchema: obj({ text: { type: 'string', maxLength: MAX_TEXT }, file: { type: 'string' }, offset: { type: 'integer', minimum: 0 } }, ['text']),
      annotations: editing,
      run: ({ text: t, file, offset }) => {
        mine(); text(t); flush();
        let f, at;
        if (offset == null) {
          const c = app.caretNow && app.caretNow();
          if (!c || c.f == null || c.ghost) throw new Error('The page has no caret in text: give file and offset (get_selection, get_outline and get_source give offsets).');
          f = c.f; at = c.b;
        } else { f = fileOf(file); at = offset; range(f, at, at); }
        edit(f, at, at, t, true);
        return { file: f, start: at, end: at + t.length };
      } },
    { name: 'replace_range', title: 'Replace a range of the source',
      description: 'Replaces the characters from start to end (end not included) of a file\'s source with text, as one edit (one Undo); start = end inserts. expected, when given, must be the text there now, or nothing changes (another edit came first). Removing more than ' + BIG + ' characters asks the person first.',
      inputSchema: obj({ file: { type: 'string' }, start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 0 }, text: { type: 'string', maxLength: MAX_TEXT }, expected: { type: 'string' } }, ['start', 'end', 'text']),
      annotations: { ...editing, destructiveHint: true },
      asks: ({ start, end }) => Number.isInteger(start) && Number.isInteger(end) && end - start > BIG && 'replace ' + (end - start) + ' characters of the source',
      check: ({ file, start, end, text: t, expected }) => {
        mine(); text(t); flush();
        const f = fileOf(file); range(f, start, end);
        if (expected != null && app.files.get(f).slice(start, end) !== expected) throw new Error('The source from ' + start + ' to ' + end + ' is not the expected text any more: read it again with get_source.');
      },
      run: ({ file, start, end, text: t }) => {
        const f = fileOf(file);
        edit(f, start, end, t, false);
        return { file: f, start, end: start + t.length };
      } },
    { name: 'set_source', title: 'Replace the whole main file',
      description: 'Replaces the main file\'s whole source with text, as one edit (one Undo). Refused, changing nothing, when the page cannot read the text. Asks the person first.',
      inputSchema: obj({ text: { type: 'string', maxLength: MAX_TEXT } }, ['text']),
      annotations: { ...editing, destructiveHint: true, consequentialHint: true },
      asks: () => 'replace the whole document with other text',
      check: ({ text: t }) => { mine(); text(t); },
      run: async ({ text: t }) => { await api.setSource(t); return { file: app.main, length: t.length }; } },
    { name: 'insert_graph', title: 'Insert an interactive graph',
      description: 'Inserts a live graph after the caret\'s paragraph, as Insert › Interactive graph does: on the page it moves with its sliders, the PDF and Word get its picture. spec.kind is "function" (f: up to four formulas of x, such as "a sin(b x)"), "data" (data.points [[x, y], ...], data.fit "linear" and others), "curve" (curve.mode "parametric" with curve.x and curve.y of t, or "polar" with curve.r of θ; curve.t [from, to]) or "dist" (dist.family such as "normal", "exponential"; dist.mode "density" or "mean"). sliders: up to eight {name, min, max, step, value}; x and y: {min, max, label}; title: its description, the picture\'s alt text. One Undo takes it all back.',
      inputSchema: obj({ spec: { type: 'object', properties: { kind: { enum: ['function', 'data', 'curve', 'dist'] }, title: S.str, f: { type: 'array', items: S.str, maxItems: 4 }, x: { type: 'object' }, y: { type: 'object' }, sliders: { type: 'array', maxItems: 8, items: { type: 'object' } }, data: { type: 'object' }, curve: { type: 'object' }, dist: { type: 'object' }, aspect: S.num }, required: ['kind'] }, caption: { type: 'string', description: 'a caption: the graph becomes a figure with this caption and a label' } }, ['spec']),
      annotations: editing,
      run: async ({ spec, caption }) => {
        mine(); flush();
        if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new TypeError('spec must be an object.');
        if (typeof app.graphInsert !== 'function') throw new Error('This copy of Rikuy cannot insert graphs.');
        const c = app.caretNow && app.caretNow();
        if (!c) throw new Error('Put the caret on the page first (the graph goes after the caret\'s paragraph): run_command or a click places it.');
        const spot = { f: c.ghost ? app.ghost.f : c.f, p: c.ghost ? app.ghost.pos : c.b };
        await app.graphInsert(spec, typeof caption === 'string' ? caption.slice(0, 2000) : '', spot);
        return { inserted: true };
      } },
    { name: 'compile', title: 'Compile with TeX',
      description: 'Runs TeX on the project as it is now, without opening the preview, and returns whether a PDF was made, its pages and engine, and TeX\'s errors and warnings. The first run downloads TeX Live once: allow some minutes.',
      inputSchema: obj({}), annotations: { readOnlyHint: true, untrustedContentHint: true, destructiveHint: false, consequentialHint: false },
      run: async () => { const r = await api.compile(); return { ok: r.ok, engine: r.engine, pages: r.pages, pdfBytes: r.pdf ? r.pdf.length : 0, problems: r.problems.slice(0, 200) }; } }
  ];
}

// ---- asking the person ------------------------------------------------------------------------
// A modal dialog in the page; its Allow counts only for a real press (or Enter, Space) of the
// person's. One question at a time.
let asking = Promise.resolve();
export function askPerson(what, signal) {
  const go = () => new Promise((done) => {
    if (signal && signal.aborted) return done(false);
    const d = document.createElement('dialog');
    d.className = 'rk-agent-ask';
    d.setAttribute('aria-labelledby', 'rk-agent-ask-t');
    d.setAttribute('aria-describedby', 'rk-agent-ask-d');
    const h = document.createElement('h2'); h.id = 'rk-agent-ask-t'; h.textContent = 'Allow the AI agent?';
    const p = document.createElement('p'); p.id = 'rk-agent-ask-d';
    p.textContent = 'An AI agent in this browser wants to ' + String(what).slice(0, 300) + '. Undo takes back an edit; a download or a link opened stays done.';
    const row = document.createElement('div'); row.className = 'rk-agent-ask-row';
    const no = document.createElement('button'); no.type = 'button'; no.className = 'btn ghost'; no.textContent = 'Don\'t allow';
    const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'btn'; yes.textContent = 'Allow';
    row.append(no, yes);
    d.append(h, p, row);
    let over = false;
    const end = (v) => { if (over) return; over = true; clearTimeout(timer); if (signal) signal.removeEventListener('abort', abort); try { d.close(); } catch (e) { /* closed */ } d.remove(); done(v); };
    const abort = () => end(false);
    const timer = setTimeout(() => end(false), 120000);
    if (signal) signal.addEventListener('abort', abort);
    // (isTrusted: a press or key of the person's; a script's click() is not)
    yes.addEventListener('click', (e) => { if (e.isTrusted) end(true); });
    no.addEventListener('click', () => end(false));
    d.addEventListener('cancel', (e) => { e.preventDefault(); end(false); });
    document.body.append(d);
    try { d.showModal(); } catch (e) { end(false); return; }
    no.focus();
  });
  const mine = asking.then(go, go);
  asking = mine.then(() => {}, () => {});
  return mine;
}

// ---- registering ------------------------------------------------------------------------------
const say = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

// The browser's model context: document.modelContext (the draft and Chrome now) or
// navigator.modelContext (earlier drafts); null where neither is
export function modelContext() {
  if (typeof document !== 'undefined' && document.modelContext && typeof document.modelContext.registerTool === 'function') return { mc: document.modelContext, kind: 'document' };
  if (typeof navigator !== 'undefined' && navigator.modelContext && (typeof navigator.modelContext.registerTool === 'function' || typeof navigator.modelContext.provideContext === 'function')) return { mc: navigator.modelContext, kind: 'navigator' };
  return null;
}

// Registers the tools; returns a function that takes them away again, or null where the browser
// has no model context
export function installWebMcp(app) {
  const found = modelContext();
  if (!found) return null;
  const { mc, kind } = found;
  const ctl = new AbortController();
  const gone = [];
  const list = tools(app);
  const descriptors = list.map((t) => ({
    name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations,
    async execute(input, opts) {
      const signal = opts && typeof AbortSignal !== 'undefined' && opts.signal instanceof AbortSignal ? opts.signal : undefined;
      // (the earlier drafts' second argument: a client that lets the page ask its person)
      const client = opts && typeof opts.requestUserInteraction === 'function' ? opts : null;
      const out = (v, error) => (kind === 'navigator' ? { content: [{ type: 'text', text: say(v) }], ...(error ? { isError: true } : {}) } : say(v));
      try {
        // (the browser checks the input against the schema; it is checked here again, as a
        // stranger's would be: an object)
        let x = input;
        if (typeof x === 'string') { try { x = JSON.parse(x); } catch (e) { throw new TypeError('The input must be a JSON object.'); } }
        if (x == null) x = {};
        if (typeof x !== 'object' || Array.isArray(x)) throw new TypeError('The input must be an object.');
        await app.ready;
        if (t.check) t.check(x);
        const what = t.asks ? t.asks(x) : false;
        if (what) {
          const ask = () => askPerson(what, signal);
          const yes = client ? await client.requestUserInteraction(ask) : await ask();
          if (yes !== true) return out({ refused: true, reason: 'The person did not allow it.' }, true);
          // (the document may have changed while the person read the question)
          if (t.check) t.check(x);
        }
        if (signal && signal.aborted) return out({ refused: true, reason: 'Cancelled.' }, true);
        return out(await t.run(x));
      } catch (e) {
        return out({ error: String((e && e.message) || e).slice(0, 2000) }, true);
      }
    }
  }));
  if (typeof mc.registerTool === 'function') {
    for (const d of descriptors) {
      try {
        const r = mc.registerTool(d, { signal: ctl.signal });
        if (r && typeof r.then === 'function') r.catch((e) => console.warn('WebMCP: ' + d.name + ' was not registered: ' + (e && e.message)));
        else if (r && typeof r.unregister === 'function') gone.push(() => r.unregister());
      } catch (e) { console.warn('WebMCP: ' + d.name + ' was not registered: ' + e.message); }
    }
  } else {
    // (an early draft had no registerTool, only the whole set at once)
    try { mc.provideContext({ tools: descriptors }); gone.push(() => { if (typeof mc.clearContext === 'function') mc.clearContext(); }); } catch (e) { console.warn('WebMCP: the tools were not registered: ' + e.message); }
  }
  app.webmcp = { tools: list.map((t) => t.name), kind };
  return () => { ctl.abort(); for (const f of gone) { try { f(); } catch (e) { /* gone */ } } };
}
