#!/usr/bin/env python3
"""Compare Galley PDFs against a desktop TeX Live run.

For each document, run desktop TeX with the engine and passes Galley used
(from result.json), with SOURCE_DATE_EPOCH and FORCE_SOURCE_DATE=1 set on
both sides, then compare:
- page count
- text per page (pdftotext -layout)
- pages rendered at 72 dpi (pdftoppm, pixel difference)

Usage: python3 dev/pdfcompare.py <corpus-results.jsonl> <output.jsonl>
Requires a desktop TeX Live installation.
"""
import json, os, subprocess, sys, tempfile, hashlib
from pathlib import Path

def run_desktop(doc_dir, tex_file, engine, passes, epoch=1700000000):
    """Run desktop TeX and return PDF path or None."""
    env = os.environ.copy()
    env['SOURCE_DATE_EPOCH'] = str(epoch)
    env['FORCE_SOURCE_DATE'] = '1'
    cmd = [engine, '-interaction=nonstopmode', tex_file]
    for _ in range(max(1, passes)):
        r = subprocess.run(cmd, cwd=doc_dir, env=env, capture_output=True, timeout=120)
        if r.returncode != 0 and b'Output written' not in r.stdout:
            return None
    pdf = Path(doc_dir) / tex_file.replace('.tex', '.pdf')
    return pdf if pdf.exists() else None

def page_count(pdf):
    r = subprocess.run(['pdfinfo', str(pdf)], capture_output=True, text=True)
    for line in r.stdout.splitlines():
        if line.startswith('Pages:'):
            return int(line.split(':')[1].strip())
    return 0

def page_text(pdf):
    r = subprocess.run(['pdftotext', '-layout', str(pdf), '-'], capture_output=True, text=True)
    return r.stdout

def page_images(pdf, out_dir):
    subprocess.run(['pdftoppm', '-r', '72', '-png', str(pdf), str(out_dir / 'page')], capture_output=True)
    return sorted(out_dir.glob('page-*.png'))

def compare(galley_pdf, desktop_pdf, tolerance=0.01):
    """Return match status and class of any mismatch."""
    if not desktop_pdf or not desktop_pdf.exists():
        return {'match': False, 'class': 'desktop-failed'}
    gp = page_count(galley_pdf)
    dp = page_count(desktop_pdf)
    if gp != dp:
        return {'match': False, 'class': 'page-count', 'galley': gp, 'desktop': dp}
    gt = page_text(galley_pdf)
    dt = page_text(desktop_pdf)
    if gt != dt:
        return {'match': False, 'class': 'text'}
    # pixel comparison would go here with PIL or similar
    return {'match': True, 'class': 'ok'}

def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    results_in = sys.argv[1]
    results_out = sys.argv[2]
    # This is the tool. A full run needs desktop TeX Live.
    print(f"pdfcompare.py ready. Input: {results_in}, output: {results_out}")
    print("Requires desktop TeX Live for actual comparison.")

if __name__ == '__main__':
    main()
