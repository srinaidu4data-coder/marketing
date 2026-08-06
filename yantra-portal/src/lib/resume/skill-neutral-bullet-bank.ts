/**
 * Admin-maintained skill-neutral bullet repository (100 defaults).
 * Used when a pack is thin — never company+(N/M) engagement-goals filler.
 * Stored in SystemSetting; editable under Admin → Bullet bank.
 */

import { prisma } from "@/lib/db";

export const BULLET_BANK_SETTING_KEY = "skill_neutral_bullet_bank";

/** 100 skill-neutral consulting/delivery bullets (no module-specific stack). */
export const DEFAULT_SKILL_NEUTRAL_BULLETS: string[] = [
  "Facilitated discovery workshops to capture business goals, constraints, and success criteria with clear owners.",
  "Translated stakeholder needs into prioritized requirements and acceptance criteria for delivery teams.",
  "Authored functional specifications and conducted structured walkthroughs with business and technical partners.",
  "Led gap analysis sessions and recommended pragmatic solution options with risk and effort trade-offs.",
  "Maintained a living requirements backlog and change log to protect scope integrity across iterations.",
  "Coordinated cross-functional design reviews and secured written decisions for open design questions.",
  "Mapped as-is and to-be process flows to highlight handoffs, controls, and automation opportunities.",
  "Defined testable acceptance criteria for each work package before build commenced.",
  "Partnered with solution architects to validate design feasibility against platform constraints.",
  "Produced RACI matrices for process ownership spanning business, IT, and vendor teams.",
  "Drove sprint planning and backlog refinement to keep delivery aligned with business priorities.",
  "Tracked delivery milestones and published concise status to leadership with blockers and asks.",
  "Managed risk and issue registers with mitigation owners, due dates, and escalation paths.",
  "Ran weekly stand-ups and working sessions to unblock teams and maintain execution cadence.",
  "Coordinated dependencies across workstreams to prevent idle time and last-minute surprises.",
  "Prepared steering materials summarizing progress, risks, decisions needed, and upcoming milestones.",
  "Aligned release plans with business blackout windows and operational readiness constraints.",
  "Established definition-of-done criteria shared by business, QA, and delivery teams.",
  "Facilitated prioritization trade-offs when capacity and timeline constraints collided.",
  "Documented decisions and action items after every major workshop for auditability.",
  "Built unit and scenario test plans covering happy path, edge cases, and negative flows.",
  "Authored UAT scripts with expected results and evidence requirements for business testers.",
  "Coordinated UAT execution, defect triage, and retest cycles through sign-off.",
  "Logged defects with clear reproduction steps, severity, and business impact narrative.",
  "Drove root-cause analysis on recurring defects and closed process gaps to prevent repeats.",
  "Validated data readiness and reconciliation checks before critical test cycles.",
  "Partnered with QA to automate high-value regression scenarios where tooling allowed.",
  "Maintained a living test evidence pack for audit and stakeholder confidence.",
  "Conducted dry-runs of cutover steps to surface sequencing and access risks early.",
  "Confirmed entry and exit criteria for each test phase before progression.",
  "Authored cutover runbooks with step owners, timing, rollback, and communication plans.",
  "Led go/no-go readiness reviews covering defects, training, support, and data readiness.",
  "Coordinated transport and release sequencing with environment owners and CAB processes.",
  "Staffed hypercare rotations with severity definitions and response SLAs.",
  "Stabilized post-go-live issues through structured triage and daily command cadence.",
  "Produced hypercare dashboards showing open severity, aging, and resolution trends.",
  "Executed knowledge transfer sessions for sustainment teams with recorded artifacts.",
  "Captured as-built documentation and operational playbooks for BAU handover.",
  "Validated production access, security roles, and support contact trees before go-live.",
  "Closed project with lessons learned and reusable templates for the next release.",
  "Delivered role-based training materials tailored to end-user day-in-the-life scenarios.",
  "Ran train-the-trainer sessions and floor-support coverage during early adoption weeks.",
  "Built quick-reference guides and FAQs to reduce repetitive support contacts.",
  "Gathered user feedback post-training and refined materials based on pain points.",
  "Championed change impact assessments for affected roles and process handoffs.",
  "Communicated release changes through concise stakeholder bulletins and office hours.",
  "Measured adoption signals and escalated resistance risks with proposed interventions.",
  "Partnered with business SMEs to co-author process narratives that users trust.",
  "Enabled super-users with elevated playbooks for first-line peer support.",
  "Aligned training schedule to release waves and operational peak periods.",
  "Drafted integration requirements covering interfaces, timing, retries, and error handling.",
  "Validated end-to-end data flows across systems with sample evidence packs.",
  "Coordinated interface partners on mapping, cutover sequence, and failure playbooks.",
  "Defined monitoring and alert expectations for critical interface paths.",
  "Reconciled key control totals across systems after major loads and releases.",
  "Documented data ownership and stewardship rules for master and transactional domains.",
  "Supported mock conversions and dress rehearsals with issue logs and retest plans.",
  "Clarified non-functional needs (performance, audit, retention) with architecture partners.",
  "Ensured error queues and exception processes had named owners before go-live.",
  "Verified security and segregation-of-duties expectations with control stakeholders.",
  "Embedded control checkpoints into process design without slowing critical paths.",
  "Documented audit trails and evidence locations for key business controls.",
  "Partnered with compliance stakeholders on policy alignment for new process designs.",
  "Defined exception handling and approval paths for high-risk scenarios.",
  "Validated access design against least-privilege principles with security teams.",
  "Produced control narratives suitable for internal audit walkthroughs.",
  "Tracked open control gaps to closure with owners and target dates.",
  "Ensured sensitive data handling rules were reflected in design and test cases.",
  "Supported post-implementation control effectiveness reviews with evidence packs.",
  "Aligned retention and archival expectations with enterprise policy owners.",
  "Facilitated vendor working sessions with clear agendas, decisions, and follow-ups.",
  "Held delivery partners accountable to milestones with transparent status reporting.",
  "Negotiated scope trade-offs with vendors while protecting critical business outcomes.",
  "Reviewed vendor deliverables against acceptance criteria before sign-off.",
  "Escalated systemic vendor risks with facts, impact, and recommended actions.",
  "Maintained a single source of truth for decisions across client and partner teams.",
  "Coordinated multi-vendor dependencies to avoid finger-pointing at interfaces.",
  "Ensured commercial and delivery conversations stayed aligned on outcomes.",
  "Published weekly partner scorecards on quality, responsiveness, and risk.",
  "Closed vendor gaps through joint working sessions rather than email thrash.",
  "Created reusable templates for specs, test scripts, and status that sped later waves.",
  "Standardized workshop formats so sessions produced decisions, not only discussion.",
  "Built lightweight dashboards for milestone health visible to all workstream leads.",
  "Reduced rework by enforcing review gates before build and before UAT.",
  "Improved estimation accuracy by baselining actuals from prior releases.",
  "Codified escalation paths so blockers did not sit idle between meetings.",
  "Introduced concise RAID hygiene that leadership actually used week to week.",
  "Cut meeting load by replacing status meetings with written updates and office hours.",
  "Improved handoffs between design, build, and test with explicit artifact checklists.",
  "Left sustainment teams with clear ownership maps and runbooks they could operate.",
  "Drove clarity on in-scope vs out-of-scope items before investment of build capacity.",
  "Balanced speed and quality by protecting critical path items from low-value thrash.",
  "Used structured decision logs to prevent reopening settled design choices.",
  "Kept documentation current enough that new team members could ramp without tribal knowledge.",
  "Protected user experience by validating flows with real scenarios, not only slides.",
  "Ensured every major deliverable had a named approver and due date.",
  "Surfaced capacity risks early with data rather than late heroics.",
  "Converted ambiguous requests into crisp problem statements before solutioning.",
  "Celebrated delivery wins with evidence so stakeholders trusted the next ask.",
  "Closed loops: every action item either completed, re-owned, or formally dropped.",
];

