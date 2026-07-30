/**
 * Per-layout HTML previews with radically different structure & aura.
 */
import { getLayout, type StructuredResume } from "./templates";
import { getDna } from "./layout-themes";
import {
  isBullet,
  isEnvToolsLine,
  isEmployerClientLine,
  isJobTitleLine,
  isMetaLine,
  shouldSkipExportLine,
  stripBullet,
} from "./line-class";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSections(resume: StructuredResume, dna: ReturnType<typeof getDna>) {
  return resume.sections
    .filter((s) => s.heading !== "Progressive Experience Notes")
    .map((sec) => {
      const parts: string[] = [];
      let listOpen = false;
      const flush = () => {
        if (listOpen) {
          parts.push("</ul>");
          listOpen = false;
        }
      };
      for (const raw of sec.lines) {
        const line = raw.trimEnd();
        if (!line.trim()) {
          flush();
          parts.push('<div class="spacer"></div>');
          continue;
        }
        if (shouldSkipExportLine(line)) continue;

        if (isBullet(line)) {
          if (!listOpen) {
            parts.push(`<ul class="bullets bullets-${dna.bulletStyle}">`);
            listOpen = true;
          }
          parts.push(`<li>${escapeHtml(stripBullet(line))}</li>`);
          continue;
        }
        flush();
        if (isJobTitleLine(line)) {
          parts.push(`<p class="job">${escapeHtml(line)}</p>`);
        } else if (isEmployerClientLine(line)) {
          parts.push(`<p class="employer">${escapeHtml(line)}</p>`);
        } else if (isMetaLine(line)) {
          parts.push(`<p class="meta">${escapeHtml(line)}</p>`);
        } else if (isEnvToolsLine(line) || sec.heading.toLowerCase().includes("skill")) {
          const d = line.replace(/^Environment\s*\/\s*tools in period:\s*/i, "Stack: ");
          parts.push(`<p class="skill skill-${dna.skillStyle}">${escapeHtml(d)}</p>`);
        } else {
          parts.push(`<p class="line">${escapeHtml(line)}</p>`);
        }
      }
      flush();
      return `<section class="sec"><h2>${escapeHtml(sec.heading)}</h2>${parts.join("\n")}</section>`;
    })
    .join("\n");
}

function headerHtml(
  resume: StructuredResume,
  dna: ReturnType<typeof getDna>
) {
  const name = escapeHtml(resume.candidateName);
  const headline = escapeHtml(resume.headline);
  const contact = escapeHtml(resume.contactLine || "");

  switch (dna.headerMode) {
    case "full_band":
      return `<header class="hdr band">
        <div class="band-inner">
          <p class="aura">${escapeHtml(dna.aura)}</p>
          <h1>${name}</h1>
          <p class="headline">${headline}</p>
          <p class="contact">${contact}</p>
        </div>
      </header>`;
    case "centered_serif_elegant":
      return `<header class="hdr elegant">
        <p class="aura">${escapeHtml(dna.aura)}</p>
        <h1>${name}</h1>
        <div class="gold-rule"></div>
        <p class="headline">${headline}</p>
        <p class="contact">${contact}</p>
        <div class="gold-rule thin"></div>
      </header>`;
    case "centered_classic":
      return `<header class="hdr classic">
        <p class="aura">${escapeHtml(dna.aura)}</p>
        <h1>${name}</h1>
        <p class="headline">${headline}</p>
        <p class="contact">${contact}</p>
        <hr class="full-rule"/>
      </header>`;
    case "left_rail_tech":
      return `<header class="hdr tech">
        <div class="tech-badge">TECH</div>
        <p class="aura">${escapeHtml(dna.aura)}</p>
        <h1>${name}</h1>
        <p class="headline">${headline}</p>
        <p class="contact mono">${contact}</p>
      </header>`;
    case "timeline_rail":
      return `<header class="hdr timeline">
        <p class="aura">${escapeHtml(dna.aura)}</p>
        <h1>${name}</h1>
        <p class="headline">${headline}</p>
        <p class="contact">${contact}</p>
        <div class="growth-pills"><span>Early</span><span>→</span><span>Mid</span><span>→</span><span>Recent</span></div>
      </header>`;
    case "minimal_hero":
    default:
      return `<header class="hdr minimal">
        <p class="aura">${escapeHtml(dna.aura)}</p>
        <h1>${name}</h1>
        <p class="headline">${headline}</p>
        <p class="contact">${contact}</p>
      </header>`;
  }
}

