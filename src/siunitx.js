// siunitx on the typeset page: \num, \si/\unit, \SI/\qty, the range, list and product forms and
// \ang, turned into KaTeX source. Covers the units and prefixes siunitx defines, \DeclareSIUnit,
// powers (\square, \squared, \tothe ...), \per in the three per-modes, digit grouping, the
// decimal marker, exponents, rounding to places or figures, and the range and list phrases.
// The PDF is still typeset by siunitx itself; this only has to read the same on the page.

const PREFIX = {
  quecto: 'q', ronto: 'r', yocto: 'y', zepto: 'z', atto: 'a', femto: 'f', pico: 'p', nano: 'n',
  micro: '\\mu ', milli: 'm', centi: 'c', deci: 'd', deca: 'da', deka: 'da', hecto: 'h', kilo: 'k',
  mega: 'M', giga: 'G', tera: 'T', peta: 'P', exa: 'E', zetta: 'Z', yotta: 'Y', ronna: 'R', quetta: 'Q',
  kibi: 'Ki', mebi: 'Mi', gibi: 'Gi', tebi: 'Ti', pebi: 'Pi', exbi: 'Ei', zebi: 'Zi', yobi: 'Yi',
};

const UNIT = {
  ampere: 'A', candela: 'cd', kelvin: 'K', kilogram: 'kg', gram: 'g', metre: 'm', meter: 'm', mole: 'mol',
  second: 's', becquerel: 'Bq', degreeCelsius: '{}^{\\circ}C', celsius: '{}^{\\circ}C', coulomb: 'C',
  farad: 'F', gray: 'Gy', hertz: 'Hz', henry: 'H', joule: 'J', katal: 'kat', lumen: 'lm', lux: 'lx',
  newton: 'N', ohm: '\\Omega', pascal: 'Pa', radian: 'rad', siemens: 'S', sievert: 'Sv', steradian: 'sr',
  tesla: 'T', volt: 'V', watt: 'W', weber: 'Wb', day: 'd', hectare: 'ha', hour: 'h', litre: 'L', liter: 'L',
  minute: 'min', tonne: 't', astronomicalunit: 'au', bel: 'B', decibel: 'dB', dalton: 'Da',
  electronvolt: 'eV', neper: 'Np', percent: '\\%', angstrom: '\\text{\\AA}', bar: 'bar', barn: 'b',
  bit: 'bit', byte: 'B', knot: 'kn', mmHg: 'mmHg', nauticalmile: 'M', atomicmassunit: 'u',
  bohr: 'a_0', hartree: 'E_h', planckbar: '\\hbar', elementarycharge: 'e', electronmass: 'm_e',
  speedoflight: 'c_0', clight: 'c_0', amu: 'u', are: 'a', erg: 'erg', gal: 'Gal', mmHg_: 'mmHg',
  degree: '{}^{\\circ}', arcminute: "{}'", arcsecond: "{}''", arcmin: "{}'", arcsec: "{}''",
};
// units set close to the number, as siunitx does
const CLOSE = new Set(['degree', 'arcminute', 'arcsecond', 'arcmin', 'arcsec']);

const SKIP = new Set(['highlight', 'cancel']);

const truthy = (v) => v == null || v === '' || v === 'true';

// key=value list as siunitx reads it
export function siOptions(s) {
  const o = {};
  if (!s) return o;
  let depth = 0, cur = '';
  const parts = [];
  for (const c of s) {
    if (c === '{') depth++;
    if (c === '}') depth--;
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += c;
  }
  parts.push(cur);
  for (const p of parts) {
    const k = p.indexOf('=');
    const key = (k < 0 ? p : p.slice(0, k)).trim();
    if (!key) continue;
    let v = k < 0 ? '' : p.slice(k + 1).trim();
    if (/^\{.*\}$/.test(v)) v = v.slice(1, -1);
    o[key] = v;
  }
  return o;
}

