/**
 * Granular generation steps for live UI status (green checks).
 */

export type StepStatus = "pending" | "active" | "done" | "error";

export type ProgressStepDef = {
  id: string;
  label: string;
};

/** Per-candidate resume build steps (shown with green checks as they complete) */
export const RESUME_BUILD_STEPS: ProgressStepDef[] = [
  { id: "parse_master", label: "Master resume loaded (contact, employers, dates)" },
  { id: "parse_jd", label: "Job requirement analyzed" },
  { id: "title", label: "Resume title updated from JD" },
  { id: "header", label: "Header contact applied from master" },
  { id: "summary", label: "Professional summary AI generated" },
  { id: "skills", label: "Technical skills section AI updated" },
  { id: "impact", label: "Impact / achievements AI updated" },
  { id: "projects_all", label: "All master projects locked in" },
  { id: "project_1", label: "Project 1 responsibilities AI updated" },
  { id: "project_2", label: "Project 2 responsibilities AI updated" },
  { id: "projects_rest", label: "Remaining projects AI tailored" },
  { id: "specialty", label: "JD specialty jargon woven (RAR / module keywords)" },
  { id: "layout", label: "Layout structure applied" },
  { id: "qa", label: "Quality checks passed" },
  { id: "rules", label: "Rules gate verified" },
  { id: "docx", label: "DOCX package rendered" },
  { id: "saved", label: "Resume saved for download" },
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

export function stepLabel(stepId: string): string {
  return RESUME_BUILD_STEPS.find((s) => s.id === stepId)?.label || stepId;
}
