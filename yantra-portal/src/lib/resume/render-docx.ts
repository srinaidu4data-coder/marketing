/**
 * Modern DOCX resume renderer (v3.1) — RT P0 fixes applied
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  BorderStyle,
  AlignmentType,
  ShadingType,
  convertInchesToTwip,
} from "docx";
import { getLayout, hexNoHash, type LayoutDef, type StructuredResume } from "./templates";
import { stripEngineFooter } from "./strip-engine-footer";
import { getDocxFonts, type DocxFontSet } from "./docx-fonts";

/**
 * Build DOCX from stored tailored plain text (when /tmp pack file is gone).
 * Honors layoutId for accent / fonts / header band so layouts don't all look identical.
 */
export async function renderDocxFromPlainText(opts: {
  candidateName: string;
  jobTitle?: string;
  text: string;
  layoutId?: string | null;
}): Promise<Buffer> {
  const layout = getLayout(opts.layoutId);
  const fonts = fontsFor(layout);
  const accent = hexNoHash(layout.style.accent);
  const nameF = fonts.name;
  const bodyF = fonts.body;
  const headF = fonts.headline;
  const lines = stripEngineFooter(opts.text || "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  const children: Paragraph[] = [];
  // Header — layout-aware
  if (layout.style.headerBand) {
    children.push(
      new Paragraph({
        shading: { type: ShadingType.CLEAR, fill: accent },
        spacing: { after: 0 },
        children: [
          new TextRun({
            text: (opts.candidateName || "Candidate").toUpperCase(),
            bold: true,
            size: layout.style.nameSize * 2,
            color: "FFFFFF",
            font: nameF,
            characterSpacing: 60,
          }),
        ],
      })
    );
    if (opts.jobTitle) {
      children.push(
        new Paragraph({
          shading: { type: ShadingType.CLEAR, fill: accent },
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: opts.jobTitle,
              size: layout.style.headlineSize * 2,
              color: "E7E5E4",
              font: headF,
            }),
          ],
        })
      );
    }
  } else {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: (opts.candidateName || "Candidate").toUpperCase(),
            bold: true,
            size: layout.style.nameSize * 2,
            font: nameF,
            color: accent,
          }),
        ],
      })
    );
    if (opts.jobTitle) {
      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: opts.jobTitle,
              size: layout.style.headlineSize * 2,
              font: headF,
              color: hexNoHash(layout.style.muted),
            }),
          ],
        })
      );
    }
    children.push(
      new Paragraph({
        border: {
          bottom: {
            style: BorderStyle.SINGLE,
            size: 12,
            color: accent,
            space: 1,
          },
        },
        spacing: { after: 200 },
        children: [],
      })
    );
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      children.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
      continue;
    }
    // Skip duplicate name/title lines at top of stored text
    if (
      opts.candidateName &&
      line.toUpperCase() === opts.candidateName.toUpperCase()
    ) {
      continue;
    }
    if (opts.jobTitle && line === opts.jobTitle) continue;
    if (/^-{3,}|^={3,}/.test(line.trim())) continue;

    const isHeading =
      line === line.toUpperCase() &&
      line.length < 80 &&
      !/^[•▸→–\-\*]/.test(line) &&
      /[A-Z]/.test(line);

    if (isHeading) {
      const headingText =
        layout.style.headingCase === "upper" ? line.toUpperCase() : line;
      children.push(
        new Paragraph({
          spacing: { before: 240, after: 80 },
          children: [
            new TextRun({
              text: headingText,
              bold: true,
              size: layout.style.headingSize * 2,
              font: fonts.heading,
              color: accent,
            }),
          ],
        })
      );
      if (layout.style.sectionBar) {
        children.push(
          new Paragraph({
            border: {
              bottom: {
                style: BorderStyle.SINGLE,
                size: 12,
                color: accent,
                space: 1,
              },
            },
            spacing: { after: 100 },
            children: [],
          })
        );
      }
      continue;
    }

    const bullet = /^[•▸→–\-\*]\s*/.test(line.trim());
    const body = line.replace(/^[•▸→–\-\*]\s*/, "");
    const bulletGlyph = layout.style.bullet || "•";
    const isStack =
      /^(Environment|Stack|Modules|Tech Stack|Tools)\b/i.test(body) ||
      /^Environment\s*:/i.test(body);
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        indent: bullet ? { left: convertInchesToTwip(0.2) } : undefined,
        children: [
          new TextRun({
            text: bullet ? `${bulletGlyph} ${body}` : body,
            size: layout.style.bodySize * 2,
            font: isStack ? fonts.mono : bodyF,
          }),
        ],
      })
    );
  }

  const doc = new Document({
    styles: docxDefaultStyles(fonts, layout.style.bodySize),
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.6),
              bottom: convertInchesToTwip(0.6),
              left: convertInchesToTwip(0.7),
              right: convertInchesToTwip(0.7),
            },
          },
        },
        children,
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
import {
  isBullet,
  isEmployerClientLine,
  isEnvToolsLine,
  isJobTitleLine,
  isMetaLine,
  isSkillLine,
  shouldSkipExportLine,
  stripBullet,
} from "./line-class";

