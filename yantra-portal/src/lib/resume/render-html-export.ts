/**
 * Layout-aware HTML export of a tailored resume (downloadable).
 * Loads Google Fonts when a layoutId is provided so exports match previews.
 */

import { stripEngineFooter } from "./strip-engine-footer";
import { getDna } from "./layout-themes";
import { googleFontsLinkTags } from "./layout-typefaces";
import { getLayout } from "./templates";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderHtmlFromPlainText(opts: {
  candidateName: string;
  jobTitle?: string;
  text: string;
  layoutId?: string | null;
}): string {
  const layout = getLayout(opts.layoutId);
  const dna = getDna(opts.layoutId || layout.id);
  const lines = stripEngineFooter(opts.text || "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  const body: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      body.push('<div class="sp"></div>');
      continue;
    }
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
      body.push(`<h2>${escapeHtml(line)}</h2>`);
      continue;
    }

    const bullet = /^[•▸→–\-\*]\s*/.test(line.trim());
    const text = line.replace(/^[•▸→–\-\*]\s*/, "");
    if (bullet) {
      body.push(`<p class="b">• ${escapeHtml(text)}</p>`);
    } else {
      body.push(`<p>${escapeHtml(text)}</p>`);
    }
  }

  const title = escapeHtml(
    opts.jobTitle
      ? `${opts.candidateName} — ${opts.jobTitle}`
      : opts.candidateName
  );

  const nameTf =
    dna.nameTransform === "uppercase" ? "uppercase" : "none";
  const nameAlign = dna.nameAlign === "center" ? "center" : "left";

  return `<!DOCTYPE html>
<html lang="en" data-layout="${escapeHtml(String(opts.layoutId || layout.id))}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
${googleFontsLinkTags(opts.layoutId || layout.id)}
<style>
  :root {
    --accent: ${dna.accent};
    --accent2: ${dna.accent2};
    --muted: ${dna.muted};
    --name-font: ${dna.nameFontStack};
    --headline-font: ${dna.headlineFontStack};
    --body-font: ${dna.bodyFontStack};
  }
  * { box-sizing: border-box; }
  body {
    font-family: var(--body-font);
    max-width: 8.5in;
    margin: 0 auto;
    padding: 0.65in 0.75in;
    color: #0f172a;
    line-height: 1.45;
    font-size: 10.5pt;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  h1 {
    font-family: var(--name-font);
    font-size: ${Math.round(dna.nameSizePx * 0.55)}pt;
    font-weight: ${dna.nameWeight};
    letter-spacing: ${dna.nameLetterSpacing};
    margin: 0 0 4px;
    text-transform: ${nameTf};
    text-align: ${nameAlign};
    color: var(--accent);
    line-height: 1.1;
  }
  .role {
    font-family: var(--headline-font);
    color: var(--muted);
    font-size: 11pt;
    margin: 0 0 10px;
    text-align: ${nameAlign};
  }
  hr {
    border: none;
    border-top: 2px solid var(--accent);
    margin: 0 0 14px;
  }
  h2 {
    font-family: var(--name-font);
    font-size: 10pt;
    font-weight: 700;
    margin: 16px 0 6px;
    text-transform: ${dna.h2Transform === "uppercase" ? "uppercase" : "none"};
    letter-spacing: .06em;
    color: var(--accent);
    border-bottom: 1.5px solid color-mix(in srgb, var(--accent) 35%, #cbd5e1);
    padding-bottom: 3px;
  }
  p { margin: 0 0 4px; }
  p.b { padding-left: 14px; margin: 0 0 3px; }
  .sp { height: 6px; }
  @media print {
    body { padding: 0.5in; }
  }
</style>
</head>
<body>
<h1>${escapeHtml(opts.candidateName || "Candidate")}</h1>
${opts.jobTitle ? `<p class="role">${escapeHtml(opts.jobTitle)}</p>` : ""}
<hr/>
${body.join("\n")}
</body>
</html>`;
}
