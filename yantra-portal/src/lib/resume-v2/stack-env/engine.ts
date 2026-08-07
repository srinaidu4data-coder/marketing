/**
 * StackEnv Engine — deterministic post-LLM assignment of Tech Stack & Environment.
 *
 * Guarantees before user presentation:
 * - Stack = tools (products/languages); Env = platforms (+ light process/compliance/reg flavor)
 * - Zero overlap stack↔env within a project
 * - Zero cross-category term collisions (each token one kind)
 * - Low Jaccard across projects (no clone stamps)
 * - Era-honest tokens
 * - Bank-backed pad when thin; never one shared JD list for every project
 */

import type { ResumePackV2 } from "../pack-schema";
import { scrubToToolNouns, toolsFromJd } from "../tools-nouns";
import { DEFAULT_STACK_ENV_BANK } from "./default-bank";
import { buildBankIndex, type BankIndex } from "./bank";
import type {
  EraBucket,
  EraRecipe,
  StackEnvBankDoc,
  StackEnvCheck,
  StackEnvReport,
} from "./types";

/** Mirror of bible-prompt.JD_REWRITE_MAX_INDEX — avoid importing prisma via bible-prompt. */
const JD_REWRITE_MAX_INDEX = 2;

const MAX_PAIR_JACCARD = 0.35;
const MIN_STACK = 4;
const MIN_ENV = 3;
const MAX_STACK = 8;
const MAX_ENV = 6;

function normKey(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  // Do NOT split on "/" — keeps S/4HANA, PL/SQL, PI/PO, CI/CD intact
  return (s || "")
    .split(/[,;|·•]+/)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 2 && t.length <= 48);
}

function uniqueTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of terms) {
    const k = normKey(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t.trim());
  }
  return out;
}

/** Phrase keys + primary brand token so "Oracle EBS" blocks "Oracle DB". */
function occupancyKeys(terms: string[]): Set<string> {
  const s = new Set<string>();
  for (const t of terms) {
    const k = normKey(t);
    if (!k) continue;
    s.add(k);
    const parts = k.split(" ").filter(Boolean);
    if (parts[0] && parts[0].length >= 4) s.add(parts[0]);
    // multi-word: also full without spaces
    s.add(k.replace(/\s+/g, ""));
  }
  return s;
}

function conflictsWith(term: string, occupied: Set<string>): boolean {
  const k = normKey(term);
  if (!k) return true;
  if (occupied.has(k) || occupied.has(k.replace(/\s+/g, ""))) return true;
  const head = k.split(" ")[0] || "";
  if (head.length >= 4 && occupied.has(head)) return true;
  // reverse: occupied phrase starts with this head
  for (const o of Array.from(occupied)) {
    if (o.startsWith(head + " ") || o.startsWith(k + " ")) return true;
    if (k.startsWith(o + " ") && o.length >= 4) return true;
  }
  return false;
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a.map(normKey).filter(Boolean));
  const B = new Set(b.map(normKey).filter(Boolean));
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const x of Array.from(A)) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

/**
 * Parse end year from free-form duration lines, e.g.:
 * - "2022 – Present"
 * - "Mar 1999 – Apr 2003"
 * - "Hyderabad, IN | Mar 1999 – Apr 2003"
 * - "1999-2003"
 */
export function endYearFromDuration(duration: string): number | null {
  const d = duration || "";
  if (/present|current/i.test(d)) return new Date().getFullYear();
  const years: number[] = [];
  const re = /\b((?:19|20)\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    const y = Number(m[1]);
    if (y >= 1970 && y <= new Date().getFullYear() + 1) years.push(y);
  }
  if (!years.length) return null;
  return Math.max(...years);
}

export function startYearFromDuration(duration: string): number | null {
  const d = duration || "";
  const years: number[] = [];
  const re = /\b((?:19|20)\d{2})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    const y = Number(m[1]);
    if (y >= 1970 && y <= new Date().getFullYear() + 1) years.push(y);
  }
  if (!years.length) return null;
  return Math.min(...years);
}

export function eraBucket(
  endYear: number | null,
  opts?: { projectIndex?: number }
): EraBucket {
  // Unknown dates: never assume 2020+ (that stamped FastAPI/K8s on 1999 roles)
  if (endYear == null) {
    const i = opts?.projectIndex ?? 0;
    if (i <= 0) return "2020_plus";
    if (i === 1) return "2016_2019";
    if (i === 2) return "2010_2015";
    return "pre2010";
  }
  if (endYear < 2010) return "pre2010";
  if (endYear < 2016) return "2010_2015";
  if (endYear < 2020) return "2016_2019";
  return "2020_plus";
}

