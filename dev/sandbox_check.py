"""Check, from inside dev/sandbox.sh, that the sandbox holds before strangers' documents run in it.

  sandbox.sh USER -w DIR... PATH=/usr/bin:/bin python3 -I sandbox_check.py DIR...

Fails (exit 1, one line per fault) when the command runs as root, keeps a capability, can gain
privileges (no_new_privs off, or sudo works), sees a process it did not start (the runner's
Runner.Worker among them), sees anything under /home, /root or /run, starts in a folder other
than / or holds a descriptor beyond 0 to 2 (either reaches past the mounts), reaches a network
beyond its loopback, or can write anywhere outside the DIRs and the fresh /tmp, /var/tmp,
/dev/shm and /dev/mqueue; and when a DIR is not writable. Prints what it saw either way.
"""
import os, socket, stat, subprocess, sys

ALLOWED = [os.path.realpath(d) for d in sys.argv[1:]]
FRESH = ['/tmp', '/var/tmp', '/dev/shm', '/dev/mqueue']  # the sandbox's own, empty at its start
faults = []


def status(field):
    for line in open('/proc/self/status'):
        if line.startswith(field + ':'):
            return line.split()[1]


def under(p, roots):
    return any(p == r or p.startswith(r.rstrip('/') + '/') for r in roots)


print('uid', os.getuid(), 'gid', os.getgid(), 'groups', os.getgroups())
if os.getuid() == 0 or os.geteuid() == 0:
    faults.append('runs as root')
if int(status('CapEff'), 16) or int(status('CapPrm'), 16) or int(status('CapBnd'), 16):
    faults.append('capabilities: eff %s prm %s bnd %s' % (status('CapEff'), status('CapPrm'), status('CapBnd')))
if status('NoNewPrivs') != '1':
    faults.append('no_new_privs is off')
for sudo in ('/usr/bin/sudo', '/bin/sudo'):
    if os.path.exists(sudo):
        r = subprocess.run([sudo, '-n', 'true'], capture_output=True)
        if r.returncode == 0:
            faults.append('sudo works')
        break

# processes: only this check (setpriv and env exec into it) and the shell that started it
mine = {os.getpid(), os.getppid()}
others = []
for pid in os.listdir('/proc'):
    if pid.isdigit() and int(pid) not in mine:
        try:
            cmd = open('/proc/%s/cmdline' % pid, 'rb').read().replace(b'\0', b' ').decode('utf8', 'replace').strip()
        except OSError:
            cmd = '?'
        others.append((int(pid), cmd))
print('other processes seen:', others)
for pid, cmd in others:
    faults.append('sees process %d: %s' % (pid, cmd[:120]))

# a working folder or an open descriptor from outside reaches past the mounts
if os.getcwd() != '/':
    faults.append('started in %s, not /' % os.getcwd())
fds = {}
for f in os.listdir('/proc/self/fd'):
    try:
        fds[int(f)] = os.readlink('/proc/self/fd/' + f)
    except FileNotFoundError:
        pass  # the listing's own, closed by now
print('open descriptors:', fds)
for fd in sorted(fds):
    if fd > 2:
        faults.append('inherited descriptor %d: %s' % (fd, fds[fd]))
for d in ('/home', '/root', '/run'):
    try:
        if os.listdir(d):
            faults.append('%s is not empty: %s' % (d, os.listdir(d)[:5]))
    except PermissionError:
        pass

# /proc/net is this namespace's (/sys/class/net would show the host's)
links = sorted(l.split(':')[0].strip() for l in open('/proc/net/dev').readlines()[2:])
print('network interfaces:', links)
if links != ['lo']:
    faults.append('network interfaces other than lo: %s' % links)
for addr in (('1.1.1.1', 443), ('140.82.112.3', 443)):  # Cloudflare's resolver, github.com
    s = socket.socket()
    s.settimeout(3)
    try:
        s.connect(addr)
        faults.append('reaches %s:%d' % addr)
    except OSError:
        pass
    finally:
        s.close()

# every mount this process could write to, walked without following links
mounts = []
for line in open('/proc/self/mountinfo'):
    f = line.split()
    point, opts = f[4].replace('\\040', ' '), f[5].split(',')
    fstype = f[f.index('-') + 1]
    if 'rw' in opts and not under(point, ['/proc', '/sys']) and fstype not in ('proc', 'sysfs', 'cgroup', 'cgroup2'):
        mounts.append(point)
print('read-write mounts:', mounts)
writable, seen = [], 0
for m in mounts:
    if under(m, FRESH + ALLOWED):
        continue
    dev = os.lstat(m).st_dev
    for dp, dn, fn in os.walk(m):
        dn[:] = [d for d in dn if os.lstat(os.path.join(dp, d)).st_dev == dev and not under(os.path.join(dp, d), FRESH + ALLOWED)]
        for n in [''] + fn:
            p = os.path.join(dp, n) if n else dp
            seen += 1
            try:
                st = os.lstat(p)
            except OSError:
                continue
            # device nodes such as /dev/null are written by everyone; links are not followed
            if (stat.S_ISDIR(st.st_mode) or stat.S_ISREG(st.st_mode)) and os.access(p, os.W_OK):
                writable.append(p)
print('paths checked: %d' % seen)
for p in writable:
    faults.append('writable outside the allowed folders: %s' % p)
for d in ALLOWED + FRESH:
    if os.path.isdir(d) and not os.access(d, os.W_OK):
        faults.append('cannot write %s' % d)

print('environment:', sorted(os.environ))  # Python adds LC_CTYPE itself (PEP 538)
for f in faults:
    print('FAULT', f)
print('sandbox check:', 'FAILED' if faults else 'passed')
sys.exit(1 if faults else 0)
