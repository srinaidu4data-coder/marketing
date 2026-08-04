import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
/** Layout preview uses deterministic assemble-pack (same buildProjects as production). */
import { progressiveTailor } from "@/lib/resume/progressive-tailor";
import { renderDocxBuffer } from "@/lib/resume/render-docx";
import { renderPdfBuffer } from "@/lib/resume/render-pdf";
import { getLayout, RESUME_LAYOUTS, type ResumeLayoutId } from "@/lib/resume/templates";
import { renderLayoutHtmlPreview } from "@/lib/resume/render-html-preview";

const SAMPLE_JD = `Job Title: SAP S/4HANA FICO Functional Consultant
Need SAP FICO consultant with S/4HANA, GL, AP, AR, Asset Accounting.
Month-end close, integrations, stakeholder management. SAP Activate preferred.
6-month C2C contract, remote US.`;

/**
 * Must include parseable Employer/Client blocks with ≥8 bullets each so
 * assembleDeterministicPack / bullet-density gate does not throw 500.
 */
const SAMPLE_MASTER = `Sample Candidate
sample.candidate@example.com | Remote US
SAP FICO Consultant | 12+ years

TECHNICAL SKILLS
SAP S/4HANA, FICO, GL, AP, AR, Asset Accounting, Controlling, Integration, Testing, Cutover, SAP Activate

PROFESSIONAL SUMMARY
Experienced SAP consultant with progressive delivery across implementations and AMS support.

EXPERIENCE

Employer / Client: Acme Manufacturing
SAP S/4HANA FICO Lead | 2020 - Present
Remote | 2020 – Present
Environment: SAP S/4HANA, FICO, GL, AP, AR, Asset Accounting
• Led GL redesign and document splitting configuration for multi-company close.
• Configured AP payment programs and vendor master governance for shared services.
• Delivered AR dunning and credit management alignment with order-to-cash stakeholders.
• Owned asset accounting capitalization rules and depreciation areas for US entities.
• Coordinated month-end close calendar, reconciling subledgers to the general ledger.
• Integrated FI with MM and SD touchpoints for GR/IR and revenue postings.
• Executed unit and integration testing with defect triage through UAT cycles.
• Supported cutover load validation, hypercare tickets, and knowledge transfer packs.
• Documented configuration workbooks and process flows for audit readiness.
• Mentored junior consultants on Activate methodology and transport hygiene.

Employer / Client: Beta Logistics LLC
SAP FICO Consultant | 2015 - 2019
United States | 2015 – 2019
Environment: SAP ECC, FICO, GL, AP, Controlling
• Supported GL account design and financial statement version maintenance.
• Implemented AP invoice workflows and payment proposal controls.
• Assisted AR cash application improvements and exception handling.
• Built cost center hierarchies and basic controlling reports for ops leadership.
• Participated in integration testing for FI-MM inventory valuation scenarios.
• Prepared training materials and end-user guides for finance super users.
• Monitored interface errors between logistics and finance systems.
• Contributed to period-end close checklists and reconciliation templates.
• Partnered with basis and security teams on role and transport requests.
• Delivered post-go-live AMS support and continuous improvement tickets.
`;

/**
 * GET /api/layouts/preview?layoutId=ats_classic&fmt=docx|pdf|html
 * Generates a sample resume in the selected layout for visual preview.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const layoutId = (url.searchParams.get("layoutId") ||
    "ats_classic") as ResumeLayoutId;
  const fmt = (url.searchParams.get("fmt") || "docx").toLowerCase();

  const valid = RESUME_LAYOUTS.some((l) => l.id === layoutId);
  if (!valid) {
    return NextResponse.json(
      { error: "Unknown layoutId", layouts: RESUME_LAYOUTS.map((l) => l.id) },
      { status: 400 }
    );
  }

  const layout = getLayout(layoutId);
  const safeName = layout.id.replace(/[^a-z0-9_-]/gi, "_");

  let tailored: Awaited<ReturnType<typeof progressiveTailor>>;
  try {
    tailored = await progressiveTailor({
      master: SAMPLE_MASTER,
      jd: SAMPLE_JD,
      vendorName: "Sample Vendor",
      candidateName: "Sample Candidate",
      email: "sample.candidate@example.com",
      layoutId,
    });
  } catch (e) {
    console.error("layout preview tailor failed", layoutId, e);
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Layout preview generation failed",
        layoutId,
      },
      { status: 500 }
    );
  }

  if (fmt === "html") {
    try {
      const html = renderLayoutHtmlPreview(tailored.structured);
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, max-age=0, must-revalidate",
        },
      });
    } catch (e) {
      console.error("HTML preview failed", e);
      return NextResponse.json({ error: "HTML preview failed" }, { status: 500 });
    }
  }

  if (fmt === "pdf") {
    try {
      const buf = await renderPdfBuffer(tailored.structured);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="layout-preview-${safeName}.pdf"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    } catch (e) {
      console.error("PDF preview failed", e);
      return NextResponse.json({ error: "PDF preview failed" }, { status: 500 });
    }
  }

  // default DOCX
  try {
    const buf = await renderDocxBuffer(tailored.structured);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="layout-preview-${safeName}.docx"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    console.error("DOCX preview failed", e);
    return NextResponse.json({ error: "DOCX preview failed" }, { status: 500 });
  }
}