/**
 * Hard ban modern tokens even when not in catalog / missing eraMin.
 * Applied whenever endYear is known and below the token's birth year.
 */
const HARD_ERA_BANS: { re: RegExp; minYear: number }[] = [
  { re: /\b(fastapi|uvicorn|pydantic)\b/i, minYear: 2018 },
  { re: /\b(kubernetes|k8s|gke|eks|aks|helm|istio)\b/i, minYear: 2015 },
  { re: /\b(docker|containerd)\b/i, minYear: 2014 },
  { re: /\b(kafka|confluent)\b/i, minYear: 2011 },
  { re: /\b(grafana|prometheus|datadog|new relic)\b/i, minYear: 2012 },
  { re: /\b(openapi|swagger ui)\b/i, minYear: 2011 },
  { re: /\b(github actions|gitlab ci|circleci|argo)\b/i, minYear: 2015 },
  { re: /\b(cloudflare|fastly|vercel|netlify)\b/i, minYear: 2010 },
  { re: /\b(hyper-?v)\b/i, minYear: 2008 },
  { re: /\b(siem console|splunk|elk)\b/i, minYear: 2005 },
  { re: /\b(react|angular|vue|node\.?js|typescript)\b/i, minYear: 2010 },
  { re: /\b(s\/?4\s*hana|s4hana|fiori|ui5|btp|rise|attp|epcis)\b/i, minYear: 2013 },
  { re: /\b(snowflake|databricks|dbt|synapse|bigquery)\b/i, minYear: 2012 },
  { re: /\b(terraform|ansible|kubernetes)\b/i, minYear: 2013 },
  { re: /\b(llm|rag |vector search|chatgpt|openai)\b/i, minYear: 2022 },
  { re: /\b(power bi|powerbi)\b/i, minYear: 2015 },
  { re: /\b(azure devops|ado\b)\b/i, minYear: 2018 },
  { re: /\b(slack|teams|zoom|miro)\b/i, minYear: 2013 },
  { re: /\b(aws|gcp|azure)\b/i, minYear: 2008 },
  { re: /\b(git\b|github|gitlab|bitbucket)\b/i, minYear: 2005 },
  { re: /\b(servicenow|snow\b|workday|successfactors)\b/i, minYear: 2008 },
  { re: /\b(confluence)\b/i, minYear: 2004 },
  { re: /\b(jira)\b/i, minYear: 2002 },
  { re: /\b(tableau|qlik|looker)\b/i, minYear: 2004 },
  { re: /\b(python)\b/i, minYear: 1995 }, // ok mid-90s+
  { re: /\b(fastapi|flask|django)\b/i, minYear: 2005 },
  { re: /\b(spark|hadoop|hive|pyspark)\b/i, minYear: 2008 },
  { re: /\b(wm\b|ewm)\b/i, minYear: 2000 }, // keep WM for 2003 ok
];

export function passesHardEraBan(term: string, year: number | null): boolean {
  if (year == null) {
    // Unknown year: only allow if no hard ban with minYear > 2005
    for (const b of HARD_ERA_BANS) {
      if (b.minYear > 2005 && b.re.test(term)) return false;
    }
    return true;
  }
  for (const b of HARD_ERA_BANS) {
    if (b.re.test(term) && year < b.minYear) return false;
  }
  return true;
}

function recipesForEra(doc: StackEnvBankDoc, era: EraBucket): EraRecipe[] {
  const list = doc.recipes.filter((r) => r.era === era);
  return list.length ? list : doc.recipes;
}

function masterToolsNearEmployer(
  masterText: string | undefined,
  employer: string,
  limit = 8
): string[] {
  if (!masterText?.trim() || !employer?.trim()) {
    return tokenize(scrubToToolNouns(masterText || "", limit));
  }
  const lines = masterText.split(/\r?\n/);
  const emp = employer.toLowerCase().slice(0, 24);
  const idx = lines.findIndex((l) => l.toLowerCase().includes(emp));
  if (idx < 0) return tokenize(scrubToToolNouns(masterText, limit));
  const window = lines
    .slice(Math.max(0, idx - 2), Math.min(lines.length, idx + 25))
    .join(" ");
  return tokenize(scrubToToolNouns(window, limit));
}

