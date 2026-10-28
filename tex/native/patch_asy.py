#!/usr/bin/env python3
"""Asymptote for the browser (build_tools.sh asy): GLM without OpenGL (first), the two places
where asy starts programs, and XDR without libtirpc (at the end).

System() (util.cc) runs a program and waits: latex/pdflatex for the final picture, gs, dvips.
It becomes a call to the worker's shell (Module.galleySystem), which runs them the way TeX's
\\write18 does (tools.js): TeX on a second instance of the engine, Ghostscript, dvips.

iopipestream (pipestream.h/.cc) talks to a running program: asy keeps a LaTeX open to measure
each label, and reads Ghostscript's answers for texpath(). A browser worker cannot keep a
second program waiting for input, so the program runs again on everything written to it so far
each time output is wanted (Module.galleyPipe), and only the output not read yet is handed on.
TeX and Ghostscript give the same output for the same input, so the reader sees what a live
pipe would have shown.

Usage: patch_asy.py ASYMPTOTE_SOURCE_DIR [--native]
"""
import sys, os

d = sys.argv[1]


def edit(name, old, new, count=1):
    p = os.path.join(d, name)
    s = open(p, encoding='utf-8').read()
    if new in s:
        return
    assert s.count(old) >= 1, (name, old[:60])
    s = s.replace(old, new, count)
    open(p, 'w', encoding='utf-8').write(s)


# ---- GLM without OpenGL ---------------------------------------------------------------------------
# These two apply to any asy built with GLM but without OpenGL, Galley's and the native one PLAN
# task 9 compares it with (build_asy_native.sh runs this with --native, which stops after them).
def gl_features():
    # asy takes GLM for OpenGL: with GLM, 3D pictures default to being rendered (render=-1), which
    # needs OpenGL, and fail. Without OpenGL they stay vector drawings (render=0), as without GLM.
    edit('settings.cc', '''#ifdef HAVE_LIBGLM
const bool havegl=true;''', '''#if defined(HAVE_LIBGLM) && (defined(HAVE_GL) || defined(HAVE_LIBOSMESA))
const bool havegl=true;''')
    # shipout3 writes WebGL (html) and V3D through the same code, which needs only GLM, but asy
    # refuses V3D unless built with OpenGL: its check exempts html alone. A desktop asy has
    # OpenGL and writes V3D, so this one does too.
    edit('picture.cc', '''#ifndef HAVE_LIBOSMESA
#ifndef HAVE_GL
  if(!webgl)
    camp::reportError("to support onscreen OpenGL rendering; please install the glut library, then ./configure; make");''', '''#ifndef HAVE_LIBOSMESA
#ifndef HAVE_GL
  if(!webgl && !v3d)
    camp::reportError("to support onscreen OpenGL rendering; please install the glut library, then ./configure; make");''')


# ---- OpenGL through OSMesa, without GLUT ----------------------------------------------------------
# For any asy rendering 3D through OSMesa with no window toolkit: Galley's, and the native one its
# 3D pictures are compared with (build_asy_native.sh MESA=1, which runs this with --native too).
def osmesa_without_glut():
    # two of glrender.cc's GLUT calls are not under HAVE_LIBGLUT, as the rest are; a build without
    # GLUT does not compile without these guards
    edit('glrender.cc', '''  spinTimer.reset();
  glutIdleFunc(f);''', '''  spinTimer.reset();
#ifdef HAVE_LIBGLUT
  glutIdleFunc(f);
#endif''')
    edit('glrender.cc', '''void destroywindow()
{
  glutDestroyWindow(glutGetWindow());''', '''void destroywindow()
{
#ifdef HAVE_LIBGLUT
  glutDestroyWindow(glutGetWindow());
#endif''')
    # softpipe, the renderer behind OSMesa here, speaks GLSL 3.30, which has no implicit int to
    # uint conversion: blend.glsl compares its uint n with 1 and 0, which does not compile there
    # (it does in GLSL 4)
    edit('base/shaders/blend.glsl', '''    if(n == 1)
      outColor=blend(outColor,fragment[listIndex+k]);''', '''    if(n == 1u)
      outColor=blend(outColor,fragment[listIndex+k]);''')
    edit('base/shaders/blend.glsl', '    else if(n > 0) {', '    else if(n > 0u) {')


