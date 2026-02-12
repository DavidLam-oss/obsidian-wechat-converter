# TODO

- [x] Native-only latency validation: completed on 2026-02-12 with e2e script (`npm run measure:latency`).
  Added multi-round/stability mode (`npm run measure:latency:stability`, or `--rounds N`) and optional JSON report output (`--json-out <path>`).
  Latest 3-round sample (corpus=5) aggregate: open p50/p95 = 80.42ms / 185.22ms, switch p50/p95 = 10.33ms / 181.82ms, edit p50/p95 = 164.98ms / 197.47ms.
  Stability range across rounds: switch p50 delta = 0.92ms, switch p95 delta = 15.70ms.
- [x] Conditional performance optimization (only if latency is not acceptable): implemented low-risk optimization.
  Triplet settle observation window is now conditional on local-like image targets; pure text/remote-image markdown skips extra observe wait.
- [x] Expand native regression corpus with more real-world long-form posts (links, math, callout nesting, large image sets).
  Added: `control-longform-workflow.md`, `control-image-stack.md`, and corresponding parity baseline clean HTML snapshots.
