/**
 * Smoke: year-annotated tool bank lines parse/serialize round-trip.
 */
import {
  parseCatalogLine,
  formatCatalogLine,
  parseStackEnvBank,
  serializeStackEnvBankSectioned,
} from "../src/lib/resume-v2/stack-env/bank";
import { bankStats, DEFAULT_STACK_ENV_BANK } from "../src/lib/resume-v2/stack-env/default-bank";
import { buildBankIndex } from "../src/lib/resume-v2/stack-env/bank";

const cases: { line: string; kind: "tool"; expect: Partial<{ eraMin: number; eraMax: number; timeless: boolean; term: string }> }[] = [
  { line: "SQL | timeless", kind: "tool", expect: { term: "SQL", timeless: true } },
  { line: "FastAPI | 2018+", kind: "tool", expect: { term: "FastAPI", eraMin: 2018 } },
  { line: "ECC | 2004-2027", kind: "tool", expect: { term: "ECC", eraMin: 2004, eraMax: 2027 } },
  { line: "S/4HANA | 2015+ | aliases: S4HANA, S4", kind: "tool", expect: { term: "S/4HANA", eraMin: 2015 } },
  { line: "Snowflake @2015+", kind: "tool", expect: { term: "Snowflake", eraMin: 2015 } },
  { line: "Agile @timeless", kind: "tool", expect: { term: "Agile", timeless: true } },
];

for (const c of cases) {
  const e = parseCatalogLine(c.line, c.kind);
  if (!e) {
    console.error("FAIL parse null", c.line);
    process.exit(1);
  }
  if (c.expect.term && e.term !== c.expect.term) {
    console.error("FAIL term", c.line, e);
    process.exit(1);
  }
  if (c.expect.timeless && !e.timeless) {
    console.error("FAIL timeless", c.line, e);
    process.exit(1);
  }
  if (c.expect.eraMin != null && e.eraMin !== c.expect.eraMin) {
    console.error("FAIL eraMin", c.line, e);
    process.exit(1);
  }
  if (c.expect.eraMax != null && e.eraMax !== c.expect.eraMax) {
    console.error("FAIL eraMax", c.line, e);
    process.exit(1);
  }
  const round = parseCatalogLine(formatCatalogLine(e), c.kind);
  if (!round || round.term !== e.term) {
    console.error("FAIL roundtrip", formatCatalogLine(e), round);
    process.exit(1);
  }
  console.log("ok", formatCatalogLine(e));
}

const stats = bankStats(DEFAULT_STACK_ENV_BANK);
console.log("default stats", stats);
if ((stats.withYears || 0) < 50) {
  console.error("FAIL expected many dated defaults", stats.withYears);
  process.exit(1);
}
if ((stats.timeless || 0) < 50) {
  console.error("FAIL expected many timeless defaults", stats.timeless);
  process.exit(1);
}

const idx = buildBankIndex(DEFAULT_STACK_ENV_BANK);
if (idx.isEraOk("FastAPI", 2003)) {
  console.error("FAIL FastAPI should not be ok in 2003");
  process.exit(1);
}
if (!idx.isEraOk("Excel", 2003) && !idx.isTimeless("Excel")) {
  // Excel may be timeless
  console.error("FAIL Excel should be ok in 2003");
  process.exit(1);
}

// Sectioned bulk with years
const sample = `
[tools]
SQL | timeless
FastAPI | 2018+
Excel | timeless
[platforms]
On-premise | timeless
Kubernetes | 2015+
[processes]
UAT | timeless
Agile | timeless
[compliance]
SOX | timeless
[regulations]
GDPR | 2018+
`.repeat(3); // pad length for min catalog via merge

const doc = parseStackEnvBank(sample);
const ser = serializeStackEnvBankSectioned(doc);
if (!ser.includes("2018+") && !ser.includes("2018")) {
  console.error("FAIL serialize dropped years", ser.slice(0, 500));
  process.exit(1);
}
console.log("SMOKE_YEARS_OK", { withYears: stats.withYears, timeless: stats.timeless });
