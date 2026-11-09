#!/bin/sh
# Run a command over documents from strangers so that it cannot reach the machine that runs it.
# The arXiv corpus workflow compiles 1,000 papers with shell escape on a desktop TeX Live, which
# runs whatever a paper asks for; on a GitHub runner the runner user has passwordless sudo and
# can read the memory of the runner's own processes, where the token for the Actions cache lives,
# so a paper could plant a cache entry that a trusted workflow later restores and runs.
#
#   sandbox.sh USER [-w DIR]... [NAME=value ...] COMMAND [ARG ...]      (as root, through sudo)
#
# The command runs as USER, an ordinary user with no sudo, in namespaces of its own:
#  - no capabilities and no_new_privs, so sudo and every other setuid program cannot raise it
#  - its own process numbers: it sees none of the runner's processes, and every process it
#    starts dies with it (the kernel kills a PID namespace's members when its first one exits)
#  - no network but its own loopback (corpus_full.py serves the page on 127.0.0.1)
#  - every file system read only but the DIRs given with -w (folders USER owns), so the folders
#    a runner image leaves world writable (/opt, /usr/share) are not; /home, /root and /run
#    hidden (the runner, its work folder, its tools); a fresh /tmp, /var/tmp and /dev/shm
#  - an environment of only the NAME=value pairs given (env -i), started in /
# sudo closes the descriptors the caller had open beyond 0, 1 and 2. dev/sandbox_check.py checks
# all of this from inside.
set -eu
[ "$(id -u)" = 0 ] || { echo "sandbox.sh: run as root" >&2; exit 1; }
[ $# -ge 2 ] || { echo "usage: sandbox.sh USER [-w DIR]... [NAME=value ...] COMMAND [ARG ...]" >&2; exit 2; }
U=$1; shift
uid=$(id -u "$U") || exit 1
[ "$uid" != 0 ] || { echo "sandbox.sh: $U is root" >&2; exit 1; }
W=
while [ "${1:-}" = -w ]; do
  # the folder itself, by its real name: not a link USER could have put on the way
  [ -d "$2" ] && [ "$(realpath "$2")" = "$2" ] || { echo "sandbox.sh: $2 is not a folder's absolute real path" >&2; exit 2; }
  case "$2" in *:*|*' '*) echo "sandbox.sh: $2 has a colon or a space" >&2; exit 2 ;; esac
  W="$W:$2"; shift 2
done
exec unshare --mount --propagation private --pid --fork --kill-child --mount-proc --net --ipc --uts -- sh -c '
  set -eu
  U=$1 W=$2; shift 2
  # Each writable folder becomes a mount of its own, then every other mount is made read only
  # (those that are not already), per mount and in this namespace only: a remount without bind
  # would change the file system for everyone. /proc and /sys belong to the kernel, /dev holds
  # the devices.
  IFS=:
  for d in $W; do [ -z "$d" ] || mount --bind "$d" "$d"; done
  unset IFS
  awk "\$6 ~ /^rw/ {print \$5}" /proc/self/mountinfo | while read -r m; do
    case "$m" in /proc|/proc/*|/sys|/sys/*|/dev|/dev/pts) continue ;; esac
    case "$W:" in *":$m:"*) continue ;; esac
    mount -o remount,bind,ro "$m"
  done
  for d in /home /root /run; do mount -t tmpfs -o ro,nosuid,nodev,noexec,size=4k,mode=755 tmpfs "$d"; done
  for d in /tmp /var/tmp /dev/shm; do mount -t tmpfs -o nosuid,nodev,mode=1777 tmpfs "$d"; done
  [ ! -d /dev/mqueue ] || mount -t mqueue -o nosuid,nodev,noexec mqueue /dev/mqueue
  # Xvfb (pdfcompare.py) needs this folder made by root
  mkdir -m 1777 /tmp/.X11-unix
  ip link set lo up
  # the folder it was started in may be under /home: a working folder keeps reaching what the
  # mount above hides
  cd /
  # not exec: this shell stays the first process of the namespace and reaps what the command
  # leaves; when it exits, with the status of the command, the kernel kills every process left
  setpriv --reuid="$U" --regid="$U" --init-groups --no-new-privs --inh-caps=-all --bounding-set=-all -- env -i "$@"
' sandbox "$U" "$W" "$@"
