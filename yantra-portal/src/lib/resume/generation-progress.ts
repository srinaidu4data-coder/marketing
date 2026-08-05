/**
 * Granular generation steps + engaging wait copy for live UI.
 */

export type StepStatus = "pending" | "active" | "done" | "error";

export type ProgressStepDef = {
  id: string;
  label: string;
  /** Short “waiting on…” line while this step is active */
  waitingOn?: string;
};

/** Primary path steps shown during generation (order = checklist) */
export const RESUME_BUILD_STEPS: ProgressStepDef[] = [
  {
    id: "parse_master",
    label: "Reading master resume (contact, employers, dates)",
    waitingOn: "Extracting name, email, and project timeline from the master…",
  },
  {
    id: "parse_jd",
    label: "Reading job description",
    waitingOn: "Picking role title, stack, and must-have keywords from the JD…",
  },
  {
    id: "resume-v2-precheck",
    label: "Prechecks (prompt + master + JD ready)",
    waitingOn: "Confirming ACTIVE prompt, master text, and JD are usable…",
  },
  {
    id: "resume-v2-prompt",
    label: "Loading Prompt Bible (system instructions)",
    waitingOn: "Loading your ACTIVE prompt — the only writing rules…",
  },
  {
    id: "resume-v2-llm",
    label: "AI writing full pack (header, summary ×12, skills, projects ×12)",
    waitingOn:
      "Model is drafting 12 summary bullets and 12 bullets per project with JD jargon…",
  },
  {
    id: "resume-v2-schema",
    label: "Checking exact 12×12 structure",
    waitingOn: "Counting bullets — every block must be exactly 12…",
  },
  {
    id: "resume-v2-repair",
    label: "Repairing structure / wording if needed",
    waitingOn: "Tightening wording and filling any missing bullets…",
  },
  {
    id: "resume-v2-score",
    label: "Scoring ATS & Psych",
    waitingOn: "Measuring keyword fit (ATS) and honesty/credibility (Psych)…",
  },
  {
    id: "resume-v2-regen",
    label: "Regenerating for higher ATS (if under 95)",
    waitingOn: "ATS under target — rewriting with stronger JD language…",
  },
  {
    id: "resume-v2-done",
    label: "Prompt-only pack ready",
    waitingOn: "Finalizing pack text…",
  },
  {
    id: "docx",
    label: "Building Word document",
    waitingOn: "Rendering DOCX layout…",
  },
  {
    id: "saved",
    label: "Saving resume for download",
    waitingOn: "Writing pack to your chain…",
  },
];

/** Legacy labels still resolved by stepLabel() if emitted */
const LEGACY_STEP_LABELS: Record<string, string> = {
  "resume-v2": "Prompt-only engine (Bible → LLM → 12×12 pack)",
  title: "Resume title updated from JD",
  header: "Header contact applied from master",
  summary: "Professional summary AI generated",
  skills: "Technical skills section AI updated",
  impact: "Impact / achievements AI updated",
  projects_all: "All master projects locked in",
  project_1: "Project 1 responsibilities AI updated",
  project_2: "Project 2 responsibilities AI updated",
  projects_rest: "Remaining projects AI tailored",
  specialty: "JD specialty jargon woven",
  layout: "Layout structure applied",
  qa: "Quality checks passed",
  rules: "Rules gate verified",
};

/** Rotating tips while a long LLM call is in flight */
export const ENGAGEMENT_TIPS: string[] = [
  "Shaping professional summary into exactly 12 high-impact bullets…",
  "Aligning job title language to the JD (without inventing employers)…",
  "Beefing tech skills with JD stack terms you can actually back up…",
  "Rewriting project bullets with stronger action verbs…",
  "Keeping employer names, locations, and dates exactly from the master…",
  "Packing recent roles with the tools the JD cares about most…",
  "Balancing buzzwords with clear delivery outcomes…",
  "Checking we still have one project block per master engagement…",
  "Polishing environment / tech-stack lines for scannability…",
  "Avoiding invented metrics — flavor yes, fake numbers no…",
  "Primacy pass: strongest JD proof first in summary and recent roles…",
  "Almost there — packaging a client-ready layout…",
];

