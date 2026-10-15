#!/usr/bin/env python3
"""xindy's Lisp sources for ECL (build_tools.sh xindy): copies TeX Live's xindy-src/src/*.lsp to
OUT with the spots that only CLISP had an answer for given one for ECL, plus defaults.xdy and
compat.lsp. main.c loads them from there.

Usage: patch_xindy.py XINDY_SRC_DIR OUT_DIR MODULE_DIR
"""
import os, shutil, sys

src, out, moduledir = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
here = os.path.dirname(os.path.abspath(__file__))
FILES = ['base', 'locref', 'ordrules', 'idxstyle', 'index', 'version', 'markup']
EDITS = {
    # leaving: CLISP, Allegro and CMU each had their own call
    'base': [('  #+CLISP (exit 1)\n', '  #+CLISP (exit 1)\n  #+ECL (cl-user::galley-exit 1)\n'),
             ('  #+CLISP (exit 0)\n', '  #+CLISP (exit 0)\n  #+ECL (cl-user::galley-exit 0)\n'),
             # CLISP compiles each file on its own, so this feature, set when base is loaded, is
             # never there when the others are read; ECL loads them one after the other
             ('(pushnew :ASSERT! *features*)\n', ';; (pushnew :ASSERT! *features*) -- Galley: see patch_xindy.py\n'),
             # SORT may relink a list's conses (ECL's does; CLISP's moves the elements instead):
             # the sorted list is the value SORT returns
             ('(if sortfunc (sort key-list sortfunc) key-list))',
              '(if sortfunc (setq key-list (sort key-list sortfunc)) key-list))')],
    # a string's next character, from a file: ECL asks the system whether one is waiting
    # (select), which a browser cannot answer; from a file it is the same as READ-CHAR
    'idxstyle': [('(read-char-no-hang stream t #\\Newline t)', '(read-char stream t #\\Newline t)')],
    # XINDY_SEARCHPATH
    'markup': [('             #+ALLEGRO\n             sys:getenv\n',
                '             #+ALLEGRO\n             sys:getenv\n             #+ECL\n             ext:getenv\n')],
}
# An error's message: CLISP's conditions all carry a format string and its arguments (its
# UNBOUND-VARIABLE is a SIMPLE-CONDITION too), so xindy reads them from any error; elsewhere only
# simple conditions have them, and the others are written as themselves (compat.lsp)
EDITS['base'].append(('''#-CLISP
(defmacro simple-condition-format-string (&rest args)
  `(simple-condition-format-control ,@args))''', '''#-CLISP
(defun simple-condition-format-string (c)
  (if (typep c 'simple-condition) (simple-condition-format-control c) "~A"))'''))
for f in FILES:
    s = open(os.path.join(src, f + '.lsp'), encoding='latin-1').read()
    for old, new in EDITS.get(f, []):
        assert s.count(old) == 1, (f, old)
        s = s.replace(old, new)
    s = s.replace('(simple-condition-format-arguments ', '(cl-user::galley-format-arguments ')
    open(os.path.join(out, f + '.lsp'), 'w', encoding='latin-1').write(s)
s = open(os.path.join(src, 'defaults.xdy.in'), encoding='latin-1').read()
open(os.path.join(out, 'defaults.xdy'), 'w', encoding='latin-1').write(s.replace('@MODULEDIR@', moduledir))
shutil.copy(os.path.join(here, 'compat.lsp'), out)
print('xindy lisp ->', out)
