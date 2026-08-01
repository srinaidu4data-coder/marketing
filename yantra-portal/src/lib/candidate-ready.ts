/**
 * Preflight: can this candidate enter the pack-generation flow?
 */

import {
  parseMasterProfile,
  parseStoredMasterProfile,
} from "@/lib/resume/master-profile";
import { validateMasterProfile } from "@/lib/resume/master-pack-validate";

export type CandidateReady = {
  ok: boolean;
  reason?: string;
  engagementCount: number;
  profileScore: number;
  chars: number;
};

export function assessCandidateReady(c: {
  masterResumeText?: string | null;
  masterProfileJson?: string | null;
}): CandidateReady {
  const text = (c.masterResumeText || "").trim();
  const chars = text.length;
  if (chars < 80) {
    return {
      ok: false,
      reason: "No master resume text — upload a .docx/.txt master",
      engagementCount: 0,
      profileScore: 0,
      chars,
    };
  }
  if (
    /Uploaded master resume:|Extracted text unavailable|extraction failed/i.test(
      text
    )
  ) {
    return {
      ok: false,
      reason: "Master extract failed — replace with .docx or .txt",
      engagementCount: 0,
      profileScore: 0,
      chars,
    };
  }

  let profile = parseStoredMasterProfile(c.masterProfileJson);
  // Live parse if profile empty but text exists (legacy rows)
  if (!profile || profile.engagements.length === 0) {
    profile = parseMasterProfile(text);
  }

  const report = validateMasterProfile(profile);
  if (report.engagementCount < 1) {
    return {
      ok: false,
      reason:
        "No employers/engagements parsed — fix master format or re-upload",
      engagementCount: 0,
      profileScore: report.score,
      chars,
    };
  }

  return {
    ok: true,
    engagementCount: report.engagementCount,
    profileScore: report.score,
    chars,
  };
}
