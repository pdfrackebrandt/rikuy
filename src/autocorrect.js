// AutoCorrect as you type (Word's File › Options › Proofing › AutoCorrect Options), as LaTeX: what a
// typed character completes, and the smallest edit that corrects it. Pure functions of the text
// before the caret; src/cmd/insert.js calls them from the typing hook (onInsertText) and keeps
// the switches in the browser (prefs.autocorrect). Each correction is a step of its own after the
// typed character, so one undo gives back exactly what was typed, as in Word.
//
//   links (A5)      an address typed, then a space or a sign: \url{https://…}
//   replace (A10)   (c) (r) (tm) ... -> => <- <= != and the person's own: \copyright and the rest
//   capitals (A9)   a sentence's first letter, TWo INitial CApitals, a day's name
//   ordinals (A6)   1st 2nd 3rd 4th: 1\textsuperscript{st} (off by default, as the GAP asks)
//   fractions (A6)  1/2 1/4 3/4: \textonehalf and its kin (off by default)
//   borders (A7)    ---, ___ or === alone on a line, then Enter: a rule across the text

export const DEFAULTS = { links: true, replace: true, capitals: true, twoCaps: true, days: true, ordinals: false, fractions: false, borders: true };

// the replacements as typed (Word's list), and what each writes: LaTeX every engine takes
export const REPLACE = [
  ['(c)', '\\copyright{}'], ['(C)', '\\copyright{}'], ['(r)', '\\textregistered{}'], ['(R)', '\\textregistered{}'],
  ['(tm)', '\\texttrademark{}'], ['(TM)', '\\texttrademark{}'], ['...', '\\ldots{}'],
  ['->', '\\textrightarrow{}'], ['<-', '\\textleftarrow{}'], ['=>', '\\ensuremath{\\Rightarrow}'], ['<=', '\\ensuremath{\\Leftarrow}'],
  ['<=>', '\\ensuremath{\\Leftrightarrow}'], ['!=', '\\ensuremath{\\neq}'], ['+-', '\\textpm{}']
];
const FRACTIONS = { '1/2': '\\textonehalf{}', '1/4': '\\textonequarter{}', '3/4': '\\textthreequarters{}' };
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// What typing ch at p of src corrects: { s, e, t } (replace src[s..e) by t, the typed character
// already written after it), or null. o: the switches; own: the person's replacements [[from, to]].
// Only the last 200 characters before the caret are read.
export function correct(src, p, ch, o = DEFAULTS, own = []) {
  const from = Math.max(0, p - 200), before = src.slice(from, p);
  // inside a command's name or right after a backslash: LaTeX being written by hand
  if (/\\[A-Za-z]*$/.test(before)) return null;
  // replacements, as Word makes them: (c), (r), (tm) and ... the moment they are complete; the
  // others (-> <= and the person's own) once a space or a sign ends them, so <=> is still typed
  if (o.replace !== false) {
    const list = own.concat(REPLACE).filter(([a]) => a.length).sort((x, y) => y[0].length - x[0].length);
    const typed = before + ch;
    for (const [a, t] of list) {
      const now = /\)$|^\.\.\.$/.test(a);
      if (now ? !typed.endsWith(a) : !(/^[\s.,;:!?]$/.test(ch) && before.endsWith(a))) continue;
      const at = (now ? p + 1 : p) - a.length;
      if (at < from) continue;
      // (a word's own letters run on: "xteh" is no "teh", nor is "x->y" an arrow)
      if (/\w/.test(src[at - 1] || '') && (/^\w/.test(a) || !now)) continue;
      return { s: at, e: p, t, typed: now };
    }
  }
  if (!/^[\s.,;:!?)]$/.test(ch)) return null;
  // the word just ended
  const m = /([A-Za-z0-9][A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]*)$/.exec(before);
  const word = m ? m[1] : '';
  const ws = p - word.length;
  // (an address ends at a space: its dots, colons and slashes are its own while it is typed)
  if (o.links !== false && word && /\s/.test(ch)) {
    const u = /^(?:https?:\/\/|www\.)[^\s{}\\]+$/.exec(word.replace(/[.,;:!?)]+$/, ''));
    if (u && !/\\(url|href)\{[^}]*$/.test(src.slice(Math.max(0, ws - 300), ws))) {
      const addr = u[0], end = ws + addr.length;
      const url = /^www\./.test(addr) ? 'https://' + addr : addr;
      // the % and # an address may hold are its own inside \url
      return { s: ws, e: end, t: '\\url{' + url.replace(/[{}]/g, '') + '}' };
    }
  }
  if (o.ordinals && /^(\d+)(st|nd|rd|th)$/.test(word) && !/\w/.test(src[ws - 1] || '')) {
    const [, n, suf] = /^(\d+)(st|nd|rd|th)$/.exec(word);
    return { s: ws, e: p, t: n + '\\textsuperscript{' + suf + '}' };
  }
  if (o.fractions && FRACTIONS[word] && !/[\w/]/.test(src[ws - 1] || '')) return { s: ws, e: p, t: FRACTIONS[word] };
  if (/^[A-Za-z]+$/.test(word)) {
    if (o.twoCaps !== false && /^[A-Z]{2}[a-z]{2,}$/.test(word) && !/\\/.test(src[ws - 1] || '')) return { s: ws + 1, e: ws + 2, t: word[1].toLowerCase() };
    if (o.days !== false && DAYS.includes(word) && !/\\/.test(src[ws - 1] || '')) return { s: ws, e: ws + 1, t: word[0].toUpperCase() };
    if (o.capitals !== false && /^[a-z]/.test(word) && sentenceStart(src, ws)) return { s: ws, e: ws + 1, t: word[0].toUpperCase() };
  }
  return null;
}

// Whether a word at s starts a sentence: after . ! ? and a space, or as the first word of a
// paragraph; never after an abbreviation (e.g., i.e., etc.), in a command's argument other than
// a heading's, or after a number with its point (1.5)
const ABBR = /(?:^|[\s(])(?:e\.g|i\.e|etc|vs|cf|al|approx|ca|resp|incl|Fig|Eq|Ref|Sec|Dr|Mr|Mrs|Ms|Prof|St|No|vol|pp|ch)\.$/i;
function sentenceStart(src, s) {
  let k = s;
  while (k > 0 && (src[k - 1] === ' ' || src[k - 1] === '\t')) k--;
  const prev = src.slice(Math.max(0, k - 40), k);
  if (/\\(?:section|subsection|subsubsection|chapter|paragraph|caption)\*?(?:\[[^\]]*\])?\{$|\\item$/.test(prev)) return true;
  if (k === s && k > 0 && src[k - 1] !== '\n') return false;
  if (/\n\s*\n\s*$/.test(src.slice(Math.max(0, k - 40), s))) return true;
  if (!/[.!?]['"’”)]*$/.test(prev) || k === s) return false;
  if (ABBR.test(prev) || /\d\.$/.test(prev) || /(^|\s)[A-Za-z]\.$/.test(prev)) return false;
  return true;
}

// A line of ---, ___ or === (three or more) alone in its paragraph, as Enter ends it: the rule
// (A7). src[s..e) is the paragraph's text.
export function borderLine(text) {
  return /^\s*(-{3,}|_{3,}|={3,}|(?:\\_){3,})\s*$/.test(text) ? '\\noindent\\rule{\\linewidth}{0.4pt}' : null;
}
