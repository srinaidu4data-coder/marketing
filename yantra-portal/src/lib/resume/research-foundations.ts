/**
 * Role Forge — Research Foundations (encoded for product behavior)
 *
 * Not a literature review dump. Each principle maps to a concrete generation rule.
 * Sources are classic/applied (psych, decision science, business writing, IR/CS).
 *
 * PSYCHOLOGY / COGNITION
 * - Primacy & recency (serial position; Murdock 1962; Glanzer & Cunitz 1966):
 *   put strongest JD proof first in the document and first within each role.
 * - Processing fluency (Reber & Schwarz; Alter & Oppenheimer):
 *   short scannable titles, familiar JD acronyms, clean hierarchy beat dense prose.
 * - Schema matching / category accessibility (Bartlett tradition; Higgins):
 *   mirror JD module names and role title exactly so “fit” is immediate.
 * - Peak–end rule (Kahneman et al.): close roles with impact, hypercare, or KT wins.
 * - Dual-process / thin-slicing (Kahneman System-1; Ambady & Rosenthal):
 *   6–8 second recruiter scan must read as “this is the person” before deep read.
 * - Progressive disclosure / cognitive load (Sweller): chunk skills; don’t wall-of-text.
 * - Narrative identity / progressive career (McAdams): early foundation → mid → lead.
 *
 * BUSINESS / CONSULTING COMMUNICATION
 * - Minto Pyramid (Barbara Minto): answer/claim first, then supporting points.
 * - SCQA (McKinsey): Situation → Complication → Question → Answer for consultant packs.
 * - AIDA / one-pager product logic: Attention (title) → Interest (skills) → Desire (impact) → Action (experience proof).
 *
 * INFORMATION RETRIEVAL / CS (how ATS & rankers work)
 * - Vector space / TF–IDF / cosine similarity (Salton et al. 1975; modern ATS keyword gates):
 *   maximize exact JD token coverage on page 1.
 * - Embedding-era ranking (Sentence-BERT, cosine on JD↔resume):
 *   also require semantic density of responsibilities, not only keyword stuffing.
 * - Parse safety: single-column linear text (Workday/Greenhouse/Lever heuristics).
 *
 * GAME THEORY / SIGNALING (Spence education signaling; cheap vs costly signals)
 * - Costly honest signals: real employers, real dates, progressive tenure.
 * - Cheap signals to avoid: invented metrics, rates, interview chatter, fake certs.
 * - Equilibrium for staffing: maximize match probability subject to fraud-detection constraints.
 *
 * CLASSICAL WISDOM (compressed ethical constraints — not mystical filler)
 * - Satya (truth): never invent employers, dates, education, certifications.
 * - Yukti (skillful means): present truth in the form the decision-maker needs (JD language).
 * - Viveka (discrimination): recent roles carry specialized JD tools; early roles stay foundational.
 * - Dharma of craft: the resume must be submission-ready — clear, ordered, worthy of client send.
 *
 * PRODUCT CONTRACT
 * Output is client-submittable when:
 * 1) Headline == JD title
 * 2) Recent/mid project titles == JD title
 * 3) ≥90% JD critical keywords present
 * 4) Every project has Employer / Client
 * 5) No duplicate sections / identity leaks
 * 6) Layout spine applied for the candidate’s layout
 */

export const RESEARCH_GENERATION_RULES = {
  /** Primacy: first 15 lines must scream JD fit */
  page1MustCarry: [
    "jobTitleAsHeadline",
    "jdKeywordDenseSkills",
    "impactOrCapabilityPeak",
  ] as const,

  /** Recency: last two projects densest JD weave */
  recentProjectBulletMin: 10,
  midProjectBulletMin: 8,
  earlyProjectBulletMin: 5,

  /** Schema match */
  forceJobTitleOnRecentAndMid: true,

  /** Fluency */
  maxHeadlineChars: 100,
  maxBulletChars: 220,

  /** IR target */
  minKeywordCoverage: 0.9,
  minAtsScore: 95,

  /** Integrity */
  requireEmployerClientLine: true,
  banInventedEmployers: true,
  banRatesAndInterviewChatter: true,
} as const;

/** Layout rhetoric keys — each layout must feel non-isomorphic */
export const LAYOUT_RHETORIC = {
  ats_classic: {
    spine: "Schema-first HR taxonomy",
    principle: "Processing fluency + schema match for ATS parsers",
    openWith: "summary",
  },
  executive_serif: {
    spine: "Minto pyramid (answer first)",
    principle: "Construe abstract claim before evidence",
    openWith: "executive_answer",
  },
  technical_dense: {
    spine: "Capability matrix / RFP response",
    principle: "Modular decomposition; engineers scan skills first",
    openWith: "matrix",
  },
  timeline_progressive: {
    spine: "Narrative identity chapters",
    principle: "Progressive disclosure of ownership by era",
    openWith: "arc",
  },
  modern_minimal: {
    spine: "Sparse high-SNR proof",
    principle: "Cognitive load reduction; proof before pitch",
    openWith: "proof",
  },
  consultant_band: {
    spine: "Impact-led case portfolio",
    principle: "Peak–end + SCQA-lite commercial pack",
    openWith: "profile",
  },
} as const;
