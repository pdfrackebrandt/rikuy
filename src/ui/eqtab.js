// The Equation tab's contents (batch B13): Word's symbol groups and structures, the equation
// gallery and the equations a person saved, as LaTeX; what each needs in the preamble; and the
// menu they open in. The menu is no popover of the app's (App.makePop keeps one popover at a
// time, and the equation's field is that one): it floats beside the ribbon, a press on it keeps
// the focus where it was (in the field), and what is picked goes into the field at its caret.
// A template's empty slots are #? (MathLive's placeholders); with words selected in the field the
// first slot takes them, as Word does. Nothing here touches the page as it loads (build/app.mjs
// and the unit tests import it under node).

// ---- symbols: [LaTeX, what it is called] ---------------------------------------------------------
const S = (list) => list.map(([t, n]) => ({ tex: t, name: n }));
export const SYMBOLS = [
  { id: 'basic', name: 'Basic math', title: 'Common signs: plus or minus, infinity, not equal, times, less or equal, partial, nabla, the dots',
    icon: '<path d="M10 3.5v8M6 7.5h8M6 15.5h8"/>', items: S([
      ['\\pm', 'plus or minus'], ['\\mp', 'minus or plus'], ['\\infty', 'infinity'], ['=', 'equals'], ['\\neq', 'not equal'], ['\\sim', 'tilde, similar'], ['\\times', 'times'],
      ['\\div', 'divided by'], ['!', 'factorial'], ['\\propto', 'proportional to'], ['<', 'less than'], ['\\ll', 'much less than'], ['>', 'greater than'], ['\\gg', 'much greater than'],
      ['\\leq', 'less or equal'], ['\\geq', 'greater or equal'], ['\\cong', 'congruent'], ['\\approx', 'almost equal'], ['\\equiv', 'identical to'], ['\\forall', 'for all'],
      ['\\complement', 'complement'], ['\\partial', 'partial'], ['\\cup', 'union'], ['\\cap', 'intersection'], ['\\emptyset', 'empty set'], ['\\%', 'percent'],
      ['^{\\circ}', 'degree'], ['\\Delta', 'increment, capital delta'], ['\\nabla', 'nabla'], ['\\exists', 'there exists'], ['\\nexists', 'there does not exist'], ['\\in', 'element of'],
      ['\\ni', 'contains as member'], ['\\leftarrow', 'left arrow'], ['\\uparrow', 'up arrow'], ['\\rightarrow', 'right arrow'], ['\\downarrow', 'down arrow'],
      ['\\leftrightarrow', 'left right arrow'], ['\\therefore', 'therefore'], ['\\because', 'because'], ['+', 'plus'], ['-', 'minus'], ['\\neg', 'not'], ['\\ast', 'asterisk'],
      ['\\cdot', 'dot operator'], ['\\circ', 'ring operator'], ['\\ldots', 'dots on the line'], ['\\cdots', 'centred dots'], ['\\vdots', 'vertical dots'], ['\\ddots', 'diagonal dots'],
      ['\\prime', 'prime'], ['\\hbar', 'h bar, reduced Planck'], ['\\ell', 'script l'], ['\\Re', 'real part'], ['\\Im', 'imaginary part'], ['\\wp', 'Weierstrass p'],
      ['\\aleph', 'aleph'], ['\\beth', 'beth'], ['\\blacksquare', 'end of proof'], ['\\checkmark', 'check mark']]) },
  { id: 'greek', name: 'Greek letters', title: 'The Greek alphabet, small and capital, with the variant forms',
    icon: '<path d="M15 6.5c-1.2 4.4-2.8 9-6 9-2 0-3.2-1.6-3.2-3.8C5.8 8.8 7.6 6.5 9.6 6.5c3 0 2.6 5.6 5.6 9"/>', items: S([
      ['\\alpha', 'alpha'], ['\\beta', 'beta'], ['\\gamma', 'gamma'], ['\\delta', 'delta'], ['\\epsilon', 'epsilon'], ['\\varepsilon', 'epsilon, variant'], ['\\zeta', 'zeta'],
      ['\\eta', 'eta'], ['\\theta', 'theta'], ['\\vartheta', 'theta, variant'], ['\\iota', 'iota'], ['\\kappa', 'kappa'], ['\\varkappa', 'kappa, variant'], ['\\lambda', 'lambda'],
      ['\\mu', 'mu'], ['\\nu', 'nu'], ['\\xi', 'xi'], ['o', 'omicron'], ['\\pi', 'pi'], ['\\varpi', 'pi, variant'], ['\\rho', 'rho'], ['\\varrho', 'rho, variant'], ['\\sigma', 'sigma'],
      ['\\varsigma', 'final sigma'], ['\\tau', 'tau'], ['\\upsilon', 'upsilon'], ['\\phi', 'phi'], ['\\varphi', 'phi, variant'], ['\\chi', 'chi'], ['\\psi', 'psi'], ['\\omega', 'omega'],
      ['\\digamma', 'digamma'], ['\\Gamma', 'capital gamma'], ['\\Delta', 'capital delta'], ['\\Theta', 'capital theta'], ['\\Lambda', 'capital lambda'], ['\\Xi', 'capital xi'],
      ['\\Pi', 'capital pi'], ['\\Sigma', 'capital sigma'], ['\\Upsilon', 'capital upsilon'], ['\\Phi', 'capital phi'], ['\\Psi', 'capital psi'], ['\\Omega', 'capital omega']]) },
  { id: 'ops', name: 'Operators', title: 'Binary operators and the large operators that take limits',
    icon: '<circle cx="10" cy="10" r="6"/><path d="M10 4v12M4 10h12"/>', items: S([
      ['+', 'plus'], ['-', 'minus'], ['\\times', 'times'], ['\\div', 'divided by'], ['\\pm', 'plus or minus'], ['\\mp', 'minus or plus'], ['\\cdot', 'dot operator'],
      ['\\ast', 'asterisk'], ['\\star', 'star'], ['\\circ', 'ring operator'], ['\\bullet', 'bullet'], ['\\diamond', 'diamond'], ['\\cap', 'intersection'], ['\\cup', 'union'],
      ['\\uplus', 'multiset union'], ['\\sqcap', 'square cap'], ['\\sqcup', 'square cup'], ['\\wedge', 'logical and'], ['\\vee', 'logical or'], ['\\setminus', 'set minus'],
      ['\\oplus', 'circled plus'], ['\\ominus', 'circled minus'], ['\\otimes', 'circled times'], ['\\oslash', 'circled slash'], ['\\odot', 'circled dot'], ['\\boxplus', 'squared plus'],
      ['\\boxminus', 'squared minus'], ['\\boxtimes', 'squared times'], ['\\boxdot', 'squared dot'], ['\\dagger', 'dagger'], ['\\ddagger', 'double dagger'], ['\\amalg', 'amalgamation'],
      ['\\wr', 'wreath product'], ['\\ltimes', 'left semidirect product'], ['\\rtimes', 'right semidirect product'], ['\\dotplus', 'dot plus'], ['\\intercal', 'intercal'],
      ['\\sum', 'sum'], ['\\prod', 'product'], ['\\coprod', 'coproduct'], ['\\int', 'integral'], ['\\oint', 'contour integral'], ['\\bigcup', 'n-ary union'], ['\\bigcap', 'n-ary intersection'],
      ['\\bigvee', 'n-ary or'], ['\\bigwedge', 'n-ary and'], ['\\bigoplus', 'n-ary circled plus'], ['\\bigotimes', 'n-ary circled times'], ['\\bigodot', 'n-ary circled dot'],
      ['\\biguplus', 'n-ary multiset union'], ['\\bigsqcup', 'n-ary square union']]) },
  { id: 'arrows', name: 'Arrows', title: 'Arrows, double arrows, harpoons and the long ones',
    icon: '<path d="M3.5 10h13M12.5 6l4 4-4 4"/>', items: S([
      ['\\leftarrow', 'left arrow'], ['\\rightarrow', 'right arrow'], ['\\uparrow', 'up arrow'], ['\\downarrow', 'down arrow'], ['\\leftrightarrow', 'left right arrow'],
      ['\\updownarrow', 'up down arrow'], ['\\Leftarrow', 'left double arrow'], ['\\Rightarrow', 'right double arrow'], ['\\Uparrow', 'up double arrow'], ['\\Downarrow', 'down double arrow'],
      ['\\Leftrightarrow', 'left right double arrow'], ['\\Updownarrow', 'up down double arrow'], ['\\longleftarrow', 'long left arrow'], ['\\longrightarrow', 'long right arrow'],
      ['\\longleftrightarrow', 'long left right arrow'], ['\\Longleftarrow', 'long left double arrow'], ['\\Longrightarrow', 'long right double arrow'],
      ['\\Longleftrightarrow', 'long left right double arrow'], ['\\mapsto', 'maps to'], ['\\longmapsto', 'long maps to'], ['\\hookleftarrow', 'left hook arrow'],
      ['\\hookrightarrow', 'right hook arrow'], ['\\nearrow', 'north east arrow'], ['\\searrow', 'south east arrow'], ['\\swarrow', 'south west arrow'], ['\\nwarrow', 'north west arrow'],
      ['\\leftharpoonup', 'left harpoon up'], ['\\leftharpoondown', 'left harpoon down'], ['\\rightharpoonup', 'right harpoon up'], ['\\rightharpoondown', 'right harpoon down'],
      ['\\upharpoonleft', 'up harpoon left'], ['\\upharpoonright', 'up harpoon right'], ['\\downharpoonleft', 'down harpoon left'], ['\\downharpoonright', 'down harpoon right'],
      ['\\rightleftharpoons', 'right over left harpoons'], ['\\leftrightharpoons', 'left over right harpoons'], ['\\leftleftarrows', 'two left arrows'],
      ['\\rightrightarrows', 'two right arrows'], ['\\leftrightarrows', 'left over right arrows'], ['\\rightleftarrows', 'right over left arrows'], ['\\twoheadleftarrow', 'two headed left arrow'],
      ['\\twoheadrightarrow', 'two headed right arrow, onto'], ['\\leftarrowtail', 'left arrow with tail'], ['\\rightarrowtail', 'right arrow with tail, into'],
      ['\\curvearrowleft', 'curved left arrow'], ['\\curvearrowright', 'curved right arrow'], ['\\circlearrowleft', 'anticlockwise open circle arrow'],
      ['\\circlearrowright', 'clockwise open circle arrow'], ['\\rightsquigarrow', 'squiggly right arrow'], ['\\dashrightarrow', 'dashed right arrow'], ['\\dashleftarrow', 'dashed left arrow'],
      ['\\Lleftarrow', 'left triple arrow'], ['\\Rrightarrow', 'right triple arrow'], ['\\Lsh', 'up arrow with tip left'], ['\\Rsh', 'up arrow with tip right'],
      ['\\multimap', 'multimap'], ['\\nleftarrow', 'not left arrow'], ['\\nrightarrow', 'not right arrow'], ['\\nLeftarrow', 'not left double arrow'], ['\\nRightarrow', 'not right double arrow'],
      ['\\nleftrightarrow', 'not left right arrow'], ['\\nLeftrightarrow', 'not left right double arrow']]) },
  { id: 'relations', name: 'Relations', title: 'Relations and their negations: not less, not equivalent, not similar',
    icon: '<path d="M4 8h12M4 12.5h12M12.5 4l-5 12"/>', items: S([
      ['=', 'equals'], ['\\neq', 'not equal'], ['<', 'less than'], ['>', 'greater than'], ['\\leq', 'less or equal'], ['\\geq', 'greater or equal'], ['\\nless', 'not less than'],
      ['\\ngtr', 'not greater than'], ['\\nleq', 'neither less nor equal'], ['\\ngeq', 'neither greater nor equal'], ['\\leqslant', 'less or slanted equal'],
      ['\\geqslant', 'greater or slanted equal'], ['\\lneq', 'less but not equal'], ['\\gneq', 'greater but not equal'], ['\\ll', 'much less than'], ['\\gg', 'much greater than'],
      ['\\lll', 'very much less than'], ['\\ggg', 'very much greater than'], ['\\equiv', 'identical to'], ['\\not\\equiv', 'not identical to'], ['\\sim', 'similar'],
      ['\\nsim', 'not similar'], ['\\simeq', 'asymptotically equal'], ['\\approx', 'almost equal'], ['\\approxeq', 'almost equal or equal'], ['\\cong', 'congruent'],
      ['\\ncong', 'not congruent'], ['\\propto', 'proportional to'], ['\\asymp', 'equivalent to'], ['\\doteq', 'approaches the limit'], ['\\triangleq', 'delta equal to, defined as'],
      ['\\prec', 'precedes'], ['\\succ', 'succeeds'], ['\\preceq', 'precedes or equals'], ['\\succeq', 'succeeds or equals'], ['\\nprec', 'does not precede'], ['\\nsucc', 'does not succeed'],
      ['\\lesssim', 'less or similar'], ['\\gtrsim', 'greater or similar'], ['\\lessgtr', 'less or greater'], ['\\gtrless', 'greater or less'], ['\\mid', 'divides'],
      ['\\nmid', 'does not divide'], ['\\parallel', 'parallel to'], ['\\nparallel', 'not parallel to'], ['\\perp', 'perpendicular'], ['\\vdash', 'proves'], ['\\dashv', 'left tack'],
      ['\\models', 'models'], ['\\vDash', 'true'], ['\\nvdash', 'does not prove'], ['\\nvDash', 'not true'], ['\\smile', 'smile'], ['\\frown', 'frown'], ['\\bowtie', 'bowtie']]) },
  { id: 'sets', name: 'Sets and logic', title: 'Membership, subsets, the number sets and the signs of logic',
    icon: '<path d="M15.5 5H10a5 5 0 0 0 0 10h5.5M5 10h10.5"/>', items: S([
      ['\\in', 'element of'], ['\\notin', 'not an element of'], ['\\ni', 'contains as member'], ['\\subset', 'subset of'], ['\\supset', 'superset of'], ['\\subseteq', 'subset or equal'],
      ['\\supseteq', 'superset or equal'], ['\\subsetneq', 'proper subset'], ['\\supsetneq', 'proper superset'], ['\\nsubseteq', 'not a subset'], ['\\nsupseteq', 'not a superset'],
      ['\\sqsubseteq', 'square subset or equal'], ['\\sqsupseteq', 'square superset or equal'], ['\\cup', 'union'], ['\\cap', 'intersection'], ['\\setminus', 'set minus'],
      ['\\emptyset', 'empty set'], ['\\varnothing', 'empty set, variant'], ['\\complement', 'complement'], ['\\mathbb{N}', 'natural numbers'], ['\\mathbb{Z}', 'integers'],
      ['\\mathbb{Q}', 'rational numbers'], ['\\mathbb{R}', 'real numbers'], ['\\mathbb{C}', 'complex numbers'], ['\\aleph', 'aleph'], ['\\forall', 'for all'], ['\\exists', 'there exists'],
      ['\\nexists', 'there does not exist'], ['\\neg', 'not'], ['\\land', 'and'], ['\\lor', 'or'], ['\\implies', 'implies'], ['\\impliedby', 'is implied by'], ['\\iff', 'if and only if'],
      ['\\top', 'true, top'], ['\\bot', 'false, bottom'], ['\\therefore', 'therefore'], ['\\because', 'because'], ['\\mid', 'such that'], ['\\{', 'left brace'], ['\\}', 'right brace']]) },
  { id: 'geometry', name: 'Geometry', title: 'Angles, triangles, parallel and perpendicular, segments and arcs',
    icon: '<path d="M15.5 5L4 15.5h12.5M10.2 15.5a6.2 6.2 0 0 0-1.7-4.3"/>', items: S([
      ['\\angle', 'angle'], ['\\measuredangle', 'measured angle'], ['\\sphericalangle', 'spherical angle'], ['\\triangle', 'triangle'], ['\\perp', 'perpendicular'],
      ['\\parallel', 'parallel'], ['\\nparallel', 'not parallel'], ['\\cong', 'congruent'], ['\\sim', 'similar'], ['\\simeq', 'similar or equal'], ['^{\\circ}', 'degree'],
      ['\\square', 'square'], ['\\blacksquare', 'black square'], ['\\lozenge', 'lozenge'], ['\\bigcirc', 'circle'], ['\\odot', 'circled dot'], ['\\frown', 'arc'],
      ['\\overline{AB}', 'segment AB'], ['\\overrightarrow{AB}', 'ray or vector AB'], ['\\overleftrightarrow{AB}', 'line AB'], ['\\widehat{ABC}', 'angle ABC'], ['\\pi', 'pi'],
      ['\\therefore', 'therefore'], ['\\because', 'because']]) }
];

