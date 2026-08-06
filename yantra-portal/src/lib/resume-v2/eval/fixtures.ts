/**
 * C5 — Golden fixtures for offline eval (no live LLM required for retrieve/score unit checks).
 * Full pack quality still needs LLM; these fixtures exercise residue, retrieve, band logic.
 */

export type EvalFixture = {
  id: string;
  label: string;
  jd: string;
  masterText: string;
  masterProfileJson?: string;
  /** Optional pre-built pack JSON for scorePack dry tests */
  packProjects?: {
    role: string;
    employerOrClient: string;
    location?: string;
    duration?: string;
    techStack?: string;
    environment?: string;
    bullets: string[];
  }[];
  expect: {
    /** light retrieve should use profile slots when profile present */
    retrieveMode?: "lexical_per_slot" | "full_master";
    minSlots?: number;
    /** residue fail expected on bad pack */
    residueFail?: boolean;
  };
};

export const EVAL_FIXTURES: EvalFixture[] = [
  {
    id: "brim-fico-transfer",
    label: "SAP FICO master → BRIM JD (cross domain)",
    jd: `
SAP BRIM Senior Consultant — FI-CA, Convergent Invoicing, Open Item Management,
Dispute and Collections, integration with RAR and SD, S/4HANA utilities/bank domain,
workshops, cutover, hypercare. Must have BRIM and FI-CA experience.
`.trim(),
    masterText: `
Sri Naidu
SAP FICO Senior Consultant
Email: sri@example.com Phone: 555-0100

Professional Experience
Employer / Client: Acme Bank
Jan 2020 – Present
Senior FICO Consultant
• Led SAP FICO GL and AP configuration for month-end close
• Supported Asset Accounting and Asset Under Construction processes
• Coordinated UAT for FICO RTR workstreams

Employer / Client: Beta Corp
Jan 2017 – Dec 2019
FICO Consultant
• Implemented cost center accounting and internal orders
• Built financial reporting with report painter
`.trim(),
    masterProfileJson: JSON.stringify({
      version: 1,
      parsedAt: new Date().toISOString(),
      sourceChars: 800,
      skills: ["SAP FICO", "GL", "AP"],
      summaryLines: [],
      engagements: [
        {
          client: "Acme Bank",
          location: "Remote",
          startYear: 2020,
          endYear: "Present",
          title: "Senior FICO Consultant",
          bullets: [
            "Led SAP FICO GL and AP configuration for month-end close",
            "Supported Asset Accounting and Asset Under Construction processes",
            "Coordinated UAT for FICO RTR workstreams",
          ],
        },
        {
          client: "Beta Corp",
          location: "NY",
          startYear: 2017,
          endYear: 2019,
          title: "FICO Consultant",
          bullets: [
            "Implemented cost center accounting and internal orders",
            "Built financial reporting with report painter",
          ],
        },
      ],
      signals: { roleLineCount: 2, clientLineCount: 2, companyDateLineCount: 2 },
      warnings: [],
    }),
    packProjects: [
      {
        role: "BRIM Consultant",
        employerOrClient: "Acme Bank",
        duration: "2020 – Present",
        techStack: "SAP BRIM, FI-CA",
        bullets: [
          "Configured FI-CA open item management for dispute workflows",
          "Led BRIM convergent invoicing design with finance stakeholders",
          "Supported cutover and hypercare for S/4HANA BRIM release",
          "Integrated BRIM rating flows with RAR and SD partners",
          "Ran workshops on collections strategy with business owners",
          "Documented FI-CA posting models for audit readiness",
          "Stabilized production defects during hypercare",
          "Delivered knowledge transfer to sustainment teams",
        ],
      },
      {
        role: "FICO Consultant",
        employerOrClient: "Beta Corp",
        duration: "2017 – 2019",
        techStack: "SAP FICO, GL, CO",
        bullets: [
          "Implemented cost center accounting and internal orders",
          "Built financial reporting with report painter",
          "Supported month-end close for GL and AP",
          "Configured asset accounting processes",
          "Partnered on UAT for FICO workstreams",
          "Maintained configuration documentation",
          "Trained business users on FICO reports",
          "Closed defects from integration testing",
        ],
      },
    ],
    expect: {
      retrieveMode: "lexical_per_slot",
      minSlots: 2,
      residueFail: true,
    },
  },
  {
    id: "same-domain-brim",
    label: "BRIM-aligned pack should not hard-fail residue on BRIM JD",
    jd: `SAP BRIM FI-CA Convergent Invoicing Open Item Dispute Collections S/4HANA`.trim(),
    masterText: `Employer / Client: Acme\n2020-Present\nBRIM Consultant\n• FI-CA open items`,
    masterProfileJson: JSON.stringify({
      version: 1,
      parsedAt: new Date().toISOString(),
      sourceChars: 200,
      skills: ["BRIM"],
      summaryLines: [],
      engagements: [
        {
          client: "Acme",
          location: "",
          startYear: 2020,
          endYear: "Present",
          title: "BRIM Consultant",
          bullets: [
            "Configured FI-CA open item management",
            "Led BRIM convergent invoicing design",
          ],
        },
      ],
      signals: { roleLineCount: 1, clientLineCount: 1, companyDateLineCount: 1 },
      warnings: [],
    }),
    packProjects: [
      {
        role: "BRIM Senior Consultant",
        employerOrClient: "Acme",
        techStack: "SAP BRIM FI-CA",
        bullets: Array.from({ length: 8 }, (_, i) =>
          `Delivered BRIM FI-CA open item and dispute workstream item ${i + 1}`
        ),
      },
    ],
    expect: {
      retrieveMode: "lexical_per_slot",
      minSlots: 1,
      residueFail: false,
    },
  },
];
