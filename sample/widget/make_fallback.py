"""Draws figures/clt.png, the picture TeX prints for widgets/clt.html: the widget's histogram at
n = 4, from the same generator (mulberry32, seed 2026) and the same draws, bins and axes.
Run: python3 make_fallback.py (numpy and matplotlib)."""
import math, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

REPS, LO, HI, BINS, YMAX, N = 4000, -4.0, 4.0, 32, 0.9, 4
M = 0xFFFFFFFF


def mulberry32(a):
    # JavaScript's 32-bit arithmetic, bit for bit, as the widget runs it
    a &= M
    def r():
        nonlocal a
        a = (a + 0x6D2B79F5) & M
        t = ((a ^ (a >> 15)) * (1 | a)) & M
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & M)) & M) ^ t
        return ((t ^ (t >> 14)) & M) / 4294967296
    return r


def histogram(n):
    r, bw, cnt = mulberry32(2026), (HI - LO) / BINS, [0] * BINS
    for _ in range(REPS):
        s = 0.0
        for _ in range(n):
            s -= math.log(1 - r())
        b = math.floor((math.sqrt(n) * (s / n - 1) - LO) / bw)
        if 0 <= b < BINS:
            cnt[b] += 1
    return [c / (REPS * bw) for c in cnt]


if __name__ == '__main__':
    d = histogram(N)
    bw = (HI - LO) / BINS
    plt.rcParams.update({'font.family': 'serif', 'mathtext.fontset': 'cm', 'font.size': 9})
    fig, ax = plt.subplots(figsize=(6.3, 2.75), dpi=200)
    ax.bar([LO + (b + 0.5) * bw for b in range(BINS)], [min(v, YMAX) for v in d], width=bw * 0.96,
           color='#A9C1DA', edgecolor='#5E83AA', linewidth=0.5)
    xs = [LO + k * (HI - LO) / 160 for k in range(161)]
    ax.plot(xs, [math.exp(-x * x / 2) / math.sqrt(2 * math.pi) for x in xs], color='#B03A2E', linewidth=1.3)
    ax.text(1.35, 0.3, r'$N(0,1)$', color='#B03A2E', va='bottom')
    ax.text(-3.85, 0.82, r'$n = %d$' % N, va='top')
    ax.set_xlim(LO, HI)
    ax.set_ylim(0, YMAX)
    ax.set_yticks([0, 0.2, 0.4, 0.6, 0.8])
    ax.set_xlabel(r'$Z_n = \sqrt{n}\,(\bar X_n - 1)$')
    for side in ('top', 'right'):
        ax.spines[side].set_visible(False)
    fig.tight_layout(pad=0.3)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'figures', 'clt.png')
    fig.savefig(out, metadata={'Software': None})
    print(out, os.path.getsize(out), 'bytes;', 'bins', ' '.join('%.3f' % v for v in d))
