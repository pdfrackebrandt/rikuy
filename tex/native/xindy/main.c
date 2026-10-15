/* xindy for Galley: TeX Live's xindy 2.5 (Common Lisp) on ECL, with tex2xindy, in one program.
 *
 * TeX Live runs xindy on CLISP from a memory image (xindy.mem). Here ECL loads the same Lisp
 * sources (native/xindy/patch_xindy.py makes the few CLISP-only spots portable) once, at
 * xindy_boot(); the worker keeps the memory as it is then and puts it back before each run, which
 * is what the memory image does for CLISP.
 *
 *   xindy -x EXPR                  evaluate EXPR (xindy.pl's call of xindy.run -x)
 *   tex2xindy [-o] [attr_file]     TeX Live's filter, raw index on standard input (tools.js
 *                                  gives it files as standard input and output)
 *
 * CLISP's REGEXP module, which xindy's sort and merge rules use, is POSIX regcomp/regexec here
 * (REGEXP::%REGCOMP, REGEXP::%REGEXEC; compat.lsp builds the Lisp side on them).
 */
#include <ecl/ecl.h>
#include <regex.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int tex2xindy_main(int argc, char **argv);

/* a Lisp string as bytes: xindy reads its files as ISO-8859-1, so every character is one byte */
static char *lisp_bytes(cl_object s, cl_index *len)
{
  cl_index n = ecl_length(s), i;
  char *b = malloc(n + 1);
  for (i = 0; i < n; i++) {
    ecl_character c = ecl_char(s, i);
    b[i] = c < 256 ? (char)c : '?';
  }
  b[n] = 0;
  if (len) *len = n;
  return b;
}

#define MAX_RE 8192
static regex_t *compiled[MAX_RE];
static int ncompiled;

static cl_object galley_regcomp(cl_object pattern, cl_object extended, cl_object icase)
{
  char *p = lisp_bytes(pattern, NULL), msg[256];
  regex_t *re = malloc(sizeof *re);
  int err = regcomp(re, p, (extended != ECL_NIL ? REG_EXTENDED : 0) | (icase != ECL_NIL ? REG_ICASE : 0));
  free(p);
  if (err) {
    regerror(err, re, msg, sizeof msg);
    free(re);
    FEerror("regexp-compile: ~A in ~S", 2, ecl_make_simple_base_string(msg, -1), pattern);
  }
  if (ncompiled >= MAX_RE) FEerror("regexp-compile: too many regular expressions", 0);
  compiled[ncompiled] = re;
  return ecl_make_fixnum(ncompiled++);
}

/* NIL, or a list with a (START . END) or NIL for the match and each group */
static cl_object galley_regexec(cl_object which, cl_object string, cl_object start, cl_object end)
{
  cl_fixnum k = ecl_fixnum(which), s = ecl_fixnum(start), e = ecl_fixnum(end);
  regex_t *re;
  regmatch_t *m;
  cl_index n;
  char *str;
  size_t nm, j;
  cl_object out = ECL_NIL;
  if (k < 0 || k >= ncompiled) FEerror("regexp-exec: not a compiled regexp", 0);
  re = compiled[k];
  str = lisp_bytes(string, &n);
  if (e < 0 || (cl_index)e > n) e = n;
  if (s < 0) s = 0;
  if (s > e) s = e;
  str[e] = 0;
  nm = re->re_nsub + 1;
  m = malloc(nm * sizeof *m);
  if (regexec(re, str + s, nm, m, 0) == 0)
    for (j = nm; j-- > 0;)
      out = ecl_cons(m[j].rm_so < 0 ? ECL_NIL : ecl_cons(ecl_make_fixnum(m[j].rm_so + s), ecl_make_fixnum(m[j].rm_eo + s)), out);
  free(m);
  free(str);
  return out;
}

static const char *lib(void)
{
  const char *d = getenv("XINDY_LIB");
  return d && *d ? d : "/xindy";
}

static int eval_string(const char *code)
{
  /* the Lisp side reports errors itself (compat.lsp); this only guards against the rest */
  cl_object r = si_safe_eval(3, ecl_read_from_cstring(code), ECL_NIL, ecl_make_fixnum(70));
  return ECL_FIXNUMP(r) ? (int)ecl_fixnum(r) : 0;
}

static int booted;

int xindy_boot(void)
{
  static char *argv[] = { "xindy", NULL };
  char code[1024];
  if (booted) return 0;
  booted = 1;
  cl_boot(1, argv);
  eval_string("(defpackage \"REGEXP\" (:use \"COMMON-LISP\"))");
  ecl_def_c_function(ecl_make_symbol("%REGCOMP", "REGEXP"), (cl_objectfn_fixed)galley_regcomp, 3);
  ecl_def_c_function(ecl_make_symbol("%REGEXEC", "REGEXP"), (cl_objectfn_fixed)galley_regexec, 4);
  snprintf(code, sizeof code, "(handler-case (progn (load \"%s/compat.lsp\" :verbose nil) (funcall (intern \"GALLEY-LOAD-XINDY\" \"COMMON-LISP-USER\") \"%s/\"))"
           " (error (c) (format *error-output* \"~&xindy: ~A~%%\" c) (finish-output *error-output*) 1))", lib(), lib());
  return eval_string(code);
}

static int xindy_run(int argc, char **argv)
{
  int i;
  const char *expr = NULL;
  cl_object form;
  for (i = 1; i < argc; i++) {
    if (!strcmp(argv[i], "-x") && i + 1 < argc) expr = argv[++i];
    else if ((!strcmp(argv[i], "-M") || !strcmp(argv[i], "-E") || !strcmp(argv[i], "-B")) && i + 1 < argc) i++; /* CLISP's: the image is built in */
  }
  if (xindy_boot()) { fputs("xindy: could not load the xindy kernel\n", stderr); return 1; }
  if (!expr) return 0;
  form = cl_list(2, ecl_make_symbol("GALLEY-RUN", "CL-USER"), ecl_make_simple_base_string((char *)expr, -1));
  form = si_safe_eval(3, form, ECL_NIL, ecl_make_fixnum(70));
  fflush(stdout);
  fflush(stderr);
  return ECL_FIXNUMP(form) ? (int)ecl_fixnum(form) : 1;
}

int galley_main(int argc, char **argv)
{
  const char *base = strrchr(argv[0], '/');
  base = base ? base + 1 : argv[0];
  if (!strcmp(base, "tex2xindy")) {
    int code = tex2xindy_main(argc, argv);
    fflush(stdout);
    return code;
  }
  return xindy_run(argc, argv);
}

int main(int argc, char **argv)
{
  return galley_main(argc, argv);
}