gl_features()
osmesa_without_glut()
if '--native' in sys.argv:
    print('patched', d, '(GLM, and OpenGL through OSMesa, only)')
    sys.exit(0)


# ---- System() -------------------------------------------------------------------------------
edit('util.cc', '// quiet: 0=none; 1=suppress stdout; 2=suppress stdout+stderr.\nint System(', '''#ifdef __EMSCRIPTEN__
#include <emscripten.h>
// Galley: the worker's shell runs the program (argv as NUL-separated strings)
EM_JS(int, galley_system_js, (const char *argv, int len, int quiet), {
  var a = new TextDecoder().decode(HEAPU8.subarray(argv, argv + len)).split(String.fromCharCode(0));
  a.pop();
  return Module.galleySystem ? Module.galleySystem(a, quiet) : 127;
});
#endif

// quiet: 0=none; 1=suppress stdout; 2=suppress stdout+stderr.
int System(''')
edit('util.cc', '''#if _WIN32
    return SystemWin32(command, quiet, wait, hint, application, ppid);
#else''', '''#if _WIN32
    return SystemWin32(command, quiet, wait, hint, application, ppid);
#elif defined(__EMSCRIPTEN__)
  cout.flush();
  string a;
  for(size_t i=0; i < command.size(); ++i) {a += command[i]; a.push_back('\\0');}
  if(ppid) *ppid=0;
  return galley_system_js(a.data(),(int) a.size(),quiet);
#else''')

# ---- iopipestream ---------------------------------------------------------------------------
edit('pipestream.h', '''#else

#include <sys/wait.h>
#include <unistd.h>
#include "common.h"

// bidirectional stream for reading and writing to pipes
class iopipestream {''', '''#elif defined(__EMSCRIPTEN__)

#include <sys/wait.h>
#include <unistd.h>
#include "common.h"

// Galley: the program runs again on all that was written each time output is wanted
class iopipestream {
protected:
  static const int BUFSIZE=SHRT_MAX;
  char buffer[BUFSIZE];
  string sbuffer;
  mem::vector<string> cmd;
  string transcript;
  string output;
  size_t delivered;
  size_t ranAt;
  bool ran;
  bool Running;
  bool pipeopen;
  bool pipein;
  void refresh();
public:
  void open(const mem::vector<string> &command, const char *hint=NULL,
            const char *application="", int out_fileno=STDOUT_FILENO);
  bool isopen() {return pipeopen;}
  iopipestream(): delivered(0), ranAt(0), ran(false), Running(false),
                  pipeopen(false), pipein(false) {}
  iopipestream(const mem::vector<string> &command, const char *hint=NULL,
               const char *application="", int out_fileno=STDOUT_FILENO) :
    delivered(0), ranAt(0), ran(false), Running(false), pipeopen(false),
    pipein(false) {
    open(command,hint,application,out_fileno);
  }
  void eof() {pipein=false;}
  virtual void pipeclose() {pipeopen=false; Running=false;}
  virtual ~iopipestream() {pipeclose();}
  void block(bool write=false, bool read=true) {}
  ssize_t readbuffer();
  string readline();
  bool running() {return Running;}
  typedef iopipestream& (*imanip)(iopipestream&);
  iopipestream& operator << (imanip func) {return (*func)(*this);}
  iopipestream& operator >> (string& s) {readbuffer(); s=buffer; return *this;}
  bool tailequals(const char *buf, size_t len, const char *prompt, size_t plen);
  string getbuffer() {return sbuffer;}
  void wait(const char *prompt);
  int wait() {return 0;}
  void Write(const string &s) {transcript += s;}
  iopipestream& operator << (const string& s) {Write(s); return *this;}
  template<class T>
  iopipestream& operator << (T x) {
    ostringstream os;
    os << x;
    Write(os.str());
    return *this;
  }
};

#else

#include <sys/wait.h>
#include <unistd.h>
#include "common.h"

// bidirectional stream for reading and writing to pipes
class iopipestream {''')

