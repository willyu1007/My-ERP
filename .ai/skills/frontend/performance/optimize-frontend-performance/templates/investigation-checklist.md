# Template: Performance investigation checklist

- [ ] Reproduce on a slow device profile (or throttled CPU/network).
- [ ] Identify whether the bottleneck is:
  - network (API latency / large payload)
  - CPU (rendering / JS execution)
  - bundle size (initial load)
- [ ] Capture a baseline (numbers).
- [ ] Apply one change at a time.
- [ ] Confirm improvement with the same measurement.