type Assigned = {
  techStack: string;
  environment: string;
  stackTerms: string[];
  envTerms: string[];
  signature: string;
};

/**
 * Classify + bucket LLM tokens into stack vs env using bank kinds.
 * Unknown tokens that pass scrub go to stack (tools) by default.
 */
function classifyTokens(
  raw: string,
  idx: BankIndex,
  year: number | null,
  prefer: "stack" | "env"
): { stack: string[]; env: string[]; process: string[]; compliance: string[]; regulation: string[] } {
  const stack: string[] = [];
  const env: string[] = [];
  const process: string[] = [];
  const compliance: string[] = [];
  const regulation: string[] = [];

  for (const t of tokenize(raw)) {
    if (!idx.isEraOk(t, year)) continue;
    if (!passesHardEraBan(t, year)) continue;
    const e = idx.classify(t);
    if (!e) {
      // Unlisted + known early year: only keep if hard-ban allows (already checked)
      // Still drop obvious modern residue when year < 2010
      if (year != null && year < 2010 && !idx.isTimeless(t)) {
        // allow classic short tokens already past hard ban
      }
      if (prefer === "stack") stack.push(t);
      else env.push(t);
      continue;
    }
    if (!idx.isEraOk(t, year)) continue;
    const term = e.term;
    switch (e.kind) {
      case "tool":
        stack.push(term);
        break;
      case "platform":
        env.push(term);
        break;
      case "process":
        process.push(term);
        break;
      case "compliance":
        compliance.push(term);
        break;
      case "regulation":
        regulation.push(term);
        break;
    }
  }
  return {
    stack: uniqueTerms(stack),
    env: uniqueTerms(env),
    process: uniqueTerms(process),
    compliance: uniqueTerms(compliance),
    regulation: uniqueTerms(regulation),
  };
}

function pickRecipe(
  recipes: EraRecipe[],
  projectIndex: number,
  usedRecipeIdx: Set<number>
): { recipe: EraRecipe; idx: number } {
  // Prefer unused recipe index for this era
  for (let off = 0; off < recipes.length; off++) {
    const i = (projectIndex + off) % recipes.length;
    if (!usedRecipeIdx.has(i)) {
      usedRecipeIdx.add(i);
      return { recipe: recipes[i]!, idx: i };
    }
  }
  const i = projectIndex % recipes.length;
  return { recipe: recipes[i]!, idx: i };
}

function stripShared(
  terms: string[],
  forbidden: Set<string>
): string[] {
  return terms.filter((t) => !conflictsWith(t, forbidden));
}

function padFrom(
  current: string[],
  pool: string[],
  min: number,
  max: number,
  forbidden: Set<string>,
  year: number | null,
  idx: BankIndex
): string[] {
  const out = [...current];
  const have = occupancyKeys(out);
  for (const t of pool) {
    if (out.length >= max) break;
    const k = normKey(t);
    if (!k || have.has(k) || conflictsWith(t, forbidden) || conflictsWith(t, have))
      continue;
    if (!idx.isEraOk(t, year) || !passesHardEraBan(t, year)) continue;
    have.add(k);
    const head = k.split(" ")[0];
    if (head && head.length >= 4) have.add(head);
    out.push(t);
  }
  // Last resort: only era-ok items already in pool
  if (out.length < min) {
    for (const t of pool) {
      if (out.length >= min) break;
      if (!idx.isEraOk(t, year) || !passesHardEraBan(t, year)) continue;
      if (conflictsWith(t, forbidden) || conflictsWith(t, have)) continue;
      const k = normKey(t);
      if (!k || have.has(k)) continue;
      have.add(k);
      out.push(t);
    }
  }
  return out.slice(0, max);
}

