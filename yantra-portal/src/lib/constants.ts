/**
 * Role Forge system constants.
 * DEFAULT_PROMPT = Prompt Bible (v3) — sole writing source for generation.
 * Locks: name · employers · project set · dates. Free craft elsewhere.
 */

import { BIBLE_PROMPT } from "./resume-v2/bible-prompt";

/** Mega Bible — high-freedom craft; identity locks only. */
export const DEFAULT_PROMPT = BIBLE_PROMPT;

/**
 * Default vendor subject — third person (employee writes about the candidate).
 * Never use “my profile / I am / please find my…”.
 */
export const DEFAULT_EMAIL_SUBJECT =
  "{{candidate_name}} | {{job_title_or_vendor_line}} | Available for review";

/**
 * Curated subject lines for marketing/sales to pick from (third person, C2C-style).
 * Placeholders: {{candidate_name}}, {{job_title_or_vendor_line}}, {{vendor_name}}
 */
export const EMAIL_SUBJECT_PRESETS: {
  id: string;
  label: string;
  tone: string;
  template: string;
  recommended?: boolean;
}[] = [
  {
    id: "available",
    label: "Available for review",
    tone: "Clear · neutral",
    template:
      "{{candidate_name}} | {{job_title_or_vendor_line}} | Available for review",
    recommended: true,
  },
  {
    id: "submission",
    label: "Profile submission",
    tone: "Formal staffing",
    template:
      "Profile submission — {{candidate_name}} ({{job_title_or_vendor_line}})",
  },
  {
    id: "requirement",
    label: "For requirement",
    tone: "Requirement-led",
    template:
      "{{job_title_or_vendor_line}} — {{candidate_name}} for your requirement",
  },
  {
    id: "vendor_first",
    label: "Vendor first",
    tone: "Account-led",
    template:
      "{{vendor_name}} — {{candidate_name}} | {{job_title_or_vendor_line}}",
  },
  {
    id: "sr_soft",
    label: "SR SOFT branded",
    tone: "Brand + role",
    template:
      "SR SOFT LLC | {{candidate_name}} | {{job_title_or_vendor_line}}",
  },
  {
    id: "shortlist",
    label: "Shortlist ready",
    tone: "Confident · concise",
    template:
      "{{candidate_name}} — {{job_title_or_vendor_line}} — shortlist ready",
  },
  {
    id: "consultant",
    label: "Consultant profile",
    tone: "Classic agency",
    template:
      "Consultant profile: {{candidate_name}} – {{job_title_or_vendor_line}}",
  },
  {
    id: "attp_tight",
    label: "Role only (tight)",
    tone: "Minimal inbox",
    template: "{{candidate_name}} – {{job_title_or_vendor_line}}",
  },
];

export const DEFAULT_EMAIL_BODY = `Hello {{vendor_name}},

{{#employee_note}}{{employee_note}}{{/employee_note}}
Please find attached the resume of our consultant {{candidate_name}} for the following requirement:

{{job_requirement_summary}}

{{candidate_name}} has been reviewed against this requirement and is available to discuss further.

Best regards,
{{employee_name}}
{{employee_email}}
Marketing Team — SR SOFT LLC`;

export const SYSTEM_PREAMBLE = `Role Forge locked system preamble (not editable by admins in UI body editor):
You must never invent employers, dates, certifications, or client names that are not supported by the master resume. Preserve absolute factual integrity while aggressively rewriting presentation to match the JD.
Every project/engagement block MUST show Employer / Client: <name> on its own line (sourced from master when present).
Apply research structure: title fluency, schema match to JD, primacy of recent proof, progressive career narrative, temporal skill integrity, peak–end impact closes.
Optimize for client submit: domain-honest skills, progressive tenure, clear employer attribution, ≥90% JD keyword coverage.`;

export const PROMPT_PLACEHOLDERS = [
  "{{job_requirement}}",
  "{{vendor_context}}",
  "{{candidate_master_resume}}",
];

export const EMAIL_PLACEHOLDERS = [
  "{{candidate_name}}",
  "{{job_title_or_vendor_line}}",
  "{{vendor_name}}",
  "{{employee_name}}",
  "{{employee_email}}",
  "{{employee_note}}",
  "{{job_requirement_summary}}",
];
