import type {
  MasterValidationReport,
  PackValidationReport,
  ValidationCheck,
} from "@/lib/resume/master-pack-validate";

function severityClass(s: ValidationCheck["severity"]) {
  if (s === "pass") return "text-emerald-800";
  if (s === "warn") return "text-amber-800";
  return "text-red-700";
}

function severityMark(s: ValidationCheck["severity"]) {
  if (s === "pass") return "✓";
  if (s === "warn") return "⚠";
  return "✗";
}

function CheckList({ checks }: { checks: ValidationCheck[] }) {
  return (
    <ul className="space-y-1.5 text-[12.5px]">
      {checks.map((c) => (
        <li key={c.id} className={`flex gap-2 ${severityClass(c.severity)}`}>
          <span className="w-4 shrink-0 font-semibold">{severityMark(c.severity)}</span>
          <span>
            <span className="font-semibold text-[#1d1d1f]">{c.label}</span>
            <span className="text-[#6e6e73]"> — {c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function MasterValidationPanel({
  report,
  packReport,
}: {
  report: MasterValidationReport;
  /** When a tailored pack exists, show post-generation checks too */
  packReport?: PackValidationReport | null;
}) {
  const headerTone = report.ok
    ? "border-emerald-200 bg-emerald-50/60"
    : report.summary.fail > 0
      ? "border-red-200 bg-red-50/50"
      : "border-amber-200 bg-amber-50/50";

  const groups: { key: ValidationCheck["group"]; title: string }[] = [
    { key: "completeness", title: "Completeness signals" },
    { key: "identity", title: "Identity & tenure" },
    { key: "skills", title: "Skills bank" },
    { key: "engagement", title: "Per-engagement fields" },
  ];

  return (
    <section className="space-y-3 overflow-hidden rounded-2xl border border-black/[0.06] bg-white p-4 shadow-soft sm:p-5">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-[#1d1d1f]">
          Ground-truth validation
        </h2>
        <p className="mt-0.5 text-[13px] leading-relaxed text-[#6e6e73]">
          Fields the AI path must honor after upload — and after a tailored pack is
          generated.
        </p>
      </div>

      <div className={`rounded-xl border px-3 py-2.5 text-[13px] ${headerTone}`}>
        <div className="font-semibold tracking-tight text-[#1d1d1f]">
          Upload profile · {report.ok ? "Ready" : "Needs review"} · {report.score}%
        </div>
        <div className="mt-0.5 text-[12.5px] text-[#6e6e73]">
          {report.engagementCount} engagement
          {report.engagementCount === 1 ? "" : "s"} · ~{report.careerSpanYears}+ years ·{" "}
          {report.summary.pass} pass · {report.summary.warn} warn · {report.summary.fail}{" "}
          fail
        </div>
      </div>

      {/* Full engagement matrix */}
      {report.engagements.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-[13px] font-semibold text-[#1d1d1f]">
            Engagements (full extract)
          </h3>
          <div className="overflow-x-auto rounded-xl border border-black/[0.06]">
            <table className="min-w-full text-left text-[12px]">
              <thead className="bg-black/[0.03] text-[#6e6e73]">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">#</th>
                  <th className="px-2 py-1.5 font-semibold">Employer</th>
                  <th className="px-2 py-1.5 font-semibold">Dates</th>
                  <th className="px-2 py-1.5 font-semibold">Location</th>
                  <th className="px-2 py-1.5 font-semibold">Title</th>
                  <th className="px-2 py-1.5 font-semibold">Bullets</th>
                  <th className="px-2 py-1.5 font-semibold">Project / Env</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {report.engagements.map((e) => (
                  <tr key={e.index} className="align-top text-[#1d1d1f]">
                    <td className="px-2 py-1.5 text-[#86868b]">{e.index + 1}</td>
                    <td className="max-w-[10rem] px-2 py-1.5 font-medium">
                      {e.client}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      {e.startYear || "?"}–{e.endYear}
                    </td>
                    <td className="px-2 py-1.5 text-[#6e6e73]">
                      {e.location || "—"}
                    </td>
                    <td className="max-w-[9rem] px-2 py-1.5">{e.title}</td>
                    <td className="px-2 py-1.5">{e.bulletCount}</td>
                    <td className="max-w-[12rem] px-2 py-1.5 text-[#6e6e73]">
                      {e.project ? <div>{e.project}</div> : null}
                      {e.industry ? (
                        <div className="text-[11px]">{e.industry}</div>
                      ) : null}
                      {e.environment ? (
                        <div className="line-clamp-2 text-[11px]">{e.environment}</div>
                      ) : null}
                      {!e.project && !e.industry && !e.environment ? "—" : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="text-[12.5px]">
            <summary className="cursor-pointer font-medium text-[#0071e3]">
              Sample bullets per engagement
            </summary>
            <ul className="mt-2 space-y-3">
              {report.engagements.map((e) => (
                <li key={e.index} className="rounded-lg bg-black/[0.02] px-3 py-2">
                  <div className="font-semibold text-[#1d1d1f]">
                    {e.index + 1}. {e.client.split(",")[0]}
                  </div>
                  {e.sampleBullets.length ? (
                    <ul className="mt-1 list-disc pl-4 text-[#6e6e73]">
                      {e.sampleBullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-amber-800">No bullets parsed</p>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}

      {groups.map((g) => {
        const items = report.checks.filter((c) => c.group === g.key);
        if (!items.length) return null;
        return (
          <div key={g.key} className="space-y-1.5">
            <h3 className="text-[13px] font-semibold text-[#1d1d1f]">{g.title}</h3>
            <CheckList
              checks={
                g.key === "engagement"
                  ? // show only fails/warns for engagement group at checklist level (table has detail)
                    items.filter((c) => c.severity !== "pass").length
                      ? items.filter((c) => c.severity !== "pass")
                      : items.slice(0, 4)
                  : items
              }
            />
            {g.key === "engagement" &&
            items.filter((c) => c.severity === "pass").length > 0 ? (
              <p className="text-[11.5px] text-[#86868b]">
                {items.filter((c) => c.severity === "pass").length} engagement field(s)
                passed (shown in table above).
              </p>
            ) : null}
          </div>
        );
      })}

      {packReport ? (
        <div className="space-y-2 border-t border-black/[0.06] pt-3">
          <h3 className="text-[13px] font-semibold text-[#1d1d1f]">
            After tailored resume — pack vs master
          </h3>
          <div
            className={`rounded-xl border px-3 py-2 text-[12.5px] ${
              packReport.ok
                ? "border-emerald-200 bg-emerald-50/60"
                : "border-amber-200 bg-amber-50/50"
            }`}
          >
            Pack validation: {packReport.ok ? "PASS" : "NEEDS REVIEW"} · score{" "}
            {packReport.score}% · clients found {packReport.clientsFound.length}/
            {packReport.engagementCount}
            {packReport.clientsMissing.length ? (
              <div className="mt-1 text-red-700">
                Missing:{" "}
                {packReport.clientsMissing.map((c) => c.split(",")[0]).join(", ")}
              </div>
            ) : null}
            {packReport.yearsClaimsInSummary.length ? (
              <div className="mt-1 text-[#6e6e73]">
                Years claims: {packReport.yearsClaimsInSummary.join(" · ")}
              </div>
            ) : null}
          </div>
          <CheckList
            checks={packReport.checks.filter(
              (c) => c.group === "pack" || c.group === "honesty"
            )}
          />
        </div>
      ) : (
        <p className="text-[12.5px] text-[#86868b]">
          Pack checks appear after a chain generates a tailored resume for this
          candidate (employers, dates, locations, years claim, no template junk).
        </p>
      )}
    </section>
  );
}
