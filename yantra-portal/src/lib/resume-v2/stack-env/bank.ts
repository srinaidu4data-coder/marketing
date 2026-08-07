/**
 * Stack/Env bank persistence — SystemSetting, same pattern as bullet bank.
 * Admin can bulk-edit catalogs; runtime always merges with code defaults.
 * Prisma is loaded lazily so pure engine/smoke tests do not need DATABASE_URL.
 */

import { DEFAULT_STACK_ENV_BANK, bankStats } from "./default-bank";
import type {
  BankKind,
  CatalogEntry,
  EraRecipe,
  StackEnvBankDoc,
} from "./types";

export const STACK_ENV_BANK_SETTING_KEY = "stack_env_tool_bank";

const KINDS: BankKind[] = [
  "tool",
  "platform",
  "process",
  "compliance",
  "regulation",
];

function normKey(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Merge admin override with defaults; first-kind wins on collisions. */
export function mergeBankDocs(
  base: StackEnvBankDoc,
  override: Partial<StackEnvBankDoc> | null | undefined
): StackEnvBankDoc {
  if (!override) return base;
  const seen = new Map<string, BankKind>();
  const catalog: CatalogEntry[] = [];

  const pushAll = (list: CatalogEntry[]) => {
    for (const e of list) {
      if (!e?.term?.trim() || !KINDS.includes(e.kind)) continue;
      const k = normKey(e.term);
      if (!k || seen.has(k)) continue;
      seen.set(k, e.kind);
      for (const a of e.aliases || []) {
        const ak = normKey(a);
        if (ak && !seen.has(ak)) seen.set(ak, e.kind);
      }
      catalog.push({
        term: e.term.trim(),
        kind: e.kind,
        aliases: e.aliases?.map((x) => x.trim()).filter(Boolean),
        eraMin: e.eraMin,
        eraMax: e.eraMax,
        timeless: e.timeless === true ? true : undefined,
      });
    }
  };

  // Override catalog first so admin edits win
  if (Array.isArray(override.catalog) && override.catalog.length) {
    pushAll(override.catalog);
  }
  pushAll(base.catalog);

  const recipes =
    Array.isArray(override.recipes) && override.recipes.length >= 4
      ? (override.recipes as EraRecipe[])
      : base.recipes;

  return { version: 1, catalog, recipes };
}

/**
 * Parse one bank line with optional year metadata.
 *
 * Formats (pipe-separated, order flexible after term):
 *   SQL
 *   SQL | timeless
 *   FastAPI | 2018+
 *   FastAPI | 2018-
 *   ECC | 2004-2027
 *   S/4HANA | 2015+ | aliases: S4HANA, S4
 *   Kubernetes | years:2015- | aliases: K8s
 *   Agile | @timeless
 *   Snowflake | @2015+
 */
export function parseCatalogLine(
  line: string,
  kind: BankKind
): CatalogEntry | null {
  let t = (line || "").replace(/^[-•*\d.)\s]+/, "").trim();
  if (!t || t.length < 2) return null;

  // Strip trailing comments
  t = t.replace(/\s+#.*$/, "").trim();

  let eraMin: number | undefined;
  let eraMax: number | undefined;
  let timeless = false;
  let aliases: string[] | undefined;

  // Support "Term @2015+" or "Term @timeless" suffix
  const atM = t.match(/^(.*?)\s+@(timeless|any|(\d{4})\s*[-–+]?\s*(\d{4})?)\s*$/i);
  if (atM) {
    t = atM[1]!.trim();
    const tag = atM[2]!.toLowerCase();
    if (tag === "timeless" || tag === "any") {
      timeless = true;
    } else if (atM[3]) {
      eraMin = Number(atM[3]);
      if (atM[4]) eraMax = Number(atM[4]);
    }
  }

  const parts = t.split("|").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const term = parts[0]!;
  if (term.length < 2 || term.length > 80) return null;

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i]!;
    const pl = p.toLowerCase();

    if (
      pl === "timeless" ||
      pl === "any" ||
      pl === "era:any" ||
      pl === "years:any" ||
      pl === "years:timeless"
    ) {
      timeless = true;
      continue;
    }

    // years:2015-2020 or years:2015+ or 2015-2020 or 2015+
    const yLabel = p.replace(/^(years?|era)\s*:\s*/i, "").trim();
    const yRange = yLabel.match(
      /^(\d{4})\s*[-–]\s*(\d{4})$/
    );
    const yFrom = yLabel.match(/^(\d{4})\s*[-–+]\s*$/);
    const yPlus = yLabel.match(/^(\d{4})\s*\+\s*$/);
    const yOnly = yLabel.match(/^(\d{4})$/);
    if (yRange) {
      eraMin = Number(yRange[1]);
      eraMax = Number(yRange[2]);
      continue;
    }
    if (yFrom || yPlus) {
      eraMin = Number((yFrom || yPlus)![1]);
      continue;
    }
    if (yOnly && /^(years?|era)\s*:/i.test(p)) {
      eraMin = Number(yOnly[1]);
      continue;
    }
    // bare 2015+ in a pipe segment
    if (/^\d{4}\s*[-–+]\s*$/.test(p) || /^\d{4}\s*\+\s*$/.test(p)) {
      eraMin = Number(p.match(/(\d{4})/)![1]);
      continue;
    }
    if (/^\d{4}\s*[-–]\s*\d{4}$/.test(p)) {
      const m = p.match(/(\d{4})\s*[-–]\s*(\d{4})/)!;
      eraMin = Number(m[1]);
      eraMax = Number(m[2]);
      continue;
    }

    // aliases: a, b  OR  just comma list if looks like aliases
    if (/^aliases?\s*:/i.test(p)) {
      aliases = p
        .replace(/^aliases?\s*:\s*/i, "")
        .split(/[,;]/)
        .map((a) => a.trim())
        .filter((a) => a.length >= 1 && a.length <= 48);
      continue;
    }
  }

  // Sanity on years
  if (eraMin != null && (eraMin < 1970 || eraMin > 2100)) eraMin = undefined;
  if (eraMax != null && (eraMax < 1970 || eraMax > 2100)) eraMax = undefined;
  if (eraMin != null && eraMax != null && eraMax < eraMin) {
    const tmp = eraMin;
    eraMin = eraMax;
    eraMax = tmp;
  }

  return {
    term,
    kind,
    ...(aliases?.length ? { aliases } : {}),
    ...(eraMin != null ? { eraMin } : {}),
    ...(eraMax != null ? { eraMax } : {}),
    ...(timeless ? { timeless: true } : {}),
  };
}

