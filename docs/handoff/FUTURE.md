# Ready for what comes: what task 71 made ready, and what to adopt next

Written 20 November 2026 (task 71, PR 92). Browser support is as caniuse and web.dev gave it that
day; check again before adopting anything below.

## Made ready

| what | where | what it gives |
|---|---|---|
| Agent tools | `src/agent.js` | Ten tools with rich schemas (get_document, get_source, select, list_commands, run_command, edit_source, set_source, insert_graph, compile, undo), one table for three surfaces: WebMCP, `window.rikuy.api.callTool` and its named methods, and llms.txt. Every edit says what changed and how many Undo steps take it back; deleting, sharing, downloading, opening links and replacing the whole text ask the person. |
| WebMCP | `src/webmcp.js` | The tools registered with `document.modelContext.registerTool` (the W3C draft and Chrome's imperative API), or `navigator.modelContext` (the earlier drafts: `unregister`, `requestUserInteraction`, MCP content results, `provideContext`). Nothing is built where neither exists. Chrome has it as an origin trial (blink-dev "Intent to Experiment: WebMCP", extended); to try it on the hosted site, register the origin trial for rikuy.rackebrandt.pe and add its token as an `Origin-Trial` header in `build/app.mjs` `headers()`. |
| The document as data | `src/agent.js` `documentModel` | Sections, formulas (LaTeX, numbers, labels), figures, graphs (formulas, sliders), citations, the bibliography, labels, cross references, footnotes, each with its place in the source. The same function serves the local MCP server below. |
| The page in the accessibility tree | `src/a11y.js` | Formulas as math named by their LaTeX, floats as figures named by their captions, citations and cross references as described links, headings with their numbers. |
| Design tokens | `src/tokens.css` | Colour (light and dark), spacing (the 4 px scale), radii, type, elevation and motion as `--rk-*` custom properties, bundled first. Today only motion reads them; the list below says where app.css switches. |
| Motion | `src/motion.js`, `src/motion.css`, `src/caret.js` | Fluent 2's durations and curves from the tokens, transform and opacity only, three modes (full, reduced, off). |
| View Transitions | `src/motion.js` `crossFade` | The Page, LaTeX and PDF views cross fade where `document.startViewTransition` exists (Chrome 111, Safari 18, Firefox 144: Baseline newly available since 14 October 2025); a plain switch elsewhere. |

## Where app.css switches to the tokens

Items 1 and 6 are done (commit 322527b, over PRs 79, 83 and 84; 6's highlights and busy
indicators after PR 92's review): every element's
computed colours, shadow, caret colour and transitions were the same before and after, in light,
dark, both forced themes and Dark page. What PR 86 and PR 90 bring follows the same way once they
merge; items 2 to 5 change pixels and want the UX review's eye (the interface rules' C5 and C9,
which PR 90 brings as `docs/handoff/UI-PRINCIPLES.md`), checked by `test/tabs.py`, `test/ux.py`
and a screenshot diff of every tab in light, dark and forced colours.

1. The root's short names become aliases of the tokens, in app.css's `:root` and in both dark
   blocks: `--desk: var(--rk-color-desk)`, `--desk-2: var(--rk-color-desk-2)`, `--chrome`,
   `--panel`, `--ribbon`, `--tabrow` the same; `--line: var(--rk-color-stroke)`, `--ink-ui:
   var(--rk-color-fg)`, `--mute: var(--rk-color-fg-2)`, `--blue: var(--rk-color-brand)`,
   `--blue-wash: var(--rk-color-brand-wash)`, `--blue-ink: var(--rk-color-brand-fg)`, `--title:
   var(--rk-color-title)`, `--ctx: var(--rk-color-context)`, `--warn: var(--rk-color-danger)`,
   `--ins-ui`, `--del-ui`, `--paper`, `--ink`, `--shadow: var(--rk-shadow-8)`, `--font-ui`,
   `--font-mono`. The dark values then live in tokens.css alone and app.css's two dark blocks go.
   (`var(--blue)` is used 105 times and `var(--line)` 126: the aliases keep every use.)
2. Radii (rule C9: 4 for controls, 8 for surfaces): `border-radius: 6px` (34 uses: `.btn`,
   `.rb-tab`'s 6px 6px 0 0, `.rb-coll`, the fields) and `5px` (16), `3px` (7), `2px` (18) become
   `var(--rk-radius-control)`; `10px` (`.pop`, `.fr`, `.stp`) and `8px` (14) become
   `var(--rk-radius-surface)`. This one changes pixels: review it with the UX audit's C9 check.
3. Shadows: `.pop` `0 12px 40px` is `--rk-shadow-28`; `.stp` `0 10px 32px` `--rk-shadow-16`;
   `.fr` `0 14px 44px` and `.ask` `0 16px 48px` `--rk-shadow-28` and `--rk-shadow-64`.
4. Type (rule C5): `font: 600 12px var(--font-ui)` (8 uses), `500 12.5px` (4) and `500 13px` (4)
   become `var(--rk-type-caption)` or `var(--rk-type-body)` as their kind is; 12.5 px is not on
   the ramp and goes to 12 or 14.
5. Colours written out: 115 distinct hex values in app.css (259 uses) and 56 `rgba()`. Most are
   the page's own (paper, ink, the LaTeX paragraph's #F4F6F8 and #1F2933, the caret's #1E6BAA:
   the last is `--rk-color-caret` now) and stay; the chrome's go to tokens one by one.
6. Transitions and animations of app.css: `.nv-tog svg` and `.fold-tg svg` (.12s), `.w-src`,
   `.w-edit` (.12s), `.focus-x` (.15s) are set to the tokens by motion.css today; write them
   with the tokens in app.css and drop motion.css's overrides. `.pdf-prog span` animated its
   width (a size, rule M3): motion.css stops it; make the bar a `scaleX` transform. Done: where
   something landed is `flash()` of motion.js (a wash beside the text, held `--rk-hold`, faded
   in the slow duration, opacity only), and the busy pulse and sweep (`--rk-loop`) and SyncTeX's
   mark (`--rk-hold`, then slow) are in motion.css, still with Animations off and reduced motion.

## What to adopt next, and when

| what | support today | adopt when | for |
|---|---|---|---|
| Popover API (`popover`, `popovertarget`) | Baseline since April 2024 (Chrome 114, Firefox 125, Safari 17) | Now, with the next change to `App.makePop` | Menus and flyouts in the top layer with light dismiss from the browser, no `z-index`; `closePop`'s outside press and Escape become the browser's. Keep `role=menu` and the focus rules (N7). |
| CSS anchor positioning (`anchor-name`, `position-anchor`, `position-try`) | Partial in Chrome and Edge 125+, Firefox 147+, full in Safari 27 (88% of users, mostly partial) | When Chrome and Firefox are full, or now behind `@supports` | `positionPop`'s measuring and flipping done by CSS, menus that follow their anchor while it scrolls; motion's transform origin from the anchor for free. |
| `@starting-style` and `transition-behavior: allow-discrete` | Baseline since August 2024 (Chrome 117, Safari 17.5, Firefox 129) | With the Popover API | Entering and leaving animations of popovers and `display:none` panes in CSS alone: motion.js's inert copies for leaving surfaces go. |
| Scroll driven animations (`animation-timeline: scroll()`) | Chrome 115, Safari 26; Firefox behind a flag | When Firefox ships it | The status bar's edge fades and a sticky ribbon shadow without scroll listeners. Nothing needs it now. |
| File System Access (`showDirectoryPicker`) | Chromium only; the origin private file system (OPFS) everywhere | Now for Chromium, behind feature detection; OPFS now for large projects | Open a local folder as the project and save to it (the person's own .tex files, git included); OPFS in place of IndexedDB for projects of many megabytes. |
| WebGPU | Chrome 113 (desktop), Safari 26, Firefox 141 (Windows) | When pdf.js gains a WebGPU canvas, or for live graphs of many points | The PDF pane's pages drawn on the GPU; interactive graphs with thousands of points at 60 fps. Canvas 2D is fast enough today. |
| A CRDT for live coauthoring (Yjs or Automerge) | Libraries; needs a relay (a Cloudflare Durable Object, or WebRTC with a signalling server) | When two people at once in one document is asked for | Today edits travel by links and merge three ways (src/share.js); a CRDT of the source text, with the page and the minimal patches unchanged, would make it live. The relay is the first server Rikuy would run that sees documents: end to end encryption first. |
| WebMCP from the origin trial to the platform | Chrome origin trial; a W3C Community Group draft | When it ships unflagged | Nothing to change in Rikuy: the tools are registered where `document.modelContext` exists. Then add `exposedTo` only if a trusted embedder (the claude.ai copy) asks for it. |

## A local MCP server: Rikuy's model for Claude Code and Claude Desktop

An agent in a terminal or a desktop app edits .tex files on disk, without a browser. A small
node package could give it Rikuy's understanding of a LaTeX project: the document as data, edits
as the smallest patches, the commands of the ribbon. Plan:

**What it is.** `@rikuy/mcp`, a stdio MCP server (the MCP TypeScript SDK, pinned by hash as every
download is) started by `claude mcp add rikuy -- npx @rikuy/mcp /path/to/paper` or in Claude
Desktop's config. One project root per server; every path confined to it with `cleanPath` (the
same function the page uses).

**Its tools,** with the names and schemas of `src/agent.js` so an agent learns one set:
`get_document`, `get_source`, `edit_source` (with `expected`), `list_commands`, `run_command`
(the commands whose edits are pure functions of the source, below), `insert_graph` (the graph's
file and picture: the picture needs a canvas, `@napi-rs/canvas` or skia), `compile`, `undo`.
`select` becomes an argument: commands take `{ file, start, end }` where the page has a caret.

**What it reuses as it is:** `src/model.js` (buildModel: the document as data, already run under
node by the build and the tests), `src/agent.js` `documentModel` and `changesBetween`,
`src/parser.js` and the native core, the string edit modules that the commands call (`table.js`,
`wrap.js`, `blockenv.js`, `lists.js`, `parasrc.js`, `preamble.js`, `refsrc.js`, `pagesrc.js`,
`styles.js`, `looks.js`, `outline.js`, `bib.js`, `picture.js`): each is an edit on a string,
tested under node.

**What it needs first** (the work, in order):
1. Commands split into a plan and a commit: today `run(app, args, at)` reads the caret from the
   page and calls `App.commit`. A field `edits(src, at, args) => [{ f, s, e, t }]` beside `run`,
   filled module by module (most `run`s already compute exactly this and pass it to commit), lets
   the server and the page share each command. `at` from a source position needs the model's
   lookup of the block at an offset (`model.blocks` holds every block's range).
2. Writing files safely: read with the encoding and BOM the file had (`src/store.js`
   `decodeText`, `encodeText`), refuse when the file changed on disk since it was read (its
   mtime and hash, as `expected` refuses), write to a temporary file and rename.
3. Undo: a journal in `.rikuy/undo.jsonl` of each tool call's edits (file, start, removed,
   inserted), which `undo` replays backwards after checking each file is as the call left it.
4. Compile: the system's TeX Live where `latexmk` is on the PATH (shell escape off unless the
   person's config allows it), else BusyTeX's WebAssembly run in a `worker_threads` worker
   (`tex/engine.js` with node's fs in place of the packs' fetch: the largest piece of work).
5. Security: read only by default with `--write` to edit; no tool runs a command of the
   document; paths confined; the document's text returned as untrusted (MCP has no hint for it:
   say so in each description, as the WebMCP tools do).

