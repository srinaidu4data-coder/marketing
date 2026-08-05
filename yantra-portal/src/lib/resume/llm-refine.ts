/**
 * Optional LLM refinement when an active LLM key is configured.
 * Without a key, progressive tailor alone is used (deterministic).
 *
 * Goal: convert master project titles + bullets toward JD match
 * while keeping employer names and dates.
 */

import type { ProjectBlock } from "./progressive-tailor";
import type { StructuredResume } from "./templates";
import { getActiveLlmConfig } from "@/lib/system-settings";
import { llmChatJson } from "./llm-chat";

export type LlmRefineInput = {
  jobTitle: string;
  jd: string;
  projects: ProjectBlock[];
};

export type LlmRefineResult = {
  usedLlm: boolean;
  projects: ProjectBlock[];
  error?: string;
};

/**
 * Ask the model to rewrite recent/mid project titles + bullets toward the JD,
 * while keeping employer names, dates, and progressive honesty (early roles lighter).
 */
export async function refineProjectsWithLlm(
  input: LlmRefineInput
): Promise<LlmRefineResult> {
  const cfg = await getActiveLlmConfig();
  if (!cfg.configured) {
    return { usedLlm: false, projects: input.projects };
  }

  const compact = input.projects.map((p, i) => ({
    i,
    era: p.era,
    client: p.client,
    location: p.location,
    startYear: p.startYear,
    endYear: p.endYear,
    title: p.title,
    bullets: p.bullets.slice(0, 12),
  }));

  const system = `You are Role Forge resume tailor for SAP C2C staffing.
Convert the master resume projects so they MATCH the job description at project level.
Rules:
- Keep employer/client names, locations, and dates EXACTLY as given (do not invent employers).
- EVERY recent and mid project title MUST equal or closely mirror jobTitle (e.g. "SAP ABAP Consultant – Leasing / RAR").
- Early project titles: junior/associate form of jobTitle (no lead ownership claim).
- Recent bullets: dense JD match — include RAR, IFRS 15, ASC 606, FI-LA, leasing, performance obligations, ABAP, BRF+, OData, Fiori when the JD mentions them.
- Mid bullets: partial JD skills with progressive ownership.
- Early bullets: foundational SAP work only; light exposure language for specialized tools.
- No rates, interview questions, staffing chatter, or "JD MATCH" labels.
- Return ONLY valid JSON: {"projects":[{"i":0,"title":"...","bullets":["..."]}]}
- Provide 8–12 bullets for EVERY project (min 8, preferred 10, max 12) — all eras; rephrase master only, never invent.`;

  const user = JSON.stringify({
    jobTitle: input.jobTitle,
    jd: input.jd.slice(0, 7000),
    projects: compact,
  });

  try {
    const chat = await llmChatJson({
      system,
      user,
      temperature: 0.25,
      config: cfg,
    });
    const parsed = chat.json as {
      projects?: { i: number; title?: string; bullets?: string[] }[];
    };
    if (!parsed.projects?.length) {
      return { usedLlm: false, projects: input.projects, error: "empty LLM projects" };
    }

    const byIndex = new Map(parsed.projects.map((p) => [p.i, p]));
    const next = input.projects.map((p, i) => {
      const patch = byIndex.get(i);
      if (!patch) return p;
      const title = (patch.title || p.title).trim().slice(0, 120);
      const forcedTitle =
        p.era === "recent" || p.era === "mid"
          ? input.jobTitle || title
          : title;
      return {
        ...p,
        title: forcedTitle,
        bullets:
          Array.isArray(patch.bullets) && patch.bullets.length
            ? patch.bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 24)
            : p.bullets,
      };
    });
    return { usedLlm: true, projects: next };
  } catch (e) {
    return {
      usedLlm: false,
      projects: input.projects,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export type StructuredLlmInput = {
  structured: StructuredResume;
  jobTitle: string;
  jd: string;
};

/**
 * Fallback: rewrite experience lines in an already-built StructuredResume
 * when project blocks are not available to the caller.
 */
export async function refineStructuredExperienceWithLlm(
  input: StructuredLlmInput
): Promise<{
  usedLlm: boolean;
  structured: StructuredResume;
  text?: string;
  error?: string;
}> {
  const cfg = await getActiveLlmConfig();
  if (!cfg.configured) {
    return { usedLlm: false, structured: input.structured };
  }

  const expIdx = input.structured.sections.findIndex((s) =>
    /experience|engagement|deep-dive|leadership|case|chapter|portfolio/i.test(
      s.heading
    )
  );
  if (expIdx < 0) {
    return {
      usedLlm: false,
      structured: input.structured,
      error: "no experience section",
    };
  }

  // Keep legacy path simple: no heavy re-parse; rely on project refine when available
  return { usedLlm: false, structured: input.structured, error: "structured refine uses project path" };
}