// ---- structures: Word's eleven, each a gallery of templates (#? is an empty slot) --------------
const T = (name, items) => ({ name, items: items.map(([t, n]) => ({ tex: t, name: n })) });
export const STRUCTURES = [
  { id: 'fraction', name: 'Fraction', title: 'Fraction: stacked, linear, small; common fractions',
    icon: '<path d="M4.5 10h11"/><rect x="7.5" y="3" width="5" height="4.5" rx=".8"/><rect x="7.5" y="12.5" width="5" height="4.5" rx=".8"/>', sections: [
      T('Fraction', [['\\frac{#?}{#?}', 'stacked fraction'], ['#?/#?', 'linear fraction'], ['\\tfrac{#?}{#?}', 'small fraction'], ['\\dfrac{#?}{#?}', 'display fraction']]),
      T('Common fractions', [['\\frac{dy}{dx}', 'dy over dx'], ['\\frac{\\Delta y}{\\Delta x}', 'delta y over delta x'], ['\\frac{\\partial y}{\\partial x}', 'partial y over partial x'],
        ['\\frac{\\delta y}{\\delta x}', 'small delta y over delta x'], ['\\frac{\\pi}{2}', 'pi over 2']])] },
  { id: 'script', name: 'Script', title: 'Superscript and subscript',
    icon: '<rect x="3.5" y="7.5" width="7" height="8" rx=".8"/><rect x="12.5" y="3" width="4.5" height="5" rx=".8"/>', sections: [
      T('Subscripts and superscripts', [['#?^{#?}', 'superscript'], ['#?_{#?}', 'subscript'], ['#?_{#?}^{#?}', 'subscript and superscript'], ['{}_{#?}^{#?}#?', 'left subscript and superscript']]),
      T('Common subscripts and superscripts', [['x_{y^2}', 'x sub y squared'], ['e^{-i\\omega t}', 'e to the minus i omega t'], ['x^2', 'x squared'], ['{}_{1}^{n}Y', 'Y with left sub 1 and sup n']])] },
  { id: 'radical', name: 'Radical', title: 'Square root, a root of any degree',
    icon: '<path d="M2.5 11l2-1 2.5 5.5L10 4h7.5"/><rect x="11" y="7.5" width="5.5" height="6" rx=".8"/>', sections: [
      T('Radicals', [['\\sqrt{#?}', 'square root'], ['\\sqrt[#?]{#?}', 'root with degree'], ['\\sqrt[3]{#?}', 'cube root'], ['\\sqrt[4]{#?}', 'fourth root']]),
      T('Common radicals', [['\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}', 'roots of a quadratic'], ['\\sqrt{a^2+b^2}', 'root of a squared plus b squared']])] },
  { id: 'integral', name: 'Integral', title: 'Integrals with and without limits, double, triple, contour; differentials',
    icon: '<path d="M13.5 3.5c-1.7-.8-3 .2-3.2 2.1l-.9 8.8c-.2 1.9-1.5 2.9-3.2 2.1"/>', sections: [
      T('Integrals', [['\\int #?', 'integral'], ['\\int_{#?}^{#?} #?', 'integral with limits'], ['\\int\\limits_{#?}^{#?} #?', 'integral with limits above and below'],
        ['\\iint #?', 'double integral'], ['\\iint_{#?} #?', 'double integral over a region'], ['\\iiint #?', 'triple integral'], ['\\iiint_{#?} #?', 'triple integral over a region']]),
      T('Contour integrals', [['\\oint #?', 'contour integral'], ['\\oint_{#?} #?', 'contour integral over a path'], ['\\oiint_{#?} #?', 'surface integral']]),
      T('Differentials', [['\\,dx', 'differential x'], ['\\,dy', 'differential y'], ['\\,d\\theta', 'differential theta']])] },
  { id: 'largeop', name: 'Large operator', title: 'Sums, products, unions, intersections with their limits',
    icon: '<path d="M15 5V3.5H5l5.5 6.5L5 16.5h10V15"/>', sections: [
      T('Summations', [['\\sum #?', 'summation'], ['\\sum_{#?}^{#?} #?', 'summation with limits'], ['\\sum_{#?} #?', 'summation with a subscript']]),
      T('Products and coproducts', [['\\prod_{#?}^{#?} #?', 'product with limits'], ['\\prod_{#?} #?', 'product with a subscript'], ['\\coprod_{#?}^{#?} #?', 'coproduct with limits']]),
      T('Unions and intersections', [['\\bigcup_{#?}^{#?} #?', 'union with limits'], ['\\bigcap_{#?}^{#?} #?', 'intersection with limits'], ['\\bigvee_{#?} #?', 'n-ary or'],
        ['\\bigwedge_{#?} #?', 'n-ary and'], ['\\bigoplus_{#?} #?', 'direct sum']]),
      T('Common large operators', [['\\sum_{k}\\binom{n}{k}', 'sum over k of n choose k'], ['\\sum_{i=0}^{n} #?', 'sum from i equals 0 to n'],
        ['\\sum_{\\substack{0\\le i\\le m\\\\0<j<n}} P(i,j)', 'sum with two conditions'], ['\\prod_{k=1}^{n} A_k', 'product of A k'], ['\\bigcup_{n=1}^{m} \\left(X_n\\cap Y_n\\right)', 'union of intersections']])] },
  { id: 'bracket', name: 'Bracket', title: 'Brackets that grow with what they hold, cases, binomial coefficients',
    icon: '<path d="M7 3.5q-3.2 6.5 0 13M13 3.5q3.2 6.5 0 13"/><rect x="8.3" y="7.5" width="3.4" height="5" rx=".6"/>', sections: [
      T('Brackets', [['\\left(#?\\right)', 'parentheses'], ['\\left[#?\\right]', 'square brackets'], ['\\left\\{#?\\right\\}', 'braces'], ['\\left\\langle #?\\right\\rangle', 'angle brackets'],
        ['\\left\\lfloor #?\\right\\rfloor', 'floor'], ['\\left\\lceil #?\\right\\rceil', 'ceiling'], ['\\left|#?\\right|', 'absolute value'], ['\\left\\|#?\\right\\|', 'norm'],
        ['\\left[#?\\right)', 'half open interval'], ['\\llbracket #?\\rrbracket', 'double square brackets']]),
      T('Brackets with separators', [['\\left(#?\\middle|#?\\right)', 'parentheses with a bar'], ['\\left\\{#?\\middle|#?\\right\\}', 'set builder braces'],
        ['\\left\\langle #?\\middle|#?\\right\\rangle', 'bra ket']]),
      T('Cases and stacks', [['\\begin{cases}#? & #?\\\\#? & #?\\end{cases}', 'cases, two'], ['\\begin{cases}#? & #?\\\\#? & #?\\\\#? & #?\\end{cases}', 'cases, three'],
        ['\\binom{#?}{#?}', 'binomial coefficient']]),
      T('Common brackets', [['f(x)=\\begin{cases}-x, & x<0\\\\x, & x\\ge 0\\end{cases}', 'absolute value as cases'], ['\\binom{n}{k}', 'n choose k'],
        ['\\left\\langle\\frac{n}{k}\\right\\rangle', 'n over k in angle brackets']])] },
  { id: 'function', name: 'Function', title: 'Trigonometric and hyperbolic functions, and their inverses',
    icon: '<path d="M8 4.5c-1.6-.6-2.7.3-2.9 1.8L3.9 15.7c-.2 1.6-1.3 2.4-2.9 1.8M2.8 9h5M10 8l6 7M16 8l-6 7"/>', sections: [
      T('Trigonometric functions', [['\\sin #?', 'sine'], ['\\cos #?', 'cosine'], ['\\tan #?', 'tangent'], ['\\csc #?', 'cosecant'], ['\\sec #?', 'secant'], ['\\cot #?', 'cotangent']]),
      T('Inverse functions', [['\\arcsin #?', 'arcsine'], ['\\arccos #?', 'arccosine'], ['\\arctan #?', 'arctangent'], ['\\sin^{-1} #?', 'inverse sine'], ['\\cos^{-1} #?', 'inverse cosine'],
        ['\\tan^{-1} #?', 'inverse tangent']]),
      T('Hyperbolic functions', [['\\sinh #?', 'hyperbolic sine'], ['\\cosh #?', 'hyperbolic cosine'], ['\\tanh #?', 'hyperbolic tangent'], ['\\coth #?', 'hyperbolic cotangent']]),
      T('Common functions', [['\\sin\\theta', 'sine theta'], ['\\sin 2x', 'sine 2x'], ['\\tan\\theta=\\frac{\\sin\\theta}{\\cos\\theta}', 'tangent as a quotient']])] },
  { id: 'accent', name: 'Accent', title: 'Dots, hats, bars, arrows and braces over or under, a box around',
    icon: '<rect x="6.5" y="8" width="7" height="8" rx=".8"/><path d="M7 5.5l3-2.5 3 2.5"/>', sections: [
      T('Accents', [['\\dot{#?}', 'dot'], ['\\ddot{#?}', 'double dot'], ['\\dddot{#?}', 'triple dot'], ['\\hat{#?}', 'hat'], ['\\check{#?}', 'check'], ['\\acute{#?}', 'acute'],
        ['\\grave{#?}', 'grave'], ['\\breve{#?}', 'breve'], ['\\tilde{#?}', 'tilde'], ['\\bar{#?}', 'bar'], ['\\vec{#?}', 'vector arrow'], ['\\widehat{#?}', 'wide hat'], ['\\widetilde{#?}', 'wide tilde']]),
      T('Overbars, arrows and braces', [['\\overline{#?}', 'overbar'], ['\\underline{#?}', 'underbar'], ['\\overrightarrow{#?}', 'right arrow above'], ['\\overleftarrow{#?}', 'left arrow above'],
        ['\\overleftrightarrow{#?}', 'double headed arrow above'], ['\\overbrace{#?}^{#?}', 'overbrace'], ['\\underbrace{#?}_{#?}', 'underbrace']]),
      T('Boxed formulas', [['\\boxed{#?}', 'boxed formula']])] },
  { id: 'limit', name: 'Limit and log', title: 'Limits, maximum and minimum, logarithms',
    icon: '<path d="M3 5v9.5h3M8.2 9v5.5M8.2 6.2v.2M10.8 9v5.5M10.8 10c.4-.9 1-1.2 1.7-1.2.8 0 1.3.6 1.3 1.6v4.1M13.8 10c.4-.9 1-1.2 1.7-1.2.8 0 1.3.6 1.3 1.6v4.1"/>', sections: [
      T('Functions', [['\\log_{#?} #?', 'logarithm to a base'], ['\\log #?', 'logarithm'], ['\\ln #?', 'natural logarithm'], ['\\lim_{#?} #?', 'limit'], ['\\min_{#?} #?', 'minimum'],
        ['\\max_{#?} #?', 'maximum'], ['\\sup_{#?} #?', 'supremum'], ['\\inf_{#?} #?', 'infimum'], ['\\limsup_{#?} #?', 'limit superior'], ['\\liminf_{#?} #?', 'limit inferior']]),
      T('Common functions', [['\\lim_{n\\to\\infty}\\left(1+\\frac{1}{n}\\right)^n', 'the limit that gives e'], ['\\max_{0\\le x\\le 1} x e^{-x^2}', 'a maximum on [0, 1]'],
        ['\\lim_{x\\to 0}\\frac{\\sin x}{x}', 'sine x over x at 0']])] },
  { id: 'operator', name: 'Operator', title: 'Equal by definition, arrows with words over or under, one thing set over another',
    icon: '<path d="M3.5 12.5h13M3.5 16h13M5.5 7h9M12 4.5l2.5 2.5-2.5 2.5"/>', sections: [
      T('Basic operators', [['\\coloneqq', 'colon equals'], ['==', 'equals equals'], ['+=', 'plus equals'], ['-=', 'minus equals'], ['\\stackrel{\\text{def}}{=}', 'equal by definition'],
        ['\\triangleq', 'delta equal to'], ['\\stackrel{\\text{m}}{=}', 'measured by']]),
      T('Operator structures', [['\\xrightarrow{#?}', 'right arrow with words above'], ['\\xleftarrow{#?}', 'left arrow with words above'], ['\\xrightarrow[#?]{#?}', 'right arrow with words above and below'],
        ['\\overset{#?}{#?}', 'one thing set over another'], ['\\underset{#?}{#?}', 'one thing set under another']]),
      T('Common operator structures', [['\\xrightarrow{\\text{yields}}', 'yields'], ['\\xrightarrow{\\Delta}', 'delta over an arrow']])] },
  { id: 'matrix', name: 'Matrix', title: 'Empty matrices, dots, identity matrices, matrices in brackets',
    icon: '<path d="M5 3.5H3.5v13H5M15 3.5h1.5v13H15"/><rect x="6" y="5" width="3" height="3.5" rx=".5"/><rect x="11" y="5" width="3" height="3.5" rx=".5"/><rect x="6" y="11.5" width="3" height="3.5" rx=".5"/><rect x="11" y="11.5" width="3" height="3.5" rx=".5"/>', sections: [
      T('Empty matrices', [['\\begin{matrix}#? & #?\\end{matrix}', '1 by 2'], ['\\begin{matrix}#?\\\\#?\\end{matrix}', '2 by 1'], ['\\begin{matrix}#? & #? & #?\\end{matrix}', '1 by 3'],
        ['\\begin{matrix}#?\\\\#?\\\\#?\\end{matrix}', '3 by 1'], ['\\begin{matrix}#? & #?\\\\#? & #?\\end{matrix}', '2 by 2'], ['\\begin{matrix}#? & #? & #?\\\\#? & #? & #?\\end{matrix}', '2 by 3'],
        ['\\begin{matrix}#? & #? & #?\\\\#? & #? & #?\\\\#? & #? & #?\\end{matrix}', '3 by 3']]),
      T('Dots', [['\\cdots', 'midline dots'], ['\\ldots', 'baseline dots'], ['\\vdots', 'vertical dots'], ['\\ddots', 'diagonal dots']]),
      T('Identity matrices', [['\\begin{matrix}1 & 0\\\\0 & 1\\end{matrix}', '2 by 2 identity'], ['\\begin{matrix}1 & 0 & 0\\\\0 & 1 & 0\\\\0 & 0 & 1\\end{matrix}', '3 by 3 identity']]),
      T('Matrices with brackets', [['\\begin{pmatrix}#? & #?\\\\#? & #?\\end{pmatrix}', 'in parentheses'], ['\\begin{bmatrix}#? & #?\\\\#? & #?\\end{bmatrix}', 'in square brackets'],
        ['\\begin{vmatrix}#? & #?\\\\#? & #?\\end{vmatrix}', 'determinant'], ['\\begin{Vmatrix}#? & #?\\\\#? & #?\\end{Vmatrix}', 'in double bars'],
        ['\\begin{Bmatrix}#? & #?\\\\#? & #?\\end{Bmatrix}', 'in braces'], ['\\begin{pmatrix}a & b\\\\c & d\\end{pmatrix}', 'a b c d in parentheses'],
        ['\\begin{bmatrix}1 & 0\\\\0 & 1\\end{bmatrix}', 'identity in square brackets']])] }
];