edit('pipestream.cc', '''#if !defined(_WIN32)

#include <iostream>''', '''#if defined(__EMSCRIPTEN__)

#include <iostream>
#include <cstring>
#include <emscripten.h>
#include "pipestream.h"
#include "camperror.h"

// argv as NUL-separated strings, and what was written; the output stays in the worker until
// asked for
EM_JS(int, galley_pipe_js, (const char *argv, int alen, const char *input, int ilen), {
  var dec = new TextDecoder();
  var a = dec.decode(HEAPU8.subarray(argv, argv + alen)).split(String.fromCharCode(0));
  a.pop();
  var out = Module.galleyPipe ? Module.galleyPipe(a, dec.decode(HEAPU8.subarray(input, input + ilen))) : '';
  Module.galleyPipeOut = new TextEncoder().encode(out);
  return Module.galleyPipeOut.length;
});
EM_JS(void, galley_pipe_take, (char *dst), {
  HEAPU8.set(Module.galleyPipeOut, dst);
  Module.galleyPipeOut = null;
});

void iopipestream::open(const mem::vector<string> &command, const char *,
                        const char *, int)
{
  cmd=command;
  transcript.clear();
  lastKept.clear();
  keptAt=0;
  resync=false;
  output.clear();
  delivered=0;
  ran=false;
  *buffer=0;
  Running=true;
  pipeopen=true;
  pipein=true;
}

void iopipestream::refresh()
{
  if(ran && ranAt == transcript.size()) return;
  string a;
  for(size_t i=0; i < cmd.size(); ++i) {a += cmd[i]; a.push_back('\\0');}
  int n=galley_pipe_js(a.data(),(int) a.size(),transcript.data(),
                       (int) transcript.size());
  output.assign(n,'\\0');
  if(n > 0) galley_pipe_take(&output[0]);
  ranAt=transcript.size();
  ran=true;
}

ssize_t iopipestream::readbuffer()
{
  if(!pipeopen) {*buffer=0; return 0;}
  if(delivered >= output.size()) refresh();
  size_t n=output.size() > delivered ? output.size()-delivered : 0;
  if(n > (size_t) BUFSIZE-1) n=BUFSIZE-1;
  // lines one at a time when lines are asked for: a live pipe holds only what the program has
  // printed so far (Ghostscript stops after each page for texpath), here it all is there at once
  if(lineMode) {
    size_t e=output.find('\\n',delivered);
    if(e != string::npos && e+1-delivered < n) n=e+1-delivered;
  }
  memcpy(buffer,output.data()+delivered,n);
  buffer[n]=0;
  delivered += n;
  if(n == 0) Running=false;
  return n;
}

bool iopipestream::tailequals(const char *buf, size_t len, const char *prompt,
                              size_t plen)
{
  const char *a=buf+len;
  const char *b=prompt+plen;
  while(b >= prompt) {
    if(a < buf) return false;
    if(*a != *b) return false;
    if(a > buf && *a == '\\n' && *(a-1) == '\\r') --a;
    --a; --b;
  }
  return true;
}

string iopipestream::readline()
{
  sbuffer.clear();
  int nc;
  lineMode=true;
  do {
    nc=readbuffer();
    sbuffer.append(buffer);
  } while(nc > 0 && buffer[nc-1] != '\\n' && Running);
  lineMode=false;
  return sbuffer;
}

void iopipestream::wait(const char *prompt)
{
  sbuffer.clear();
  size_t plen=strlen(prompt);
  do {
    readbuffer();
    if(*buffer == 0) camp::reportError(sbuffer);
    sbuffer.append(buffer);
    if(tailequals(sbuffer.c_str(),sbuffer.size(),prompt,plen)) break;
  } while(true);
}

#elif !defined(_WIN32)

#include <iostream>''')
# ---- labels measured together -----------------------------------------------------------------
# asy asks TeX for each label's width, height and depth in turn, waiting for each answer. With the
# pipe run again for every answer that would be slow, so here (in the browser build only):
#  - font changes are kept in what was written, with no exchange (setpen, keepState);
#  - a label's sizes come from one run of TeX on what was written plus the question, which is not
#    kept (it changes nothing TeX needs later): iopipestream::query, native/asy/query.cc. The
#    worker remembers the answer for each input, so a label asked again costs nothing;
#  - a picture's new labels are asked together, in one run (picture::bounds, native/asy/measure.cc).
HERE = os.path.dirname(os.path.abspath(__file__))
snippet = lambda n: open(os.path.join(HERE, 'asy', n), encoding='utf-8').read().rstrip('\n')
edit('pipestream.h', '  void Write(const string &s) {transcript += s;}', '''  void Write(const string &s) {transcript += s;}
  string query(const string& q, const string& keep="");
  void keepState(const string& s);
  bool resync=false;
  string lastKept;
  size_t keptAt=0;
  bool lineMode=false;''')