**A first sketch** (the read side works with what exists today):

```js
// bin/rikuy-mcp.mjs: a stdio MCP server over one LaTeX project on disk
import fs from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildModel } from 'rikuy/src/model.js';
import { TOOLS, documentModel, changesBetween } from 'rikuy/src/agent.js';
import { cleanPath } from 'rikuy/src/share.js';

const root = path.resolve(process.argv[2] || '.');
const write = process.argv.includes('--write');
async function project() {
  const files = new Map();
  for (const e of await fs.readdir(root, { recursive: true, withFileTypes: true })) {
    if (!e.isFile() || !/\.(tex|bib|sty|cls|csv)$/i.test(e.name)) continue;
    const name = cleanPath(path.relative(root, path.join(e.parentPath, e.name)));
    if (name) files.set(name, await fs.readFile(path.join(root, name), 'utf8'));
  }
  const main = [...files.keys()].find((f) => /\\documentclass/.test(files.get(f))) || 'main.tex';
  return { files, main };
}
const spec = (n) => TOOLS.find((t) => t.name === n);
const server = new McpServer({ name: 'rikuy', version: '0.1.0' });
server.registerTool('get_document', { description: spec('get_document').description, inputSchema: {} }, async () => {
  const { files, main } = await project();
  const doc = documentModel(buildModel({ files, main }), files, main);
  return { content: [{ type: 'text', text: JSON.stringify(doc) }] };
});
server.registerTool('edit_source', { description: spec('edit_source').description, inputSchema: { /* zod of spec('edit_source').inputSchema */ } }, async (x) => {
  if (!write) return { isError: true, content: [{ type: 'text', text: 'Read only: start the server with --write to edit.' }] };
  const { files, main } = await project();
  const f = cleanPath(x.file || main), t = files.get(f);
  if (t == null || x.start < 0 || x.end > t.length || (x.expected != null && t.slice(x.start, x.end) !== x.expected))
    return { isError: true, content: [{ type: 'text', text: 'Not the text expected there: read it again with get_source.' }] };
  const next = t.slice(0, x.start) + x.text + t.slice(x.end);
  buildModel({ files: new Map([...files, [f, next]]), main });   // throws, writing nothing, on a source the model cannot read
  const tmp = path.join(root, f + '.rikuy-tmp');
  await fs.writeFile(tmp, next); await fs.rename(tmp, path.join(root, f));
  return { content: [{ type: 'text', text: JSON.stringify({ changed: changesBetween(new Map([[f, t]]), new Map([[f, next]])) }) }] };
});
await server.connect(new StdioServerTransport());
```

`src/model.js` imports nothing of the page (the build runs it under node), so `get_document`
works today; the package needs `package.json` `exports` for `src/` and a test that runs the
server over `sample/` with the SDK's in-memory transport. Size of the first version (read,
edit_source, undo, compile with the system's TeX): about a week; `run_command` grows with step 1.
