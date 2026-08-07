/**
 * Chain isolation law
 * ───────────────────
 * Every chain generation is a virgin run. Forbidden influences:
 *   - Other chains' tailoredResumeText / jobTitle / skillFingerprint
 *   - Tools that appear only because a *previous* JD once asked for them
 *   - Seeding LLM from a prior pack JSON belonging to another chain
 *
 * Allowed influences (only):
 *   - This chain's rawJobText (JD)
 *   - Candidate masterResumeText + masterProfileJson
 *   - Admin ACTIVE prompt, skill-neutral bullet bank, stack/env catalog
 *   - Within-run Fit repair priorJson for THIS pack only (same request)
 *
 * Code enforces this by:
 *   1. Never querying other chains when generating
 *   2. Clearing this chain's pack rows before regenerate
 *   3. Grounding techStack/environment/techSkills to THIS JD ∪ master
 *   4. Isolation banner in the LLM user message
 */

import type { ResumePackV2 } from "@/lib/resume-v2/pack-schema";
import { normalizeTechSkills } from "@/lib/resume-v2/pack-schema";
import {
  isToolNoun,
  scrubToToolNouns,
  toolsFromJd,
} from "@/lib/resume-v2/tools-nouns";
import { JD_REWRITE_MAX_INDEX } from "@/lib/resume-v2/bible-prompt";
import { prisma } from "@/lib/db";
import { resolveUploadPath } from "@/lib/paths";
import { unlink } from "fs/promises";

export const CHAIN_ISOLATION_BANNER = `=== CHAIN ISOLATION (MANDATORY) ===
This is a FRESH chain generation. Previous chains, previous vendor packs, and previous JDs MUST NOT influence tools, stack, environment, summary, or bullets.
Tech Stack / Environment / techSkills: use ONLY tools that appear in THIS JD or THIS master resume (plus era-safe delivery tools like Jira, ALM, Excel).
Do NOT copy tech lists from any earlier resume you may have generated for this person under a different JD.
projects[0..2] = rewrite for THIS JD only. projects[i≥3] = master/era freeze only — no tools from THIS or any other JD that were not on master.`;

/** Timeless delivery tools always allowed as pad (not domain from prior JDs). */
const TIMELESS_PAD = new Set(
  [
    "jira",
    "hp alm",
    "alm",
    "servicenow",
    "service now",
    "excel",
    "ms office",
    "confluence",
    "devops",
    "azure devops",
    "git",
    "github",
    "gitlab",
    "solman",
    "solution manager",
    "powerpoint",
    "visio",
    "sharepoint",
    "teams",
    "outlook",
  ].map((s) => s.toLowerCase())
);

function normKey(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTools(raw: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;|/·•]+/)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Build allowed tool key set from THIS JD + THIS master only.
 */
export function buildChainAllowedToolKeys(
  jd: string,
  masterText: string
): Set<string> {
  const allowed = new Set<string>();
  const addLine = (line: string) => {
    for (const t of splitTools(scrubToToolNouns(line, 40))) {
      const k = normKey(t);
      if (k) allowed.add(k);
    }
  };
  // Structured extracts
  addLine(toolsFromJd(jd, 40) || "");
  addLine(toolsFromJd(masterText, 40) || "");
  // Also harvest free text for product tokens
  for (const chunk of [jd, masterText]) {
    if (!chunk) continue;
    for (const m of chunk.match(/\b[A-Z][A-Z0-9][A-Z0-9+./-]{1,14}\b/g) || []) {
      if (isToolNoun(m)) allowed.add(normKey(m));
    }
    // Multi-word known tools via scrub
    addLine(scrubToToolNouns(chunk.slice(0, 8000), 50));
  }
  for (const t of Array.from(TIMELESS_PAD)) allowed.add(t);
  return allowed;
}

