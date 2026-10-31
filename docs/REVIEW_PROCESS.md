# Review process: the Elephant-Goldfish rule

Adapted from Google's Elephant-Goldfish Model (https://github.com/google/elephant-goldfish-model).

Applies to any non-trivial change. Small, clear fixes (typos, one-line bugs, obvious config) are exempt.

1. **Elephant writes first.** Before any code, the long-context planner writes a design doc, plan change or prereg amendment.
2. **Goldfish restates it.** A fresh, zero-context reviewer (an anonymous free OpenCode session that sees only the blinded doc) must restate the doc correctly. If it can't, the doc is ambiguous and goes back for a redraft.
3. **Hostile review.** 1-3 fresh hostile reviewers hunt for edge cases and gaps. Add a security reviewer where relevant (auth, secrets, untrusted input, network, dependencies).
4. **Go/no-go.** A final fresh reviewer decides whether the paths, data structures and signatures are concrete enough to implement.
5. **Record verdicts.** Each verdict (restate pass/fail, hostile findings, go/no-go) is recorded in the commit message or the decision log.

All reviewers use free models only.
