/**
 * Pure-function characterization tests for refactor safety.
 * These lock current behavior of high-risk utilities.
 */
import assert from "node:assert/strict";
import {
  sanitizePostgresText,
  normalizeEmail,
  normalizePhone,
} from "../../src/lib/text-sanitize";
import {
  parseLlmProvider,
  estimateLlmCostUsd,
} from "../../src/lib/resume/llm-config";
import {
  dedupeJdPhrases,
  isWeakJdPhrase,
  isSkillWorthyJdPhrase,
  extractJdNgrams,
} from "../../src/lib/resume/research-enhance-pack";
import { SHIP_MIN_ATS, BEST_ATS, BEST_PSYCH } from "../../src/lib/resume/pack-ship-ready";
import {
  isEnginePollutionLine,
  stripEnginePollutionLabel,
} from "../../src/lib/resume/engine-pollution";
import { scrubPackTextQuality } from "../../src/lib/resume/pack-quality-scrub";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log("  ✓", name);
  } catch (e) {
    console.error("  ✗", name);
    throw e;
  }
}

console.log("\nCharacterization suite\n");

test("sanitizePostgresText strips NUL", () => {
  assert.equal(sanitizePostgresText("a\u0000b"), "ab");
  assert.equal(sanitizePostgresText("ok\nline"), "ok\nline");
  assert.equal(sanitizePostgresText(""), "");
});

test("normalizeEmail lowercases and trims", () => {
  assert.equal(normalizeEmail("  Admin@SRSoft.COM "), "admin@srsoft.com");
});

test("normalizePhone keeps phone chars only", () => {
  const p = normalizePhone("+1 (555) 123-4567x");
  assert.ok(p.includes("555"));
  assert.ok(p.includes("123-4567") || p.includes("1234567") || p.includes("123"));
  assert.ok(!/[a-zA-Z]/.test(p));
  assert.ok(normalizePhone("x".repeat(100)).length <= 32);
});

test("parseLlmProvider maps aliases", () => {
  assert.equal(parseLlmProvider("openai"), "openai");
  assert.equal(parseLlmProvider("anthropic"), "anthropic");
  assert.equal(parseLlmProvider("claude"), "anthropic");
  assert.equal(parseLlmProvider("unknown"), "openai");
});

test("estimateLlmCostUsd returns non-negative number", () => {
  const c = estimateLlmCostUsd(1000, 500, "gpt-4o-mini", "openai");
  assert.ok(c >= 0);
  const claude = estimateLlmCostUsd(1000, 500, "claude-sonnet-4", "anthropic");
  assert.ok(claude >= 0);
});

test("isWeakJdPhrase rejects location/position/duration crumbs", () => {
  assert.equal(isWeakJdPhrase("Location New Brunswick NJ"), true);
  assert.equal(isWeakJdPhrase("Position SAP FSCD"), true);
  assert.equal(isWeakJdPhrase("Duration 12+ Months"), true);
  assert.equal(isWeakJdPhrase("SAP FSCD"), false);
});

test("isSkillWorthyJdPhrase requires tech signal", () => {
  assert.equal(isSkillWorthyJdPhrase("SAP FSCD"), true);
  assert.equal(isSkillWorthyJdPhrase("New Brunswick NJ"), false);
});

test("dedupeJdPhrases keeps longest location-like span only if not weak", () => {
  const out = dedupeJdPhrases([
    "Location New Brunswick NJ",
    "Location New Brunswick",
    "New Brunswick NJ",
    "Location New",
    "SAP FSCD",
    "Position SAP FSCD",
  ]);
  assert.ok(out.includes("SAP FSCD"));
  assert.ok(!out.some((p) => /location|position/i.test(p)));
});

test("extractJdNgrams skips JD meta header lines", () => {
  const jd = `Position: SAP FSCD Consultant
Location: New Brunswick NJ
Duration: 12+ Months
Must have SAP FSCD, S/4HANA, EPCIS serialization.`;
  const grams = extractJdNgrams(jd, 12);
  assert.ok(!grams.some((g) => /location|position|duration|brunswick/i.test(g)));
  assert.ok(grams.some((g) => /SAP|FSCD|EPCIS|HANA/i.test(g)));
});

test("ship constants contract", () => {
  assert.equal(SHIP_MIN_ATS, 95);
  assert.equal(BEST_ATS, 100);
  assert.equal(BEST_PSYCH, 100);
});

test("engine pollution: JD focus phrases lines are rejected", () => {
  assert.equal(
    isEnginePollutionLine("JD focus phrases: during group consolidation processes."),
    true
  );
  assert.equal(
    stripEnginePollutionLabel(
      "JD focus phrases: during group consolidation processes."
    ),
    null
  );
  assert.equal(
    stripEnginePollutionLabel("JD keywords: SAP · FSCD · S/4HANA"),
    "Core: SAP · FSCD · S/4HANA"
  );
  const cleaned = scrubPackTextQuality(
    "CORE COMPETENCIES\nJD focus phrases: during group consolidation processes.\nCore: SAP · FSCD\n"
  );
  assert.ok(!/JD focus/i.test(cleaned));
  assert.ok(/SAP/i.test(cleaned));
});

test("stripEngineFooter removes pollution from stored packs (preview path)", async () => {
  const { stripEngineFooter } = await import(
    "../../src/lib/resume/strip-engine-footer"
  );
  const out = stripEngineFooter(
    "CORE COMPETENCIES\nJD focus phrases: during group consolidation processes.\nCore: SAP · FSCD\n"
  );
  assert.ok(!/JD focus/i.test(out));
  assert.ok(/Core: SAP/i.test(out));
});

console.log(`\n${passed} tests passed.\n`);
