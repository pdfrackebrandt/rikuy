"""Hard wall clock limits for the arXiv corpus run (dev/corpus_full.py, dev/pdfcompare.py).

A paper compiled with shell escape can start programs that outlive TeX: a job left in the
background, a daemon that leaves its session, a child that keeps the pipe the harness reads.
subprocess.run's timeout kills only the child it started and then waits for the pipes, which such
a grandchild holds open, so one paper could keep a shard busy until GitHub cancels the job and
nothing after it is compared. Here:

  run(cmd, limit)   the command in a session of its own, its output in a file (no pipe to wait on);
                    when it ends or its time is up, every process it started is killed
  sweep(keep)       kill every descendant of this process but those in keep, including one that
                    left its session (subreaper() makes this process their parent)
  alarm(seconds)    raises Overrun in the main thread once a document has run that long
  Watchdog          calls a function once a document has run past its limit (corpus_full.py
                    kills Chromium with it, which ends the Playwright call that waits)
  Budget            the shard's deadline: whether one more document fits before it
"""
import contextlib, ctypes, os, signal, subprocess, tempfile, threading, time

PR_SET_CHILD_SUBREAPER = 36


class Overrun(Exception):
    pass


def subreaper():
    """Orphans of this process's descendants come back to it instead of to the namespace's first
    process, so sweep() finds a daemon that left its session. Linux only; False elsewhere."""
    try:
        return ctypes.CDLL(None, use_errno=True).prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) == 0
    except (OSError, AttributeError):
        return False


def _procs():
    """{pid: (ppid, state)} from /proc."""
    out = {}
    for p in os.listdir('/proc'):
        if not p.isdigit():
            continue
        try:
            with open('/proc/%s/stat' % p, 'rb') as f:
                s = f.read()
        except OSError:
            continue
        # pid (comm) state ppid ...: the name may hold spaces and parentheses, so read after the last ')'
        rest = s[s.rindex(b')') + 2:].split()
        out[int(p)] = (int(rest[1]), rest[0].decode())
    return out


def descendants(root=None, depth=1):
    """The live processes under root (this process by default) at that depth or deeper (1: its
    children, 2: their children)."""
    root = os.getpid() if root is None else root
    procs = _procs()
    kids = {}
    for pid, (ppid, _) in procs.items():
        kids.setdefault(ppid, []).append(pid)
    out, level, d = [], [root], 0
    while level:
        d += 1
        level = [c for p in level for c in kids.get(p, [])]
        if d >= depth:
            out += [c for c in level if procs[c][1] != 'Z']
    return out


def sweep(keep=(), depth=1, root=None):
    """Kill the descendants (from that depth) but those in keep, until none is left; reap those that
    are this process's own. Returns how many were killed."""
    keep, killed = set(keep), set()
    for _ in range(200):
        pids = [p for p in descendants(root, depth) if p not in keep]
        if not pids:
            break
        for p in pids:
            try:
                os.kill(p, signal.SIGKILL)
                killed.add(p)
            except OSError:
                pass
        time.sleep(0.02)
    for p in killed:
        try:
            os.waitpid(p, os.WNOHANG)
        except OSError:  # not ours: its own parent, or the namespace's first process, reaps it
            pass
    return len(killed)


def run(cmd, limit, keep=(), stderr=True, tail=None, **kw):
    """Run cmd for at most limit seconds; returns (exit code or None when killed, output bytes, its
    last tail bytes when tail is given: a paper's TeX can print gigabytes). stderr goes into the
    output with stdout unless stderr is False. Whatever the command left running is killed when
    it returns, but the processes in keep (pdfcompare.py's Xvfb)."""
    with tempfile.TemporaryFile() as out:
        p = subprocess.Popen(cmd, stdout=out, stderr=subprocess.STDOUT if stderr else subprocess.DEVNULL,
                             stdin=subprocess.DEVNULL, start_new_session=True, **kw)
        try:
            code = p.wait(timeout=limit)
        except subprocess.TimeoutExpired:
            code = None
        finally:
            if p.poll() is None:
                try:
                    os.killpg(p.pid, signal.SIGKILL)
                except OSError:
                    pass
                p.wait()
            sweep(keep)
        size = out.seek(0, os.SEEK_END)
        out.seek(max(0, size - tail) if tail else 0)
        return code, out.read()


@contextlib.contextmanager
def alarm(seconds):
    """Raise Overrun in the main thread once the block has run that long."""
    def on(sig, frame):
        raise Overrun()
    old = signal.signal(signal.SIGALRM, on)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, old)


class Watchdog:
    """Calls fire() from a thread of its own once an armed limit has passed, then waits to be armed
    again: for a main thread blocked where no signal reaches it (a Playwright call). arm() and
    disarm() wait for a fire() under way, so a browser started after them is not killed by it."""

    def __init__(self, fire):
        self.fire, self.until, self.fired = fire, None, False
        self.lock = threading.Lock()
        self.firing = threading.Lock()  # held while fire() runs
        threading.Thread(target=self._loop, daemon=True).start()

    def arm(self, seconds):
        with self.firing, self.lock:
            self.until, self.fired = time.time() + seconds, False

    def disarm(self):
        with self.firing, self.lock:
            self.until = None

    def _loop(self):
        while True:
            time.sleep(0.2)
            with self.firing:
                with self.lock:
                    due = self.until is not None and time.time() > self.until
                    if due:
                        self.until, self.fired = None, True
                if due:
                    try:
                        self.fire()
                    except Exception as e:  # a watchdog that dies would let the next hang run on
                        print('watchdog:', e, flush=True)


class Budget:
    """The shard's deadline, DEADLINE in the environment (seconds since the epoch; empty: none)."""

    def __init__(self, deadline=None):
        self.deadline = float(deadline) if deadline else None

    def fits(self, need):
        return self.deadline is None or time.time() + need <= self.deadline