/** Serialize one catalog entry to sectioned line with years. */
export function formatCatalogLine(e: CatalogEntry): string {
  const bits: string[] = [e.term];
  if (e.timeless) {
    bits.push("timeless");
  } else if (e.eraMin != null || e.eraMax != null) {
    if (e.eraMin != null && e.eraMax != null) {
      bits.push(`${e.eraMin}-${e.eraMax}`);
    } else if (e.eraMin != null) {
      bits.push(`${e.eraMin}+`);
    } else if (e.eraMax != null) {
      bits.push(`-${e.eraMax}`);
    }
  }
  if (e.aliases?.length) {
    bits.push(`aliases: ${e.aliases.join(", ")}`);
  }
  return bits.join(" | ");
}

/**
 * Parse admin payload:
 * - Full JSON StackEnvBankDoc (catalog entries may include eraMin/eraMax/timeless)
 * - Or sectioned text with optional years per line
 */
export function parseStackEnvBank(
  raw: string | null | undefined
): StackEnvBankDoc {
  if (!raw?.trim()) return { ...DEFAULT_STACK_ENV_BANK };

  try {
    const j = JSON.parse(raw) as Partial<StackEnvBankDoc> & {
      tools?: string[];
      platforms?: string[];
      processes?: string[];
      compliance?: string[];
      regulations?: string[];
    };
    if (j && (Array.isArray(j.catalog) || j.tools || j.platforms)) {
      let catalog: CatalogEntry[] = Array.isArray(j.catalog)
        ? j.catalog.map((e) => ({
            term: String(e.term || "").trim(),
            kind: e.kind,
            aliases: e.aliases,
            eraMin:
              typeof e.eraMin === "number"
                ? e.eraMin
                : e.eraMin != null
                  ? Number(e.eraMin)
                  : undefined,
            eraMax:
              typeof e.eraMax === "number"
                ? e.eraMax
                : e.eraMax != null
                  ? Number(e.eraMax)
                  : undefined,
            timeless: e.timeless === true ? true : undefined,
          }))
        : [];
      const fromLines = (
        lines: string[] | undefined,
        kind: BankKind
      ): CatalogEntry[] =>
        (lines || [])
          .map((t) => parseCatalogLine(String(t || ""), kind))
          .filter((e): e is CatalogEntry => !!e);

      if (!catalog.length) {
        catalog = [
          ...fromLines(j.tools, "tool"),
          ...fromLines(j.platforms, "platform"),
          ...fromLines(j.processes, "process"),
          ...fromLines(j.compliance, "compliance"),
          ...fromLines(j.regulations, "regulation"),
        ];
      }
      catalog = catalog.filter((e) => e.term && KINDS.includes(e.kind));
      if (catalog.length >= 20) {
        return mergeBankDocs(DEFAULT_STACK_ENV_BANK, {
          version: 1,
          catalog,
          recipes: j.recipes,
        });
      }
    }
  } catch {
    /* sectioned text */
  }

  // Sectioned plain text
  const sections: Record<string, CatalogEntry[]> = {
    tools: [],
    platforms: [],
    processes: [],
    compliance: [],
    regulations: [],
  };
  let cur: keyof typeof sections | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("//")) continue;
    const sec = t.match(
      /^\[(tools?|platforms?|processes?|compliance|regulations?)\]$/i
    );
    if (sec) {
      const name = sec[1]!.toLowerCase();
      if (name.startsWith("tool")) cur = "tools";
      else if (name.startsWith("platform")) cur = "platforms";
      else if (name.startsWith("process")) cur = "processes";
      else if (name.startsWith("compliance")) cur = "compliance";
      else cur = "regulations";
      continue;
    }
    if (!cur) continue;
    const kind: BankKind =
      cur === "tools"
        ? "tool"
        : cur === "platforms"
          ? "platform"
          : cur === "processes"
            ? "process"
            : cur === "compliance"
              ? "compliance"
              : "regulation";
    const entry = parseCatalogLine(t, kind);
    if (entry) sections[cur].push(entry);
  }

  const catalog: CatalogEntry[] = [
    ...sections.tools,
    ...sections.platforms,
    ...sections.processes,
    ...sections.compliance,
    ...sections.regulations,
  ];

  if (catalog.length >= 20) {
    return mergeBankDocs(DEFAULT_STACK_ENV_BANK, { version: 1, catalog });
  }
  return { ...DEFAULT_STACK_ENV_BANK };
}

