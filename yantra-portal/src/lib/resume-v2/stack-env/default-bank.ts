/**
 * Default Stack/Env bank — system-agnostic catalogs + era recipes.
 * Every term appears in exactly ONE kind (no cross-category overlap).
 * Beefed for any domain/era; recipes rotate so projects never look identical.
 */

import type { CatalogEntry, EraRecipe, StackEnvBankDoc } from "./types";

/** Build catalog with forced unique terms across kinds. */
function entry(
  term: string,
  kind: CatalogEntry["kind"],
  opts?: Partial<CatalogEntry>
): CatalogEntry {
  return { term, kind, ...opts };
}

/**
 * TOOLS — products, languages, modules you deliver (Tech Stack lane).
 * System-agnostic + common enterprise nouns.
 */
const TOOLS: CatalogEntry[] = [
  // Languages / data
  entry("SQL", "tool"),
  entry("T-SQL", "tool", { aliases: ["TSQL"] }),
  entry("PL/SQL", "tool", { aliases: ["PLSQL"] }),
  entry("Python", "tool"),
  entry("Java", "tool"),
  entry("Scala", "tool"),
  entry("R", "tool"),
  entry("ABAP", "tool"),
  entry("JavaScript", "tool", { aliases: ["JS"] }),
  entry("TypeScript", "tool", { aliases: ["TS"] }),
  // Data engineering
  entry("ETL", "tool"),
  entry("ELT", "tool"),
  entry("dbt", "tool"),
  entry("Spark", "tool"),
  entry("PySpark", "tool"),
  entry("Kafka", "tool"),
  entry("Hadoop", "tool"),
  entry("Hive", "tool"),
  entry("SSIS", "tool"),
  entry("SSRS", "tool"),
  entry("SSAS", "tool"),
  entry("Informatica", "tool"),
  entry("DataStage", "tool"),
  entry("Talend", "tool"),
  // BI / analytics
  entry("Power BI", "tool", { aliases: ["PowerBI"] }),
  entry("Tableau", "tool"),
  entry("Looker", "tool"),
  entry("Qlik", "tool"),
  entry("Excel", "tool"),
  entry("VBA", "tool"),
  // Integration / APIs
  entry("REST", "tool"),
  entry("SOAP", "tool"),
  entry("OData", "tool", { aliases: ["ODATA"] }),
  entry("IDoc", "tool", { aliases: ["IDOC"] }),
  entry("BAPI", "tool"),
  entry("GraphQL", "tool"),
  entry("MuleSoft", "tool"),
  entry("Boomi", "tool", { eraMin: 2012 }),
  entry("WebMethods", "tool"),
  // ERP / modules (agnostic labels + common)
  entry("ERP", "tool"),
  entry("CRM", "tool"),
  entry("HCM", "tool"),
  entry("SCM", "tool"),
  entry("WMS", "tool"),
  entry("TMS", "tool"),
  entry("GL", "tool"),
  entry("AP", "tool"),
  entry("AR", "tool"),
  entry("FA", "tool"),
  entry("CO", "tool"),
  entry("MM", "tool"),
  entry("SD", "tool"),
  entry("PP", "tool"),
  entry("QM", "tool"),
  entry("PM", "tool"),
  entry("WM", "tool"),
  entry("EWM", "tool", { eraMin: 2010 }),
  entry("TM", "tool"),
  entry("MDG", "tool", { eraMin: 2012 }),
  entry("MDM", "tool"),
  entry("BRIM", "tool", { eraMin: 2015 }),
  entry("FI-CA", "tool", { aliases: ["FICA"], eraMin: 2010 }),
  entry("FICO", "tool"),
  entry("RTR", "tool"),
  entry("OTC", "tool", { aliases: ["O2C"] }),
  entry("PTP", "tool", { aliases: ["P2P"] }),
  entry("RAR", "tool", { eraMin: 2016 }),
  entry("IBP", "tool", { eraMin: 2016 }),
  entry("BPC", "tool"),
  entry("BW", "tool"),
  entry("BW/4HANA", "tool", { aliases: ["BW4HANA"], eraMin: 2016 }),
  entry("SAC", "tool", { eraMin: 2018 }),
  entry("Fiori", "tool", { eraMin: 2013 }),
  entry("UI5", "tool", { eraMin: 2013 }),
  entry("ECC", "tool", { eraMax: 2027 }),
  entry("S/4HANA", "tool", { aliases: ["S4HANA", "S4"], eraMin: 2015 }),
  entry("HANA", "tool", { eraMin: 2012 }),
  entry("ATTP", "tool", { eraMin: 2016 }),
  entry("EPCIS", "tool", { eraMin: 2014 }),
  entry("GTIN", "tool"),
  entry("SSCC", "tool"),
  entry("GTS", "tool"),
  entry("Ariba", "tool"),
  entry("Concur", "tool"),
  entry("SuccessFactors", "tool", { aliases: ["SF"] }),
  entry("Vertex", "tool"),
  entry("Coupa", "tool"),
  entry("OpenText", "tool"),
  entry("VIM", "tool"),
  entry("Salesforce", "tool"),
  entry("Service Cloud", "tool"),
  entry("Workday", "tool"),
  entry("Oracle EBS", "tool", { aliases: ["EBS"] }),
  entry("PeopleSoft", "tool"),
  entry("NetSuite", "tool"),
  entry("Dynamics 365", "tool", { aliases: ["D365"], eraMin: 2016 }),
  // Master data / quality
  entry("Master Data", "tool"),
  entry("Data Quality", "tool"),
  entry("Data Mapping", "tool"),
  entry("Reconciliation", "tool"),
  entry("Reporting", "tool"),
  entry("Dashboards", "tool"),
  entry("KPI Design", "tool"),
  // Testing tools (product-ish)
  entry("Selenium", "tool"),
  entry("Postman", "tool"),
  entry("SoapUI", "tool"),
  entry("LoadRunner", "tool"),
  entry("JMeter", "tool"),
  // Security / identity products
  entry("SSO", "tool"),
  entry("SAML", "tool"),
  entry("OAuth", "tool"),
  entry("LDAP", "tool"),
  entry("Active Directory", "tool", { aliases: ["AD"] }),
];