export function renderLayoutHtmlPreview(resume: StructuredResume): string {
  const layout = getLayout(resume.layoutId);
  const dna = getDna(resume.layoutId);
  const sections = buildSections(resume, dna);
  const header = headerHtml(resume, dna);
  const lid = resume.layoutId;

  return `<!DOCTYPE html>
<html lang="en" data-layout="${lid}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(layout.name)} — Layout preview</title>
<style>
  :root {
    --accent: ${dna.accent};
    --accent2: ${dna.accent2};
    --muted: ${dna.muted};
    --soft: ${dna.soft};
    --name-size: ${dna.nameSizePx}px;
    --name-weight: ${dna.nameWeight};
    --name-ls: ${dna.nameLetterSpacing};
    --name-tf: ${dna.nameTransform};
    --name-align: ${dna.nameAlign};
    --name-font: ${dna.nameFontStack};
    --headline-font: ${dna.headlineFontStack};
    --body-font: ${dna.bodyFontStack};
    --job-weight: ${dna.jobWeight};
    --radius: ${dna.radius};
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 1.5rem 1rem 3rem;
    background: ${dna.pageBg};
    font-family: var(--body-font);
    color: #0f172a;
    line-height: 1.55;
  }
  .banner {
    max-width: 880px; margin: 0 auto 1rem;
    display: flex; flex-wrap: wrap; gap: .75rem 1.25rem; align-items: center;
    font-size: .8125rem; color: ${dna.pageBg === "#0c1222" ? "#94a3b8" : "#475569"};
  }
  .banner strong { color: ${dna.pageBg === "#0c1222" ? "#e2e8f0" : "#0f172a"}; }
  .banner a { color: var(--accent); font-weight: 700; text-decoration: none; border-bottom: 1px solid var(--accent2); }
  .sheet {
    max-width: 880px; margin: 0 auto;
    background: ${dna.sheetBg};
    border-radius: var(--radius);
    box-shadow: ${dna.shadow};
    overflow: hidden;
    color: ${dna.pageBg === "#0c1222" ? "#e2e8f0" : "#0f172a"};
    border: 1px solid ${dna.pageBg === "#0c1222" ? "#1e293b" : "transparent"};
  }
  .aura {
    font-size: .7rem; letter-spacing: .12em; text-transform: uppercase;
    color: var(--accent2); margin: 0 0 .75rem; font-weight: 700;
  }

  /* —— Headers by mode —— */
  .hdr { padding: 2rem 2rem 1rem; }
  .hdr h1 {
    margin: 0 0 .4rem; font-size: var(--name-size); font-weight: var(--name-weight);
    letter-spacing: var(--name-ls); text-transform: var(--name-tf);
    text-align: var(--name-align); font-family: var(--name-font);
    color: var(--accent); line-height: 1.1;
  }
  .hdr .headline {
    margin: 0 0 .25rem; font-size: 1.05rem; text-align: var(--name-align);
    font-family: var(--headline-font); color: var(--muted);
  }
  .hdr .contact { margin: 0; font-size: .9rem; text-align: var(--name-align); color: var(--muted); }

  /* classic centered */
  .hdr.classic { text-align: center; padding-bottom: .5rem; }
  .hdr.classic .full-rule { border: none; border-top: 2px solid var(--accent); margin: 1.25rem 0 0; }

  /* executive elegant */
  .hdr.elegant { text-align: center; padding: 2.5rem 2.5rem 1.25rem; }
  .hdr.elegant h1 { color: var(--accent); font-style: normal; }
  .hdr.elegant .headline { font-style: italic; font-size: 1.1rem; color: #4b5563; }
  .gold-rule {
    width: 80px; height: 2px; background: linear-gradient(90deg, transparent, var(--accent2), transparent);
    margin: .85rem auto;
  }
  .gold-rule.thin { width: 140px; height: 1px; opacity: .6; }

  /* tech dark */
  .hdr.tech { padding: 1.5rem 2rem; border-bottom: 1px solid #1e293b; position: relative; }
  .hdr.tech h1 { color: var(--accent); }
  .hdr.tech .headline { color: #cbd5e1; font-family: var(--body-font); }
  .hdr.tech .mono { font-family: ui-monospace, Consolas, monospace; font-size: .8rem; color: #94a3b8; }
  .tech-badge {
    display: inline-block; font-size: .65rem; font-weight: 800; letter-spacing: .2em;
    color: #0f172a; background: var(--accent); padding: .2rem .5rem; border-radius: 4px; margin-bottom: .75rem;
  }
  body[data-layout="technical_dense"] .sheet { display: grid; grid-template-columns: 12px 1fr; }
  body[data-layout="technical_dense"] .rail {
    background: linear-gradient(180deg, var(--accent), #0891b2); min-height: 100%;
  }
  body[data-layout="technical_dense"] .sheet-body { min-width: 0; }

  /* timeline */
  .hdr.timeline { padding: 2rem 2rem 1rem 2.5rem; }
  .growth-pills {
    display: flex; gap: .5rem; align-items: center; margin-top: 1rem; flex-wrap: wrap;
  }
  .growth-pills span {
    font-size: .7rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
    background: var(--soft); color: var(--accent); padding: .25rem .6rem; border-radius: 999px;
  }
  body[data-layout="timeline_progressive"] main { padding-left: 2.75rem; position: relative; }
  body[data-layout="timeline_progressive"] main::before {
    content: ""; position: absolute; left: 1.35rem; top: 0; bottom: 2rem; width: 3px;
    background: linear-gradient(180deg, var(--accent2), var(--soft)); border-radius: 2px;
  }
  body[data-layout="timeline_progressive"] .job { position: relative; }
  body[data-layout="timeline_progressive"] .job::before {
    content: ""; position: absolute; left: -1.55rem; top: .45rem; width: 12px; height: 12px;
    border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px var(--soft);
  }

  /* minimal hero */
  .hdr.minimal { padding: 2.75rem 2.5rem 1rem; }
  .hdr.minimal h1 { max-width: 12ch; }
  .hdr.minimal .headline { font-size: .95rem; letter-spacing: .02em; }

  /* consultant band */
  .hdr.band { padding: 0; }
  .band-inner {
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);
    color: #fff; padding: 2rem 2rem 1.5rem;
  }
  .hdr.band h1 { color: #fff !important; }
  .hdr.band .headline { color: #ffedd5 !important; }
  .hdr.band .contact { color: #fed7aa !important; }
  .hdr.band .aura { color: #ffedd5; opacity: .9; }

  main { padding: .75rem 2rem 2.25rem; }
  body[data-layout="modern_minimal"] main { padding: 1rem 2.5rem 3rem; }
  body[data-layout="executive_serif"] main { padding: 1rem 2.75rem 2.5rem; }

  /* h2 styles */
  .sec { margin-top: 1.35rem; }
  body[data-layout="modern_minimal"] .sec { margin-top: 2rem; }
  h2 {
    margin: 0 0 .75rem; font-size: .78rem; font-weight: 800;
    letter-spacing: .1em; color: var(--accent);
    text-transform: ${dna.h2Transform === "uppercase" ? "uppercase" : "none"};
    font-family: var(--name-font);
  }
  body[data-layout="executive_serif"] h2 {
    font-size: 1.05rem; font-weight: 600; letter-spacing: .02em;
    border-bottom: 2px solid var(--accent2); display: inline-block; padding-bottom: .2rem;
  }
  body[data-layout="ats_classic"] h2 {
    width: 100%; border-bottom: 2px solid var(--accent); padding-bottom: .35rem;
  }
  body[data-layout="technical_dense"] h2 {
    display: inline-block; background: var(--soft); color: var(--accent);
    padding: .3rem .65rem; border-radius: 4px; letter-spacing: .14em; font-size: .68rem;
  }
  body[data-layout="timeline_progressive"] h2 {
    border-left: 4px solid var(--accent); padding-left: .65rem; letter-spacing: .04em;
    font-size: .95rem; text-transform: none;
  }
  body[data-layout="modern_minimal"] h2 {
    border: none; letter-spacing: .18em; font-size: .7rem; color: var(--muted);
    margin-bottom: 1rem;
  }
  body[data-layout="consultant_band"] h2 {
    border-bottom: 3px solid var(--accent); display: inline-block; min-width: 30%;
  }

  .job { font-weight: var(--job-weight); margin: 1rem 0 .15rem; font-size: 1rem; }
  body[data-layout="modern_minimal"] .job { font-size: 1.05rem; letter-spacing: -.01em; }
  body[data-layout="executive_serif"] .job { font-family: var(--name-font); font-size: 1.05rem; }
  .employer {
    font-weight: 700; color: var(--accent); font-size: .95rem;
    margin: 0 0 .2rem;
  }
  body[data-layout="technical_dense"] .employer { color: #38bdf8; }
  .meta { color: var(--muted); font-size: .85rem; font-style: italic; margin: 0 0 .4rem; }
  .line { margin: .4rem 0; }
  body[data-layout="modern_minimal"] .line { max-width: 62ch; }
  .skill { margin: .4rem 0; }
  .skill-chip, .skill-pills-row {
    background: var(--soft); border-radius: 8px; padding: .55rem .8rem; font-size: .9rem;
  }
  .skill-mono-block {
    font-family: ui-monospace, Consolas, monospace; font-size: .8rem;
    background: #164e63; color: #ecfeff; padding: .65rem .8rem; border-radius: 6px;
    border-left: 3px solid var(--accent);
  }
  .skill-plain { color: inherit; }
  ul.bullets { margin: .35rem 0 .6rem; padding-left: 1.2rem; }
  ul.bullets-timeline-dot { list-style: none; padding-left: .25rem; }
  ul.bullets-timeline-dot li {
    position: relative; padding-left: 1rem; margin: .35rem 0;
  }
  ul.bullets-timeline-dot li::before {
    content: ""; position: absolute; left: 0; top: .45em; width: 7px; height: 7px;
    border-radius: 50%; background: var(--accent);
  }
  ul.bullets-square { list-style: square; }
  ul.bullets-dash { list-style: none; padding-left: .25rem; }
  ul.bullets-dash li::before { content: "–  "; color: var(--accent); font-weight: 700; }
  li::marker { color: var(--accent); }
  .spacer { height: .3rem; }

  body[data-layout="technical_dense"] .job { color: #f8fafc; }
  body[data-layout="technical_dense"] .line { color: #cbd5e1; }
  body[data-layout="technical_dense"] li { color: #e2e8f0; }
</style>
</head>
<body data-layout="${lid}">
  <div class="banner">
    <strong>${escapeHtml(layout.name)}</strong>
    <span>${escapeHtml(dna.aura)}</span>
    <a href="?layoutId=${encodeURIComponent(lid)}&fmt=docx">DOCX</a>
    <a href="?layoutId=${encodeURIComponent(lid)}&fmt=pdf">PDF</a>
    <span>Sample preview — distinct visual system</span>
  </div>
  <div class="sheet">
    ${
      lid === "technical_dense"
        ? `<div class="rail"></div><div class="sheet-body">${header}<main>${sections}</main></div>`
        : `${header}<main>${sections}</main>`
    }
  </div>
</body>
</html>`;
}