/** Human-editable sectioned export with year metadata. */
export function serializeStackEnvBankSectioned(doc: StackEnvBankDoc): string {
  const by: Record<BankKind, string[]> = {
    tool: [],
    platform: [],
    process: [],
    compliance: [],
    regulation: [],
  };
  for (const e of doc.catalog) {
    by[e.kind].push(formatCatalogLine(e));
  }
  // Sort: timeless first, then by eraMin, then name
  const sortLines = (lines: string[]) =>
    lines.sort((a, b) => {
      const ta = a.includes("timeless") ? 0 : 1;
      const tb = b.includes("timeless") ? 0 : 1;
      if (ta !== tb) return ta - tb;
      return a.localeCompare(b);
    });

  const lines = [
    "# Stack / Environment tool bank",
    "# Each term in exactly one section — no cross-category overlap.",
    "#",
    "# YEAR FORMAT (optional after | ):",
    "#   Term | timeless              → any era / any profile (MS Office, UAT, SQL)",
    "#   Term | 2015+                 → available from 2015 onward",
    "#   Term | 2004-2027             → available only in that window",
    "#   Term | 2015+ | aliases: A, B",
    "#   Term @2018+                  → short form",
    "#   Term @timeless",
    "# Engine refuses terms on projects that ended before eraMin.",
    "",
    "[tools]",
    ...sortLines(by.tool),
    "",
    "[platforms]",
    ...sortLines(by.platform),
    "",
    "[processes]",
    ...sortLines(by.process),
    "",
    "[compliance]",
    ...sortLines(by.compliance),
    "",
    "[regulations]",
    ...sortLines(by.regulation),
    "",
  ];
  return lines.join("\n");
}