/**
 * PLATFORMS — runtime / cloud / collab / ALM (Environment lane only).
 * Disjoint from tools list.
 */
const PLATFORMS: CatalogEntry[] = [
  entry("Azure", "platform", { eraMin: 2012 }),
  entry("AWS", "platform", { eraMin: 2008 }),
  entry("GCP", "platform", { eraMin: 2012 }),
  entry("Public Cloud", "platform", { eraMin: 2014 }),
  entry("Private Cloud", "platform", { eraMin: 2010 }),
  entry("Hybrid Cloud", "platform", { eraMin: 2014 }),
  entry("On-premise", "platform", { aliases: ["On Premise", "On Prem"] }),
  entry("Windows Server", "platform"),
  entry("Linux", "platform"),
  entry("SQL Server", "platform"),
  entry("Oracle DB", "platform", { aliases: ["Oracle Database"] }),
  entry("PostgreSQL", "platform", { aliases: ["Postgres"] }),
  entry("MySQL", "platform"),
  entry("MongoDB", "platform"),
  entry("Redis", "platform"),
  entry("Snowflake", "platform", { eraMin: 2015 }),
  entry("Redshift", "platform", { eraMin: 2013 }),
  entry("BigQuery", "platform", { eraMin: 2012 }),
  entry("Databricks", "platform", { eraMin: 2015 }),
  entry("Synapse", "platform", { aliases: ["Azure Synapse"], eraMin: 2019 }),
  entry("Data Factory", "platform", { aliases: ["ADF"], eraMin: 2015 }),
  entry("Logic Apps", "platform", { eraMin: 2016 }),
  entry("Event Hub", "platform", { eraMin: 2015 }),
  entry("Cosmos DB", "platform", { eraMin: 2017 }),
  entry("Docker", "platform", { eraMin: 2014 }),
  entry("Kubernetes", "platform", { aliases: ["K8s"], eraMin: 2016 }),
  entry("Terraform", "platform", { eraMin: 2015 }),
  entry("BTP", "platform", { eraMin: 2019 }),
  entry("CPI", "platform", { aliases: ["SAP CPI"], eraMin: 2017 }),
  entry("PI/PO", "platform", { aliases: ["PI", "PO", "SAP PI"] }),
  entry("SolMan", "platform", { aliases: ["Solution Manager"] }),
  entry("ALM", "platform"),
  entry("HP ALM", "platform", { aliases: ["QC", "Quality Center"] }),
  entry("Jira", "platform", { aliases: ["JIRA"] }),
  entry("Confluence", "platform"),
  entry("ServiceNow", "platform", { aliases: ["Service Now", "SNOW"] }),
  entry("Azure DevOps", "platform", { aliases: ["ADO", "TFS"], eraMin: 2018 }),
  entry("GitHub", "platform"),
  entry("GitLab", "platform"),
  entry("Bitbucket", "platform"),
  entry("Git", "platform"),
  entry("Jenkins", "platform"),
  entry("Client site", "platform"),
  entry("Remote delivery", "platform", { eraMin: 2012 }),
  entry("Shared services hub", "platform"),
  entry("Data center", "platform"),
  entry("VDI", "platform"),
  entry("Citrix", "platform"),
  entry("VPN", "platform"),
  entry("Active-active DR", "platform", { eraMin: 2014 }),
  entry("Staging landscape", "platform"),
  entry("Sandbox", "platform"),
  entry("QA landscape", "platform"),
  entry("Prod landscape", "platform"),
  entry("Transport landscape", "platform"),
  entry("RISE", "platform", { eraMin: 2021 }),
  entry("Datasphere", "platform", { eraMin: 2022 }),
];

