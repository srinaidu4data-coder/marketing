/**
 * Modern PDF resume renderer (v3.1) — RT P0 fixes applied
 */
import PDFDocument from "pdfkit";
import { getLayout, type StructuredResume } from "./templates";
import {
  isBullet,
  isEmployerClientLine,
  isEnvToolsLine,
  isJobTitleLine,
  isMetaLine,
  pdfSafeBullet,
  shouldSkipExportLine,
  stripBullet,
} from "./line-class";

export async function renderPdfBuffer(resume: StructuredResume): Promise<Buffer> {
  const layout = getLayout(resume.layoutId);
  const accent = layout.style.accent;
  const muted = layout.style.muted;
  const soft = layout.style.soft;
  const bulletGlyph = pdfSafeBullet(layout.style.bullet);

  return new Promise((resolve, reject) => {
    const margin = layout.id === "modern_minimal" ? 54 : 50;
    const doc = new PDFDocument({
      margin,
      size: "LETTER",
      bufferPages: true,
      info: {
        Title: `${resume.candidateName} — ${resume.headline}`,
        Author: "Role Forge Co-Pilot",
        Subject: `Resume layout: ${layout.name}`,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const contentLeft = margin + (layout.style.leftRail ? 14 : 0);
    const contentWidth = pageW - contentLeft - margin;

    const paintRail = () => {
      if (layout.style.leftRail) {
        doc.save();
        doc.rect(0, 0, 10, pageH).fill(accent);
        doc.restore();
      }
    };
    paintRail();

    // Distinct header per layout (structure, not only color)
    if (layout.id === "consultant_band" || layout.style.headerBand) {
      doc.save();
      doc.rect(0, 0, pageW, 96).fill(accent);
      doc.rect(0, 90, pageW, 10).fill("#ea580c");
      doc.fillColor("#ffffff").fontSize(18).font("Helvetica-Bold");
      doc.text(resume.candidateName.toUpperCase(), contentLeft, 24, {
        width: contentWidth,
        characterSpacing: 1.5,
      });
      doc.fillColor("#ffedd5").fontSize(11).font("Helvetica");
      doc.text(resume.headline, contentLeft, doc.y + 4, { width: contentWidth });
      if (resume.contactLine) {
        doc.fillColor("#fed7aa").fontSize(9).text(resume.contactLine, contentLeft, doc.y + 2, {
          width: contentWidth,
        });
      }
      doc.restore();
      doc.y = 118;
      doc.x = contentLeft;
    } else if (layout.id === "executive_serif") {
      doc.x = contentLeft;
      doc.y = margin + 8;
      doc
        .fillColor("#b8860b")
        .fontSize(8)
        .font("Helvetica")
        .text("E X E C U T I V E   P R O F I L E", {
          align: "center",
          width: contentWidth,
          characterSpacing: 2,
        });
      doc.moveDown(0.45);
      doc
        .fillColor(accent)
        .fontSize(26)
        .font("Times-Bold")
        .text(resume.candidateName, { align: "center", width: contentWidth });
      doc
        .fillColor(muted)
        .fontSize(11)
        .font("Times-Italic")
        .text(resume.headline, { align: "center", width: contentWidth });
      if (resume.contactLine) {
        doc.fillColor(muted).fontSize(9).font("Helvetica").text(resume.contactLine, {
          align: "center",
          width: contentWidth,
        });
      }
      doc.moveDown(0.35);
      const y = doc.y;
      doc
        .strokeColor("#b8860b")
        .lineWidth(1.5)
        .moveTo(contentLeft + contentWidth * 0.28, y)
        .lineTo(contentLeft + contentWidth * 0.72, y)
        .stroke();
      doc.y = y + 14;
    } else if (layout.id === "modern_minimal") {
      doc.x = contentLeft;
      doc.y = margin + 6;
      doc.fillColor("#a1a1aa").fontSize(8).font("Helvetica-Bold").text("PORTFOLIO", {
        characterSpacing: 3,
      });
      doc.moveDown(0.4);
      doc
        .fillColor("#09090b")
        .fontSize(30)
        .font("Helvetica-Bold")
        .text(resume.candidateName, { width: contentWidth * 0.9 });
      doc.fillColor(muted).fontSize(10).font("Helvetica").text(resume.headline, {
        width: contentWidth,
      });
      if (resume.contactLine) {
        doc.fillColor(muted).fontSize(9).text(resume.contactLine, { width: contentWidth });
      }
      doc.moveDown(1.1);
    } else if (layout.id === "technical_dense") {
      doc.x = contentLeft;
      doc.y = margin;
      doc.save();
      doc.roundedRect(contentLeft, doc.y, 48, 15, 3).fill("#22d3ee");
      doc.fillColor("#0f172a").fontSize(8).font("Helvetica-Bold").text("TECH", contentLeft + 10, doc.y + 3.5);
      doc.restore();
      doc.y += 26;
      doc
        .fillColor("#22d3ee")
        .fontSize(15)
        .font("Helvetica-Bold")
        .text(resume.candidateName.toUpperCase(), {
          width: contentWidth,
          characterSpacing: 1.4,
        });
      doc.fillColor("#cbd5e1").fontSize(10).font("Helvetica").text(resume.headline, {
        width: contentWidth,
      });
      if (resume.contactLine) {
        doc.fillColor("#94a3b8").fontSize(8).font("Courier").text(resume.contactLine, {
          width: contentWidth,
        });
      }
      doc.moveDown(0.45);
      const y = doc.y;
      doc
        .strokeColor("#334155")
        .lineWidth(1)
        .moveTo(contentLeft, y)
        .lineTo(contentLeft + contentWidth, y)
        .stroke();
      doc.y = y + 10;
    } else if (layout.id === "timeline_progressive") {
      doc.x = contentLeft;
      doc.y = margin;
      doc
        .fillColor("#059669")
        .fontSize(8)
        .font("Helvetica-Bold")
        .text("EARLY  →  MID  →  RECENT", { characterSpacing: 1 });
      doc.moveDown(0.4);
      doc
        .fillColor(accent)
        .fontSize(22)
        .font("Helvetica-Bold")
        .text(resume.candidateName, { width: contentWidth });
      doc.fillColor(muted).fontSize(10).font("Helvetica").text(resume.headline, {
        width: contentWidth,
      });
      if (resume.contactLine) {
        doc.fillColor(muted).fontSize(9).text(resume.contactLine, { width: contentWidth });
      }
      doc.moveDown(0.35);
      const y = doc.y;
      doc
        .strokeColor("#10b981")
        .lineWidth(3)
        .moveTo(contentLeft, y)
        .lineTo(contentLeft + 72, y)
        .stroke();
      doc.y = y + 12;
    } else {
      // ats_classic — centered corporate
      doc.x = contentLeft;
      doc.y = margin;
      doc
        .fillColor(accent)
        .fontSize(18)
        .font("Helvetica-Bold")
        .text(resume.candidateName.toUpperCase(), {
          width: contentWidth,
          align: "center",
          characterSpacing: 2,
        });
      doc.fillColor(muted).fontSize(10).font("Helvetica").text(resume.headline, {
        width: contentWidth,
        align: "center",
      });
      if (resume.contactLine) {
        doc.fillColor(muted).fontSize(9).text(resume.contactLine, {
          width: contentWidth,
          align: "center",
        });
      }
      doc.moveDown(0.35);
      const y = doc.y;
      doc
        .strokeColor(accent)
        .lineWidth(2)
        .moveTo(contentLeft, y)
        .lineTo(contentLeft + contentWidth, y)
        .stroke();
      doc.y = y + 12;
    }

    const ensureSpace = (need: number) => {
      if (doc.y + need > pageH - margin) {
        doc.addPage();
        paintRail();
        doc.x = contentLeft;
        doc.y = margin;
      }
    };

    for (const sec of resume.sections) {
      if (sec.heading === "Progressive Experience Notes") continue;
      ensureSpace(48);
      const heading =
        layout.style.headingCase === "upper"
          ? sec.heading.toUpperCase()
          : sec.heading;

      doc
        .fillColor(accent)
        .fontSize(layout.style.headingSize)
        .font("Helvetica-Bold")
        .text(heading, contentLeft, doc.y, { width: contentWidth });

      if (layout.style.sectionBar) {
        const hy = doc.y + 2;
        doc
          .save()
          .strokeColor(accent)
          .lineWidth(1.5)
          .moveTo(contentLeft, hy)
          .lineTo(contentLeft + Math.min(140, contentWidth * 0.4), hy)
          .stroke()
          .restore();
        doc.y = hy + 8;
      } else {
        doc.moveDown(0.25);
      }

      for (const raw of sec.lines) {
        const line = raw.trimEnd();
        if (!line.trim()) {
          doc.moveDown(0.15);
          continue;
        }
        if (shouldSkipExportLine(line)) continue;
        ensureSpace(28);

        if (isJobTitleLine(line) && layout.style.boldJobTitles) {
          doc
            .fillColor("#0f172a")
            .fontSize(layout.style.bodySize + 0.5)
            .font("Helvetica-Bold")
            .text(line, contentLeft, doc.y, { width: contentWidth });
          doc.moveDown(0.08);
          continue;
        }

        if (isEmployerClientLine(line)) {
          doc
            .fillColor(accent)
            .fontSize(layout.style.bodySize)
            .font("Helvetica-Bold")
            .text(line, contentLeft, doc.y, { width: contentWidth });
          doc.moveDown(0.1);
          continue;
        }

        if (isMetaLine(line)) {
          doc
            .fillColor(muted)
            .fontSize(layout.style.bodySize - 0.5)
            .font("Helvetica-Oblique")
            .text(line, contentLeft, doc.y, { width: contentWidth });
          doc.moveDown(0.12);
          continue;
        }

        if (
          isEnvToolsLine(line) ||
          (sec.heading.toLowerCase().includes("skill") && !isBullet(line))
        ) {
          const display = line.replace(/^Environment\s*\/\s*tools in period:\s*/i, "Stack: ");
          const textH = doc.heightOfString(display, { width: contentWidth - 12 });
          ensureSpace(textH + 10);
          const by = doc.y;
          doc.save();
          doc.roundedRect(contentLeft, by - 2, contentWidth, textH + 8, 3).fill(soft);
          doc.restore();
          doc
            .fillColor("#1e293b")
            .fontSize(layout.style.bodySize)
            .font("Helvetica")
            .text(display, contentLeft + 6, by + 2, { width: contentWidth - 12 });
          doc.y = by + textH + 10;
          continue;
        }

        if (isBullet(line)) {
          const content = stripBullet(line);
          const textX = contentLeft + 16;
          const textW = contentWidth - 16;
          const h = doc.heightOfString(content, { width: textW });
          ensureSpace(h + 6);
          const by = doc.y;
          // Draw filled circle instead of missing unicode glyphs
          doc.save();
          doc.circle(contentLeft + 5, by + 4, 2).fill(accent);
          doc.restore();
          doc
            .fillColor("#1e293b")
            .fontSize(layout.style.bodySize)
            .font("Helvetica")
            .text(content, textX, by, { width: textW, lineGap: 2 });
          doc.y = Math.max(doc.y, by + h) + 4;
          continue;
        }

        const sumTight = sec.heading === "Professional Summary";
        doc
          .fillColor("#1e293b")
          .fontSize(layout.style.bodySize)
          .font("Helvetica")
          .text(line, contentLeft, doc.y, {
            width: contentWidth,
            lineGap: sumTight ? 1.5 : 2,
          });
        doc.moveDown(sumTight ? 0.12 : 0.15);
      }
      doc.moveDown(0.2);
    }

    ensureSpace(30);
    doc
      .moveDown(0.4)
      .strokeColor("#e2e8f0")
      .lineWidth(0.8)
      .moveTo(contentLeft, doc.y)
      .lineTo(contentLeft + contentWidth, doc.y)
      .stroke();
    doc
      .fillColor("#94a3b8")
      .fontSize(8)
      .font("Helvetica")
      .text(`${layout.name}  ·  Professional resume`, contentLeft, doc.y + 6, {
        width: contentWidth,
      });

    void bulletGlyph;
    doc.end();
  });
}
