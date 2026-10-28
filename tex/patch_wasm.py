#!/usr/bin/env python3
"""Let the programs in the BusyTeX binary that start other programs reach Rikuy's shell.

BusyTeX routes TeX's own \\write18 to an import, shell_escape_dispatch_js(cmd, cwd), which
Rikuy answers (tex/shell.js). xdvipdfmx does not use it: to have Ghostscript convert an EPS
figure or a PSTricks drawing it splits the command into argv and calls fork() and execvp()
(dpx_file_apply_filter in dvipdfm-x/dpxfile.c). In WebAssembly fork() always fails, and the
optimizer inlined all of it, so the conversion fails before any JavaScript sees it.

This rewrites that one spot: where the inlined code sets ret = -1 before calling fork(), it
now sets ret = shell_escape_dispatch_js(cmd, 0), the same call TeX makes (0: the current
folder). fork() still fails right after, which leaves ret as the shell returned it, and the
rest (the warning only when ret is nonzero, freeing argv) runs as written.

The binary carries no function names, so the spot is found by what is around it: the function
that loads the address of "Filtering file via command -->%s<-- failed.", the store of its
command string into that warning's argument list (which names the local holding cmd), and the
sequence  i32.const -1; local.set R; block; call FORK; local.tee P; i32.const 0; i32.lt_s.

popen() and pclose() are stubs in this binary (errno = ENOSYS, return NULL), so TeX's pipes
(\\input|"cmd", \\openout to |"cmd"), Lua's io.popen and xdvipdfmx's questions to Ghostscript
(calculate_PS in dvipdfm-x/spc_dvips.c: PSTricks label positions and rotations) all failed. The
second patch gives the two stubs new bodies that use the same hook:

  popen(cmd, mode):  path = shell_escape_dispatch_js(cmd, mode[0] == 'w' ? -2 : -1)
                     if (!path) return NULL;  f = fopen(path, mode)
                     shell_escape_dispatch_js(f, -3);  return f
  pclose(f):         fclose(f);  return shell_escape_dispatch_js(f, -4)

(-1: run cmd now and return a file holding its output; -2: return an empty file whose content
becomes cmd's input; -3: f is that pipe's FILE; -4: it was closed: run a write pipe's command,
give its status.) The stubs are found from calculate_PS, the function that loads
"gs -q -dALLOWPSTRANSPARENCY ... -sDEVICE=nullpage -f ": its popen(cmd, "r") and pclose(coord)
calls; fopen is what it calls with "wb", fclose what it calls after each putc loop.

Usage: patch_wasm.py IN.wasm OUT.wasm
"""
import sys
from wasmtool import Module, uleb_enc, sleb


def sleb_enc(n):
    out = bytearray()
    while True:
        byte = n & 0x7f
        n >>= 7
        done = (n == 0 and not byte & 0x40) or (n == -1 and byte & 0x40)
        out.append(byte | (0 if done else 0x80))
        if done:
            return bytes(out)


def popen_patch(b, m, dispatch):
    """New bodies for the popen and pclose stubs: (function, None, None, body) edits."""
    calc = m.string_addrs(b'gs -q -dALLOWPSTRANSPARENCY -dNOPAUSE -dBATCH -sDEVICE=nullpage -f \0')
    assert len(calc) == 1, calc
    found = []
    for k in range(len(m.bodies)):
        f = m.nimp + k
        for at, op, imm in m.instructions(f):
            if op == 0x41 and imm == calc[0]:
                found.append(f)
                break
    assert len(found) == 1, found
    f = found[0]
    ins = list(m.instructions(f))
    wb = set(m.string_addrs(b'wb\0', whole=False))  # tail-merged strings
    fopen = {ins[j][2] for j in range(1, len(ins)) if ins[j][1] == 0x10 and ins[j - 1][1] == 0x41 and ins[j - 1][2] in wb}
    assert len(fopen) == 1, fopen
    fopen = fopen.pop()
    # after the command string: ...; i32.const MODE; call POPEN; local.tee COORD ...; call PCLOSE (the
    # last call taking COORD before the end)
    start = [j for j in range(len(ins)) if ins[j][1] == 0x41 and ins[j][2] == calc[0]][0]
    pj = [j for j in range(start, len(ins)) if ins[j][1] == 0x10 and m.sig(ins[j][2]) == (b'\x7f\x7f', b'\x7f') and ins[j - 1][1] == 0x41][0]
    popen = ins[pj][2]
    assert ins[pj + 1][1] == 0x22, 'popen result not kept'
    coord = ins[pj + 1][2]
    cj = [j for j in range(pj + 2, len(ins)) if ins[j][1] == 0x10 and m.sig(ins[j][2]) == (b'\x7f', b'\x7f') and ins[j - 1][1] == 0x20 and ins[j - 1][2] == coord]
    assert len(cj) == 1, cj
    pclose = ins[cj[0]][2]
    # fclose: what follows the putc loops (the call right after a call to putc's function)
    closes = {ins[j][2] for j in range(1, len(ins)) if ins[j][1] == 0x10 and m.sig(ins[j][2]) == (b'\x7f', b'\x7f') and ins[j][2] not in (pclose,)
              and j + 1 < len(ins) and any(ins[x][1] == 0x10 and ins[x][2] == fopen for x in range(j + 1, min(j + 12, len(ins))))}
    assert len(closes) == 1, closes
    fclose = closes.pop()
    # the stubs as they are: call ERRNO_LOCATION; i32.const 52; i32.store; i32.const 0|-1; end
    for g, ret in ((popen, 0), (pclose, -1)):
        body = list(m.instructions(g))
        assert [x[1] for x in body] == [0x10, 0x41, 0x36, 0x41, 0x0b] and body[1][2] == 52 and body[3][2] == ret, (g, body)
    D, FO, FC = uleb_enc(dispatch), uleb_enc(fopen), uleb_enc(fclose)
    popen_body = (bytes([0x01, 0x02, 0x7f])                              # locals: path, f
                  + bytes([0x20, 0x00, 0x41, 0x7f, 0x20, 0x01, 0x2d, 0x00, 0x00, 0x41, 0xf7, 0x00, 0x46, 0x6b])  # cmd, -1 - (mode[0] == 'w')
                  + bytes([0x10]) + D + bytes([0x22, 0x02, 0x45, 0x04, 0x40, 0x41, 0x00, 0x0f, 0x0b])  # path = ...; if (!path) return 0
                  + bytes([0x20, 0x02, 0x20, 0x01, 0x10]) + FO + bytes([0x21, 0x03])  # f = fopen(path, mode)
                  + bytes([0x20, 0x03, 0x41, 0x7d, 0x10]) + D + bytes([0x1a])  # dispatch(f, -3)
                  + bytes([0x20, 0x03, 0x0b]))
    pclose_body = (bytes([0x00])
                   + bytes([0x20, 0x00, 0x10]) + FC + bytes([0x1a])          # fclose(f)
                   + bytes([0x20, 0x00, 0x41, 0x7c, 0x10]) + D + bytes([0x0b]))  # return dispatch(f, -4)
    return ([(popen, None, None, popen_body), (pclose, None, None, pclose_body)],
            'popen %d and pclose %d (found in calculate_PS, function %d) now use the shell; fopen %d, fclose %d' % (popen, pclose, f, fopen, fclose))