// ---- the equation gallery: Word's built in equations ----------------------------------------------
export const GALLERY = [
  ['Area of circle', 'A=\\pi r^2'],
  ['Binomial theorem', '(x+a)^n=\\sum_{k=0}^{n}\\binom{n}{k}x^k a^{n-k}'],
  ['Expansion of a sum', '(1+x)^n=1+\\frac{nx}{1!}+\\frac{n(n-1)x^2}{2!}+\\cdots'],
  ['Fourier series', 'f(x)=a_0+\\sum_{n=1}^{\\infty}\\left(a_n\\cos\\frac{n\\pi x}{L}+b_n\\sin\\frac{n\\pi x}{L}\\right)'],
  ['Pythagorean theorem', 'a^2+b^2=c^2'],
  ['Quadratic formula', 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}'],
  ['Taylor expansion', 'e^x=1+\\frac{x}{1!}+\\frac{x^2}{2!}+\\frac{x^3}{3!}+\\cdots,\\quad -\\infty<x<\\infty'],
  ['Trig identity 1', '\\sin\\alpha\\pm\\sin\\beta=2\\sin\\frac{1}{2}(\\alpha\\pm\\beta)\\cos\\frac{1}{2}(\\alpha\\mp\\beta)'],
  ['Trig identity 2', '\\cos\\alpha+\\cos\\beta=2\\cos\\frac{1}{2}(\\alpha+\\beta)\\cos\\frac{1}{2}(\\alpha-\\beta)']
].map(([name, tex]) => ({ name, tex }));