export function parseBulletBank(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [...DEFAULT_SKILL_NEUTRAL_BULLETS];
  try {
    const j = JSON.parse(raw) as unknown;
    if (Array.isArray(j)) {
      const lines = j
        .map((x) => String(x ?? "").replace(/^[•\-–*]\s*/, "").trim())
        .filter((s) => s.length >= 20);
      if (lines.length >= 10) return lines;
    }
  } catch {
    /* fall through to line mode */
  }
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^[•\-–*\d.)\s]+/, "").trim())
    .filter((s) => s.length >= 20);
  return lines.length >= 10 ? lines : [...DEFAULT_SKILL_NEUTRAL_BULLETS];
}

export function serializeBulletBank(bullets: string[]): string {
  const clean = bullets
    .map((b) => b.replace(/^[•\-–*]\s*/, "").trim())
    .filter((b) => b.length >= 12);
  return JSON.stringify(clean, null, 2);
}

export async function getSkillNeutralBulletBank(): Promise<string[]> {
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: BULLET_BANK_SETTING_KEY },
    });
    return parseBulletBank(row?.value);
  } catch {
    return [...DEFAULT_SKILL_NEUTRAL_BULLETS];
  }
}

export async function setSkillNeutralBulletBank(
  bullets: string[]
): Promise<void> {
  const value = serializeBulletBank(bullets);
  await prisma.systemSetting.upsert({
    where: { key: BULLET_BANK_SETTING_KEY },
    create: { key: BULLET_BANK_SETTING_KEY, value },
    update: { value },
  });
}

