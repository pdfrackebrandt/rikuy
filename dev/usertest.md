# User test: one hour, five people

PLAN task 13. The automated harness (`test/editor_corpus.py`) checks that scripted edits land in
the source. This session checks what it cannot: whether people who write LaTeX can find and trust
editing on the typeset page. The owner runs it; nothing here needs Claude.

## People

Five who write LaTeX at least monthly, recruited for spread, not convenience:

| slot | profile | why |
|---|---|---|
| 1 | Overleaf user, thesis or papers, little raw TeX | the main audience |
| 2 | desktop TeX user (TeXstudio, VS Code, Emacs), writes macros | will notice wrong source edits |
| 3 | mathematician, heavy on display math and `align` | math editing is the hardest path |
| 4 | Beamer or TikZ user | layouts the page view handles worst |
| 5 | occasional user, a report a year | does the page view lower the bar |

No one who has seen Galley before. Pay or thank them the same way.

## Setup (before each session)

- A fresh browser profile, the artifact link open, window 1440 by 900, zoom 100 %.
- Screen and audio recording on, with consent signed for the recording.
- Three projects ready as `.zip` on the desktop: `paper.zip` (an arXiv style article with
  `\cite`, a table, a figure, `align`), `thesis-chapter.zip` (the person's own chapter if they
  agree, else a LaTeX-examples document), `slides.zip` (a 10 frame Beamer deck).
- A printed task card per task; hand them over one at a time.
- The observer sheet below, one per person.

## Script (60 minutes)

| min | part | what the moderator does |
|---|---|---|
| 0 to 5 | intro | Explain think aloud. "We are testing the editor, not you." No demo of Galley. |
| 5 to 10 | first look | Open `paper.zip` (Ctrl+O). Ask: "What do you think you can do here?" Do not help. |
| 10 to 35 | tasks 1 to 7 | One card at a time. Stop a task after its time limit and note it as not done. |
| 35 to 45 | own document | The person opens their own project (or `thesis-chapter.zip`) and fixes or writes anything they like for 10 minutes. |
| 45 to 55 | interview | The questions below. |
| 55 to 60 | wrap up | SUS questionnaire (the standard 10 items), thanks. |

## Tasks

Each card states the goal, never the control. Limits are generous; the point is where people
stall.

1. **Fix a typo** in the abstract by typing on the page (3 min). Then check the source shows the
   same fix (Ctrl+\\).
2. **Make a phrase bold** in the introduction (2 min).
3. **Change an equation**: in the second `align` line, change the exponent 2 to 3 (4 min).
4. **Edit a table cell**: change one number in the results table (3 min).
5. **Add a footnote** to a sentence of their choice (4 min).
6. **Add a citation** to an entry already in the `.bib` (4 min).
7. **Get the PDF** and download it, then the project as `.zip` (3 min).

For `slides.zip` (slot 4 only, replacing task 4): change a bullet on frame 3 and add a new one.

## What to record (observer sheet)

Per task:
- done / done with help / not done, and time to done
- where they looked first (page, source, toolbar)
- every hesitation over 5 seconds and what they said during it
- whether they checked the source afterwards, and whether they trusted what they saw
- any edit that landed somewhere else, broke compilation or changed the source beyond the
  intended edit: note the time stamp and save the project (`.zip`) right after

Per session:
- errors shown by the editor (Problems panel) and whether the person understood them
- compile waits they commented on
- the SUS score

## Interview

1. When did you type on the page and when in the source? Why?
2. Was there a moment you did not trust what the page showed? What happened?
3. What did you expect to be able to do that you could not?
4. Would you use this for your next document instead of what you use now? What would have to
   change?
5. One thing to keep, one thing to remove.

## After the five sessions

- Every source edit that went wrong becomes a reproducible case: the saved `.zip` plus the
  steps, added to `test/editor_corpus.py` as a scripted edit, and fixed.
- Tally the task outcomes in a table (task by person) and list the three stalls that recur most;
  each becomes a PLAN task with the recordings' time stamps as evidence.
- SUS: report the mean and the five scores. Below 68 is below average for software in general.
