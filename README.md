# @absolutejs/slo

Storage-neutral service-level objective decisions for AbsoluteJS.

The package converts already-authorized measurements into deterministic error
budgets, burn-rate alerts, release gates, and incident transitions. It does not
own storage, scraping, paging providers, or application policy.

```ts
import { evaluateSlo, sloReleaseGate } from "@absolutejs/slo";

const evaluation = evaluateSlo(
  {
    id: "checkout-availability",
    objective: 0.999,
    windowMs: 30 * 86_400_000,
    minimumSamples: 1_000,
  },
  { good: 99_950, total: 100_000, start, end },
);

const gate = sloReleaseGate(evaluation);
```

Use `evaluateBurnRates` for sustained multi-window alerting and
`sloIncidentDecision` to prepare idempotent open/resolve transitions for
`@absolutejs/incidents`.