// ---- what a formula needs in the preamble -------------------------------------------------------
// The commands and environments the tab writes that the kernel lacks, by the package that has them.
// (amssymb loads amsfonts, which has \mathbb; stmaryrd, esint and mathtools come from src/wordmath.js's
// PACKAGES, which the field already adds when it closes.)
const AMSMATH = new Set(('binom dbinom tbinom dfrac tfrac cfrac genfrac iint iiint iiiint idotsint overset underset xrightarrow xleftarrow boxed substack sideset dddot ddddot ' +
  'overleftrightarrow underleftarrow underrightarrow underleftrightarrow text operatorname lvert rvert lVert rVert implies impliedby eqref tag notag dotsb dotsc dotsi dotsm dotso').split(' '));
const AMSMATH_ENVS = new Set('matrix pmatrix bmatrix Bmatrix vmatrix Vmatrix smallmatrix cases aligned gathered split alignedat multline multline* gather gather* align align* flalign flalign* alignat alignat* equation*'.split(' '));
const AMSSYMB = new Set(('mathbb varnothing nexists therefore because complement beth gimel daleth digamma varkappa Bbbk square blacksquare lozenge blacklozenge measuredangle sphericalangle ' +
  'leqslant geqslant lesssim gtrsim lessgtr gtrless lll ggg approxeq triangleq nless ngtr nleq ngeq lneq gneq lneqq gneqq nsim ncong nprec nsucc nmid nparallel nvdash nvDash vDash Vdash ' +
  'subsetneq supsetneq nsubseteq nsupseteq dotplus boxplus boxminus boxtimes boxdot ltimes rtimes intercal leftleftarrows rightrightarrows leftrightarrows rightleftarrows twoheadleftarrow ' +
  'twoheadrightarrow leftarrowtail rightarrowtail curvearrowleft curvearrowright circlearrowleft circlearrowright rightsquigarrow dashrightarrow dashleftarrow Lleftarrow Rrightarrow Lsh Rsh ' +
  'multimap nleftarrow nrightarrow nLeftarrow nRightarrow nleftrightarrow nLeftrightarrow upharpoonleft upharpoonright downharpoonleft downharpoonright leftrightharpoons checkmark').split(' '));