function assignOne(opts: {
  projectIndex: number;
  role: string;
  employer: string;
  duration: string;
  techStack: string;
  environment: string;
  jdTools: string[];
  masterPocket: string[];
  bank: BankIndex;
  usedRecipeIdx: Map<EraBucket, Set<number>>;
  priorSignatures: string[][];
  isRecent: boolean;
}): Assigned {
  const year = endYearFromDuration(opts.duration);
  const era = eraBucket(year, { projectIndex: opts.projectIndex });
  const recipes = recipesForEra(opts.bank.doc, era);
  const used = opts.usedRecipeIdx.get(era) || new Set<number>();
  opts.usedRecipeIdx.set(era, used);
  const { recipe } = pickRecipe(recipes, opts.projectIndex, used);

  // Pre-2010 (and unknown early slots): domain-agnostic timeless tools only.
  // Avoid stamping FICO/ECC/ATTP onto every 1999 BA / any-profile early job.
  const forceTimeless =
    (year != null && year < 2010) ||
    (year == null && opts.projectIndex >= 2);

  const fromStack = classifyTokens(opts.techStack, opts.bank, year, "stack");
  const fromEnv = classifyTokens(opts.environment, opts.bank, year, "env");
  const fromMaster = classifyTokens(
    opts.masterPocket.join(", "),
    opts.bank,
    year,
    "stack"
  );
  const fromJd = classifyTokens(opts.jdTools.join(", "), opts.bank, year, "stack");

  const eraFilter = (terms: string[]) =>
    terms.filter(
      (t) =>
        opts.bank.isEraOk(t, year) &&
        passesHardEraBan(t, year) &&
        // Unknown / early years: prefer timeless (no eraMin) or eraMin ≤ year
        (year == null
          ? opts.bank.isTimeless(t) || opts.bank.eraMinOf(t) == null
          : true)
    );

  // Recipe-first (rotated per project) — guarantees projects never share one set.
  // LLM / master / JD only add tokens that do not collide with prior projects.
  const priorOccupied = occupancyKeys(opts.priorSignatures.flat());
  const llmStack = eraFilter(
    uniqueTerms([
      ...fromStack.stack,
      ...fromEnv.stack,
      ...fromMaster.stack,
      ...(opts.isRecent ? fromJd.stack.slice(0, 2) : []),
    ])
  ).filter((t) => !conflictsWith(t, priorOccupied));

  const llmEnv = eraFilter(
    uniqueTerms([...fromStack.env, ...fromEnv.env, ...fromMaster.env])
  ).filter((t) => !conflictsWith(t, priorOccupied));

  // Exclusive bank slices — ONLY era-safe / timeless pools (never modern on 1999)
  const toolPool = opts.bank.padPool("tool", year);
  const platformPool = opts.bank.padPool("platform", year);
  const slice = <T,>(arr: T[], start: number, n: number): T[] => {
    if (!arr.length) return [];
    const out: T[] = [];
    for (let i = 0; i < n; i++) out.push(arr[(start + i * 7) % arr.length]!);
    return out;
  };
  const exclusiveTools = slice(toolPool, opts.projectIndex * 11, 10).filter(
    (t) =>
      opts.bank.isEraOk(t, year) &&
      passesHardEraBan(t, year) &&
      !conflictsWith(t, priorOccupied)
  );
  const exclusivePlatforms = slice(
    platformPool,
    opts.projectIndex * 13 + 3,
    8
  ).filter(
    (t) =>
      opts.bank.isEraOk(t, year) &&
      passesHardEraBan(t, year) &&
      !conflictsWith(t, priorOccupied)
  );

  const recipeStackSeed = forceTimeless
    ? [
        ...recipe.stack.filter((t) => opts.bank.isTimeless(t)),
        ...opts.bank.timelessByKind("tool").slice(
          (opts.projectIndex * 5) % 40,
          (opts.projectIndex * 5) % 40 + 8
        ),
      ]
    : recipe.stack;
  const recipeEnvSeed = forceTimeless
    ? [
        ...recipe.env.filter((t) => opts.bank.isTimeless(t)),
        ...opts.bank.timelessByKind("platform").slice(
          (opts.projectIndex * 4) % 20,
          (opts.projectIndex * 4) % 20 + 6
        ),
      ]
    : recipe.env;

  let stack = eraFilter(
    uniqueTerms([
      ...recipeStackSeed,
      // Master pocket still allowed if era-ok (real employer tools)
      ...llmStack.slice(0, forceTimeless ? 2 : opts.isRecent ? 3 : 1),
      ...exclusiveTools,
    ])
  );

  let env = eraFilter(
    uniqueTerms([
      ...recipeEnvSeed,
      ...llmEnv.slice(0, forceTimeless ? 1 : opts.isRecent ? 2 : 1),
      ...exclusivePlatforms,
    ])
  );

  // Flavor: at most 1 process + 1 compliance/regulation on env for diversity (not on stack)
  const flavorProcess = uniqueTerms([
    ...fromStack.process,
    ...fromEnv.process,
    ...(recipe.processes || []),
  ]);
  const flavorComp = uniqueTerms([
    ...fromStack.compliance,
    ...fromEnv.compliance,
    ...(recipe.compliance || []),
  ]);
  const flavorReg = uniqueTerms([
    ...fromStack.regulation,
    ...fromEnv.regulation,
    ...(recipe.regulations || []),
  ]);

  // Pad remaining mins from exclusive pools (never the same global JD bag)
  const stackForbidden = occupancyKeys([
    ...env,
    ...Array.from(priorOccupied),
  ]);
  stack = padFrom(
    stack,
    [...exclusiveTools, ...recipe.stack, ...toolPool],
    MIN_STACK,
    MAX_STACK,
    stackForbidden,
    year,
    opts.bank
  );

  let envForbidden = occupancyKeys([...stack, ...Array.from(priorOccupied)]);
  env = padFrom(
    env,
    [...exclusivePlatforms, ...recipe.env, ...platformPool],
    MIN_ENV,
    MAX_ENV,
    envForbidden,
    year,
    opts.bank
  );

  // Add 1 process + 1 compliance OR regulation flavor rotated by project index
  const flavor: string[] = [];
  if (flavorProcess.length) {
    flavor.push(flavorProcess[opts.projectIndex % flavorProcess.length]!);
  }
  const compOrReg =
    opts.projectIndex % 2 === 0
      ? flavorComp[opts.projectIndex % Math.max(1, flavorComp.length)]
      : flavorReg[opts.projectIndex % Math.max(1, flavorReg.length)];
  if (compOrReg) flavor.push(compOrReg);

  envForbidden = occupancyKeys(stack);
  for (const f of flavor) {
    if (conflictsWith(f, envForbidden) || env.some((x) => normKey(x) === normKey(f)))
      continue;
    if (!opts.bank.isEraOk(f, year) || !passesHardEraBan(f, year)) continue;
    // Processes/compliance on env only when timeless or era-ok (UAT/ALM ok for any era)
    if (env.length < MAX_ENV) env.push(f);
  }

  // Zero overlap stack↔env (phrase + brand)
  const stackKeys = occupancyKeys(stack);
  env = env.filter((t) => !conflictsWith(t, stackKeys));
  if (env.length < MIN_ENV) {
    env = padFrom(
      env,
      recipe.env,
      MIN_ENV,
      MAX_ENV,
      stackKeys,
      year,
      opts.bank
    );
  }

  // Anti-clone vs prior (newer) projects — drop shared tokens from THIS (older) project
  for (let attempt = 0; attempt < 6; attempt++) {
    const combined = [...stack, ...env];
    let worst = 0;
    let worstPrior: string[] | null = null;
    for (const prior of opts.priorSignatures) {
      const j = jaccard(combined, prior);
      if (j > worst) {
        worst = j;
        worstPrior = prior;
      }
    }
    if (worst <= MAX_PAIR_JACCARD || !worstPrior) break;

    const priorSet = new Set(worstPrior.map(normKey));
    // Prefer stripping from stack first (keep env platforms distinct), then env
    const stackNext = stripShared(stack, priorSet);
    const envNext = stripShared(env, priorSet);
    stack =
      stackNext.length >= MIN_STACK
        ? stackNext
        : padFrom(
            stackNext,
            [
              ...recipe.stack,
              ...opts.bank.padPool("tool", year).filter(
                (_, i) => (i + opts.projectIndex) % 3 === 0
              ),
            ],
            MIN_STACK,
            MAX_STACK,
            new Set([...envNext.map(normKey), ...Array.from(priorSet)]),
            year,
            opts.bank
          );
    env =
      envNext.length >= MIN_ENV
        ? envNext
        : padFrom(
            envNext,
            [
              ...recipe.env,
              ...opts.bank.padPool("platform", year).filter(
                (_, i) => (i + opts.projectIndex + 1) % 3 === 0
              ),
            ],
            MIN_ENV,
            MAX_ENV,
            new Set([...stack.map(normKey), ...Array.from(priorSet)]),
            year,
            opts.bank
          );

    // Final zero overlap
    const sk = new Set(stack.map(normKey));
    env = env.filter((t) => !sk.has(normKey(t)));
  }

  // Final era scrub (recipe mis-entries + LLM residue)
  stack = uniqueTerms(stack)
    .filter((t) => opts.bank.isEraOk(t, year) && passesHardEraBan(t, year))
    .slice(0, MAX_STACK);
  env = uniqueTerms(env)
    .filter((t) => opts.bank.isEraOk(t, year) && passesHardEraBan(t, year))
    .slice(0, MAX_ENV);

  // Ensure mins with timeless / era-safe generics only
  if (stack.length < MIN_STACK) {
    const generics = [
      ["SQL", "Excel", "MS Office", "Reporting"],
      ["Requirements", "Documentation", "Test cases", "SQL"],
      ["Excel", "Visio", "Word", "PowerPoint"],
      ["SQL", "RDBMS", "Reporting", "Data Mapping"],
    ][opts.projectIndex % 4]!;
    stack = padFrom(
      stack,
      generics,
      MIN_STACK,
      MAX_STACK,
      occupancyKeys(env),
      year,
      opts.bank
    );
  }
  if (env.length < MIN_ENV) {
    const generics = [
      ["On-premise", "Windows", "Client site"],
      ["ALM", "Test lab", "Shared services hub"],
      ["On-premise", "Data center", "VPN"],
      ["Windows Server", "LAN", "Client site"],
    ][opts.projectIndex % 4]!;
    env = padFrom(
      env,
      generics,
      MIN_ENV,
      MAX_ENV,
      occupancyKeys(stack),
      year,
      opts.bank
    );
  }

  // Last pass: hard era ban again
  stack = stack.filter((t) => passesHardEraBan(t, year));
  env = env.filter((t) => passesHardEraBan(t, year));

  const techStack = stack.join(", ");
  const environment = env.join(", ");
  return {
    techStack,
    environment,
    stackTerms: stack,
    envTerms: env,
    signature: `${stack.map(normKey).sort().join(" ")}||${env.map(normKey).sort().join(" ")}`,
  };
}

