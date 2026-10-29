// Problems a reader would hit in the PDF, found without compiling: references with no
// label, citations with no .bib entry, duplicate labels, unclosed environments and braces,
// missing files, math KaTeX cannot read, commands Rikuy shows as source.

// Comments blanked out (same length, so positions stay true) and verbatim bodies hidden.
function scrub(src) {
  let out = src.replace(/(^|[^\\])(%.*)$/gm, (m, a, c) => a + ' '.repeat(c.length));
  out = out.replace(/(\\begin\s*\{(verbatim\*?|lstlisting|minted|comment|Verbatim)\}(?:\[[^\]]*\]|\{[^}]*\})*)([\s\S]*?)(\\end\s*\{\2\})/g,
    (m, a, env, body, b) => a + body.replace(/[^\n]/g, ' ') + b);
  out = out.replace(/\\(verb|lstinline)\*?([^A-Za-z\s])([\s\S]*?)\2/g, (m) => m.replace(/./g, ' '));
  return out;
}
const lineOf = (src, p) => src.slice(0, p).split('\n').length;

const FIG_EXTS = ['', '.png', '.jpg', '.jpeg', '.pdf', '.eps', '.svg', '.gif'];
function* figureRefs(s) {
  const img = /\\includegraphics\*?\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;
  let m;
  while ((m = img.exec(s))) yield { n: m[1].trim(), p: m.index };
}

// the figures the .tex files ask for that the project does not have, by the name as written
export function missingFigures(o) {
  const names = [...o.files.keys(), ...(o.assets || [])];
  const has = (n) => FIG_EXTS.some((x) => names.some((k) => k === n + x || k.endsWith('/' + n + x)));
  const out = new Set();
  for (const [n, t] of o.files) {
    if (!/\.(tex|ltx)$/i.test(n)) continue;
    for (const { n: fig } of figureRefs(scrub(t))) if (fig && !['', ...(o.graphicsPath || [])].some((d) => has(d + fig))) out.add(fig);
  }
  return [...out];
}

export function findProblems(o) {
  const out = [];
  const add = (sev, f, p, msg, key) => out.push({ sev, f, p, line: lineOf(o.files.get(f) || '', p), msg, key: key || msg });
  const tex = [...o.files.entries()].filter(([n]) => /\.(tex|ltx)$/i.test(n));
  const scrubbed = new Map(tex.map(([n, t]) => [n, scrub(t)]));

  // labels
  const labels = new Map();
  for (const [f, s] of scrubbed) {
    const re = /\\label\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(s))) {
      const k = m[1].trim();
      if (labels.has(k)) add('warn', f, m.index, 'Label “' + k + '” is defined twice; references go to the first one.');
      else labels.set(k, { f, p: m.index });
    }
  }
  // references
  for (const [f, s] of scrubbed) {
    const re = /\\(ref|eqref|pageref|autoref|cref|Cref|nameref|vref|labelcref)\*?\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(s))) {
      for (const k of m[2].split(',').map((x) => x.trim()).filter(Boolean)) {
        if (!labels.has(k)) add('error', f, m.index, 'Nothing has \\label{' + k + '}, so this shows as ??.', 'ref:' + k);
      }
    }
  }
  // citations
  const bib = o.bibKeys || new Set();
  const hasBibSource = [...o.files.keys()].some((n) => /\.bib$/i.test(n)) || [...scrubbed.values()].some((s) => /\\bibitem/.test(s));
  let citedSomething = false;
  for (const [f, s] of scrubbed) {
    const re = /\\(?:no)?(cite|citep|citet|citealp|citealt|citeauthor|citeyear|citeyearpar|parencite|textcite|autocite|footcite|smartcite|supercite|Cite|Citep|Citet|Parencite|Textcite|Autocite)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(s))) {
      for (const k of m[2].split(',').map((x) => x.trim()).filter(Boolean)) {
        if (k === '*') continue;
        citedSomething = true;
        if (hasBibSource && !bib.has(k)) add('error', f, m.index, 'No entry “' + k + '” in the bibliography.', 'cite:' + k);
      }
    }
  }
  if (citedSomething && !hasBibSource) {
    const f = o.main;
    const s = scrubbed.get(f) || '';
    const at = Math.max(0, s.search(/\\cite|\\parencite|\\textcite/));
    add('warn', f, at, 'Citations, but no .bib file in the project. Open the .bib to show references.');
  }
  // environments and braces
  for (const [f, s] of scrubbed) {
    const stack = [];
    const re = /\\(begin|end)\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(s))) {
      if (m[1] === 'begin') { stack.push({ env: m[2], p: m.index }); continue; }
      const top = stack[stack.length - 1];
      if (top && top.env === m[2]) { stack.pop(); continue; }
      if (stack.some((x) => x.env === m[2])) {
        while (stack.length && stack[stack.length - 1].env !== m[2]) { const x = stack.pop(); add('error', f, x.p, '\\begin{' + x.env + '} is never closed.'); }
        stack.pop();
      } else add('error', f, m.index, '\\end{' + m[2] + '} has no matching \\begin{' + m[2] + '}.');
    }
    for (const x of stack) if (x.env !== 'document' || f === o.main) add('error', f, x.p, '\\begin{' + x.env + '} is never closed.');
    const open = [];
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') { i++; continue; }
      if (c === '{') open.push(i);
      else if (c === '}') { if (open.length) open.pop(); else add('error', f, i, 'This } closes nothing.'); }
    }
    for (const p of open.slice(0, 3)) add('error', f, p, 'This { is never closed.');
  }
  // files
  const names = [...o.files.keys(), ...(o.assets || [])];
  const has = (n, exts) => names.some((k) => exts.some((x) => k === n + x || k.endsWith('/' + n + x)));
  for (const [f, s] of scrubbed) {
    let m;
    const inp = /\\(input|include|subfile)\s*\{([^}]*)\}/g;
    while ((m = inp.exec(s))) if (!has(m[2].trim(), ['', '.tex'])) add('error', f, m.index, 'File “' + m[2].trim() + '” is not in the project.');
    // a copy opened from someone's link has no figures (the link carries none): the page says
    // whose they are and the PDF gets gray boxes in their place (missingFigures), not problems
    if (o.figuresWith) continue;
    for (const { n, p } of figureRefs(s)) {
      const dirs = ['', ...(o.graphicsPath || [])];
      if (!dirs.some((d) => has(d + n, FIG_EXTS))) add('warn', f, p, 'Image “' + n + '” is not in the project.');
    }
  }
  // math and unknown commands, reported by the renderer and the model
  for (const e of o.mathErrors || []) add('error', e.f, e.p, 'Math error: ' + e.msg.replace(/^KaTeX parse error:\s*/, ''), 'math:' + e.f + ':' + e.p);
  for (const name of o.unknown || []) {
    for (const [f, s] of scrubbed) {
      const i = s.search(new RegExp(name.replace(/\\/g, '\\\\') + '(?![A-Za-z])'));
      if (i >= 0) { add('info', f, i, name + ' is shown as source; Rikuy cannot typeset it.'); break; }
    }
  }
  const rank = { error: 0, warn: 1, info: 2 };
  out.sort((a, b) => rank[a.sev] - rank[b.sev] || (a.f === b.f ? a.p - b.p : a.f < b.f ? -1 : 1));
  return out;
}
