# Rikuy against Word 365 and WordCraft: the gap list

Rikuy `main` at `c1bb3d8` (0.25.0, after pull request 13, the Styles gallery), 2026-11-13.
WordCraft read (never run) at `/home/claude/ext/wordcraft`. Word = Word for Microsoft 365 desktop
on Windows, from knowledge.

Counts (section 1): **BUILD 229, ALREADY BETTER 37, SKIP 48**, 314 rows. BUILD by priority:
34 at 1, 86 at 2, 109 at 3.

## 0. How to read it, and the rules every BUILD row obeys

**Paths.** Rikuy from its repository root. WordCraft: `RB/` = `crates/ui-egui/src/ribbon/`,
`UI/` = `crates/ui-egui/src/`, `DG/` = `crates/ui-egui/src/dialogs/`, `EN/` =
`crates/engine/src/cmd/`, `DOC/` = `crates/doc/src/`.

**Columns.** Rikuy now: **Y**; **partial** (what is missing); **N**. "renders" means the page draws
the construct when it is in the source (`src/model.js`); "no control" means nothing in the UI
writes it. Effort: **S** up to one agent day, **M** one to three, **L** more. Priority: **1** core
everyday Word use, **2** regular, **3** occasional. ALREADY BETTER and SKIP rows carry no effort.

**R, the round trip rule.** A feature is done only when all of these hold, each with a test:

1. **Minimal write.** The control commits one edit set through `App.commit`; the source after it
   equals the expected LaTeX string; nothing else in the file moves.
2. **Undo** gives the source back byte for byte (one undo step per action).
3. **Read back.** Rebuilt from that source, the page draws the effect and the control shows the
   state (pressed, checked, the value in a box).
4. **Hand written forms.** The same construct written by hand in its common forms (listed per
   feature: `{\bfseries x}`, `\textbf{x}`, `\bf x`; `\centering` in a group and `center`) is
   recognised: the control shows it, and turning it off removes exactly that wrapper.
5. **Off restores.** Turning a feature off that Rikuy turned on restores the earlier bytes;
   preamble lines it added stay (other text may use them) unless the same commit added them.
6. **TeX agrees.** Where `dist/tex` exists (CI's TeX job) the PDF shows the effect
   (`pdftotext`, pypdf boxes or pixels), and the corpus model run (716 documents) is unchanged.
7. **Word agrees.** Download Word maps it to Word's own formatting (`src/wordast.js`), and opening
   that `.docx` gives the same LaTeX back (`src/wordjobs.js`) or a documented approximation.
8. **Agents find it.** One accessible name at every width; `test/agent.py` reaches it by role and
   name; `llms.txt` lists it.

**Preamble discipline.** One helper (batch B0's `src/preamble.js`, generalising `ensurePackages`
at `src/app.js:2348` and the `graphicx` lines of `figureEdits`, `src/app.js:4696`) adds a
`\usepackage` once, after the last one; merges options into an existing line
(`\usepackage[a4paper]{geometry}` becomes `\usepackage[a4paper,margin=2cm]{geometry}`); edits
class options in place; never duplicates; reads `\RequirePackage` and comma lists; ignores
commented lines. Packages are the ones Word import already writes, so both paths agree:
`\usepackage[normalem]{ulem}` for `\uline` and `\sout` (`src/wordjobs.js:1005`), `xcolor`,
`geometry` in cm (`src/wordjobs.js:856`), `\usepackage[hidelinks]{hyperref}`, natbib authoryear.
Every package named below is in the tree's sets (`tex/build_tree.py:95`: latex-extra,
latex-recommended, pictures, science, humanities, publishers, plus `FONT_PICKS`); fonts outside
`FONT_PICKS` and fonts-recommended (Libertinus, for one) are not, so the font box lists only what
the tree has.

## 1. The table

### File (Backstage)

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| F1 | New blank document | Y | Y EN/file.rs:90 | Y `b-new` (`src/template.html:127`) | `\documentclass{article}` skeleton | ALREADY BETTER: compiles anywhere, no template file | – | – |
| F2 | New from template (letter, report, CV, thesis, exam, slides) | Y | Y UI/backstage.rs:419, EN/file.rs:90 | N (only Load the sample) | class skeletons: `article`, `report`, `book`, `letter`, `scrartcl`, `beamer`, `exam`, `moderncv` | BUILD | M | 2 |
| F3 | Open (Ctrl+O), drop a file | Y | Y EN/file.rs:91 | Y `b-open`, `src/app.js:1170` | – | ALREADY BETTER: one Open for .tex, .bib, Overleaf .zip and .docx | – | – |
| F4 | Recent documents | Y | Y UI/backstage.rs:732 | partial: other documents only through Review › Versions (`src/app.js:4142`) | – | BUILD (list of kept projects: open, rename, delete) | S | 2 |
| F5 | Info › Properties (title, author, subject, keywords) | Y | Y UI/backstage.rs:785 | partial: title, author, date edited on the page; no subject or keywords | `\title{}`, `\author{}`, `\date{}`, `\hypersetup{pdftitle={..},pdfauthor={..},pdfsubject={..},pdfkeywords={..}}` | BUILD | S | 3 |
| F6 | Info › Protect (password, mark as final, restrict) | Y | Y UI/backstage.rs:832, EN/protect.rs:24 | N | – | SKIP: a .tex is plain text; no LaTeX meaning | – | – |
| F7 | Info › Inspect document (remove comments, personal data) | Y | partial EN/file.rs:163 | partial: resolve threads one by one (`src/collab.js:398`) | removes every `% comment (…)`/`% reply (…)` line | BUILD | S | 3 |
| F8 | Check accessibility | Y | Y RB/review.rs:24 | N | flags `\includegraphics` without `alt=`, skipped heading levels, tables without a header row, no `\title` or language; offers `\DocumentMetadata{lang=en,pdfstandard=ua-2,tagging=on}` (LaTeX tagging) | BUILD | M | 3 |
| F9 | Version history | Y | N | Y Review › Versions (`src/app.js:3510`, `3603`) | – | ALREADY BETTER: automatic versions, compare with any, git in the page | – | – |
| F10 | AutoSave, recover unsaved | Y (OneDrive) | Y UI/chrome.rs:350 | Y IndexedDB at every edit (`src/app.js:4736`), tabs merged | – | ALREADY BETTER: no account, offline, another tab's text kept as a version | – | – |
| F11 | Save (Ctrl+S) | Y | Y EN/file.rs:95 | Y downloads .tex/.zip (`src/app.js:1169`) | – | ALREADY BETTER: always saved; Ctrl+S hands over the plain source | – | – |
| F12 | Save As / Export: ODT, RTF, HTML, Markdown, TXT, EPUB | Y | Y UI/print_page.rs:460 | partial: PDF, Word, LaTeX only | pandoc (already in the Word worker) writes them from `buildWordDoc`'s AST | BUILD (Export menu; hosted build) | S | 3 |
| F13 | Print (Ctrl+P) with preview; pages, copies, printer | Y | Y EN/file.rs:137 | partial: Ctrl+P opens Preview (`src/app.js:1171`); print only as a fallback (`src/app.js:5290`) | prints TeX's PDF (pdf.js print); the browser's dialog does printer, pages, copies | BUILD (Print view: preview + Print) | S | 1 |
| F14 | Print with markup (comments, changes) | Y | Y UI/backstage.rs:887 | N | a print copy only: `changes` package (`\added`, `\deleted`, `\replaced`) and comments as `\todo{}` (todonotes) | BUILD | M | 3 |
| F15 | Share (invite, link, email) | Y | N | Y Share (`src/collab.js:87`) | – | ALREADY BETTER: the document travels in the link, no account; edits come back by three way merge | – | – |
| F16 | Export to PDF | Y | Y EN/file.rs:105 | Y Download PDF | – | ALREADY BETTER: TeX Live's own PDF, SyncTeX both ways | – | – |
| F17 | Close | Y | Y EN/file.rs:143 | N | – | SKIP: a browser tab; New document replaces | – | – |
| F18 | Account, Office services | Y | partial UI/chrome.rs:390 | N | – | SKIP: no accounts by design | – | – |
| F19 | Options › user name and initials | Y | Y EN/file.rs:156 | partial: asked at the first comment (`src/collab.js:32`) | the name in `% comment (Name)` | BUILD (Options dialog) | S | 3 |
| F20 | Options › Proofing (AutoCorrect, spell as you type, language) | Y | Y UI/options.rs:340 | N | – | BUILD (the switches for A1–A13, RV1) | S | 2 |
| F21 | Options › Customize ribbon, Quick Access Toolbar, keyboard | Y | Y UI/chrome.rs:215, DG/dialogs_ribbon.rs, DG/dialogs_keyboard.rs | N | – | SKIP: Word plumbing; the command search (HL2) reaches every command | – | – |
| F22 | Set as default / Normal template | Y | Y RB/design.rs:83 | N | a preamble kept in the browser for new documents | BUILD | S | 3 |
| F23 | Options › default engine, shell escape, page | – | – | partial: engine and shell escape in the PDF pane | `% !TeX program = lualatex` | ALREADY BETTER: per project, and read from the file | – | – |

### Quick Access Toolbar and window

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| Q1 | Undo, Redo (Ctrl+Z, Ctrl+Y) | Y | Y EN/edit.rs:42,59 | Y `b-undo`, `b-redo` (`src/app.js:1018`) | – | ALREADY BETTER: undo gives the source back byte for byte | – | – |
| Q2 | Undo history list (undo n actions) | Y | Y UI/chrome.rs:136 | N | – | BUILD | S | 3 |
| Q3 | Repeat last action (F4, Ctrl+Y with nothing to redo) | Y | N | N | the same edit at the new place | BUILD | S | 3 |
| Q5 | Collapse the ribbon (Ctrl+F1), display options | Y | Y UI/chrome.rs:692 | N | – | BUILD | S | 3 |
| Q6 | KeyTips (Alt, then letters) | Y | Y UI/keytips.rs | N | – | BUILD (F10 or Alt alone where the browser lets go; installed app) | M | 3 |