export type ProgressEvent =
  | {
      type: "chain_start";
      chainId: string;
      candidateCount: number;
      candidateNames: string[];
    }
  | {
      type: "candidate_start";
      candidateId: string;
      candidateName: string;
      index: number;
      total: number;
    }
  | {
      type: "step";
      candidateId: string;
      candidateName: string;
      stepId: string;
      label: string;
      status: StepStatus;
      /** Optional extra engagement line */
      detail?: string;
    }
  | {
      type: "heartbeat";
      candidateId?: string;
      candidateName?: string;
      message: string;
      tipIndex?: number;
    }
  | {
      type: "candidate_done";
      candidateId: string;
      candidateName: string;
      ok: boolean;
      message?: string;
    }
  | {
      type: "chain_done";
      chainId: string;
      status: "READY" | "PARTIAL" | "FAILED";
      succeeded: number;
      failed: number;
      errors?: { name: string; message: string }[];
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "complete";
      id: string;
      status: "READY" | "FAILED" | string;
      succeeded?: number;
      failed?: number;
      errors?: { name: string; message: string }[];
    };

export type ProgressReporter = (event: ProgressEvent) => void | Promise<void>;

/** Snapshot persisted on Chain.progressJson for detail-page polling */
export type ChainProgressSnapshot = {
  updatedAt: string;
  phase: string;
  headline: string;
  detail: string;
  tip: string;
  tipIndex: number;
  candidateName?: string;
  candidateIndex?: number;
  candidateTotal?: number;
  steps: { id: string; label: string; status: StepStatus }[];
  doneCount: number;
  totalCount: number;
  pct: number;
  finished?: boolean;
  chainStatus?: string;
};

export function stepLabel(stepId: string): string {
  return (
    RESUME_BUILD_STEPS.find((s) => s.id === stepId)?.label ||
    LEGACY_STEP_LABELS[stepId] ||
    stepId
  );
}

export function stepWaitingOn(stepId: string): string {
  return (
    RESUME_BUILD_STEPS.find((s) => s.id === stepId)?.waitingOn ||
    stepLabel(stepId)
  );
}

export function engagementTip(index = 0): string {
  const i = Math.abs(index) % ENGAGEMENT_TIPS.length;
  return ENGAGEMENT_TIPS[i]!;
}

export function emptyProgressSteps(): ChainProgressSnapshot["steps"] {
  return RESUME_BUILD_STEPS.map((s) => ({
    id: s.id,
    label: s.label,
    status: "pending" as StepStatus,
  }));
}