def main(src, dst):
    b = open(src, 'rb').read()
    m = Module(b)
    dispatch = [k for k, (mod, name, t) in enumerate(m.func_imports) if name == 'shell_escape_dispatch_js']
    assert len(dispatch) == 1, 'no shell_escape_dispatch_js import'
    dispatch = dispatch[0]

    fmt = m.string_addrs(b'Filtering file via command -->%s<-- failed.\0')
    assert len(fmt) == 1, fmt
    fmt = fmt[0]
    target = None
    for k in range(len(m.bodies)):
        f = m.nimp + k
        ins = None
        for at, op, imm in m.instructions(f):
            if op == 0x41 and imm == fmt:
                ins = list(m.instructions(f))
                break
        if ins is None:
            continue
        # cmd: local.get A; local.get CMD; i32.store; i32.const fmt
        cmd_local = None
        for j in range(len(ins)):
            if ins[j][1] == 0x41 and ins[j][2] == fmt and ins[j - 1][1] == 0x36 and ins[j - 2][1] == 0x20:
                cmd_local = ins[j - 2][2]
        assert cmd_local is not None, 'warning argument not found'
        # i32.const -1; local.set R; block; call FORK (() -> i32); local.tee; i32.const 0; i32.lt_s
        for j in range(len(ins) - 7):
            a = ins[j:j + 7]
            if (a[0][1] == 0x41 and a[0][2] == -1 and a[1][1] == 0x21 and a[2][1] == 0x02 and a[3][1] == 0x10
                    and m.sig(a[3][2]) == (b'', b'\x7f') and a[4][1] == 0x22 and a[5][1] == 0x41 and a[5][2] == 0 and a[6][1] == 0x48):
                assert target is None, 'two candidate spots'
                target = (f, a[0][0], cmd_local)
    assert target, 'fork() spot not found'
    f, at, cmd_local = target
    assert b[at:at + 2] == b'\x41\x7f'
    edits = [(f, at, 2, bytes([0x20]) + uleb_enc(cmd_local) + bytes([0x41, 0x00, 0x10]) + uleb_enc(dispatch))]
    more, note = popen_patch(b, m, dispatch)
    edits += more

    # rebuild the edited functions' bodies and the code section around them
    by = {}
    for e in edits:
        by.setdefault(e[0], []).append(e)
    n = len(m.bodies)
    code = bytearray(uleb_enc(n))
    _, cp, ce = m.S[10]
    pos = m.bodies[0][0]
    for k in sorted(by, key=lambda f: m.bodies[f - m.nimp][0]):
        s_, bs, be = m.bodies[k - m.nimp]
        code += b[pos:s_]
        whole = [e for e in by[k] if e[1] is None]
        if whole:
            assert len(by[k]) == 1
            body = bytearray(whole[0][3])
        else:
            body = bytearray()
            cur = bs
            for _, at, ln, new in sorted(by[k], key=lambda e: e[1]):
                body += b[cur:at] + new
                cur = at + ln
            body += b[cur:be]
        code += uleb_enc(len(body)) + body
        pos = be
    code += b[pos:ce]
    cs = [x for x in m.secs if x[0] == 10][0][1]
    out = b[:cs] + bytes([10]) + uleb_enc(len(code)) + bytes(code) + b[ce:]
    open(dst, 'wb').write(out)
    print('xdvipdfmx filter (function %d): ret = shell_escape_dispatch_js(local %d, 0); %s; %d -> %d bytes' % (f, cmd_local, note, len(b), len(out)))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