function filterToolLine(
  raw: string,
  allowed: Set<string>,
  limit = 14
): { kept: string; dropped: string[] } {
  const dropped: string[] = [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of splitTools(scrubToToolNouns(raw, 24) || raw)) {
    if (!isToolNoun(t) && !TIMELESS_PAD.has(normKey(t))) {
      dropped.push(t);
      continue;
    }
    const k = normKey(t);
    if (!k || seen.has(k)) continue;
    // Allow if exact key match OR any allowed key is a substring brand match
    const ok =
      allowed.has(k) ||
      Array.from(allowed).some(
        (a) =>
          a.length >= 3 &&
          k.length >= 3 &&
          (k.includes(a) || a.includes(k))
      );
    if (!ok) {
      dropped.push(t);
      continue;
    }
    seen.add(k);
    out.push(t);
    if (out.length >= limit) break;
  }
  return { kept: out.join(", "), dropped };
}

/**
 * Strip techStack / environment / techSkills tokens that are not grounded
 * in THIS JD or THIS master (kills cross-JD tool bleed from prior packs / LLM habit).
 *
 * Recent projects (i ≤ JD_REWRITE_MAX_INDEX): ground to JD ∪ master ∪ timeless.
 * Early projects (i > max): ground to master ∪ timeless only (no JD paint, no alien tools).
 */
export function groundPackToolsToThisChain(
  pack: ResumePackV2,
  opts: { jd: string; masterText: string }
): { pack: ResumePackV2; notes: string[]; droppedCount: number } {
  const notes: string[] = [];
  const jd = (opts.jd || "").trim();
  const master = (opts.masterText || "").trim();
  const allowedAll = buildChainAllowedToolKeys(jd, master);
  const allowedMasterOnly = buildChainAllowedToolKeys("", master);

  let droppedCount = 0;
  const projects = (pack.projects || []).map((p, i) => {
    const isRecent = i <= JD_REWRITE_MAX_INDEX;
    const allow = isRecent ? allowedAll : allowedMasterOnly;
    const stack = filterToolLine(p.techStack || "", allow, 14);
    const env = filterToolLine(p.environment || "", allow, 12);
    // Zero overlap: drop env tokens that remain in stack
    const stackKeys = new Set(splitTools(stack.kept).map(normKey));
    const envTokens = splitTools(env.kept).filter((t) => !stackKeys.has(normKey(t)));
    const envFinal = envTokens.join(", ");
    if (stack.dropped.length || env.dropped.length) {
      droppedCount += stack.dropped.length + env.dropped.length;
      notes.push(
        `iso p[${i}] drop stack=[${stack.dropped.slice(0, 6).join("|")}] env=[${env.dropped.slice(0, 6).join("|")}]`
      );
    }
    return {
      ...p,
      techStack: stack.kept,
      environment: envFinal,
    };
  });

  // techSkills: ground to JD ∪ master
  let techSkills = pack.techSkills;
  const reNorm = normalizeTechSkills(techSkills);
  techSkills = reNorm.techSkills;
  if (typeof techSkills === "string") {
    const f = filterToolLine(techSkills, allowedAll, 24);
    if (f.dropped.length) {
      droppedCount += f.dropped.length;
      notes.push(`iso skills drop [${f.dropped.slice(0, 8).join("|")}]`);
    }
    techSkills = f.kept || toolsFromJd(jd, 16) || toolsFromJd(master, 16) || "";
  } else if (Array.isArray(techSkills)) {
    const f = filterToolLine(techSkills.join(", "), allowedAll, 24);
    droppedCount += f.dropped.length;
    techSkills = f.kept
      ? f.kept.split(", ").filter(Boolean)
      : (toolsFromJd(jd, 16) || toolsFromJd(master, 16) || "")
          .split(", ")
          .filter(Boolean);
  } else if (techSkills && typeof techSkills === "object") {
    const next: Record<string, string[]> = {};
    for (const [g, vals] of Object.entries(techSkills as Record<string, string[]>)) {
      const f = filterToolLine(
        (Array.isArray(vals) ? vals : []).join(", "),
        allowedAll,
        16
      );
      droppedCount += f.dropped.length;
      if (f.kept) next[g] = f.kept.split(", ").filter(Boolean);
    }
    techSkills = Object.keys(next).length
      ? next
      : scrubToToolNouns(toolsFromJd(jd, 16) || toolsFromJd(master, 16) || "", 16);
  }

  const out: ResumePackV2 = {
    ...pack,
    projects,
    techSkills,
    meta: {
      ...(pack.meta || {}),
      notes: [
        ...(pack.meta?.notes || []),
        "chain_isolation=on",
        ...notes.slice(0, 12),
        droppedCount
          ? `iso_dropped_tools=${droppedCount}`
          : "iso_dropped_tools=0",
      ],
    },
  };
  return { pack: out, notes, droppedCount };
}

