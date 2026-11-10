#!/usr/bin/env python3
"""Check a built dist/ against Cloudflare Pages' limits before deploying it (.github/workflows/
deploy.yml), and say what it holds: at most 20,000 files, none over 25 MiB, and a _headers file of
at most 100 rules with no line over 2,000 characters. Pages refuses a deployment past the first
two and ignores a _headers file past the last; finding out here is cheaper than a failed upload.
The hosted build needs index.html, sw.js and _headers (build.mjs without RIKUY_SHARE).

Usage: python3 dev/pages_check.py DIST   (exit 1 when a limit is broken)"""
import os, sys

MAX_FILES = 20000
MAX_BYTES = 25 * 1024 * 1024
MAX_RULES = 100
MAX_LINE = 2000


def check(dist):
    problems, files, total, big = [], 0, 0, []
    for dp, dns, fns in os.walk(dist):
        for f in fns:
            p = os.path.join(dp, f)
            n = os.path.getsize(p)
            files += 1
            total += n
            if n > MAX_BYTES:
                big.append((os.path.relpath(p, dist), n))
    if files > MAX_FILES:
        problems.append('%d files, more than the %d Pages takes' % (files, MAX_FILES))
    for rel, n in big:
        problems.append('%s is %.1f MiB, more than the 25 MiB Pages takes per file' % (rel, n / 1048576))
    for need in ('index.html', 'sw.js', '_headers'):
        if not os.path.isfile(os.path.join(dist, need)):
            problems.append('no %s: not the hosted build (build.mjs without RIKUY_SHARE)' % need)
    h = os.path.join(dist, '_headers')
    if os.path.isfile(h):
        lines = open(h, encoding='utf8').read().splitlines()
        rules = [l for l in lines if l.strip() and not l.lstrip().startswith('#') and not l[0].isspace()]
        if len(rules) > MAX_RULES:
            problems.append('_headers has %d rules; Pages reads at most %d' % (len(rules), MAX_RULES))
        for i, l in enumerate(lines, 1):
            if len(l) > MAX_LINE:
                problems.append('_headers line %d has %d characters; Pages reads at most %d' % (i, len(l), MAX_LINE))
    return problems, files, total


if __name__ == '__main__':
    if len(sys.argv) != 2 or not os.path.isdir(sys.argv[1]):
        print(__doc__.strip().splitlines()[-1]); sys.exit(2)
    problems, files, total = check(sys.argv[1])
    print('%s: %d files, %.1f MB in all' % (sys.argv[1], files, total / 1e6))
    for p in problems: print('  ' + p)
    print('fits Cloudflare Pages' if not problems else 'does not fit Cloudflare Pages')
    sys.exit(1 if problems else 0)