// the parts of a unit: [{ pre, sym, pow, den, close }] or a literal string
function unitParts(u, units) {
  const out = [];
  let pend = { pre: '', pow: null, den: false };
  let lit = '';
  const flush = () => { if (lit.trim()) out.push({ lit: lit.trim() }); lit = ''; };
  let i = 0;
  while (i < u.length) {
    const c = u[i];
    if (c !== '\\') { lit += c; i++; continue; }
    const m = /^\\([A-Za-z]+)\s*/.exec(u.slice(i));
    if (!m) { lit += u.slice(i, i + 2); i += 2; continue; }
    i += m[0].length;
    const n = m[1];
    let arg = null;
    if (n === 'tothe' || n === 'raiseto' || n === 'of' || SKIP.has(n)) {
      const g = /^\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(u.slice(i));
      if (g) { arg = g[1]; i += g[0].length; } else { const t = /^\S/.exec(u.slice(i)); if (t) { arg = t[0]; i += 1; } }
    }
    if (SKIP.has(n)) continue;
    if (PREFIX[n] != null) { flush(); pend.pre += PREFIX[n]; continue; }
    if (n === 'per') { flush(); pend.den = true; continue; }
    if (n === 'square') { pend.pow = '2'; continue; }
    if (n === 'cubic') { pend.pow = '3'; continue; }
    if (n === 'raiseto') { pend.pow = arg; continue; }
    const last = out[out.length - 1];
    if (n === 'squared' || n === 'cubed' || n === 'tothe') {
      if (last && last.sym != null) last.pow = n === 'squared' ? '2' : n === 'cubed' ? '3' : arg;
      continue;
    }
    if (n === 'of') { if (last && last.sym != null) last.sym += '_{\\mathrm{' + arg + '}}'; continue; }
    flush();
    let sym;
    if (units && units.has(n)) sym = units.get(n);
    else if (UNIT[n] != null) sym = UNIT[n];
    else sym = n.length <= 3 ? n : '\\text{' + n + '}';
    out.push({ pre: pend.pre, sym, pow: pend.pow, den: pend.den, close: CLOSE.has(n) });
    pend = { pre: '', pow: null, den: false };
  }
  flush();
  return out;
}

function one(p, neg) {
  let pow = p.pow;
  if (neg) pow = pow ? (pow[0] === '-' ? pow.slice(1) : '-' + pow) : '-1';
  return '\\mathrm{' + p.pre + p.sym + '}' + (pow ? '^{' + pow + '}' : '');
}

// KaTeX for a unit, and whether it sits close to the number (°, ′, ″)
export function siUnit(u, opt, units) {
  const parts = unitParts(u || '', units);
  if (!parts.length) return { tex: '', close: false };
  const mode = opt['per-mode'] || 'power';
  const sep = opt['inter-unit-product'] != null ? opt['inter-unit-product'] : '\\,';
  const lit = (s) => '\\mathrm{' + s.replace(/\./g, '\\cdot ').replace(/~/g, '\\,') + '}';
  const close = parts.length === 1 && !!parts[0].close;
  if (parts.some((p) => p.lit != null) || mode === 'power' || !parts.some((p) => p.den)) {
    // literal pieces (m/s^2) sit tight against their neighbours
    let tex = '';
    parts.forEach((p, k) => {
      if (k && p.lit == null && parts[k - 1].lit == null) tex += sep;
      tex += p.lit != null ? lit(p.lit) : one(p, p.den);
    });
    return { tex, close };
  }
  const num = parts.filter((p) => !p.den).map((p) => one(p, false)).join(sep);
  const den = parts.filter((p) => p.den).map((p) => one(p, false));
  if (mode === 'fraction') return { tex: '\\frac{' + (num || '1') + '}{' + den.join(sep) + '}', close };
  const d = den.length > 1 ? '(' + den.join(sep) + ')' : den[0];
  return { tex: (num || '1') + '/' + d, close };
}

function group(digits, min, sep) {
  if (digits.length < min) return digits;
  let out = '';
  for (let k = 0; k < digits.length; k++) {
    if (k && (digits.length - k) % 3 === 0) out += sep;
    out += digits[k];
  }
  return out;
}
function groupAfter(digits, min, sep) {
  if (digits.length < min) return digits;
  return digits.replace(/(\d{3})(?=\d)/g, '$1' + sep);
}

function round(s, opt) {
  const mode = opt['round-mode'];
  const prec = parseInt(opt['round-precision'] != null ? opt['round-precision'] : '2', 10);
  const x = Number(s);
  if (!mode || mode === 'none' || !isFinite(x) || !isFinite(prec)) return s;
  if (mode === 'places') return x.toFixed(Math.max(0, Math.min(20, prec)));
  if (mode === 'figures') return x === 0 ? '0' : x.toPrecision(Math.max(1, Math.min(21, prec))).replace(/e\+?(-?\d+)$/, 'e$1');
  return s;
}

