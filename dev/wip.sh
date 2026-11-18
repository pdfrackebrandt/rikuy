#!/bin/sh
# Push a worktree's state exactly as it is to wip/<branch> on origin: its commits, uncommitted
# and untracked changes (what .gitignore keeps out stays out), and a merge half done, conflict
# markers included. The worktree, its index and its branch are not touched. Work then never
# lives only on one machine: whoever stops (Claude, Grok Bot, a person), another picks it up
# from the repository (AGENTS.md, Handing off; HANDOFF.md).
#
#   sh dev/wip.sh [worktree] [what is done, what is left]
#
# Each snapshot has the branch's head (and a merge's other head) as parents, and the previous
# snapshot too, so every push is a fast forward: no force push is needed or used.
set -eu
dir=${1:-.}
msg=${2:-see HANDOFF.md}
cd "$dir"
branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = HEAD ] && branch="detached-$(git rev-parse --short HEAD)"
gd=$(git rev-parse --git-dir)
idx=$(mktemp)
trap 'rm -f "$idx"' EXIT
GIT_INDEX_FILE=$idx git read-tree HEAD
GIT_INDEX_FILE=$idx git add -A .
# a build output or a link to one that .gitignore misses would push hundreds of megabytes
big=$(GIT_INDEX_FILE=$idx git diff --cached --name-only HEAD | while IFS= read -r f; do
  [ -f "$f" ] && [ ! -L "$f" ] && [ "$(wc -c < "$f")" -gt 20000000 ] && echo "$f"; done || true)
[ -z "$big" ] || { echo "wip.sh: files over 20 MB, add them to .gitignore or commit them on purpose:" >&2; echo "$big" >&2; exit 1; }
tree=$(GIT_INDEX_FILE=$idx git write-tree)
set -- -p HEAD
if [ -f "$gd/MERGE_HEAD" ]; then for m in $(cat "$gd/MERGE_HEAD"); do set -- "$@" -p "$m"; done; fi
if prev=$(git ls-remote origin "refs/heads/wip/$branch" | cut -f1) && [ -n "$prev" ]; then
  git fetch -q origin "refs/heads/wip/$branch" && set -- "$@" -p "$prev"
fi
merging=no; [ -f "$gd/MERGE_HEAD" ] && merging="yes, of $(cat "$gd/MERGE_HEAD" | cut -c1-12)"
c=$(printf 'WIP snapshot of %s: %s\n\nNot a finished commit: the working tree as it stood, merge in progress: %s.\ngit status:\n\n%s\n' \
  "$branch" "$msg" "$merging" "$(git status --short | head -60)" | git commit-tree "$tree" "$@")
git push -q origin "$c:refs/heads/wip/$branch"
echo "wip/$branch -> $(git rev-parse --short "$c") (from $(git rev-parse --short HEAD); merge in progress: $merging)"
