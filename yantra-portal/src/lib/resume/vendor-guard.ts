/**
 * Vendor Submission Guard
 *
 * Business rule (SR SOFT):
 * If a candidate was already submitted to the same vendor with a *different*
 * skill / job-title fingerprint, HARD BLOCK — vendors must not receive
 * multiple skill-flavored resumes for the same person.
 *
 * Same skill fingerprint re-submissions are allowed (e.g. follow-up).
 */

import { prisma } from "@/lib/db";
import { extractJobTitle, skillFingerprint } from "./ats-scorer";

export type VendorConflict = {
  candidateId: string;
  candidateName: string;
  vendorEmail: string;
  vendorName: string;
  priorJobTitle: string;
  priorSkillFingerprint: string;
  newJobTitle: string;
  newSkillFingerprint: string;
  priorChainId: string | null;
  priorSentAt: string;
  message: string;
};

function normalizeVendorEmail(email: string) {
  return email.trim().toLowerCase();
}

export function fingerprintsDiffer(a: string, b: string): boolean {
  // Compare title part and core skill part loosely
  const [ta, sa] = a.toLowerCase().split("::");
  const [tb, sb] = b.toLowerCase().split("::");
  if (ta && tb && ta !== tb) {
    // title tokens overlap?
    const arrA = ta.split(/\s+/).filter((t) => t.length > 2);
    const setB = new Set(tb.split(/\s+/).filter((t) => t.length > 2));
    let overlap = 0;
    arrA.forEach((t) => {
      if (setB.has(t)) overlap++;
    });
    const union =
      new Set(arrA.concat(Array.from(setB))).size || 1;
    if (overlap / union < 0.5) return true; // substantially different titles
  }
  if (sa && sb && sa !== sb) {
    const aSkills = sa.split("|").filter(Boolean);
    const bSkillSet = new Set(sb.split("|").filter(Boolean));
    let overlap = 0;
    aSkills.forEach((s) => {
      if (bSkillSet.has(s)) overlap++;
    });
    const denom = Math.max(aSkills.length, bSkillSet.size, 1);
    if (overlap / denom < 0.4) return true; // different skill packs
  }
  return false;
}

export async function checkVendorConflicts(opts: {
  candidateIds: string[];
  vendorEmail: string;
  vendorName: string;
  rawJobText: string;
}): Promise<VendorConflict[]> {
  const vendorEmail = normalizeVendorEmail(opts.vendorEmail);
  const newTitle = extractJobTitle(opts.rawJobText);
  const newFp = skillFingerprint(opts.rawJobText, newTitle);

  const candidates = await prisma.candidate.findMany({
    where: { id: { in: opts.candidateIds } },
  });

  const priors = await prisma.vendorSubmission.findMany({
    where: {
      candidateId: { in: opts.candidateIds },
      vendorEmail,
    },
    orderBy: { sentAt: "desc" },
  });

  const conflicts: VendorConflict[] = [];

  for (const c of candidates) {
    const prior = priors.find((p) => p.candidateId === c.id);
    if (!prior) continue;
    if (fingerprintsDiffer(prior.skillFingerprint, newFp)) {
      conflicts.push({
        candidateId: c.id,
        candidateName: c.name,
        vendorEmail,
        vendorName: opts.vendorName,
        priorJobTitle: prior.jobTitle,
        priorSkillFingerprint: prior.skillFingerprint,
        newJobTitle: newTitle,
        newSkillFingerprint: newFp,
        priorChainId: prior.chainId,
        priorSentAt: prior.sentAt.toISOString(),
        message: `HARD BLOCK: ${c.name} was already submitted to ${opts.vendorName} (${vendorEmail}) for a different skill/job title ("${prior.jobTitle}"). Sending again for "${newTitle}" would give the vendor multiple skill-flavored resumes for the same candidate. This is not allowed.`,
      });
    }
  }

  return conflicts;
}

export async function recordVendorSubmissions(opts: {
  chainId: string;
  vendorName: string;
  vendorEmail: string;
  rawJobText: string;
  items: {
    candidateId: string;
    jobTitle: string;
    skillFingerprint: string;
  }[];
  employeeId: string;
}) {
  const vendorEmail = normalizeVendorEmail(opts.vendorEmail);
  for (const item of opts.items) {
    await prisma.vendorSubmission.create({
      data: {
        candidateId: item.candidateId,
        vendorEmail,
        vendorName: opts.vendorName,
        jobTitle: item.jobTitle,
        skillFingerprint: item.skillFingerprint,
        chainId: opts.chainId,
        employeeId: opts.employeeId,
      },
    });
  }
}