// KaTeX for one number
export function siNum(raw, opt) {
  const s0 = (raw || '').trim();
  if (!s0) return '';
  if (/\\(?!pm\b|mp\b|times\b|cdot\b)[A-Za-z]/.test(s0)) return s0;
  let s = s0.replace(/\s+/g, '').replace(/\\pm/g, '+-');
  const dec = opt['output-decimal-marker'] != null ? opt['output-decimal-marker']
    : /^(DE|FR|PL|ES|IT)$/i.test(opt.locale || '') ? '{,}' : '.';
  const gsep = opt['group-separator'] != null ? opt['group-separator'] : '\\,';
  const gmin = parseInt(opt['group-minimum-digits'] || '5', 10);
  const gwhat = opt['group-digits'] || 'all';
  const prod = opt['exponent-product'] != null ? opt['exponent-product'] : '\\times';
  // products: 2x3x4
  if (s.includes('x')) return s.split('x').map((p) => siNum(p, opt)).join(prod + ' ');
  const m = /^([+-]|\+-|-\+)?(\d*)(?:[.,](\d*))?(?:\+-(\d*(?:[.,]\d*)?)|\((\d+)\))?(?:[eEdD]([+-]?\d+))?$/.exec(s);
  if (!m) return s0;
  let [, sign, int, frac, pmv, paren, exp] = m;
  if (opt['round-mode'] && (int || frac)) {
    const r = round((sign === '-' ? '-' : '') + (int || '0') + (frac ? '.' + frac : ''), opt);
    const mm = /^(-)?(\d*)(?:\.(\d*))?(?:e(-?\d+))?$/.exec(r);
    if (mm) { sign = mm[1] || (sign === '-' ? '' : sign); int = mm[2]; frac = mm[3]; if (mm[4]) exp = mm[4]; }
  }
  let out = '';
  if (sign) out += sign === '+-' ? '\\pm' : sign === '-+' ? '\\mp' : sign === '-' ? '-' : '+';
  const g = (d, after) => (gwhat === 'none' || (gwhat === 'decimal' && !after) || (gwhat === 'integer' && after) ? d : (after ? groupAfter : group)(d, gmin, gsep));
  if (int || frac != null) {
    out += g(int || '0', false);
    if (frac) out += dec + g(frac, true);
  }
  if (pmv) out += '\\pm ' + pmv.replace(/[.,]/, dec);
  if (paren) out += '(' + paren + ')';
  if (exp != null) {
    const e = exp.replace(/^\+/, '');
    out += (int || frac ? prod + ' ' : '') + '10^{' + e + '}';
  }
  return out;
}

const PHRASE = { en: ' to ', de: ' bis ', fr: ' à ', es: ' a ' };
const AND = { en: ' and ', de: ' und ', fr: ' et ', es: ' y ' };

function phrase(v, fallback) {
  if (v == null) return '\\text{' + fallback + '}';
  if (v === '--') return '\\text{--}';
  if (v === '-') return '\\text{-}';
  return /^\s*\\/.test(v) ? v : '\\text{' + v.replace(/~/g, ' ') + '}';
}

