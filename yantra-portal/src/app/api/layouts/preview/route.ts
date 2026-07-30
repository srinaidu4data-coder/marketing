import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { progressiveTailor } from "@/lib/resume/progressive-tailor";
import { renderDocxBuffer } from "@/lib/resume/render-docx";
import { renderPdfBuffer } from "@/lib/resume/render-pdf";
import { getLayout, RESUME_LAYOUTS, type ResumeLayoutId } from "@/lib/resume/templates";
import { renderLayoutHtmlPreview } from "@/lib/resume/render-html-preview";

const SAMPLE_JD = `Job Title: SAP S/4HANA FICO Functional Consultant
Need SAP FICO consultant with S/4HANA, GL, AP, AR, Asset Accounting.
Month-end close, integrations, stakeholder management. SAP Activate preferred.
6-month C2C contract, remote US.`;

const SAMPLE_MASTER = `Sample Candidate
SAP Consultant | 12+ years

TECHNICAL SKILLS
SAP S/4HANA, FICO, GL, AP, AR, Asset Accounting, Controlling, Integration, Testing, Cutover

PROFESSIONAL SUMMARY
Experienced SAP consultant with progressive delivery across implementations and AMS.`;

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
  const layoutId = (url.searchParams.get("layoutId") || "ats_classic") as ResumeLayoutId;
  const fmt = (url.searchParams.get("fmt") || "docx").toLowerCase();

  const valid = RESUME_LAYOUTS.some((l) => l.id === layoutId);
  if (!valid) {
    return NextResponse.json(
      { error: "Unknown layoutId", layouts: RESUME_LAYOUTS.map((l) => l.id) },
      { status: 400 }
    );
  }

  const layout = getLayout(layoutId);
  const tailored = await progressiveTailor({
    master: SAMPLE_MASTER,
    jd: SAMPLE_JD,
    vendorName: "Sample Vendor",
    candidateName: "Sample Candidate",
    email: "sample.candidate@example.com",
    layoutId,
  });

  const safeName = layout.id.replace(/[^a-z0-9_-]/gi, "_");

  if (fmt === "html") {
    const html = renderLayoutHtmlPreview(tailored.structured);
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
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
