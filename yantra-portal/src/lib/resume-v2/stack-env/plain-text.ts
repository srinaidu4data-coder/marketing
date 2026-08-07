/**
 * Apply StackEnv engine to stored plain-text packs (download / preview / email).
 * Parses Tech Stack + Environment lines per employer block, diversifies, rewrites.
 * This is the last line of defense before the user sees a pack.
 */

import type { ResumePackV2 } from "../pack-schema";
import { DEFAULT_STACK_ENV_BANK } from "./default-bank";
import { runStackEnvEngine } from "./engine";
import type { StackEnvBankDoc, StackEnvReport } from "./types";

const STACK_LINE =
  /^(Tech\s*Stack|Stack|Modules|Program\s*stack|Chapter\s*stack|Engagement\s*stack)\s*:\s*(.*)$/i;
const ENV_LINE =
  /^(Environment(?:\s*\/\s*tools(?:\s+in\s+period)?)?|Tools(?:\s+in\s+period)?)\s*:\s*(.*)$/i;
const EMPLOYER_LINE = /^Employer\s*\/\s*Client\s*:\s*(.*)$/i;
const DURATION_HINT =
  /(19|20)\d{2}\s*[-–—]\s*((19|20)\d{2}|[Pp]resent|[Cc]urrent)/;

export type PlainTextStackEnvResult = {
  text: string;
  changed: boolean;
  report: StackEnvReport | null;
  projectCount: number;
};