// The whole command: name and its argument texts -> KaTeX
export function siTex(name, args, global, units, lang) {
  const opt = { ...global, ...siOptions(args.opt) };
  const L = lang && PHRASE[lang] ? lang : 'en';
  const join = (n, u) => {
    if (!u.tex) return n;
    if (!n) return u.tex;
    return n + (u.close ? '' : (opt['number-unit-product'] != null ? opt['number-unit-product'] : '\\,')) + u.tex;
  };
  switch (name) {
    case 'num': case 'tablenum': return siNum(args.a, opt);
    case 'si': case 'unit': return siUnit(args.a, opt, units).tex;
    case 'SI': case 'qty': return join(siNum(args.a, opt), siUnit(args.b, opt, units));
    case 'numrange': return siNum(args.a, opt) + phrase(opt['range-phrase'], PHRASE[L]) + siNum(args.b, opt);
    case 'SIrange': case 'qtyrange': {
      const u = siUnit(args.c, opt, units);
      const ph = phrase(opt['range-phrase'], PHRASE[L]);
      const ru = opt['range-units'] || 'repeat';
      if (ru === 'single') return join(siNum(args.a, opt) + ph + siNum(args.b, opt), u);
      if (ru === 'brackets') return join('(' + siNum(args.a, opt) + ph + siNum(args.b, opt) + ')', u);
      return join(siNum(args.a, opt), u) + ph + join(siNum(args.b, opt), u);
    }
    case 'numlist': case 'SIlist': case 'qtylist': {
      const unit = name === 'numlist' ? null : siUnit(args.b, opt, units);
      const xs = (args.a || '').split(';').map((x) => x.trim()).filter(Boolean)
        .map((x) => (unit ? join(siNum(x, opt), unit) : siNum(x, opt)));
      if (xs.length < 2) return xs.join('');
      const sep = phrase(opt['list-separator'], ', ');
      const fin = phrase(opt['list-final-separator'], AND[L]);
      const pair = phrase(opt['list-pair-separator'], AND[L]);
      if (xs.length === 2) return xs[0] + pair + xs[1];
      return xs.slice(0, -1).join(sep) + fin + xs[xs.length - 1];
    }
    case 'numproduct': case 'SIproduct': case 'qtyproduct': {
      const xs = (args.a || '').split('x').map((x) => siNum(x, opt)).join('\\times ');
      return name === 'numproduct' ? xs : join(xs, siUnit(args.b, opt, units));
    }
    case 'ang': {
      const p = (args.a || '').split(';');
      const marks = ['{}^{\\circ}', "{}'", "{}''"];
      return p.map((x, k) => (x.trim() ? siNum(x, opt) + marks[k] : '')).join('');
    }
    default: return args.a || '';
  }
}

// \DeclareSIUnit's symbol as KaTeX: text symbols set in text mode
export function siUnitSymbol(def) {
  let d = (def || '').trim();
  d = d.replace(/\\(?:euro|EUR|texteuro)\b\s*/g, '€');
  if (/^[A-Za-z]+$/.test(d)) return d;
  if (/^\\(?:text|textup|textrm|mathrm)\{[^{}]*\}$/.test(d)) return '\\text{' + d.replace(/^\\[a-z]+\{|\}$/g, '') + '}';
  if (/[^\x00-\x7f]/.test(d) && !/\\/.test(d)) return '\\text{' + d + '}';
  return d;
}

const SPEC = {
  num: 'om', SI: 'omm', si: 'om', qty: 'omm', unit: 'om', numrange: 'omm', SIrange: 'ommm', qtyrange: 'ommm',
  numlist: 'om', SIlist: 'omm', qtylist: 'omm', numproduct: 'om', SIproduct: 'omm', qtyproduct: 'omm', ang: 'om', tablenum: 'om',
};
const IN_MATH = /\\(num|SI|si|qty|unit|numrange|SIrange|qtyrange|numlist|SIlist|qtylist|numproduct|SIproduct|qtyproduct|ang|tablenum)(?![A-Za-z])/g;

// siunitx commands inside a formula, replaced by their KaTeX
export function siInMath(tex, opts, units, lang) {
  if (!/\\(num|SI|si|qty|unit|ang|tablenum)/.test(tex)) return tex;
  let out = '', last = 0, m;
  IN_MATH.lastIndex = 0;
  while ((m = IN_MATH.exec(tex))) {
    const spec = SPEC[m[1]];
    let k = m.index + m[0].length;
    const got = [];
    let ok = true;
    for (const kind of spec) {
      while (tex[k] === ' ') k++;
      if (kind === 'o') {
        if (tex[k] === '[') { const e = tex.indexOf(']', k); if (e < 0) { ok = false; break; } got.push(tex.slice(k + 1, e)); k = e + 1; } else got.push('');
      } else if (tex[k] === '{') {
        let d = 0, j = k;
        for (; j < tex.length; j++) { if (tex[j] === '\\') { j++; continue; } if (tex[j] === '{') d++; else if (tex[j] === '}') { d--; if (d === 0) break; } }
        if (j >= tex.length) { ok = false; break; }
        got.push(tex.slice(k + 1, j)); k = j + 1;
      } else if (tex[k] === '\\') { const c = /^\\([A-Za-z]+|.)/.exec(tex.slice(k)); got.push(c[0]); k += c[0].length; }
      else if (k < tex.length) { got.push(tex[k]); k++; } else { ok = false; break; }
    }
    if (!ok) continue;
    out += tex.slice(last, m.index) + '{' + siTex(m[1], { opt: got[0], a: got[1], b: got[2], c: got[3] }, opts, units, lang) + '}';
    last = k;
    IN_MATH.lastIndex = k;
  }
  return out + tex.slice(last);
}
