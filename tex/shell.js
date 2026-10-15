// Shell escape for Galley's TeX worker.
//
// TeX runs programs through \write18 (\ShellEscape, os.execute, xdvipdfmx's Ghostscript calls).
// The WebAssembly TeX hands each command line to JavaScript (BusyTeX's shell_escape_dispatch_js
// import); this file plays the shell. It understands the shell syntax packages use (&&, ;, ||,
// pipes, > and 2> redirections, quotes, cd) and runs real programs, all inside the page:
//
//   kpsewhich, l3sys-query, echo, cat, rm, mkdir, cp, mv, touch, test, which ... answered here
//   gs, rungs, repstopdf, epstopdf, ps2pdf ... Ghostscript 10 (WebAssembly)
//   gnuplot ...................................... gnuplot 6 (WebAssembly)
//   latexminted, pygmentize ..................... Python (Pyodide) with Pygments, for minted
//   makeindex, bibtex, bibtex8 .................. TeX Live's own, run right after the pass (TeX
//                                                 reads their output on the next pass anyway)
//   xindy, texindy, tex2xindy .................... xindy 2.5.1 on ECL (WebAssembly)
//   dvips, asy, pdflatex & co. ................... dvips, Asymptote, TeX on a second instance
//
// Anything else (inkscape, R, ...) cannot run in a browser: TeX gets exit code 127 and the
// compile reports which program was missing.
//
// A program that needs a module not loaded yet (Ghostscript is 11 MB) fails this pass and asks
// for it; the worker loads it and runs the pass again, so prediction only saves time.