/**
 * PROCESSES — delivery methods (never duplicate tool/platform terms).
 */
const PROCESSES: CatalogEntry[] = [
  entry("SDLC", "process"),
  entry("Agile", "process"),
  entry("Scrum", "process"),
  entry("Kanban", "process"),
  entry("Waterfall", "process"),
  entry("Hybrid delivery", "process"),
  entry("SAFe", "process", { eraMin: 2014 }),
  entry("DevOps", "process", { eraMin: 2012 }),
  entry("CI/CD", "process", { eraMin: 2012 }),
  entry("ITIL", "process"),
  entry("ITSM", "process"),
  entry("Discovery workshops", "process"),
  entry("Requirements gathering", "process"),
  entry("Gap analysis", "process"),
  entry("Fit-gap", "process"),
  entry("Blueprinting", "process"),
  entry("Solution design", "process"),
  entry("Configuration", "process"),
  entry("Customization", "process"),
  entry("Unit testing", "process"),
  entry("SIT", "process"),
  entry("UAT", "process"),
  entry("Regression testing", "process"),
  entry("Performance testing", "process"),
  entry("Security testing", "process"),
  entry("Defect triage", "process"),
  entry("Root cause analysis", "process"),
  entry("Cutover planning", "process"),
  entry("Dress rehearsal", "process"),
  entry("Go-live", "process"),
  entry("Hypercare", "process"),
  entry("Knowledge transfer", "process"),
  entry("Runbook authoring", "process"),
  entry("Change management", "process"),
  entry("CAB", "process"),
  entry("Release management", "process"),
  entry("Incident management", "process"),
  entry("Problem management", "process"),
  entry("RACI", "process"),
  entry("RAID log", "process"),
  entry("Steering reporting", "process"),
  entry("Backlog refinement", "process"),
  entry("Sprint planning", "process"),
  entry("Daily stand-up", "process"),
  entry("Retrospective", "process"),
  entry("Data migration", "process"),
  entry("Mock conversion", "process"),
  entry("Reconciliation cycles", "process"),
  entry("Interface mapping", "process"),
  entry("Master data cleanup", "process"),
  entry("Training delivery", "process"),
  entry("Train-the-trainer", "process"),
  entry("Floor support", "process"),
  entry("Adoption tracking", "process"),
  entry("Lessons learned", "process"),
  entry("Continuous improvement", "process"),
  entry("Value stream mapping", "process"),
  entry("Process mining", "process", { eraMin: 2016 }),
];

/**
 * COMPLIANCE — frameworks / control programs (not tools, not regs).
 */