export function serializeStackEnvBankJson(doc: StackEnvBankDoc): string {
  return JSON.stringify(doc, null, 2);
}

export async function getStackEnvBank(): Promise<StackEnvBankDoc> {
  try {
    const { prisma } = await import("@/lib/db");
    const row = await prisma.systemSetting.findUnique({
      where: { key: STACK_ENV_BANK_SETTING_KEY },
    });
    if (!row?.value) return { ...DEFAULT_STACK_ENV_BANK };
    return parseStackEnvBank(row.value);
  } catch {
    return { ...DEFAULT_STACK_ENV_BANK };
  }
}

export async function setStackEnvBank(doc: StackEnvBankDoc): Promise<void> {
  const { prisma } = await import("@/lib/db");
  const value = serializeStackEnvBankJson(doc);
  await prisma.systemSetting.upsert({
    where: { key: STACK_ENV_BANK_SETTING_KEY },
    create: { key: STACK_ENV_BANK_SETTING_KEY, value },
    update: { value },
  });
}

export function defaultBankStats() {
  return bankStats(DEFAULT_STACK_ENV_BANK);
}

/** Lookup helpers built from a bank doc. */
export function buildBankIndex(doc: StackEnvBankDoc) {
  const byKey = new Map<string, CatalogEntry>();
  for (const e of doc.catalog) {
    byKey.set(normKey(e.term), e);
    for (const a of e.aliases || []) {
      byKey.set(normKey(a), e);
    }
  }
  const termsByKind = (kind: BankKind) =>
    doc.catalog.filter((e) => e.kind === kind).map((e) => e.term);

  /** Explicit timeless flag only — domain products (FICO/ECC/ATTP) are never timeless. */
  const timelessByKind = (kind: BankKind) =>
    doc.catalog
      .filter((e) => e.kind === kind && e.timeless === true)
      .map((e) => e.term);

  return {
    doc,
    byKey,
    classify(token: string): CatalogEntry | null {
      return byKey.get(normKey(token)) || null;
    },
    kindOf(token: string): BankKind | null {
      return byKey.get(normKey(token))?.kind ?? null;
    },
    termsByKind,
    timelessByKind,
    eraMinOf(token: string): number | null {
      const e = byKey.get(normKey(token));
      return e?.eraMin ?? null;
    },
    isTimeless(token: string): boolean {
      const e = byKey.get(normKey(token));
      return e?.timeless === true;
    },
    /**
     * Era honesty: unknown year is NOT a free pass for modern tools.
     * Unknown year → only explicit timeless catalog entries.
     */
    isEraOk(token: string, year: number | null): boolean {
      const e = byKey.get(normKey(token));
      if (year == null) {
        if (!e) return false;
        return e.timeless === true;
      }
      if (!e) {
        return true; // hard-era-ban in engine still applies
      }
      if (e.eraMin != null && year < e.eraMin) return false;
      if (e.eraMax != null && year > e.eraMax) return false;
      return true;
    },
    /** Pool for padding: timeless-only before 2010; full era-filtered after. */
    padPool(kind: BankKind, year: number | null): string[] {
      const all = termsByKind(kind);
      if (year == null || year < 2010) {
        // Domain-agnostic first; then domain tools that are era-ok AND have eraMin ≤ year
        // (explicit eraMin means "existed by then" — e.g. not FastAPI)
        const timeless = timelessByKind(kind);
        const eraDomain = all.filter((t) => {
          const e = byKey.get(normKey(t));
          if (!e || e.timeless) return false;
          if (e.eraMin == null) return false; // domain product without era → skip early pad
          if (year == null) return false;
          if (year < e.eraMin) return false;
          if (e.eraMax != null && year > e.eraMax) return false;
          return true;
        });
        return [...timeless, ...eraDomain];
      }
      return all.filter((t) => {
        const e = byKey.get(normKey(t));
        if (!e) return true;
        if (e.eraMin != null && year < e.eraMin) return false;
        if (e.eraMax != null && year > e.eraMax) return false;
        return true;
      });
    },
  };
}

export type BankIndex = ReturnType<typeof buildBankIndex>;
