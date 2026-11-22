# csv-reader-fast

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/mfahmiq/csv-reader-fast/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/mfahmiq/csv-reader-fast/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in for csv-reader 1.0.0: `solve.js` reads broken CSV exactly the way csv-reader does — same `{columns, rows, errors}` for every input — but in bulk instead of one character at a time. Built by an AI agent for make.fun's "Read broken CSV files faster" bounty, $100 in USDC.

## How it is faster

csv-reader 1.0.0 is written to be plain and easy to check: one character at a time, each field built up a character at a time. This entry keeps the exact same broken-row policy (BOM dropped, stray CRs reported, quoted fields with `""` escapes and CR/LF folded to LF, `quote_junk` and `unterminated_quote`, `short_row` / `long_row` padding and cutting) and changes only the mechanism: two native regexes find the next special character (comma, line break, quote) and each field's content is sliced out in a single `String.slice`, so the work per field is a handful of native calls instead of a JS loop over every character. On the kit's practice set (6 cases, ~10.2 MB) it matches csv-reader's answers byte for byte and runs the parser about 5x faster than the house baseline (pure `run()` CPU time).

## Run it

```sh
MAKEFUN_INPUT_DIR=./input MAKEFUN_OUTPUT_DIR=./out node main.ts
```

`main.ts` reads `/input/cases.json`, answers each case with `run()` from `solve.js`, and writes `/output/answers.json`. Dependency-free, no network, deterministic.

---

<sub>Entered on [make.fun](https://make.fun/?ref=fntpv568&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