const COMPLIANCE: CatalogEntry[] = [
  entry("SOX", "compliance", { aliases: ["Sarbanes-Oxley"] }),
  entry("SOC 1", "compliance"),
  entry("SOC 2", "compliance", { aliases: ["SOC2"] }),
  entry("ISO 27001", "compliance"),
  entry("ISO 9001", "compliance"),
  entry("NIST", "compliance"),
  entry("COBIT", "compliance"),
  entry("ITGC", "compliance"),
  entry("SoD", "compliance", { aliases: ["Segregation of Duties"] }),
  entry("Access controls", "compliance"),
  entry("Least privilege", "compliance"),
  entry("Audit trail", "compliance"),
  entry("Internal audit", "compliance"),
  entry("External audit", "compliance"),
  entry("Control testing", "compliance"),
  entry("Evidence packs", "compliance"),
  entry("Policy alignment", "compliance"),
  entry("Risk assessment", "compliance"),
  entry("Vendor risk", "compliance"),
  entry("Data retention", "compliance"),
  entry("Privacy by design", "compliance"),
  entry("Change control", "compliance"),
  entry("CAB approval", "compliance"),
  entry("GxP", "compliance"),
  entry("CSV", "compliance", { aliases: ["Computer System Validation"] }),
  entry("21 CFR Part 11", "compliance", { aliases: ["Part 11"] }),
  entry("Data integrity ALCOA+", "compliance", { aliases: ["ALCOA"] }),
  entry("Quality management system", "compliance", { aliases: ["QMS"] }),
  entry("Business continuity", "compliance"),
  entry("DR testing", "compliance"),
  entry("Penetration test findings", "compliance"),
  entry("Vulnerability management", "compliance"),
  entry("Encryption standards", "compliance"),
  entry("Key management", "compliance"),
];

/**
 * REGULATIONS — legal / industry rules (disjoint from compliance frameworks).
 */
const REGULATIONS: CatalogEntry[] = [
  entry("GDPR", "regulation"),
  entry("CCPA", "regulation"),
  entry("CPRA", "regulation", { eraMin: 2020 }),
  entry("HIPAA", "regulation"),
  entry("HITECH", "regulation"),
  entry("PCI-DSS", "regulation", { aliases: ["PCI"] }),
  entry("GLBA", "regulation"),
  entry("Basel III", "regulation"),
  entry("MiFID II", "regulation", { eraMin: 2018 }),
  entry("Dodd-Frank", "regulation"),
  entry("IFRS 15", "regulation", { eraMin: 2018 }),
  entry("IFRS 16", "regulation", { eraMin: 2019 }),
  entry("ASC 606", "regulation", { eraMin: 2018 }),
  entry("ASC 842", "regulation", { eraMin: 2019 }),
  entry("FDA", "regulation"),
  entry("DSCSA", "regulation", { eraMin: 2013 }),
  entry("FMD", "regulation", { eraMin: 2019 }),
  entry("EU MDR", "regulation", { eraMin: 2021 }),
  entry("FSMA", "regulation"),
  entry("DEA", "regulation"),
  entry("EMA", "regulation"),
  entry("GS1 standards", "regulation", { aliases: ["GS1"] }),
  entry("ePedigree", "regulation"),
  entry("Privacy Shield successor", "regulation", { eraMin: 2023 }),
  entry("Schrems II", "regulation", { eraMin: 2020 }),
  entry("TCPA", "regulation"),
  entry("CAN-SPAM", "regulation"),
  entry("COPPA", "regulation"),
  entry("FERPA", "regulation"),
  entry("FedRAMP", "regulation"),
  entry("State privacy acts", "regulation", { eraMin: 2020 }),
  entry("Export control", "regulation"),
  entry("OFAC screening", "regulation"),
  entry("AML", "regulation"),
  entry("KYC", "regulation"),
];

/** Assert no cross-kind term collisions at build time (dev safety). */
function assertDisjoint(catalog: CatalogEntry[]): CatalogEntry[] {
  const seen = new Map<string, string>();
  const out: CatalogEntry[] = [];
  for (const e of catalog) {
    const k = e.term.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!k) continue;
    const prev = seen.get(k);
    if (prev && prev !== e.kind) {
      // Skip duplicate across kinds — first kind wins
      continue;
    }
    if (prev === e.kind) continue;
    seen.set(k, e.kind);
    for (const a of e.aliases || []) {
      const ak = a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (ak && !seen.has(ak)) seen.set(ak, e.kind);
    }
    out.push(e);
  }
  return out;
}