// packages that load amsmath, or give every symbol of amssymb (and stop with an error when
// amssymb comes after them: \Bbbk already defined)
const HAS_AMSMATH = ['amsmath', 'mathtools', 'unicode-math', 'empheq'];
const AMS_CLASSES = /^(amsart|amsbook|amsproc)$/;
const HAS_AMSSYMB = ['amssymb', 'newtxmath', 'newpxmath', 'mathabx', 'MnSymbol', 'fdsymbol', 'stix', 'stix2', 'unicode-math', 'txfonts', 'pxfonts', 'mathdesign', 'libertinust1math', 'kpfonts', 'boisik', 'lucidabr'];

// The packages these formulas need, as a set ('amsmath', 'amssymb'). Bounded: a formula's text
// may be a stranger's (an equation of a shared document); only its first 20000 characters are read.
export function mathNeeds(tex, env) {
  const out = new Set();
  const t = String(tex || '').slice(0, 20000);
  for (let m, re = /\\(?:begin\s*\{([A-Za-z]{1,20}\*?)\}|([A-Za-z]{1,40}))/g; (m = re.exec(t));) {
    if (m[1]) { if (AMSMATH_ENVS.has(m[1])) out.add('amsmath'); }
    else if (AMSMATH.has(m[2])) out.add('amsmath');
    else if (AMSSYMB.has(m[2])) out.add('amssymb');
  }
  if (env && AMSMATH_ENVS.has(env)) out.add('amsmath');
  return out;
}
// whether the document has a package's commands already: (has(name) reads the preamble and the
// files it inputs; cls is the document's class)
export function provided(pkg, has, cls) {
  if (pkg === 'amsmath') return HAS_AMSMATH.some(has) || AMS_CLASSES.test(cls || '');
  if (pkg === 'amssymb') return HAS_AMSSYMB.some(has);
  return has(pkg);
}

