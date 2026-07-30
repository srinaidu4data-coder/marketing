/**
 * Validates stuck-chain recovery does not block new chain creation.
 *
 * Scenarios:
 * 1. Simulated abandoned GENERATING chain is recovered to FAILED
 * 2. After recovery, a new chain can be created and reaches READY
 * 3. Per-candidate isolation: generation returns terminal status even on empty pack edge cases
 * 4. Manual failStuckChain only works on in-flight statuses
 * 5. Live (fresh) GENERATING is NOT swept by stale recover within grace window
 */
import { PrismaClient } from "@prisma/client";
import {
  recoverStaleChains,
  failStuckChain,
  createAndGenerateChain,
  STALE_CHAIN_MS,
} from "../src/lib/chain-pipeline";

const prisma = new PrismaClient();

async function main() {
  let fails = 0;
  const log = (ok: boolean, msg: string) => {
    console.log(ok ? `PASS  ${msg}` : `FAIL  ${msg}`);
    if (!ok) fails++;
  };

  const employee = await prisma.user.findFirst({
    where: { role: "EMPLOYEE", deletedAt: null },
  });
  if (!employee) throw new Error("No employee in DB — run seed");

  const candidates = await prisma.allocation.findMany({
    where: { employeeId: employee.id },
    take: 2,
  });
  if (candidates.length === 0) throw new Error("No allocations — run seed");

  // --- 1. Plant a stale GENERATING chain ---
  const stale = await prisma.chain.create({
    data: {
      employeeId: employee.id,
      vendorName: "stale-vendor-test",
      vendorEmail: "stale-recover-test@example.com",
      rawJobText: "SAP FICO test JD for stuck recovery validation",
      status: "GENERATING",
    },
  });
  // Backdate updatedAt via ISO string (Prisma @updatedAt would rewrite on normal update)
  const pastIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await prisma.$executeRawUnsafe(
    `UPDATE "Chain" SET updatedAt = ? WHERE id = ?`,
    pastIso,
    stale.id
  );

  const afterStale = await prisma.chain.findUnique({ where: { id: stale.id } });
  log(afterStale?.status === "GENERATING", "planted stale GENERATING chain");

  const rec = await recoverStaleChains({ olderThanMs: STALE_CHAIN_MS });
  log(rec.recovered.includes(stale.id), "stale chain recovered by sweeper");

  const afterRec = await prisma.chain.findUnique({ where: { id: stale.id } });
  // No packs on planted stale chain → FAILED; with packs would be READY
  log(
    afterRec?.status === "FAILED" || afterRec?.status === "READY",
    `stale chain terminal status is ${afterRec?.status} (not GENERATING)`
  );
  log(afterRec?.status !== "GENERATING", "stale chain left in-flight states");

  // --- 2. Fresh GENERATING should NOT be recovered ---
  const live = await prisma.chain.create({
    data: {
      employeeId: employee.id,
      vendorName: "live-vendor-test",
      vendorEmail: "live-recover-test@example.com",
      rawJobText: "live heartbeat test",
      status: "GENERATING",
    },
  });
  const recLive = await recoverStaleChains({ olderThanMs: STALE_CHAIN_MS });
  log(!recLive.recovered.includes(live.id), "fresh GENERATING not swept");
  // cleanup live via manual recover
  const manual = await failStuckChain(live.id, employee.id, "test_cleanup");
  log(manual.ok === true, "manual recover works on GENERATING");
  const liveAfter = await prisma.chain.findUnique({ where: { id: live.id } });
  log(
    liveAfter?.status === "FAILED" || liveAfter?.status === "READY",
    `manual recover → terminal ${liveAfter?.status}`
  );

  // --- 3. New chain create still works after stuck recover ---
  const uniqueEmail = `new-after-stuck-${Date.now()}@example.com`;
  const created = await createAndGenerateChain({
    userId: employee.id,
    vendorName: "post-recover-vendor",
    vendorEmail: uniqueEmail,
    rawJobText:
      "Job Title: SAP FICO Consultant\nNeed SAP FICO, GL, AP, AR, S/4HANA experience for finance transformation.",
    candidateIds: candidates.map((c) => c.candidateId),
  });
  log(
    created.status === "READY" || created.succeeded > 0,
    `new chain after recovery reaches READY (status=${created.status}, succeeded=${created.succeeded})`
  );
  log(Boolean(created.id), "new chain has id");

  const row = await prisma.chain.findUnique({ where: { id: created.id } });
  log(row?.status === "READY" || row?.status === "FAILED", "DB status is terminal (not GENERATING)");
  log(row?.status !== "GENERATING", "new chain not stuck GENERATING");

  // --- 4. failStuckChain rejects non-in-flight ---
  const reject = await failStuckChain(created.id, employee.id);
  log(reject.ok === false, "manual recover rejects non-in-flight chain");

  // --- 5. Concurrent stuck does not prevent second create ---
  const stuck2 = await prisma.chain.create({
    data: {
      employeeId: employee.id,
      vendorName: "concurrent-stuck",
      vendorEmail: "concurrent-stuck@example.com",
      rawJobText: "should not block",
      status: "GENERATING",
    },
  });
  const past2 = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await prisma.$executeRawUnsafe(
    `UPDATE "Chain" SET updatedAt = ? WHERE id = ?`,
    past2,
    stuck2.id
  );

  const second = await createAndGenerateChain({
    userId: employee.id,
    vendorName: "second-create",
    vendorEmail: `second-${Date.now()}@example.com`,
    rawJobText: "Job Title: SAP MM Consultant\nMM P2P S/4HANA",
    candidateIds: [candidates[0].candidateId],
  });
  log(
    second.status === "READY" || second.status === "FAILED",
    `second create completes to terminal status (${second.status})`
  );
  const stuck2After = await prisma.chain.findUnique({ where: { id: stuck2.id } });
  log(
    stuck2After?.status === "FAILED" || stuck2After?.status === "READY",
    `stale concurrent stuck auto-recovered to ${stuck2After?.status}`
  );
  log(stuck2After?.status !== "GENERATING", "concurrent stuck no longer GENERATING");

  console.log("\nSTALE_CHAIN_MS", STALE_CHAIN_MS);
  if (fails) {
    console.log(`\n${fails} CHECK(S) FAILED`);
    process.exit(1);
  }
  console.log("\nALL STUCK-CHAIN RECOVERY CHECKS PASS");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