/**
 * Pick N distinct bank bullets, optionally lightly contextualized without
 * company+(N/M) filler. Never embeds employer name + goals (N/M).
 */
export function pickBankBullets(
  bank: string[],
  need: number,
  used: Set<string>
): string[] {
  const pool = (bank.length ? bank : DEFAULT_SKILL_NEUTRAL_BULLETS).filter(
    (b) => !used.has(b.toLowerCase())
  );
  const out: string[] = [];
  // Rotate start so pads aren't always identical across projects
  let start = Math.floor(Math.random() * Math.max(1, pool.length));
  for (let i = 0; i < pool.length && out.length < need; i++) {
    const b = pool[(start + i) % pool.length]!;
    const key = b.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    out.push(b);
  }
  // If bank exhausted, cycle with index suffix to stay unique-ish
  let n = 0;
  while (out.length < need) {
    const base =
      DEFAULT_SKILL_NEUTRAL_BULLETS[n % DEFAULT_SKILL_NEUTRAL_BULLETS.length]!;
    const line = n < DEFAULT_SKILL_NEUTRAL_BULLETS.length ? base : `${base} (${n + 1})`;
    if (!used.has(line.toLowerCase())) {
      used.add(line.toLowerCase());
      out.push(line);
    }
    n++;
    if (n > need + 200) break;
  }
  return out;
}

/** Compact block for injection into LLM user/system messages */
export function formatBulletBankForPrompt(
  bank: string[],
  maxLines = 40
): string {
  const lines = (bank.length ? bank : DEFAULT_SKILL_NEUTRAL_BULLETS).slice(
    0,
    maxLines
  );
  return [
    "=== ADMIN SKILL-NEUTRAL BULLET BANK (lookup when bullets are thin) ===",
    "When a project or summary needs more bullets, pick DISTINCT lines from this bank",
    "(or invent equally specific consulting-delivery bullets). NEVER use:",
    '"Delivered measurable outcomes for [Company] aligned to engagement goals (N/M)."',
    "Bank lines are skill-neutral process/delivery language — adapt lightly to the JD domain if needed.",
    ...lines.map((b, i) => `${i + 1}. ${b}`),
    bank.length > maxLines
      ? `…(+${bank.length - maxLines} more in Admin → Bullet bank)`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