edit('pipestream.cc', '''ssize_t iopipestream::readbuffer()
{
  if(!pipeopen) {*buffer=0; return 0;}
  if(delivered >= output.size()) refresh();''', snippet('query.cc'))
edit('drawlabel.h', '''  bool havebounds;
  bool suppress;''', '''  bool havebounds;
  bool measured=false; // Galley: sizes read in a batch (measureMany)
  bool suppress;''')
edit('drawlabel.h', '''  void getbounds(iopipestream& tex, const string& texengine);
''', '''  void getbounds(iopipestream& tex, const string& texengine);
  static void measureMany(mem::vector<drawLabel*>& labels, iopipestream& tex,
                          const string& texengine);
''')
edit('drawlabel.cc', '''void drawLabel::getbounds(iopipestream& tex, const string& texengine)
{
  if(havebounds) return;
  havebounds=true;

  setpen(tex,texengine,pentype);
  texbounds(width,height,depth,tex,label);''', snippet('measure.cc'))
edit('drawlabel.cc', '// Reads one of the dimensions from the pipe.', snippet('helpers.cc') + '\n\n// Reads one of the dimensions from the pipe.')
# the font commands kept, no exchange; one label asked on its own
edit('drawlabel.cc', '''void setpen(iopipestream& tex, const string& texengine, const pen& pentype)
{''', '''void setpen(iopipestream& tex, const string& texengine, const pen& pentype)
{
#ifdef __EMSCRIPTEN__
  tex.keepState(galleyFont(texengine,pentype));
  return;
#endif''')
edit('drawlabel.cc', '''void texbounds(double& width, double& height, double& depth,
               iopipestream& tex, string& s)
{''', '''void texbounds(double& width, double& height, double& depth,
               iopipestream& tex, string& s)
{
#ifdef __EMSCRIPTEN__
  size_t from=0;
  string out=tex.query(galleyQuestion(s));
  if(!galleyDims(out,from,width,height,depth))
    camp::reportError("Cannot read label "+s+"\\n"+out);
  return;
#endif''')
edit('picture.cc', '''  nodelist::iterator p=nodes.begin();
  processDataStruct& pd=processData();

  for(size_t i=0; i < lastnumber; ++i) ++p;''', '''  nodelist::iterator p=nodes.begin();
  processDataStruct& pd=processData();

#ifdef __EMSCRIPTEN__
  if(pd.tex.isopen() && getSetting<string>("tex") != "none") {
    mem::vector<drawLabel*> labels;
    nodelist::iterator q=nodes.begin();
    for(size_t i=0; i < lastnumber; ++i) ++q;
    for(; q != nodes.end(); ++q)
      if((*q)->islabel()) {
        drawLabel *l=dynamic_cast<drawLabel*>(*q);
        if(l) labels.push_back(l);
      }
    drawLabel::measureMany(labels,pd.tex,getSetting<string>("tex"));
  }
#endif

  for(size_t i=0; i < lastnumber; ++i) ++p;''')