### Home

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| H1 | Paste (Ctrl+V) keeping formatting | Y | Y RB/home.rs:33 | Y `src/paste.js` | `\textbf`, `\emph`, lists, `tabular`, math | ALREADY BETTER: math from KaTeX/MathJax pages and chat assistants arrives as LaTeX math | – | – |
| H2 | Paste options: keep source, merge, text only; Paste Special | Y | Y RB/home.rs:34-37 | partial: Ctrl+Shift+V text only (`src/app.js:1168`); no menu | text only: escaped text; "as LaTeX source": unescaped | BUILD (Paste menu with "As LaTeX source") | S | 2 |
| H3 | Cut, Copy buttons | Y | Y RB/home.rs:40-41 | partial: keys only; Copy gives the LaTeX (`src/app.js:1930`) | – | BUILD (a Paste button needs clipboard-read permission) | S | 2 |
| H4 | Format Painter (once; double click sticky); Ctrl+Shift+C | Y | Y RB/home.rs:7, EN/edit.rs:166 | N | copies the wrappers around the caret (`\textbf{\textcolor{red}{…}}`) or the block's style and writes the same commands around the target | BUILD | M | 2 |
| H5 | Office Clipboard pane | Y | Y UI/panes/side.rs:2 | N | – | SKIP: a page cannot read past clipboard items; the OS keeps a history (Win+V) | – | – |
| H6 | Font of the document | Y | Y RB/home.rs:54 | partial: renders times, palatino, helvet packages (`src/model.js:390`); no control | pdfLaTeX: `\usepackage{lmodern}`, `{newtxtext,newtxmath}`, `{newpxtext,newpxmath}`, `{mathptmx}`, `{tgheros}` with `\renewcommand{\familydefault}{\sfdefault}`, `{XCharter}`, `{kpfonts}`; XeLaTeX/LuaLaTeX: `\usepackage{fontspec}\setmainfont{TeX Gyre Termes}` (tree fonts only) | BUILD (font box: the document's font; curated list) | M | 1 |
| H7 | Font of a selection | Y | Y RB/home.rs:54 | partial: renders `\textsf`, `\texttt`, `\textrm` (`src/model.js:13`); bubble has typewriter | `\textsf{}`, `\texttt{}`, `\textrm{}`; another family: `{\fontfamily{ppl}\selectfont …}` | BUILD (Serif, Sans, Mono at the top of the font box when text is selected) | S | 2 |
| H8 | Font size of the document | Y | Y RB/home.rs:76 | partial: reads 10, 11, 12pt (`src/model.js:330`) | class option `[11pt]`; 8, 9, 14 to 20pt: `extarticle` or KOMA `fontsize=13pt` | BUILD | S | 1 |
| H9 | Font size of a selection | Y | Y RB/home.rs:83 | partial: renders `\tiny`…`\Huge` (`src/model.js:22`) | `{\large …}` (the box shows each name with the points it gives at the base size); any size: `{\fontsize{14}{17}\selectfont …}` | BUILD | M | 1 |
| H10 | Grow/Shrink font (Ctrl+Shift+> <, Ctrl+] [) | Y | Y RB/home.rs:89-90, EN/format.rs:102-105 | N | the next step of `\tiny…\Huge`; at `\normalsize` the switch goes | BUILD | S | 2 |
| H11 | Change Case (Shift+F3): Sentence, lower, UPPER, Capitalize Each Word, tOGGLE | Y | Y RB/home.rs:91, EN/format.rs:120 | N | rewrites the letters in the source (commands, math, keys untouched) | BUILD | S | 2 |
| H12 | Clear All Formatting; Ctrl+Space (character) | Y | Y RB/home.rs:98, EN/format.rs:123,125 | N | removes `\textbf`, `\emph`, `\textcolor`, `\uline`, `\sout`, `\hl`, size and family switches in and around the selection; on a paragraph also its alignment and spacing environments | BUILD | M | 1 |
| H13 | Bold (Ctrl+B) | Y | Y RB/home.rs:103 | Y `rb-b` (`src/app.js:2014`) | `\textbf{}`; `\bf`, `\bfseries` recognised | ALREADY BETTER: hand written bold toggles too; split at paragraph breaks | – | – |
| H14 | Italic (Ctrl+I) | Y | Y RB/home.rs:104 | Y `rb-i` | `\emph{}`; `\textit`, `\itshape`, `\it` recognised | ALREADY BETTER: emphasis nests (upright inside italic) | – | – |
| H15 | Underline (Ctrl+U) | Y | Y RB/home.rs:105 | partial: writes `\underline{}` (`src/app.js:2014`), which never breaks across lines; Word import writes `\uline` (`src/wordjobs.js:959`) | `\uline{}` (`\usepackage[normalem]{ulem}`); `\underline` still recognised | BUILD (fix) | S | 1 |
| H16 | Underline styles and colour: double, thick, dotted, dashed, wave, words only | Y | Y RB/underline.rs:6-32, EN/format.rs:49-53 | partial: renders `\uuline`, `\uwave` (`src/model.js:14`) | ulem `\uuline`, `\uwave`, `\dashuline`, `\dotuline`; colour: soul's `\setulcolor{red}\ul{}` | BUILD | S | 3 |
| H17 | Strikethrough | Y (no key) | Y RB/home.rs:114, EN/format.rs:57 | partial: renders `\sout`, `\xout` (`src/model.js:15`); no control | `\sout{}` (ulem `[normalem]`, as Word import) | BUILD | S | 1 |
| H18 | Double strikethrough | Y | Y RB/home.rs:140, EN/format.rs:65 | N | ulem: one preamble definition with `\markoverwith` (two rules), used as `\dsout{}`; `\xout` is ulem's nearest | BUILD | S | 3 |
| H19 | Subscript, Superscript (Ctrl+=, Ctrl+Shift+=) | Y | Y RB/home.rs:115-122, EN/format.rs:76,85 | partial: renders `\textsubscript`, `\textsuperscript` (`src/model.js:15`); no control | `\textsubscript{}`, `\textsuperscript{}` (kernel) | BUILD | S | 1 |
| H20 | Text effects: outline, shadow, glow, reflection, WordArt styles | Y | Y RB/home.rs:127-141 | N | – | SKIP: decorative; contour and shadowtext only approximate, and Word round trip breaks | – | – |
| H21 | Small Caps (Ctrl+Shift+K) | Y | Y RB/home.rs:138, EN/format.rs:88 | partial: renders `\textsc` (`src/model.js:13`) | `\textsc{}` | BUILD | S | 2 |
| H22 | All Caps (Ctrl+Shift+A) | Y | Y RB/home.rs:139, EN/format.rs:86 | partial: renders `\MakeUppercase` (`src/model.js:16`) | `\MakeUppercase{}` | BUILD | S | 3 |
| H23 | Hidden text (Ctrl+Shift+H) | Y | Y EN/format.rs:92 | N | – | SKIP: no inline LaTeX form that keeps text unprinted and readable; comments and the `comment` environment do it | – | – |
| H24 | Text Highlight Color (Ctrl+Alt+H) | Y | Y RB/home.rs:144, EN/format.rs:109 | partial: renders `\hl` in one colour (`src/model.js:15`); Word import defines it (`src/wordjobs.js:1008`) | `\hl{}` with Word import's ulem + xcolor definition, given an optional colour: `\hl[green]{}` (yellow by default); the definition line written once | BUILD | M | 1 |
| H25 | Font Color | Y | Y RB/home.rs:155, EN/format.rs:106 | partial: renders `\textcolor` by name, HTML, RGB (`src/model.js:1766`); no control | `\textcolor{red}{}` for xcolor names (dvipsnames), else `\textcolor[HTML]{C00000}{}`; `\usepackage{xcolor}` | BUILD | S | 1 |
| H26 | Character border | Y | Y RB/home.rs:124, EN/format.rs:61 | partial: renders `\fbox` (`src/model.js:16`) | `\fbox{}` | BUILD | S | 3 |
| H27 | Character shading | Y | Y EN/format.rs:115 | partial: renders `\colorbox` | `\colorbox{lightgray}{}` (no line breaks inside; longer runs use `\hl[lightgray]`) | BUILD | S | 3 |
| H28 | Enclose characters (circled) | Y | Y RB/home.rs:125 | N | `\textcircled{}` | BUILD | S | 3 |
| H29 | Phonetic guide (ruby) | Y | Y RB/home.rs:99, EN/phonetic.rs | N | LuaLaTeX `\usepackage{luatexja-ruby}` `\ruby{漢字}{かん\|じ}`; pdfLaTeX CJK: `ruby` package | BUILD | M | 3 |
| H30 | Font dialog (Ctrl+D) with preview | Y | Y DG/dispatch.rs:150-250, EN/format.rs:154 | N | each effect as its own command | BUILD | M | 2 |
| H31 | Font › Advanced: spacing, scale, position, kerning, ligatures | Y | Y EN/format.rs:126-136 | N | spacing `\textls[80]{}` (microtype); scale `\scalebox{1.2}[1]{}`; position `\raisebox{2pt}{}`; kerning and ligatures `\usepackage{microtype}`, fontspec `Ligatures=` | BUILD | M | 3 |
| H32 | Bullets (Ctrl+Shift+L) | Y | Y RB/home.rs:179, EN/para.rs:167 | Y `rb-ul` (`src/ribbon.js:207`) | `itemize` | ALREADY BETTER: a real list, back to paragraphs byte for byte | – | – |
| H33 | Bullet library (•, ○, ▪, –, ✓, symbol, picture) | Y | Y RB/home.rs:180-198 | N | enumitem `\begin{itemize}[label=\textendash]`, `label=$\circ$`, `label=\checkmark` (amssymb) | BUILD | S | 3 |
| H34 | Numbering | Y | Y RB/home.rs:200 | Y `rb-ol` | `enumerate` | ALREADY BETTER: numbers follow nesting and cross references | – | – |
| H35 | Numbering library (1. 1) a) i. A.) | Y | Y RB/home.rs:208-216 | partial: renders enumitem labels (`enumLabel`, `src/model.js`) | enumitem `[label=\alph*)]`, `[label=\roman*.]`, `[label=\Alph*.]` | BUILD | S | 2 |
| H36 | Restart at 1, continue numbering, set value | Y | Y RB/home.rs:219, EN/para.rs:180 | N | enumitem `[resume]`, `[start=5]` | BUILD | S | 2 |
| H37 | List level: Tab / Shift+Tab in an item, Change List Level | Y | Y RB/home.rs:253, EN/para.rs:171 | N (Tab leaves the page outside a table; nested lists render) | the item moved into (out of) a nested `itemize`/`enumerate` under the item before | BUILD | M | 1 |
| H38 | Multilevel presets, Define New Multilevel List | Y | Y RB/home.rs:226-251, DG/dialogs_lists.rs | N | enumitem `\setlist[enumerate,2]{label=\arabic{enumi}.\arabic*.}`; heading numbers are LaTeX's own | BUILD | M | 3 |
| H39 | Decrease/Increase Indent | Y | Y RB/home.rs:259-260, EN/para.rs:62-63 | N | in a list: H37; a paragraph: `\begin{adjustwidth}{1cm}{}` (changepage), steps of 1cm | BUILD | M | 2 |
| H40 | Sort paragraphs or list items | Y | Y RB/home.rs:262, EN/para.rs:205 | N | reorders their source | BUILD | S | 3 |
| H41 | Show/Hide ¶ (Ctrl+Shift+8) | Y | Y RB/home.rs:264, EN/view.rs:21 | partial: Source pane, Alt+click shows the spot (`src/app.js:2134`) | writes nothing: shows `~`, `\\`, `\newpage`, `\label`, `%` lines, `\vspace` as marks on the page | BUILD | M | 3 |
| H42 | Align Left, Center, Right, Justify (Ctrl+L/E/R/J) | Y | Y RB/home.rs:269-272, EN/para.rs:37-40 | partial: renders `center`, `flushleft`, `flushright`, `\centering`, `\raggedleft`, `\raggedright` (`src/model.js:811`, `1167`); no control | `\begin{center}`, `\begin{flushright}`, `\begin{flushleft}` around the paragraphs; Justify removes it (LaTeX's default); `\centering` in a group recognised | BUILD | M | 1 |
| H43 | Distributed (Ctrl+Shift+J) | Y | Y EN/para.rs:41 | N | – | SKIP: East Asian character distribution, no paragraph form outside CJK packages | – | – |
| H44 | Paragraph direction LTR/RTL | Y | Y RB/home.rs:274-275 | partial: direction from languages (`src/scripts.js`, `dirEnv`); no control | `\begin{RTL}…\end{RTL}` (bidi) or `\begin{otherlanguage}{arabic}` as the set up uses | BUILD | S | 3 |
| H45 | Line spacing 1.0, 1.15, 1.5, 2.0 (Ctrl+1/2/5) | Y | Y RB/home.rs:282, EN/para.rs:99-101 | partial: renders `\onehalfspacing`, `\doublespacing`, `\linespread`, `\setstretch` for the document (`src/model.js:397-402`) | document: `\usepackage{setspace}` + `\onehalfspacing` / `\doublespacing` / `\setstretch{1.15}`; paragraphs: `\begin{spacing}{1.5}` | BUILD | M | 1 |
| H46 | Add/Remove space before/after a paragraph | Y | Y RB/home.rs:286-287, EN/para.rs:125,136 | partial: renders `\vspace`, `\medskip` (`src/model.js:849`) | `\vspace{6pt}` on its own line before/after; all paragraphs: D5 | BUILD | S | 2 |
| H47 | Paragraph shading | Y | Y RB/home.rs:292, EN/para.rs:189 | N | `\begin{tcolorbox}[colback=yellow!10,boxrule=0pt]` (tcolorbox) | BUILD | M | 3 |
| H48 | Paragraph borders (bottom, top, box) | Y | Y RB/home.rs:305-327, EN/para.rs:202 | N | box: `\begin{tcolorbox}[colback=white]`; bottom: `\par\noindent\rule{\linewidth}{0.4pt}` after it | BUILD | M | 3 |
| H49 | Horizontal line | Y | Y RB/home.rs:326, EN/insert.rs:132 | N | `\noindent\rule{\linewidth}{0.4pt}` | BUILD | S | 2 |
| H50 | Paragraph dialog: indent left/right, first line, hanging | Y | Y DG/dispatch.rs:310-330, EN/para.rs:64-81 | partial: renders `\parindent`, `\noindent` (`src/model.js:404`, `810`) | all paragraphs `\setlength{\parindent}{1.25cm}`; this one `\noindent`; hanging `\hangindent=1cm\hangafter=1` at its start; left/right `adjustwidth` | BUILD | M | 2 |
| H51 | Paragraph dialog: line spacing exactly, at least, multiple | Y | Y DG/dispatch.rs:331 | partial (as H45) | multiple: setspace; exactly and at least: the nearest `\setstretch` | BUILD | S | 3 |
| H52 | Widow/orphan control | Y | Y DG/dispatch.rs:343, EN/para.rs:214 | N (penalties ignored) | `\widowpenalty=10000 \clubpenalty=10000` in the preamble | BUILD | S | 3 |
| H53 | Keep with next, keep lines together, page break before | Y | Y DG/dispatch.rs:344-346, EN/para.rs:206-210 | N | `\nopagebreak` after it; `\begin{samepage}`; `\clearpage` before it | BUILD | S | 3 |
| H54 | Suppress line numbers, don't hyphenate (a paragraph) | Y | Y DG/dispatch.rs:348-349 | N | `\begin{nolinenumbers}` (lineno); `\begin{hyphenrules}{nohyphenation}` (babel) | BUILD | S | 3 |
| H55 | Tab stops and leaders | Y | Y DG/dialogs_para.rs, EN/para.rs:221, UI/ruler_tabs.rs | N | `\begin{tabbing}` with `\=` and `\>`; a right stop with dots: `\dotfill` | BUILD | M | 3 |
| H56 | Tab key in running text | Y | Y EN/text.rs:31 | N | – | SKIP: a tab character has no LaTeX meaning; Tab means list level (H37) and next cell | – | – |
| H57 | Asian typography (kinsoku, spacing) | Y | Y DG/dispatch.rs:353-363 | Y ctex, xeCJK, luatexja set up (`src/scripts.js`) | – | ALREADY BETTER: CJK line breaking rules apply by default | – | – |
| H58 | Move paragraph up/down (Alt+Shift+↑/↓) | Y | Y EN/para.rs:181-183 | N | swaps the paragraphs' source | BUILD | S | 2 |
| H59 | Styles gallery: Normal, Title, Heading 1–3, Quote | Y | Y RB/home.rs:359, UI/previews.rs | Y (`src/ribbon.js:435`, `src/styles.js:102`) | `\section{}`…, `quote`, `% rikuy: latex` | ALREADY BETTER: LaTeX is a style; each style back byte for byte | – | – |
| H60 | Heading 4 and 5 | Y | Y DOC/styles.rs:998 | partial: renders `\paragraph`, `\subparagraph`; gallery stops at Heading 3 | `\paragraph{}`, `\subparagraph{}` (6–9 have no LaTeX level) | BUILD | S | 2 |
| H61 | Heading 1 as chapter (report, book); Part | Y | Y | partial: renders `\chapter` (`src/model.js:802`); Heading 1 always `\section` | `report`/`book`/`scrbook`: Heading 1 `\chapter{}`, 2 `\section{}`…; `\part{}` | BUILD | S | 2 |
| H62 | Unnumbered headings; heading numbers off | Y | Y | partial: renders `\section*` | `\section*{}`; all off: `\setcounter{secnumdepth}{0}` | BUILD | S | 2 |
| H63 | Subtitle, Author, Date as styles | Y | Y DOC/styles.rs:599 | partial: `\title`, `\author`, `\date` render through `\maketitle`; only Title in the gallery | `\author{}`, `\date{}`; Subtitle: `\title{Main\\[0.5ex]\large Sub}` or KOMA `\subtitle{}` | BUILD | S | 3 |
| H64 | Strong, Emphasis, Intense Emphasis, Book Title, Subtle Reference | Y | Y DOC/styles.rs:619-661 | Y as Bold, Italic | – | SKIP: same as H13, H14, H21 under other names | – | – |
| H65 | Quotation, Intense Quote, Verse, Abstract, Code as styles | Y | Y DOC/styles.rs:636 | partial: Quote in the gallery; `quotation`, `verse`, `abstract`, `verbatim` render | `quotation`, `verse`, `abstract`, `verbatim` / `lstlisting` (listings) | BUILD | M | 2 |
| H66 | Theorem, Lemma, Definition, Proof as styles | N | N | partial: in the insert list (`src/app.js:314-319`) | `\begin{theorem}…`, `\newtheorem{theorem}{Theorem}` and amsthm added when missing | BUILD (gallery section "LaTeX environments") | S | 2 |
| H67 | Styles pane (Ctrl+Alt+Shift+S) | Y | Y UI/panes/side.rs:46, EN/para.rs:259 | N | lists the headings, environments and the document's `\newcommand`/`\newenvironment` | BUILD | M | 3 |
| H68 | Modify Style (heading font, size, colour, spacing, numbering; Normal) | Y | Y EN/para.rs:237 | N | headings: `\usepackage{titlesec}` `\titleformat{\section}{\Large\bfseries\color{accent}}{\thesection}{1em}{}` and `\titlespacing*{\section}{0pt}{12pt}{6pt}`; Normal: H6, H8, H45 | BUILD | L | 2 |
| H69 | Create a style | Y | Y EN/para.rs:236 | N | paragraph: `\newenvironment{name}{…}{…}`; character: `\newcommand{\name}[1]{\textbf{\textcolor{accent}{#1}}}`; applying writes `\name{}` | BUILD | M | 3 |
| H70 | Update style to match selection | Y | Y EN/para.rs:238 | N | rewrites the macro's or `\titleformat`'s body from the selection's wrappers | BUILD | M | 3 |
| H71 | Style Inspector, Reveal Formatting (Shift+F1) | Y | Y UI/panes/inspector.rs:3 | Y Source pane, Alt+click | – | ALREADY BETTER: the formatting is the source, beside the page | – | – |
| H72 | Style keys: Ctrl+Alt+1/2/3, Normal Ctrl+Shift+N, Apply Styles Ctrl+Shift+S | Y | Y EN/para.rs:163-166,268 | partial: the style list, no keys | – | BUILD (Normal on Ctrl+Alt+0, see §2) | S | 2 |
| H73 | A style on several paragraphs at once | Y | Y | N (`WHY.multi`, `src/ribbon.js:40`) | each paragraph its heading command; one `quote`/`center` around all | BUILD | M | 2 |
| H74 | Right click on a style tile: modify, rename, remove from gallery | Y | Y EN/para.rs:270 | N (PLAN task 37, not done) | – | BUILD | S | 3 |
| H75 | Find (Ctrl+F) in the navigation pane, results with context, all highlighted | Y | Y RB/home.rs:364, UI/panes/nav.rs:13, EN/edit.rs:115 | partial: the browser's find on the page; CodeMirror's in the source | searches typeset text through the seg maps; "in LaTeX source" option | BUILD | M | 1 |
| H76 | Match case, whole words, wildcards (regex), in selection | Y | Y DG/find.rs:5, DG/dispatch.rs:418 | N | – | BUILD | S | 2 |
| H77 | Find formatting and special marks (^p, ^t, bold, a style) | Y | Y DG/find.rs:106 | N | finds by wrapper command (`\textbf`), environment, heading level | BUILD | S | 3 |
| H78 | Sounds like, all word forms | Y | N | N | – | SKIP: Word's language data; regex covers a paper's needs | – | – |
| H79 | Replace (Ctrl+H), Replace All | Y | Y RB/home.rs:370, EN/edit.rs:137,152 | N | each hit the smallest source edit through `escapeTeX`; Replace All one undo step; regex replace in the source | BUILD | M | 1 |
| H80 | Go To (Ctrl+G): page, section, footnote, equation, figure, table, comment, label | Y | Y DG/find.rs:173, EN/edit.rs:154 | partial: outline and problem clicks (`src/app.js:4245`) | – | BUILD | S | 2 |
| H81 | Select: paragraph, sentence, text with similar formatting | Y | Y RB/home.rs:371-374 | partial: Ctrl+A (`src/app.js:2168`) | similar = the same wrapper command | BUILD | S | 3 |
| H82 | Drag selected text to move it | Y | Y UI/canvas/input.rs | N (`dragstart` prevented, `src/app.js:1062`) | a cut and an insert as one undo step | BUILD | M | 3 |
| H83 | Dictate | Y | Y RB/home.rs:379 | partial: the OS's dictation types through `beforeinput` | – | SKIP: the Web Speech API sends audio to a server, against Rikuy's no upload promise; OS dictation works | – | – |
| H84 | Copilot, Designer | Y | N | partial: Ask Claude in the claude.ai copy (`src/app.js:3138`) | rewrites the selected LaTeX | ALREADY BETTER: works on the LaTeX, house style, shows the result before replacing | – | – |
| H85 | Add-ins, Sensitivity, Reuse files | Y | N | N | – | SKIP: Microsoft 365 services | – | – |

### Insert

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| I1 | Cover page gallery | Y | Y RB/insert.rs:51, EN/insert.rs:43 | partial: renders `\maketitle` | `\begin{titlepage}…\end{titlepage}` from a few designs, or class option `titlepage` | BUILD | S | 3 |
| I2 | Blank page | Y | Y RB/insert.rs:59 | N | `\newpage\null\newpage` | BUILD | S | 3 |
| I3 | Page break (Ctrl+Enter) | Y | Y RB/insert.rs:60, EN/text.rs:29 | partial: renders `\newpage`, `\clearpage` (`src/model.js:834`); Ctrl+Enter only adds a table row (`src/app.js:1204`) | `\newpage` on its own line (`\clearpage` to flush floats) | BUILD | S | 1 |
| I4 | Table grid picker (rows × columns) | Y | Y RB/insert.rs:64 | partial: Table inserts two by two (`src/ribbon.js:246`) | `table` float, `\centering`, `tabular` with r × c cells, `\caption{}` | BUILD | S | 1 |
| I5 | Insert Table dialog (size, AutoFit) | Y | Y RB/insert.rs:67, UI/dialogs.rs:706 | N | as I4; fit to window: `tabularx` | BUILD | S | 2 |
| I6 | Draw Table, Eraser | Y | Y RB/insert.rs:69, RB/table.rs:215 | N | – | SKIP: freehand cells; merge and split (T11, T12) make the same structures | – | – |
| I7 | Convert text to table | Y | Y RB/insert.rs:70, EN/table.rs:230 | N | lines split at tabs, commas or `&` into rows | BUILD | S | 3 |
| I8 | Spreadsheet / table from a data file | Y | N | partial: a table pasted from Excel arrives as `tabular` (`src/paste.js:116`) | `\pgfplotstabletypeset[col sep=comma]{data.csv}` (pgfplotstable) or `\csvautotabular{data.csv}` (csvsimple) | BUILD | M | 3 |
| I9 | Quick Tables (calendar, matrix) | Y | Y RB/insert.rs:71-76 | N | – | SKIP: content templates; the picker covers the structure | – | – |
| I10 | Picture from the device, pasted, dropped | Y | Y RB/insert.rs:81 | Y Picture (`src/app.js:4696`) | `\includegraphics[width=0.8\linewidth]{}` in `center`; graphicx once | ALREADY BETTER: PDF pictures stay vector; safe names; package added once | – | – |
| I11 | Stock images, online pictures | Y | N | N | – | SKIP: a remote service; the page may connect only to its own address | – | – |
| I12 | Shapes (line, arrow, rectangle, oval, star) and drawing canvas | Y | Y RB/insert.rs:82-98, EN/canvas.rs | partial: TikZ compiles; a raw box on the page | `\begin{tikzpicture}\draw[->] (0,0) -- (2,0);\end{tikzpicture}` from a shape picker; handles write coordinates | BUILD | L | 3 |
| I13 | Icons | Y | Y RB/insert.rs:100 | N | `\usepackage{fontawesome5}` `\faIcon{check}` | BUILD | S | 3 |
| I14 | 3D models | Y | N | partial: Asymptote 3D compiles | – | SKIP: glTF has no LaTeX form; Asymptote 3D already compiles | – | – |
| I15 | SmartArt (process, cycle, hierarchy) | Y | Y RB/insert.rs:101, EN/smart_art.rs | N | `\usepackage{smartdiagram}` `\smartdiagram[flow diagram:horizontal]{Plan,Write,Submit}` | BUILD | M | 3 |
| I16 | Chart | Y | Y RB/insert.rs:102, EN/chart.rs | partial: live widgets (`\rikuywidget`, `src/widget.js`); pgfplots compiles | `\begin{tikzpicture}\begin{axis}\addplot table[col sep=comma]{data.csv};\end{axis}\end{tikzpicture}` (pgfplots) from a data grid | BUILD | L | 3 |
| I17 | Screenshot | Y | N | N | a PNG through `\includegraphics` | BUILD (`getDisplayMedia`) | S | 3 |
| I18 | Online video | Y | N | N | – | SKIP: no PDF meaning | – | – |
| I19 | Link (Ctrl+K): text, address, email, place in this document | Y | Y RB/insert.rs:107, EN/insert.rs:57 | partial: Link writes `\url{}` (`src/ribbon.js:258`); renders `\href`, `\hyperref` (`src/model.js:1839-1847`) | `\href{https://…}{text}`; `\url{}` when text is the address; `\href{mailto:a@b.org}{a@b.org}`; `\hyperref[sec:intro]{text}`; `\usepackage[hidelinks]{hyperref}` | BUILD | S | 1 |
| I20 | Edit, open, remove a link | Y | Y EN/insert.rs:61 | partial: Ctrl+click opens (`src/app.js:2134`) | `\href{u}{text}` to `text` | BUILD | S | 2 |
| I21 | Bookmark | Y | Y RB/insert.rs:111, DG/bookmarks.rs:30 | partial: "Label" in the insert list (`src/app.js:320`) | `\label{key}` (`\phantomsection\label{}` in running text); dialog lists, goes to, deletes labels | BUILD | S | 3 |
| I22 | Cross-reference | Y | Y RB/insert.rs:119, DG/dialogs_refs/cross_ref.rs:66 | Y insert list and picker: `\ref`, `\eqref`, `\cref`, `\Cref`, `\autoref` (`src/app.js:3015`) | – | ALREADY BETTER: cleveref and autoref name the kind ("Figure 2") from the label; button in R16 | – | – |
| I23 | Comment (Ctrl+Alt+M) | Y | Y RB/insert.rs:127 | Y (`src/collab.js:345`) | `% comment (Ana) on "words": text` | ALREADY BETTER: comment lines that Overleaf, git and TeX keep | – | – |
| I24 | Header (blank, three columns, title, logo); edit, remove | Y | Y RB/insert.rs:130-136, EN/insert.rs:69-115 | N (fancyhdr ignored, `src/model.js:41`) | `\usepackage{fancyhdr}\pagestyle{fancy}\fancyhf{}\fancyhead[L]{…}\fancyhead[C]{…}\fancyhead[R]{…}`, `\renewcommand{\headrulewidth}{0pt}`; the page draws three editable slots | BUILD | L | 2 |
| I25 | Footer (blank, three columns, page number) | Y | Y RB/insert.rs:138-144 | partial: a centred page number always (`src/layout.js:288`) | `\fancyfoot[C]{\thepage}`; none: `\pagestyle{empty}` | BUILD | M | 2 |
| I26 | Page number: top, bottom, Page X of Y, here | Y | Y RB/insert.rs:150-155, EN/insert.rs:71 | partial (as I25) | `\fancyhead[R]{\thepage}`; `\thepage\ of \pageref{LastPage}` (lastpage); in text `\thepage` | BUILD | S | 2 |
| I27 | Format page numbers (i, A, start at) | Y | Y DG/dialogs_layout.rs:117, EN/page.rs:73 | N | `\pagenumbering{roman}`, `\setcounter{page}{5}` | BUILD | S | 2 |
| I28 | Different first page; different odd and even | Y | Y EN/page.rs:65-69 | N | `\thispagestyle{empty}` or `\fancypagestyle{plain}{…}`; class `twoside` + `\fancyhead[LE,RO]{}` | BUILD | M | 3 |
| I29 | Header and footer distance from the edge | Y | Y DG/page_setup.rs | Y Header from Top and Footer from Bottom on the Header & Footer tab (task 68), as Word measures them | geometry `headsep=`, `footskip=` | BUILT | S | 3 |
| I30 | Text box | Y | Y RB/insert.rs:160, EN/insert.rs:50 | N | `\fbox{\begin{minipage}{0.4\linewidth}…\end{minipage}}`; styled `tcolorbox`; beside text `wrapfigure` | BUILD | M | 3 |
| I31 | Quick Parts, AutoText, building blocks | Y | Y RB/insert.rs:162-178 | N | "Save selection as": `\newcommand{\name}{…}` in the preamble; inserting writes `\name{}` | BUILD | M | 3 |
| I32 | Document property in the text (title, author, file name) | Y | Y DG/dialogs_insert/field.rs:27-37 | N | `\thetitle`, `\theauthor` (titling); `\jobname` | BUILD | S | 3 |
| I33 | Field dialog (PAGE, NUMPAGES, SECTION, SEQ, REF, PAGEREF, STYLEREF, DATE, TIME) | Y | Y DG/dialogs_insert/field.rs:21-47, EN/fields.rs | N | `\thepage`, `\pageref{LastPage}`, `\thesection`, `\newcounter`/`\refstepcounter`, `\ref`, `\pageref`, `\leftmark`, `\today`, `\DTMcurrenttime` (datetime2) | BUILD | M | 3 |
| I34 | Update fields (F9), field codes (Shift+F9), lock, unlink | Y | Y EN/fields.rs:22-36 | Y numbers recomputed at every keystroke and compile; the Source shows the code | – | ALREADY BETTER: nothing goes stale, nothing to lock | – | – |
| I35 | WordArt | Y | Y RB/insert.rs:181 | N | – | SKIP: decorative text art | – | – |
| I36 | Drop Cap (dropped, in margin, lines, distance) | Y | Y RB/insert.rs:184, DG/dialogs_insert/columns.rs:52 | N | `\usepackage{lettrine}` `\lettrine[lines=3]{T}{his}`; in margin `lhang=1` | BUILD | S | 3 |
| I37 | Signature line | Y | Y RB/insert.rs:192 | Y Signature Line (task 68): room, a rule, name, title, e-mail, the date | `\noindent\rule{6cm}{0.4pt}\\ Name\\ Title\\ \today` | BUILT: the line and its words; signing the PDF is a PDF reader's, as Word's line is | – | – |
| I38 | Date and Time (formats, update automatically) | Y | Y RB/insert.rs:193, DG/dialogs_insert/date_time.rs:80 | partial: renders `\today` (`src/model.js:1885`) | updating `\today`; a format `\usepackage[en-GB]{datetime2}` `\DTMsetstyle{iso}`; fixed: the text | BUILD | S | 2 |
| I39 | Text from file | Y | Y EN/insert.rs:137 | partial: `\input` files render | adds the .tex to the project and writes `\input{chapter1}` | BUILD | S | 3 |
| I40 | Object: a PDF's pages; OLE objects | Y | Y RB/insert.rs:194 | partial: `\includegraphics[page=2]` | `\includepdf[pages=-]{file.pdf}` (pdfpages); OLE has no form | BUILD (PDF only) | S | 3 |
| I41 | Equation (Alt+=), inline and display | Y | Y UI/equation_tab.rs:238, EN/equation.rs:29 | Y Formula (Ctrl+M, $), Equation (Ctrl+Shift+E): MathLive with Word style typing (`src/wordmath.js`) | `$…$`, `\begin{equation}…\end{equation}` | ALREADY BETTER: LaTeX math, Word's linear input taken, native Word equations out | – | – |
| I42 | Equation gallery (quadratic formula, binomial, Fourier series…) | Y | N | N | their LaTeX | BUILD | S | 3 |
| I43 | Ink equation | Y | Y RB/draw.rs:59 | N | – | SKIP: handwriting recognition | – | – |
| I44 | Symbol: recent grid, More Symbols (font, subset) | Y | Y RB/insert.rs:199-228, DG/dialogs_insert/symbol.rs:269 | partial: math symbol list in Help (`src/app.js:5425`) | text symbols: `\S`, `\P`, `\copyright`, `\textregistered`, `\texttrademark`, `\textdegree`, `\texteuro`, `\pounds`, `\dag`, `\textbullet`, `\textperthousand`; UTF-8 where the engine and font take it; math symbols inside `$…$` | BUILD | M | 2 |
| I45 | Special characters and keys: em/en dash, nonbreaking space and hyphen, optional hyphen, ellipsis, © ® ™ | Y | Y EN/text.rs:41-58 | partial: a no-break space typed becomes `~` (`src/editor.js:346`) | `---`, `--`, `~`, `\nobreakdash-` (amsmath), `\-`, `\ldots`, `\copyright`, `\textregistered`, `\texttrademark` | BUILD | S | 2 |
| I46 | Add-ins, Wikipedia, Forms, Get Add-ins | Y | N | N | – | SKIP: Microsoft 365 services | – | – |
| I47 | LaTeX environment, raw LaTeX, live figure (Rikuy's own) | N | N | partial: insert list, LaTeX style, `\rikuywidget` by hand | `\begin{env}`, `% rikuy: latex`, `\rikuywidget{plot.html}{plot.png}` | BUILD (an Insert › LaTeX group) | S | 2 |

### Draw

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| DR1 | Pen, pencil, highlighter, eraser, lasso | Y | Y RB/draw.rs:17-22 | N | – | SKIP: freehand ink has no LaTeX source form | – | – |
| DR2 | Ink to shape, ink to math, ink replay | Y | Y RB/draw.rs:58-66 | N | – | SKIP: handwriting recognition; I12 and the equation editor give the result | – | – |
| DR3 | Drawing canvas | Y | Y RB/draw.rs:62 | N | – | SKIP: is I12 | – | – |

### Design

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| D1 | Themes (colours, fonts, effects as one) | Y | Y RB/design.rs:20 | N | a "Look": font package, `\definecolor{accent}{HTML}{…}`, `\titleformat` lines, `\hypersetup{colorlinks,linkcolor=accent}` | BUILD | M | 3 |
| D2 | Style sets (Basic, Lines, Shaded, Casual, Centered, Minimalist) | Y | Y RB/design.rs:28, UI/previews.rs:695 | N | titlesec presets (rules, centred, small caps) and the class (`article`, `scrartcl`) | BUILD | M | 3 |
| D3 | Theme colours | Y | Y RB/design.rs:33 | N | `\definecolor{accent}{HTML}{…}`, shown first in every colour picker | BUILD | S | 3 |
| D4 | Theme fonts (heading, body) | Y | Y RB/design.rs:43 | N | body: H6; headings `\titleformat*{\section}{\sffamily\Large\bfseries}` or KOMA `\setkomafont{disposition}{\sffamily}` | BUILD | S | 3 |
| D5 | Paragraph spacing (none, compact, open, relaxed, double) | Y | Y RB/design.rs:56-79, EN/design.rs:69 | partial: renders `parskip` and `\parskip` (`src/model.js:381`, `405`) | open: `\usepackage{parskip}`; any: `\setlength{\parskip}{6pt plus 2pt}`; relaxed/double add setspace | BUILD | S | 2 |
| D6 | Effects (shape effects of the theme) | Y | Y RB/design.rs:82 | N | – | SKIP: shape effects | – | – |
| D7 | Watermark: DRAFT, CONFIDENTIAL, custom text (font, size, colour, diagonal), picture, remove | Y | Y RB/design.rs:94-106, UI/dialogs.rs:744 | N | `\usepackage{draftwatermark}` `\DraftwatermarkOptions{text=DRAFT,scale=1,color=gray!30,angle=45}`; picture: `text={\includegraphics{logo}}` | BUILD | S | 2 |
| D8 | Page colour | Y | Y RB/design.rs:110, EN/design.rs:75 | N (`\pagecolor` ignored, `src/model.js:50`) | `\pagecolor{yellow!10}` (xcolor) | BUILD | S | 3 |
| D9 | Page borders (box, art) | Y | Y RB/design.rs:117, EN/design.rs:81 | N | `\AddToHook{shipout/background}{\begin{tikzpicture}[remember picture,overlay]\draw ([shift={(1cm,-1cm)}]current page.north west) rectangle ([shift={(-1cm,1cm)}]current page.south east);\end{tikzpicture}}`; art: pgfornament | BUILD | M | 3 |

### Layout

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| L1 | Margins: Normal 2.54, Narrow 1.27, Moderate, Wide, Mirrored, custom | Y | Y RB/layout.rs:8-28,70, EN/page.rs:15 | partial: renders geometry margins (`src/model.js:419-438`) | `\usepackage[margin=2.54cm]{geometry}` (options merged into an existing line); mirrored: `twoside`, `inner=`, `outer=` | BUILD | S | 1 |
| L2 | Orientation | Y | Y RB/layout.rs:30,74, EN/page.rs:18 | N (portrait only, `src/layout.js:12`) | geometry `landscape`; some pages: `\begin{landscape}` (pdflscape) | BUILD | M | 2 |
| L3 | Paper size: Letter, Legal, A4, A5, B5, Executive, custom | Y | Y RB/common.rs:131, EN/page.rs:27 | partial: A4 and Letter only (`src/layout.js:12`) | geometry `a4paper`, `letterpaper`, `legalpaper`, `a5paper`, `b5paper`, `executivepaper`, `paperwidth=…,paperheight=…` | BUILD | S | 1 |
| L4 | Columns: one, two, three, left, right | Y | Y RB/layout.rs:36-48,78, EN/page.rs:28 | partial: `multicols` and `twocolumn` read, drawn in one column (`src/model.js:1176`, `333`) | class option `twocolumn`, or `\begin{multicols}{3}`…`\end{multicols}` (multicol) around the body or the selection; uneven: `paracol` with `\columnratio{0.3}` | BUILD (the page draws columns) | L | 2 |
| L5 | More columns: widths, spacing, line between | Y | Y DG/dialogs_insert/columns.rs:400 | N | `\setlength{\columnsep}{1cm}`, `\setlength{\columnseprule}{0.4pt}` | BUILD | S | 3 |
| L6 | Breaks: page, column, text wrapping | Y | Y RB/layout.rs:80-84, EN/page.rs:32 | partial: page break renders; `\columnbreak` ignored | `\newpage`; `\columnbreak` (multicol) or `\newpage` in `twocolumn`; `\newline` | BUILD | S | 2 |
| L7 | Section breaks: next page, continuous, even page, odd page | Y | Y RB/layout.rs:85-88 | N | `\clearpage` (with `\newgeometry{…}` … `\restoregeometry` when the page set up changes); odd `\cleardoublepage` (`twoside`); continuous ends a `multicols` | BUILD | M | 3 |
| L8 | Line numbers: continuous, restart each page, each section, suppress; options | Y | Y RB/layout.rs:94-105, EN/page.rs:34 | N (`\linenumbers` ignored, `src/model.js:54`) | `\usepackage{lineno}` `\linenumbers`; each page `\usepackage[pagewise]{lineno}`; each section `\AddToHook{cmd/section/before}{\resetlinenumber}`; `\modulolinenumbers[5]`; the page draws them in the margin | BUILD | M | 2 |
| L9 | Hyphenation: automatic, none, manual, options | Y | Y RB/layout.rs:112-118, EN/page.rs:37-39 | partial: TeX hyphenates; the page breaks lines as the browser does | none `\usepackage[none]{hyphenat}`; manual `\-`; exceptions `\hyphenation{data-base}` | BUILD | S | 3 |
| L10 | Text direction of the page (rotate 90°/270°) | Y | Y RB/layout.rs:58 | N | – | SKIP: beyond L2 (landscape) and T16 (cells) no LaTeX form | – | – |
| L11 | Layout › Paragraph: indent and spacing fields | Y | Y RB/layout.rs:123-182 | N | H39, H46, H50 | BUILD (fields in the Layout tab) | S | 2 |
| L12 | Position (in line, top, bottom, page, here) | Y | Y RB/layout.rs:188, EN/objects.rs | partial: floats render where written | float placement `[htbp]`, `[t]`, `[b]`, `[p]`, `[H]` (float); in line: no float | BUILD | S | 2 |
| L13 | Wrap Text: square, tight, top and bottom, behind, in front | Y | Y RB/arrange.rs:22-65 | partial: `wrapfigure` drawn as a float (`src/model.js:1170`) | square/tight `\begin{wrapfigure}{r}{0.4\linewidth}` (wrapfig); top and bottom `figure`; behind/in front: no form | BUILD | M | 2 |
| L14 | Bring forward, send backward, group, align, selection pane | Y | Y RB/layout.rs:188-220, RB/arrange.rs:97-118 | N | – | SKIP: layering of drawing objects; in TikZ the order is the source's | – | – |
| L15 | Rotate 90°, flip | Y | Y RB/arrange.rs:72-77 | N | `\includegraphics[angle=90]{}`; flip `\reflectbox{\includegraphics{…}}` | BUILD | S | 3 |
| L16 | Page Setup dialog: margins, gutter, paper, vertical alignment, apply to | Y | Y UI/dialogs.rs:707, DG/page_setup.rs:31-150 | N | geometry options (`bindingoffset=1cm` for the gutter); vertical centre: `\vspace*{\fill}` around the page's text | BUILD | M | 1 |
| L17 | Document grid (East Asian characters per line) | Y | Y EN/page.rs:90 | N | – | SKIP: CJK grid typesetting; ctex sets the line by its own rules | – | – |
| L18 | Document class, one or two sided, base size (Rikuy's own) | N | N | partial: read, no control | `\documentclass[11pt,twoside]{report}` | BUILD (Layout › Document group) | S | 2 |

### References

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| R1 | Table of contents: automatic, levels, remove | Y | Y RB/references.rs:7-16, DG/dialogs_refs/toc.rs:94 | partial: renders `\tableofcontents` (`src/model.js:822`); no control | `\tableofcontents`; levels `\setcounter{tocdepth}{2}` | BUILD | S | 1 |
| R2 | Update table | Y | Y RB/references.rs:31 | Y the page's contents follow the headings at every keystroke | – | BUILT as Update Table and Update Index (task 68): the page's list rebuilt and flashed now, the PDF's at its next compile | – | – |
| R3 | Add text (level, do not show in TOC) | Y | Y RB/references.rs:20-27 | N | not listed `\section*{}`; other text `\section[Short]{Long}`; extra entry `\addcontentsline{toc}{section}{…}` | BUILD | S | 3 |
| R4 | Insert footnote (Ctrl+Alt+F) | Y | Y RB/references.rs:42, EN/references.rs:53 | Y Footnote | `\footnote{}` | ALREADY BETTER: typed in place on the page; given up empty, it goes again (`src/ribbon.js:285`) | – | – |
| R5 | Insert endnote (Ctrl+Alt+D) | Y | Y RB/references.rs:44, EN/references.rs:56 | N | `\usepackage{enotez}` `\endnote{}` and `\printendnotes` | BUILD | M | 3 |
| R6 | Next footnote, show notes | Y | Y RB/references.rs:52-60 | partial: a click on a mark goes to its text (`src/app.js:2214`) | – | BUILD | S | 3 |
| R7 | Footnote options: format, start, restart per page/section, symbols, convert | Y | Y DG/dialogs_notes.rs:82, EN/references.rs:60 | N | `\renewcommand{\thefootnote}{\roman{footnote}}`; `\usepackage[symbol]{footmisc}`; per page `[perpage]`; per section `\counterwithin*{footnote}{section}` | BUILD | S | 3 |
| R8 | Insert Citation (pick, page, prefix) | Y | Y RB/references.rs:68 | Y Citation (`src/app.js:2935`): `\cite`, `\citet`, `\citep`, notes, several keys | `\citep[see][p.~4]{key}` | ALREADY BETTER: natbib and biblatex forms from any .bib | – | – |
| R9 | Add New Source (form by type: book, article, website…) | Y | Y RB/references.rs:77, DG/dialogs_refs/sources.rs:172 | N (the .bib edited by hand) | an `@article{key, author={…}, title={…}, journal={…}, year={…}}` entry in the .bib; with none, `refs.bib` and `\bibliography{refs}` or `\addbibresource{refs.bib}` | BUILD | M | 1 |
| R10 | Manage Sources (list, edit, delete, paste BibTeX) | Y | Y RB/references.rs:80, DG/dialogs_refs/sources.rs:230 | partial: the .bib in the source pane; Word import makes a .bib from Zotero and Mendeley | each entry edited by the smallest patch | BUILD | M | 2 |
| R11 | Citation style: APA, Chicago, IEEE, MLA, Harvard | Y | Y RB/references.rs:90-96 | partial: reads natbib/biblatex style for the page (`src/model.js:370-380`) | natbib `\bibliographystyle{plainnat\|apalike\|ieeetr\|unsrtnat}`; biblatex `style=apa\|chicago-authordate\|ieee\|mla\|authoryear` | BUILD | S | 1 |
| R12 | Bibliography (References, Works Cited) | Y | Y RB/references.rs:100 | partial: renders `\bibliography`, `\printbibliography` | `\bibliographystyle{plainnat}\bibliography{refs}` or `\printbibliography[title=Works Cited]` | BUILD | S | 1 |
| R13 | Researcher, Smart Lookup | Y | Y RB/references.rs:64 | N | – | SKIP: web service | – | – |
| R14 | Insert Caption: label, numbering, above/below, exclude label, new label | Y | Y RB/references.rs:111, DG/dialogs_refs/caption.rs:100 | partial: Table writes an empty `\caption{}`; pictures get none (`src/app.js:4696`) | `\caption{…}\label{fig:…}`; a picture in `center` becomes `\begin{figure}[htbp]\centering…\end{figure}`; above/below is the order; new label `\DeclareFloatingEnvironment{scheme}` (newfloat); by section `\counterwithin{figure}{section}` | BUILD | M | 1 |
| R15 | Table of Figures, of Tables | Y | Y RB/references.rs:113, DG/dialogs_refs/toc.rs:251 | partial: compile; dropped on the page (`src/model.js:833`) | `\listoffigures`, `\listoftables` | BUILD (the page draws them) | S | 2 |
| R16 | Cross-reference button: to heading, figure, table, equation, footnote, bookmark; number, page, above/below | Y | Y RB/references.rs:129, DG/dialogs_refs/cross_ref.rs:66 | partial: insert list only (I22) | `\cref{}`; page `\pageref{}`; above/below `\vref{}` (varioref); links come with hyperref | BUILD | S | 2 |
| R17 | Mark index entry (Alt+Shift+X): main, sub, see, range, bold page, Mark All | Y | Y RB/references.rs:140, DG/dialogs_refs/index.rs:163 | partial: `\index` compiles (makeindex, xindy), hidden on the page (`src/model.js:39`) | `\index{term}`, `\index{main!sub}`, `\index{x\|see{y}}`, `\index{x\|textbf}`, `\index{x\|(}`…`\index{x\|)}` | BUILD | M | 2 |
| R18 | Insert Index (columns, right aligned numbers), update | Y | Y RB/references.rs:142-143, DG/dialogs_refs/index.rs:53 | partial: `\printindex` compiles; ignored on the page | `\usepackage{imakeidx}\makeindex[columns=2]` and `\printindex`; the page draws it from the entries | BUILD | M | 2 |
| R19 | Table of Authorities: mark citation, insert, update | Y | Y RB/references.rs:153-165 | N | a second index: `\makeindex[name=auth,title=Table of Authorities]`, `\index[auth]{…}`, `\printindex[auth]` (imakeidx) | BUILD | M | 3 |
| R20 | Zotero, Mendeley add-in (live citations) | Y | Y RB/references.rs:178-189 | partial: their citations in a Word file open as .bib | – | SKIP: the add-in talks to a local app over HTTP, which the page's policy refuses; Better BibTeX's auto-exported .bib is dropped in | – | – |

### Mailings

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| M1 | Envelopes, Labels | Y | Y RB/mailings.rs:7-8 | N | – | SKIP: postal print plumbing, outside a paper editor | – | – |
| M2 | Start Mail Merge, Select Recipients, Edit Recipient List | Y | Y RB/mailings.rs:10-41 | N | – | SKIP: Word plumbing | – | – |
| M3 | Merge fields, Rules, Preview Results, Finish & Merge | Y | Y RB/mailings.rs:43-101 | N | – | SKIP: Word plumbing | – | – |

### Review

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| RV1 | Spelling (F7): pane, suggestions, ignore, ignore all, add to dictionary, by language | Y | Y RB/review.rs:7, EN/review.rs:81-134, UI/proofing_pane.rs | partial: the browser underlines the page (`src/template.html:93`) in the document's language (`src/app.js:644`); its suggestions land as edits (`src/app.js:1244`); no pane; LaTeX paragraphs unchecked | corrections are text edits; added words in a project file `rikuy-words.txt` that TeX never reads | BUILD (Hunspell in WASM, dictionaries pinned by hash; words taken from the seg maps, so commands, keys and math are never checked) | L | 2 |
| RV2 | Grammar, refinements | Y | partial UI/proofing_pane.rs | N | – | BUILD (Harper, offline, Apache 2.0, in WASM; English) | L | 3 |
| RV3 | Thesaurus (Shift+F7), synonyms on right click | Y | Y RB/review.rs:9, EN/review.rs:140 | N | replaces the word | BUILD (offline thesaurus data, pinned) | M | 3 |
| RV4 | Word Count (Ctrl+Shift+G): pages, words, characters with/without spaces, paragraphs, lines; footnotes; "x of y words" | Y | Y RB/review.rs:10-17, EN/review.rs:75, UI/chrome.rs:1099 | partial: whole document's words and pages in the status bar (`src/app.js:801`) | – (texcount's rules: text words; math and commands out; footnotes and captions optional) | BUILD | S | 1 |
| RV5 | Read Aloud (Ctrl+Alt+Space) | Y | Y RB/review.rs:21, EN/speech.rs:17 | N | – | BUILD (`speechSynthesis`, the system's local voices) | S | 3 |
| RV6 | Translate | Y | Y RB/review.rs:27 | partial: Ask Claude in the claude.ai copy | – | SKIP: a translation service; documents never leave the browser | – | – |
| RV7 | Language: proofing language, do not check, document language | Y | Y RB/review.rs:28, RB/language.rs:378 | partial: babel's language sets the page's `lang` (`src/app.js:644`) | document `\usepackage[ngerman]{babel}`; selection `\foreignlanguage{french}{…}` | BUILD | S | 2 |
| RV8 | Delete comment, delete all, edit comment | Y | Y RB/review.rs:33, EN/review.rs:32-35 | partial: Resolve removes a thread (`src/collab.js:398`); no edit, no delete all | rewrites or removes the `% comment` lines | BUILD | S | 2 |
| RV9 | Previous, Next comment | Y | Y RB/review.rs:41-49 | N | – | BUILD | S | 2 |
| RV10 | Reply, Resolve | Y | Y EN/review.rs:29,36 | Y (`src/collab.js:357`, `398`) | `% reply (Name): …` | ALREADY BETTER: replies travel inside the .tex | – | – |
| RV11 | Show Comments (pane, on the page) | Y | Y RB/review.rs:52 | Y Review panel (`src/collab.js:408`), marks on the page | – | ALREADY BETTER: the same threads in every copy of the file | – | – |
| RV12 | @mentions, assign a comment | Y | N | N | – | SKIP: needs accounts | – | – |
| RV13 | Track Changes on/off (Ctrl+Shift+E), for everyone, lock | Y | Y RB/review.rs:56, EN/review.rs:47 | partial: edits tracked against a chosen version (`src/app.js:3546`); a coauthor's link or Word file arrives as tracked changes; no switch | nothing in the source until accepted: changes are the difference to the base version | BUILD (on: track from now; off: accept all and stop) | M | 1 |
| RV14 | Display for Review: Simple, All, No Markup, Original | Y | Y RB/review.rs:59-71 | partial: "Show on pages" on/off (`src/app.js:3587`) | – | BUILD | S | 2 |
| RV15 | Show Markup: insertions/deletions, formatting, comments, by person | Y | N | N | – | BUILD | S | 3 |
| RV16 | Reviewing pane | Y | Y RB/review.rs:74 | Y Review panel with Accept/Reject (`src/app.js:4067`) | – | ALREADY BETTER: each change is a source hunk, shown on the page and in the source | – | – |
| RV17 | Accept, Reject: this, and move to next, all, all and stop tracking | Y | Y RB/review.rs:85-95 | partial: one at a time (`src/app.js:3559`, `3575`) | – | BUILD | S | 1 |
| RV18 | Previous, Next change | Y | Y RB/review.rs:98-106 | N | – | BUILD | S | 2 |
| RV19 | Changes in the PDF | Y | Y UI/backstage.rs:887 | N | a print copy with the `changes` package: `\added{}`, `\deleted{}`, `\replaced{new}{old}`; never in the main file | BUILD | M | 2 |
| RV20 | Compare (blackline), Combine | Y | Y RB/review.rs:110, DG/dialogs_review.rs | partial: compare with a kept version (`src/app.js:3595`); a coauthor's copy merged (`src/collab.js:247`) | – | BUILD (compare with a dropped .tex or .zip) | S | 3 |
| RV21 | Restrict editing (comments only), block authors | Y | Y RB/review.rs:113-114, EN/protect.rs:24 | N | – | BUILD (a "comments only" share link role; not protection) | S | 3 |
| RV22 | Hide ink | Y | Y RB/review.rs:118 | N | – | SKIP: no ink (DR1) | – | – |
| RV23 | Real time coauthoring with presence | Y | N | partial: links merged three ways | – | SKIP: needs a relay server; Rikuy merges copies instead | – | – |

### View

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| V1 | Read Mode (column width, page colour, text size) | Y | Y RB/view.rs:10, RB/tabs.rs:19-101 | partial: Preview shows the PDF beside the page | – | BUILD (reading view: the PDF across the window) | S | 3 |
| V2 | Print Layout | Y | Y RB/view.rs:11 | Y the typeset page | – | ALREADY BETTER: set as TeX sets it, the real PDF one click away | – | – |
| V3 | Web Layout, Draft (no page breaks) | Y | Y RB/view.rs:12-15 | N | – | BUILD (continuous: `Layout.plan` without page cuts) | S | 3 |
| V4 | Outline: promote/demote (Alt+Shift+←/→), move (Alt+Shift+↑/↓), expand/collapse, show level, first line only | Y | Y RB/view.rs:140-206, EN/outline.rs:61-172 | partial: Outline panel lists headings, a click goes there (`src/app.js:3377`) | promote/demote the heading and every heading under it (`\subsection` to `\section`); move a section's source (its heading to the next heading of its level); collapse is the page's only | BUILD | M | 2 |
| V5 | Focus mode | Y | Y RB/view.rs:21 | N | – | BUILD (bars hidden) | S | 3 |
| V6 | Immersive Reader | Y | Y RB/view.rs:22 | N | – | SKIP: Microsoft's service; RV5 reads aloud | – | – |
| V7 | Page movement: vertical, side to side | Y | Y RB/view.rs:25-26 | Y Vertical and Side to Side (task 68 added Vertical) | – | BUILT | S | 3 |
| V8 | Ruler | Y | Y RB/view.rs:32, UI/canvas/rulers.rs | N | dragging a margin writes geometry; an indent marker writes H50's lengths | BUILD | M | 3 |
| V9 | Gridlines | Y | Y RB/view.rs:36 | Y View › Gridlines (task 68): the text's baselines and every centimetre, the screen only | – | BUILT | – | – |
| V10 | Navigation Pane: headings, pages, results | Y | Y RB/view.rs:40, UI/panes/nav.rs:4 | partial: Outline panel is the headings (Ctrl+Shift+O); no pages, no results (H75) | – | BUILD (Pages tab of thumbnails; object filters for results) | M | 3 |
| V11 | Zoom: dialog, 100%, one page, multiple pages, page width | Y | Y RB/view.rs:51-77 | Y the Zoom dialog (task 68): 200, 100, 75 %, Page width, Text width, Whole page, Many pages, a percent | – | BUILT | S | 3 |
| V12 | Dark mode for the page | Y | Y RB/view.rs:80 | partial: the interface follows the system; the page stays white (`src/app.css:83`, `513`) | – | BUILD (a dark page toggle, page only) | S | 3 |
| V13 | New window, arrange, split, side by side, synchronous scrolling, switch | Y | Y RB/view.rs:96-121 | Y Split (task 68): a second view under the first, kept current, scrolled on its own | – | BUILT Split; New Window SKIP: two tabs on one project would save over each other | – | – |
| V14 | Macros (record, run VBA) | Y | Y RB/view.rs:131 | partial: `window.rikuy.api`; LaTeX's own `\newcommand` | – | SKIP: VBA; the scripting surface is `window.rikuy.api` | – | – |

### Help

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| HL1 | Help, shortcuts, what's new, contact, feedback | Y | Y RB/review.rs:175-178 | partial: Help dialog (`src/app.js:5368`), llms.txt, issue links | – | BUILD (Help tab: How it works, Keyboard shortcuts, What's new, Report a problem, For AI agents) | S | 3 |
| HL2 | Search for a command (Alt+Q) | Y | Y UI/chrome.rs:539, DG/find.rs:156 | partial: the insert list | – | BUILD (over the command registry; Word's names and synonyms) | S | 2 |

### Developer (off by default in Word)

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| DV1 | Content controls: text, check box, drop-down, date | Y | Y RB/review.rs:125-148 | N | PDF form fields: `\begin{Form}\TextField[name=x]{Name}\CheckBox[name=y]{Agree}\ChoiceMenu[combo]{Pick}{a,b}\end{Form}` (hyperref) | BUILD | M | 3 |
| DV2 | Visual Basic, XML mapping, add-ins, legacy tools | Y | partial RB/review.rs:154-170 | N | – | SKIP: Office plumbing | – | – |

### Contextual: Table Design and Table Layout

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| T1 | Table styles gallery | Y | Y RB/table.rs:28-70 | N | grid (`\|l\|l\|`, `\hline` each row), booktabs (`\toprule`, `\midrule`, `\bottomrule`), plain, banded (`\rowcolors{2}{gray!10}{}` with `\usepackage[table]{xcolor}`) | BUILD | M | 2 |
| T2 | Style options: header row, total row, banded rows/columns, first/last column | Y | Y RB/table.rs:6-25 | N | header: rule after row 1 and `\textbf` cells; banded `\rowcolors`; first column bold `>{\bfseries}l` (array) | BUILD | M | 3 |
| T3 | Shading of cells, rows | Y | Y RB/table.rs:84-94, EN/table.rs:94 | partial: cell colours drawn (PLAN version 31) | `\cellcolor{yellow!20}`, `\rowcolor{…}` | BUILD | S | 2 |
| T4 | Borders (all, outside, inside, none, top, bottom), weight, colour, painter | Y | Y RB/table.rs:99-112, EN/table.rs:99 | partial: renders `\|`, `\hline`, `\cline`, booktabs | `\|` in the spec, `\hline`, `\cline{2-3}`, `\setlength{\arrayrulewidth}{1pt}`, `\arrayrulecolor{gray}` (colortbl) | BUILD | M | 2 |
| T5 | Select cell, column, row, table | Y | Y RB/table.rs:185-190 | N | – | BUILD | S | 2 |
| T6 | View gridlines | Y | Y EN/view.rs:81 | Y View Gridlines (task 68): every cell's edge dashed on the page, kept for the next visit | – | BUILT: the page only, as Word's (the PDF is unchanged) | – | – |
| T7 | Properties: width, alignment, row height, column width, vertical alignment, alt text | Y | Y RB/table.rs:208, EN/table.rs:227 | Y Table Properties in Word's tabs (task 68): Preferred width, alignment, text wrapping, cell margins, row height, repeat as header row, column width, vertical alignment, alt text | `\begin{tabularx}{0.8\linewidth}{…}`; `\begin{wraptable}{r}{0.45\linewidth}` (wrapfig); `\setlength{\tabcolsep}{8pt}`; `longtable` with `\endhead` | BUILT | M | 2 |
| T8 | Delete cells, columns, rows, table | Y | Y RB/table.rs:222-227, EN/table.rs:48-51 | N | the row with its `\\`; the column's cell in every row and its letter in the spec; the float | BUILD | S | 1 |
| T9 | Insert rows above/below, columns left/right | Y | Y RB/table.rs:230-256, EN/table.rs:44-47 | partial: Ctrl+Enter adds a row below (`src/app.js:2084`) | ` & & \\`; a column: `&` in each row and a letter in the spec | BUILD | S | 1 |
| T10 | Tab in the last cell adds a row | Y | Y | N (Tab stops at the last cell, `src/app.js:2068`) | as T9 | BUILD | S | 1 |
| T11 | Merge cells | Y | Y RB/table.rs:260, EN/table.rs:69 | partial: renders `\multicolumn`, `\multirow` (`src/model.js:1460`) | across `\multicolumn{2}{c}{…}`; down `\multirow{2}{*}{…}` (multirow) | BUILD | M | 2 |
| T12 | Split cells, split table | Y | Y RB/table.rs:261-262 | N | undoes a `\multicolumn`/`\multirow`; two `tabular`s | BUILD | S | 3 |
| T13 | AutoFit: contents, window, fixed | Y | Y RB/table.rs:266-269, EN/table.rs:127 | N | contents `l c r`; window `tabularx` with `X`; fixed `p{}` | BUILD | S | 2 |
| T14 | Distribute rows/columns; height and width fields | Y | Y RB/table.rs:273-283, EN/table.rs:128-152 | N | equal `p{}` widths; `\arraystretch` | BUILD | S | 3 |
| T15 | Cell alignment (nine positions) | Y | Y RB/table.rs:291-299, EN/table.rs:101 | partial: renders `l c r` per column | a column: its letter; one cell `\multicolumn{1}{c}{…}`; vertical `m{}`, `b{}` | BUILD | S | 2 |
| T16 | Text direction in a cell | Y | Y RB/table.rs:304, EN/table.rs:125 | N | `\rotatebox{90}{…}` | BUILD | S | 3 |
| T17 | Cell margins | Y | Y RB/table.rs:305 | N | `\setlength{\tabcolsep}{8pt}` | BUILD | S | 3 |
| T18 | Sort rows | Y | Y RB/table.rs:308, EN/table.rs:197 | N | reorders the rows' source | BUILD | S | 3 |
| T19 | Repeat header rows (across pages) | Y | Y RB/table.rs:313, EN/table.rs:171 | partial: `longtable` from Word import (`src/wordjobs.js:1000`) | `\begin{longtable}{ll} head \\ \midrule \endhead … \end{longtable}` | BUILD | M | 2 |
| T20 | Convert table to text | Y | Y RB/table.rs:318, EN/table.rs:199 | N | rows to paragraphs, cells joined by a separator | BUILD | S | 3 |
| T21 | Formula (=SUM(ABOVE)) | Y | Y RB/table.rs:319, EN/table_formula.rs | Y Formula and Update Formulas (task 68, `src/formula.js`): Word's functions, ABOVE/LEFT/BELOW/RIGHT, cells, ranges, number formats | the value in the cell; `% formula B5: =SUM(ABOVE) \# "0.00"` before the table | BUILT: Rikuy computes and writes the value (the table compiles anywhere); Update Formulas computes again where Word's F9 would; the line names a cell, so a row added above moves no formula | – | – |

### Contextual: Picture Format

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| P1 | Size: handles, width/height, lock aspect ratio | Y | Y RB/picture.rs:127, UI/objects.rs | N | `\includegraphics[width=0.5\linewidth]{}` (a fraction of `\linewidth`); `height=`, `keepaspectratio` | BUILD | M | 1 |
| P2 | Crop | Y | Y RB/picture.rs:146-163, UI/crop.rs | N | `\includegraphics[trim=1cm 0 1cm 0,clip]{}` | BUILD | M | 2 |
| P3 | Alt text | Y | Y RB/picture.rs:116 | N | `\includegraphics[alt={A chart of …}]{}` (graphicx key used by LaTeX tagging); Word alt text on export | BUILD | S | 2 |
| P4 | Remove background, corrections, colour, artistic effects, transparency | Y | Y RB/picture.rs:9-60 | N | – | SKIP: edits the picture file, not the document | – | – |
| P5 | Compress pictures | Y | N | N | – | SKIP: TeX embeds the file as it is | – | – |
| P6 | Change picture, reset picture | Y | Y RB/picture.rs:84-85 | N | replaces the file, keeps the line (reset drops its options) | BUILD | S | 3 |
| P7 | Picture border; styles and effects | Y | Y RB/picture.rs:88-111 | N | border `\fbox{\includegraphics…}` with `\fboxsep=0pt`; effects have no form | BUILD (border) | S | 3 |
| P8 | In line with text vs floating | Y | Y | partial: always a `center` block (`src/app.js:4696`) | in line: `\includegraphics[height=1em]{}` in the sentence; floating: `figure` | BUILD | S | 2 |

### Contextual: Equation

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| E1 | Structures: fraction, script, radical, integral, large operator, bracket, function, accent, limit, operator, matrix | Y | Y UI/equation_tab.rs:403 | partial: MathLive keys and its keyboard; Word style typing (`src/wordmath.js`) | `\frac{}{}`, `^{}`, `\sqrt[]{}`, `\int_{}^{}`, `\sum_{}^{}`, `\left(\right)`, `\hat{}`, `\lim_{}`, `\begin{pmatrix}…\end{pmatrix}` | BUILD (Equation tab while the field is open) | M | 2 |
| E2 | Symbols: basic math, Greek, arrows, negated relations, geometry | Y | Y UI/equation_tab.rs:402 | partial: list in Help (`src/app.js:5425`) | the commands | BUILD | S | 2 |
| E3 | Professional / Linear, Normal Text | Y | Y UI/canvas/context_menu.rs:37-38 | Y Convert (Professional, Linear), Unicode or LaTeX, Normal Text (task 68, `src/unimath.js`) | `\text{…}` | BUILT: Linear as Word's UnicodeMath, typed back into LaTeX | – | – |
| E4 | Equation number, inline ↔ display | Y | Y UI/canvas/context_menu.rs:39 | partial: numbered, unnumbered, align, gather (`src/app.js:2585`); no inline ↔ display | `equation` ↔ `equation*`; `$…$` ↔ `\begin{equation}` | BUILD (inline ↔ display) | S | 2 |
| E5 | Save as new equation; math options | Y | Y UI/equation_tab.rs:409 | partial: user macros kept by name (`test/mathfield.py`) | saved snippets in the gallery (browser storage) | BUILD | S | 3 |
| E6 | Alt+= (Mac Ctrl+=) | Y | Y EN/equation.rs:29 | N ($ and Ctrl+M) | display on an empty line, inline in text | BUILD | S | 2 |

### Status bar

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| S1 | Page x of y (click: Go To) | Y | Y UI/chrome.rs:778 | partial: "n pages" (`src/app.js:804`) | – | BUILD | S | 2 |
| S2 | Proofing and language indicators | Y | Y UI/chrome.rs:822 | N | – | BUILD | S | 3 |
| S3 | Track Changes indicator | Y | Y UI/chrome.rs:835 | N | – | BUILD | S | 3 |
| S4 | View buttons, Focus, zoom slider | Y | Y UI/chrome.rs:911-941 | partial: zoom in the top bar | – | BUILD | S | 3 |
| S5 | Overtype, Caps Lock, macro recording | Y | Y UI/chrome.rs:862 | N | – | SKIP: overtype is off by default and unasked for; no VBA | – | – |
| S6 | Saved state, offline, PDF status | partial | Y UI/chrome.rs:434 | Y "Kept in this browser", PDF status, Make available offline | – | ALREADY BETTER: says where the document is and whether it works offline | – | – |

### Right click menus

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| C1 | Text: paste options, Font…, Paragraph…, Link, New Comment, Show in source, Ask Claude; spelling and synonyms | Y | Y UI/canvas/context_menu.rs:57-126 | partial: the browser's menu (its spelling suggestions work); the selection bubble (`src/template.html:130-137`) | – | BUILD (Rikuy's menu; Shift+F10 and the Menu key; spelling items with RV1, until then the browser's menu over a misspelled word) | M | 2 |
| C2 | Table: insert, delete, merge, split, distribute, autofit, direction, properties, caption | Y | Y UI/canvas/context_menu.rs:168-207 | N | T rows | BUILD | S | 2 |
| C3 | Picture: change, size and crop, wrap, alt text, caption | Y | Y UI/canvas/context_menu.rs:140-162 | N | P rows | BUILD | S | 2 |
| C4 | Equation: number, inline/display, linear | Y | Y UI/canvas/context_menu.rs:37-40 | partial: the popover (`src/app.js:2549`) | E rows | BUILD | S | 3 |
| C5 | Heading: promote, demote, collapse, new heading before/after, select with content | Y | Y EN/outline.rs:90-98 | N | V4 | BUILD | S | 3 |
| C6 | Field and TOC: update, edit, toggle codes | Y | Y UI/canvas/context_menu.rs:129-136 | Y always current; Alt+click shows the source | – | ALREADY BETTER | – | – |
| C7 | Link: edit, open, copy, remove | Y | Y | partial: Ctrl+click opens | I19, I20 | BUILD | S | 2 |

### AutoCorrect and AutoFormat as you type

| ID | Feature | Word | WordCraft | Rikuy now | LaTeX it writes | Verdict | Eff | Pri |
|---|---|---|---|---|---|---|---|---|
| A1 | Smart quotes | Y | Y DG/dialogs_review.rs:409 | Y `"` becomes ``` `` ``` and `''` (`src/editor.js:346`) | TeX quotes; csquotes `\enquote{}` where the preamble loads it | ALREADY BETTER: right in every engine and language set up | – | – |
| A2 | Hyphens to dashes | Y | Y DG/dialogs_review.rs:413 | Y `--`, `---` are TeX's dashes | – | ALREADY BETTER: the source keeps `--`, the PDF sets the dash | – | – |
| A3 | Automatic lists ("- ", "* ", "1. ", "a) " at a paragraph's start) | Y | Y DG/dialogs_review.rs:417-418 | N | `itemize`; `enumerate` (`[label=\alph*)]` for "a) ") | BUILD | S | 1 |
| A4 | \*Bold\* and \_italic\_ | Y | Y DG/dialogs_review.rs:412 | N | `\textbf{}`, `\emph{}` | BUILD | S | 3 |
| A5 | Internet addresses as links | Y | Y DG/dialogs_review.rs:414 | N | `\url{https://…}` | BUILD | S | 2 |
| A6 | Ordinals (1st), fractions (1/2) | Y | Y DG/dialogs_review.rs:410-411 | N | `1\textsuperscript{st}`; `\nicefrac{1}{2}` (units) or ½ | BUILD (off by default) | S | 3 |
| A7 | Border lines (`---` Enter) | Y | Y DG/dialogs_review.rs:419 | N | `\noindent\rule{\linewidth}{0.4pt}` | BUILD | S | 3 |
| A8 | Headings while typing ("# ", "## ") | Y (AutoFormat) | Y DG/dialogs_review.rs:420 | N | `\section{}`, `\subsection{}` | BUILD | S | 2 |
| A9 | Capitalise sentences, table cells, days; TWo INitial CApitals; Caps Lock | Y | Y DG/dialogs_review.rs:442-456 | N | text edits | BUILD | S | 3 |
| A10 | Replace text as you type ((c), (r), (tm), ..., ->, <=, :)) with its list | Y | Y DG/dialogs_review.rs:457 | partial: in equations (`src/wordmath.js`) | `\copyright`, `\textregistered`, `\texttrademark`, `\ldots`, `\textrightarrow` | BUILD | S | 2 |
| A11 | Math AutoCorrect (\alpha to α) | Y | Y DG/dialogs_review.rs:399 | Y in equations; a typed `\` opens the insert list | – | ALREADY BETTER: inside math it is LaTeX | – | – |
| A12 | Period with double space; indents set with Tab | Y | Y DG/dialogs_review.rs:415,422 | N | – | SKIP: a phone habit and Word's indents; LaTeX sets paragraph indents itself | – | – |

## 2. The UI: Word's tabs over Rikuy's page

### Bars

- **Top bar** keeps what it has (Outline and problems, name, Open, Preview, Share, Undo, Redo,
  zoom, Ask Claude, Source, Help) and gains Word's search box in the middle: "Search" (Alt+Q,
  HL2), which runs any command by Word's name or a synonym ("Bullets" finds "Bulleted list").
- **Ribbon**: a `tablist` named "Ribbon"; each tab a `tabpanel` holding a `toolbar` named after the
  tab. Tabs in Word's order: **File, Home, Insert, Design, Layout, References, Review, View,
  Help**; contextual tabs after Help, in an accent colour, while their object has the caret:
  **Table Design, Table Layout, Picture Format, Equation, Header & Footer**. No Draw, no Mailings
  (SKIP). The **Download** group (PDF, Word, LaTeX) stays pinned at the row's right end in every
  tab, as now.
- **Status bar** gains page x of y, "x of y words", language, Track Changes, zoom slider.

### What each tab holds (groups in order)

| tab | groups |
|---|---|
| File | a panel, not a row: New (blank, templates F2), Open, Recent (F4), Info (properties F5, inspect F7, accessibility F8, versions), Save a copy (Download PDF, Word, LaTeX; Export as F12), Print (F13), Share, Options (F19, F20, F22) |
| Home | Clipboard (Paste▾, Cut, Copy, Format Painter) · Font (font box, size box, Grow, Shrink, Change Case▾, Clear Formatting; Bold, Italic, Underline▾, Strikethrough, Subscript, Superscript, Text Highlight Color▾, Font Color▾, More▾ for small caps, all caps, border, shading) · Paragraph (Bulleted list▾, Numbered list▾, Multilevel list▾, Decrease Indent, Increase Indent, Sort, Show marks; Align Left, Center, Align Right, Justify, Line spacing▾, Shading▾, Borders▾) · Styles (the gallery, LaTeX on its first page) · **Insert** (Rikuy's own: Formula, Equation, Table, Picture, Footnote, Citation, Link, the current buttons with their ids) · Editing (Find, Replace, Select▾) |
| Insert | Pages (Cover page▾, Blank page, Page break) · Tables (Table▾ grid, Insert table…, Convert text to table, Table from data) · Illustrations (Picture, Shapes▾, Icons, SmartArt, Chart, Screenshot) · Links (Link, Bookmark, Cross-reference) · Comments (Comment) · Header & Footer (Header▾, Footer▾, Page number▾) · Text (Text box, Quick Parts▾, Drop Cap▾, Date & Time, Field▾, Text from file) · Symbols (Equation▾ gallery, Symbol▾) · LaTeX (Environment▾, LaTeX paragraph, Live figure) |
| Design | Document formatting (Look gallery, Colors▾, Fonts▾, Paragraph spacing▾, Set as default) · Page background (Watermark▾, Page color▾, Page borders) |
| Layout | Page setup (Margins▾, Orientation▾, Size▾, Columns▾, Breaks▾, Line numbers▾, Hyphenation▾, Page setup…) · Paragraph (indent and spacing fields) · Arrange (Position▾, Wrap text▾, Rotate▾) · Document (class▾, base size▾, one/two sided) |
| References | Table of contents (Table of contents▾, Add text▾) · Footnotes (Footnote, Endnote, Next footnote▾, options) · Citations & bibliography (Citation, Add source, Manage sources, Style▾, Bibliography▾) · Captions (Caption, List of figures▾, Cross-reference) · Index (Mark entry, Insert index) · Table of authorities (Mark citation, Insert table of authorities) |
| Review | Proofing (Spelling, Thesaurus, Word count) · Speech (Read aloud) · Accessibility (Check) · Language▾ · Comments (New comment, Delete▾, Previous, Next, Show comments) · Tracking (Track changes, Display for review▾, Show markup▾, Reviewing pane) · Changes (Accept▾, Reject▾, Previous, Next) · Compare▾ (with a version, with a file) · Versions (Save version, Versions) |
| View | Views (Page, Continuous, Read mode, Source, Preview) · Show (Ruler, Navigation pane, Marks) · Zoom (Zoom, 100%, One page, Multiple pages, Fit width) · Page (Dark page, Focus) |
| Help | Help, Keyboard shortcuts, What's new, Report a problem, For AI agents |
| Table Design / Table Layout | T1–T4 / Select▾, Properties, Delete▾, Insert above/below/left/right, Merge, Split, Split table, AutoFit▾, Distribute, Alignment (nine), Text direction, Cell margins, Sort, Repeat header rows, Convert to text, Caption |
| Picture Format | Size (width field, Crop), Arrange (Position, Wrap, Rotate), Alt text, Border, Change picture, Caption |
| Equation | Tools (gallery, Numbered▾, Inline/Display), Symbols, Structures; never takes the focus from the math field |
| Header & Footer | Header▾, Footer▾, Page number▾, Date, Document info▾, Picture, Different first page, Different odd & even, Position, Close |

**What moves.** Nothing leaves Home: the current buttons (style gallery, Bold, Italic,
Underline, lists, the seven Insert buttons) stay there with their ids and names, so every flow
`test/agent.py` and `llms.txt` describe still works without switching tabs. Insert and
References carry their own copies (`ri-*` ids) of Picture, Table, Link, Footnote, Citation with
the same names; only one panel is in the accessibility tree at a time, so a name is never
ambiguous. Save and Copy source stay where they are. The insert list (`\`) stays.

**Width.** `ribbonFit` (`src/ribbon.js:493`) generalises to groups: each group has a fold rank;
as the row shrinks, labels go, then low rank groups fold into one button named after the group
("Paragraph") that opens a menu with the same names; below 860 px the tabs become a combobox
"Ribbon tab" over one scrolling row, and the style list replaces the gallery (as now).

### Keys (Ctrl is Cmd on a Mac unless said)

Captured only while the caret is on the page (`#pages`), never in fields, the source or the PDF;
Ctrl+Alt chords only when `e.key` is the plain character and `getModifierState('AltGraph')` is
false (German AltGr+2 types ², AltGr+0 types }); nothing while an input method composes.

| Word key | action | Rikuy now | proposal | note |
|---|---|---|---|---|
| Ctrl+B, I, U | bold, italic, underline | Y | keep (U writes `\uline`, H15) | |
| Ctrl+Shift+X | strikethrough (WordCraft; Word has none) | – | add | |
| Ctrl+= / Ctrl+Shift+= | subscript / superscript | zoom (`src/app.js:1178`) | **Ctrl+, / Ctrl+.** (Google Docs' keys); Ctrl+= stays zoom | browser and Rikuy zoom |
| Ctrl+Shift+A, Ctrl+Shift+K | all caps, small caps | – | add | Chrome: tab search on Ctrl+Shift+A, Firefox: console on Ctrl+Shift+K; page may take them |
| Ctrl+Alt+H | highlight | – | add | |
| Ctrl+D | Font dialog | – | add | Chrome bookmark; preventable |
| Ctrl+Shift+F, Ctrl+Shift+P | font box, size box | – | Ctrl+Shift+F only | Firefox reserves Ctrl+Shift+P (private window) |
| Ctrl+Shift+> / < | grow / shrink | – | add | |
| Ctrl+] / Ctrl+[ | grow / shrink 1 step | – | Windows and Linux only | Mac Cmd+[ ] are Back/Forward |
| Shift+F3 | change case | – | add | |
| Ctrl+Space | clear character formatting | – | add, not on Mac | Mac input source switch; IME toggle on some systems |
| Ctrl+Q | reset paragraph | – | not on Mac or Linux Firefox | Cmd+Q quits |
| Ctrl+L, E, R, J | align left, centre, right, justify | – | add on the page | address bar, search, reload, downloads elsewhere; Chromium lets a page take them |
| Ctrl+M, Ctrl+Shift+M | indent, outdent | Ctrl+M = Formula | **keep Ctrl+M = Formula** (public, `llms-full.txt`); indent by buttons and Tab in lists | Chrome Ctrl+Shift+M = profiles |
| Ctrl+T, Ctrl+Shift+T | hanging indent | – | none | reserved (new tab, reopen tab) |
| Ctrl+1, 2, 5 | line spacing | – | none (menu) | tab switching |
| Ctrl+0 | space before | zoom 100% | keep zoom | |
| Ctrl+Alt+1, 2, 3 | Heading 1–3 | – | add; Ctrl+Alt+4 = Heading 4 | AltGr guard |
| Ctrl+Shift+N | Normal style | – | **Ctrl+Alt+0** | Chrome reserves Ctrl+Shift+N |
| Ctrl+Shift+S | Apply Styles | – | add | Firefox screenshot; preventable |
| Ctrl+Shift+L | bullets | – | add | |
| Ctrl+Shift+C / V | copy / paste formatting | Ctrl+Shift+V = paste text only | button only for formatting; Ctrl+Shift+V stays text only (Word 365 now does the same) | Ctrl+Shift+C opens DevTools' picker |
| Ctrl+Alt+M | comment | Y | keep | |
| Ctrl+Shift+E | Track Changes | numbered equation | **Ctrl+Shift+E = Track Changes**; numbered equation by Alt+= on an empty line (Word's), or the Equation button | public key change |
| Alt+= (Mac Ctrl+=) | equation | – | add: display on an empty line, inline in text | Mac Option+= types ≠ |
| Ctrl+K | hyperlink | insert list | **Ctrl+K = Link** (Word); the insert list keeps `\` and gains Alt+Q's search | public key change |
| Ctrl+Alt+F, Ctrl+Alt+D | footnote, endnote | – | add (D not on Mac: Dock) | |
| Alt+Shift+X, Alt+Shift+I | mark index entry, citation | – | add | |
| Ctrl+F, H, G | find, replace, go to | browser's | add on the page | Ctrl+H history, Ctrl+G find next elsewhere |
| F5 | Go To | – | none | reload |
| F7, Shift+F7 | spelling, thesaurus | – | add | F7 caret browsing; preventable |
| Ctrl+Shift+G | word count | – | add | find previous; preventable |
| Ctrl+Enter | page break | new table row | **page break outside tables**; in a cell it stays a new row | |
| Shift+Enter | line break | Y | keep | |
| Ctrl+Shift+Enter | column break | – | add | |
| Ctrl+Shift+Space | nonbreaking space | – | add (`~`) | |
| Ctrl+Shift+- | nonbreaking hyphen | zoom out (`_`) | take `_` off zoom; add | |
| Ctrl+- | optional hyphen | zoom out | keep zoom | |
| Ctrl+Alt+-, Ctrl+num- | em dash, en dash | – | add | |
| Ctrl+Alt+C, R, T, . | © ® ™ … | – | add, AltGr guard | |
| Alt+Shift+D, T, P | date, time, page field | – | add | |
| Alt+Shift+↑/↓/←/→ | move paragraph; promote, demote | – | add | |
| Ctrl+Shift+8 | show marks | – | add | |
| Ctrl+Alt+P, O, N | print layout, outline, draft | – | Ctrl+Alt+O = Outline view; others none | |
| Ctrl+P | print | Preview | **Print view** (preview with Print); Preview button unchanged | |
| Ctrl+S, Ctrl+O, Ctrl+Z, Ctrl+Y, Ctrl+A | save, open, undo, redo, all | Y | keep | |
| Ctrl+N, Ctrl+W, F12 | new, close, save as | – | none | reserved or DevTools |
| Ctrl+F1, Alt / F10 | ribbon, KeyTips | – | Ctrl+F1; KeyTips on F10 in the installed app | Alt opens browser menus |
| Shift+F10, Menu | context menu | browser's | Rikuy's menu (C1) | |
| Tab / Shift+Tab | next cell; list level | cells | add list level (H37); Tab in the last cell adds a row (T10) | |

### Names for agents

- Every control comes from one command registry entry (`{id, name, tab, group, keys, when, run}`);
  the name is Word's unless Rikuy already has one. `build/app.mjs` writes `llms.txt`'s control list
  and `dist/controls.json` from it; `test/agent.py` reads `dist/controls.json` instead of its
  hand written `NAMES` (`test/agent.py:42`) and checks every entry at 1400 and 390 px.
- **No renames.** The 42 names in `NAMES` keep their text and ids ("Bulleted list" and "Numbered
  list" stay; Word's "Bullets" and "Numbering" go in the tooltip and the search synonyms;
  "Formula" stays beside Word's "Equation").
- **Interface changes to announce** (Help, `llms-full.txt`, README, tests): the ribbon's
  `toolbar` "Formatting, inserting and downloading" becomes the `tablist` "Ribbon" with one
  `toolbar` per tab; keys Ctrl+K (insert list → Link), Ctrl+Shift+E (equation → Track Changes),
  Ctrl+Enter outside tables (→ page break), Ctrl+P (Preview → Print view, which shows the PDF);
  the Link button writes `\href` when the text differs from the address.
- Dialogs keep the rule of task 34: role `dialog`, their title as name, a Close button, Escape.
  Split buttons: the main part has the command's name, the arrow "<name> options".
- `window.rikuy.api` may add `commands()` and `run(id, args)` over the same registry (a new
  version of the frozen object; additions only).

## 3. Build plan

### Land first: B0, the frame (one agent, L)

Rows: HL2 (command search), C1's menu frame (its spelling items come with B10), and the
frame every other row needs.

- **New**: `src/commands.js` (registry; every batch registers in its own module; cross batch
  calls go by command id, never by import); `src/cmd/index.js` importing one stub module per
  batch (each batch replaces only its stub); `src/ribbon/tabs.js` (tablist, panels, contextual
  tabs, folding generalised from `ribbonFit`, roving focus from `ribbonRove`);
  `src/ribbon/order.js` (tab and group order, every group of §2 declared, hidden while empty);
  `src/ui/kit.js` (split button, menu, gallery, colour picker with theme and xcolor names,
  number field with units, dialog shell); `src/ui/menu.js` (right click menus by context, built
  from the registry); `src/ui/search.js` (Alt+Q); `src/keys.js` (the chord table of §2, page
  only capture, AltGr and Mac rules).
- **Pure helpers every batch uses**, each with a unit test file: `src/preamble.js`
  (`usePackage`, option merging, class options, key=value of geometry/hyperref/enumitem,
  `defineOnce`; replaces `ensurePackages` and the graphicx code of `figureEdits`); `src/wrap.js`
  (inline wrappers with leading arguments, `\textcolor{red}{…}`, `\hl[green]{…}`, equivalence
  groups for hand written forms, split at paragraph breaks and clusters, unwrap, rewrap with a
  new argument, clear all; generalises `toggleStyle`, `src/app.js:2014`); `src/blockenv.js`
  (wrap and unwrap paragraphs in an environment byte for byte; generalises Quote in `restyle`,
  `src/styles.js:102`); `insertText` gets a hook list for AutoCorrect.
- **Moves** so later batches do not share `src/app.js`: the navigation panel to `src/nav.js`
  (B5), the Review panel to `src/review.js` (B10), `toggleList` to `src/cmd/lists.js` (B3), the
  gallery to `src/ui/gallery.js` (B4), the `PALETTE` to the registry.
- **Touches** `src/app.js`, `src/ribbon.js`, `src/template.html`, `src/app.css`,
  `build/app.mjs`, `test/agent.py`, `test/ribbon.py`, `docs/ARCHITECTURE.md`, `AGENTS.md`.
- **Tests**: `test/tabs.py` (tabs by mouse and keys, contextual tabs come and go, folding at
  1400, 1024, 860, 390 px, every registry entry reachable by role and name, no name twice in the
  tree); `test/preamble.test.mjs`, `test/wrap.test.mjs`, `test/blockenv.test.mjs`,
  `test/keys.test.mjs`; `ribbon.py` (265), `agent.py` (118) and `browser.py` (189) green, their
  counts only growing.

### Then in parallel, each in its own worktree

Each batch owns `src/cmd/<area>.js`, `src/ui/<area>*.js`, `test/<area>.py` and
`test/<area>.test.mjs`; its PLAN.md task is numbered now (B0 is task 38, B1 to B13 are 39 to 51) so entries do not
collide.

| batch | rows (the BUILD rows in these ranges) | owns | shared files it touches | depends on | tests |
|---|---|---|---|---|---|
| B1 Character | H4, H6–H12, H15–H31, A4 | `src/cmd/font.js`, `src/ui/fontdialog.js` | `src/model.js` inline table (`:13-23`) and `\hl` colour; `src/wordast.js` cases (`:492`); `src/wordjobs.js` preamble lines (`:1004-1008`) | B0 | `font.py`; `wrap.test.mjs` cases; Word round trip in `word.py` |
| B2 Paragraph | H39, H42–H55, H58, L11, D5 | `src/cmd/para.js`, `src/ui/paradialog.js` | `src/model.js` containers (`:1167-1176`); `src/wordast.js:274` alignment | B0 | `para.py`; `blockenv.test.mjs` |
| B3 Lists | H32–H38, H40, A3 | `src/cmd/lists.js` | `src/model.js` enumitem options | B0 | `lists.py`, `lists.test.mjs` (also the labelled item PLAN task 29 left open) |
| B4 Styles | H59–H74, A8, D1–D4 | `src/styles.js`, `src/ui/gallery.js`, `src/ui/stylespane.js`, `src/cmd/styles.js` | `src/model.js` heading levels, titlesec | B0 | `styles.test.mjs`, `styles.py` (gallery part of `ribbon.py` moves here) |
| B5 Find and outline | H75–H81, V4, V10, S1, C5 | `src/find.js`, `src/nav.js`, `src/cmd/find.js` | none | B0 | `find.test.mjs` (typeset hits to source ranges, replacement through `escapeTeX`), `find.py`, `outline.py` |
| B6 Page | I3, I24–I29, L1–L9, L16, L18, D7–D9, F13 | `src/layout.js`, `src/cmd/page.js`, `src/ui/pagesetup.js`, `src/ui/headerfooter.js` | `src/model.js` `preamble()` (`:320-440`); `src/render.js` page chrome; `src/app.css`; Word page set up both ways | B0 | `page.py`; in `tex.yml`: page size from pypdf's MediaBox, header and line numbers by `pdftotext`; done in four steps: geometry and breaks, columns, header and footer, line numbers and background |
| B7 Tables | I4, I5, I7, I8, T1–T20, C2 | `src/table.js` (a tabular's spec, rows and cells with source ranges), `src/cmd/table.js`, `src/ui/tablepicker.js` | `src/model.js` tabular drawing (`:1429-1470`) | B0 | `table.test.mjs` (every operation and its inverse on strings, on the corpus's tables), `table.py` |
| B8 Pictures and objects | P1–P8, L12–L15, I12–I17, I30, I36, C3 | `src/cmd/picture.js`, `src/ui/handles.js` | `src/model.js` `includegraphics` options (`:1855`); `src/render.js` `atomEl`; `src/wordast.js` size and alt text | B0; B6 for wrapfig's layout (until then a float) | `picture.py` |
| B9 References | R1, R3, R5–R7, R9–R12, R14–R19, I19–I21, C7 | `src/cmd/refs.js`, `src/bib.js`, `src/ui/sourceform.js` | `src/model.js` lists of figures and tables, index, endnotes | B0 | `refs.py`, `bib.test.mjs` (an entry written and read back) |
| B10 Review and proofing | RV1–RV5, RV7–RV9, RV13–RV21, F7, F14, S2, S3 | `src/review.js`, `src/collab.js`, `src/spell/` (worker, Hunspell WASM built by `tex/build_tools.sh` and vendored, dictionaries pinned in `tex/fetch_inputs.sh`, lines in `SOURCES.md` and `NOTICE`; hosted build only) | none | B0 | `review.py`, `spell.py`, `spell.test.mjs` (no command, key or math word flagged on the corpus) |
| B11 Insert, clipboard, AutoCorrect | H2, H3, H82, I1, I2, I31–I33, I38–I40, I44, I45, I47, A5–A7, A9, A10, F19, F20, DV1 | `src/cmd/insert.js`, `src/autocorrect.js`, `src/ui/symbol.js` | none | B0 | `insert.py`, `autocorrect.test.mjs` |
| B12 File, View, Help | F2, F4, F5, F8, F12, F22, H41, Q2, Q3, Q5, Q6, V1, V3, V5, V7, V8, V11, V12, HL1, S4 | `src/cmd/file.js`, `src/cmd/view.js`, `src/ui/backstage.js` | `src/word.js` (Export as), the print path (`src/app.js:5275-5303`) | B0; B6 for the ruler | `file.py`, `view.py` |
| B13 Equation | E1, E2, E4–E6, I42, C4 | `src/cmd/equation.js`, `src/ui/eqtab.js` | `src/app.js` `openMath`/`attachField` (`:2414-2690`, owned here alone) | B0 | `eqtab.py` with `mathfield.py`, `eqextras.py` |

**Shared files and how they stay mergeable.** `src/model.js`: batches add rows to its tables
(inline styles, environments) and touch only the functions their row names; rebase before merge.
`src/layout.js`: B6 alone. `src/wordast.js`, `src/wordjobs.js`: new `case`s and preamble lines
appended per construct. `src/app.css`: one section per batch. `README.md` "What works": one line
per batch, numbers agreeing with `PLAN.md`. Order of merging after B0: any; B8's wrap and B12's
ruler after B6. Every batch runs `npm test`, `npm run test:browser`, `npm run test:agent`,
`npm run test:corpus` (model touched), its own tests, and, for anything a document from someone
else reaches (`src/preamble.js` reading a stranger's preamble, the spell worker, PDF form
fields), the security audit skill's quick profile.

**The round trip rule in each batch's tests** (R, section 0, as code): for every command,
`apply → expect(source) → undo → expect(original bytes) → rebuild → expect(state) →
remove → expect(original bytes)`, then the same on each hand written form, then (TeX job) compile
and look at the PDF, then (Word job) Download Word and open it back. A helper in
`test/browser.py`, `roundtrip(page, doc, select, command, expected, forms)`, written in B0, keeps
each batch's test to a table of cases.

## 4. Already better than both

- The page is typeset from LaTeX with TeX's own PDF beside it (pdfLaTeX, XeLaTeX, LuaLaTeX, real
  TeX Live 2026), SyncTeX both ways; neither Word nor WordCraft has LaTeX or TeX's typesetting.
- Every edit is the smallest patch of a clean `.tex` that Overleaf, git and any TeX open; undo
  gives the bytes back.
- The LaTeX style: a paragraph shown and typed as its source, in the same gallery as Heading 1.
- Math as LaTeX with Word's linear typing, and native Word equations out (Copy for Word, .docx).
- Cross references that name their kind (cleveref), theorem environments, siunitx quantities,
  natbib and biblatex citations from any .bib.
- Sharing without accounts: the document inside the link; a coauthor's edits, from a link or a
  Word file, merged three ways as tracked changes.
- Comments as LaTeX comment lines that survive Overleaf, git and every TeX.
- Automatic versions with compare and restore, and git (clone, commit, push, pull) in the page.
- Live figures that run on the page and print as pictures.
- TikZ, Asymptote with 3D, gnuplot, minted, makeindex and xindy, biber, running in the browser.
- A problems list from TeX's log and the page's model, before and after compiling.
- Offline after one visit, no install, no account; documents never leave the device.
