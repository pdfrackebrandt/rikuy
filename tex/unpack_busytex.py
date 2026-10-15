#!/usr/bin/env python3
import os, re, json, lz4.block, sys

CHUNK = 2048

def unpack(js_path, data_path, out_dir):
    js = open(js_path).read()
    data = open(data_path, 'rb').read()
    m = re.search(r'"files":\s*(\[.*?\])\s*,\s*"remote_package_size"', js, re.DOTALL)
    if not m:
        print("no files in", js_path)
        return
    files = json.loads(m.group(1))
    cm = re.search(r'var compressedData = (\{.*?\});', js, re.DOTALL)
    offs = [int(x) for x in re.search(r'"offsets":\[([^\]]+)\]', cm.group(1)).group(1).split(',')]
    chunks = []
    for i in range(len(offs)-1):
        c = data[offs[i]:offs[i+1]]
        try:
            d = lz4.block.decompress(c, uncompressed_size=CHUNK)
        except Exception:
            try:
                d = lz4.block.decompress(c)
            except Exception:
                # last partial or bad; try with smaller
                d = b'\x00' * CHUNK
        chunks.append(d[:CHUNK])  # trim if longer
    full = b''.join(chunks)
    print(f"  decompressed {len(full)} bytes from {len(chunks)} chunks")
    count = 0
    for f in files:
        path = f['filename'].lstrip('/')
        dest = os.path.join(out_dir, path)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        start, end = f['start'], f['end']
        if end > len(full):
            end = len(full)
        open(dest, 'wb').write(full[start:end])
        count += 1
    print(f"  wrote {count} files")

if __name__ == '__main__':
    base = sys.argv[1] if len(sys.argv) > 1 else '/tmp/eng/busy/busytex'
    out = sys.argv[2] if len(sys.argv) > 2 else '/tmp/eng/tree-extra'
    os.makedirs(out, exist_ok=True)
    for name in ['texlive-basic', 'texlive-extra', 'texlive-recommended']:
        js = os.path.join(base, name + '.js')
        data = os.path.join(base, name + '.data')
        if os.path.exists(js) and os.path.exists(data):
            print(name)
            unpack(js, data, out)
    print("done")