function fontsFor(layout: LayoutDef): DocxFontSet {
  return getDocxFonts(layout.id, layout.style);
}

function docxDefaultStyles(fonts: DocxFontSet, bodySizePt: number) {
  return {
    default: {
      document: {
        run: {
          font: fonts.body,
          size: Math.max(18, bodySizePt * 2),
        },
      },
    },
  };
}

function sectionHeading(
  text: string,
  layout: LayoutDef,
  accent: string,
  fonts?: DocxFontSet
): Paragraph[] {
  const f = fonts || fontsFor(layout);
  const headingText =
    layout.style.headingCase === "upper" ? text.toUpperCase() : text;
  const paras: Paragraph[] = [
    new Paragraph({
      spacing: { before: 320, after: layout.style.sectionBar ? 60 : 120 },
      children: [
        new TextRun({
          text: headingText,
          bold: true,
          size: layout.style.headingSize * 2,
          color: accent,
          font: f.heading,
          characterSpacing: layout.style.headingCase === "upper" ? 60 : 0,
        }),
      ],
    }),
  ];
  if (layout.style.sectionBar) {
    paras.push(
      new Paragraph({
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 18, color: accent, space: 1 },
        },
        spacing: { after: 160 },
        children: [],
      })
    );
  }
  return paras;
}

