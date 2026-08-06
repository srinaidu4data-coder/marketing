/**
 * Shared chain detail chrome — hierarchy, alerts, vendor context, primary CTA.
 * Used by employee + admin chain pages for consistent Fortune-100 UX.
 */

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Mail,
  Building2,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { extractJobTitle } from "@/lib/resume/jd-parse";
import { formatEmployeeFrom } from "@/lib/email/resend";

export type ChainDetailShellProps = {
  chain: {
    id: string;
    status: string;
    createdAt: Date;
    vendorName: string;
    vendorEmail: string;
    rawJobText: string;
    employeeNote?: string | null;
  };
  /** Sending employee — used for From display (must match sendChain) */
  employee?: {
    name?: string | null;
    email?: string | null;
  } | null;
  /** Optional admin-only line under title */
  subtitleExtra?: string;
  backHref: string;
  sent: number;
  total: number;
  goodPacks: number;
  canSend: boolean;
  /**
   * All ship-ready packs have sendStatus SENT.
   * Primary CTA becomes success + optional Resend.
   */
  allEmailed?: boolean;
  stuck: boolean;
  showRetry: boolean;
  emailMode?: "resend" | "simulated" | "dry_run" | string;
  /** Env fallback From only (used if employee email missing) */
  emailFromFallback?: string;
  /**
   * Estimated LLM API cost for this chain (sum of pack generationMeta.costUsd).
   * Shown next to Send Email.
   */
  apiCostUsd?: number | null;
  sendAction: () => Promise<void>;
  recoverAction: () => Promise<void>;
  retryAction: () => Promise<void>;
  banners?: React.ReactNode;
  children: React.ReactNode;
};

