# Common brief for the agents of 2026-11-20

You are working on Rikuy (github.com/pdfrackebrandt/rikuy): a LaTeX editor in the browser where
you type on the typeset page and edits patch the `.tex` source; TeX Live 2026 compiled to
WebAssembly runs in a Web Worker to make the PDF. Read `AGENTS.md` first. The latest handoff
note, by Grok Bot, is `git show origin/handoff-2026-11-20:HANDOFF.md` (it may be on main by the
time you read this).

## What Pedro (the owner) wants, in this order

1. **UI and UX improved first.** Rikuy looks and feels like Microsoft Word, built clean room as
   WordCraft is: no Microsoft icons, fonts, images or other assets, only the layout, the names a
   user expects, and the behaviour. Plain words in every message. Everything works on phones at
   390 and 360 px with touch (44 px targets, the on-screen keyboard). "Strictly better than Word",
   with clean standard LaTeX underneath.
2. **Maximum speed and maximum quality.** Every change is tested as AGENTS.md says; nothing is
   half done.
3. Later (not your task unless it says so): everything possible moved to C or C++ compiled to
   WebAssembly, even where the speed gain is small.

## Where you work

- Your worktree and branch are named in your task. Work only there and in `/tmp` scratch.
- `node_modules` is a link to `/home/claude/nm-main/node_modules` (main's lockfile). If your
  worktree has none yet: `ln -s /home/claude/nm-main/node_modules node_modules`.
- A TeX tree: `mkdir -p dist && cp -a /home/claude/wt-tree/dist/tex dist/tex` (a real copy; never
  a symlink or hard link, `npm run build` writes into `dist/tex`), then `npm run build`.
- The machine has two cores shared by four agents. Wrap every heavy run (browser suites,
  compiles, `test:engines`, the corpus) in `/tmp/rk-heavy <cmd>`, which lets two run at a time.
  Disk is tight (a few GB free): no other copies of `dist/tex` or `node_modules`.

## How you work

- Commit each finished step at once ("WIP: done X; left Y" is fine on your branch); never leave
  finished work uncommitted. Do not push and do not open pull requests: pushes from agents are
  refused; the coordinator pushes. Never rebase or force anything; if main moves, merge it.
- Checks: AGENTS.md's "Checking a change" for what you touched. Always: `npm test`; the ribbon's
  fold rule (`npm run test:tabs`) if you touch anything in or near the ribbon; `npm run test:agent`
  for any control (a control's name is a public interface: keep names, or change one on purpose
  and update llms.txt's text); the phone cases.
- Screenshots of what you changed at 1920 and 1366 px (light and dark) and 390 px, into the folder
  your task names, so the coordinator can show Pedro.
- Commit messages follow PLAN.md's rules: what changed and the evidence, in plain words, and end
  with
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011PpCfkd1KHBb2oNJ9yUUQ4
  ```
  Add a task to PLAN.md's open or finished tasks for what you did.
- Code comments say why, in plain words, in the style of the file.

## The other agents working at the same time (keep out of their files where you can)

- **security** (`/home/claude/wt-sec`): `build/app.mjs`'s policy and headers, KaTeX, `src/share.js`.
- **shortcuts** (`/home/claude/wt-keys`): `src/keys.js`, the `keys` field of commands, Help's list
  of keys.
- **ribbon tabs** (`/home/claude/wt-tabs`): `src/ribbon/`, the ribbon's CSS, how each tab's groups
  and buttons are laid out.
- **UX** (`/home/claude/wt-ux`): the page and everything outside the ribbon: first visit, the
  title band below the ribbon, the status bar, side panes, dialogs, the PDF pane, messages, phones.

If you must touch a file another agent owns, keep the change small and say so in your report.

## Your final message

What changed, the evidence (test counts), screenshot paths, and what is left. Be economical with
tokens.