# ---- a layer that could not be converted --------------------------------------------------------
# shipout makes each layer's PostScript into a PDF (epstopdf) before it moves on to the next
# layer. When that fails it never moves on and loops forever: here the rehearsal (see engine.js,
# asyRun) makes every program asy starts fail, so a picture with layer() under pdflatex
# (functionshading, layers, spectrum) hung the page. It stops now, as a failed shipout.
edit('picture.cc', '''            tex->endlayer();
            layerp=++p;
            layer++;
            break;
          }
        }
      }
    }
  }
''', '''            tex->endlayer();
            layerp=++p;
            layer++;
            break;
          }
        }
      }
    }
    if(!status) break;
  }
''')
# ---- rendering in asy's own process --------------------------------------------------------------
# To draw a 3D picture as a bitmap asy forks: the child renders with OSMesa, writes the image and
# exits (glrender.cc's quit), the parent waits and goes on. WebAssembly has no fork, so the
# picture is rendered here, quit() returns, and then asy's memory below the heap's top is put back
# as it was before: what a child changes is gone when it exits, so each picture starts from the
# parent's state, as natively. Without that a second picture inherited the first one's GL objects
# and asy's flags for them (glrender keeps one OSMesa context, its shaders and its vertex
# buffers): with a transparent surface the materials were never copied again, and a run's third
# picture came out in the first and second pictures' colours. The image is in the file system,
# which is the worker's, outside that memory. Memory the render grew is free again afterwards.
edit('picture.cc', '''#include "seconds.h"
''', '''#include "seconds.h"
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <unistd.h>
// Galley: a fork for rendering, by copying memory (see shipout3)
EM_JS(void, galley_fork_save, (size_t top), {
  Module.galleyForkTop = top;
  Module.galleyForkMem = HEAPU8.slice(0, top);
});
EM_JS(void, galley_fork_restore, (), {
  HEAPU8.set(Module.galleyForkMem, 0);
  Module.galleyForkMem = null;
});
#endif
''')
edit('picture.cc', '''#if !defined(_WIN32)
      int pid=fork();''', '''#if defined(__EMSCRIPTEN__)
      // Galley: no fork; rendered below, with the memory put back afterwards
#elif !defined(_WIN32)
      int pid=fork();''')
edit('picture.cc', '''  glrender(args,oldpid);
''', '''#ifdef __EMSCRIPTEN__
  if(!format3d) {
    galley_fork_save((size_t) sbrk(0));
    try {
      glrender(args,oldpid);
    } catch(...) {
      // a child's error ends the child, and its parent goes on
    }
    galley_fork_restore();
    return true;
  }
#endif
  glrender(args,oldpid);
''')
edit('glrender.cc', '''void quit()
{
#ifdef HAVE_LIBOSMESA''', '''void quit()
{
#if defined(HAVE_LIBOSMESA) && defined(__EMSCRIPTEN__)
  return;
#endif
#ifdef HAVE_LIBOSMESA''')
# ---- XDR ----------------------------------------------------------------------------------------
# XDR (V3D output, xinput/xoutput files) comes from native/rpc instead of libtirpc
# (build_tools.sh defines HAVE_LIBTIRPC). long is 32 bits in WebAssembly and has no overload of
# its own in xstream (on Linux it is int64_t); size_t, an unsigned long, goes through the 64 bit
# integer it is on a desktop, so the files are the same.
edit('xstream.h', '''  IXSTREAM(uint64_t,u_int64_t);
''', '''  IXSTREAM(uint64_t,u_int64_t);
#ifdef __EMSCRIPTEN__
  ixstream& operator >> (long& x) {int64_t y=0; *this >> y; x=(long) y; return *this;}
  ixstream& operator >> (unsigned long& x) {uint64_t y=0; *this >> y; x=(unsigned long) y; return *this;}
#endif
''')
edit('xstream.h', '''  OXSTREAM(uint64_t,u_int64_t);
''', '''  OXSTREAM(uint64_t,u_int64_t);
#ifdef __EMSCRIPTEN__
  oxstream& operator << (long x) {return *this << (int64_t) x;}
  oxstream& operator << (unsigned long x) {return *this << (uint64_t) x;}
#endif
''')

print('patched', d)
