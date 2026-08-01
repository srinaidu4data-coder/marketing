/**
 * Optional LLM refinement when OPENAI_API_KEY (or compatible) is set.
 * Without a key, progressive tailor alone is used (deterministic).
 *
 * Goal: convert master project titles + bullets toward 100% JD match
 * (e.g. RAR / leasing / ABAP) while keeping employer names and dates.
 */

import type { ProjectBlock } from "./progressive-tailor";
import type { StructuredResume } from "./templates";

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

function isUsableApiKey(key: string): boolean {
  const k = key.trim();
  // Reject empty / placeholder keys (local stubs often length < 20)
  if (k.length < 20) return false;
  if (/^(test|dummy|placeholder|xxx|your[-_]?key)/i.test(k)) return false;
  return true;
}

/**
 * Ask the model to rewrite recent/mid project titles + bullets toward the JD,
 * while keeping employer names, dates, and progressive honesty (early roles lighter).
 */
export async function refineProjectsWithLlm(
  input: LlmRefineInput
): Promise<LlmRefineResult> {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!isUsableApiKey(apiKey)) {
    return { usedLlm: false, projects: input.projects };
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
    /\/$/,
    ""
  );
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const compact = input.projects.map((p, i) => ({
    i,
    era: p.era,
    client: p.client,
    location: p.location,
    startYear: p.startYear,
    endYear: p.endYear,
    title: p.title,
    bullets: p.bullets.slice(0, 14),
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
- Provide 12–20 bullets for recent, 10–16 for mid, 8–12 for early.`;

  const user = JSON.stringify({
    jobTitle: input.jobTitle,
    jd: input.jd.slice(0, 7000),
    projects: compact,
  });

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      const t = await res.text();
      return {
        usedLlm: false,
        projects: input.projects,
        error: `LLM HTTP ${res.status}: ${t.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content) as {
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
      // Force JD title on recent/mid even if model softens it
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
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!isUsableApiKey(apiKey)) {
    return { usedLlm: false, structured: input.structured };
  }

  // Extract project-like blocks from experience sections
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

  const lines = input.structured.sections[expIdx].lines;
  // Build pseudo-projects from title + Employer/Client blocks
  type Draft = {
    title: string;
    client?: string;
    location?: string;
    startYear?: number;
    endYear?: number | "Present";
    era?: ProjectBlock["era"];
    bullets: string[];
  };
  const projects: ProjectBlock[] = [];
  let cur: Draft | null = null;

  const flush = (draft: Draft | null) => {
    if (!draft?.title || !draft.client) return;
    projects.push({
      title: draft.title,
      client: draft.client,
      // Never invent country/year — blank/0 until parsed from master lines
      location: (draft.location || "").trim(),
      startYear:
        draft.startYear && draft.startYear >= 1980 ? draft.startYear : 0,
      endYear: draft.endYear || "Present",
      era: draft.era || "recent",
      skills: [],
      bullets: draft.bullets || [],
    });
  };

  for (const line of lines) {
    const emp = line.match(/^Employer\s*\/\s*Client:\s*(.+)$/i);
    if (emp) {
      const prevTitle: string =
        (cur && cur.title) || input.jobTitle || "Consultant";
      // If prior draft already had a client, flush it first
      if (cur && cur.client) flush(cur);
      cur = {
        title: prevTitle,
        client: emp[1].trim(),
        bullets: [],
        era: "recent",
      };
      continue;
    }
    if (!cur) {
      if (line && !/^[•▸→–\-\*]/.test(line) && line.length < 120) {
        cur = {
          title: line.replace(/^\[.*?\]\s*/, "").trim(),
          bullets: [],
          era: "recent",
        };
      }
      continue;
    }
    const dateLoc = line.match(
      /^(.+?)\s*\|\s*(\d{4})\s*[–—\-]\s*(\d{4}|Present)/i
    );
    if (dateLoc) {
      cur.location = dateLoc[1].trim();
      cur.startYear = Number(dateLoc[2]);
      cur.endYear = /present/i.test(dateLoc[3])
        ? "Present"
        : Number(dateLoc[3]);
      const endY =
        cur.endYear === "Present"
          ? new Date().getFullYear()
          : (cur.endYear as number);
      const now = new Date().getFullYear();
      cur.era =
        endY >= now - 3 ? "recent" : endY >= now - 8 ? "mid" : "early";
      continue;
    }
    if (/^(Environment|Stack|Modules|Program stack|Chapter stack)/i.test(line)) {
      continue;
    }
    if (/^[•▸→–\-\*]/.test(line) || line.length > 40) {
      cur.bullets.push(line.replace(/^[•▸→–\-\*]\s*/, "").trim());
    } else if (line && !cur.client && line.length < 100) {
      cur.title = line.replace(/^\[.*?\]\s*/, "").trim();
    }
  }
  flush(cur);

  if (!projects.length) {
    return {
      usedLlm: false,
      structured: input.structured,
      error: "could not parse projects from structured",
    };
  }

  const refined = await refineProjectsWithLlm({
    jobTitle: input.jobTitle,
    jd: input.jd,
    projects,
  });
  if (!refined.usedLlm) {
    return {
      usedLlm: false,
      structured: input.structured,
      error: refined.error,
    };
  }

  // Rebuild experience lines from refined projects (no invented loc/years)
  const nextLines: string[] = [];
  for (const p of refined.projects) {
    nextLines.push(p.title);
    nextLines.push(`Employer / Client: ${p.client}`);
    const end = p.endYear === "Present" ? "Present" : String(p.endYear);
    const loc = (p.location || "").trim();
    const hasYears = p.startYear >= 1980;
    const datePart = hasYears ? `${p.startYear} – ${end}` : "";
    if (loc && datePart) nextLines.push(`${loc}  |  ${datePart}`);
    else if (loc) nextLines.push(loc);
    else if (datePart) nextLines.push(datePart);
    nextLines.push("");
    for (const b of p.bullets) nextLines.push(`• ${b}`);
    nextLines.push("");
    nextLines.push("");
  }

  const sections = input.structured.sections.map((s, i) =>
    i === expIdx ? { ...s, lines: nextLines } : s
  );
  const structured = { ...input.structured, sections };
  // Also force headline to job title
  if (input.jobTitle) structured.headline = input.jobTitle;

  return { usedLlm: true, structured };
}
