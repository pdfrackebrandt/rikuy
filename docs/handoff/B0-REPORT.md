# B0 (branch ribbon-tabs, commit 59b0131): what every batch must know

## The registry: src/commands.js (its header documents every field)
register({...}) adds one command:
- id, name (accessible name), title
- tab, group (ids from src/ribbon/order.js), el (DOM id, default rc-<id>), order, also: [{tab, group, el, name, order}] for copies on other tabs
- icon (inner SVG paths), glyph, label
- kind: button | toggle (uses on) | split (menuItems(app, at) for the "<name> options" arrow) | menu | custom (render, sync(app, at)); role for non-buttons
- keys, keyScope ('page' default | 'app'), keyRank, mac: {'Alt+=': 'Control+=' | false}, keysElsewhere (shown, not bound)
- when(app, at) (default: caret on the page), on(app, at), run(app, args, at), whyNot
- menu: {context: rank} for the right click menu; synonyms; searchable
- palette: {k, d, order, t: {open, close} | act, block} for the insert list
- static with place, fit, only ('wide'|'narrow'|'claude'), resync: false
Calling other commands: run(app, id, args) from the registry, or app.runCommand(id, args) (also refreshes the ribbon). Never import another batch's module.
Per caret caching: at.memo (see listOf in src/cmd/lists.js).
Typing hooks (AutoCorrect): onInsertText(fn); fn(app, text, range) returns a replacement string, true if it handled the edit, or nothing.
onInstall(fn) runs once the ribbon is built.
Markup rule: html, icon, glyph come from code only, never from a document; names and titles are always set as text.

## Each batch edits only its own src/cmd/<area>.js
Each module calls register(...) and exports `methods`, which src/cmd/index.js joins onto App's prototype. Existing commands already moved to owners:
- B1 font.js: Bold, Italic, Underline, Typewriter
- B2 para.js: empty stub
- B3 lists.js: list commands, listAt, toggleList
- B4 styles.js: gallery, style tiles, style list, blockStyle, setBlockStyle
- B5 find.js: Outline and problems, Navigation pane
- B6 page.js: empty stub
- B7 table.js: Table, Insert below, insertTable
- B8 picture.js: Picture
- B9 refs.js: Footnote, Citation, Link, Cross-reference, Equation reference, Label
- B10 review.js: New comment / Comment, Reviewing pane
- B11 insert.js: the insert list (Ctrl+K), theorem items, Cut, Copy
- B12 file.js, view.js, help.js: downloads, Open, Share, New document, Load the sample, Preview, Source, zoom, 100%, Page width, the Help tab
- B13 equation.js: Formula, Equation

## Groups and tabs: src/ribbon/order.js
Every tab and group from GAP §2 is declared with a fold rank. A group shows once a command is placed in it; a tab shows once one of its groups shows. CONTEXTS decides contextual tabs: table (at.cell), picture (app.armed.kind === 'img'), equation (math popover open), headfoot (false until B6 refines it).

## Kit: src/ui/kit.js
- openMenu(app, elOrRect, items, {label, cls, focus, onClose}); item {name, title, keys, icon, html, swatch, checked, radio, disabled, run}; null = separator
- openGallery(app, at, items, {label, columns})
- splitButton(app, mainBtn, name, () => items)
- colorPicker(app, at, {label, auto, theme: [{name, hex}], current, onPick}); onPick gets {name} | {html} | null; helpers colorNeeds(name) ('dvipsnames' | null), colorArg
- numberField({id, name, value: {value, unit}, units, step, min, max, onChange}); helpers parseLength, convert, formatLength
- dialog(app, {title, anchor, rect, cls, onClose}): role dialog, named by title, Close, Escape

## Pure edit helpers (return edits [{s, e, t}])
- src/preamble.js: usePackages/usePackage (merges options; \PassOptionsToPackage for multi package lines), packageOptions, kvEdits/parseKV, classOptions(src, changes, drop), setClass, setPackageKeys(src, 'geometry', 'geometry', {...}), defines, defineOnce. Every scan bounded.
- src/wrap.js: GROUPS, defineGroup, wrapEdits, unwrapEdits, rewrapEdits, enclosing, splitText, clearText, toggleEdits, LEAD
- src/blockenv.js: envWords, wrapBlockEdits, unwrapBlockEdits, rewrapBlockEdits, declAtStart, blankPads

## Tests
roundtrip(page, doc, select, command, expected, forms=(), off=None, label=None, off_command=None) in test/browser.py. select: a word, (word, k), (from, to) or a function. Checks one step write, undo to the same bytes, the control's state read back, each hand written form, turning it off.
Tests can register temporary commands via rikuy.cmds.register / unregister then rikuy.ribbonBuild(); the kit at rikuy.kit.
Suites and counts at B0: npm test green (preamble 13, wrap 15, blockenv 9, keys 11, commands 10, kit 3 groups); tabs.py 84; agent.py 132; ribbon.py 265; browser.py 189; scripts.py 302; word.py 110; files.py 68; wordmath.py 83; widgets.py 60; offline.py 54; share.py 46; git.py 44; history.py 39; features.py 36; paste.py 25; mathfield.py 19; launch.py 18; eqextras.py 18; frontier.py 13; stress.py 9; deploy_check 43.