function formatApiCost(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export function ChainDetailShell({
  chain,
  employee,
  subtitleExtra,
  backHref,
  sent,
  total,
  goodPacks,
  canSend,
  allEmailed = false,
  stuck,
  showRetry,
  emailMode,
  emailFromFallback,
  apiCostUsd,
  sendAction,
  recoverAction,
  retryAction,
  banners,
  children,
}: ChainDetailShellProps) {
  const costLabel =
    typeof apiCostUsd === "number" && apiCostUsd > 0
      ? formatApiCost(apiCostUsd)
      : null;
  const jobTitle =
    extractJobTitle(chain.rawJobText) || "Open role";
  const jdPreview = chain.rawJobText.trim().slice(0, 160).replace(/\s+/g, " ");
  const fromDisplay = formatEmployeeFrom({
    name: employee?.name,
    email: employee?.email,
    fallback: emailFromFallback,
  });
  const fromIsEmployee = Boolean(
    employee?.email &&
      employee.email.includes("@") &&
      fromDisplay.toLowerCase().includes(employee.email.toLowerCase())
  );
  const remaining = Math.max(0, goodPacks - sent);
  const sendLabel = allEmailed
    ? "Resend to vendor"
    : remaining > 0 && sent > 0
      ? `Send remaining · ${remaining}`
      : goodPacks
        ? `Send to vendor · ${goodPacks}`
        : "Send to vendor";

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24 sm:space-y-6">
      {/* Breadcrumb + identity */}
      <div className="space-y-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6e6e73] transition hover:text-[#1d1d1f]"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
          Back to chains
        </Link>

        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge status={chain.status}>
                {chain.status.charAt(0) + chain.status.slice(1).toLowerCase()}
              </Badge>
              <span className="text-[12px] tabular-nums text-[#86868b]">
                {formatDateTime(chain.createdAt)}
              </span>
              <span className="hidden text-[12px] text-[#d2d2d7] sm:inline">·</span>
              <span className="hidden font-mono text-[11px] text-[#c7c7cc] sm:inline">
                {chain.id.slice(0, 8)}
              </span>
            </div>
            <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] text-[#1d1d1f] sm:text-[32px]">
              {chain.vendorName}
            </h1>
            <p className="max-w-2xl text-[15px] leading-snug text-[#6e6e73]">
              <span className="font-medium text-[#1d1d1f]">{jobTitle}</span>
              {subtitleExtra ? (
                <>
                  <span className="mx-1.5 text-[#d2d2d7]">·</span>
                  {subtitleExtra}
                </>
              ) : null}
            </p>
            <p className="text-[13px] text-[#86868b]">
              {allEmailed ? (
                <span className="font-medium text-emerald-700">
                  All {sent} pack{sent === 1 ? "" : "s"} emailed
                </span>
              ) : (
                <>
                  <span className="font-medium text-[#6e6e73]">{sent}</span> of{" "}
                  <span className="font-medium text-[#6e6e73]">{total}</span>{" "}
                  emailed
                  {goodPacks > 0 && remaining > 0 ? (
                    <>
                      <span className="mx-1.5 text-[#d2d2d7]">·</span>
                      <span className="font-medium text-emerald-700">
                        {remaining} ready to send
                      </span>
                    </>
                  ) : null}
                </>
              )}
            </p>
          </div>

          {/* Desktop primary actions */}
          <div className="hidden shrink-0 flex-wrap items-center gap-2 lg:flex">
            {stuck ? (
              <form action={recoverAction}>
                <Button type="submit" variant="destructive">
                  Recover
                </Button>
              </form>
            ) : null}
            {showRetry ? (
              <form action={retryAction}>
                <Button type="submit" variant="outline">
                  Retry failed
                </Button>
              </form>
            ) : null}
            {costLabel ? (
              <span
                className="inline-flex h-10 items-center rounded-full bg-emerald-500/10 px-3 text-[12.5px] font-semibold tabular-nums text-emerald-900 ring-1 ring-inset ring-emerald-500/20"
                title="Estimated LLM API cost for generating packs on this chain"
              >
                API {costLabel}
              </span>
            ) : null}
            {allEmailed ? (
              <>
                <span className="inline-flex h-10 items-center gap-2 rounded-full bg-emerald-500/10 px-4 text-[13.5px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-500/20">
                  <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} />
                  Sent to vendor
                </span>
                {canSend ? (
                  <form action={sendAction}>
                    <Button type="submit" variant="outline" className="min-w-[9rem]">
                      <Mail className="h-4 w-4" />
                      Resend
                    </Button>
                  </form>
                ) : null}
              </>
            ) : canSend ? (
              <form action={sendAction}>
                <Button type="submit" variant="soft" className="min-w-[10rem]">
                  <Mail className="h-4 w-4" />
                  {sendLabel}
                </Button>
              </form>
            ) : null}
          </div>
        </header>
      </div>

      {/* Compact delivery + vendor strip */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-soft">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0071e3]/[0.08] text-[#0071e3]">
            <Building2 className="h-4 w-4" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#86868b]">
              Vendor
            </p>
            <p className="mt-0.5 truncate text-[14px] font-semibold text-[#1d1d1f]">
              {chain.vendorName}
            </p>
            <p className="truncate text-[12.5px] text-[#6e6e73]">
              {chain.vendorEmail}
            </p>
          </div>
        </div>

        <div
          className={`flex items-start gap-3 rounded-2xl border p-4 shadow-soft ${
            emailMode === "resend"
              ? "border-black/[0.06] bg-white"
              : "border-amber-200/80 bg-amber-50/50"
          }`}
        >
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              emailMode === "resend"
                ? "bg-emerald-500/10 text-emerald-700"
                : "bg-amber-500/15 text-amber-900"
            }`}
          >
            <Mail className="h-4 w-4" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#86868b]">
              Email delivery
            </p>
            <p className="mt-0.5 text-[14px] font-semibold text-[#1d1d1f]">
              {emailMode === "resend"
                ? "Live"
                : emailMode === "dry_run"
                  ? "Dry run"
                  : "Simulated"}
            </p>
            <p className="text-[12.5px] leading-snug text-[#6e6e73]">
              {emailMode === "resend" || emailMode === "dry_run" ? (
                <>
                  From{" "}
                  <span
                    className="font-mono text-[11px] text-[#1d1d1f]"
                    title={
                      fromIsEmployee
                        ? "Sends as the chain employee"
                        : "Fallback — employee email missing; set employee profile email"
                    }
                  >
                    {fromDisplay}
                  </span>
                  {fromIsEmployee ? (
                    <span className="mt-0.5 block text-[11px] text-[#86868b]">
                      Sender = employee · candidate is CC’d
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-[11px] text-amber-800">
                      Using fallback From — set employee email on profile
                    </span>
                  )}
                </>
              ) : (
                "No RESEND_API_KEY — sends are logged only."
              )}
            </p>
          </div>
        </div>
      </div>

      {banners}

      {/* Collapsible job requirement */}
      <details className="group rounded-2xl border border-black/[0.06] bg-white shadow-soft open:shadow-md">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#86868b]">
              Job requirement
            </p>
            <p className="mt-0.5 truncate text-[13.5px] text-[#6e6e73]">
              {jdPreview}
              {chain.rawJobText.trim().length > 160 ? "…" : ""}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-black/[0.06] bg-[#f5f5f7] px-2.5 py-1 text-[11px] font-semibold text-[#6e6e73] group-open:bg-[#0071e3]/[0.08] group-open:text-[#0071e3]">
            View full
            <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
          </span>
        </summary>
        <div className="border-t border-black/[0.04] px-5 py-4">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#3a3a3c]">
            {chain.rawJobText}
          </pre>
        </div>
      </details>

      {children}

      {/* Mobile sticky CTA */}
      {(canSend || stuck || showRetry || allEmailed) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.06] bg-white/90 px-4 py-3 backdrop-blur-xl lg:hidden">
          <div className="mx-auto flex max-w-5xl items-center gap-2">
            {stuck ? (
              <form action={recoverAction} className="flex-1">
                <Button type="submit" variant="destructive" className="w-full">
                  Recover
                </Button>
              </form>
            ) : null}
            {showRetry && !stuck ? (
              <form
                action={retryAction}
                className={canSend || allEmailed ? "" : "flex-1"}
              >
                <Button
                  type="submit"
                  variant="outline"
                  className={canSend || allEmailed ? "" : "w-full"}
                >
                  Retry
                </Button>
              </form>
            ) : null}
            {costLabel ? (
              <span
                className="inline-flex h-10 shrink-0 items-center rounded-full bg-emerald-500/10 px-2.5 text-[11.5px] font-semibold tabular-nums text-emerald-900 ring-1 ring-inset ring-emerald-500/20"
                title="Estimated LLM API cost for this chain"
              >
                {costLabel}
              </span>
            ) : null}
            {allEmailed && !stuck ? (
              <>
                <span className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-emerald-500/10 px-3 text-[13px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-500/20">
                  <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} />
                  Sent
                </span>
                {canSend ? (
                  <form action={sendAction} className="flex-1">
                    <Button type="submit" variant="outline" className="w-full">
                      <Mail className="h-4 w-4" />
                      Resend
                    </Button>
                  </form>
                ) : null}
              </>
            ) : canSend ? (
              <form action={sendAction} className="flex-[2]">
                <Button type="submit" variant="soft" className="w-full">
                  <Mail className="h-4 w-4" />
                  {sendLabel}
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/** Consistent flash / status banners for chain detail */
export function ChainBanner({
  variant,
  title,
  children,
}: {
  variant: "success" | "warning" | "error" | "info";
  title: string;
  children?: React.ReactNode;
}) {
  const styles = {
    success: "border-emerald-200/80 bg-emerald-50 text-emerald-950",
    warning: "border-amber-200/80 bg-amber-50 text-amber-950",
    error: "border-red-200/80 bg-red-50 text-red-950",
    info: "border-sky-200/80 bg-sky-50 text-sky-950",
  };
  const Icon =
    variant === "success"
      ? CheckCircle2
      : variant === "error"
        ? AlertTriangle
        : AlertTriangle;

  return (
    <div
      className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm ${styles[variant]}`}
      role="status"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-80" strokeWidth={2.25} />
      <div className="min-w-0">
        <p className="font-semibold tracking-tight">{title}</p>
        {children ? (
          <div className="mt-0.5 text-[12.5px] leading-relaxed opacity-90">
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