// A template as it shows in its tile: each empty slot a grey square
export const tileTex = (tex) => String(tex).replace(/#\?/g, '{\\color{#9a9a9a}\\square}');

// A template written as plain LaTeX into a text box: the selection in the first slot, the other
// slots empty; the caret goes to the first slot left empty (or after it all). A symbol (no slot)
// takes the selection's place, as Word's does. { text, caret }
export function fillSlots(tex, sel) {
  let text = '', caret = -1, used = !sel || !String(tex).includes('#?');
  const parts = String(tex).split('#?');
  parts.forEach((p, i) => {
    text += p;
    if (i === parts.length - 1) return;
    if (!used) { text += sel; used = true; } else if (caret < 0) caret = text.length;
  });
  if (!used) text += sel;
  return { text, caret: caret < 0 ? text.length : caret };
}

// Why a formula's text cannot be written between $ and $ (or in an equation) as it is, or '': a
// brace left open or closed too often, a $ or a % that is no sign, a backslash at the end, a blank
// line, a display's own delimiters, an environment begun and not ended (or the other way), the
// document's own \begin{document}. A saved equation may come from a stranger's document: written
// as it is, it could close the formula early and put the rest of its text in the paper. Bounded.
export function mathSafe(tex) {
  const t = String(tex);
  if (t.length > 4000) return 'It is too long.';
  if (/\n[ \t]*\n/.test(t)) return 'It has a blank line.';
  let depth = 0, env = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\\') {
      const n = t[i + 1];
      if (n === undefined) return 'It ends with a backslash.';
      if (n === '[' || n === ']' || n === '(' || n === ')') return 'It has a display\'s own delimiters.';
      if (/[A-Za-z]/.test(n)) {
        let j = i + 1;
        while (j < t.length && /[A-Za-z]/.test(t[j])) j++;
        const w = t.slice(i + 1, j);
        if (w === 'begin' || w === 'end') {
          const m = /^\s*\{([^{}]{0,40})\}/.exec(t.slice(j, j + 60));
          if (!m || m[1] === 'document') return 'It has a \\' + w + ' that is no environment of its own.';
          env += w === 'begin' ? 1 : -1;
          if (env < 0) return 'It ends an environment it did not begin.';
        }
        i = j - 1;
      } else i++;
      continue;
    }
    if (c === '$') return 'It has a $ that is no sign (\\$).';
    if (c === '%') return 'It has a comment (%).';
    if (c === '{') depth++;
    else if (c === '}' && --depth < 0) return 'A } has no { before it.';
  }
  if (depth) return 'A { is not closed.';
  if (env) return 'An environment is not ended.';
  return '';
}

