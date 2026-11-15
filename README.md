# Token Radar-01 — Make.fun Competition Entry

Token Radar-01 is a dark radar-terminal dashboard and valuation model that scans protocol TVL and live-token markets to rank pre-token protocols by implied value and generate concrete farm plans.

## Valuation Model
- **Base Multiple**: Calibrated dynamically from live protocols (trimmed mean of `mcap_usd / tvl_usd`, clamped to `[0.05, 1.50]`).
- **Implied Value**: `tvl_usd * baseMultiple * growthFactor * ageFactor` (capped at $20,000,000,000).
- **Growth Factor**: Derived from `change_7d` (null -> 0): `1 + clamp(change_7d, -60, +150) / 200`.
- **Age Factor**: Derived from `listed_at` vs `2026-11-14` (null -> 365 days): `0.85 + 0.30 * min(ageYears, 4) / 4`.

## Running & Building
Requires Node 22 (standard library only, zero external npm dependencies).

```bash
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```