export function applyEventToSnapshot(
  prev: ChainProgressSnapshot | null,
  ev: ProgressEvent
): ChainProgressSnapshot {
  const base: ChainProgressSnapshot = prev || {
    updatedAt: new Date().toISOString(),
    phase: "starting",
    headline: "Starting generation…",
    detail: "Warming up the prompt-only engine.",
    tip: engagementTip(0),
    tipIndex: 0,
    steps: emptyProgressSteps(),
    doneCount: 0,
    totalCount: RESUME_BUILD_STEPS.length,
    pct: 0,
  };

  const next: ChainProgressSnapshot = {
    ...base,
    updatedAt: new Date().toISOString(),
    steps: base.steps.map((s) => ({ ...s })),
  };

  if (ev.type === "chain_start") {
    next.phase = "chain_start";
    next.headline = `Generating for ${ev.candidateCount} candidate${ev.candidateCount === 1 ? "" : "s"}`;
    next.detail = `Queued: ${ev.candidateNames.slice(0, 4).join(", ")}${ev.candidateNames.length > 4 ? "…" : ""}`;
    next.candidateTotal = ev.candidateCount;
    next.tip = engagementTip(0);
    next.tipIndex = 0;
    next.steps = emptyProgressSteps();
    next.finished = false;
  } else if (ev.type === "candidate_start") {
    next.phase = "candidate";
    next.candidateName = ev.candidateName;
    next.candidateIndex = ev.index;
    next.candidateTotal = ev.total;
    next.headline = `Building resume for ${ev.candidateName}`;
    next.detail = `Candidate ${(ev.index ?? 0) + 1} of ${ev.total}`;
    next.steps = emptyProgressSteps();
    next.tip = engagementTip(ev.index + 1);
    next.tipIndex = ev.index + 1;
  } else if (ev.type === "step") {
    next.phase = ev.stepId;
    const idx = next.steps.findIndex((s) => s.id === ev.stepId);
    if (idx >= 0) {
      next.steps[idx] = {
        ...next.steps[idx]!,
        label: ev.label || next.steps[idx]!.label,
        status: ev.status,
      };
      // Mark earlier steps done when a later one goes active
      if (ev.status === "active") {
        for (let i = 0; i < idx; i++) {
          if (next.steps[i]!.status === "pending") {
            next.steps[i] = { ...next.steps[i]!, status: "done" };
          }
        }
      }
    } else {
      next.steps.push({
        id: ev.stepId,
        label: ev.label || stepLabel(ev.stepId),
        status: ev.status,
      });
    }
    if (ev.status === "active") {
      next.headline = ev.label || stepLabel(ev.stepId);
      next.detail =
        ev.detail ||
        stepWaitingOn(ev.stepId) ||
        "Working on this step…";
    } else if (ev.status === "done") {
      next.detail = `Finished: ${ev.label || stepLabel(ev.stepId)}`;
    } else if (ev.status === "error") {
      next.headline = `Issue: ${ev.label || stepLabel(ev.stepId)}`;
      next.detail = ev.detail || "This step hit an error.";
    }
  } else if (ev.type === "heartbeat") {
    next.phase = "heartbeat";
    next.detail = ev.message;
    if (typeof ev.tipIndex === "number") {
      next.tipIndex = ev.tipIndex;
      next.tip = engagementTip(ev.tipIndex);
    } else {
      next.tipIndex = (next.tipIndex + 1) % ENGAGEMENT_TIPS.length;
      next.tip = engagementTip(next.tipIndex);
    }
    if (ev.candidateName) next.candidateName = ev.candidateName;
  } else if (ev.type === "candidate_done") {
    next.phase = "candidate_done";
    next.headline = ev.ok
      ? `Pack ready for ${ev.candidateName}`
      : `Could not finish ${ev.candidateName}`;
    next.detail = ev.message || (ev.ok ? "Moving on…" : "See error details.");
    if (ev.ok) {
      next.steps = next.steps.map((s) =>
        s.status === "pending" || s.status === "active"
          ? { ...s, status: "done" as StepStatus }
          : s
      );
    }
  } else if (ev.type === "chain_done" || ev.type === "complete") {
    next.phase = "done";
    next.finished = true;
    next.chainStatus =
      ev.type === "chain_done" ? ev.status : String(ev.status || "");
    next.headline =
      next.chainStatus === "READY"
        ? "All set — resumes are ready"
        : next.chainStatus === "PARTIAL"
          ? "Partial complete — some packs ready"
          : "Generation finished";
    next.detail =
      ev.type === "chain_done"
        ? `${ev.succeeded} succeeded · ${ev.failed} failed`
        : "Refreshing…";
  } else if (ev.type === "error") {
    next.phase = "error";
    next.headline = "Generation error";
    next.detail = ev.message;
  }

  next.doneCount = next.steps.filter((s) => s.status === "done").length;
  next.totalCount = next.steps.length || RESUME_BUILD_STEPS.length;
  next.pct = next.totalCount
    ? Math.min(99, Math.round((next.doneCount / next.totalCount) * 100))
    : 0;
  if (next.finished) next.pct = 100;

  return next;
}

export function parseProgressJson(
  raw: string | null | undefined
): ChainProgressSnapshot | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as ChainProgressSnapshot;
  } catch {
    return null;
  }
}
