/**
 * Fixed engine sequences for Admin → Prompt → Test Mode comparison tabs.
 * Kept outside "use server" so the client can import labels safely.
 */

import type { ResumeEngineId } from "@/lib/system-settings";

export const PROMPT_TEST_SEQUENCES: {
  id: string;
  label: string;
  shortLabel: string;
  sequence: ResumeEngineId[];
}[] = [
  {
    id: "ai-then-rules",
    label: "ai-tailor → progressive-rules",
    shortLabel: "AI → Rules",
    sequence: ["ai-tailor", "progressive-rules"],
  },
  {
    id: "rules-then-ai",
    label: "progressive-rules → ai-tailor",
    shortLabel: "Rules → AI",
    sequence: ["progressive-rules", "ai-tailor"],
  },
  {
    id: "rules-only",
    label: "progressive-rules",
    shortLabel: "Rules only",
    sequence: ["progressive-rules"],
  },
  {
    id: "ai-only",
    label: "ai-tailor",
    shortLabel: "AI only",
    sequence: ["ai-tailor"],
  },
];
