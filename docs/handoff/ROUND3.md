# What is left of the Word gap list (round 3), by batch

Collected from PLAN.md's "Not done" lines (tasks 37 to 53) and Open tasks, main e863372.
Each item: do it, or say in PLAN.md why it stays undone (only the "by design" ones below may stay).

## By design, stays undone (say so once in PLAN.md, nothing to build)
- Ink equation (I43: handwriting recognition); Word's Equation Options (Rikuy's typing has no math autocorrect switches); Professional and Linear (E3, Show LaTeX covers it)
- KeyTips (Q6: Alt belongs to the browser)
- Draw Table's border painter (T4, I6 skipped by the gap list)
- Numbering a heading as a list (LaTeX numbers headings itself)
- Select text with similar formatting as one multiple selection (Chromium has one range; the places are listed instead)
- Columns of unequal width that flow (no standard package flows text into unequal columns)
- Safari and Firefox by hand (no WebKit or Firefox on this machine; Playwright cannot download them through the proxy)

## R0: Tag the PDF (PLAN.md open task 60)
- Keep `texmf-dist/tex/latex/latex-lab/*.html` in the tree (tex/build_tree.py drops every .html), rebuild reproducibly (Ubuntu's zlib in LD_PRELOAD, see AGENTS.md), update dev/dist-manifest.txt in the same commit, offer File › Check accessibility's Tag the PDF again (`addTaggingLine`, src/cmd/file.js), compile a tagged document on the three engines in file.py.

## R1: paragraphs and the page
- B2: Word import of a foreign .docx's left alignment, line spacing and indents; tab stops beyond the right margin's leader (`tabbing`); the page drawing `\hfill` to the margin; keep with next and widows weighed by the page's own page breaks; spaces shown as dots by Show marks; Show marks for `~` and `\label` (H41).
- B6: landscape for some pages (pdflscape); a picture as watermark; art page borders (pgfornament or tikz); columns for part of a document (multicols around a part, Word's sections); suppressing line numbers for one paragraph (check what exists); Document info in the header (title, author, date fields); `\markright` and `\markboth` written by hand drawn on the page (myheadings).

## R2: font, lists, styles
- B1: Clear All Formatting also resets B2's paragraph formats (call B2's reset); the Format Painter also copies a paragraph's style (double click to keep painting, as Word); underline colour of any colour (not only named); Word import keeps the highlighter colour where pandoc can be helped (docx reader or post process).
- B3: picture bullets (Define New Bullet › Picture: an `\includegraphics` label); Adjust List Indents (enumitem's leftmargin, labelsep, labelwidth); a nested list's bullet carried to Word as far as pandoc allows.
- B4: H63 Subtitle, Author and Date as styles (the title block edited as styles); H65 Code (verbatim) as a style that can be taken off again; H74 Rename a style (the document's own `\newcommand`/`\newenvironment`, every use renamed); D1 the link colour (`\hypersetup` colours with the Design colours); a float between `\paragraph{Lead}` and its text drawn as TeX runs it in.

## R3: tables, pictures and Insert
- B7: a table's alt text (where tagging gives it a field, else a caption note; say which); Height and Width on the Table Layout row where room allows; shading and turned text to Word.
- B8: I12 handles that write a shape's coordinates; Chart's grid opened again on a chart; P7 border colour and weight; rotation by a free angle with the mouse; the wrap's text flow on the page (wrapfigure drawn with text beside it).
- B11: H82 drag to move (text and pictures, as one edit); I1 cover pages (a few templates as `titlepage`); I31 Quick Parts (saved snippets per user, like the equation gallery); I32 and I33 document properties and fields (author, title, date, page, numpages: `\thepage`, lastpage) drawn on the page; DV1 form fields (hyperref's Form: TextField, CheckBox, ChoiceMenu).

## R4: review and references
- B10: RV3 thesaurus (MyThes is C++: build it with Emscripten like Hunspell, data per language lazily and only in the hosted build); RV2 grammar (Harper compiled to WebAssembly is Rust: if a small C/C++ alternative exists use it, else Harper's wasm build pinned by hash, lazily, hosted only; or LanguageTool-like rules in C++; decide by size and quality, measure); RV21 a comments only share link (a role in share links); Display for Review's Original; accept or reject by author (changes carrying an author: the share link's name or the user's initials from AutoCorrect Options/Properties).
- B9: endnote number formats; New Label and Exclude label for captions (newfloat or captionsetup); right aligned index page numbers (the page's drawing of the index); Table of Authorities (a second imakeidx index with categories: Mark Citation's dialog); endnotes, the index and the lists carried into Word export.

## R5: find and view
- B5: collapse a heading's text on the page (Word's triangle; the page hides the section's blocks, the PDF does not change); ^p on the page's text across paragraph ends; finding by environment beyond footnote, caption and LaTeX paragraph.
- B12: V8 the ruler (indents and tab stops from B2's paragraph settings, margins from B6); V3 Draft reflowing to the window as Web Layout; F4 Recent documents rename.

## R6: the arXiv corpus (PLAN.md open task 16)
- Run `.github/workflows/arxiv.yml` (workflow_dispatch) now that the repository is public; classify every failure as task 2 did; write the compile and match rates into PLAN.md and README.
