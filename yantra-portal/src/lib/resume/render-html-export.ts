/**
 * Simple single-file HTML export of a tailored resume (downloadable).
 */

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
}): string {
  const lines = (opts.text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => !/^— Role Forge/i.test(l.trim()));

  const body: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      body.push("<div class=\"sp\"></div>");
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>
  body{font-family:Calibri,Segoe UI,system-ui,sans-serif;max-width:8.5in;margin:0 auto;padding:0.7in 0.75in;color:#0f172a;line-height:1.4;font-size:11pt}
  h1{font-size:18pt;letter-spacing:.04em;margin:0 0 4px;text-transform:uppercase}
  .role{color:#334155;font-size:11pt;margin:0 0 12px}
  hr{border:none;border-top:2px solid #0f172a;margin:0 0 16px}
  h2{font-size:11pt;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid #cbd5e1;padding-bottom:3px}
  p{margin:0 0 4px}
  p.b{padding-left:14px;margin:0 0 3px}
  .sp{height:6px}
  @media print{body{padding:0.5in}}
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
