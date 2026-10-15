"""A small WebAssembly reader for patch_wasm.py: sections, types, imports, data strings, and an
instruction walker (MVP, sign-ext, bulk memory, reference types, atomics, multivalue)."""


def uleb(b, i):
    n = s = 0
    while True:
        x = b[i]
        i += 1
        n |= (x & 0x7f) << s
        s += 7
        if not x & 0x80:
            return n, i


def sleb(b, i):
    n = s = 0
    while True:
        x = b[i]
        i += 1
        n |= (x & 0x7f) << s
        s += 7
        if not x & 0x80:
            if x & 0x40:
                n -= 1 << s
            return n, i


def uleb_enc(n):
    out = bytearray()
    while True:
        byte = n & 0x7f
        n >>= 7
        out.append(byte | (0x80 if n else 0))
        if not n:
            return bytes(out)


class Module:
    def __init__(self, b):
        self.b = b
        self.secs = []
        i = 8
        while i < len(b):
            sid = b[i]
            size, j = uleb(b, i + 1)
            self.secs.append((sid, i, j, j + size))
            i = j + size
        S = {sid: (s, p, e) for sid, s, p, e in self.secs if sid != 0}
        self.S = S
        # types
        _, p, e = S[1]
        n, i = uleb(b, p)
        self.types = []
        for _ in range(n):
            assert b[i] == 0x60
            i += 1
            np_, i = uleb(b, i); ps = bytes(b[i:i + np_]); i += np_
            nr, i = uleb(b, i); rs = bytes(b[i:i + nr]); i += nr
            self.types.append((ps, rs))
        # imports
        _, p, e = S[2]
        n, i = uleb(b, p)
        self.func_imports = []  # (module, name, type)
        for _ in range(n):
            l, i = uleb(b, i); mod = b[i:i + l].decode(); i += l
            l, i = uleb(b, i); name = b[i:i + l].decode(); i += l
            kind = b[i]; i += 1
            if kind == 0:
                t, i = uleb(b, i)
                self.func_imports.append((mod, name, t))
            elif kind == 1:
                i += 1; fl, i = uleb(b, i); _, i = uleb(b, i)
                if fl & 1: _, i = uleb(b, i)
            elif kind == 2:
                fl, i = uleb(b, i); _, i = uleb(b, i)
                if fl & 1: _, i = uleb(b, i)
            elif kind == 3:
                i += 2
            elif kind == 4:
                i += 1; _, i = uleb(b, i)
        self.nimp = len(self.func_imports)
        # function types
        _, p, e = S[3]
        n, i = uleb(b, p)
        self.ftype = []
        for _ in range(n):
            t, i = uleb(b, i)
            self.ftype.append(t)
        # code bodies: (entry start, body start, body end)
        _, p, e = S[10]
        n, i = uleb(b, p)
        self.bodies = []
        for _ in range(n):
            size, j = uleb(b, i)
            self.bodies.append((i, j, j + size))
            i = j + size
        # data segments: (address, bytes)
        self.data = []
        if 11 in S:
            _, p, e = S[11]
            n, i = uleb(b, p)
            for _ in range(n):
                flag, i = uleb(b, i)
                if flag == 1:
                    l, i = uleb(b, i); i += l
                    continue
                if flag == 2:
                    _, i = uleb(b, i)
                assert b[i] == 0x41
                addr, i = sleb(b, i + 1)
                assert b[i] == 0x0b
                i += 1
                l, i = uleb(b, i)
                self.data.append((addr, b[i:i + l]))
                i += l

    def sig(self, func_index):
        if func_index < self.nimp:
            return self.types[self.func_imports[func_index][2]]
        return self.types[self.ftype[func_index - self.nimp]]

    def string_addrs(self, s, whole=True):
        out = []
        for addr, seg in self.data:
            pos = seg.find(s)
            while pos >= 0:
                if not whole or pos == 0 or seg[pos - 1] == 0:
                    out.append(addr + pos)
                pos = seg.find(s, pos + 1)
        return out

    def body(self, func_index):
        _, bs, be = self.bodies[func_index - self.nimp]
        return bs, be

    def instructions(self, func_index):
        """yields (offset, opcode, immediates) for a defined function's body"""
        b = self.b
        bs, be = self.body(func_index)
        i = bs
        n, i = uleb(b, i)
        for _ in range(n):
            _, i = uleb(b, i)
            i += 1
        while i < be:
            at = i
            op = b[i]
            i += 1
            imm = None
            if op in (0x02, 0x03, 0x04):  # block types
                if b[i] == 0x40 or b[i] in (0x7f, 0x7e, 0x7d, 0x7c, 0x7b, 0x70, 0x6f):
                    i += 1
                else:
                    _, i = sleb(b, i)
            elif op in (0x0c, 0x0d, 0x10, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0xd2):
                imm, i = uleb(b, i)
            elif op == 0x0e:
                cnt, i = uleb(b, i)
                for _ in range(cnt + 1):
                    _, i = uleb(b, i)
            elif op == 0x11:
                imm, i = uleb(b, i)
                _, i = uleb(b, i)
            elif 0x28 <= op <= 0x3e:
                _, i = uleb(b, i)
                _, i = uleb(b, i)
            elif op in (0x3f, 0x40):
                i += 1
            elif op == 0x41:
                imm, i = sleb(b, i)
            elif op == 0x42:
                imm, i = sleb(b, i)
            elif op == 0x43:
                i += 4
            elif op == 0x44:
                i += 8
            elif op == 0xd0:
                i += 1
            elif op == 0x1c:
                cnt, i = uleb(b, i)
                i += cnt
            elif op == 0xfc:
                sub, i = uleb(b, i)
                if sub <= 7:
                    pass
                elif sub == 8:
                    _, i = uleb(b, i); i += 1
                elif sub == 9:
                    _, i = uleb(b, i)
                elif sub == 10:
                    i += 2
                elif sub == 11:
                    i += 1
                elif sub == 12:
                    _, i = uleb(b, i); _, i = uleb(b, i)
                elif sub == 13:
                    _, i = uleb(b, i)
                elif sub == 14:
                    _, i = uleb(b, i); _, i = uleb(b, i)
                elif sub in (15, 16, 17):
                    _, i = uleb(b, i)
                else:
                    raise ValueError('0xfc %d at %d' % (sub, at))
                op = (0xfc, sub)
            elif op == 0xfe:
                sub, i = uleb(b, i)
                if sub == 3:
                    i += 1
                else:
                    _, i = uleb(b, i); _, i = uleb(b, i)
                op = (0xfe, sub)
            yield at, op, imm