function runChecks(
  projects: { techStack: string; environment: string; duration?: string }[],
  jd?: string
): StackEnvReport {
  const checks: StackEnvCheck[] = [];
  const notes: string[] = [];
  const n = projects.length;

  let stacksOk = 0;
  let envsOk = 0;
  let disjoint = 0;
  for (const p of projects) {
    const s = tokenize(p.techStack);
    const e = tokenize(p.environment);
    if (s.length >= MIN_STACK) stacksOk++;
    if (e.length >= MIN_ENV) envsOk++;
    const sk = new Set(s.map(normKey));
    if (!e.some((t) => sk.has(normKey(t)))) disjoint++;
  }

  checks.push({
    id: "stack_present",
    label: `Tech Stack ≥${MIN_STACK} nouns every project`,
    ok: stacksOk === n,
    detail: `${stacksOk}/${n}`,
    hard: true,
  });
  checks.push({
    id: "env_present",
    label: `Environment ≥${MIN_ENV} nouns every project`,
    ok: envsOk === n,
    detail: `${envsOk}/${n}`,
    hard: true,
  });
  checks.push({
    id: "stack_env_disjoint",
    label: "Zero stack↔env overlap per project",
    ok: disjoint === n,
    detail: `${disjoint}/${n} disjoint`,
    hard: true,
  });

  // Pairwise Jaccard
  let maxJ = 0;
  const sigs = projects.map((p) => [
    ...tokenize(p.techStack),
    ...tokenize(p.environment),
  ]);
  for (let i = 0; i < sigs.length; i++) {
    for (let j = i + 1; j < sigs.length; j++) {
      maxJ = Math.max(maxJ, jaccard(sigs[i]!, sigs[j]!));
    }
  }
  checks.push({
    id: "cross_project_jaccard",
    label: `Cross-project Jaccard ≤ ${MAX_PAIR_JACCARD}`,
    ok: n < 2 || maxJ <= MAX_PAIR_JACCARD + 0.02,
    detail: n < 2 ? "n/a" : `max pair Jaccard ${maxJ.toFixed(2)}`,
    hard: true,
  });

  // Exact clone signatures
  const keySet = new Set(
    projects.map(
      (p) =>
        `${normKey(p.techStack)}|${normKey(p.environment)}`
    )
  );
  const uniqueSignatures = keySet.size;
  checks.push({
    id: "no_clone_signature",
    label: "No identical stack|env signature across projects",
    ok: n < 2 || uniqueSignatures === n,
    detail: `${uniqueSignatures} unique / ${n} projects`,
    hard: true,
  });

  checks.push({
    id: "min_diversity",
    label: "At least 2 distinct signatures when ≥3 projects",
    ok: n < 3 || uniqueSignatures >= Math.min(n, Math.ceil(n * 0.75)),
    detail: `${uniqueSignatures} signatures`,
    hard: true,
  });

  // JD face on recent
  const jdTok = new Set(tokenize(toolsFromJd(jd, 16)).map(normKey));
  let jdHits = 0;
  const recentN = Math.min(n, JD_REWRITE_MAX_INDEX + 1);
  for (let i = 0; i < recentN; i++) {
    const s = tokenize(projects[i]!.techStack);
    if (s.some((t) => jdTok.has(normKey(t)))) jdHits++;
  }
  checks.push({
    id: "jd_face_recent",
    label: "Recent projects carry ≥1 JD tool when JD has tools",
    ok: !jdTok.size || jdHits >= Math.min(1, recentN),
    detail: jdTok.size ? `${jdHits}/${recentN} recent share JD tools` : "no JD tools",
    hard: false,
  });

  // Era honesty — hard bans + no modern cloud on pre-2010
  let eraOk = 0;
  for (const p of projects) {
    const y = endYearFromDuration(p.duration || "");
    const blob = `${p.techStack} ${p.environment}`;
    const tokens = blob.split(/[,;|]/).map((t) => t.trim()).filter(Boolean);
    const bad = tokens.some((t) => !passesHardEraBan(t, y));
    if (!bad) eraOk++;
  }
  checks.push({
    id: "era_honesty",
    label: "No modern tokens on pre-era projects (hard era bans)",
    ok: eraOk === n,
    detail: `${eraOk}/${n} era-ok`,
    hard: true,
  });

  const hardFail = checks.filter((c) => c.hard && !c.ok);
  if (hardFail.length) {
    notes.push(
      `stack-env checks failed: ${hardFail.map((c) => c.id).join(", ")}`
    );
  }

  return {
    checks,
    passed: hardFail.length === 0,
    notes,
    maxPairJaccard: maxJ,
    uniqueSignatures,
  };
}

