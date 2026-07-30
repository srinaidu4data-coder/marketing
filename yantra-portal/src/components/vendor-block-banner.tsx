"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

type Conflict = {
  candidateName: string;
  vendorName: string;
  vendorEmail: string;
  priorJobTitle: string;
  newJobTitle: string;
  priorSentAt: string;
  message: string;
};

export function VendorBlockBanner() {
  const params = useSearchParams();
  const blocked = params.get("blocked") === "1";
  const encoded = params.get("conflicts");

  const conflicts = useMemo(() => {
    if (!blocked || !encoded) return [] as Conflict[];
    try {
      const json = Buffer.from(encoded, "base64url").toString("utf8");
      return JSON.parse(json) as Conflict[];
    } catch {
      try {
        // browser fallback without Buffer
        const bin = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
        return JSON.parse(bin) as Conflict[];
      } catch {
        return [] as Conflict[];
      }
    }
  }, [blocked, encoded]);

  if (!blocked || conflicts.length === 0) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-red-200 bg-white p-6 shadow-xl">
        <div className="mb-2 text-lg font-semibold text-red-700">
          Hard block — vendor already has this candidate
        </div>
        <p className="text-sm text-slate-600">
          We already sent a resume for this candidate to the same vendor under a{" "}
          <strong>different skill / job title</strong>. Submitting again would give the vendor
          multiple skill-flavored resumes for the same person. This is not allowed.
        </p>
        <ul className="mt-4 space-y-3">
          {conflicts.map((c, i) => (
            <li key={i} className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm">
              <div className="font-medium text-red-900">{c.candidateName}</div>
              <div className="mt-1 text-xs text-red-800">
                Vendor: {c.vendorName} ({c.vendorEmail})
              </div>
              <div className="mt-1 text-xs">
                Prior title: <strong>{c.priorJobTitle}</strong>
              </div>
              <div className="text-xs">
                New title: <strong>{c.newJobTitle}</strong>
              </div>
              {c.priorSentAt ? (
                <div className="mt-1 text-[11px] text-red-700/80">
                  Prior send: {new Date(c.priorSentAt).toLocaleString()}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex justify-end gap-2">
          <a
            href="/chains/new"
            className="inline-flex h-9 items-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
          >
            Change vendor or candidates
          </a>
        </div>
      </div>
    </div>
  );
}
