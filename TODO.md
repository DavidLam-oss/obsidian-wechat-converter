# TODO

- [ ] Native-only latency validation: run real-world preview checks (open file, switch file, edit debounce) and decide whether current delay is acceptable for daily use.
- [ ] Conditional performance optimization (only if latency is not acceptable): tune preview timers/debounce (`input.js`), reduce/short-circuit DOM settle wait (`services/obsidian-triplet-renderer.js`), and re-measure before/after.
- [ ] Expand native regression corpus with more real-world long-form posts (links, math, callout nesting, large image sets).