/**
 * Era recipes — multiple variants per era so rotation never clones.
 * Stack = tools; env = platforms. Processes/compliance/regs optional flavor.
 */
export const DEFAULT_ERA_RECIPES: EraRecipe[] = [
  // ── pre-2010 ──────────────────────────────────────────────
  {
    era: "pre2010",
    stack: ["SQL", "Excel", "Reporting", "GL", "AP", "AR", "ETL"],
    env: ["On-premise", "Windows Server", "SQL Server", "Client site"],
    processes: ["Waterfall", "UAT", "Cutover planning"],
    compliance: ["SOX", "ITGC"],
  },
  {
    era: "pre2010",
    stack: ["ECC", "MM", "SD", "FICO", "IDoc", "BAPI", "ABAP"],
    env: ["On-premise", "SolMan", "HP ALM", "Data center"],
    processes: ["Blueprinting", "Unit testing", "Go-live"],
    compliance: ["Change control", "SoD"],
  },
  {
    era: "pre2010",
    stack: ["Oracle EBS", "PL/SQL", "Data Mapping", "Reconciliation"],
    env: ["On-premise", "Oracle DB", "VPN", "Staging landscape"],
    processes: ["Gap analysis", "SIT", "Knowledge transfer"],
    compliance: ["Internal audit", "Access controls"],
  },
  {
    era: "pre2010",
    stack: ["CRM", "Java", "SOAP", "Master Data", "Dashboards"],
    env: ["On-premise", "Linux", "QA landscape", "Citrix"],
    processes: ["SDLC", "Defect triage", "Training delivery"],
    compliance: ["Audit trail", "Policy alignment"],
  },
  {
    era: "pre2010",
    stack: ["PeopleSoft", "HCM", "Excel", "VBA", "Reporting"],
    env: ["On-premise", "Windows Server", "Shared services hub"],
    processes: ["Requirements gathering", "UAT", "Hypercare"],
    compliance: ["SOX", "Data retention"],
  },
  // ── 2010–2015 ────────────────────────────────────────────
  {
    era: "2010_2015",
    stack: ["ECC", "FICO", "BW", "BPC", "ETL", "SQL"],
    env: ["On-premise", "SolMan", "Jira", "ALM"],
    processes: ["Agile", "SIT", "Release management"],
    compliance: ["SOX", "SoD"],
  },
  {
    era: "2010_2015",
    stack: ["MDM", "Data Quality", "Informatica", "REST", "SOAP"],
    env: ["Hybrid Cloud", "SQL Server", "Confluence", "Client site"],
    processes: ["Data migration", "Mock conversion", "UAT"],
    compliance: ["ITGC", "Access controls"],
  },
  {
    era: "2010_2015",
    stack: ["EWM", "WM", "MM", "IDoc", "Master Data"],
    env: ["On-premise", "HP ALM", "Transport landscape"],
    processes: ["Fit-gap", "Regression testing", "Cutover planning"],
    compliance: ["Change control", "Evidence packs"],
  },
  {
    era: "2010_2015",
    stack: ["Salesforce", "REST", "SOAP", "Reporting", "Dashboards"],
    env: ["Public Cloud", "Jira", "Git", "Remote delivery"],
    processes: ["Scrum", "Sprint planning", "Hypercare"],
    compliance: ["SOC 2", "Vendor risk"],
  },
  {
    era: "2010_2015",
    stack: ["HANA", "BW", "ABAP", "Fiori", "OData"],
    env: ["On-premise", "SolMan", "Sandbox", "ServiceNow"],
    processes: ["DevOps", "CI/CD", "Dress rehearsal"],
    compliance: ["SOX", "Least privilege"],
    regulations: ["GDPR"],
  },
  // ── 2016–2019 ────────────────────────────────────────────
  {
    era: "2016_2019",
    stack: ["S/4HANA", "Fiori", "RTR", "MDG", "OData"],
    env: ["Azure", "SolMan", "Jira", "Azure DevOps"],
    processes: ["SAFe", "UAT", "Go-live"],
    compliance: ["SOX", "ITGC"],
    regulations: ["GDPR", "IFRS 15"],
  },
  {
    era: "2016_2019",
    stack: ["ATTP", "EPCIS", "GTIN", "SSCC", "ETL"],
    env: ["AWS", "ServiceNow", "GitHub", "Staging landscape"],
    processes: ["SIT", "Performance testing", "Hypercare"],
    compliance: ["GxP", "CSV", "21 CFR Part 11"],
    regulations: ["DSCSA", "GS1 standards"],
  },
  {
    era: "2016_2019",
    stack: ["Python", "Spark", "ETL", "dbt", "Power BI"],
    env: ["Databricks", "Snowflake", "Azure", "Confluence"],
    processes: ["Agile", "Data migration", "Reconciliation cycles"],
    compliance: ["SOC 2", "Privacy by design"],
    regulations: ["CCPA"],
  },
  {
    era: "2016_2019",
    stack: ["BRIM", "FI-CA", "RAR", "OData", "SQL"],
    env: ["Private Cloud", "CPI", "Jira", "ALM"],
    processes: ["Blueprinting", "Regression testing", "CAB"],
    compliance: ["SOX", "SoD", "Audit trail"],
    regulations: ["ASC 606"],
  },
  {
    era: "2016_2019",
    stack: ["IBP", "Excel", "Data Mapping", "REST", "Reporting"],
    env: ["Azure", "Data Factory", "Git", "Remote delivery"],
    processes: ["Hybrid delivery", "Steering reporting", "Cutover planning"],
    compliance: ["Change control", "Risk assessment"],
  },
  // ── 2020+ ────────────────────────────────────────────────
  {
    era: "2020_plus",
    stack: ["S/4HANA", "Fiori", "ABAP", "OData", "REST"],
    env: ["RISE", "BTP", "Azure", "Jira", "ServiceNow"],
    processes: ["DevOps", "CI/CD", "Value stream mapping"],
    compliance: ["SOC 2", "ISO 27001"],
    regulations: ["GDPR", "CPRA"],
  },
  {
    era: "2020_plus",
    stack: ["ATTP", "EPCIS", "GTIN", "SSCC", "Kafka"],
    env: ["AWS", "Databricks", "GitHub", "Remote delivery"],
    processes: ["SAFe", "UAT", "Hypercare"],
    compliance: ["GxP", "Data integrity ALCOA+", "CSV"],
    regulations: ["DSCSA", "FMD", "EU MDR"],
  },
  {
    era: "2020_plus",
    stack: ["Python", "PySpark", "dbt", "Kafka", "Power BI"],
    env: ["Snowflake", "Synapse", "Kubernetes", "Azure DevOps"],
    processes: ["Process mining", "Agile", "Incident management"],
    compliance: ["NIST", "Encryption standards"],
    regulations: ["CCPA", "State privacy acts"],
  },
  {
    era: "2020_plus",
    stack: ["Workday", "HCM", "REST", "Reporting", "Dashboards"],
    env: ["Public Cloud", "Active Directory", "Jira", "Confluence"],
    processes: ["Change management", "Train-the-trainer", "Adoption tracking"],
    compliance: ["SOC 2", "Least privilege", "Access controls"],
    regulations: ["HIPAA", "GDPR"],
  },
  {
    era: "2020_plus",
    stack: ["Dynamics 365", "REST", "Power BI", "Data Mapping", "SQL"],
    env: ["Azure", "Logic Apps", "GitHub", "Prod landscape"],
    processes: ["Scrum", "Release management", "Lessons learned"],
    compliance: ["SOX", "Business continuity"],
    regulations: ["PCI-DSS"],
  },
];

export const DEFAULT_STACK_ENV_BANK: StackEnvBankDoc = {
  version: 1,
  catalog: assertDisjoint([
    ...TOOLS,
    ...PLATFORMS,
    ...PROCESSES,
    ...COMPLIANCE,
    ...REGULATIONS,
  ]),
  recipes: DEFAULT_ERA_RECIPES,
};

/** Counts for admin UI */
export function bankStats(doc: StackEnvBankDoc = DEFAULT_STACK_ENV_BANK) {
  const byKind: Record<string, number> = {};
  for (const e of doc.catalog) {
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
  }
  return {
    total: doc.catalog.length,
    byKind,
    recipes: doc.recipes.length,
  };
}
