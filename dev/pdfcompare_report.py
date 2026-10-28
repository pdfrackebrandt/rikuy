"""Summarise a pdfcompare.py run: match rate, and every mismatch with what differs.
Usage: pdfcompare_report.py CMP.jsonl [classes.json]
classes.json (optional) maps a document to its class and a note, as decided by looking at the
two PDFs; the report then counts the classes. Without it, the documents are only grouped by what
differs: pages, text, pixels.
"""
import json, sys
from collections import Counter

rows = [json.loads(l) for l in open(sys.argv[1])]
classes = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else {}
# compared: both compiled and both PDFs were there to compare
both = [r for r in rows if r.get('galley_ok') and r.get('desktop_ok') and 'pages' in r]
match = [r for r in both if r.get('match')]
print('documents %d; both compiled %d; match %d (%.1f %%)' % (len(rows), len(both), len(match), 100 * len(match) / max(1, len(both))))
print('desktop failed where Rikuy compiled: %d; Rikuy failed (desktop not run): %d; not compared: %d' % (
    sum(1 for r in rows if r.get('galley_ok') and not r.get('desktop_ok')),
    sum(1 for r in rows if not r.get('galley_ok')),
    sum(1 for r in rows if r.get('galley_ok') and r.get('desktop_ok') and 'pages' not in r)))
kind = Counter()
for r in both:
    if r.get('match'):
        continue
    k = []
    if r['pages'][0] != r['pages'][1]:
        k.append('pages')
    if not r.get('text_equal'):
        k.append('text')
    if r.get('pixel_pages_over'):
        k.append('pixels')
    kind['+'.join(k) or 'other'] += 1
print('mismatches by what differs:', dict(kind))
if classes:
    c = Counter(v['class'] for d, v in classes.items() if any(r['doc'] == d and not r.get('match') for r in both))
    print('mismatches by cause:', dict(c))
print()
for r in both:
    if r.get('match'):
        continue
    d = r['doc']
    cl = classes.get(d, {})
    td = r.get('first_text_diff') or {}
    print('%-70s pages %s px %s  %s' % (d[:70], r['pages'], r.get('pixel_worst'), cl.get('class', '')))
    if td:
        print('    text p%s  galley: %s' % (td.get('page'), td.get('galley', '')[:110]))
        print('            desktop: %s' % td.get('desktop', '')[:110])
    if cl.get('note'):
        print('    ' + cl['note'])
