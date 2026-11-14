"""Every command name (letters only, two to thirty of them) LaTeX's kernel with the article class
defines, and what each of a list of packages adds, as LuaTeX's hash table has them after loading
it: src/texnames.txt, one sorted list of them all, a name a line, which Create a Style's name check
reads (a style of the document's own may take none of them: \\newcommand{\\big} stops TeX). The
page does not carry it: build.mjs writes it beside the page as texnames-<hash>.txt, fetched the
first time Create a Style opens (src/ui/stylespane.js), kept by the service worker as a file named
by its hash. Its first line, a % comment, names the TeX Live it came from.

Needs a native LuaLaTeX; run from the repository's root: python3 dev/texnames.py. The list in git
came from the TeX Live 2023 of Debian's packages, not Rikuy's own: when it is convenient, run this
again against Rikuy's TeX Live 2026 (the desktop copy of dev/fetch_tl26.sh, its bin/ first on PATH)
so the names are those of the TeX Live the page compiles with."""
import os, subprocess, sys, tempfile

PACKAGES = ('amsmath amssymb amsfonts amsthm mathtools latexsym stmaryrd mathrsfs bm upgreek esint dsfont bbm cancel physics braket '
            'graphicx xcolor color hyperref url comment tikz pgfplots tcolorbox mdframed thmtools framed enumitem booktabs array tabularx '
            'longtable multirow makecell colortbl threeparttable geometry fancyhdr titlesec titling sectsty tocloft caption subcaption float '
            'wrapfig multicol natbib biblatex listings fancyvrb verbatim siunitx ulem soul setspace parskip xspace babel microtype csquotes '
            'cleveref todonotes lipsum mhchem algorithm algpseudocode algorithm2e textcomp gensymb pifont marvosym wasysym '
            'glossaries nomencl imakeidx makeidx appendix pdfpages adjustbox changepage etoolbox ifthen calc xparse fontspec unicode-math '
            'newtxtext newtxmath lmodern minted tabu chemfig').split()

LUA = r"""
local f = io.open(OUTFILE, 'w')
for _, n in ipairs(tex.hashtokens()) do
  if n:match('^[A-Za-z][A-Za-z]+$') and #n <= 30 and token.is_defined(n) then f:write(n, '\n') end
end
f:close()
"""


def dump(work, pre, name):
    tex = '\\documentclass{article}\n' + pre + '\\directlua{OUTFILE="' + name + '.txt" dofile("dump.lua")}\n\\begin{document}x\\end{document}\n'
    open(os.path.join(work, name + '.tex'), 'w').write(tex)
    subprocess.run(['lualatex', '-interaction=batchmode', '-shell-escape', name + '.tex'], cwd=work, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300)
    p = os.path.join(work, name + '.txt')
    return set(open(p).read().split()) if os.path.exists(p) else None


def main():
    work = tempfile.mkdtemp()
    open(os.path.join(work, 'dump.lua'), 'w').write(LUA)
    version = subprocess.run(['lualatex', '--version'], capture_output=True, text=True).stdout.splitlines()[0]
    base = dump(work, '', 'base')
    out, skipped = {}, []
    for p in PACKAGES:
        got = dump(work, '\\usepackage{' + p + '}\n', 'p_' + p.replace('-', '_'))
        if got is None: skipped.append(p); continue
        out[p] = sorted(got - base)
    names = set(base)
    for v in out.values(): names |= set(v)
    head = ('% dev/texnames.py, from ' + version + ': the command names LaTeX\'s kernel with the article class defines and what '
            + str(len(out)) + ' packages add (their list is in the script)' + ('; not loaded there: ' + ', '.join(skipped) if skipped else '')
            + '. Create a Style refuses them. Do not edit: run the script again.')
    open(os.path.join('src', 'texnames.txt'), 'w').write(head + '\n' + '\n'.join(sorted(names)) + '\n')
    print('names', len(names), 'packages', len(out), 'skipped', skipped, 'bytes', os.path.getsize('src/texnames.txt'))


if __name__ == '__main__':
    sys.exit(main())
