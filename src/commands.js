// The command registry: every action a person or an agent can take in Rikuy's interface is one
// entry here, and the ribbon's tabs (src/ribbon/tabs.js), the right click menu (src/ui/menu.js),
// the search box (src/ui/search.js), the keys (src/keys.js), the insert list, llms.txt and
// dist/controls.json (build/app.mjs) are all drawn from it. Each batch of work registers its own
// commands in its own module under src/cmd/ (src/cmd/index.js imports them all); one module calls
// another's command by its id (run(app, 'bold')), never by importing it.
//
// An entry, all fields but id and name optional:
//   id        unique and stable: tests, controls.json and other modules name it
//   name      the accessible name of its control: Word's, unless Rikuy already had one (never
//             renamed: agents find controls by it, see llms.txt)
//   title     the tooltip, a longer hint; the keys are said in it ("Bold (Ctrl+B)")
//   tab       where its control sits on the ribbon: a tab id of src/ribbon/order.js ('home',
//             'insert', 'table-layout', ...), and group, a group id of that tab. No tab: no
//             ribbon control (a key, a menu item, the search box and the insert list still reach it)
//   el        the DOM id of its control (default 'rc-' + id); static: the control is written in
//             src/template.html (the bar, the status line, the Styles gallery, the downloads)
//   also      more places for the same command: [{ tab, group, el, name }] (a copy on another
//             tab: only one tab's panel is in the accessibility tree at a time, so a name is
//             never there twice)
//   icon      the inner markup of a 20 by 20 SVG (paths), or glyph, markup drawn as the icon
//             (<b>B</b>); label, the visible name beside it (none: an icon alone). Markup comes
//             from code only, never from a document (a stranger's): names and titles are text
//   kind      'button' (default), 'toggle' (aria-pressed from on()), 'split' (a main part and
//             an arrow "<name> options" that opens menu(app)), 'menu' (opens menu(app)),
//             'custom' (render(app) makes the element; sync(app, at, el) keeps it current)
//   role      the control's role when it is no button (a select is a 'combobox')
//   keys      chords as src/keys.js reads them: ['Ctrl+B']; keyScope 'page' (default: only with
//             the caret on the page) or 'app' (anywhere but a field, the source or the PDF);
//             keyRank breaks a tie between two commands on one chord (higher wins where both
//             apply); mac: { 'Ctrl+]': false } or { 'Alt+=': 'Control+=' } for a Mac's own rules
//   when      (app, at) => whether it can run where the caret is (at: app.ribbonAt(), null with
//             no caret on the page); default: at is not null. Its control is disabled otherwise.
//   on        (app, at) => pressed or not, for a toggle (null: not a toggle here)
//   run       (app, args, at) => does it; one commit through App.commit, so one undo
//   menu      { context: rank }: where the right click menu lists it ('text', 'selection',
//             'table', 'picture', 'equation', 'heading', 'list', 'link'), in rank order
//   synonyms  more words the search box finds it by (Word's names where Rikuy's differ)
//   palette   { k, d, order, t: {open, close} | act, block }: an item of the insert list (\ or
//             Ctrl+K), as the list always had them
//   keysElsewhere  chords that reach it but are caught elsewhere (the page's own editing keys):
//             said in controls.json and the search box, not bound by src/keys.js
//   static, place  the control is in src/template.html: place says where ('bar', 'status',
//             'download' for the group pinned at the ribbon's end, 'tabs'); with tab and group
//             too, it sits inside another control of that group (a tile of the Styles gallery)
//   fit       shown as the row has room (a tile of the gallery, its paging arrows)
//   whyNot    (app, at) => why it cannot run here, said by the search box
//   searchable  false: the search box leaves it out (a paging arrow)
//   only      'wide', 'narrow' or 'claude': a control shown at one width only, or only in the
//             copy inside Claude (agents, test/agent.py)
//   order     its place in its group (default: the order of registration; a copy in also may
//             give its own)

const REG = new Map();
let seq = 0;

export function register(...cmds) {
  for (const c of cmds.flat()) {
    if (!c || typeof c.id !== 'string' || !c.id) throw new Error('A command needs an id.');
    if (REG.has(c.id)) throw new Error('Two commands have the id ' + c.id + '.');
    if (typeof c.name !== 'string' || !c.name) throw new Error('The command ' + c.id + ' needs a name.');
    // (an order of its own counts within its group; else the order of registration, after them)
    REG.set(c.id, { ...c, order: c.order ?? 1000 + ++seq * 10, seq });
  }
}
// for the test page and the batches' own tests: a command taken out again
export function unregister(id) { return REG.delete(id); }

export const command = (id) => REG.get(id) || null;
export const commands = () => [...REG.values()];

// where a command's controls are: its main place and its copies, each with its element's id and name
export function places(c) {
  const out = [];
  if (c.tab) out.push({ tab: c.tab, group: c.group, el: c.el || 'rc-' + c.id, name: c.name, main: true, order: c.order });
  for (const a of c.also || []) out.push({ tab: a.tab, group: a.group, el: a.el || 'rc-' + c.id + '-' + a.tab, name: a.name || c.name, main: false, order: a.order ?? c.order });
  return out;
}
// the commands placed in one group of one tab, in their order
export function inGroup(tab, group) {
  const out = [];
  for (const c of REG.values()) for (const p of places(c)) if (p.tab === tab && p.group === group) out.push({ c, p });
  return out.sort((x, y) => x.p.order - y.p.order);
}

