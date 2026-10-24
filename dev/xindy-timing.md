# xindy start time

Measured with `node --no-experimental-fetch tex/native/xindy/test.cjs`:

- boot 448 ms
- boot 412 ms
- boot 484 ms

Average about 450 ms. The PLAN.md mentioned about 0.8 s; the current build
is faster. Precompiling to ECL bytecode was not attempted; the current
start time is acceptable for first use.

The 11/11 test against CLISP's xindy 2.5.1 passes.
