# Stuck chain recovery

## Problem (fixed)

Chains were created as `GENERATING`, then processed inline in the HTTP request.
If the process crashed, timed out, or threw mid-candidate, status never left
`GENERATING` / `SENDING`. Abandoned rows + long SQLite-held requests made new
chains feel blocked.

## Guarantees

1. **Terminal status** — generation always ends `READY` (≥1 pack) or `FAILED` (0 packs).
2. **Per-candidate isolation** — one resume failure does not abort the pack.
3. **Stale sweeper** — `GENERATING`/`SENDING` with `updatedAt` older than ~3 minutes
   are auto-recovered (JS time compare; Prisma SQLite `lt` is unreliable).
4. **No create gate** — another in-flight chain never hard-blocks create.
5. **Send path** — outer catch terminalizes `SENDING` so it cannot stick forever.
6. **Manual recover** — admin queues + chain detail “Recover stuck”.
7. **Heartbeats** — `updatedAt` bumped at candidate start, after tailor, before PDF.

## Recover semantics

| Packs present? | Recover / stale result |
|----------------|------------------------|
| Yes            | `READY` (can still send) |
| No             | `FAILED` |

## Code

- `src/lib/chain-pipeline.ts` — core pipeline + sweeper
- `src/app/api/chains/route.ts` — POST create
- `src/app/actions/chains.ts` — send + recover actions
- `src/app/(app)/admin/queues/page.tsx` — queue UI + bulk recover
- Validate: `node --import tsx scripts/validate-stuck-chain-recovery.ts`