// whether a command can run where the caret is
export function enabled(app, c, at) {
  if (typeof c === 'string') c = REG.get(c);
  if (!c) return false;
  try { return c.when ? !!c.when(app, at) : at != null; } catch (e) { console.error(e); return false; }
}
export function pressed(app, c, at) {
  if (!c.on) return null;
  try { const v = c.on(app, at); return v == null ? null : !!v; } catch (e) { console.error(e); return null; }
}

// Runs a command by its id where the caret is: false when there is none or it cannot run there.
export function run(app, id, args, at) {
  const c = REG.get(id);
  if (!c || !c.run) return false;
  if (at === undefined) at = app.ribbonAt ? app.ribbonAt() : null;
  if (!enabled(app, c, at)) return false;
  const r = c.run(app, args, at);
  return r === undefined ? true : r;
}

// ---- the insert list ---------------------------------------------------------------------
// The items of the insert list in their order (the order the list had before it came here)
export function paletteItems() {
  return commands().filter((c) => c.palette).sort((a, b) => (a.palette.order ?? 1e9) - (b.palette.order ?? 1e9)).map((c) => ({ ...c.palette, id: c.id }));
}

// ---- the right click menu ----------------------------------------------------------------
// The commands one context lists, in rank order (a context's items come before the next one's)
export function menuItems(contexts) {
  const out = [], seen = new Set();
  for (const ctx of contexts) {
    const here = commands().filter((c) => c.menu && c.menu[ctx] != null && !seen.has(c.id)).sort((a, b) => a.menu[ctx] - b.menu[ctx]);
    if (here.length && out.length) out.push(null);
    for (const c of here) { seen.add(c.id); out.push(c); }
  }
  return out;
}

// ---- the search box --------------------------------------------------------------------
// Commands by name, synonym, insert list name and tab: the best first. Words typed in any
// order; a word may be the start of a word of the name ("bul" finds Bulleted list).
const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+]+/g, ' ').trim();
export function search(q, o = {}) {
  const words = fold(q).split(' ').filter(Boolean).slice(0, 8);
  if (!words.length) return [];
  const out = [];
  for (const c of REG.values()) {
    if (c.searchable === false || !c.run) continue;
    const names = [c.name, ...(c.synonyms || []), ...(c.palette ? [c.palette.d, c.palette.k] : []), ...(c.also || []).map((a) => a.name).filter(Boolean)];
    let best = 0;
    for (const [i, n] of names.entries()) {
      const f = fold(n), parts = f.split(' ');
      if (!words.every((w) => parts.some((p) => p.startsWith(w)) || f.includes(w))) continue;
      // the name itself before a synonym; a whole match before a start; fewer words before more
      const whole = f === words.join(' ') ? 4 : parts[0].startsWith(words[0]) ? 2 : 1;
      best = Math.max(best, whole * 10 + (i === 0 ? 5 : 0) - Math.min(4, parts.length - words.length));
    }
    if (best) out.push({ c, score: best });
  }
  return out.sort((a, b) => b.score - a.score || a.c.order - b.c.order).slice(0, o.max || 12).map((x) => x.c);
}

// ---- starting up ----------------------------------------------------------------------------
// What a module needs done once the page is there (listeners on its own elements): run by the
// ribbon's install, after the ribbon is built (src/ribbon/tabs.js)
export const installers = [];
export function onInstall(fn) { installers.push(fn); }

// ---- typing --------------------------------------------------------------------------------
// What typed text passes through before it is written (AutoCorrect will hang here): each hook
// gets (app, text, range) and returns nothing to leave it, a string to write instead, or true
// when it has done the edit itself.
export const insertTextHooks = [];
export function onInsertText(fn) { insertTextHooks.push(fn); return () => { const i = insertTextHooks.indexOf(fn); if (i >= 0) insertTextHooks.splice(i, 1); }; }

// ---- what agents read ----------------------------------------------------------------------
// Every control as plain data (build/app.mjs writes it as dist/controls.json and lists it in
// llms.txt; test/agent.py finds each by role and name)
export function describe() {
  const out = [];
  for (const c of REG.values()) {
    const base = { command: c.id, role: c.role || 'button', keys: [...(c.keys || []), ...(c.keysElsewhere || [])], title: c.title || c.name };
    if (c.only) base.only = c.only;
    if (c.fit) base.fit = true;
    const ps = places(c);
    if (c.static && c.el && !ps.length) out.push({ id: c.el, name: c.name, place: c.place || null, tab: null, group: null, ...base });
    for (const p of ps) out.push({ id: p.el, name: p.name, place: 'ribbon', tab: p.tab, group: p.group, ...base });
    if (!ps.length && !c.static) out.push({ id: null, name: c.name, place: c.menu ? 'menu' : 'search', tab: null, group: null, ...base });
  }
  return out;
}