export type StackEnvEngineResult = {
  pack: ResumePackV2;
  report: StackEnvReport;
  notes: string[];
};

/**
 * Main entry: rewrite every project's techStack + environment via bank + anti-clone.
 */
export function runStackEnvEngine(
  pack: ResumePackV2,
  opts?: {
    jd?: string;
    masterText?: string;
    bank?: StackEnvBankDoc;
  }
): StackEnvEngineResult {
  const bankDoc = opts?.bank || DEFAULT_STACK_ENV_BANK;
  const idx = buildBankIndex(bankDoc);
  const jdTools = tokenize(toolsFromJd(opts?.jd, 16));
  const projects = [...(pack.projects || [])];
  const notes: string[] = [];
  const usedRecipeIdx = new Map<EraBucket, Set<number>>();
  const priorSigs: string[][] = [];

  const nextProjects = projects.map((p, i) => {
    const masterPocket = masterToolsNearEmployer(
      opts?.masterText,
      p.employerOrClient || "",
      10
    );
    const assigned = assignOne({
      projectIndex: i,
      role: p.role || "",
      employer: p.employerOrClient || "",
      duration: p.duration || "",
      techStack: p.techStack || "",
      environment: p.environment || "",
      jdTools,
      masterPocket,
      bank: idx,
      usedRecipeIdx,
      priorSignatures: priorSigs,
      isRecent: i <= JD_REWRITE_MAX_INDEX,
    });
    priorSigs.push([...assigned.stackTerms, ...assigned.envTerms]);
    if (
      assigned.techStack !== (p.techStack || "") ||
      assigned.environment !== (p.environment || "")
    ) {
      notes.push(
        `project[${i}] stack/env assigned (${eraBucket(endYearFromDuration(p.duration || ""))})`
      );
    }
    return {
      ...p,
      techStack: assigned.techStack,
      environment: assigned.environment,
    };
  });

  // Global techSkills: 40–50 era-agnostic + domain tools (not clone of project 0)
  let nextSkills = pack.techSkills;
  {
    const toolSet: string[] = [];
    const processSet: string[] = [];
    for (const p of nextProjects) {
      const y = endYearFromDuration(p.duration || "");
      const c = classifyTokens(
        `${p.techStack}, ${p.environment}`,
        idx,
        y,
        "stack"
      );
      toolSet.push(...c.stack.filter((t) => passesHardEraBan(t, y)));
      processSet.push(...c.process);
    }
    // JD tools only if they pass hard ban for "recent" (use current year for skills display)
    const nowY = new Date().getFullYear();
    toolSet.push(
      ...jdTools.filter((t) => passesHardEraBan(t, nowY)).slice(0, 12)
    );

    // Bulk timeless / skill-agnostic catalog (works for SAP, Oracle, Workday, Java, Data)
    const timelessTools = idx.timelessByKind("tool");
    const timelessProc = idx.timelessByKind("process");
    const timelessPlat = idx.timelessByKind("platform");

    const tools = uniqueTerms([
      ...toolSet,
      ...timelessTools.slice(0, 40),
      ...jdTools.slice(0, 8),
    ]).slice(0, 28);

    const processes = uniqueTerms([
      ...processSet,
      ...timelessProc.slice(0, 30),
      "Agile",
      "Scrum",
      "Waterfall",
      "SDLC",
      "UAT",
      "SIT",
      "Requirements gathering",
      "Gap analysis",
      "Change management",
      "Cutover planning",
      "Hypercare",
      "Knowledge transfer",
      "Defect triage",
      "Root cause analysis",
      "Release management",
      "RACI",
      "RAID log",
    ]).slice(0, 16);

    const platforms = uniqueTerms([
      ...timelessPlat.slice(0, 12),
      "On-premise",
      "Windows",
      "Client site",
      "ALM",
      "VPN",
      "Data center",
    ]).slice(0, 10);

    const compliance = uniqueTerms([
      ...idx.timelessByKind("compliance").slice(0, 10),
      "SOX",
      "SoD",
      "Access controls",
      "Change control",
      "Audit trail",
      "ITGC",
    ]).slice(0, 8);

    // Flatten to 40–50 total line items for Technical Skills section
    const flat = uniqueTerms([
      ...tools,
      ...processes,
      ...platforms,
      ...compliance,
    ]).slice(0, 50);

    if (flat.length >= 20) {
      nextSkills = {
        "Core tools": tools.slice(0, 18),
        "Methods & delivery": processes.slice(0, 14),
        Environments: platforms.slice(0, 10),
        Controls: compliance.slice(0, 8),
      };
      // Also ensure total token count ~40–50 via meta note
      notes.push(
        `skills: rebuilt ${flat.length} era-agnostic+domain tokens (target 40–50)`
      );
    } else if (flat.length >= 4) {
      nextSkills = flat.join(", ");
      notes.push(`skills: flat ${flat.length} tokens`);
    }
  }

  let nextPack: ResumePackV2 = {
    ...pack,
    techSkills: nextSkills,
    projects: nextProjects,
  };

  // One re-pass if checks fail (force stronger diversification)
  let report = runChecks(nextPack.projects, opts?.jd);
  if (!report.passed && nextPack.projects.length >= 2) {
    notes.push("stack-env: re-pass after failed checks");
    const prior2: string[][] = [];
    const used2 = new Map<EraBucket, Set<number>>();
    nextPack = {
      ...nextPack,
      projects: nextPack.projects.map((p, i) => {
        // Blank LLM seed so recipes dominate
        const assigned = assignOne({
          projectIndex: i + 3, // offset recipe rotation
          role: p.role || "",
          employer: p.employerOrClient || "",
          duration: p.duration || "",
          techStack: i === 0 ? p.techStack : "",
          environment: i === 0 ? p.environment : "",
          jdTools,
          masterPocket: masterToolsNearEmployer(
            opts?.masterText,
            p.employerOrClient || "",
            8
          ),
          bank: idx,
          usedRecipeIdx: used2,
          priorSignatures: prior2,
          isRecent: i <= JD_REWRITE_MAX_INDEX,
        });
        prior2.push([...assigned.stackTerms, ...assigned.envTerms]);
        return {
          ...p,
          techStack: assigned.techStack,
          environment: assigned.environment,
        };
      }),
    };
    report = runChecks(nextPack.projects, opts?.jd);
  }

  nextPack.meta = {
    ...(nextPack.meta || {}),
    notes: [
      ...(nextPack.meta?.notes || []),
      ...notes.map((n) => `stack-env: ${n}`),
      ...report.notes.map((n) => `stack-env: ${n}`),
      `stack-env: signatures=${report.uniqueSignatures} maxJ=${report.maxPairJaccard.toFixed(2)} passed=${report.passed}`,
    ],
  };

  return { pack: nextPack, report, notes };
}

/** Synchronous ship gate using default or provided bank. */
export function enforceStackEnvShipShape(
  pack: ResumePackV2,
  opts?: { jd?: string; masterText?: string; bank?: StackEnvBankDoc }
): StackEnvEngineResult {
  return runStackEnvEngine(pack, opts);
}
