# Security

Please report a vulnerability privately, not in an issue: by email to
pedro.fernandezrackebrandt@merton.ox.ac.uk, or through GitHub's private vulnerability reporting
(the repository's Security tab, "Report a vulnerability").

The most useful report is the document, share link, zip or pasted text that does it, and what
it does. That covers anything a document or link can make the page or the TeX worker do beyond
the project's own files: run script in the page, read another project, reach the network, or
hand over the git token. Shell escape is meant to stay inside the worker and its in-memory
files; a way out of them counts too.

Fixes go into `main` and the hosted copy. A problem in claude.ai itself, where the hosted copy
runs, is Anthropic's to fix: report it to them.
