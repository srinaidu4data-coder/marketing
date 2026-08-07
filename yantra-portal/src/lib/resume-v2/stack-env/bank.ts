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
 * Parse admin payload:
 * - Full JSON StackEnvBankDoc
 * - Or sectioned text:
 *   [tools]
 *   SQL
 *   ...
 *   [platforms]
 *   ...
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
        ? [...j.catalog]
        : [];
      const fromLines = (
        lines: string[] | undefined,
        kind: BankKind
      ): CatalogEntry[] =>
        (lines || [])
          .map((t) => String(t || "").trim())
          .filter((t) => t.length >= 2 && t.length <= 64)
          .map((term) => ({ term, kind }));

      if (!catalog.length) {
        catalog = [
          ...fromLines(j.tools, "tool"),
          ...fromLines(j.platforms, "platform"),
          ...fromLines(j.processes, "process"),
          ...fromLines(j.compliance, "compliance"),
          ...fromLines(j.regulations, "regulation"),
        ];
      }
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
  const sections: Record<string, string[]> = {
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
    const sec = t.match(/^\[(tools?|platforms?|processes?|compliance|regulations?)\]$/i);
    if (sec) {
      const name = sec[1]!.toLowerCase();
      if (name.startsWith("tool")) cur = "tools";
      else if (name.startsWith("platform")) cur = "platforms";
      else if (name.startsWith("process")) cur = "processes";
      else if (name.startsWith("compliance")) cur = "compliance";
      else cur = "regulations";
      continue;
    }
    if (cur) sections[cur].push(t.replace(/^[-•*]\s*/, ""));
  }

  const catalog: CatalogEntry[] = [
    ...sections.tools.map((term) => ({ term, kind: "tool" as const })),
    ...sections.platforms.map((term) => ({ term, kind: "platform" as const })),
    ...sections.processes.map((term) => ({ term, kind: "process" as const })),
    ...sections.compliance.map((term) => ({
      term,
      kind: "compliance" as const,
    })),
    ...sections.regulations.map((term) => ({
      term,
      kind: "regulation" as const,
    })),
  ];

  if (catalog.length >= 20) {
    return mergeBankDocs(DEFAULT_STACK_ENV_BANK, { version: 1, catalog });
  }
  return { ...DEFAULT_STACK_ENV_BANK };
}

/** Human-editable sectioned export (easy bulk edit). */
export function serializeStackEnvBankSectioned(doc: StackEnvBankDoc): string {
  const by: Record<BankKind, string[]> = {
    tool: [],
    platform: [],
    process: [],
    compliance: [],
    regulation: [],
  };
  for (const e of doc.catalog) {
    by[e.kind].push(e.term);
  }
  const lines = [
    "# Stack / Environment tool bank",
    "# Each term in exactly one section — no cross-category overlap.",
    "# Engine uses these to pad, classify, and diversify per project.",
    "",
    "[tools]",
    ...by.tool,
    "",
    "[platforms]",
    ...by.platform,
    "",
    "[processes]",
    ...by.process,
    "",
    "[compliance]",
    ...by.compliance,
    "",
    "[regulations]",
    ...by.regulation,
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
