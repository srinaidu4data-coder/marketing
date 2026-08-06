# Adaptive runPack (C0–C6)

Single-entry, adaptive-cost generation for Role Forge.

## Pipeline

```
buildLightContext (C1) → generateResumeV2 (1×) → scorePack (C0+C4)
  → soft band: 1 constrained regen (C2 tier1)
  → hard fail: Best-of-N=2 parallel (C2 tier2)
  → unusable: force unrestricted (never-fail UX)
  → ensureShipShape with ranked bank
```

## Phases

| ID | What |
|----|------|
| **C0** | `scorePack` hard/soft/green + `runPack` façade + path audit |
| **C1** | Project-complete skeleton + per-slot lexical evidence + bank rank |
| **C2** | Soft regen + BoN under budgets |
| **C3** | LLM wave cap (3), soft fire ≤25%, 45s headroom, no regen soup on v2 |
| **C4** | Every-project residue / JD-face gate in `scorePack` |
| **C5** | Fixtures + `node scripts/eval-run-pack-c5.mjs` |
| **C6** | Reject-after-green (`rejectChainPackAction`) + audit |

## UI indicators

On each chain pack card (when `atsBreakdownJson.generationMeta` present):

- **Path chip**: T0 cruise / T1 focus / T2 surge / Force (+ weak)
- **Cost chip**: estimated LLM `$`
- **IR chip**: light retrieve used
- **Rejected**: human reject logged

## Flags

| Env | Effect |
|-----|--------|
| `RESUME_RUN_PACK=0` | Disable adaptive path; use `generateResumeV2WithRegen` (max 2) |
| `RESUME_ENGINE_V2=0` | Legacy multi-engine (unchanged) |

## Cost

Estimated via `estimateLlmCostUsd(tokensIn, tokensOut, model, provider)` and stored on:

- `ApiUsageLog.costUsd`
- `atsBreakdownJson.generationMeta.costUsd`
- `TailorResumeResult.costUsd`