## Departures from GAP.md
- Empty tabs are hidden (File, Design, Layout appear when B12, B4, B6 add commands).
- Home's groups in Word's order (Font, Paragraph, Styles, Insert).
- The ribbon's "Review" tab and the side panel's "Review" tab share a name; agents find the panel's inside its tablist "Panel".
- Ctrl+B, I, U, M, K, Ctrl+Shift+E bound through the registry with exact modifiers; a key does nothing where its button is disabled. Ctrl+Alt+F = Footnote.
- Hand written {\bfseries …}, {\bf …} now show pressed and come off exactly.
- Help tab's group is named "Help and support".
- The right click menu replaces the browser's on the page; a second right click or Shift+right click gives the browser's.
- dist/controls.json written in every build, not kept by the service worker.

## Gotchas
- Give an explicit order when adding to a group someone else uses.
- A command run from a menu that needs the page focused calls app.ribbonBack() first (menus already do).
- Mac Option+key chords match by key position.
- Anything reading a stranger's text stays bounded; reuse the helpers, no backtracking patterns.
- Key changes still to make and announce in llms-full.txt and Help: Ctrl+K → Link (B9, keyRank: 1); Ctrl+Shift+E → Track Changes (B10); Ctrl+Enter → page break outside tables (B6/B7; still in App.onKeyDown); Ctrl+P → Print view (B12).

## After B0's review (e534629, merged into main 8035d30): additions only
- hasPackage(src, name, end, others) and packageOptions(src, name, end, others): optional 4th argument; usePackages accepts o.others.
- App.packageEdits(names, o) returns [{f, s, e, t}] for the main file: THE way to add packages (handles packages loaded in \input'd preamble files and the project's .sty/.cls with \PassOptionsToPackage). App.preambleOthers() lists those files (two levels, 20 files).
- wrap.js: standsFree(src, W); parseAt(src, s, want, ends) optional 4th arg. A `{\decl …}` group loses its braces only where it stands free; elsewhere only \decl goes. Clear All handles at most 2000 wrappers per selection; a group over 4000 chars keeps its braces.
- blockenv.js envWords(src, s, e, names, nargs, opts): optional 6th arg = set of environments that take an [option] (default OPT_ENVS); pass yours if you add such an environment.
- commands.js joinMethods(target, sources) throws on a method name two modules (or a module and App) both add: name methods distinctly.
- Registry field keysQuiet: bound but not listed (Ctrl+Shift+B/I/U/M act again; Ctrl+Shift+K reserved for B1 small caps).
- New App methods: peekRibbon(on), zoomPageWidth().
- insertText hooks (AutoCorrect) run after the LaTeX paragraph and raw checks.
- Below 861 px the three downloads become one Download button when the row has no room; tab row 28 px; groups are role=group named after the group.
- No DOM access at module load in src/cmd/ (build/app.mjs imports them under node).
- Suites after the fix: tabs.py 104, ribbon.py 267, agent.py 132, browser.py 189, word.py 110.

## After B5 merged (main 49e49eb)
- ribbonFit follows docs/handoff/FOLD-SPEC.md with two order changes: button names drop before any group folds; the style list is a measured step at any width; groups fold from 521 px, rank 1 first then lowest rank, rightmost on ties, each into a 24 px icon button named after the group; a pass tries each step back. tabs.py sweeps every tab 390 to 1920 px in 10 px steps with extra test commands and asserts monotonic control counts: your new groups and tabs must pass it (give groups sensible fold ranks in order.js).
- App.escapeAt(…) (from B5) is the typing escape; reuse it for any text you write from a field.
- keys.js chordText writes arrow keys as arrows for menus and tooltips.
- Suites on main: tabs.py 116, ribbon.py 268, agent.py 138, browser.py 189, find.py 76, outline.py 59.

## After Tables (B7) and Page setup (B6) merged (main a941302)
- src/table.js is the one table parser (cells as source ranges); Ctrl+Enter in a cell = table-row-below (keyRank 1); outside tables Ctrl+Enter = page break (B6), Ctrl+Shift+Enter = column break, Ctrl+P = Print PDF.
- src/pagesrc.js reads the page set up; the PDF's sheet as TeX decides it (NO_MEDIA_CLASSES/PACKAGES; after a compile the page takes the PDF's sheet); geometry `pass` keeps the class layout.
- The model reads a longtable inside a settings group; `\small` before a table is a table setting.
- tex.yml installs poppler-utils (pdftotext -bbox) for page.py.
- Suites on main: page.py 139, table.py 161, tabs 116, ribbon 268, agent 138, browser 189.