// ---- the equations a person saved (E5): kept in this browser, for every document -----------------
export const SAVED_KEY = 'rikuy.equations.v1';
export const SAVED_MAX = 40;
export function readSaved(raw) {
  let list = [];
  try { list = JSON.parse(raw || '[]'); } catch (e) { list = []; }
  if (!Array.isArray(list)) return [];
  return list.slice(0, 1000).filter((x) => x && typeof x.name === 'string' && typeof x.tex === 'string' && !mathSafe(x.tex)).slice(0, SAVED_MAX).map((x) => ({ name: x.name.slice(0, 80), tex: x.tex }));
}
// one more, first; a name met already is replaced
export function addSaved(list, name, tex) {
  name = String(name).replace(/\s+/g, ' ').trim().slice(0, 80) || 'Saved equation';
  return [{ name, tex: String(tex).slice(0, 4000) }, ...list.filter((x) => x.name !== name)].slice(0, SAVED_MAX);
}

// ---- the menu --------------------------------------------------------------------------------------
// eqMenu(app, anchor, sections, o): sections [{ name, items: [{ name, title, tex | html, label, run,
// disabled, checked }] }], each a group of tiles (o.cols across) or, with o.list, of rows. The menu
// is role menu, named o.label, each item a menuitem named by its name (a symbol's: its LaTeX and
// what it is called, "\pm plus or minus"). A press keeps the focus where it was; the keyboard reaches
// it from the ribbon (the first item takes the focus), the arrows move by place, Escape and Tab
// close it and the focus goes back to the field. Only one is open at a time.
let OPEN = null;
export function eqMenuOpen() { return OPEN ? OPEN.el : null; }
export function closeEqMenu(back) {
  const m = OPEN;
  if (!m) return;
  OPEN = null;
  document.removeEventListener('mousedown', m.outside, true);
  document.removeEventListener('keydown', m.esc, true);
  removeEventListener('resize', m.close);
  // (one in the app's popover goes with it: silent, the caller puts the caret back)
  if (m.app && m.app.pop && m.app.pop.el === m.el) m.app.closePop(true);
  m.el.remove();
  if (m.anchor && m.anchor.getAttribute('aria-expanded') === 'true') m.anchor.setAttribute('aria-expanded', 'false');
  if (back && m.back) m.back();
}
const isOff = (x) => x.getAttribute('aria-disabled') === 'true';

