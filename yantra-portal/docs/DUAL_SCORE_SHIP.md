# Dual scores: ATS + Psych (BEST = both 100)

Validated by plan agents (Karpathy-style simplicity + Elon-style hard gates).

## Contract

```
BEST  ⇔  structural ship OK
      ∧  ATS score === 100
      ∧  Psych score === 100
```

- **ATS** = Fit-IR (parse, keywords, role, temporal, progressive, recency)
- **Psych** = credibility (cosplay, free metrics, employers, certs, titles, years, identity, first-screen)

If honesty fails, **ATS is capped at 70** so we never ship “ATS 100 / Rules FAIL” theater.

## Bullet density (ONE LAW)

| | |
|--|--|
| **Min** | **8** per employer (hard floor — all modes, all eras) |
| **Preferred** | **10** |
| **Max** | **12** |
| Source of truth | `src/lib/resume/bullet-density.ts` |

Mode never lowers density. Prompt, AI, progressive, assemble, ship, validate all use this law.

## Modes (`resolveTailorMode`) — titles / honesty only

| Mode | Overlap | Titles | Invent fill | Bullet min |
|------|---------|--------|-------------|------------|
| `same_domain` | ≥ 0.45 | JD on recent | off | **8** (always) |
| `transfer` | ≥ 0.22 | master titles | off | **8** (always) |
| `strict` | &lt; 0.22 | master titles | off | **8** (always) |

## Psych dimensions (binary → 100)

| Dim | Pts |
|-----|-----|
| Industry honesty | 20 |
| Free metrics ban | 15 |
| Employer fidelity | 15 |
| Cert/education honesty | 10 |
| Title policy by mode | 15 |
| One years claim | 10 |
| Identity / brand | 10 |
| First-screen skeleton | 5 |

## Files

- `src/lib/resume/tailor-mode.ts`
- `src/lib/resume/psych-scorer.ts`
- `src/lib/resume/pack-ship-ready.ts` (single ship authority)
- `src/lib/resume/ats-scorer.ts` (honesty cap)
- `src/lib/resume/resume-honesty.ts` (free metrics + residue)
- `src/lib/resume/assemble-pack.ts` / `ai-tailor.ts`

## Smoke

```bash
node node_modules/tsx/dist/cli.mjs scripts/smoke-psych-ats.ts
```

SAP master + Clinical JD cosplay pack → **not BEST**, Psych &lt; 100, ATS capped.
