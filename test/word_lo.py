"""LibreOffice as a coauthor: open a .docx Rikuy exported, save it unchanged (saved.docx), then with
Track Changes on make one edit, "slow" to "very slow", and save again (edited.docx). Run with the
system Python, which has LibreOffice's uno module: python3 word_lo.py in.docx saved.docx edited.docx.
test/word.py runs it when soffice is installed."""
import os, sys, time, subprocess, tempfile, uno
from com.sun.star.beans import PropertyValue


def prop(n, v):
    p = PropertyValue()
    p.Name, p.Value = n, v
    return p


def main(src, saved, edited):
    port = 2002 + os.getpid() % 1000
    prof = tempfile.mkdtemp(prefix='rikuy-lo-')
    soffice = subprocess.Popen(['soffice', '--headless', '--norestore', '--nologo', '-env:UserInstallation=file://' + prof,
                                '--accept=socket,host=127.0.0.1,port=%d;urp;' % port], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ctx = None
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
        for _ in range(120):
            try:
                ctx = resolver.resolve('uno:socket,host=127.0.0.1,port=%d;urp;StarOffice.ComponentContext' % port)
                break
            except Exception:
                time.sleep(0.5)
        desktop = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
        url = lambda p: uno.systemPathToFileUrl(os.path.abspath(p))
        out = (prop('FilterName', 'MS Word 2007 XML'), prop('Overwrite', True))
        doc = desktop.loadComponentFromURL(url(src), '_blank', 0, (prop('Hidden', True),))
        doc.storeToURL(url(saved), out)
        doc.close(True)
        doc = desktop.loadComponentFromURL(url(saved), '_blank', 0, (prop('Hidden', True),))
        doc.setPropertyValue('RecordChanges', True)
        rd = doc.createReplaceDescriptor()
        rd.SearchString = 'Growth is slow.'
        found = doc.findFirst(rd)
        if not found:
            raise SystemExit('text not found')
        cur = found.getText().createTextCursorByRange(found.getStart())
        cur.goRight(len('Growth is '), False)
        cur.getText().insertString(cur, 'very ', False)
        doc.storeToURL(url(edited), out)
        doc.close(True)
    finally:
        soffice.terminate()
        try: soffice.wait(20)
        except Exception: soffice.kill()


if __name__ == '__main__':
    main(*sys.argv[1:4])
