/**
 * Extract plain text from uploaded master resumes (.txt / .docx / .doc / .pdf).
 * DOCX uses mammoth; binary PDF gets a readable placeholder + any UTF-8 recoverable text.
 */

import mammoth from "mammoth";

export type ExtractMasterResult = {
  text: string;
  extracted: boolean;
  format: "txt" | "docx" | "pdf" | "doc" | "unknown";
  warning?: string;
};

function detectFormat(fileName: string, buf: Buffer): ExtractMasterResult["format"] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".doc")) return "doc";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".rtf")) return "txt";
  // ZIP signature = docx/odt
  if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) return "docx";
  // PDF signature
  if (buf.length >= 4 && buf.subarray(0, 4).toString("utf8") === "%PDF") return "pdf";
  return "unknown";
}

/** Pull printable text runs from a PDF buffer (best-effort, no external deps). */
function roughPdfText(buf: Buffer): string {
  const raw = buf.toString("latin1");
  const chunks: string[] = [];
  // Common PDF text operators: (string) Tj  /  [(..)(..)] TJ
  const re = /\((?:\\.|[^\\)]){2,}\)|\[[^\]]{4,}\]\s*TJ/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    let s = m[0];
    if (s.startsWith("[")) {
      const inner: string[] = [];
      const re2 = /\((?:\\.|[^\\)])*\)/g;
      let m2: RegExpExecArray | null;
      while ((m2 = re2.exec(s))) inner.push(m2[0]);
      s = inner.join("");
    }
    s = s
      .replace(/^\(|\)$/g, "")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\t/g, " ")
      .replace(/\\(.)/g, "$1");
    if (/[A-Za-z]{3,}/.test(s)) chunks.push(s);
  }
  return chunks.join(" ").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export async function extractMasterText(
  fileName: string,
  buf: Buffer
): Promise<ExtractMasterResult> {
  const format = detectFormat(fileName, buf);

  if (format === "txt" || format === "unknown") {
    const asUtf8 = buf.toString("utf8");
    if (!asUtf8.includes("\u0000") && asUtf8.replace(/\s/g, "").length > 40) {
      return { text: asUtf8, extracted: true, format: format === "unknown" ? "txt" : format };
    }
  }

  if (format === "docx") {
    try {
      const result = await mammoth.extractRawText({ buffer: buf });
      const text = (result.value || "").replace(/\r\n/g, "\n").trim();
      if (text.length > 40) {
        return {
          text,
          extracted: true,
          format: "docx",
          warning: result.messages?.length
            ? result.messages.map((m) => m.message).join("; ")
            : undefined,
        };
      }
      return {
        text: `[Uploaded master resume: ${fileName} (${buf.length} bytes)]\nDOCX parsed but little text found — check the file contents.`,
        extracted: false,
        format: "docx",
        warning: "DOCX extraction returned empty text",
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        text: `[Uploaded master resume: ${fileName} (${buf.length} bytes)]\nDOCX extraction failed: ${msg}`,
        extracted: false,
        format: "docx",
        warning: msg,
      };
    }
  }

  if (format === "pdf") {
    const rough = roughPdfText(buf);
    if (rough.length > 80) {
      return {
        text: rough,
        extracted: true,
        format: "pdf",
        warning: "PDF text extracted with best-effort parser (complex PDFs may be incomplete).",
      };
    }
    return {
      text: `[Uploaded master resume: ${fileName} (${buf.length} bytes)]\nPDF text could not be extracted automatically — paste a .txt export or DOCX for full progressive tailoring from master facts.`,
      extracted: false,
      format: "pdf",
      warning: "PDF text extraction limited",
    };
  }

  if (format === "doc") {
    return {
      text: `[Uploaded master resume: ${fileName} (${buf.length} bytes)]\nLegacy .doc is not fully supported — please re-save as .docx or .txt and replace again.`,
      extracted: false,
      format: "doc",
      warning: "Legacy .doc not supported",
    };
  }

  return {
    text: `[Uploaded master resume: ${fileName} (${buf.length} bytes)]\nUnrecognized format — use .txt, .docx, or .pdf.`,
    extracted: false,
    format: "unknown",
  };
}