// o.pop: no field is open (Insert's Equation options, the search box): the menu is the app's
// popover, as the kit's menus are, so the blank paragraph the caret is in waits for its choice.
export function eqMenu(app, anchor, sections, o = {}) {
  closeEqMenu();
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const cls = 'pop-menu eq-menu' + (o.list ? ' eq-list' : ' eq-grid') + (o.cls ? ' ' + o.cls : '');
  const p = o.pop ? app.makePop(null, cls, null) : el('div', 'pop ' + cls);
  p.setAttribute('role', 'menu');
  p.setAttribute('aria-label', o.label || 'Equation');
  if (o.id) p.id = o.id;
  p.style.setProperty('--cols', o.cols || 8);
  // tiles drawn by KaTeX once per formula (the menus open often)
  const cache = app.eqTiles || (app.eqTiles = new Map());
  const draw = (tex) => {
    if (cache.has(tex)) return cache.get(tex);
    let r = null;
    try { r = app.renderer.katex(tileTex(tex), false); } catch (e) { r = null; }
    // (not kept while KaTeX is still on its way: its stand in is the LaTeX as text)
    if (r && !r.loading) { if (cache.size > 2000) cache.clear(); cache.set(tex, r.html); }
    return r ? r.html : '';
  };
  // (the gallery's equations as Word shows them: display style)
  const drawItem = (it) => draw(it.display ? '\\displaystyle ' + it.tex : it.tex);
  for (const sec of sections) {
    if (!sec || !sec.items.length) continue;
    const g = el('div', 'eq-sec');
    g.setAttribute('role', 'group');
    if (sec.name) { g.setAttribute('aria-label', sec.name); const h = el('div', 'eq-h', sec.name); h.setAttribute('aria-hidden', 'true'); p.append(h); }
    for (const it of sec.items) {
      const a = el('button', 'eq-mi' + (it.cls ? ' ' + it.cls : ''));
      a.type = 'button';
      a.setAttribute('role', it.checked === undefined ? 'menuitem' : 'menuitemradio');
      if (it.checked !== undefined) a.setAttribute('aria-checked', it.checked ? 'true' : 'false');
      a.setAttribute('aria-label', it.name);
      a.title = it.title || it.name;
      a.tabIndex = -1;
      if (it.label != null) a.append(el('span', 'eq-ml', it.label));
      // (KaTeX's markup of a formula, or the code's own; a saved equation's name is text above)
      if (it.tex != null) { const x = el('span', 'eq-mx'); x.setAttribute('aria-hidden', 'true'); x.innerHTML = drawItem(it); a.append(x); }
      else if (it.html) { const x = el('span', 'eq-mx'); x.setAttribute('aria-hidden', 'true'); x.innerHTML = it.html; a.append(x); }
      if (it.disabled) a.setAttribute('aria-disabled', 'true');
      a.addEventListener('click', () => { if (isOff(a)) return; closeEqMenu(false); if (it.run) it.run(); });
      g.append(a);
    }
    p.append(g);
  }
  // a press anywhere on it keeps the focus (and the field's caret) where it was
  p.addEventListener('mousedown', (e) => { if (!e.target.closest('input')) e.preventDefault(); e.stopPropagation(); });
  const items = () => [...p.querySelectorAll('[role^=menuitem]')].filter((a) => !isOff(a));
  p.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); closeEqMenu(true); return; }
    if (!/^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) return;
    const all = items();
    if (!all.length) return;
    e.preventDefault(); e.stopPropagation();
    const cur = all.indexOf(document.activeElement);
    if (cur < 0 || e.key === 'Home') { all[e.key === 'End' ? all.length - 1 : 0].focus(); return; }
    if (e.key === 'End') { all[all.length - 1].focus(); return; }
    // by place: the nearest item that way, in a grid or in a list alike
    const r = all[cur].getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    let best = null, bd = Infinity;
    for (const a of all) {
      if (a === all[cur]) continue;
      const q = a.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
      const along = dx * dir[0] + dy * dir[1], across = Math.abs(dx * dir[1]) + Math.abs(dy * dir[0]);
      if (along <= 1) continue;
      const d = along + across * 3;
      if (d < bd) { bd = d; best = a; }
    }
    // (past the end of a row or a column: on to the next item in order, round)
    if (!best) best = all[(cur + (dir[0] + dir[1] > 0 ? 1 : all.length - 1)) % all.length];
    best.focus();
  });
  if (!o.pop) document.body.append(p);
  // under the button, kept on the screen; taller than the room, it scrolls
  const R = anchor && anchor.isConnected && anchor.offsetParent ? anchor.getBoundingClientRect() : (o.rect || new DOMRect(innerWidth / 2 - 150, 60, 0, 0));
  const w = p.offsetWidth;
  p.style.maxHeight = Math.max(160, innerHeight - R.bottom - 12) + 'px';
  p.style.left = Math.max(8, Math.min(innerWidth - w - 8, R.left)) + 'px';
  p.style.top = (R.bottom + 4) + 'px';
  if (anchor && anchor.hasAttribute('aria-expanded')) anchor.setAttribute('aria-expanded', 'true');
  const m = { el: p, anchor, app, back: o.back || (() => { if (anchor && anchor.isConnected) anchor.focus(); }) };
  // (the app's popover closed by its own means, a press elsewhere: the menu is gone too)
  if (o.pop) app.pop.onClose = () => { if (OPEN === m) { OPEN = null; document.removeEventListener('mousedown', m.outside, true); document.removeEventListener('keydown', m.esc, true); removeEventListener('resize', m.close); if (anchor && anchor.hasAttribute('aria-expanded')) anchor.setAttribute('aria-expanded', 'false'); } };
  m.outside = (e) => { if (!p.contains(e.target) && !(anchor && anchor.contains(e.target))) closeEqMenu(false); };
  m.close = () => closeEqMenu(false);
  // (opened by a press, the focus stayed in the field: Escape there closes the menu, not the field)
  m.esc = (e) => { if (e.key === 'Escape' && !p.contains(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); closeEqMenu(true); } };
  document.addEventListener('mousedown', m.outside, true);
  document.addEventListener('keydown', m.esc, true);
  addEventListener('resize', m.close);
  OPEN = m;
  if (o.focus) { const first = items()[0]; if (first) first.focus(); }
  return p;
}

// A small form beside the ribbon, for the name of an equation to save: role dialog, named by its
// title; Enter saves, Escape closes. onSave(name).
export function eqAsk(app, anchor, o) {
  closeEqMenu();
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const p = el('div', 'pop eq-menu eq-ask');
  p.setAttribute('role', 'dialog');
  p.setAttribute('aria-label', o.title);
  const h = el('div', 'eq-h', o.title);
  const inp = el('input', 'eq-in');
  inp.type = 'text'; inp.id = 'eq-save-name'; inp.value = o.value || ''; inp.maxLength = 80; inp.setAttribute('aria-label', 'Name'); inp.autocomplete = 'off';
  const row = el('div', 'pop-row');
  const save = el('button', 'btn sm', 'Save'), cancel = el('button', 'btn ghost sm', 'Cancel');
  save.type = cancel.type = 'button';
  row.append(cancel, save);
  p.append(h, inp, row);
  p.addEventListener('mousedown', (e) => e.stopPropagation());
  const done = (ok) => { const v = inp.value; closeEqMenu(true); if (ok) o.onSave(v); };
  save.addEventListener('click', () => done(true));
  cancel.addEventListener('click', () => done(false));
  p.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
  });
  document.body.append(p);
  const R = anchor && anchor.isConnected && anchor.offsetParent ? anchor.getBoundingClientRect() : new DOMRect(innerWidth / 2 - 140, 60, 0, 0);
  p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, R.left)) + 'px';
  p.style.top = (R.bottom + 4) + 'px';
  const m = { el: p, anchor, back: o.back };
  m.outside = (e) => { if (!p.contains(e.target)) closeEqMenu(false); };
  m.close = () => closeEqMenu(false);
  m.esc = () => {};
  document.addEventListener('mousedown', m.outside, true);
  addEventListener('resize', m.close);
  OPEN = m;
  inp.focus(); inp.select();
  return p;
}