export async function renderDocxBuffer(resume: StructuredResume): Promise<Buffer> {
  const layout = getLayout(resume.layoutId);
  const fonts = fontsFor(layout);
  const accent = hexNoHash(layout.style.accent);
  const muted = hexNoHash(layout.style.muted);
  const soft = hexNoHash(layout.style.soft);
  const children: Paragraph[] = [];
  const center =
    layout.id === "executive_serif" ||
    layout.id === "pyramid_brief" ||
    layout.id === "ats_classic" ||
    layout.id === "signal_classic";

  if (layout.style.headerBand) {
    children.push(
      new Paragraph({
        shading: { type: ShadingType.CLEAR, fill: accent },
        spacing: { after: 0 },
        children: [
          new TextRun({
            text: resume.candidateName.toUpperCase(),
            bold: true,
            size: layout.style.nameSize * 2,
            color: "FFFFFF",
            font: fonts.name,
            characterSpacing: 80,
          }),
        ],
      })
    );
    children.push(
      new Paragraph({
        shading: { type: ShadingType.CLEAR, fill: accent },
        spacing: { after: 0 },
        children: [
          new TextRun({
            text: resume.headline,
            size: layout.style.headlineSize * 2,
            color: "E7E5E4",
            font: fonts.headline,
          }),
        ],
      })
    );
    children.push(
      new Paragraph({
        shading: { type: ShadingType.CLEAR, fill: accent },
        spacing: { after: 240 },
        children: resume.contactLine
          ? [
              new TextRun({
                text: resume.contactLine,
                size: 18,
                color: "D6D3D1",
                font: fonts.body,
              }),
            ]
          : [],
      })
    );
  } else {
    const align = center ? AlignmentType.CENTER : AlignmentType.LEFT;
    const displayName =
      layout.id === "ats_classic" ||
      layout.id === "signal_classic" ||
      layout.id === "technical_dense" ||
      layout.id === "stack_spec" ||
      layout.id === "impact_banner" ||
      layout.id === "consultant_band"
        ? resume.candidateName.toUpperCase()
        : resume.candidateName;
    const nameSize =
      layout.id === "modern_minimal"
        ? 52
        : layout.id === "executive_serif" || layout.id === "pyramid_brief"
          ? 48
          : layout.style.nameSize * 2;
    const nameSpacing =
      layout.id === "ats_classic" || layout.id === "signal_classic"
        ? 120
        : layout.id === "modern_minimal"
          ? -20
          : layout.id === "technical_dense" || layout.id === "stack_spec"
            ? 100
            : 40;

    if (layout.id === "executive_serif" || layout.id === "pyramid_brief") {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: "E X E C U T I V E   P R O F I L E",
              size: 14,
              color: "b8860b",
              font: fonts.headline,
              characterSpacing: 80,
            }),
          ],
        })
      );
    }
    if (layout.id === "modern_minimal") {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: "PORTFOLIO RESUME",
              size: 14,
              color: "a1a1aa",
              font: fonts.headline,
              characterSpacing: 160,
            }),
          ],
        })
      );
    }
    if (layout.id === "timeline_progressive") {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: "GROWTH  →  MID  →  RECENT",
              size: 16,
              color: "059669",
              font: fonts.body,
              bold: true,
              characterSpacing: 40,
            }),
          ],
        })
      );
    }
    // Layout badge from style (TECH PACK, PORTFOLIO, etc.)
    const badge = (layout.style as { badge?: string }).badge;
    if (badge) {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          shading: {
            type: ShadingType.CLEAR,
            fill: hexNoHash(layout.style.accent),
          },
          children: [
            new TextRun({
              text: `  ${badge}  `,
              size: 16,
              color: "FFFFFF",
              font: fonts.mono,
              bold: true,
            }),
          ],
        })
      );
    }

    children.push(
      new Paragraph({
        alignment: align,
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: displayName,
            bold: true,
            size: nameSize,
            font: fonts.name,
            color: accent,
            characterSpacing: nameSpacing,
          }),
        ],
      })
    );
    children.push(
      new Paragraph({
        alignment: align,
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: resume.headline,
            size: layout.style.headlineSize * 2,
            font: fonts.headline,
            color: muted,
            italics:
              layout.id === "executive_serif" ||
              layout.id === "pyramid_brief",
          }),
        ],
      })
    );
    if (resume.contactLine) {
      children.push(
        new Paragraph({
          alignment: align,
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: resume.contactLine,
              size:
                layout.id === "technical_dense" || layout.id === "stack_spec"
                  ? 16
                  : 18,
              color: muted,
              font:
                layout.id === "technical_dense" || layout.id === "stack_spec"
                  ? fonts.mono
                  : fonts.body,
            }),
          ],
        })
      );
    }
    if (layout.id === "executive_serif" || layout.id === "pyramid_brief") {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: {
            bottom: { style: BorderStyle.DOUBLE, size: 12, color: "b8860b", space: 1 },
          },
          spacing: { after: 240 },
          children: [],
        })
      );
    } else if (layout.id === "modern_minimal") {
      children.push(new Paragraph({ spacing: { after: 280 }, children: [] }));
    } else if (layout.style.divider === "double") {
      children.push(
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.DOUBLE, size: 12, color: accent, space: 1 },
          },
          spacing: { after: 200 },
          children: [],
        })
      );
    } else if (layout.style.divider !== "space") {
      children.push(
        new Paragraph({
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: layout.id === "ats_classic" ? 18 : 24,
              color: accent,
              space: 1,
            },
          },
          spacing: { after: 200 },
          children: [],
        })
      );
    } else {
      children.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
    }
  }

  for (const sec of resume.sections) {
    if (sec.heading === "Progressive Experience Notes") continue;
    children.push(...sectionHeading(sec.heading, layout, accent, fonts));

    for (const raw of sec.lines) {
      const line = raw.trimEnd();
      if (!line.trim()) {
        children.push(new Paragraph({ spacing: { after: 40 }, children: [] }));
        continue;
      }
      if (shouldSkipExportLine(line)) continue;

      if (isJobTitleLine(line) && layout.style.boldJobTitles) {
        children.push(
          new Paragraph({
            spacing: { before: 160, after: 20 },
            children: [
              new TextRun({
                text: line,
                bold: true,
                size: (layout.style.bodySize + 1) * 2,
                font: fonts.headline,
                color: "0f172a",
              }),
            ],
          })
        );
        continue;
      }

      if (isEmployerClientLine(line)) {
        children.push(
          new Paragraph({
            spacing: { before: 20, after: 40 },
            children: [
              new TextRun({
                text: line,
                bold: true,
                size: layout.style.bodySize * 2,
                font: fonts.body,
                color: hexNoHash(accent),
              }),
            ],
          })
        );
        continue;
      }

      if (isMetaLine(line)) {
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: line,
                size: (layout.style.bodySize - 1) * 2,
                font: fonts.body,
                color: muted,
                italics: true,
              }),
            ],
          })
        );
        continue;
      }

      if (isEnvToolsLine(line) || isSkillLine(line) || sec.heading.toLowerCase().includes("skill")) {
        const display = line.replace(/^Environment\s*\/\s*tools in period:\s*/i, "Stack: ");
        children.push(
          new Paragraph({
            spacing: { after: 80 },
            shading: { type: ShadingType.CLEAR, fill: soft },
            children: [
              new TextRun({
                text: display,
                size: layout.style.bodySize * 2,
                font: fonts.mono,
                color: "1e293b",
              }),
            ],
          })
        );
        continue;
      }

      if (isBullet(line)) {
        const content = stripBullet(line);
        children.push(
          new Paragraph({
            spacing: { after: layout.id === "technical_dense" ? 50 : 70, line: 276 },
            indent: { left: convertInchesToTwip(0.2), hanging: convertInchesToTwip(0.15) },
            children: [
              new TextRun({
                text: `${layout.style.bullet === "▸" ? "•" : layout.style.bullet}  `,
                size: layout.style.bodySize * 2,
                color: accent,
                font: fonts.body,
              }),
              new TextRun({
                text: content,
                size: layout.style.bodySize * 2,
                font: fonts.body,
                color: "1e293b",
              }),
            ],
          })
        );
        continue;
      }

      children.push(
        new Paragraph({
          spacing: {
            after: sec.heading === "Professional Summary" ? 80 : 100,
            line: sec.heading === "Professional Summary" ? 264 : 276,
          },
          children: [
            new TextRun({
              text: line,
              size: layout.style.bodySize * 2,
              font: fonts.body,
              color: "1e293b",
            }),
          ],
        })
      );
    }
  }

  // No product/engine footer — vendor-facing DOCX only

  const margin = layout.id === "modern_minimal" ? 0.85 : 0.7;
  const doc = new Document({
    styles: docxDefaultStyles(fonts, layout.style.bodySize),
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(margin),
              bottom: convertInchesToTwip(margin),
              left: convertInchesToTwip(margin),
              right: convertInchesToTwip(margin),
            },
          },
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
