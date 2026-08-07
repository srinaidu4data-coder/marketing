/**
 * Stack / Environment engine — types.
 * Four disjoint catalogs (tools, processes, compliance, regulations)
 * plus era recipes and ship-check report.
 */

export type BankKind =
  | "tool"
  | "platform"
  | "process"
  | "compliance"
  | "regulation";

/** Single catalog entry — each canonical lives in exactly one kind. */
export type CatalogEntry = {
  /** Display form */
  term: string;
  kind: BankKind;
  /** Optional aliases for matching LLM output */
  aliases?: string[];
  /** Inclusive year range when this term is era-honest */
  eraMin?: number;
  eraMax?: number;
};

export type EraBucket = "pre2010" | "2010_2015" | "2016_2019" | "2020_plus";

/** Era-true starter packs — rotated so projects never share the same set. */
export type EraRecipe = {
  era: EraBucket;
  /** Delivery products / languages for Tech Stack */
  stack: string[];
  /** Platforms / collab for Environment */
  env: string[];
  /** Optional process flavor (at most 1–2 on env or skills) */
  processes?: string[];
  /** Optional compliance flavor */
  compliance?: string[];
  /** Optional regulation flavor */
  regulations?: string[];
};

export type StackEnvBankDoc = {
  version: 1;
  catalog: CatalogEntry[];
  recipes: EraRecipe[];
};

export type StackEnvCheckId =
  | "stack_present"
  | "env_present"
  | "stack_env_disjoint"
  | "cross_project_jaccard"
  | "era_honesty"
  | "category_disjoint"
  | "no_clone_signature"
  | "jd_face_recent"
  | "min_diversity";

export type StackEnvCheck = {
  id: StackEnvCheckId;
  label: string;
  ok: boolean;
  detail: string;
  hard: boolean;
};

export type StackEnvReport = {
  checks: StackEnvCheck[];
  passed: boolean;
  notes: string[];
  /** Per-project Jaccard matrix max (excluding self) */
  maxPairJaccard: number;
  uniqueSignatures: number;
};
