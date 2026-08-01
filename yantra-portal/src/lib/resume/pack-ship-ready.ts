/**
 * Shared ship/no-ship checks for generated packs.
 * Used by generation, download, send, and chain UI.
 */

import { MIN_BULLETS_PER_PROJECT } from "./assemble-pack";
import {
  packHasIndustryCosplay,
  assertAllMasterClientsPresent,
} from "./resume-honesty";
import { parseStoredMasterProfile } from "./master-profile";

export type PackShipIssue = {
  code:
    | "empty"
    | "thin_bullets"
    | "missing_clients"
    | "industry_cosplay"
    | "generation_blocked";
  detail: string;
};

export type PackShipReport = {
  ok: boolean;
  issues: PackShipIssue[];
  employerBlocks: number;
  minBulletsSeen: number | null;
};

export function inspectPackShipReady(opts: {
  text: string;
  masterText?: string;
  masterProfileJson?: string | null;
  minBullets?: number;
}): PackShipReport {
  const min = opts.minBullets ?? MIN_BULLETS_PER_PROJECT;
  const text = opts.text || "";
  const issues: PackShipIssue[] = [];

  if (text.length < 400) {
    issues.push({ code: "empty", detail: `Pack too short (${text.length} chars)` });
  }
  if (/Resume generation blocked/i.test(text)) {
    issues.push({
      code: "generation_blocked",
      detail: "Stored text is a generation-blocked message",
    });
  }

  const blocks = text.split(/Employer\s*\/\s*Client:\s*/i).slice(1);
  let minBulletsSeen: number | null = null;
  if (blocks.length) {
    for (let i = 0; i < blocks.length; i++) {
      const head = (blocks[i].split("\n")[0] || `Client ${i + 1}`)
        .split(",")[0]
        .trim()
        .slice(0, 48);
      const n = (blocks[i].match(/^[•\-–▸→\*]\s+\S/gm) || []).length;
      minBulletsSeen =
        minBulletsSeen == null ? n : Math.min(minBulletsSeen, n);
      if (n < min) {
        issues.push({
          code: "thin_bullets",
          detail: `${head}: ${n}/${min} bullets`,
        });
      }
    }
  } else if (text.length >= 400) {
    issues.push({
      code: "thin_bullets",
      detail: "No Employer/Client blocks found in pack",
    });
  }

  const profile = parseStoredMasterProfile(opts.masterProfileJson);
  const clients = profile?.engagements.map((e) => e.client) || [];
  if (clients.length && text.length >= 200) {
    try {
      assertAllMasterClientsPresent({
        clients,
        tailoredText: text,
        masterProfileJson: opts.masterProfileJson,
      });
    } catch (e) {
      issues.push({
        code: "missing_clients",
        detail: e instanceof Error ? e.message : "Missing master employers",
      });
    }
  }

  const master = opts.masterText || "";
  const cosplay = packHasIndustryCosplay(text, master);
  for (const c of cosplay) {
    issues.push({ code: "industry_cosplay", detail: c });
  }

  return {
    ok: issues.length === 0,
    issues,
    employerBlocks: blocks.length,
    minBulletsSeen,
  };
}

/** True when stored pack must be regenerated before download/send. */
export function mustRegeneratePack(opts: {
  text: string;
  masterText?: string;
  masterProfileJson?: string | null;
  jd?: string;
}): boolean {
  const ship = inspectPackShipReady(opts);
  if (!ship.ok) return true;
  // Legacy non-AI packs
  if (opts.text && !/Role Forge AI|OPENAI|gpt-/i.test(opts.text)) return true;
  return false;
}