function normKey(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when ≥2 projects share nearly identical stack|env signatures. */
export function plainTextHasCloneStacks(text: string): boolean {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const sigs: string[] = [];
  let stack = "";
  let env = "";
  let sawEmployer = false;
  const flush = () => {
    if (sawEmployer && (stack || env)) {
      sigs.push(`${normKey(stack)}|${normKey(env)}`);
    }
    stack = "";
    env = "";
    sawEmployer = false;
  };
  for (const line of lines) {
    const t = line.trim();
    if (EMPLOYER_LINE.test(t)) {
      flush();
      sawEmployer = true;
      continue;
    }
    const sm = t.match(STACK_LINE);
    if (sm) {
      stack = (sm[2] || "").trim();
      continue;
    }
    const em = t.match(ENV_LINE);
    if (em) {
      env = (em[2] || "").trim();
      continue;
    }
  }
  flush();
  if (sigs.length < 2) return false;
  const uniq = new Set(sigs.filter(Boolean));
  if (uniq.size === 1) return true;
  // Near-clone: majority share same signature
  const counts = new Map<string, number>();
  for (const s of sigs) counts.set(s, (counts.get(s) || 0) + 1);
  let max = 0;
  for (const n of Array.from(counts.values())) max = Math.max(max, n);
  return max >= Math.ceil(sigs.length * 0.6) && sigs.length >= 3;
}

type Block = {
  startLine: number;
  endLine: number;
  employer: string;
  duration: string;
  role: string;
  stackLineIdx: number | null;
  envLineIdx: number | null;
  stack: string;
  env: string;
};

/**
 * Parse employer blocks and stack/env line indices from resume plain text.
 */
export function parseStackEnvBlocks(text: string): {
  lines: string[];
  blocks: Block[];
} {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let cur: Block | null = null;

  const push = () => {
    if (cur) {
      cur.endLine = Math.max(cur.startLine, cur.endLine);
      blocks.push(cur);
      cur = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim();
    const emp = t.match(EMPLOYER_LINE);
    if (emp) {
      push();
      // Role is usually previous non-empty line
      let role = "";
      for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
        const prev = lines[j]!.trim();
        if (
          prev &&
          !EMPLOYER_LINE.test(prev) &&
          !STACK_LINE.test(prev) &&
          !ENV_LINE.test(prev) &&
          !DURATION_HINT.test(prev) &&
          !/^PROFESSIONAL/i.test(prev)
        ) {
          role = prev;
          break;
        }
      }
      cur = {
        startLine: i,
        endLine: i,
        employer: (emp[1] || "").trim(),
        duration: "",
        role,
        stackLineIdx: null,
        envLineIdx: null,
        stack: "",
        env: "",
      };
      continue;
    }
    if (!cur) continue;
    cur.endLine = i;
    if (DURATION_HINT.test(t) && !cur.duration) {
      cur.duration = t;
      continue;
    }
    const sm = t.match(STACK_LINE);
    if (sm) {
      cur.stackLineIdx = i;
      cur.stack = (sm[2] || "").trim();
      continue;
    }
    const emLine = t.match(ENV_LINE);
    if (emLine) {
      cur.envLineIdx = i;
      cur.env = (emLine[2] || "").trim();
      continue;
    }
    // Next major section ends block
    if (
      /^(EDUCATION|CERTIFICATIONS|TECHNICAL SKILLS|CORE COMPETENCIES)\b/i.test(t)
    ) {
      cur.endLine = i - 1;
      push();
    }
  }
  push();
  return { lines, blocks };
}

/**
 * Diversify Tech Stack / Environment lines in plain pack text.
 * Safe no-op when fewer than 1 employer block.
 */
export function applyStackEnvToPlainText(
  text: string,
  opts?: {
    jd?: string;
    masterText?: string;
    bank?: StackEnvBankDoc;
    /** Always run engine even if signatures already unique */
    force?: boolean;
  }
): PlainTextStackEnvResult {
  const raw = text || "";
  if (raw.trim().length < 80) {
    return {
      text: raw,
      changed: false,
      report: null,
      projectCount: 0,
    };
  }

  const { lines, blocks } = parseStackEnvBlocks(raw);
  if (!blocks.length) {
    return {
      text: raw,
      changed: false,
      report: null,
      projectCount: 0,
    };
  }

  if (!opts?.force && blocks.length >= 2 && !plainTextHasCloneStacks(raw)) {
    // Still run engine when any block missing stack/env or stack===env
    const thin = blocks.some(
      (b) =>
        !b.stack ||
        !b.env ||
        normKey(b.stack) === normKey(b.env) ||
        b.stack.split(/[,;]/).filter(Boolean).length < 3
    );
    if (!thin) {
      // Quick jaccard-ish: if all unique and non-empty, skip
      const sigs = new Set(
        blocks.map((b) => `${normKey(b.stack)}|${normKey(b.env)}`)
      );
      if (sigs.size === blocks.length) {
        return {
          text: raw,
          changed: false,
          report: null,
          projectCount: blocks.length,
        };
      }
    }
  }

  const pack: ResumePackV2 = {
    header: {
      name: "",
      jobTitle: "",
      email: "",
      phone: "",
      location: "",
      linkedin: "",
    },
    professionalSummary: { bullets: [] },
    techSkills: "",
    education: [],
    certifications: [],
    projects: blocks.map((b) => ({
      role: b.role || "Consultant",
      employerOrClient: b.employer || "Client",
      location: "",
      duration: b.duration,
      techStack: b.stack,
      environment: b.env,
      bullets: ["x", "x", "x", "x", "x", "x", "x", "x"],
    })),
  };

  const eng = runStackEnvEngine(pack, {
    jd: opts?.jd,
    masterText: opts?.masterText,
    bank: opts?.bank || DEFAULT_STACK_ENV_BANK,
  });

  const next = [...lines];
  let changed = false;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const p = eng.pack.projects[i]!;
    if (!p) continue;
    const stackBody = p.techStack || "";
    const envBody = p.environment || "";

    if (b.stackLineIdx != null) {
      const label =
        next[b.stackLineIdx]!.match(STACK_LINE)?.[1]?.trim() || "Tech Stack";
      const newLine = `${label}: ${stackBody}`;
      if (next[b.stackLineIdx] !== newLine) {
        next[b.stackLineIdx] = newLine;
        changed = true;
      }
    } else if (stackBody) {
      // Insert after duration or employer
      let insertAt = b.startLine + 1;
      for (let j = b.startLine; j <= b.endLine && j < next.length; j++) {
        if (DURATION_HINT.test(next[j]!.trim())) {
          insertAt = j + 1;
          break;
        }
      }
      next.splice(insertAt, 0, `Tech Stack: ${stackBody}`);
      // shift later indices
      for (let k = i + 1; k < blocks.length; k++) {
        const bk = blocks[k]!;
        if (bk.stackLineIdx != null && bk.stackLineIdx >= insertAt)
          bk.stackLineIdx++;
        if (bk.envLineIdx != null && bk.envLineIdx >= insertAt) bk.envLineIdx++;
        if (bk.startLine >= insertAt) bk.startLine++;
        if (bk.endLine >= insertAt) bk.endLine++;
      }
      b.stackLineIdx = insertAt;
      changed = true;
    }

    if (b.envLineIdx != null) {
      const label =
        next[b.envLineIdx]!.match(ENV_LINE)?.[1]?.trim() || "Environment";
      const newLine = `${label}: ${envBody}`;
      if (next[b.envLineIdx] !== newLine) {
        next[b.envLineIdx] = newLine;
        changed = true;
      }
    } else if (envBody) {
      let insertAt =
        b.stackLineIdx != null ? b.stackLineIdx + 1 : b.startLine + 2;
      next.splice(insertAt, 0, `Environment: ${envBody}`);
      for (let k = i + 1; k < blocks.length; k++) {
        const bk = blocks[k]!;
        if (bk.stackLineIdx != null && bk.stackLineIdx >= insertAt)
          bk.stackLineIdx++;
        if (bk.envLineIdx != null && bk.envLineIdx >= insertAt) bk.envLineIdx++;
        if (bk.startLine >= insertAt) bk.startLine++;
        if (bk.endLine >= insertAt) bk.endLine++;
      }
      b.envLineIdx = insertAt;
      changed = true;
    }
  }

  return {
    text: next.join("\n"),
    changed,
    report: eng.report,
    projectCount: blocks.length,
  };
}
