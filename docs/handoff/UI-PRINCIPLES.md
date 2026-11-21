# Rikuy interface rules

Rules the team tests automatically. Kind of evidence: **S** normative standard (WCAG, CSS), **E** empirical study, **V** vendor convention (Microsoft, Apple, Google), **H** house choice where sources leave a range. Sizes are CSS px at 100% zoom. Microsoft's [Win32 ribbon guide](https://learn.microsoft.com/en-us/windows/win32/uxguide/cmd-ribbons) dates from Windows 7; where today's Word departs from it (a Help tab, ten groups on Insert), Word wins, because matching what users know is external consistency ([NN/g](https://www.nngroup.com/articles/consistency-and-standards/)).

Precondition for section 1: every control carries `data-kind` (large, small, split, field, gallery, separator, group label, tab, dialog button, pane title). Most checks are then one `page.evaluate` over `getComputedStyle` and `getBoundingClientRect`, grouped by kind; states come from Playwright's `emulate_media` (`color_scheme`, `forced_colors`, `reduced_motion`).

## 1. Consistency

| # | Rule | Number | Source | Kind | Test |
|---|---|---|---|---|---|
| C1 | One height per control kind; icon only buttons square | small ribbon control 24; dialog button and field 32; large ribbon button fills the group | [Fluent button](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-button/library/src/components/Button/useButtonStyles.styles.ts) (24/32/40) | V, H | heights per kind: one value (±0.5); icon only: width = height |
| C2 | One icon size per control size, drawn at that size, never scaled | 16 small controls and menus; 32 large buttons | [Win32 ribbons](https://learn.microsoft.com/en-us/windows/win32/uxguide/cmd-ribbons) | V | rendered box exactly 16 or 32; SVG viewBox width = rendered width |
| C3 | One line weight per icon size | 1 px at 16 to 32; 2 px at 40 and 48; gaps = line weight | [Office monoline icons](https://learn.microsoft.com/en-us/office/dev/add-ins/design/add-in-icons-fresh); [Segoe Fluent](https://learn.microsoft.com/en-us/windows/apps/design/iconography/) ("1 epx") | V | build lint: stroke width × rendered/viewBox = 1 |
| C4 | One thumbnail size per gallery; at least three visible | 16, 48 or 64×48 | Win32 ribbons | V | sizes per gallery: one; visible ≥3 |
| C5 | One type style per text kind | ribbon labels and group names 12/16 regular; tabs, dialogs 14/20; pane titles 20/26 semibold | [Fluent type ramp](https://fluent2.microsoft.design/typography) | V, H | one (size, weight, line height) per kind |
| C6 | Group names on one baseline, centred under their group | Δ baseline ≤0.5; Δ centre ≤1 | Word | H | bottom of each label's `Range.getClientRects()`; centres |
| C7 | One separator | 1 px wide, one height, one colour | Word | H | one value per property |
| C8 | Spacing only from the scale | 0 2 4 6 8 10 12 16 20 24 28 32 36 40 48 | [Fluent layout](https://fluent2.microsoft.design/layout) (4 px base) | V | walk padding, margin, gap of chrome; flag others |
| C9 | One corner radius per kind | 4 controls and tooltips; 8 menus, dialogs, flyouts; 0 where parts touch | [Windows geometry](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/geometry), [Fluent shapes](https://fluent2.microsoft.design/shapes) | V | computed `border-radius` per kind |
| C10 | One name and one icon per command on every surface (ribbon, menus, search, quick access) | 0 mismatches | [WCAG 3.2.4](https://www.w3.org/TR/WCAG22/) | S | compare label and icon id across surfaces from the registry |
| C11 | One capitalisation per kind; labels at most 4 words; "…" only on menu items opening a dialog | 4 | Win32 ribbons | V | pattern and word count per kind |
| C12 | Disable, never hide, what cannot apply; never disable what would work; disabled looks distinct, keeps its place, tooltip says why | shift 0 px | Win32 ribbons; [Fluent button usage](https://fluent2.microsoft.design/components/web/react/core/button/usage) | V | 50 random caret states: registry `enabled` matches `aria-disabled`; no rect moves |
| C13 | Focus ring only for keyboard focus (text fields always), drawn with `outline`, since forced colours drop `box-shadow` | ≥2 px perimeter; ≥3:1 between focused and unfocused pixels | [WCAG 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html) (AAA), [MDN :focus-visible](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible), [CSS Color Adjust](https://www.w3.org/TR/css-color-adjust-1/) | S | click: no outline; Tab: outline ≥2 and screenshot diff ≥3:1; repeat under forced colours |
| C14 | Every tooltip: name, shortcut, one sentence starting with a verb | 100% | Win32 ribbons | V | hover each control; chord from `keys.js` present |

## 2. Layout and scaling

| # | Rule | Number | Source | Kind | Test |
|---|---|---|---|---|---|
| L1 | Collapse as Word does, group by group from the right: large with label, small with label, small icon only, one group button; the most used large buttons (Paste) shrink last | never smaller when wider | [Office add-in commands](https://learn.microsoft.com/office/dev/add-ins/design/add-in-commands), [ribbon scaling](https://learn.microsoft.com/en-us/windows/win32/windowsribbon/windowsribbon-templates) | V | sweep 390 to 1920 px in 10 px steps (`test:tabs`), record each group's state |
| L2 | A one button group never becomes a group button | 0 | Win32 ribbons | V | state at narrowest width |
| L3 | Never cut a label: whole, or hidden with the icon and tooltip left | scrollWidth ≤ clientWidth; no `text-overflow: ellipsis` | Win32 ribbons (truncated names look alike); Office drops labels, never cuts | V, H | every ribbon text node at every swept width |
| L4 | Nothing outside a group; every group named | 0 orphans | Win32 ribbons | V | closest group of each control has a visible label |
| L5 | State changes never move a control | 0 px | Win32 ribbons ("don't hide", "don't update labels dynamically") | V | rects before and after selection changes, contextual tabs aside |
| L6 | Contextual tabs: at the right in their own colour; inserting an object selects the first; removal returns to Home | | Win32 ribbons | V | insert picture: Picture Format `aria-selected`; delete: Home |
| L7 | Reflow without scrolling both ways; the ribbon row and page may scroll on one axis | 320 wide (400% of 1280) | [WCAG 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | S | at 320, chrome scrollWidth ≤320 |
| L8 | Text spacing overrides lose nothing | line 1.5, paragraph 2, letter 0.12, word 0.16 × size | [WCAG 1.4.12](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html) | S | inject stylesheet; no hidden overflow with scrollHeight > clientHeight |

Groups of 3 to 5 commands (Win32) is a soft target: Word breaks it, so report, don't fail.

## 3. Novices

| # | Rule | Number | Source | Kind | Test |
|---|---|---|---|---|---|
| N1 | Recognition over recall: every control has a visible label or tooltip, and an accessible name | 100% | [NN/g heuristic 6](https://www.nngroup.com/articles/ten-usability-heuristics/) | V | ARIA snapshot (`test:agent`) |
| N2 | Plain words: Word's names; LaTeX only in the LaTeX group, Show LaTeX, a tooltip's last line | 0 backslashes elsewhere | NN/g consistency | H | scan labels |
| N3 | Search (Alt+Q) finds every command by its name, Word's name and synonyms | top 3 | [Superhuman](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/) | V | loop over the registry |
| N4 | First five minutes: caret placed, ribbon expanded on Home, no modal, first key lands in the document; collapse state persists | 0 modals | Win32 ribbons | V, H | fresh context: no `[aria-modal=true]`; type, read source; reload |
| N5 | Empty panes and lists say what belongs there and offer the command that adds it | 1 sentence, 1 button | | H | open each pane on an empty document |
| N6 | Undo everywhere: each command one Ctrl+Z step, source restored byte for byte; anything irreversible asks first | 100% | NN/g heuristic 3; [Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | V | `roundtrip()` over the registry |
| N7 | No modal surprises: dialogs only from a command that says so (launcher or "…"); a launcher always opens one; closing returns focus to the opener | | [WCAG 3.2.1](https://www.w3.org/TR/WCAG22/), Win32, [Fluent accessibility](https://fluent2.microsoft.design/accessibility) | S, V | after Esc, `activeElement` is the opener |
| N8 | Two disclosure levels at most: ribbon, then one dialog or pane | 1 modal open | [NN/g](https://www.nngroup.com/articles/progressive-disclosure/) ("beyond 2… low usability") | V | count `aria-modal` |
| N9 | Live preview shows and reverts fast | ≤500 ms | Win32 ribbons | V | hover gallery item, time it; leave: page identical |
| N10 | Hover content dismisses with Esc, stays while hovered, never covers focus | | [WCAG 1.4.13, 2.4.11](https://www.w3.org/TR/WCAG22/) | S | Esc hides; pointer on tooltip keeps it |

## 4. Power users

| # | Rule | Number | Source | Kind | Test |
|---|---|---|---|---|---|
| P1 | Every command keyboard reachable; Alt shows KeyTips, unique within a tab; F File, H Home; J, Y, Z start only contextual, unassigned and group KeyTips | 0 duplicates | [WCAG 2.1.1](https://www.w3.org/TR/WCAG22/), Win32 ribbons | S, V | press Alt, collect badges per tab; invoke every command by keys |
| P2 | Shortcuts are redundant and shown: each has a visible command; shown in tooltip, menus (aligned right), palette | 100% | [NN/g accelerators](https://www.nngroup.com/articles/ui-accelerators/) | V | chord table ⊆ registry entries placed in ribbon or menu |
| P3 | Palette: one chord opens and closes it anywhere, restoring focus; typo tolerant; recent first on empty query; hides only what cannot run | ≥1 swapped or missing letter | Superhuman, [VS Code](https://code.visualstudio.com/api/ux-guidelines/command-palette) | V | "fromat paintr" ranks Format Painter first; last run command heads the empty query |
| P4 | F4 repeats the last command | | Word | V | Bold, move, F4 |
| P5 | No focus stealing: compiles, spelling, saves, coauthors never move focus, caret or selection, never drop a key | 0 lost keys | WCAG 3.2.1, 3.2.2 | S | type 200 characters at 20 ms during a compile; compare |
| P6 | No single character shortcuts outside a focused widget | 0 | [WCAG 2.1.4](https://www.w3.org/TR/WCAG22/) | S | letters with focus in chrome fire nothing |
| P7 | Latency budgets | keystroke to paint ≤50 ms p95 (200 worst); frames ≤16.7 ms; visible response ≤100 ms; result ≤1 s or progress; estimate past 10 s | [RAIL](https://web.dev/articles/rail) (input in 50, respond in 100), [INP](https://web.dev/articles/inp) (≤200 good), [NN/g](https://www.nngroup.com/articles/response-times-3-important-limits/) (0.1/1/10 s) | V, E | `PerformanceObserver({type:'event', durationThreshold:16})` for input to paint; long animation frames; repeat with `bench_native_page.py --cpu 6` |

Evidence notes. People tell 1 from 6 ms of drag lag and notice about 50 ms while inking ([Annett 2014](https://sites.ualberta.ca/~wfb/publications/C-2014-GI-Latency.pdf), summarising Ng 2012 and Jota 2013; E), so 50 ms for typing is a convention inside empirical limits. Showing shortcuts alone teaches little: hotkey use went from 28.9% to 66.6% with audio feedback and 72.8% with the menu item disabled, while visual exposure did not help ([Grossman 2007](https://www.dgp.toronto.edu/~ravin/papers/chi2007_learninghotkeys.pdf); E); show them anyway, never punish the mouse. Paste was 11% of all Word 2003 commands and the top five 32%, hence large buttons for them ([Harris](https://learn.microsoft.com/en-us/archive/blogs/jensenh/no-distaste-for-paste-why-the-ui-part-7); E, logs). Hick's law ([NN/g](https://www.nngroup.com/videos/hicks-law-long-menus/)) favours few tabs and small groups; Fitts's law ([NN/g](https://www.nngroup.com/articles/fitts-law/)) favours large frequent buttons and menus opening beside their object. The laws are empirical; the thresholds are convention.

## 5. Touch and phones

| # | Rule | Number | Source | Kind | Test |
|---|---|---|---|---|---|
| T1 | Coarse pointer targets | ≥44×44 | [Apple](https://developer.apple.com/design/human-interface-guidelines/accessibility) 44 pt; [Google](https://support.google.com/accessibility/android/answer/7101858) 48 dp ≈9 mm; [Parhi 2006](https://www.microsoft.com/en-us/research/?p=155150) 9.2 mm single, 9.6 mm serial | V, E | `has_touch` context: every interactive rect ≥44 |
| T2 | Every target everywhere, or no other target inside its centred 24 px circle | ≥24×24 | [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) (AA) | S | rects, then circles |
| T3 | Gap between touch targets | ≥8 | Google | V | pairwise gaps |
| T4 | Frequent actions in the middle half to two thirds; destructive ones away from frequent ones | accuracy 7 mm centre, 12 mm corners | [Hoober 2017](https://www.uxmatters.com/mt/archives/2017/07/design-for-fingers-touch-and-people-part-3.php); [Hoober 2013](https://uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php) (one hand 49%, cradled 36%, two hands 15%) | E | at 390 and 360 px no destructive command beside a frequent one |
| T5 | Every gesture has a tap alternative; every drag a single pointer one | | [WCAG 2.5.7](https://www.w3.org/TR/WCAG22/), Apple | S | each drag (resize, crop) has a field or menu |
| T6 | The on screen keyboard and sticky chrome never hide the focused field | | WCAG 2.4.11 | S | `visualViewport` contains focused rect |

## 6. Dark mode and high contrast

| # | Rule | Number | Source | Kind | Test |
|---|---|---|---|---|---|
| D1 | Contrast in both themes | text ≥4.5:1 (aim 7:1 small); icons, boundaries, focus ring ≥3:1; disabled exempt | [WCAG 1.4.3, 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [Apple dark mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) | S, V | contrast of every text node and icon against its effective background, light and dark |
| D2 | Follow `prefers-color-scheme` by default; a chosen override persists | | Apple (discourages app settings; Word has one) | V, H | `emulate_media(color_scheme)` |
| D3 | The page stays dark on light by default; dark page is opt in | | [Piepenbrock 2013](https://informahealthcare.com/doi/abs/10.1080/00140139.2013.790485): positive polarity better at every age | E | default page lighter than its text |
| D4 | Forced colours: system colours; nothing only in shadow, background image or colour; icons `currentColor`; selection and focus visible | | [CSS Color Adjust](https://www.w3.org/TR/css-color-adjust-1/) (`box-shadow` computes to none, and so does any `background-image` without `url()`) | S | `forced_colors='active'`: selected tab and pressed toggle differ from rest in screenshots |
| D5 | State never by colour alone (pressed, selected, contextual) | | [WCAG 1.4.1](https://www.w3.org/TR/WCAG22/), Apple | S | `aria-pressed` plus a shape or border change |

## 7. Motion

| # | Rule | Number | Source | Kind | Test |
|---|---|---|---|---|---|
| M1 | Durations from tokens; frequent motion short | 50 to 300 ms in 50 steps; menus, tooltips ≤150 | [Fluent durations](https://github.com/microsoft/fluentui/blob/master/packages/tokens/src/global/durations.ts); [NN/g](https://www.nngroup.com/articles/animation-duration/) (100 to 400 typical, 500 "a drag") | V | `document.getAnimations()` and `transition-duration` in the set |
| M2 | Reduced motion: no movement; fades ≤150 ms or nothing | | [WCAG 2.3.3](https://www.w3.org/TR/WCAG22/) (AAA), Apple | S | `reduced_motion='reduce'`: animations touch opacity only |
| M3 | Animate only `transform` and `opacity` | frames ≤16.7 ms | RAIL | V | keyframe properties |
| M4 | Nothing flashes more than three times a second | 3 | WCAG 2.3.1 | S | luminance flips in a recording |

## The 25 rules most worth testing

1. P1 Every command by keys; KeyTips unique per tab.
2. C13 Keyboard only focus ring, ≥2 px, 3:1 change, `outline`.
3. P7 Keystroke to paint ≤50 ms p95; no frame over 16.7 ms while typing.
4. C1 One height per control kind (24 small, 32 dialog).
5. L1 Collapse right to left, large, small, icon, group button; never smaller when wider.
6. L3 No cut or ellipsised label in the ribbon.
7. D1 Text ≥4.5:1, icons and boundaries ≥3:1, light and dark.
8. N6 Every command one undo step, source restored byte for byte.
9. C12 and L5 Disable, never hide; state changes move nothing.
10. C2 and C3 Icons 16 or 32, never scaled, 1 px line.
11. T2 Every target ≥24 px or spaced by the 24 px circle.
12. T1 Targets ≥44 px on coarse pointers.
13. C5 One size, weight, line height per text kind.
14. C8 Every spacing value on the 4 px scale.
15. C10 One name, one icon per command on every surface.
16. N3 and P3 Search finds every command, tolerates typos, recent first.
17. C14 and N10 Tooltips: name, shortcut, description; Esc dismisses.
18. P5 Background work never moves focus or drops a key.
19. N7 No unrequested dialog; focus returns to the opener.
20. C6 Group names on one baseline, centred.
21. C9 One radius per kind (4 controls, 8 surfaces).
22. L4 No control outside a named group.
23. D4 State visible under forced colours; nothing only in shadows.
24. M1 and M2 Durations from tokens; reduced motion means fades only.
25. L6 Contextual tabs open on insert, give way to Home on removal.