/**
 * Wipe pack rows + disk artifacts for THIS chain only (before regenerate / re-entry).
 * Does not touch other chains.
 */
export async function clearThisChainPacks(chainId: string): Promise<{
  rowsCleared: number;
  filesRemoved: number;
}> {
  const rows = await prisma.chainCandidate.findMany({
    where: { chainId },
    select: {
      id: true,
      tailoredResumePath: true,
      docxPath: true,
      pdfPath: true,
    },
  });
  let filesRemoved = 0;
  for (const r of rows) {
    for (const rel of [r.tailoredResumePath, r.docxPath, r.pdfPath]) {
      if (!rel) continue;
      try {
        await unlink(resolveUploadPath(rel));
        filesRemoved += 1;
      } catch {
        /* missing file ok */
      }
    }
  }
  // Hard-delete rows so regenerate cannot accidentally upsert onto polluted text mid-flight
  const del = await prisma.chainCandidate.deleteMany({ where: { chainId } });
  return { rowsCleared: del.count, filesRemoved };
}

/**
 * Hard-purge ALL chains and packs for given candidates (or entire system if empty).
 * Destructive — admin only callers.
 */
export async function hardPurgeChains(opts?: {
  candidateIds?: string[];
  employeeId?: string;
  /** When true, purge every chain in the database */
  all?: boolean;
}): Promise<{
  chainsDeleted: number;
  packsDeleted: number;
  filesRemoved: number;
  vendorSubsDeleted: number;
}> {
  let chainWhere: { id?: { in: string[] }; employeeId?: string } = {};
  if (opts?.all) {
    chainWhere = {};
  } else if (opts?.employeeId) {
    chainWhere = { employeeId: opts.employeeId };
  } else if (opts?.candidateIds?.length) {
    const links = await prisma.chainCandidate.findMany({
      where: { candidateId: { in: opts.candidateIds } },
      select: { chainId: true },
    });
    const ids = Array.from(new Set(links.map((l) => l.chainId)));
    if (!ids.length) {
      return {
        chainsDeleted: 0,
        packsDeleted: 0,
        filesRemoved: 0,
        vendorSubsDeleted: 0,
      };
    }
    chainWhere = { id: { in: ids } };
  } else {
    return {
      chainsDeleted: 0,
      packsDeleted: 0,
      filesRemoved: 0,
      vendorSubsDeleted: 0,
    };
  }

  const chains = await prisma.chain.findMany({
    where: chainWhere,
    select: { id: true },
  });
  const chainIds = chains.map((c) => c.id);
  if (!chainIds.length) {
    return {
      chainsDeleted: 0,
      packsDeleted: 0,
      filesRemoved: 0,
      vendorSubsDeleted: 0,
    };
  }

  const packs = await prisma.chainCandidate.findMany({
    where: { chainId: { in: chainIds } },
    select: {
      tailoredResumePath: true,
      docxPath: true,
      pdfPath: true,
    },
  });
  let filesRemoved = 0;
  for (const r of packs) {
    for (const rel of [r.tailoredResumePath, r.docxPath, r.pdfPath]) {
      if (!rel) continue;
      try {
        await unlink(resolveUploadPath(rel));
        filesRemoved += 1;
      } catch {
        /* */
      }
    }
  }

  const packsDeleted = await prisma.chainCandidate.deleteMany({
    where: { chainId: { in: chainIds } },
  });

  // Vendor submissions tied to these chains (stop guard using old skill flavors as "memory")
  const vendorSubsDeleted = await prisma.vendorSubmission.deleteMany({
    where: { chainId: { in: chainIds } },
  });

  const chainsDeleted = await prisma.chain.deleteMany({
    where: { id: { in: chainIds } },
  });

  return {
    chainsDeleted: chainsDeleted.count,
    packsDeleted: packsDeleted.count,
    filesRemoved,
    vendorSubsDeleted: vendorSubsDeleted.count,
  };
}