/* global self */
self.GalleyShell = function GalleyShell(ctx) {
  // ctx: { FS(), treeLookup(name) -> path|null, tools: {gs, gnuplot, python} (null until loaded),
  //        vars: {name: value} for kpsewhich --var-value }
  const S = {
    log: [], // [{cmd, code, note}] for the current compile
    deferred: [], // [{argv, cwd}] run after the pass
    need: new Set(), // tools to load before the next pass
    missing: new Set() // programs that cannot run here
  };

  const enc = new TextEncoder(), dec = new TextDecoder();
  const norm = (p) => {
    const out = [];
    for (const seg of p.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') out.pop(); else out.push(seg);
    }
    return '/' + out.join('/');
  };
  const abs = (cwd, p) => norm(p.startsWith('/') ? p : cwd + '/' + p);
  const fsx = () => ctx.FS();
  const isFile = (p) => { try { const st = fsx().stat(p); return fsx().isFile(st.mode); } catch (e) { return false; } };
  const isDir = (p) => { try { const st = fsx().stat(p); return fsx().isDir(st.mode); } catch (e) { return false; } };
  const readB = (p) => fsx().readFile(p);
  const writeB = (p, data) => { mkdirs(p.slice(0, p.lastIndexOf('/')) || '/'); fsx().writeFile(p, typeof data === 'string' ? enc.encode(data) : data); };
  const mkdirs = (d) => { let cur = ''; for (const seg of d.split('/').filter(Boolean)) { cur += '/' + seg; if (!isDir(cur)) { try { fsx().mkdir(cur); } catch (e) { /* race */ } } } };

  // ---- tokenizer: words (quotes removed) and operators ---------------------------------
  function tokenize(line) {
    const toks = [];
    let i = 0, cur = null;
    const push = () => { if (cur !== null) { toks.push({ w: cur }); cur = null; } };
    while (i < line.length) {
      const c = line[i];
      if (c === ' ' || c === '\t' || c === '\n') { push(); i++; continue; }
      if (c === "'") { const j = line.indexOf("'", i + 1); cur = (cur || '') + line.slice(i + 1, j < 0 ? line.length : j); i = j < 0 ? line.length : j + 1; continue; }
      if (c === '"') {
        let j = i + 1, s = '';
        while (j < line.length && line[j] !== '"') { if (line[j] === '\\' && j + 1 < line.length && '"\\$`'.includes(line[j + 1])) { s += line[j + 1]; j += 2; } else s += line[j++]; }
        cur = (cur || '') + s; i = j + 1; continue;
      }
      if (c === '\\' && i + 1 < line.length) { cur = (cur || '') + line[i + 1]; i += 2; continue; }
      const two = line.slice(i, i + 2), four = line.slice(i, i + 4);
      if (four === '2>&1') { push(); toks.push({ op: '2>&1' }); i += 4; continue; }
      if (two === '&&' || two === '||' || two === '>>' || two === '2>' || two === '&>') {
        push();
        if (two === '2>' && line[i + 2] === '>') { toks.push({ op: '2>>' }); i += 3; continue; }
        toks.push({ op: two }); i += 2; continue;
      }
      if (c === ';' || c === '|' || c === '>' || c === '<') { push(); toks.push({ op: c }); i++; continue; }
      if (c === '&') { push(); i++; continue; } // background: run it now
      cur = (cur || '') + c; i++;
    }
    push();
    return toks;
  }

  // ---- running a command line ------------------------------------------------------------
  function runLine(line, cwd, env) {
    const toks = tokenize(line);
    let code = 0, i = 0, skip = false;
    while (i < toks.length) {
      // one pipeline, up to && || ;
      const pipe = [[]];
      while (i < toks.length && !(toks[i].op && ['&&', '||', ';'].includes(toks[i].op))) {
        if (toks[i].op === '|') pipe.push([]); else pipe[pipe.length - 1].push(toks[i]);
        i++;
      }
      const sep = i < toks.length ? toks[i++].op : null;
      if (!skip) {
        // a pipe's input (env.stdin) goes to the first command; what the last one prints goes to
        // env.sink when someone reads it (TeX's \\input|"cmd")
        let stdin = env.stdin || '';
        env.stdin = '';
        for (const part of pipe) {
          const r = runSimple(part, env, stdin);
          code = r.code; stdin = r.out;
        }
        if (env.sink && stdin) env.sink(stdin);
      }
      skip = (sep === '&&' && code !== 0) || (sep === '||' && code === 0);
    }
    return code;
  }

  function runSimple(toks, env, stdin) {
    const argv = [];
    const redir = [];
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (t.op === '>' || t.op === '>>' || t.op === '2>' || t.op === '2>>' || t.op === '&>' || t.op === '<') { redir.push([t.op, toks[k + 1] && toks[k + 1].w]); k++; }
      else if (t.op === '2>&1') redir.push(['2>&1']);
      else if (t.w !== undefined) argv.push(t.w);
    }
    // VAR=value prefixes
    while (argv.length && /^[A-Za-z_]\w*=/.test(argv[0])) { const a = argv.shift(); env.vars[a.slice(0, a.indexOf('='))] = a.slice(a.indexOf('=') + 1); }
    if (!argv.length) return { code: 0, out: '' };
    let out = '', err = '';
    const io = {
      cwd: env.cwd, env, stdin,
      out: (s) => { out += s; },
      err: (s) => { err += s; }
    };
    for (const [op, f] of redir) if (op === '<' && f) { try { io.stdin = dec.decode(readB(abs(env.cwd, f))); } catch (e) { /* missing */ } }
    let code;
    try { code = exec(argv, io); } catch (e) { err += String((e && e.message) || e) + '\n'; code = 1; }
    let toErr = err, toOut = out;
    for (const [op, f] of redir) {
      if (op === '2>&1') { toOut += toErr; toErr = ''; continue; }
      if (!f || f === '/dev/null') { if (op === '>' || op === '>>') toOut = ''; else if (op.startsWith('2')) toErr = ''; else if (op === '&>') { toOut = ''; toErr = ''; } continue; }
      const p = abs(env.cwd, f);
      const old = op.endsWith('>>') && isFile(p) ? dec.decode(readB(p)) : '';
      if (op === '>' || op === '>>') { writeB(p, old + toOut); toOut = ''; }
      else if (op === '2>' || op === '2>>') { writeB(p, old + toErr); toErr = ''; }
      else if (op === '&>') { writeB(p, toOut + toErr); toOut = ''; toErr = ''; }
    }
    if (toErr) S.stderr += toErr;
    return { code, out: toOut };
  }

  // ---- the programs ------------------------------------------------------------------------
  const DEFER = new Set(['makeindex', 'bibtex', 'bibtex8', 'upmendex', 'mendex', 'splitindex']);
  const GS = new Set(['gs', 'rungs', 'gswin32c', 'gswin64c', 'repstopdf', 'epstopdf', 'ps2pdf', 'ps2pdf12', 'ps2pdf13', 'ps2pdf14', 'eps2pdf', 'ps2eps', 'eps2eps', 'pdf2ps', 'ps2ps']);
  const PY = new Set(['latexminted', 'pygmentize']);
  const BUILT = new Set(['dvips', 'pdfcrop', 'asy']); // built for Galley (build_tools.sh), or written here (pdfcrop)
  const XINDY = new Set(['xindy', 'texindy', 'tex2xindy']); // xindy's front ends and filter (tools.js)
  // TeX itself, run from TeX (engine.js runs it on a second instance)
  const TEXES = new Set(['pdflatex', 'latex', 'xelatex', 'lualatex', 'luahblatex', 'pdflatex-dev', 'latex-dev', 'xelatex-dev', 'lualatex-dev', 'pdftex', 'tex', 'etex', 'xetex', 'luatex', 'luahbtex']);
  const KNOWN = new Set(['echo', 'printf', 'cat', 'rm', 'mkdir', 'cp', 'mv', 'touch', 'true', 'false', ':', 'pwd', 'cd', 'test', '[', 'which', 'command', 'sh', 'bash', 'kpsewhich', 'l3sys-query', 'basename', 'dirname', 'head', 'wc', 'date', 'ls', 'exit', 'sleep', 'tput', 'uname', 'whoami', 'hostname', 'gnuplot', 'makeglossaries', 'makeglossaries-lite', ...DEFER, ...GS, ...PY, ...BUILT, ...XINDY, ...TEXES]);

  function exec(argv, io) {
    let name = argv[0].replace(/^.*\//, '').replace(/\.(exe|pl|py|lua|sh)$/i, '');
    const a = argv.slice(1);
    const P = (p) => abs(io.env.cwd, p);
    switch (name) {
      case 'true': case ':': return 0;
      case 'false': return 1;
      case 'exit': return parseInt(a[0] || '0', 10) || 0;
      case 'sleep': return 0;
      case 'uname': io.out((a.includes('-a') ? 'Linux galley 6.0 #1 SMP wasm32 GNU/Linux' : a.includes('-m') ? 'wasm32' : a.includes('-r') ? '6.0' : a.includes('-n') ? 'galley' : 'Linux') + '\n'); return 0; // ifplatform asks
      case 'whoami': io.out('web_user\n'); return 0;
      case 'hostname': io.out('galley\n'); return 0;
      case 'tput': io.out(a[0] === 'cols' ? '80\n' : a[0] === 'lines' ? '24\n' : ''); return 0; // no terminal
      case 'echo': {
        let nl = true, words = a;
        if (words[0] === '-n') { nl = false; words = words.slice(1); }
        if (words[0] === '-e') words = words.slice(1);
        io.out(words.join(' ') + (nl ? '\n' : ''));
        return 0;
      }
      case 'printf': io.out((a[0] || '').replace(/\\n/g, '\n').replace(/%s/g, () => a.splice(1, 1)[0] || '')); return 0;
      case 'pwd': io.out(io.env.cwd + '\n'); return 0;
      case 'cd': { const d = P(a[0] || '.'); if (!isDir(d)) { io.err('cd: ' + a[0] + ': No such directory\n'); return 1; } io.env.cwd = d; return 0; }
      case 'date': io.out(new Date().toString() + '\n'); return 0;
      case 'basename': io.out((a[0] || '').replace(/\/+$/, '').replace(/^.*\//, '').replace(a[1] ? new RegExp(a[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') : /$^/, '') + '\n'); return 0;
      case 'dirname': { const s = (a[0] || '').replace(/\/+$/, ''); io.out((s.includes('/') ? s.slice(0, s.lastIndexOf('/')) || '/' : '.') + '\n'); return 0; }
      case 'cat': {
        if (!a.length) { io.out(io.stdin); return 0; }
        let code = 0;
        for (const f of a) { try { io.out(dec.decode(readB(P(f)))); } catch (e) { io.err('cat: ' + f + ': No such file\n'); code = 1; } }
        return code;
      }
      case 'head': { const n = a[0] === '-n' ? parseInt(a[1], 10) : 10; const src = a.filter((x, i) => !(x.startsWith('-') || (i > 0 && a[i - 1] === '-n'))); const t = src.length ? dec.decode(readB(P(src[0]))) : io.stdin; io.out(t.split('\n').slice(0, n).join('\n') + '\n'); return 0; }
      case 'wc': { const t = a.filter((x) => !x.startsWith('-')).map((f) => dec.decode(readB(P(f)))).join('') || io.stdin; io.out((a.includes('-l') ? t.split('\n').length - 1 : t.length) + '\n'); return 0; }
      case 'ls': { const d = P(a.filter((x) => !x.startsWith('-'))[0] || '.'); try { io.out(fsx().readdir(d).filter((x) => x !== '.' && x !== '..').join('\n') + '\n'); return 0; } catch (e) { return 2; } }
      case 'rm': { for (const f of a.filter((x) => !x.startsWith('-'))) { const p = P(f); try { if (isDir(p)) rmrf(p); else fsx().unlink(p); } catch (e) { if (!a.some((x) => /^-\w*f/.test(x))) { io.err('rm: ' + f + ': No such file\n'); return 1; } } } return 0; }
      case 'mkdir': { for (const f of a.filter((x) => !x.startsWith('-'))) mkdirs(P(f)); return 0; }
      case 'touch': { for (const f of a.filter((x) => !x.startsWith('-'))) { const p = P(f); if (!isFile(p)) writeB(p, ''); } return 0; }
      case 'cp': case 'mv': {
        const files = a.filter((x) => !x.startsWith('-'));
        if (files.length < 2) return 1;
        const dst = P(files[files.length - 1]);
        for (const f of files.slice(0, -1)) {
          const src = P(f);
          if (!isFile(src)) { io.err(name + ': ' + f + ': No such file\n'); return 1; }
          const to = isDir(dst) ? dst + '/' + src.slice(src.lastIndexOf('/') + 1) : dst;
          writeB(to, readB(src));
          if (name === 'mv') fsx().unlink(src);
        }
        return 0;
      }
      case 'test': case '[': {
        const t = name === '[' ? a.slice(0, -1) : a;
        if (t[0] === '-f' || t[0] === '-e' || t[0] === '-r' || t[0] === '-s') return isFile(P(t[1] || '')) || (t[0] === '-e' && isDir(P(t[1] || ''))) ? 0 : 1;
        if (t[0] === '-d') return isDir(P(t[1] || '')) ? 0 : 1;
        if (t[1] === '=' || t[1] === '==') return t[0] === t[2] ? 0 : 1;
        if (t[1] === '!=') return t[0] !== t[2] ? 0 : 1;
        return t.length && t[0] ? 0 : 1;
      }
      case 'which': case 'command': {
        const names = a.filter((x) => !x.startsWith('-'));
        let code = 0;
        for (const n of names) { if (KNOWN.has(n)) io.out('/usr/bin/' + n + '\n'); else code = 1; }
        return code;
      }
      case 'sh': case 'bash': case 'dash': {
        const i = a.indexOf('-c');
        // a subshell: its own folder and variables, its output to this command's
        if (i >= 0 && a[i + 1] !== undefined) return runLine(a[i + 1], io.env.cwd, { cwd: io.env.cwd, vars: Object.assign({}, io.env.vars), stdin: io.stdin, sink: (t) => io.out(t) });
        return 0;
      }
      case 'makeglossaries': case 'makeglossaries-lite':
        // the compile makes each glossary after every pass, with makeindex or xindy as these
        // would (engine.js indexTools)
        io.out('galley: glossaries are made after each pass\n');
        return 0;
      case 'kpsewhich': return kpsewhich(a, io);
      case 'l3sys-query': return l3sysQuery(a, io);
      case 'gnuplot': return tool('gnuplot', argv, io);
      default:
        if (DEFER.has(name)) { S.deferred.push({ argv: [name === 'bibtex' ? 'bibtex8' : name, ...a], cwd: io.env.cwd }); return 0; }
        if (GS.has(name)) return tool('gs', argv, io);
        if (PY.has(name)) return tool('python', argv, io);
        if (BUILT.has(name)) return tool(name, argv, io);
        if (XINDY.has(name)) return tool('xindy', argv, io);
        if (TEXES.has(name)) return tool('tex', argv, io);
        S.missing.add(name);
        io.err('galley: ' + name + ' cannot run in a browser\n');
        return 127;
    }
  }

  function rmrf(d) {
    for (const n of fsx().readdir(d)) {
      if (n === '.' || n === '..') continue;
      const p = d + '/' + n;
      if (isDir(p)) rmrf(p); else fsx().unlink(p);
    }
    fsx().rmdir(d);
  }

  function tool(kind, argv, io) {
    const t = ctx.tools[kind];
    if (!t) { S.need.add(kind); io.err('galley: loading ' + kind + ', the pass runs again\n'); return 1; }
    return t.run(argv, io, { abs: (p) => abs(io.env.cwd, p), readB, writeB, isFile, isDir, FS: fsx });
  }

  // kpsewhich: the project's folder first, then the TeX tree (as TeX itself would find files)
  function kpsewhich(a, io) {
    let code = 0;
    const files = [];
    for (let k = 0; k < a.length; k++) {
      const x = a[k];
      let m;
      if ((m = /^--?var-value(?:=(.*))?$/.exec(x))) { const v = m[1] !== undefined ? m[1] : a[++k]; const val = ctx.vars[v]; if (val === undefined) code = 1; io.out((val || '') + '\n'); continue; }
      if ((m = /^--?expand-var(?:=(.*))?$/.exec(x))) { const v = m[1] !== undefined ? m[1] : a[++k]; io.out(v.replace(/\$(\w+)/g, (_, n) => ctx.vars[n] || '') + '\n'); continue; }
      if (/^--?(format|progname|engine|path|dpi|mode|subdir)(=|$)/.test(x)) { if (!x.includes('=')) k++; continue; }
      if (/^--?(all|must-exist|no-mktex|interactive|debug|safe-in-name|safe-out-name)/.test(x)) continue;
      if (/^--?show-path/.test(x)) { io.out('.:' + '/texlive/texmf-dist//\n'); if (!x.includes('=')) k++; continue; }
      if (/^--?version/.test(x)) { io.out('kpathsea version 6.4.1\n'); return 0; }
      if (x.startsWith('-')) continue;
      files.push(x);
    }
    for (const f of files) {
      const local = abs(io.env.cwd, f);
      if (isFile(local)) { io.out((f.startsWith('/') ? local : './' + f.replace(/^\.\//, '')) + '\n'); continue; }
      const hit = ctx.treeLookup(f);
      if (hit) io.out(hit + '\n'); else code = 1;
    }
    return code;
  }

  // l3sys-query (TeX Live 2024+): what the LaTeX kernel asks the system in restricted mode
  function l3sysQuery(a, io) {
    const args = a.filter((x) => !x.startsWith('-'));
    const cmd = args[0];
    if (cmd === 'pwd') { io.out(io.env.cwd + '\n'); return 0; }
    if (cmd === 'ls') {
      const pat = args[1] || '*';
      const dir = pat.includes('/') ? abs(io.env.cwd, pat.slice(0, pat.lastIndexOf('/'))) : io.env.cwd;
      const glob = new RegExp('^' + pat.slice(pat.lastIndexOf('/') + 1).replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      let names = [];
      try { names = fsx().readdir(dir).filter((n) => n !== '.' && n !== '..' && glob.test(n)); } catch (e) { return 1; }
      if (a.includes('--sort=name') || !a.some((x) => x.startsWith('--sort'))) names.sort();
      if (a.includes('--reverse')) names.reverse();
      io.out(names.map((n) => (pat.includes('/') ? pat.slice(0, pat.lastIndexOf('/') + 1) : '') + n).join('\n') + '\n');
      return 0;
    }
    if (cmd === 'spath') { io.out(abs(io.env.cwd, args[1] || '.') + '\n'); return 0; }
    return 1;
  }

  return {
    state: S,
    dispatch(cmd, cwd) {
      const env = { cwd: norm(cwd || '/'), vars: {} };
      S.stderr = '';
      let code;
      try { code = runLine(cmd, env.cwd, env); } catch (e) { code = 1; S.stderr += String(e) + '\n'; }
      S.log.push({ cmd, code, err: S.stderr.slice(0, 2000) });
      return code;
    },
    // a program started with its arguments as they are (asy's System()), no shell in between
    run(argv, cwd, input) {
      const env = { cwd: norm(cwd || '/'), vars: {} };
      let out = '', err = '';
      const io = { cwd: env.cwd, env, stdin: input || '', out: (t) => { out += t; }, err: (t) => { err += t; } };
      let code;
      try { code = exec(argv, io); } catch (e) { code = 1; err += String((e && e.message) || e) + '\n'; }
      S.log.push({ cmd: argv.map((x) => (/[\s"'\\$]/.test(x) ? '"' + x.replace(/["\\$]/g, '\\$&') + '"' : x)).join(' ').slice(0, 500), code, err: err.slice(0, 2000) });
      return { code, out, err };
    },
    // a command at the other end of a pipe: input is what TeX wrote to it (\\openout to |"cmd"),
    // out is what it printed (\\input|"cmd", Lua's io.popen)
    pipe(cmd, cwd, input) {
      const env = { cwd: norm(cwd || '/'), vars: {}, stdin: input || '' };
      let out = '';
      env.sink = (t) => { out += t; };
      S.stderr = '';
      let code;
      try { code = runLine(cmd, env.cwd, env); } catch (e) { code = 1; S.stderr += String(e) + '\n'; }
      S.log.push({ cmd: '|' + cmd, code, err: S.stderr.slice(0, 2000) });
      return { code, out };
    },
    reset() { S.log = []; S.deferred = []; S.need = new Set(); S.missing = new Set(); S.rerun = false; },
    // one program's output, for a caller that is not TeX (Python asking kpsewhich)
    capture(argv, cwd) {
      let out = '';
      const env = { cwd: norm(cwd || '/'), vars: {} };
      const io = { cwd: env.cwd, env, stdin: '', out: (t) => { out += t; }, err: () => {} };
      let code;
      try { code = exec(argv, io); } catch (e) { code = 1; }
      return { code, out };
    },
    tokenize, runLine
  };
};
